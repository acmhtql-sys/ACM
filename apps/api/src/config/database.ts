import { PrismaClient } from '@prisma/client';
import { env } from './env';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: env.DATABASE_URL,
      },
    },
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export async function checkDatabaseConnection(): Promise<{
  connected: boolean;
  database?: string;
  error?: string;
}> {
  try {
    const result: any = await prisma.$queryRaw`SELECT current_database() as db;`;
    const database = result[0]?.db;
    return { connected: true, database };
  } catch (err: any) {
    return { connected: false, error: err.message };
  }
}
