import "dotenv/config";
import postgres from "postgres";

/**
 * BinBin v3 Migration Script
 * - Drop whatsapp_link column
 * - Add distribution_method enum + column
 * - Add meeting_point column
 * - Add chat_expires_at, chat_deleted_at columns
 * - Update default fees
 */

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { ssl: "require" });

async function migrate() {
  console.log("🔄 Running BinBin v3 migration...\n");

  // 1. Create distribution_method enum (if not exists)
  try {
    await sql`CREATE TYPE distribution_method AS ENUM ('pickup', 'delivery')`;
    console.log("  ✅ Created enum: distribution_method");
  } catch (e: any) {
    if (e.message?.includes("already exists")) {
      console.log("  ⏭️  Enum distribution_method already exists, skipping");
    } else {
      throw e;
    }
  }

  // 2. Drop whatsapp_link column (if exists)
  try {
    await sql`ALTER TABLE lobbies DROP COLUMN IF EXISTS whatsapp_link`;
    console.log("  ✅ Dropped column: whatsapp_link");
  } catch (e: any) {
    console.log("  ⚠️  whatsapp_link drop error:", e.message);
  }

  // 3. Add distribution_method column
  try {
    await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS distribution_method distribution_method`;
    console.log("  ✅ Added column: distribution_method");
  } catch (e: any) {
    console.log("  ⚠️  distribution_method add error:", e.message);
  }

  // 4. Add meeting_point column
  try {
    await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS meeting_point text`;
    console.log("  ✅ Added column: meeting_point");
  } catch (e: any) {
    console.log("  ⚠️  meeting_point add error:", e.message);
  }

  // 5. Add chat_expires_at column
  try {
    await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS chat_expires_at timestamp`;
    console.log("  ✅ Added column: chat_expires_at");
  } catch (e: any) {
    console.log("  ⚠️  chat_expires_at add error:", e.message);
  }

  // 6. Add chat_deleted_at column
  try {
    await sql`ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS chat_deleted_at timestamp`;
    console.log("  ✅ Added column: chat_deleted_at");
  } catch (e: any) {
    console.log("  ⚠️  chat_deleted_at add error:", e.message);
  }

  // 7. Update default fee values
  try {
    await sql`ALTER TABLE lobbies ALTER COLUMN host_fee SET DEFAULT 2000`;
    await sql`ALTER TABLE lobbies ALTER COLUMN member_fee SET DEFAULT 200`;
    console.log("  ✅ Updated default fees: host=2000, member=200");
  } catch (e: any) {
    console.log("  ⚠️  Fee default update error:", e.message);
  }

  console.log("\n🎉 Migration complete!");
  await sql.end();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
