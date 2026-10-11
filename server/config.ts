import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  NODE_ENV: z.string().default('development'),
  DEMO_ENABLED: z.enum(['true', 'false']).default('false'),
  MIGRATE_ON_START: z.enum(['true', 'false']).default('true'),
  DATABASE_URL: z.string().min(1).optional(),
  INSTANCE_CONNECTION_NAME: z.string().min(1).optional(),
  DB_NAME: z.string().default('third_place'),
  DB_USER: z.string().default('third_place'),
  DB_PASSWORD: z.string().optional(),
  GOOGLE_CLOUD_PROJECT: z.string().min(1),
  GOOGLE_CLOUD_LOCATION: z.string().min(1),
  GEMINI_MODEL: z.string().min(1),
}).refine((v) => Boolean(v.DATABASE_URL) || Boolean(v.INSTANCE_CONNECTION_NAME && v.DB_PASSWORD), {
  message: 'Configure DATABASE_URL or INSTANCE_CONNECTION_NAME with DB_PASSWORD. A real PostgreSQL database is required.',
});

export function loadConfig() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ''));
  const result = schema.safeParse(env);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => `${issue.path.join('.') || 'database'}: ${issue.message}`);
    throw new Error(`Configuration is incomplete. ${fields.join('; ')}. See .env.example; no mock services are substituted.`);
  }
  return result.data;
}
export type Config = ReturnType<typeof loadConfig>;
