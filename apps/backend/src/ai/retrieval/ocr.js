'use strict';
/**
 * Multi-format text extractor for KB ingestion.
 * Source: docs/crm/plans/18-kb-ingestion.md step 1.
 */
class UnsupportedMimeError extends Error {
  constructor(mimeType) {
    super(`Unsupported MIME type: ${mimeType}`);
    this.name = 'UnsupportedMimeError';
    this.mimeType = mimeType;
  }
}

async function extractFromPdf(buffer) {
  // pdf-parse is CJS: require it lazily to avoid loading on every call.
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return {
    text: data.text || '',
    metadata: { pages: data.numpages || 0 },
  };
}

async function extractFromDocx(buffer) {
  const mammoth = require('mammoth');
  const r = await mammoth.extractRawText({ buffer });
  return { text: r.value || '', metadata: {} };
}

async function extractFromHtml(buffer) {
  const cheerio = require('cheerio');
  const html = buffer.toString('utf8');
  const $ = cheerio.load(html);
  // Remove script/style.
  $('script, style').remove();
  const text = $('body').text() || $.text();
  const sections = [];
  $('h1, h2, h3').each((_, el) => {
    const t = $(el).text().trim();
    if (t) sections.push(t);
  });
  return { text, metadata: { sections } };
}

async function extractFromXlsx(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const parts = [];
  const sections = [];
  for (const name of wb.SheetNames) {
    sections.push(name);
    const sheet = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(csv);
  }
  return { text: parts.join('\n'), metadata: { sections } };
}

async function extractFromCsv(buffer) {
  const text = buffer.toString('utf8');
  return { text, metadata: {} };
}

async function extractText({ buffer, mimeType }) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('extractText: buffer is required');
  }
  switch ((mimeType || '').toLowerCase()) {
    case 'application/pdf':
      return extractFromPdf(buffer);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return extractFromDocx(buffer);
    case 'text/html':
    case 'application/xhtml+xml':
      return extractFromHtml(buffer);
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return extractFromXlsx(buffer);
    case 'text/csv':
      return extractFromCsv(buffer);
    case 'text/plain':
      return { text: buffer.toString('utf8'), metadata: {} };
    default:
      throw new UnsupportedMimeError(mimeType);
  }
}

module.exports = { extractText, UnsupportedMimeError };