import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { isProduction } from '../config/env';

/**
 * `instanceof ZodError` alone is fragile in this monorepo: `@flowmoney/shared-types`
 * ships its own compiled `dist/*.js` that requires its own resolution of the
 * `zod` package, and under some bundlers/test runners (Vitest's SSR module
 * graph among them) that can end up a different module instance than the
 * `zod` this file imports directly — same error shape, different prototype
 * chain, so `instanceof` silently fails and a validation error would surface
 * as a 500. Duck-typing the well-known shape is the robust fix.
 */
function isZodError(error: unknown): error is ZodError {
  if (error instanceof ZodError) return true;
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'ZodError' &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

/** Application error with an HTTP status and a stable machine-readable code. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options: { details?: unknown; expose?: boolean } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
    this.expose = options.expose ?? statusCode < 500;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, { details });

export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have permission to perform this action', details?: unknown) =>
  new AppError(403, 'FORBIDDEN', message, { details });

export const notFound = (resource = 'Resource') =>
  new AppError(404, 'NOT_FOUND', `${resource} not found`);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, { details });

export const tooManyRequests = (message = 'Too many requests') =>
  new AppError(429, 'RATE_LIMITED', message);

export const serviceUnavailable = (message: string) =>
  new AppError(503, 'SERVICE_UNAVAILABLE', message);

interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} does not exist`,
        requestId: request.id,
      },
    } satisfies ErrorBody);
  });

  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    const requestId = request.id;

    if (isZodError(error)) {
      request.log.info({ requestId, issues: error.issues }, 'request validation failed');
      reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
          requestId,
        },
      } satisfies ErrorBody);
      return;
    }

    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error, requestId }, error.message);
      } else {
        request.log.info({ requestId, code: error.code }, error.message);
      }
      reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId,
        },
      } satisfies ErrorBody);
      return;
    }

    // Fastify's own errors (rate limit, payload size, malformed JSON).
    const fastifyError = error as FastifyError;
    const statusCode = typeof fastifyError.statusCode === 'number' ? fastifyError.statusCode : 500;
    if (statusCode < 500) {
      reply.status(statusCode).send({
        error: { code: fastifyError.code ?? 'REQUEST_ERROR', message: error.message, requestId },
      } satisfies ErrorBody);
      return;
    }

    request.log.error({ err: error, requestId }, 'unhandled error');
    reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        // Never leak internals to a client in production.
        message: isProduction ? 'An unexpected error occurred' : error.message,
        requestId,
      },
    } satisfies ErrorBody);
  });
}
