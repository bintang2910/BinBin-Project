import { db } from "../db/index.js";
import {
  lobbies,
  lobbyMembers,
  platformSettings,
  platformEarnings,
  user,
  lobbyMessages,
} from "../db/schema.js";
import { eq, and, desc, ilike, ne } from "drizzle-orm";
import type { LobbyMetadata } from "../db/schema.js";

/* ═══════════════════════════════════════════════════
   Lobby Service — Business Logic Layer (v3)
   - WhatsApp removed
   - Dynamic pricing (totalPrice / currentSlots)
   - Category-specific host fees
   - Chat lifecycle management
   ═══════════════════════════════════════════════════ */

type Category = "ride" | "food" | "subs";

interface CreateLobbyInput {
  hostId: string;
  title: string;
  category: Category;
  maxSlots: number;
  totalPrice: number;
  metadata?: LobbyMetadata;
  deadline?: Date;
  expiryDate?: Date;
  distributionMethod?: "pickup" | "delivery";
  meetingPoint?: string;
}

interface ListLobbiesInput {
  category?: Category;
  status?: string;
  query?: string;
  limit?: number;
  offset?: number;
}

// ─── Dynamic Fee Lookup (Category-specific) ───
const DEFAULT_FEES: Record<string, number> = {
  host_fee_ride: 2000,
  host_fee_food: 2000,
  host_fee_subs: 5000,
  member_fee: 200,
};

async function getFee(key: string): Promise<number> {
  try {
    const setting = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, key))
      .limit(1);

    if (setting.length > 0 && setting[0].value) {
      const val = setting[0].value as { amount?: number };
      if (typeof val.amount === "number") return val.amount;
    }
  } catch (err) {
    console.error(`[getFee] Failed to lookup fee for key "${key}":`, err);
  }

  return DEFAULT_FEES[key] ?? 200;
}

async function getHostFee(category: Category): Promise<number> {
  return getFee(`host_fee_${category}`);
}

async function getMemberFee(): Promise<number> {
  return getFee("member_fee");
}

// ─── Create Lobby ───
export async function createLobby(input: CreateLobbyInput) {
  // Input sanitization
  const title = input.title.trim();
  if (!title || title.length < 3) {
    throw new ServiceError("Title must be at least 3 characters.", 400);
  }
  if (input.maxSlots < 2 || input.maxSlots > 20) {
    throw new ServiceError("Max slots must be between 2 and 20.", 400);
  }
  if (input.totalPrice < 1000) {
    throw new ServiceError("Total price must be at least Rp 1.000.", 400);
  }

  // Lookup dynamic fees (category-specific)
  const hostFee = await getHostFee(input.category);
  const memberFee = await getMemberFee();
  const pricePerPerson = input.totalPrice; // Initially host pays full price (1 member = host)

  // Calculate chat expiry
  let chatExpiresAt: Date | null = null;
  if (input.category === "subs") {
    chatExpiresAt = new Date();
    chatExpiresAt.setDate(chatExpiresAt.getDate() + 30); // Subs: 30 days
  }
  // ride/food: chatExpiresAt stays null — deleted on completion

  // Insert lobby
  const [lobby] = await db
    .insert(lobbies)
    .values({
      hostId: input.hostId,
      title,
      category: input.category,
      maxSlots: input.maxSlots,
      currentSlots: 1,
      totalPrice: input.totalPrice,
      pricePerPerson,
      hostFee,
      memberFee,
      distributionMethod: input.category === "food" ? (input.distributionMethod ?? null) : null,
      meetingPoint: input.category === "food" && input.distributionMethod === "pickup"
        ? (input.meetingPoint?.trim() || null)
        : null,
      metadata: input.metadata ?? null,
      deadline: input.deadline ?? null,
      expiryDate: input.expiryDate ?? null,
      chatExpiresAt,
    })
    .returning();

  // Insert host as first member
  await db.insert(lobbyMembers).values({
    lobbyId: lobby.id,
    userId: input.hostId,
    role: "host",
    paymentStatus: "paid",
    amountPaid: hostFee,
    isArrived: false,
  });

  // Record platform earning from host fee
  await db.insert(platformEarnings).values({
    lobbyId: lobby.id,
    amount: hostFee,
    source: "host_fee",
    userId: input.hostId,
  });

  return lobby;
}

// ─── List Lobbies (Public) ───
export async function listLobbies(input: ListLobbiesInput) {
  const limit = Math.min(input.limit ?? 20, 50);
  const offset = input.offset ?? 0;

  const conditions = [];

  if (input.category) {
    conditions.push(eq(lobbies.category, input.category));
  }
  if (input.status) {
    conditions.push(eq(lobbies.status, input.status as any));
  }
  if (input.query) {
    conditions.push(ilike(lobbies.title, `%${input.query}%`));
  }
  if (!input.status) {
    conditions.push(ne(lobbies.status, "cancelled"));
  }

  const results = await db
    .select({
      id: lobbies.id,
      hostId: lobbies.hostId,
      title: lobbies.title,
      category: lobbies.category,
      status: lobbies.status,
      maxSlots: lobbies.maxSlots,
      currentSlots: lobbies.currentSlots,
      totalPrice: lobbies.totalPrice,
      pricePerPerson: lobbies.pricePerPerson,
      memberFee: lobbies.memberFee,
      metadata: lobbies.metadata,
      distributionMethod: lobbies.distributionMethod,
      meetingPoint: lobbies.meetingPoint,
      deadline: lobbies.deadline,
      expiryDate: lobbies.expiryDate,
      createdAt: lobbies.createdAt,
    })
    .from(lobbies)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(lobbies.createdAt))
    .limit(limit)
    .offset(offset);

  return results;
}

// ─── Get Lobby Detail ───
export async function getLobbyDetail(lobbyId: string, requestUserId?: string) {
  const [lobby] = await db
    .select()
    .from(lobbies)
    .where(eq(lobbies.id, lobbyId))
    .limit(1);

  if (!lobby) throw new ServiceError("Lobby not found.", 404);

  const members = await db
    .select({
      id: lobbyMembers.id,
      userId: lobbyMembers.userId,
      role: lobbyMembers.role,
      paymentStatus: lobbyMembers.paymentStatus,
      isArrived: lobbyMembers.isArrived,
      joinedAt: lobbyMembers.joinedAt,
      userName: user.name,
      userImage: user.image,
    })
    .from(lobbyMembers)
    .innerJoin(user, eq(lobbyMembers.userId, user.id))
    .where(eq(lobbyMembers.lobbyId, lobbyId))
    .orderBy(lobbyMembers.joinedAt);

  // Dynamic price calculation
  const dynamicPricePerPerson = lobby.currentSlots > 0
    ? Math.ceil(lobby.totalPrice / lobby.currentSlots)
    : lobby.totalPrice;

  return {
    ...lobby,
    pricePerPerson: dynamicPricePerPerson,
    members,
    totalToPay: dynamicPricePerPerson + lobby.memberFee,
  };
}

// ─── Join Lobby ───
export async function joinLobby(lobbyId: string, userId: string) {
  const [lobby] = await db
    .select()
    .from(lobbies)
    .where(eq(lobbies.id, lobbyId))
    .limit(1);

  if (!lobby) throw new ServiceError("Lobby not found.", 404);
  if (lobby.status !== "open")
    throw new ServiceError("This lobby is no longer accepting members.", 400);
  if (lobby.hostId === userId)
    throw new ServiceError("You are already the host of this lobby.", 400);

  const [existing] = await db
    .select()
    .from(lobbyMembers)
    .where(and(eq(lobbyMembers.lobbyId, lobbyId), eq(lobbyMembers.userId, userId)))
    .limit(1);

  if (existing) throw new ServiceError("You have already joined this lobby.", 409);
  if (lobby.currentSlots >= lobby.maxSlots)
    throw new ServiceError("This lobby is full.", 400);

  // Insert member with escrow payment status
  await db.insert(lobbyMembers).values({
    lobbyId,
    userId,
    role: "member",
    paymentStatus: "escrow",
    amountPaid: lobby.memberFee,
    isArrived: false,
  });

  // Record platform earning from member fee
  await db.insert(platformEarnings).values({
    lobbyId,
    amount: lobby.memberFee,
    source: "member_fee",
    userId,
  });

  // Update slot count + status + dynamic price
  const newSlots = lobby.currentSlots + 1;
  const newStatus = newSlots >= lobby.maxSlots ? "full" : "open";
  const newPricePerPerson = Math.ceil(lobby.totalPrice / newSlots);

  await db
    .update(lobbies)
    .set({
      currentSlots: newSlots,
      status: newStatus as any,
      pricePerPerson: newPricePerPerson,
      updatedAt: new Date(),
    })
    .where(eq(lobbies.id, lobbyId));

  return getLobbyDetail(lobbyId, userId);
}

// ─── Finalize Lobby (Timer Expired) ───
export async function finalizeLobby(lobbyId: string) {
  const [lobby] = await db
    .select()
    .from(lobbies)
    .where(eq(lobbies.id, lobbyId))
    .limit(1);

  if (!lobby) throw new ServiceError("Lobby not found.", 404);
  if (lobby.status === "completed" || lobby.status === "expired") {
    throw new ServiceError("Lobby already finalized.", 400);
  }

  const finalPrice = Math.ceil(lobby.totalPrice / lobby.currentSlots);

  // Update lobby to completed
  await db
    .update(lobbies)
    .set({
      status: "completed",
      pricePerPerson: finalPrice,
      updatedAt: new Date(),
    })
    .where(eq(lobbies.id, lobbyId));

  // Release escrow → paid for all members
  await db
    .update(lobbyMembers)
    .set({ paymentStatus: "paid" })
    .where(
      and(
        eq(lobbyMembers.lobbyId, lobbyId),
        eq(lobbyMembers.paymentStatus, "escrow")
      )
    );

  return {
    finalized: true,
    finalPricePerPerson: finalPrice,
    totalMembers: lobby.currentSlots,
  };
}

// ─── Get Lobby Chat (Requires membership + payment) ───
export async function getLobbyChat(lobbyId: string, requestUserId: string) {
  // Verify membership and payment status
  const [member] = await db
    .select()
    .from(lobbyMembers)
    .where(and(eq(lobbyMembers.lobbyId, lobbyId), eq(lobbyMembers.userId, requestUserId)))
    .limit(1);

  if (!member) throw new ServiceError("Only members can view the chat.", 403);
  if (member.paymentStatus !== "paid" && member.paymentStatus !== "escrow") {
    throw new ServiceError("You must join and pay to access the chat.", 403);
  }

  // Check if chat is deleted/expired
  const [lobby] = await db
    .select({ chatDeletedAt: lobbies.chatDeletedAt })
    .from(lobbies)
    .where(eq(lobbies.id, lobbyId))
    .limit(1);

  if (lobby?.chatDeletedAt) {
    throw new ServiceError("This group chat has expired and been deleted.", 410);
  }

  // Fetch messages with user info
  const messages = await db
    .select({
      id: lobbyMessages.id,
      lobbyId: lobbyMessages.lobbyId,
      userId: lobbyMessages.userId,
      content: lobbyMessages.content,
      createdAt: lobbyMessages.createdAt,
      user: {
        id: user.id,
        name: user.name,
        image: user.image,
      },
    })
    .from(lobbyMessages)
    .innerJoin(user, eq(lobbyMessages.userId, user.id))
    .where(eq(lobbyMessages.lobbyId, lobbyId))
    .orderBy(lobbyMessages.createdAt);

  return messages;
}

// ─── Mark Arrived (Ride) ───
export async function markArrived(lobbyId: string, userId: string) {
  const [member] = await db
    .select()
    .from(lobbyMembers)
    .where(and(eq(lobbyMembers.lobbyId, lobbyId), eq(lobbyMembers.userId, userId)))
    .limit(1);

  if (!member) throw new ServiceError("You are not a member of this lobby.", 404);
  if (member.isArrived) throw new ServiceError("Already marked as arrived.", 400);

  await db
    .update(lobbyMembers)
    .set({ isArrived: true })
    .where(eq(lobbyMembers.id, member.id));

  // Check if ALL members arrived → complete the lobby
  const allMembers = await db
    .select()
    .from(lobbyMembers)
    .where(eq(lobbyMembers.lobbyId, lobbyId));

  const allArrived = allMembers.every((m) => m.isArrived || m.userId === userId);

  if (allArrived) {
    await db
      .update(lobbies)
      .set({
        status: "completed",
        chatDeletedAt: new Date(), // Delete chat on completion for ride/food
        updatedAt: new Date(),
      })
      .where(eq(lobbies.id, lobbyId));

    // Release escrow → paid
    await db
      .update(lobbyMembers)
      .set({ paymentStatus: "paid" })
      .where(and(eq(lobbyMembers.lobbyId, lobbyId), eq(lobbyMembers.paymentStatus, "escrow")));
  }

  return { arrived: true, lobbyCompleted: allArrived };
}

// ─── My Lobbies ───
export async function getMyLobbies(userId: string, status?: "active" | "completed") {
  const memberLobbies = await db
    .select({
      id: lobbies.id,
      title: lobbies.title,
      category: lobbies.category,
      status: lobbies.status,
      maxSlots: lobbies.maxSlots,
      currentSlots: lobbies.currentSlots,
      totalPrice: lobbies.totalPrice,
      pricePerPerson: lobbies.pricePerPerson,
      memberFee: lobbies.memberFee,
      metadata: lobbies.metadata,
      distributionMethod: lobbies.distributionMethod,
      deadline: lobbies.deadline,
      expiryDate: lobbies.expiryDate,
      createdAt: lobbies.createdAt,
      role: lobbyMembers.role,
      paymentStatus: lobbyMembers.paymentStatus,
      isArrived: lobbyMembers.isArrived,
      joinedAt: lobbyMembers.joinedAt,
    })
    .from(lobbyMembers)
    .innerJoin(lobbies, eq(lobbyMembers.lobbyId, lobbies.id))
    .where(eq(lobbyMembers.userId, userId))
    .orderBy(desc(lobbies.createdAt));

  if (status === "active") {
    return memberLobbies.filter((l) => l.status === "open" || l.status === "full");
  }
  if (status === "completed") {
    return memberLobbies.filter((l) => l.status === "completed" || l.status === "expired");
  }
  return memberLobbies;
}

// ─── Get Platform Fees ───
export async function getPlatformFees() {
  const fees = await db.select().from(platformSettings);
  const result: Record<string, any> = {};
  for (const f of fees) {
    result[f.key] = f.value;
  }
  if (!result["host_fee_ride"]) result["host_fee_ride"] = { amount: 2000, currency: "IDR" };
  if (!result["host_fee_food"]) result["host_fee_food"] = { amount: 2000, currency: "IDR" };
  if (!result["host_fee_subs"]) result["host_fee_subs"] = { amount: 5000, currency: "IDR" };
  if (!result["member_fee"]) result["member_fee"] = { amount: 200, currency: "IDR" };
  return result;
}

/* ═══════════════════════════════════════════════════
   Custom Error
   ═══════════════════════════════════════════════════ */

export class ServiceError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ServiceError";
    this.statusCode = statusCode;
  }
}
