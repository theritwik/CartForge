import { z } from 'zod';

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const;

// Mirrors the API's rules to give immediate feedback. The API validates again.
export const shippingAddressFormSchema = z.object({
  name: z.string().trim().min(1, "Enter the recipient's name").max(100),
  phone: z
    .string()
    .transform((value) => value.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^(\+91|0)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')),
  addressLine1: z.string().trim().min(1, 'Enter the address').max(200),
  addressLine2: z.string().trim().max(200),
  city: z.string().trim().min(1, 'Enter the city').max(100),
  state: z.enum(INDIAN_STATES, 'Choose a state'),
  postalCode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code'),
});

/** API validation errors name fields as "shippingAddress.city"; the form uses "city". */
export function addressFieldErrors(apiFieldErrors: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(apiFieldErrors).map(([path, message]) => [
      path.replace(/^shippingAddress\./, ''),
      message,
    ]),
  );
}
