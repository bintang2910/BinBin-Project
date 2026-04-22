import { db } from "../db/index.js";
import { lobbies, lobbyMembers, user, platformEarnings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { createLobby } from "../services/lobby.service.js";

async function simulate() {
  console.log("🚀 Starting simulation...");

  // 1. Find Yudi's user account
  const users = await db.select().from(user).where(eq(user.email, "yudi@test.com")).limit(1);
  if (users.length === 0) {
    console.error("❌ User Yudi not found! Please register via the UI first.");
    process.exit(1);
  }
  
  const yudi = users[0];
  console.log(`👤 Found Yudi: ${yudi.id}`);

  // 2. Clear existing lobbies for testing purposes (optional but good for clean slate)
  await db.delete(lobbies);
  console.log("🧹 Cleared old lobbies.");

  // 3. Create 3 Lobbies
  console.log("🔨 Creating 3 Lobbies...");

  const now = new Date();
  
  // 3.1 Ride Lobby: Grab to Sudirman
  await createLobby({
    hostId: yudi.id,
    title: "Grab to Sudirman",
    category: "ride",
    maxSlots: 5,
    totalPrice: 45000, // 45k total -> 9k per person + fee
    deadline: new Date(now.getTime() + 15 * 60000), // 15 mins
    metadata: {
      pickupLocation: "Senayan",
      dropoffLocation: "Sudirman",
      departureTime: new Date(now.getTime() + 15 * 60000).toISOString()
    }
  });
  console.log("  ✅ Ride Lobby created");

  // 3.2 Digital Subs Lobby: Netflix Premium
  await createLobby({
    hostId: yudi.id,
    title: "Netflix Premium",
    category: "subs",
    maxSlots: 5,
    totalPrice: 180000, 
    expiryDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
    metadata: {
      serviceName: "Netflix",
      duration: "1 Month"
    }
  });
  console.log("  ✅ Subs Lobby created");

  // 3.3 Food Lobby: McD Bundle
  await createLobby({
    hostId: yudi.id,
    title: "McD Bundle Order",
    category: "food",
    maxSlots: 10,
    totalPrice: 250000,
    distributionMethod: "pickup",
    meetingPoint: "McDonald's Senayan City, Lantai 1",
    deadline: new Date(now.getTime() + 30 * 60000), // 30 mins
    metadata: {
      restaurantName: "McDonald's Senayan",
      distributionMethod: "pickup",
      meetingPoint: "McDonald's Senayan City, Lantai 1",
    }
  });
  console.log("  ✅ Food Lobby created");

  console.log("🎉 Simulation complete!");
  process.exit(0);
}

simulate().catch((err) => {
  console.error("❌ Simulation failed:", err);
  process.exit(1);
});
