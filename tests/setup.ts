import app from '../src/app.js';
import { runMigrations } from '../src/database/migrations.js';
import { runSeed } from '../src/database/seed.js';
import { closeDatabase } from '../src/database/connection.js';

beforeAll(async () => {
  await runMigrations();
  await runSeed();
});

afterAll(async () => {
  await closeDatabase();
});

export { app };
