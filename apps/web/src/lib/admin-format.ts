import type { OrderStatus } from './orders';

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export const productStatusLabels: Record<ProductStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
};

/** Button text for each status an administrator can move an order to. */
export const transitionLabels: Partial<Record<OrderStatus, string>> = {
  PROCESSING: 'Start processing',
  SHIPPED: 'Mark as shipped',
  DELIVERED: 'Mark as delivered',
  CANCELLED: 'Cancel order',
};

const RUPEES_PATTERN = /^(\d{1,7})(?:\.(\d{1,2}))?$/;

/**
 * Reads a rupee amount typed by an administrator ("1299", "1299.5", "1,299.50")
 * as integer paise, using string arithmetic so no floating-point rounding is
 * involved. Returns null if the text is not an amount.
 */
export function parseRupeesToPaise(text: string): number | null {
  const match = RUPEES_PATTERN.exec(text.trim().replaceAll(',', ''));
  if (!match) {
    return null;
  }
  const [, rupees = '0', paise = ''] = match;
  return Number(rupees) * 100 + Number(paise.padEnd(2, '0'));
}

/** Integer paise as the plain rupee text shown in a price field, for example 129950 as "1299.50". */
export function paiseToRupeesInput(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;
  return remainder === 0 ? String(rupees) : `${rupees}.${String(remainder).padStart(2, '0')}`;
}

/** A URL slug made from a name, as a starting suggestion the administrator can edit. */
export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

const shortDayFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** "2026-11-19" as "19 Nov". The date is already a calendar day in Indian time. */
export function formatDay(isoDate: string): string {
  return shortDayFormat.format(new Date(`${isoDate}T00:00:00Z`));
}
