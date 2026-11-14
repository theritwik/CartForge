import { describe, expect, it } from 'vitest';
import { availabilityWarning, itemCountLabel, quantityControls, signInHref } from './cart-view';

function item(overrides: {
  quantity?: number;
  availability?: 'AVAILABLE' | 'INSUFFICIENT_STOCK' | 'OUT_OF_STOCK' | 'UNAVAILABLE';
  availableQuantity?: number;
}) {
  return {
    quantity: overrides.quantity ?? 2,
    availability: overrides.availability ?? 'AVAILABLE',
    product: {
      id: 'p1',
      name: 'Steel Kettle',
      slug: 'steel-kettle',
      pricePaise: 150_000,
      image: null,
      availableQuantity: overrides.availableQuantity ?? 5,
    },
  };
}

describe('availabilityWarning', () => {
  it('has no warning for an item that can be bought', () => {
    expect(availabilityWarning(item({}))).toBeNull();
  });

  it('says how many are left when stock is short', () => {
    expect(
      availabilityWarning(
        item({ quantity: 4, availability: 'INSUFFICIENT_STOCK', availableQuantity: 3 }),
      ),
    ).toMatch(/^Only 3 left\./);
  });

  it('distinguishes out of stock from no longer sold', () => {
    expect(availabilityWarning(item({ availability: 'OUT_OF_STOCK' }))).toMatch(/^Out of stock/);
    expect(availabilityWarning(item({ availability: 'UNAVAILABLE' }))).toBe('No longer available.');
  });
});

describe('quantityControls', () => {
  it('allows both directions in the middle of the range', () => {
    expect(quantityControls(item({ quantity: 2 }), 10)).toEqual({
      canDecrease: true,
      canIncrease: true,
    });
  });

  it('does not go below one', () => {
    expect(quantityControls(item({ quantity: 1 }), 10).canDecrease).toBe(false);
  });

  it('stops at the available stock', () => {
    expect(quantityControls(item({ quantity: 5, availableQuantity: 5 }), 10).canIncrease).toBe(
      false,
    );
  });

  it('stops at the per-item limit', () => {
    expect(quantityControls(item({ quantity: 10, availableQuantity: 50 }), 10).canIncrease).toBe(
      false,
    );
  });

  it('only allows lowering an item that is short of stock or no longer sold', () => {
    const short = item({ quantity: 4, availability: 'INSUFFICIENT_STOCK', availableQuantity: 3 });
    const withdrawn = item({ quantity: 2, availability: 'UNAVAILABLE', availableQuantity: 0 });

    expect(quantityControls(short, 10)).toEqual({ canDecrease: true, canIncrease: false });
    expect(quantityControls(withdrawn, 10)).toEqual({ canDecrease: true, canIncrease: false });
  });
});

describe('itemCountLabel', () => {
  it('uses the singular for one item', () => {
    expect([0, 1, 2].map(itemCountLabel)).toEqual(['0 items', '1 item', '2 items']);
  });
});

describe('signInHref', () => {
  it('encodes the page to return to, including its query string', () => {
    expect(signInHref('/products?q=steel&page=2')).toBe(
      '/login?next=%2Fproducts%3Fq%3Dsteel%26page%3D2',
    );
  });
});
