import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

/**
 * `useAuthLogout()` — calls POST /api/auth/logout.
 *
 * This genuinely unlinks the device: the backend sends Baileys'
 * `remove-companion-device` over the live socket before tearing it down, so
 * the entry disappears from Linked Devices on the phone and the local
 * credentials are deleted. Re-connecting therefore needs a fresh QR scan.
 *
 * The response reports what actually happened rather than a fixed success
 * string, because both halves can fail independently — the unlink needs a
 * live socket, and the file wipe can be blocked by the filesystem. Render
 * these fields instead of assuming a 200 means everything worked.
 *
 * When the unlink cannot be sent (socket down), the backend now KEEPS the
 * local credentials and returns credentialsKept:true, because those
 * credentials are the only thing that can ever unlink the device — deleting
 * them used to strand it under Linked Devices permanently. Pass
 * `{ force: true }` to accept that outcome and wipe locally anyway.
 */
export interface AuthLogoutResult {
  message: string;
  /** Baileys' unlink succeeded, so the phone no longer lists this device. */
  deviceUnlinked?: boolean;
  /** Every credential file was removed, so the next connect needs a new QR. */
  sessionCleared?: boolean;
  filesRemoved?: number;
  filesFailed?: string[];
  /** Set when the unlink could not be sent, or was sent and failed. */
  unlinkError?: string | null;
  /**
   * The unlink was requested but did not happen, so the local session was
   * deliberately preserved and nothing was deleted. Retry once reconnected,
   * or logout({ force: true }) to wipe locally and clean the phone by hand.
   */
  credentialsKept?: boolean;
}

export interface AuthLogoutOptions {
  /** Keep the device paired on the phone; drop only the local session. */
  unlinkDevice?: boolean;
  /** Wipe locally even though the unlink failed. */
  force?: boolean;
}

export function useAuthLogout() {
  return useMutation<AuthLogoutResult, Error, AuthLogoutOptions | void>({
    mutationFn: async (options) =>
      apiClient<AuthLogoutResult>('/auth/logout', {
        method: 'POST',
        body: JSON.stringify(options || {}),
      }),
  });
}
