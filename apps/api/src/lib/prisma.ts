import { createPrismaClient } from '@cartforge/db';
import { env } from '../config/env.js';

export const prisma = createPrismaClient(env.DATABASE_URL);
