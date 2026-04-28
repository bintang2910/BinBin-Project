import { db } from "./src/db/index.js";
import { lobbies, user } from "./src/db/schema.js";

async function run() {
  const allLobbies = await db.select().from(lobbies).limit(5);
  console.log("Lobbies:", allLobbies);

  const users = await db.select().from(user).limit(5);
  console.log("Users:", users);

  process.exit(0);
}
run();
