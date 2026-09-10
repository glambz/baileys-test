/**
 * WhatsApp connection lifecycle — stuck-latch and logout-orphan regressions.
 *
 * Reproduces a production incident (2026-09-09):
 *   1. A transient "WebSocket Error (connect ECONNREFUSED 57.144.25.32:443)"
 *      closed the socket BEFORE it ever emitted a qr event or reached 'open'.
 *   2. From then on every POST /api/auth/init logged "Initialize already in
 *      progress" and returned without doing anything — for hours.
 *   3. Nothing reconnected on its own (reconnectAttempts stayed put).
 *   4. POST /api/auth/logout answered deviceUnlinked:false with
 *      unlinkError:null — no attempt was made, no error recorded — and wiped
 *      creds.json anyway, leaving the device listed under Linked Devices on
 *      the phone with no credential left to ever unlink it.
 *
 * No socket is opened here: initialize() is stubbed and _clearSessionFiles()
 * is stubbed, so the real session directory is never touched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const requireFromTest = createRequire(import.meta.url);
const { WhatsAppClient } = requireFromTest('../src/whatsapp/client.js');

/** A client that can be driven through connection.update without a network. */
function makeClient() {
  const c = new WhatsAppClient();
  c._sockGen = 1;
  c._initCalls = 0;
  c.initialize = async () => {
    c._initCalls += 1;
  };
  c._filesCleared = 0;
  c._clearSessionFiles = () => {
    c._filesCleared += 1;
    c._credsOnDisk = false;
    return { cleared: 7, failed: [] };
  };
  // Never consult the real session directory from a test.
  c._credsOnDisk = true;
  c._credsExist = () => c._credsOnDisk;
  return c;
}

const NET_CLOSE = {
  connection: 'close',
  lastDisconnect: {
    error: Object.assign(new Error('WebSocket Error (connect ECONNREFUSED 57.144.25.32:443)'), {
      output: { statusCode: 500 },
    }),
  },
};

describe('connection lifecycle — the _initializing latch', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('clears _initializing when the socket closes before any QR or open', async () => {
    const c = makeClient();
    c._initializing = true; // exactly what initialize() sets before connecting
    await c._handleConnectionUpdate(NET_CLOSE, 1);
    // Left true, every later initialize() is refused with
    // "Initialize already in progress" and the operator can never reconnect.
    expect(c._initializing).toBe(false);
  });

  it('actually runs the reconnect it scheduled', async () => {
    const c = makeClient();
    c._initializing = true;
    await c._handleConnectionUpdate(NET_CLOSE, 1);
    expect(c._reconnectAttempts).toBe(1);
    // The scheduled callback re-checks `|| this._initializing` and returns
    // early, so the latch cancels the very reconnect meant to recover.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(c._initCalls).toBe(1);
  });

  it('does not refuse a manual initialize() after a failed connect', async () => {
    const c = makeClient();
    c._initializing = true;
    await c._handleConnectionUpdate(NET_CLOSE, 1);
    // Re-create the real guard from initialize()'s head.
    const wouldBeRefused = Boolean(c._initializing || c._tearingDown);
    expect(wouldBeRefused).toBe(false);
  });

  it('clears _initializing on a WhatsApp-initiated logout too', async () => {
    const c = makeClient();
    c._initializing = true;
    c._wasEverOpen = true;
    await c._handleConnectionUpdate(
      {
        connection: 'close',
        lastDisconnect: { error: Object.assign(new Error('Logged out'), { output: { statusCode: 401 } }) },
      },
      1
    );
    expect(c._filesCleared).toBe(1); // credentials are gone, as intended here
    expect(c._initializing).toBe(false); // ...and re-pairing must be possible
  });
});

describe('logout — must not orphan the linked device', () => {
  it('does not destroy credentials when the unlink could not be attempted', async () => {
    const c = makeClient();
    c.state = 'close'; // socket is down, so sock.logout() cannot be sent
    c.sock = null;
    const r = await c.logout();
    expect(r.deviceUnlinked).toBe(false);
    // The credentials are the ONLY way to send remove-companion-device.
    // Deleting them here is what left a device permanently listed on the
    // operator's phone.
    expect(c._filesCleared).toBe(0);
    expect(r.sessionCleared).toBe(false);
  });

  it('says why the unlink did not happen instead of reporting a bare false', async () => {
    const c = makeClient();
    c.state = 'close';
    c.sock = null;
    const r = await c.logout();
    // The UI renders `unlinkError` only when it is set, so a null here is
    // shown as "Perangkat ter-unlink: tidak" with no reason at all.
    expect(r.unlinkError).toBeTruthy();
    expect(String(r.unlinkError).toLowerCase()).toMatch(/connect|terhubung|offline|not connected/);
  });

  it('still allows an explicit local-only wipe', async () => {
    const c = makeClient();
    c.state = 'close';
    c.sock = null;
    const r = await c.logout({ unlinkDevice: false });
    expect(c._filesCleared).toBe(1);
    expect(r.sessionCleared).toBe(true);
    expect(r.deviceUnlinked).toBe(false);
  });

  it('unlinks first, then clears, when the socket is live', async () => {
    const c = makeClient();
    const order = [];
    c.state = 'open';
    c.sock = { ws: { readyState: 1 }, logout: async () => order.push('unlink'), ev: { removeAllListeners() {} }, end() {} };
    const origClear = c._clearSessionFiles;
    c._clearSessionFiles = () => {
      order.push('clear');
      return origClear();
    };
    const r = await c.logout();
    expect(r.deviceUnlinked).toBe(true);
    expect(order).toEqual(['unlink', 'clear']);
    expect(r.sessionCleared).toBe(true);
  });
});

describe('credentials WhatsApp has rejected', () => {
  it('wipes on a 401 even in a process that never saw the socket open', async () => {
    const c = makeClient();
    // A restarted container starts with _wasEverOpen false. The wipe used to
    // require it, so invalidated credentials survived the restart and the
    // client reconnect-looped on them forever without ever issuing a QR.
    c._wasEverOpen = false;
    await c._handleConnectionUpdate(
      {
        connection: 'close',
        lastDisconnect: { error: Object.assign(new Error('Logged out'), { output: { statusCode: 401 } }) },
      },
      1
    );
    expect(c._filesCleared).toBe(1);
  });

  it('does not wipe on a plain network close', async () => {
    const c = makeClient();
    c._wasEverOpen = true;
    await c._handleConnectionUpdate(NET_CLOSE, 1);
    expect(c._filesCleared).toBe(0);
  });
});

describe('isConnected liveness', () => {
  it('reads the isOpen getter rather than a readyState it never had', () => {
    const c = makeClient();
    c.state = 'open';
    // Baileys' WebSocketClient exposes isOpen/isClosed getters; the raw ws is
    // at .socket. Reading ws.readyState yielded undefined, so the old check
    // fell through to `return true` and reported a dead socket as connected.
    c.sock = { ws: { isOpen: false } };
    expect(c.isConnected()).toBe(false);
    c.sock = { ws: { isOpen: true } };
    expect(c.isConnected()).toBe(true);
  });

  it('is false whenever the state is not open', () => {
    const c = makeClient();
    c.state = 'qr';
    c.sock = { ws: { isOpen: true } };
    expect(c.isConnected()).toBe(false);
  });
});

describe('status reporting', () => {
  it('stops naming the account once the connection drops', async () => {
    const c = makeClient();
    c.user = { id: '6285179652486:2@s.whatsapp.net', name: 'ray' };
    await c._handleConnectionUpdate(NET_CLOSE, 1);
    expect(c.getStatus().user).toBeNull();
  });

  it('exposes the flags that explain a client stuck mid-initialize', () => {
    const c = makeClient();
    c._initializing = true;
    const st = c.getStatus();
    // Without these a wedged client looks exactly like an idle one:
    // state 'close', no error, nothing pending.
    expect(st.initializing).toBe(true);
    expect(st).toHaveProperty('reconnectPending');
  });
});

describe('initialize() reports whether it actually started', () => {
  it('declines, distinguishably, while another attempt is in flight', async () => {
    const { WhatsAppClient: K } = requireFromTest('../src/whatsapp/client.js');
    const c = new K();
    c._initializing = true;
    const out = await c.initialize();
    expect(out).toEqual({ started: false, reason: 'already-initializing' });
  });

  it('declines, distinguishably, when a socket already exists', async () => {
    const { WhatsAppClient: K } = requireFromTest('../src/whatsapp/client.js');
    const c = new K();
    c.sock = { ws: { isOpen: true } };
    const out = await c.initialize();
    expect(out).toEqual({ started: false, reason: 'socket-exists' });
  });
});
