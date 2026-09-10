/**
 * Knowledge data model — interface source: `docs/tech/chat-data-model.md` §2.4–§2.8.
 */

/**
 * One Q/A fact in the AI knowledge base.
 */
export interface KnowledgeEntry {
  /** Stable id; the frontend cites this in evidence items. */
  id: string;
  /** Canonical question / phrasing the operator is likely to use. */
  question: string;
  /** Authoritative answer to render in the AI Chat. */
  answer: string;
  /** Optional free-text tags used by the mock retrieval ranking. */
  tags?: string[];
  /** Human-readable source citation: title, page, URL — rendered in evidence. */
  source: string;
  /** Optional URL for the source; rendered as a clickable link. */
  sourceUrl?: string | null;
  /** Unix seconds; timestamp the entry was last verified by a human. */
  updatedAt: number;
}

/**
 * Normalized confidence score in `[0, 1]`.
 * Module-wide threshold is `0.65` (see `docs/frontend/general/MODULE_OVERVIEW.md` §8).
 */
export interface ConfidenceScore {
  value: number;
  bucket: 'high' | 'medium' | 'low';
}

/**
 * One citation rendered beside an `AiAnswer`.
 */
export interface Evidence {
  /** The `KnowledgeEntry.id` being cited. */
  entryId: string;
  /** One-line excerpt of the matched question or answer (≤120 chars). */
  excerpt: string;
  /** Verbatim `KnowledgeEntry.source` for the citation line. */
  source: string;
  /** Optional clickable URL copy of `KnowledgeEntry.sourceUrl`. */
  sourceUrl?: string | null;
  /** Per-evidence confidence in `[0, 1]`; informational, not part of the decision. */
  confidence: number;
}

/** Non-fallback response from POST /api/ai/ask. */
export interface AiAnswer {
  kind: 'answered';
  /** The matched `KnowledgeEntry.answer`. */
  answer: string;
  /** Normalized confidence in `[0, 1]`. Compared against the module threshold `0.65`. */
  confidence: number;
  /** List of evidence items supporting the answer. */
  evidence: Evidence[];
  /** Unix seconds; when the answer was produced. */
  generatedAt: number;
  /** Echo of the original user question, trimmed. */
  question: string;
}

/**
 * Response when no `KnowledgeEntry` meets the confidence threshold `0.65`.
 * The `message` field is the fixed Indonesian sentence from
 * `docs/frontend/features/ai-chat/spec.md` §8.
 */
export interface FallbackAiAnswer {
  kind: 'fallback';
  /** Fixed Indonesian sentence. */
  message: string;
  /** Optional `KnowledgeEntry` pointer for "maybe you meant this…". */
  suggestion?: {
    entryId: string;
    question: string;
    source: string;
  };
  /** Top-N candidate scores that failed the threshold, for transparency. */
  rejectedCandidates?: Array<{ entryId: string; confidence: number }>;
}

/** Discriminated union returned by POST /api/ai/ask. */
export type AskAiResponse = AiAnswer | FallbackAiAnswer;