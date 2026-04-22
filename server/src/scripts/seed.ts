import { db } from "../db/index.js";
import { platformSettings } from "../db/schema.js";

/**
 * Seed script: Insert default platform settings.
 * Run with: npx tsx src/scripts/seed.ts
 */
async function seed() {
  console.log("🌱 Seeding platform settings...");

  const defaults = [
    {
      key: "host_fee",
      value: { amount: 3000, currency: "IDR" },
      description: "Admin fee charged to host when creating a lobby",
    },
    {
      key: "member_fee",
      value: { amount: 2000, currency: "IDR" },
      description: "Admin fee charged to each member when joining a lobby",
    },
  ];

  for (const setting of defaults) {
    await db
      .insert(platformSettings)
      .values(setting)
      .onConflictDoNothing({ target: platformSettings.key });
    console.log(`  ✅ ${setting.key}: Rp ${(setting.value as any).amount}`);
  }

  console.log("\n🎉 Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
