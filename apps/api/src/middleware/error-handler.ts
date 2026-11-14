import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

/** express.json() rejects malformed or oversized bodies with an error carrying a 4xx status. */
function isBodyParserError(error: unknown): error is { status: number } {
  return (
    error instanceof Error &&
    'type' in error &&
    typeof error.type === 'string' &&
    error.type.startsWith('entity.') &&
    'status' in error &&
    typeof error.status === 'number'
  );
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request is invalid.',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (isBodyParserError(error)) {
    res.status(error.status).json({
      error: {
        code: error.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
        message: 'The request body could not be read.',
      },
    });
    return;
  }

  if (error instanceof AppError) {
    if (error.statusCode === 429) {
      const { retryAfterSeconds } = error.details as { retryAfterSeconds: number };
      res.set('Retry-After', String(retryAfterSeconds));
    }
    res.status(error.statusCode).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  req.log.error({ err: error }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' },
  });
};
