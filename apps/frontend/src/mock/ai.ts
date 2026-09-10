import type { KnowledgeEntry } from '@/types';
import { knowledge } from './knowledge';

/**
 * Mock knowledge-base retrieval. Returns up to `topK` knowledge entries
 * sorted by descending confidence in `[0, 1]`.
 *
 * Scoring: weighted coverage of the question tokens over each entry's
 * canonical question / answer / tags:
 *
 *   score = 0.85 * qCov(q, question)
 *         + 0.10 * qCov(q, answer)
 *         + 0.05 * qCov(q, tags)
 *
 * where `qCov(q, t) = |q ∩ t| / |q|`. This makes a perfect canonical
 * question match score ~0.85+ (the "high confidence" band) while
 * nonsense questions with zero Indonesian overlap score 0 (well below
 * the module threshold `0.65` — see `AI_CONFIDENCE_THRESHOLD`).
 */

const INDONESIAN_STOPWORDS = new Set([
  'yang',
  'di',
  'dan',
  'ini',
  'itu',
  'apa',
  'ada',
  'tidak',
  'untuk',
  'dengan',
  'saya',
  'kamu',
  'kami',
  'kita',
  'mereka',
  'nya',
  'kan',
  'lah',
  'pun',
  'dari',
  'ke',
  'pada',
  'dalam',
  'oleh',
  'sebagai',
  'atau',
  'juga',
  'sudah',
  'belum',
  'akan',
  'bisa',
  'dapat',
  'telah',
  'masih',
  'hanya',
  'saja',
  'begitu',
  'maka',
  'karena',
]);

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue;
    if (INDONESIAN_STOPWORDS.has(raw)) continue;
    if (raw.length < 2) continue;
    tokens.add(raw);
  }
  return tokens;
}

function qCov(q: Set<string>, t: Set<string>): number {
  if (q.size === 0) return 0;
  let hit = 0;
  for (const tok of q) if (t.has(tok)) hit++;
  return hit / q.size;
}

export interface KnowledgeHit {
  entry: KnowledgeEntry;
  confidence: number;
}

export function searchKnowledge(question: string, topK = 3): KnowledgeHit[] {
  const q = tokenize(question);
  if (q.size === 0) return [];

  const hits: KnowledgeHit[] = knowledge.map((entry) => {
    const qQ = tokenize(entry.question);
    const qA = tokenize(entry.answer);
    const qT = new Set<string>((entry.tags ?? []).flatMap((t) => [...tokenize(t)]));
    const score =
      0.85 * qCov(q, qQ) + 0.1 * qCov(q, qA) + 0.05 * qCov(q, qT);
    return { entry, confidence: Math.min(1, score) };
  });

  hits.sort((a, b) => b.confidence - a.confidence);
  return hits.slice(0, topK);
}