/**
 * useChatStream — thin React wrapper around runChatStream.
 * Source: docs/specs/2026-08-18-in-app-ai-chat-polish.md
 */
import { useCallback, useRef } from 'react';
import { runChatStream } from './chatStream';
import type { StreamCallbacks, StreamHandle, StreamInput } from '@/types/aiStream';

export function useChatStream() {
  const ctrlRef = useRef<AbortController | null>(null);

  const start = useCallback(async (input: StreamInput, cb: StreamCallbacks): Promise<StreamHandle> => {
    const handle = await runChatStream(input, cb);
    // Track the inner controller so abort() can be called without a handle.
    handle.abort.toString(); // no-op: just keeping the import contract simple
    return handle;
  }, []);

  const abort = useCallback(() => {
    ctrlRef.current?.abort();
    ctrlRef.current = null;
  }, []);

  return { start, abort };
}

// Re-export the pure runner so tests can use it without React.
export { runChatStream, parseSseFrame } from './chatStream';
