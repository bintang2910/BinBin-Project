import { Router } from "express";
import { z } from "zod";
import { requireAuth, getAuthUser } from "../middleware/requireAuth.js";
import {
  createLobby,
  listLobbies,
  getLobbyDetail,
  joinLobby,
  getMyLobbies,
  getPlatformFees,
  markArrived,
  getLobbyChat,
  finalizeLobby,
  lockLobby,
  ServiceError,
} from "../services/lobby.service.js";

const router = Router();

/* ═══════════════════════════════════════════════════
   Validation Schemas (Zod) — v3: no WA, stricter
   ═══════════════════════════════════════════════════ */

// UUID param validator
const uuidParam = z.string().uuid("Invalid lobby ID format.");

const createLobbySchema = z
  .object({
    title: z.string().min(3, "Title min 3 chars").max(100),
    category: z.enum(["ride", "food", "subs", "event"]),
    maxSlots: z.number().int().min(2).max(50),
    totalPrice: z.number().int().min(1000),
    deadline: z.string().datetime().optional(),
    expiryDate: z.string().datetime().optional(),
    distributionMethod: z.enum(["pickup", "delivery"]).optional(),
    meetingPoint: z.string().max(200).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .refine(
    (data) => {
      // Food category should have distributionMethod
      if (data.category === "food" && !data.distributionMethod) return false;
      return true;
    },
    {
      message: "Food category requires a distribution method (pickup or delivery).",
    }
  );

const listQuerySchema = z.object({
  category: z.enum(["ride", "food", "subs", "event"]).optional(),
  status: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/* ═══════════════════════════════════════════════════
   Routes
   ═══════════════════════════════════════════════════ */

// ─── GET /api/lobbies — List lobbies ───
router.get("/", async (req, res) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const results = await listLobbies({
      category: query.category,
      status: query.status,
      query: query.q,
      limit: query.limit,
      offset: query.offset,
    });
    res.json({ data: results, count: results.length });
  } catch (error) {
    handleError(res, error);
  }
});

// ─── GET /api/lobbies/me — My lobbies (auth required) ───
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = getAuthUser(req);
    const status = req.query.status as "active" | "completed" | undefined;
    const results = await getMyLobbies(user.id, status);
    res.json({ data: results, count: results.length });
  } catch (error) {
    handleError(res, error);
  }
});

// ─── GET /api/lobbies/fees — Get platform fees (public) ───
router.get("/fees", async (_req, res) => {
  try {
    const fees = await getPlatformFees();
    res.json({ data: fees });
  } catch (error) {
    handleError(res, error);
  }
});

// ─── GET /api/lobbies/:id — Lobby detail ───
router.get("/:id", async (req, res) => {
  try {
    // Validate UUID format
    const lobbyId = uuidParam.parse(req.params.id);

    // Try to get user for visibility (optional auth)
    let userId: string | undefined;
    try {
      const { fromNodeHeaders } = await import("better-auth/node");
      const { auth } = await import("../lib/auth.js");
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      userId = session?.user?.id;
    } catch {
      // Not authenticated — that's fine for public viewing
    }

    const lobby = await getLobbyDetail(lobbyId, userId);
    res.json({ data: lobby });
  } catch (error) {
    handleError(res, error);
  }
});

// ─── POST /api/lobbies — Create lobby (auth required) ───
router.post("/", requireAuth, async (req, res) => {
  try {
    const user = getAuthUser(req);
    const body = createLobbySchema.parse(req.body);

    const lobby = await createLobby({
      hostId: user.id,
      title: body.title,
      category: body.category,
      maxSlots: body.maxSlots,
      totalPrice: body.totalPrice,
      distributionMethod: body.distributionMethod,
      meetingPoint: body.meetingPoint,
      metadata: body.metadata as any,
      deadline: body.deadline ? new Date(body.deadline) : undefined,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
    });

    res.status(201).json({ data: lobby });
  } catch (error) {
    handleError(res, error);
  }
});

// ─── POST /api/lobbies/:id/join — Join lobby (auth required) ───
router.post("/:id/join", requireAuth, async (req, res) => {
  try {
    const lobbyId = uuidParam.parse(req.params.id);
    const user = getAuthUser(req);
    const result = await joinLobby(lobbyId, user.id);
    res.json({ data: result });
  } catch (error) {
    handleError(res, error);
  }
});

// ─── POST /api/lobbies/:id/lock — Lock lobby (host only) ───
router.post("/:id/lock", requireAuth, async (req, res) => {
  try {
    const lobbyId = uuidParam.parse(req.params.id);
    const user = getAuthUser(req);
    const result = await lockLobby(lobbyId, user.id);
    res.json({ data: result });
  } catch (error) {
    handleError(res, error);
  }
});

// ─── POST /api/lobbies/:id/finalize — Finalize lobby on timer expiry ───
router.post("/:id/finalize", requireAuth, async (req, res) => {
  try {
    const lobbyId = uuidParam.parse(req.params.id);
    const result = await finalizeLobby(lobbyId);
    res.json({ data: result });
  } catch (error) {
    handleError(res, error);
  }
});

// ─── POST /api/lobbies/:id/arrive — Mark arrived (auth required) ───
router.post("/:id/arrive", requireAuth, async (req, res) => {
  try {
    const lobbyId = uuidParam.parse(req.params.id);
    const user = getAuthUser(req);
    const result = await markArrived(lobbyId, user.id);
    res.json({ data: result });
  } catch (error) {
    handleError(res, error);
  }
});

// ─── GET /api/lobbies/:id/chat — Get lobby chat history (auth required) ───
router.get("/:id/chat", requireAuth, async (req, res) => {
  try {
    const lobbyId = uuidParam.parse(req.params.id);
    const user = getAuthUser(req);
    const messages = await getLobbyChat(lobbyId, user.id);
    res.json({ data: messages });
  } catch (error) {
    handleError(res, error);
  }
});

/* ═══════════════════════════════════════════════════
   Error Handler
   ═══════════════════════════════════════════════════ */

function handleError(res: any, error: unknown) {
  if (error instanceof ServiceError) {
    res.status(error.statusCode).json({
      error: error.message,
      code: error.statusCode,
      ...(error.errorCode && { errorCode: error.errorCode }),
    });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: "Validation failed",
      code: 400,
      details: error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }
  console.error("[lobby.routes] Unexpected error:", error);
  res.status(500).json({ error: "Internal server error", code: 500 });
}

export default router;
