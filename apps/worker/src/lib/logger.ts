import pino from 'pino';
import { env, isProduction } from '../config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(isProduction
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }),
});
