import { useEffect, useRef, useState } from 'react';

/**
 * BUG-PUSH-EVENTS-TYPING fix (2026-08-03): connects to the BE WebSocket
 * at /ws/chat?chatId=X for high-frequency, bidirectional events.
 *
 * Currently used for typing indicators:
 *   - The user types locally -> the hook sends {type:'typing', from}
 *     to the BE (debounced to once per 3s).
 *   - The BE echoes typing events from OTHER clients on the same
 *     chatId back to this hook.
 *   - The hook returns `typingFromOthers: string[]` which the Composer
 *     shows as "X is typing..." under the textarea.
 *
 * Auto-reconnects on disconnect (2-second backoff with cap).
 */

const SEND_THROTTLE_MS = 3_000;
const PEER_TIMEOUT_MS = 4_000;

export function useChatSocket(
  chatId: string | null,
  currentUser: string = 'operator',
) {
  const [typingFromOthers, setTypingFromOthers] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const lastSentAtRef = useRef(0);
  const lastSeenTypingRef = useRef<Record<string, number>>({});
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!chatId) return;
    let mounted = true;

    function connect() {
      if (!mounted || !chatId) return;
      const proto = window?.location?.protocol === 'https:' ? 'wss' : 'ws';
      const host = window?.location?.host ?? '127.0.0.1:3000';
      const safeChatId = chatId;
      const url = `${proto}://${host}/ws/chat?chatId=${encodeURIComponent(safeChatId)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'typing') {
          const from = String(msg.from || '');
          if (!from || from === currentUser) return;
          lastSeenTypingRef.current[from] = Date.now();
          setTypingFromOthers((prev) =>
            prev.includes(from) ? prev : [...prev, from],
          );
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!mounted) return;
        reconnectTimerRef.current = setTimeout(connect, 2_000);
      };

      ws.onerror = () => {
        try { ws.close(); } catch { /* */ }
      };
    }

    connect();

    // Periodically expire stale typing entries.
    const expiryInterval = setInterval(() => {
      const now = Date.now();
      const lastSeen = lastSeenTypingRef.current;
      const stale: string[] = [];
      for (const [from, ts] of Object.entries(lastSeen)) {
        if (now - ts > PEER_TIMEOUT_MS) stale.push(from);
      }
      if (stale.length === 0) return;
      for (const f of stale) delete lastSeen[f];
      setTypingFromOthers((prev) => prev.filter((f) => !stale.includes(f)));
    }, 1_000);

    return () => {
      mounted = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      clearInterval(expiryInterval);
      try { wsRef.current?.close(); } catch { /* */ }
      wsRef.current = null;
    };
  }, [chatId, currentUser]);

  function sendTyping() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    const now = Date.now();
    if (now - lastSentAtRef.current < SEND_THROTTLE_MS) return;
    lastSentAtRef.current = now;
    try {
      ws.send(JSON.stringify({ type: 'typing', from: currentUser, at: now }));
    } catch { /* dead socket */ }
  }

  return { typingFromOthers, sendTyping };
}
