'use strict';
/**
 * Semantic chunker with overlap.
 * Source: docs/crm/plans/18-kb-ingestion.md step 2.
 *
 * Algorithm:
 *   1. Split on \n\n+.
 *   2. If a paragraph > maxTokens, split on sentence boundaries.
 *   3. If a sentence > maxTokens, hard-split on word boundaries.
 *   4. Each chunk includes overlapTokens of preceding text.
 *   5. metadata.sectionTitle follows the last preceding markdown heading.
 */
const HEADING_RE = /^(#{1,6})\s+(.+)$/;

function estimateTokens(text) {
  // Heuristic: ~1 token per 4 chars.
  return Math.ceil(text.length / 4);
}

function splitSentences(text) {
  // Naive sentence split on . ! ? followed by whitespace.
  return text.split(/(?<=[.!?])\s+/);
}

function hardSplit(text, maxTokens) {
  const maxChars = maxTokens * 4;
  const out = [];
  let i = 0;
  while (i < text.length) {
    out.push(text.slice(i, i + maxChars));
    i += maxChars;
  }
  return out;
}

function chunkText({ text, maxTokens = 512, overlapTokens = 50, metadata: baseMeta = {} }) {
  if (typeof text !== 'string') return [];

  const paragraphs = text.split(/\n{2,}/);
  let currentSection = baseMeta.sectionTitle || null;
  const tokens = [];

  function push(textStr, opts) {
    const meta = Object.assign({}, baseMeta || {});
    meta.tokenEstimate = estimateTokens(textStr);
    if (currentSection) meta.sectionTitle = currentSection;
    meta.hardSplit = opts && opts.hardSplit ? true : false;
    tokens.push({ text: textStr, metadata: meta });
  }

  for (const paraRaw of paragraphs) {
    const para = paraRaw.trim();
    if (!para) continue;
    const headingMatch = para.match(HEADING_RE);
    if (headingMatch) {
      currentSection = headingMatch[2].trim();
      // Don't emit a chunk for the heading itself.
      continue;
    }
    const est = estimateTokens(para);
    if (est <= maxTokens) {
      push(para, { hardSplit: false });
      continue;
    }
    // Split into sentences.
    const sentences = splitSentences(para);
    let buf = '';
    for (const s of sentences) {
      if (estimateTokens(buf + ' ' + s) <= maxTokens) {
        buf = buf ? `${buf} ${s}` : s;
      } else {
        if (buf) push(buf, { hardSplit: false });
        if (estimateTokens(s) > maxTokens) {
          for (const piece of hardSplit(s, maxTokens)) {
            push(piece, { hardSplit: true });
          }
          buf = '';
        } else {
          buf = s;
        }
      }
    }
    if (buf) push(buf, { hardSplit: false });
  }

  // Add overlap.
  const overlapChars = overlapTokens * 4;
  const out = tokens.map((t, i) => {
    if (i === 0 || overlapChars === 0) return t;
    const prev = tokens[i - 1].text;
    const tail = prev.slice(Math.max(0, prev.length - overlapChars));
    return { ...t, text: `${tail} ${t.text}`.trim() };
  });
  return out;
}

module.exports = { chunkText };