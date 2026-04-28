import { db } from "../db/index.js";
import {
  lobbies,
  lobbyMembers,
  platformSettings,
  platformEarnings,
  user,
  lobbyMessages,
  walletTransactions,
} from "../db/schema.js";
import { eq, and, desc, ilike, ne, lt, sql, or, inArray, isNotNull } from "drizzle-orm";
import type { LobbyMetadata } from "../db/schema.js";

/* ═══════════════════════════════════════════════════
   Lobby Service — Business Logic Layer (v3)
   - WhatsApp removed
   - Dynamic pricing (totalPrice / currentSlots)
   - Category-specific host fees
   - Chat lifecycle management
   ═══════════════════════════════════════════════════ */

type Category = "ride" | "food" | "subs" | "event";

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
  host_fee_ride: 1000,
  host_fee_food: 1000,
  host_fee_subs: 2000,
  host_fee_event: 1000,
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
  if (input.maxSlots < 2 || input.maxSlots > 50) {
    throw new ServiceError("Max slots must be between 2 and 50.", 400);
  }
  if (input.totalPrice < 1000) {
    throw new ServiceError("Total price must be at least Rp 1.000.", 400);
  }

  // Lookup dynamic fees (category-specific)
  const hostFee = await getHostFee(input.category);
  const memberFee = await getMemberFee();
  const pricePerPerson = input.totalPrice; // Initially host pays full price (1 member = host)

  // ─── Check Host Balance ───
  const [hostUser] = await db
    .select({ balance: user.balance })
    .from(user)
    .where(eq(user.id, input.hostId))
    .limit(1);

  if (!hostUser) throw new ServiceError("User not found.", 404);
  if (hostUser.balance < hostFee) {
    throw new ServiceError(
      `Saldo tidak cukup! Butuh Rp ${hostFee.toLocaleString("id-ID")} untuk biaya host. Saldo kamu: Rp ${hostUser.balance.toLocaleString("id-ID")}. Silakan top up dulu.`,
      402,
      "INSUFFICIENT_BALANCE"
    );
  }

  // ─── Deduct Host Fee from Balance ───
  await db
    .update(user)
    .set({ balance: sql`${user.balance} - ${hostFee}` })
    .where(eq(user.id, input.hostId));

  await db.insert(walletTransactions).values({
    userId: input.hostId,
    amount: -hostFee,
    type: "payment",
    description: `Biaya Host untuk pembuatan Room ${input.category.toUpperCase()}`,
  });

  // Calculate chat expiry
  let chatExpiresAt: Date | null = null;
  if (input.category === "subs") {
    chatExpiresAt = new Date();
    chatExpiresAt.setDate(chatExpiresAt.getDate() + 30); // Subs: 30 days
  } else if (input.category === "event") {
    chatExpiresAt = new Date();
    chatExpiresAt.setDate(chatExpiresAt.getDate() + 7); // Event: 7 days after event
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

// ─── Auto-Expire Old Lobbies ───
// Called periodically to mark lobbies as expired when deadline has passed

export async function expireOldLobbies() {
  const now = new Date();
  try {
    // 1. Expire lobbies that missed their deadline
    const expiredResult = await db
      .update(lobbies)
      .set({ status: "expired", updatedAt: now })
      .where(
        and(
          or(eq(lobbies.status, "open"), eq(lobbies.status, "full")),
          lt(lobbies.deadline, now)
        )
      )
      .returning({ id: lobbies.id, title: lobbies.title });

    if (expiredResult.length > 0) {
      console.log(`[Auto-Expire] ⏰ Expired ${expiredResult.length} lobbies:`, expiredResult.map(l => l.title).join(", "));
    }

    // 2. Auto-complete lobbies that were marked arrived by host and timeout passed
    const autoCompleteLobbies = await db
      .select({ id: lobbies.id, title: lobbies.title })
      .from(lobbies)
      .where(
        and(
          ne(lobbies.status, "completed"),
          ne(lobbies.status, "cancelled"),
          isNotNull(lobbies.autoCompleteAt),
          lt(lobbies.autoCompleteAt, now)
        )
      );

    for (const l of autoCompleteLobbies) {
      try {
        await finalizeLobby(l.id);
        console.log(`[Auto-Complete] ✅ Auto-completed lobby: ${l.title}`);
      } catch (err) {
        console.error(`[Auto-Complete] Error finalizing ${l.id}:`, err);
      }
    }

    return expiredResult;
  } catch (err) {
    console.error("[Auto-Expire] Error:", err);
    return [];
  }
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
  // Default: hide cancelled AND expired lobbies from public view
  if (!input.status) {
    conditions.push(ne(lobbies.status, "cancelled"));
    conditions.push(ne(lobbies.status, "expired"));
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

  // ─── Calculate Dynamic Pricing ───
  const newSlots = lobby.currentSlots + 1;
  const newPricePerPerson = Math.ceil(lobby.totalPrice / newSlots);
  const totalCost = newPricePerPerson + lobby.memberFee; // Split price + Admin fee to join

  // ─── Check Member Balance ───
  const [memberUser] = await db
    .select({ balance: user.balance })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!memberUser) throw new ServiceError("User not found.", 404);
  if (memberUser.balance < totalCost) {
    throw new ServiceError(
      `Saldo tidak cukup! Butuh Rp ${totalCost.toLocaleString("id-ID")} (Rp ${newPricePerPerson.toLocaleString("id-ID")} patungan + Rp ${lobby.memberFee.toLocaleString("id-ID")} admin). Saldo kamu: Rp ${memberUser.balance.toLocaleString("id-ID")}. Silakan top up dulu!`,
      402,
      "INSUFFICIENT_BALANCE"
    );
  }

  // ─── Deduct Fee and Escrow from Balance ───
  await db
    .update(user)
    .set({ balance: sql`${user.balance} - ${totalCost}` })
    .where(eq(user.id, userId));

  await db.insert(walletTransactions).values({
    userId,
    amount: -totalCost,
    type: "payment",
    description: `Patungan Room ${lobby.category.toUpperCase()} (Rp ${newPricePerPerson.toLocaleString("id-ID")}) + Admin (Rp ${lobby.memberFee.toLocaleString("id-ID")})`,
  });

  // Insert member with escrow payment status
  await db.insert(lobbyMembers).values({
    lobbyId,
    userId,
    role: "member",
    paymentStatus: "escrow",
    amountPaid: newPricePerPerson, // We only escrow the patungan price, admin fee goes to platform
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
  const newStatus = newSlots >= lobby.maxSlots ? "full" : "open";

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

// ─── Lock Lobby (Host only) ───
export async function lockLobby(lobbyId: string, userId: string) {
  const [lobby] = await db
    .select()
    .from(lobbies)
    .where(eq(lobbies.id, lobbyId))
    .limit(1);

  if (!lobby) throw new ServiceError("Lobby not found.", 404);
  if (lobby.hostId !== userId)
    throw new ServiceError("Only the host can lock the lobby.", 403);
  if (lobby.status !== "open")
    throw new ServiceError(`Cannot lock a lobby that is ${lobby.status}.`, 400);

  // Dynamic price is already handled automatically during finalize,
  // but let's make sure pricePerPerson is calculated based on currentSlots
  const newPricePerPerson = Math.ceil(lobby.totalPrice / lobby.currentSlots);

  await db
    .update(lobbies)
    .set({
      status: "full",
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

  // ─── Refund Members & Transfer to Host ───
  const membersInEscrow = await db
    .select()
    .from(lobbyMembers)
    .where(
      and(
        eq(lobbyMembers.lobbyId, lobbyId),
        eq(lobbyMembers.paymentStatus, "escrow"),
        eq(lobbyMembers.role, "member")
      )
    );

  let totalHostPayout = 0;

  for (const m of membersInEscrow) {
    const refundAmount = (m.amountPaid || 0) - finalPrice;
    
    // 1. Process Refund for member if any
    if (refundAmount > 0) {
      await db
        .update(user)
        .set({ balance: sql`${user.balance} + ${refundAmount}` })
        .where(eq(user.id, m.userId));

      await db.insert(walletTransactions).values({
        userId: m.userId,
        amount: refundAmount,
        type: "refund",
        description: `Pengembalian dana (Refund) patungan Room ${lobby.category.toUpperCase()} karena kuota bertambah`,
      });
    }
    
    // 2. Mark member as paid
    await db
      .update(lobbyMembers)
      .set({ paymentStatus: "paid" })
      .where(eq(lobbyMembers.id, m.id));

    totalHostPayout += finalPrice;
  }

  // 3. Payout to Host
  if (totalHostPayout > 0) {
    await db
      .update(user)
      .set({ balance: sql`${user.balance} + ${totalHostPayout}` })
      .where(eq(user.id, lobby.hostId));

    await db.insert(walletTransactions).values({
      userId: lobby.hostId,
      amount: totalHostPayout,
      type: "payout",
      description: `Pendapatan (Payout) dari pesanan Room ${lobby.category.toUpperCase()} yang telah selesai`,
    });
  }

  // 4. Update lobby to completed
  await db
    .update(lobbies)
    .set({
      status: "completed",
      pricePerPerson: finalPrice,
      updatedAt: new Date(),
    })
    .where(eq(lobbies.id, lobbyId));

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

  const allArrived = allMembers.every((m) => m.isArrived || m.role === "host");

  if (allArrived) {
    // Let's call finalizeLobby to handle refunds and payouts
    await finalizeLobby(lobbyId);

    // Also delete chat for privacy (since finalizeLobby doesn't do this)
    await db
      .update(lobbies)
      .set({ chatDeletedAt: new Date() })
      .where(eq(lobbies.id, lobbyId));
  }

  return { arrived: true, lobbyCompleted: allArrived };
}

// ─── Host Arrived (Starts 10 min auto-complete) ───
export async function hostArrived(lobbyId: string, userId: string) {
  const [lobby] = await db
    .select()
    .from(lobbies)
    .where(eq(lobbies.id, lobbyId))
    .limit(1);

  if (!lobby) throw new ServiceError("Lobby not found.", 404);
  if (lobby.hostId !== userId) throw new ServiceError("Only host can do this.", 403);
  if (lobby.status === "completed") throw new ServiceError("Lobby already completed.", 400);

  const autoCompleteTime = new Date(Date.now() + 10 * 60000); // 10 minutes from now

  await db
    .update(lobbies)
    .set({ autoCompleteAt: autoCompleteTime })
    .where(eq(lobbies.id, lobbyId));

  return { autoCompletesAt: autoCompleteTime };
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
  if (!result["host_fee_ride"]) result["host_fee_ride"] = { amount: 1000, currency: "IDR" };
  if (!result["host_fee_food"]) result["host_fee_food"] = { amount: 1000, currency: "IDR" };
  if (!result["host_fee_subs"]) result["host_fee_subs"] = { amount: 2000, currency: "IDR" };
  if (!result["host_fee_event"]) result["host_fee_event"] = { amount: 1000, currency: "IDR" };
  if (!result["member_fee"]) result["member_fee"] = { amount: 200, currency: "IDR" };
  return result;
}

/* ═══════════════════════════════════════════════════
   Custom Error
   ═══════════════════════════════════════════════════ */

export class ServiceError extends Error {
  public statusCode: number;
  public errorCode?: string;
  constructor(message: string, statusCode = 400, errorCode?: string) {
    super(message);
    this.name = "ServiceError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}
