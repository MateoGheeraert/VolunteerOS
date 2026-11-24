import { describe, expect, it } from 'vitest';
import { centsToInput, formatCents, MAX_CENTS, parseEuro, splitSign } from '@/lib/money';

/** Intl puts a (narrow) no-break space after the euro sign: compare with a plain one. */
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('formatCents', () => {
  it('formats euros the Belgian way', () => {
    expect(plain(formatCents(42050))).toBe('€ 420,50');
    expect(plain(formatCents(123456789))).toBe('€ 1.234.567,89');
    expect(plain(formatCents(0))).toBe('€ 0,00');
    expect(plain(formatCents(5))).toBe('€ 0,05');
  });

  it('formats negative results, as the budget result can be', () => {
    expect(plain(formatCents(-150000))).toBe('€ -1.500,00');
  });

  it('refuses fractional cents', () => {
    expect(() => formatCents(10.5)).toThrow(/whole cents/);
  });
});

describe('parseEuro', () => {
  const cents = (input: string) => {
    const result = parseEuro(input);
    if (!result.ok) throw new Error(`${input}: ${result.error}`);
    return result.cents;
  };
  const error = (input: string) => {
    const result = parseEuro(input);
    return result.ok ? `parsed as ${result.cents}` : result.error;
  };

  it('reads an empty field as no amount', () => {
    expect(cents('')).toBeNull();
    expect(cents('   ')).toBeNull();
    expect(cents('€')).toBeNull();
  });

  it('reads whole euros', () => {
    expect(cents('40')).toBe(4000);
    expect(cents('0')).toBe(0);
    expect(cents('€ 40')).toBe(4000);
    expect(cents('40 €')).toBe(4000);
  });

  it('takes a single comma or dot followed by 1–2 digits as decimals', () => {
    expect(cents('12,50')).toBe(1250);
    expect(cents('12.50')).toBe(1250);
    expect(cents('12,5')).toBe(1250);
    expect(cents('0,05')).toBe(5);
    expect(cents(',5')).toBe(50);
    expect(cents('12,')).toBe(1200);
  });

  it('takes the last separator as the decimal one when both appear', () => {
    expect(cents('1.234,56')).toBe(123456);
    expect(cents('1,234.56')).toBe(123456);
    expect(cents('1.234.567,8')).toBe(123456780);
    expect(cents('€ 1.234,56')).toBe(123456);
  });

  it('takes a separator followed by groups of three digits as thousands', () => {
    expect(cents('1.234')).toBe(123400);
    expect(cents('1,234')).toBe(123400);
    expect(cents('1.234.567')).toBe(123456700);
  });

  it('ignores spaces, including the no-break spaces Intl writes', () => {
    expect(cents('1 234,56')).toBe(123456);
    expect(cents(formatCents(123456))).toBe(123456);
    expect(cents(formatCents(5))).toBe(5);
  });

  it('reads what centsToInput writes', () => {
    for (const value of [0, 5, 50, 4000, 123456, MAX_CENTS]) {
      expect(cents(centsToInput(value))).toBe(value);
    }
  });

  it('never rounds: more than 2 decimals is an error', () => {
    expect(error('12,505')).toBe('parsed as 1250500'); // three digits: thousands
    expect(error('12,3456')).toBe('tooManyDecimals');
    expect(error('1.234,567')).toBe('tooManyDecimals');
    expect(error('0.001')).toBe('tooManyDecimals');
  });

  it('refuses negative amounts: the type says whether it is income or an expense', () => {
    expect(error('-12')).toBe('negative');
    expect(error('- 12,50')).toBe('negative');
  });

  it('refuses text that is not an amount', () => {
    expect(error('twaalf')).toBe('invalid');
    expect(error('12a')).toBe('invalid');
    expect(error('1e5')).toBe('invalid');
    expect(error('.')).toBe('invalid');
    expect(error('1,2,3')).toBe('invalid');
    expect(error('12,34,56')).toBe('invalid');
    expect(error('1.23.456')).toBe('invalid');
    expect(error('1.234.56,7')).toBe('invalid');
    expect(error('1,234,56.7')).toBe('invalid');
  });

  it('accepts up to € 9.999.999,99', () => {
    expect(cents('9.999.999,99')).toBe(MAX_CENTS);
    expect(error('10.000.000')).toBe('tooLarge');
    expect(error('99999999999999999999')).toBe('tooLarge');
  });
});

describe('centsToInput', () => {
  it('writes cents the way people type them, without thousands separators', () => {
    expect(centsToInput(null)).toBe('');
    expect(centsToInput(0)).toBe('0');
    expect(centsToInput(4000)).toBe('40');
    expect(centsToInput(1250)).toBe('12,50');
    expect(centsToInput(5)).toBe('0,05');
    expect(centsToInput(123456)).toBe('1234,56');
  });
});

describe('splitSign', () => {
  it('takes a leading + or − off the amount', () => {
    expect(splitSign('-500')).toEqual({ sign: '-', amount: '500' });
    expect(splitSign('−12,50')).toEqual({ sign: '-', amount: '12,50' });
    expect(splitSign(' € +40')).toEqual({ sign: '+', amount: '40' });
    expect(splitSign('40')).toEqual({ sign: null, amount: '40' });
    expect(splitSign('')).toEqual({ sign: null, amount: '' });
  });
});
