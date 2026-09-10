/**
 * Streaming AI chat types.
 * Source: docs/specs/2026-08-18-in-app-ai-chat-polish.md
 *
 * Wire protocol (SSE):
 *   event: tool   { name, input, resultCount, retrievalScore? }
 *   event: chunk  { delta }
 *   event: done   { answer, confidence, evidence, kind, generatedAt }
 *   event: error  { message, ... }
 */

export interface ToolEvent {
  name: string;
  input: unknown;
  resultCount: number;
  retrievalScore?: number;
}

export interface ChunkEvent {
  delta: string;
}

export interface EvidenceEntry {
  kind: 'kb' | 'crm';
  entryId?: string;
  excerpt?: string;
  source?: string;
  confidence?: number;
  recordId?: string;
  contactId?: string | null;
  sourceUrl?: string | null;
}

export interface DoneEvent {
  answer: string;
  confidence: number;
  evidence: EvidenceEntry[];
  kind: 'answered' | 'fallback';
  generatedAt: number;
}

export interface ErrorEvent {
  message: string;
  issues?: unknown;
}

export interface StreamCallbacks {
  onTool?: (tool: ToolEvent) => void;
  onChunk?: (chunk: ChunkEvent) => void;
  onDone?: (done: DoneEvent) => void;
  onError?: (err: ErrorEvent) => void;
}

export interface StreamHandle {
  abort: () => void;
}

export interface StreamInput {
  question: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  topK?: number;
  signal?: AbortSignal;
}
