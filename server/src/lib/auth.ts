import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.js";

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET environment variable is required");
}

const isProduction = process.env.NODE_ENV === "production";

// Detect production URL from various hosting platforms
const productionUrl = process.env.BETTER_AUTH_URL
  || process.env.RENDER_EXTERNAL_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);

// Build trusted origins dynamically
const trustedOrigins: string[] = [
  "http://localhost:8080",
  "http://localhost:3001",
  "http://127.0.0.1:8080",
];

// Add local network IPs for dev
if (!isProduction) {
  trustedOrigins.push(
    "http://192.168.110.111:8080",
    "http://192.168.110.111:52998",
    "http://192.168.110.111:3001"
  );
}

// Add production URL
if (productionUrl) {
  trustedOrigins.push(productionUrl);
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),

  // Base URL for auth endpoints
  baseURL: productionUrl || "http://localhost:3001",

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

  trustedOrigins,

  // Advanced cookie settings
  advanced: {
    crossSubDomainCookies: {
      enabled: false,
    },
    defaultCookieAttributes: {
      sameSite: "lax",   // Same-origin: frontend served by same Express server
      secure: isProduction,
      path: "/",
    },
  },
});

export type Auth = typeof auth;
