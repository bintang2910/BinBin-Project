import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  pgEnum,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* ═══════════════════════════════════════════════════
   Better Auth Tables (auto-managed)
   ═══════════════════════════════════════════════════ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),

  // ─── BinBin Custom Fields ───
  likesCount: integer("likes_count").notNull().default(0),       // 👍 Kharisma Host
  dislikesCount: integer("dislikes_count").notNull().default(0), // 👎 Kharisma Host
  balance: integer("balance").notNull().default(0),              // Saldo virtual (Rupiah)

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

/* ═══════════════════════════════════════════════════
   BinBin Enums
   ═══════════════════════════════════════════════════ */

export const categoryEnum = pgEnum("category", ["ride", "food", "subs", "event"]);

export const lobbyStatusEnum = pgEnum("lobby_status", [
  "open",       // masih bisa join
  "full",       // slot penuh, menunggu proses
  "completed",  // selesai (penumpang sampai / order terkirim / subs aktif)
  "expired",    // deadline lewat
  "cancelled",  // dibatalkan host
]);

export const memberRoleEnum = pgEnum("member_role", ["host", "member"]);

export const memberPaymentEnum = pgEnum("member_payment", [
  "pending",  // belum bayar
  "escrow",   // uang ditahan sistem (belum diteruskan ke host)
  "paid",     // sudah diteruskan / selesai
  "refunded", // dikembalikan
  "failed",   // gagal
]);

export const earningSourceEnum = pgEnum("earning_source", [
  "host_fee",   // fee dari host saat bikin lobby
  "member_fee", // fee dari member saat join
]);

export const distributionMethodEnum = pgEnum("distribution_method", [
  "pickup",     // jemput sendiri di titik kumpul
  "delivery",   // diantar (biaya antar diatur di chat)
]);

/* ═══════════════════════════════════════════════════
   Platform Settings (Dynamic Fees & Config)
   ═══════════════════════════════════════════════════ */

export const platformSettings = pgTable("platform_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════════
   Lobbies
   ═══════════════════════════════════════════════════ */

export const lobbies = pgTable("lobbies", {
  id: uuid("id").primaryKey().defaultRandom(),
  hostId: text("host_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: categoryEnum("category").notNull(),
  status: lobbyStatusEnum("status").notNull().default("open"),

  maxSlots: integer("max_slots").notNull(),
  currentSlots: integer("current_slots").notNull().default(1),

  // ─── Pricing ───
  totalPrice: integer("total_price").notNull(),            // harga total (Rp)
  pricePerPerson: integer("price_per_person").notNull(),   // totalPrice / currentSlots (dynamic)
  hostFee: integer("host_fee").notNull().default(2000),    // ride/food = 2000, subs = 5000
  memberFee: integer("member_fee").notNull().default(200), // admin fee per member ke platform

  // ─── Subs only ───
  expiryDate: timestamp("expiry_date"),  // tanggal expired langganan (1 bulan, dll)

  // ─── Food only ───
  distributionMethod: distributionMethodEnum("distribution_method"), // pickup / delivery
  meetingPoint: text("meeting_point"),  // lokasi pertemuan (jika pickup)

  // ─── Category-specific data ───
  metadata: jsonb("metadata").$type<LobbyMetadata>(),

  // ─── Chat Lifecycle ───
  chatExpiresAt: timestamp("chat_expires_at"),  // kapan group chat auto-delete
  chatDeletedAt: timestamp("chat_deleted_at"),  // null = chat masih aktif

  // ─── Timing ───
  deadline: timestamp("deadline"),  // ride departure / food order cutoff
  autoCompleteAt: timestamp("auto_complete_at"), // kapan auto-selesai (bila host pencet 'Tiba')
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════════
   Lobby Members (Join Table)
   ═══════════════════════════════════════════════════ */

export const lobbyMembers = pgTable(
  "lobby_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lobbyId: uuid("lobby_id")
      .notNull()
      .references(() => lobbies.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),

    // ─── Payment ───
    paymentStatus: memberPaymentEnum("payment_status")
      .notNull()
      .default("pending"),
    amountPaid: integer("amount_paid"),
    paymentGatewayId: text("payment_gateway_id"), // Midtrans order_id (future)

    // ─── Ride: 'Sampai Tujuan' confirmation ───
    isArrived: boolean("is_arrived").notNull().default(false),

    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_lobby_user").on(table.lobbyId, table.userId),
  ]
);

/* ═══════════════════════════════════════════════════
   Lobby Messages (Internal Group Chat)
   ═══════════════════════════════════════════════════ */

export const lobbyMessages = pgTable("lobby_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  lobbyId: uuid("lobby_id")
    .notNull()
    .references(() => lobbies.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════════
   Platform Earnings (Admin fee revenue tracker)
   ═══════════════════════════════════════════════════ */

export const platformEarnings = pgTable("platform_earnings", {
  id: uuid("id").primaryKey().defaultRandom(),
  lobbyId: uuid("lobby_id")
    .notNull()
    .references(() => lobbies.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),                  // jumlah cuan (Rp)
  source: earningSourceEnum("source").notNull(),        // host_fee / member_fee
  userId: text("user_id")                               // siapa yang bayar fee ini
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════════
   Host Ratings (Like/Dislike per lobby)
   ═══════════════════════════════════════════════════ */

export const hostRatings = pgTable(
  "host_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: text("host_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    raterId: text("rater_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lobbyId: uuid("lobby_id")
      .notNull()
      .references(() => lobbies.id, { onDelete: "cascade" }),
    isLike: boolean("is_like").notNull(), // true = 👍, false = 👎
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_host_rater_lobby").on(table.hostId, table.raterId, table.lobbyId),
  ]
);

/* ═══════════════════════════════════════════════════
   Transactions (Payment Gateway — future Midtrans)
   ═══════════════════════════════════════════════════ */

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  lobbyMemberId: uuid("lobby_member_id")
    .notNull()
    .references(() => lobbyMembers.id, { onDelete: "cascade" }),
  gatewayProvider: text("gateway_provider"),
  gatewayTransactionId: text("gateway_transaction_id"),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("IDR"),
  status: text("status").notNull().default("pending"),
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════════
   Relations
   ═══════════════════════════════════════════════════ */

export const userRelations = relations(user, ({ many }) => ({
  hostedLobbies: many(lobbies),
  memberships: many(lobbyMembers),
  earnings: many(platformEarnings),
  messages: many(lobbyMessages),
}));

export const lobbyRelations = relations(lobbies, ({ one, many }) => ({
  host: one(user, {
    fields: [lobbies.hostId],
    references: [user.id],
  }),
  members: many(lobbyMembers),
  earnings: many(platformEarnings),
  messages: many(lobbyMessages),
}));

export const lobbyMemberRelations = relations(lobbyMembers, ({ one }) => ({
  lobby: one(lobbies, {
    fields: [lobbyMembers.lobbyId],
    references: [lobbies.id],
  }),
  user: one(user, {
    fields: [lobbyMembers.userId],
    references: [user.id],
  }),
  transaction: one(transactions),
}));

export const platformEarningsRelations = relations(
  platformEarnings,
  ({ one }) => ({
    lobby: one(lobbies, {
      fields: [platformEarnings.lobbyId],
      references: [lobbies.id],
    }),
    user: one(user, {
      fields: [platformEarnings.userId],
      references: [user.id],
    }),
  })
);

export const transactionRelations = relations(transactions, ({ one }) => ({
  lobbyMember: one(lobbyMembers, {
    fields: [transactions.lobbyMemberId],
    references: [lobbyMembers.id],
  }),
}));

export const lobbyMessageRelations = relations(lobbyMessages, ({ one }) => ({
  lobby: one(lobbies, {
    fields: [lobbyMessages.lobbyId],
    references: [lobbies.id],
  }),
  user: one(user, {
    fields: [lobbyMessages.userId],
    references: [user.id],
  }),
}));

/* ═══════════════════════════════════════════════════
   TypeScript Types
   ═══════════════════════════════════════════════════ */

export type RideMetadata = {
  pickupLocation: string;
  dropoffLocation: string;
  departureTime: string;
  pickupNote?: string;
  dropoffNote?: string;
  vehicleInfo?: string;
  licensePlate?: string;
  estimatedDuration?: string;
};

export type FoodMetadata = {
  restaurantName: string;
  distributionMethod?: 'pickup' | 'delivery';
  meetingPoint?: string;       // lokasi pertemuan (jika pickup)
  menuHighlights?: string[];
};

export type SubsMetadata = {
  serviceName: string;
  duration: string;
  renewalDate?: string;
  screens?: number;
  region?: string;
  accountRules?: string[];
};

export type EventMetadata = {
  eventName: string;
  location: string;
  eventDate: string;
  description?: string;
};

export type LobbyMetadata = RideMetadata | FoodMetadata | SubsMetadata | EventMetadata;

// Inferred types
export type User = typeof user.$inferSelect;
export type Lobby = typeof lobbies.$inferSelect;
export type LobbyMember = typeof lobbyMembers.$inferSelect;
export type PlatformEarning = typeof platformEarnings.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type PlatformSetting = typeof platformSettings.$inferSelect;
export type LobbyMessage = typeof lobbyMessages.$inferSelect;
