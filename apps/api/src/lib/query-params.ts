import { z } from 'zod';

/**
 * A whole number written in plain decimal digits. Number() alone would also
 * accept forms such as "1e3", "0x10", and " 5 ".
 */
export function wholeNumber(min: number, max: number) {
  return z
    .string()
    .regex(/^\d{1,10}$/, 'Must be a whole number')
    .transform(Number)
    .pipe(z.number().min(min).max(max));
}
