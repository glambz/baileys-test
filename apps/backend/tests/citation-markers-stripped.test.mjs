/**
 * Citation markers must never reach the customer.
 *
 * The persona prompt (base-prompts.js) requires the model to close every
 * supported sentence with a [n] marker into the CONTEXT block. Nothing
 * stripped them before sending, so a real reply went out as
 * "Total tagihan kakak ada Rp 7.500.000 ya, untuk Paket A [3]."
 */
import { describe, it, expect } from 'vitest';
import { stripCitations } from '../src/ai/whatsapp/send.js';

const FALLBACK = 'Maaf kak, untuk hal itu belum ada di data kami ya 🙏';

describe('outbound reply — citation markers', () => {
  it('strips a marker before a full stop, leaving no double space', () => {
    expect(stripCitations('Total tagihan kakak Rp 7.500.000 untuk Paket A [3].'))
      .toBe('Total tagihan kakak Rp 7.500.000 untuk Paket A.');
  });

  it('strips a trailing marker at end of message', () => {
    expect(stripCitations('Harga paket A Rp 7.500.000 [1]')).toBe('Harga paket A Rp 7.500.000');
  });

  it('strips several markers across sentences', () => {
    expect(stripCitations('Paket A Rp 7.500.000 [1], Paket B Rp 2.500.000 [2]. Total Rp 10.000.000 [3]!'))
      .toBe('Paket A Rp 7.500.000, Paket B Rp 2.500.000. Total Rp 10.000.000!');
  });

  it('leaves the locked fallback phrase byte-identical', () => {
    expect(stripCitations(FALLBACK)).toBe(FALLBACK);
  });

  it('keeps money formatting and emoji untouched', () => {
    expect(stripCitations('Total tagihan kak Rp 10.000.000 ya ✨')).toBe('Total tagihan kak Rp 10.000.000 ya ✨');
  });

  it('does not eat a number that is not a marker', () => {
    expect(stripCitations('Invoice 2 dari 3 sudah lunas')).toBe('Invoice 2 dari 3 sudah lunas');
  });
});
