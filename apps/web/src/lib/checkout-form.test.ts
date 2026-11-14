import { describe, expect, it } from 'vitest';
import { fieldErrorsFrom } from './auth-forms';
import { addressFieldErrors, shippingAddressFormSchema } from './checkout-form';

const validAddress = {
  name: 'Asha Rao',
  phone: '98765 43210',
  addressLine1: '12 MG Road',
  addressLine2: '',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
};

describe('shippingAddressFormSchema', () => {
  it('accepts a valid address and strips spaces from the phone number', () => {
    expect(shippingAddressFormSchema.parse(validAddress)).toMatchObject({ phone: '9876543210' });
  });

  it.each(['+91 98765 43210', '09876543210', '98765-43210'])(
    'accepts the phone number %s',
    (phone) => {
      expect(shippingAddressFormSchema.safeParse({ ...validAddress, phone }).success).toBe(true);
    },
  );

  it('reports one message per invalid field', () => {
    const result = shippingAddressFormSchema.safeParse({
      ...validAddress,
      name: '',
      phone: '12345',
      state: '',
      postalCode: '5600',
    });

    expect(result.error && fieldErrorsFrom(result.error)).toEqual({
      name: "Enter the recipient's name",
      phone: 'Enter a valid 10-digit mobile number',
      state: 'Choose a state',
      postalCode: 'Enter a valid 6-digit PIN code',
    });
  });
});

describe('addressFieldErrors', () => {
  it('maps API field paths to form field names', () => {
    expect(
      addressFieldErrors({
        'shippingAddress.city': 'Required',
        'shippingAddress.phone': 'Invalid',
      }),
    ).toEqual({ city: 'Required', phone: 'Invalid' });
  });
});
