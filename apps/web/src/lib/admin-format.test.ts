import { describe, expect, it } from 'vitest';
import { formatDay, paiseToRupeesInput, parseRupeesToPaise, slugFromName } from './admin-format';

describe('parseRupeesToPaise', () => {
  it.each([
    ['1299', 129_900],
    ['1299.5', 129_950],
    ['1299.50', 129_950],
    ['1,299.05', 129_905],
    ['0.10', 10],
    [' 15 ', 1_500],
  ])('reads %j as %i paise', (text, paise) => {
    expect(parseRupeesToPaise(text)).toBe(paise);
  });

  it('avoids floating-point rounding', () => {
    // 1.1 * 100 is 110.00000000000001 in floating point.
    expect(parseRupeesToPaise('1.1')).toBe(110);
    expect(parseRupeesToPaise('19.99')).toBe(1_999);
  });

  it.each(['', 'abc', '12.345', '-5', '1e3', '12345678'])('rejects %j', (text) => {
    expect(parseRupeesToPaise(text)).toBeNull();
  });
});

describe('paiseToRupeesInput', () => {
  it('shows whole rupees without decimals and keeps two digits of paise', () => {
    expect(paiseToRupeesInput(129_900)).toBe('1299');
    expect(paiseToRupeesInput(129_950)).toBe('1299.50');
    expect(paiseToRupeesInput(129_905)).toBe('1299.05');
  });

  it('round-trips with parseRupeesToPaise', () => {
    for (const paise of [100, 199, 2_050, 99_999_999]) {
      expect(parseRupeesToPaise(paiseToRupeesInput(paise))).toBe(paise);
    }
  });
});

describe('slugFromName', () => {
  it('makes a lowercase, hyphenated slug', () => {
    expect(slugFromName("Men's Cotton Kurta, Size L")).toBe('men-s-cotton-kurta-size-l');
    expect(slugFromName('  Garden & Outdoors  ')).toBe('garden-outdoors');
  });
});

describe('formatDay', () => {
  it('formats a calendar day without shifting it across time zones', () => {
    expect(formatDay('2026-11-19')).toBe('19 Nov');
  });
});
