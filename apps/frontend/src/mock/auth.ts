import dayjs from 'dayjs';
import type { AuthStatus } from '@/types';

/**
 * Mock auth status — returns a hardcoded "connected" snapshot that the
 * AuthStatusBanner renders as a green "Terhubung" pill.
 */
export function getAuthStatus(): AuthStatus {
  return {
    connected: true,
    state: 'open',
    userJid: '6281234567890@s.whatsapp.net',
    userName: 'Indocyber Studio',
    lastUpdatedAt: dayjs().unix(),
  };
}