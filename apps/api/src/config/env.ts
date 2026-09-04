import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// The monorepo keeps one .env at the root; load it before validating.
loadEnv({ path: path.resolve(__dirname, '../../../../.env') });

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : v === 'true' || v === '1'));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  COOKIE_SECRET: z.string().min(16),
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: bool(false),

  ENCRYPTION_KEY: z.string().min(16, 'ENCRYPTION_KEY must be a base64 32-byte key'),

  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_TRANSCRIBE_MODEL: z.string().default('whisper-1'),
  OPENAI_TTS_MODEL: z.string().default('gpt-4o-mini-tts'),
  OPENAI_TTS_VOICE: z.string().default('alloy'),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1000).default(45_000),

  WHATSAPP_PROVIDER: z.enum(['meta', 'twilio', 'mock']).default('mock'),
  WHATSAPP_VERIFY_TOKEN: z.string().default('flowmoney_verify_token'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
  WHATSAPP_APP_SECRET: z.string().optional().default(''),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  TWILIO_ACCOUNT_SID: z.string().optional().default(''),
  TWILIO_AUTH_TOKEN: z.string().optional().default(''),
  TWILIO_WHATSAPP_FROM: z.string().optional().default(''),

  VOICE_PROVIDER: z.enum(['mock', 'twilio']).default('mock'),
  VOICE_REPLY_ENABLED: bool(true),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage'),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('flowmoney'),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_FORCE_PATH_STYLE: bool(true),

  BANKING_PROVIDER: z.enum(['mock']).default('mock'),
  PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),

  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // Fail fast and loudly: a misconfigured secret is a security problem, not a
    // runtime inconvenience.
    throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
  }
  return parsed.data;
}

export const env = parseEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/** True when a real OpenAI key is configured; otherwise the deterministic
 *  offline renderer is used so the platform still works end to end. */
export const hasOpenAI = env.OPENAI_API_KEY.trim().length > 0;
