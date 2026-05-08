import { db } from "../db/index.js";
import { lobbies, lobbyMembers, lobbyMessages, platformEarnings } from "../db/schema.js";

/**
 * Cleanup script: Delete ALL lobbies, members, messages, and earnings.
 * This gives a clean slate so only real user-created groups appear.
 * Run with: npx tsx src/scripts/cleanup-all-lobbies.ts
 */
async function cleanup() {
  console.log("🧹 Cleaning up ALL lobby data...");

  // Delete in correct order (foreign key constraints)
  const msgResult = await db.delete(lobbyMessages);
  console.log("  ✅ Deleted all lobby messages");

  const memberResult = await db.delete(lobbyMembers);
  console.log("  ✅ Deleted all lobby members");

  const earningResult = await db.delete(platformEarnings);
  console.log("  ✅ Deleted all platform earnings");

  const lobbyResult = await db.delete(lobbies);
  console.log("  ✅ Deleted all lobbies");

  console.log("\n🎉 Database cleaned! Only real user-created groups will appear now.");
  process.exit(0);
}

cleanup().catch((err) => {
  console.error("❌ Cleanup failed:", err);
  process.exit(1);
});
