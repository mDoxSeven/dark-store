import { PrismaClient } from '@prisma/client';
import { DATABASE_URL } from './paths.js';
export const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });
