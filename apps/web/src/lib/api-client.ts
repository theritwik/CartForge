import { z } from 'zod';
import type { FieldErrors } from './auth-forms';

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional()
      .catch(undefined),
  }),
});

export type ApiResult = { ok: true } | { ok: false; message: string; fieldErrors: FieldErrors };

function failure(message: string, fieldErrors: FieldErrors = {}): ApiResult {
  return { ok: false, message, fieldErrors };
}

const UNEXPECTED_FAILURE = failure('Something went wrong. Please try again.');

/**
 * Sends a state-changing request from the browser through the same-origin /api
 * proxy. The session cookie is HttpOnly, so it is attached and updated by the
 * browser and never visible to this code.
 */
export async function postToApi(path: string, body?: unknown): Promise<ApiResult> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method: 'POST',
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    return failure('Could not reach the server. Check your connection.');
  }
  if (response.ok) {
    return { ok: true };
  }

  const envelope = errorEnvelopeSchema.safeParse(await response.json().catch(() => null));
  if (!envelope.success) {
    return UNEXPECTED_FAILURE;
  }
  const { message, details = [] } = envelope.data.error;
  return failure(
    message,
    Object.fromEntries(details.map((detail) => [detail.path, detail.message])),
  );
}
