/**
 * AuthStatusEnvelopeSchema — regression guard.
 *
 * GET /api/auth/status answers `{ status: {...} }`, but AuthStatusSchema
 * expects a flat object. useAuthStatus passed the raw response straight in,
 * so every poll threw "state Required", the query never resolved, and the
 * header badge read "Error" no matter what the socket was actually doing.
 * Worse, AppShell's auth gate is written as `if (!authStatus) return;`, so
 * the redirect-when-disconnected behaviour was silently dead too.
 */
import { describe, it, expect } from 'vitest';
import { AuthStatusEnvelopeSchema, AuthStatusSchema } from '@/lib/contract';

/** Exactly what apps/backend/src/controllers/authController.js#status sends. */
const BE_WIRE = {
  status: {
    state: 'close',
    connected: false,
    user: { id: '6285179652486:2@s.whatsapp.net', name: 'ray' },
    lastError: 'Connection Terminated',
    reconnectAttempts: 1,
  },
};

describe('AuthStatusEnvelopeSchema', () => {
  it('parses the { status: ... } envelope the backend actually sends', () => {
    const r = AuthStatusEnvelopeSchema.parse(BE_WIRE);
    expect(r.state).toBe('close');
    expect(r.connected).toBe(false);
    expect(r.userName).toBe('ray');
    expect(r.userJid).toBe('6285179652486:2@s.whatsapp.net');
  });

  it('carries lastError and reconnectAttempts through instead of dropping them', () => {
    // The connection page shows these: "close" alone does not say whether
    // the socket was terminated or never started.
    const r = AuthStatusEnvelopeSchema.parse(BE_WIRE);
    expect(r.lastError).toBe('Connection Terminated');
    expect(r.reconnectAttempts).toBe(1);
  });

  it('still parses a flat object, as the mock layer returns', () => {
    const r = AuthStatusEnvelopeSchema.parse({ state: 'open', connected: true });
    expect(r.state).toBe('open');
    expect(r.connected).toBe(true);
  });

  it('defaults the diagnostics when the wire omits them', () => {
    const r = AuthStatusEnvelopeSchema.parse({ state: 'open', connected: true });
    expect(r.lastError).toBeNull();
    expect(r.reconnectAttempts).toBe(0);
  });

  it('documents why the plain schema was the wrong thing to call', () => {
    // Kept as an executable note: this is the exact failure that produced the
    // permanent "Error" badge.
    const bad = AuthStatusSchema.safeParse(BE_WIRE);
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues.some((i) => i.path.join('.') === 'state')).toBe(true);
    }
  });

  it('rejects a payload with no usable state at all', () => {
    expect(AuthStatusEnvelopeSchema.safeParse({ status: {} }).success).toBe(false);
    expect(AuthStatusEnvelopeSchema.safeParse(null).success).toBe(false);
  });
});
