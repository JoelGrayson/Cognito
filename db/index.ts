import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required. Set the Supabase Postgres connection string in .env.local.");
  }

  const client = postgres(url, {
    prepare: false, // Supabase transaction pooling does not support prepared statements.
    // The schema uses only built-in types, so skip the pg_type lookup every new connection makes.
    fetch_types: false,
    max: 5,
    // A remote database costs a TLS handshake per connection; keep warm ones around between requests.
    idle_timeout: 120,
    connect_timeout: 10,
  });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;
const globalForDb = globalThis as typeof globalThis & { learningDb?: Database };
let database: Database | undefined;

/** Lazy connection; reuse the pool across Next.js development hot reloads. */
export function getDb(): Database {
  if (database) return database;
  database = globalForDb.learningDb ?? createDb();
  if (process.env.NODE_ENV !== "production") globalForDb.learningDb = database;
  return database;
}
