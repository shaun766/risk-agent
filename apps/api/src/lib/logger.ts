import type { LoggerOptions } from 'pino';
import { env, isProduction, isTest } from '../config/env';

/**
 * Structured logging with aggressive redaction. Financial platforms leak
 * through logs more often than through APIs, so the redaction list is
 * deliberately broad and applied at the transport, not the call site.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-hub-signature-256"]',
  'req.headers["x-twilio-signature"]',
  'res.headers["set-cookie"]',
  'password',
  'passwordHash',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
  '*.accessToken',
  '*.token',
  '*.apiKey',
  '*.OPENAI_API_KEY',
  'body.password',
  'body.refreshToken',
];

export function loggerOptions(): LoggerOptions | boolean {
  if (isTest) return false;

  const base: LoggerOptions = {
    level: env.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    serializers: {
      req(request: { method: string; url: string; id: string; ip: string }) {
        return { method: request.method, url: request.url, id: request.id, ip: request.ip };
      },
    },
  };

  if (isProduction) return base;

  return {
    ...base,
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  };
}
