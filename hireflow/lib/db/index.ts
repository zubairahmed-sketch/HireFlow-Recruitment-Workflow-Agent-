/**
 * Neon database client with Drizzle ORM.
 * Replaces the old Supabase client (lib/supabase/client.ts and server.ts).
 *
 * Single serverless connection — works in both server components and API routes.
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add your Neon connection string to .env.local'
    );
  }
  return url;
}

/**
 * Get a Drizzle database client.
 * Uses Neon's HTTP driver for serverless compatibility.
 */
export function getDb() {
  const sql = neon(getDatabaseUrl());
  return drizzle(sql, { schema });
}

/** Type helper for the database client */
export type Database = ReturnType<typeof getDb>;
