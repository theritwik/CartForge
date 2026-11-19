import { describe, expect, it } from 'vitest';
import { parseOrderFilters, parseProductFilters, toQuery } from './admin-filters';

describe('parseProductFilters', () => {
  it('keeps valid filters', () => {
    expect(
      parseProductFilters({ q: ' kettle ', status: 'ARCHIVED', lowStock: 'true', page: '2' }),
    ).toEqual({
      q: 'kettle',
      status: 'ARCHIVED',
      categoryId: undefined,
      lowStock: 'true',
      page: 2,
    });
  });

  it('drops invalid values instead of failing', () => {
    expect(
      parseProductFilters({ status: 'GONE', categoryId: 'kitchen', lowStock: 'yes', page: '-1' }),
    ).toEqual({
      q: undefined,
      status: undefined,
      categoryId: undefined,
      lowStock: undefined,
      page: 1,
    });
  });
});

describe('parseOrderFilters', () => {
  it('accepts the short order reference customers see', () => {
    expect(parseOrderFilters({ reference: '#ABCD1234' }).reference).toBe('#ABCD1234');
  });

  it('drops a reference that cannot be an order number', () => {
    expect(parseOrderFilters({ reference: "'; drop table" }).reference).toBeUndefined();
    expect(parseOrderFilters({ status: 'LOST' }).status).toBeUndefined();
  });
});

describe('toQuery', () => {
  it('omits empty values and the first page', () => {
    expect(toQuery({ q: 'lamp', status: undefined, page: 1 }).toString()).toBe('q=lamp');
    expect(toQuery({ page: 3 }).toString()).toBe('page=3');
  });
});
