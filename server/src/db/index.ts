import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Connection pool — Neon serverless friendly
const client = postgres(process.env.DATABASE_URL, {
  max: 10,                 // max connections
  idle_timeout: 20,        // close idle connections after 20s
  connect_timeout: 10,     // timeout after 10s
  ssl: "require",          // Neon requires SSL
});

export const db = drizzle(client, { schema });

export type Database = typeof db;
