/* ═══════════════════════════════════════════════════
   Cleanup Script — Delete ALL Test Lobbies
   Run: npx tsx src/scripts/cleanup-lobbies.ts
   ═══════════════════════════════════════════════════ */

import "dotenv/config";
import { db } from "../db/index.js";
import { lobbies, lobbyMembers, lobbyMessages, platformEarnings } from "../db/schema.js";
import { sql } from "drizzle-orm";

async function cleanup() {
  console.log("🧹 Starting cleanup...\n");

  // 1. Delete all chat messages
  const msgs = await db.delete(lobbyMessages).returning({ id: lobbyMessages.id });
  console.log(`  ✅ Deleted ${msgs.length} chat messages`);

  // 2. Delete all lobby members
  const members = await db.delete(lobbyMembers).returning({ id: lobbyMembers.id });
  console.log(`  ✅ Deleted ${members.length} lobby members`);

  // 3. Delete all platform earnings
  const earnings = await db.delete(platformEarnings).returning({ id: platformEarnings.id });
  console.log(`  ✅ Deleted ${earnings.length} platform earnings`);

  // 4. Delete all lobbies
  const lobs = await db.delete(lobbies).returning({ id: lobbies.id, title: lobbies.title });
  console.log(`  ✅ Deleted ${lobs.length} lobbies`);

  if (lobs.length > 0) {
    console.log("\n  Deleted rooms:");
    lobs.forEach(l => console.log(`    - ${l.title}`));
  }

  console.log("\n🎉 All test data cleaned up! Database is fresh.");
  process.exit(0);
}

cleanup().catch(err => {
  console.error("❌ Cleanup failed:", err);
  process.exit(1);
});
