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
 */
export interface AuthLogoutResult {
  message: string;
  /** Baileys' unlink succeeded, so the phone no longer lists this device. */
  deviceUnlinked?: boolean;
  /** Every credential file was removed, so the next connect needs a new QR. */
  sessionCleared?: boolean;
  filesRemoved?: number;
  filesFailed?: string[];
  /** Present when the unlink was attempted and failed. */
  unlinkError?: string | null;
}

export function useAuthLogout() {
  return useMutation<AuthLogoutResult>({
    mutationFn: async () =>
      apiClient<AuthLogoutResult>('/auth/logout', { method: 'POST' }),
  });
}
