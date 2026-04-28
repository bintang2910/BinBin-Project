import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { user, walletTransactions } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { auth } from "../lib/auth.js";
import { fromNodeHeaders } from "better-auth/node";

const router = Router();

/* ═══════════════════════════════════════════════════
   Wallet Routes — Balance & Top-Up
   ═══════════════════════════════════════════════════ */

// Middleware: extract user from session
async function getSessionUser(req: Request) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  return session?.user ?? null;
}

// ─── GET /api/wallet/balance ───
router.get("/balance", async (req: Request, res: Response) => {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const [u] = await db
      .select({ balance: user.balance })
      .from(user)
      .where(eq(user.id, sessionUser.id))
      .limit(1);

    if (!u) return res.status(404).json({ error: "User not found" });

    res.json({ data: { balance: u.balance } });
  } catch (err: any) {
    console.error("[wallet] balance error:", err);
    res.status(500).json({ error: "Failed to fetch balance" });
  }
});

// ─── POST /api/wallet/topup ───
const TOPUP_AMOUNTS = [10000, 20000, 50000, 100000, 200000, 500000];

router.post("/topup", async (req: Request, res: Response) => {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { amount } = req.body;

    if (!amount || typeof amount !== "number" || amount < 1000) {
      return res.status(400).json({ error: "Minimum top-up is Rp 1.000" });
    }
    if (amount > 1000000) {
      return res.status(400).json({ error: "Maximum top-up is Rp 1.000.000" });
    }

    // Update balance
    const [updated] = await db
      .update(user)
      .set({
        balance: sql`${user.balance} + ${amount}`,
      })
      .where(eq(user.id, sessionUser.id))
      .returning({ balance: user.balance });

    if (!updated) {
      return res.status(404).json({ error: "User not found" });
    }

    // Log transaction
    await db.insert(walletTransactions).values({
      userId: sessionUser.id,
      amount: amount,
      type: "topup",
      description: "Top Up Saldo",
    });

    console.log(
      `[wallet] Top-up: user=${sessionUser.id}, amount=${amount}, newBalance=${updated.balance}`
    );

    res.json({
      data: {
        balance: updated.balance,
        topUpAmount: amount,
        message: `Berhasil top-up Rp ${amount.toLocaleString("id-ID")}`,
      },
    });
  } catch (err: any) {
    console.error("[wallet] topup error:", err);
    res.status(500).json({ error: "Top-up failed. Please try again." });
  }
});

// ─── GET /api/wallet/history ───
router.get("/history", async (req: Request, res: Response) => {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const history = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.userId, sessionUser.id))
      .orderBy(sql`${walletTransactions.createdAt} DESC`)
      .limit(50);

    res.json({ data: history });
  } catch (err: any) {
    console.error("[wallet] history error:", err);
    res.status(500).json({ error: "Failed to fetch wallet history" });
  }
});

export default router;
