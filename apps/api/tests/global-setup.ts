import { migrateTestDatabase, resolveTestDatabaseUrl } from '@cartforge/db/testing';

export default function setup(): void {
  migrateTestDatabase(resolveTestDatabaseUrl(process.env));
}
