import { describe, expect, it } from 'vitest';
import { formatPrice } from './format';

describe('formatPrice', () => {
  it('formats whole rupees without decimals, using Indian digit grouping', () => {
    expect(formatPrice(189_900)).toBe('₹1,899');
    expect(formatPrice(12_345_600)).toBe('₹1,23,456');
  });

  it('shows paise when the amount is not a whole rupee', () => {
    expect(formatPrice(49_950)).toBe('₹499.50');
  });

  it('formats zero', () => {
    expect(formatPrice(0)).toBe('₹0');
  });
});
