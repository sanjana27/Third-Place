import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import type { Config } from './config.js';

export type Db = Pool | PoolClient;

export async function connectDatabase(config: Pick<Config, 'DATABASE_URL' | 'INSTANCE_CONNECTION_NAME' | 'DB_NAME' | 'DB_USER' | 'DB_PASSWORD'>) {
  let connector: Connector | undefined;
  let options: PoolConfig;
  if (config.DATABASE_URL) {
    options = { connectionString: config.DATABASE_URL };
  } else if (config.INSTANCE_CONNECTION_NAME && config.DB_PASSWORD) {
    connector = new Connector();
    const connectionOptions = await connector.getOptions({
      instanceConnectionName: config.INSTANCE_CONNECTION_NAME,
      ipType: IpAddressTypes.PUBLIC,
    });
    options = { ...connectionOptions, user: config.DB_USER, password: config.DB_PASSWORD, database: config.DB_NAME };
  } else {
    throw new Error('No PostgreSQL connection is configured.');
  }
  const pool = new Pool({
    ...options,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    statement_timeout: 20_000,
    options: '-c search_path=third_place,public',
  });
  pool.on('error', (error) => {
    console.error(JSON.stringify({ event: 'database_pool_error', code: error.name }));
  });
  await pool.query('SELECT 1');
  return {
    pool,
    async close() { await pool.end(); await connector?.close(); },
  };
}

export async function transaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch { console.error(JSON.stringify({ event: 'database_rollback_failed' })); }
    throw error;
  } finally {
    client.release();
  }
}

export async function migrate(pool: Pool) {
  const sql = await readFile(resolve('database', 'schema.sql'), 'utf8');
  await transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [734_190_201]);
    await client.query(sql);
  });
}
