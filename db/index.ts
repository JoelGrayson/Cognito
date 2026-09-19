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
    max: 5,
    idle_timeout: 20,
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
