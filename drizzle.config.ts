import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
  // Generation/checking works offline; connected commands require a URL.
  ...(url ? { dbCredentials: { url } } : {}),
  strict: true,
  verbose: true,
});
