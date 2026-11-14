import { createPrismaClient } from '../src/index.js';
import { seedCatalog } from './seed-catalog.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The seed script is for development data and must not run in production.');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set. See .env.example.');
}

const prisma = createPrismaClient(databaseUrl);
try {
  const summary = await seedCatalog(prisma);
  console.log(
    `Seeded ${summary.categories} categories, ${summary.products} products, ${summary.images} product images.`,
  );
} finally {
  await prisma.$disconnect();
}
