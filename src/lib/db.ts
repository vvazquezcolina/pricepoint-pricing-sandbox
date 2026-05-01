/**
 * Prisma client singleton.
 *
 * Why singleton: in dev (and serverless cold starts), Prisma can spawn
 * multiple connections per hot reload if not memoized. The `globalThis`
 * pattern is the documented way to avoid that.
 *
 * Why /tmp on Vercel: the function bundle ships the seeded `prisma/dev.db`
 * read-only. SQLite needs a writable location for its journal/WAL files even
 * for read queries. We copy the bundled file to /tmp on cold start (where
 * Vercel allows writes) and point Prisma at the warm copy.
 */

import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import fs from 'node:fs';

function resolveDbUrl(): string {
  // Local / non-Vercel: respect whatever DATABASE_URL the env provides
  if (!process.env.VERCEL) {
    return process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  }

  // On Vercel: copy the bundled DB to /tmp once per cold start
  const bundled = path.join(process.cwd(), 'prisma', 'dev.db');
  const warm = '/tmp/dev.db';
  try {
    if (!fs.existsSync(warm)) {
      fs.copyFileSync(bundled, warm);
    }
  } catch (err) {
    console.error('Failed to stage SQLite DB to /tmp:', err);
  }
  return `file:${warm}`;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: resolveDbUrl() } },
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
