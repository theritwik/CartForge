import { migrateTestDatabase, resolveTestDatabaseUrl } from '../src/testing.js';

export default function setup(): void {
  migrateTestDatabase(resolveTestDatabaseUrl(process.env));
}
