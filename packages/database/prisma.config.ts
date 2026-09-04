import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// The monorepo keeps a single .env at the repo root; Prisma's CLI would
// otherwise only look inside this package.
loadEnv({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
