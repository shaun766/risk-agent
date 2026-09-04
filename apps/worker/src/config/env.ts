import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv({ path: path.resolve(__dirname, '../../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  /** How often the idle-cash / anomaly / budget-alert sweep runs, in minutes. */
  SWEEP_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(24 * 60),
  /** How often the monthly-report generator checks for month-end, in minutes. */
  MONTHLY_REPORT_CHECK_MINUTES: z.coerce.number().int().min(1).default(60),
});

function parseEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid worker environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
  }
  return parsed.data;
}

export const env = parseEnv();
export const isProduction = env.NODE_ENV === 'production';
