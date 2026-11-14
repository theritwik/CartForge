const wholeRupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const rupeesAndPaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

/** Formats an integer amount of paise for display, for example 189900 as ₹1,899. */
export function formatPrice(paise: number): string {
  const formatter = paise % 100 === 0 ? wholeRupees : rupeesAndPaise;
  return formatter.format(paise / 100);
}
