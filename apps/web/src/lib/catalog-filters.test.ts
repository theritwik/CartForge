import { describe, expect, it } from 'vitest';
import { catalogHref, parseCatalogFilters } from './catalog-filters';

const defaults = {
  q: undefined,
  minPrice: undefined,
  maxPrice: undefined,
  sort: 'newest',
  page: 1,
};

describe('parseCatalogFilters', () => {
  it('returns defaults for an empty query string', () => {
    expect(parseCatalogFilters({})).toEqual(defaults);
  });

  it('reads search, price range, sort, and page', () => {
    expect(
      parseCatalogFilters({
        q: ' steel ',
        minPrice: '500',
        maxPrice: '2000',
        sort: 'price_asc',
        page: '3',
      }),
    ).toEqual({ q: 'steel', minPrice: 500, maxPrice: 2000, sort: 'price_asc', page: 3 });
  });

  it('ignores invalid values instead of failing', () => {
    expect(
      parseCatalogFilters({ q: '', minPrice: 'abc', maxPrice: '-5', sort: 'cheapest', page: '0' }),
    ).toEqual(defaults);
  });

  it('treats an empty price field as not set, not as zero', () => {
    expect(parseCatalogFilters({ minPrice: '', maxPrice: '' })).toEqual(defaults);
  });

  it('swaps a minimum price that is above the maximum', () => {
    expect(parseCatalogFilters({ minPrice: '2000', maxPrice: '500' })).toMatchObject({
      minPrice: 500,
      maxPrice: 2000,
    });
  });

  it('uses the first value when a parameter is repeated', () => {
    expect(parseCatalogFilters({ q: ['kettle', 'knife'] }).q).toBe('kettle');
  });
});

describe('catalogHref', () => {
  const filters = parseCatalogFilters({
    q: 'steel',
    maxPrice: '2000',
    sort: 'price_desc',
    page: '2',
  });

  it('omits default values', () => {
    expect(catalogHref('/products', parseCatalogFilters({}))).toBe('/products');
  });

  it('keeps the other filters and returns to page 1 when one filter changes', () => {
    expect(catalogHref('/products', filters, { sort: 'price_asc' })).toBe(
      '/products?q=steel&maxPrice=2000&sort=price_asc',
    );
  });

  it('sets the page for pagination links', () => {
    expect(catalogHref('/categories/books', filters, { page: 3 })).toBe(
      '/categories/books?q=steel&maxPrice=2000&sort=price_desc&page=3',
    );
  });

  it('removes a filter that is cleared', () => {
    expect(catalogHref('/products', filters, { q: undefined, maxPrice: undefined })).toBe(
      '/products?sort=price_desc',
    );
  });

  it('encodes search text', () => {
    expect(catalogHref('/products', parseCatalogFilters({ q: 'salt & pepper' }))).toBe(
      '/products?q=salt+%26+pepper',
    );
  });
});
