import { LOCALE } from './format';

/**
 * Money is stored and sent as integer euro cents, never floats. This module is the one place
 * that turns what people type into cents and cents into text.
 */

/** The largest amount the app accepts: € 9.999.999,99 (the backend checks the same). */
export const MAX_CENTS = 999_999_999;

const euro = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR' });

/** 42050 → "€ 420,50". */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error(`Amount must be whole cents: ${cents}`);
  return euro.format(cents / 100);
}

/** Cents → what an amount field shows for editing: 123456 → "1234,56", 4000 → "40". */
export function centsToInput(cents: number | null): string {
  if (cents === null) return '';
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(euros) : `${euros},${String(rest).padStart(2, '0')}`;
}

/**
 * A leading + or − (also "−", the typographic minus) typed before an amount, and the amount
 * without it: "-500" → { sign: '-', amount: '500' }, "€ +12,50" → '+', "40" → null.
 */
export function splitSign(input: string): { sign: '+' | '-' | null; amount: string } {
  const match = /^[\s€  ]*([+\-−])(.*)$/s.exec(input);
  if (!match) return { sign: null, amount: input };
  return { sign: match[1] === '+' ? '+' : '-', amount: match[2]! };
}

export type ParseEuroError = 'invalid' | 'negative' | 'tooManyDecimals' | 'tooLarge';
export type ParseEuroResult =
  { ok: true; cents: number | null } | { ok: false; error: ParseEuroError };

/**
 * What someone typed in an amount field → cents. Empty means "no amount" (null).
 *
 * Accepts "12,50", "12.50", "1.234,56", "1,234.56", "€ 40" and "1 234,5":
 * - `€` and spaces are ignored.
 * - When both `.` and `,` appear, the last one is the decimal separator and the other one
 *   groups thousands.
 * - When only one of them appears, it is the decimal separator if it appears once and is
 *   followed by at most 2 digits ("12,5", "12,"); otherwise it groups thousands ("1.234",
 *   "1.234.567"), which needs groups of exactly 3 digits.
 * - More than 2 decimals is an error, never rounded away.
 */
export function parseEuro(input: string): ParseEuroResult {
  const text = input.replace(/[€\s  ]/g, '');
  if (text === '') return { ok: true, cents: null };
  if (text.startsWith('-')) return { ok: false, error: 'negative' };
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return { ok: false, error: 'invalid' };

  const split = splitDecimal(text);
  if (!split.ok) return split;
  const { whole, decimals } = split;

  if (decimals.length > 2) return { ok: false, error: 'tooManyDecimals' };
  if (whole === '' && decimals === '') return { ok: false, error: 'invalid' };

  // Digits only from here, so no float arithmetic is involved.
  const euros = whole === '' ? 0 : Number(whole);
  const cents = euros * 100 + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return { ok: false, error: 'tooLarge' };
  return { ok: true, cents };
}

type Split = { ok: true; whole: string; decimals: string } | { ok: false; error: ParseEuroError };

/** Splits the text (digits, `.` and `,` only) into whole euros and decimals, both digits only. */
function splitDecimal(text: string): Split {
  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');

  if (lastDot === -1 && lastComma === -1) return { ok: true, whole: text, decimals: '' };

  let decimalSeparator: '.' | ',' | null;
  if (lastDot !== -1 && lastComma !== -1) {
    decimalSeparator = lastDot > lastComma ? '.' : ',';
  } else {
    const separator = lastDot !== -1 ? '.' : ',';
    const occurrences = text.split(separator).length - 1;
    const after = text.length - text.lastIndexOf(separator) - 1;
    // "1.234" is ambiguous; three digits after a single separator reads as thousands.
    decimalSeparator = occurrences === 1 && after <= 2 ? separator : null;
    if (decimalSeparator === null) {
      const whole = ungroup(text);
      if (whole !== null) return { ok: true, whole, decimals: '' };
      // "12,3456": one separator that can't be thousands, so too many decimals.
      return { ok: false, error: occurrences === 1 ? 'tooManyDecimals' : 'invalid' };
    }
  }

  const at = text.lastIndexOf(decimalSeparator);
  const wholePart = text.slice(0, at);
  const decimals = text.slice(at + 1);
  if (/[.,]/.test(decimals)) return { ok: false, error: 'invalid' };
  if (wholePart.includes(decimalSeparator)) return { ok: false, error: 'invalid' };
  const whole = ungroup(wholePart);
  if (whole === null) return { ok: false, error: 'invalid' };
  if (decimals.length > 2) return { ok: false, error: 'tooManyDecimals' };
  return { ok: true, whole, decimals };
}

/**
 * "1.234.567" or "1,234" → "1234567" / "1234": the first group has 1–3 digits and doesn't start
 * with 0 ("0.001" is not a thousand), every other group exactly 3. Plain digits pass unchanged.
 * Anything else is not a grouped number.
 */
function ungroup(text: string): string | null {
  if (/^\d*$/.test(text)) return text;
  if (!/^[1-9]\d{0,2}([.,]\d{3})+$/.test(text)) return null;
  // One kind of separator only.
  if (text.includes('.') && text.includes(',')) return null;
  return text.replace(/[.,]/g, '');
}
