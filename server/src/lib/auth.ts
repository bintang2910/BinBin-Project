import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.js";

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET environment variable is required");
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),

  // Base URL for auth endpoints
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3001",

  // Auth secret for signing tokens
  secret: process.env.BETTER_AUTH_SECRET,

  // Email & Password auth
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
  },

  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 7,       // 7 days
    updateAge: 60 * 60 * 24,             // refresh every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,                    // 5 minute client cache
    },
  },

  // Trusted origins — allow all local network IPs
  trustedOrigins: [
    "http://localhost:8080",
    "http://localhost:3001",
    "http://127.0.0.1:8080",
    "http://192.168.110.111:8080",
    "http://192.168.110.111:52998",
    "http://192.168.110.111:3001",
  ],

  // Advanced: allow any origin dynamically
  advanced: {
    crossSubDomainCookies: {
      enabled: false,
    },
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: false,    // Not using HTTPS in dev
      path: "/",
    },
  },
});

export type Auth = typeof auth;
