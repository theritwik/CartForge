import { z } from 'zod';
import { callApi, type ApiResult } from './api-client';

const startedPaymentSchema = z.object({ data: z.object({ checkoutUrl: z.url() }) });

/**
 * Starts (or resumes) payment for an order and sends the browser to the hosted
 * payment page. Returns only if that could not be done.
 */
export async function goToPayment(orderId: string): Promise<Extract<ApiResult, { ok: false }>> {
  const result = await callApi('POST', `/orders/${orderId}/payments`);
  if (!result.ok) {
    return result;
  }
  const payment = startedPaymentSchema.safeParse(result.data);
  if (!payment.success) {
    return {
      ok: false,
      code: 'UNEXPECTED_ERROR',
      message: 'The payment page could not be opened. Please try again.',
      fieldErrors: {},
    };
  }
  window.location.assign(payment.data.data.checkoutUrl);
  // The page is being replaced; keep the caller waiting instead of flashing an idle state.
  return new Promise(() => undefined);
}
