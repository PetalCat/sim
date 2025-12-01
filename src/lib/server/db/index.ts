import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';

if (!building && !env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const url = building ? ':memory:' : env.DATABASE_URL || 'file:local.db';
const client = createClient({ url });

export const db = drizzle(client, { schema });
