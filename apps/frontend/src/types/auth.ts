/**
 * Auth data model — interface source: `docs/tech/chat-data-model.md` §2.9.
 */

/**
 * Response shape of GET /api/auth/status.
 */
export interface AuthStatus {
  /** `true` when the WhatsApp socket is in the `open` state. */
  connected: boolean;
  /** Backend connection state. */
  state: 'open' | 'qr' | 'connecting' | 'close';
  /** Operator JID, when connected; `null` otherwise. */
  userJid?: string | null;
  /** Display name of the operator's own WhatsApp profile; `null` otherwise. */
  userName?: string | null;
  /** Unix seconds of the last state transition; `null` when unknown. */
  lastUpdatedAt?: number | null;
  /**
   * Last socket error reported by Baileys, e.g. "Connection Terminated".
   * `state: 'close'` on its own does not distinguish a socket that was
   * terminated from one that was never started.
   */
  lastError?: string | null;
  /** How many times the backend has retried the socket since it last opened. */
  reconnectAttempts?: number | null;
}