import { z } from 'zod';
import type { FieldErrors } from './auth-forms';

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    // Validation errors carry a list of fields; other errors may carry other details.
    details: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional()
      .catch(undefined),
  }),
});

export type ApiResult =
  /** `data` is the parsed response body, or null when the response has none. */
  | { ok: true; data: unknown }
  | { ok: false; code: string; message: string; fieldErrors: FieldErrors };

function failure(code: string, message: string, fieldErrors: FieldErrors = {}): ApiResult {
  return { ok: false, code, message, fieldErrors };
}

/**
 * Sends a state-changing request from the browser through the same-origin /api
 * proxy. The session cookie is HttpOnly, so it is attached and updated by the
 * browser and never visible to this code.
 */
export async function callApi(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<ApiResult> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    return failure('NETWORK_ERROR', 'Could not reach the server. Check your connection.');
  }

  const responseBody: unknown = await response.json().catch(() => null);
  if (response.ok) {
    return { ok: true, data: responseBody };
  }

  const envelope = errorEnvelopeSchema.safeParse(responseBody);
  if (!envelope.success) {
    return failure('UNEXPECTED_ERROR', 'Something went wrong. Please try again.');
  }
  const { code, message, details = [] } = envelope.data.error;
  return failure(
    code,
    message,
    Object.fromEntries(details.map((detail) => [detail.path, detail.message])),
  );
}
