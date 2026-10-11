import { loadConfig } from './config.js';
import { connectDatabase, migrate } from './db.js';

const db = await connectDatabase(loadConfig());
try {
  await migrate(db.pool);
  console.log('Third Place PostgreSQL schema is ready.');
} finally {
  await db.close();
}
