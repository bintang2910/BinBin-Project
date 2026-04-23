import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { user, hostRatings, lobbyMembers, lobbies } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, getAuthUser } from "../middleware/requireAuth.js";

const router = Router();

/* ═══════════════════════════════════════════════════
   Rating Routes — Host Like/Dislike System
   ═══════════════════════════════════════════════════ */

// ─── POST /api/users/:id/rate — Rate a host ───
router.post("/:id/rate", requireAuth, async (req: Request, res: Response) => {
  try {
    const hostId = req.params.id;
    const rater = getAuthUser(req);
    const { lobbyId, isLike } = req.body;

    // 1. Can't rate yourself
    if (hostId === rater.id) {
      return res.status(400).json({ error: "Kamu tidak bisa me-rating dirimu sendiri." });
    }

    // 2. Validate isLike is boolean
    if (typeof isLike !== "boolean") {
      return res.status(400).json({ error: "Rating harus berupa like (true) atau dislike (false)." });
    }

    // 3. Validate lobbyId
    if (!lobbyId) {
      return res.status(400).json({ error: "Lobby ID diperlukan untuk memberikan rating." });
    }

    // 4. Check lobby exists and the target is actually the host
    const [lobby] = await db
      .select()
      .from(lobbies)
      .where(eq(lobbies.id, lobbyId))
      .limit(1);

    if (!lobby) {
      return res.status(404).json({ error: "Lobby tidak ditemukan." });
    }
    if (lobby.hostId !== hostId) {
      return res.status(400).json({ error: "User ini bukan host dari lobby tersebut." });
    }

    // 5. Check rater was a member of this lobby
    const [membership] = await db
      .select()
      .from(lobbyMembers)
      .where(and(eq(lobbyMembers.lobbyId, lobbyId), eq(lobbyMembers.userId, rater.id)))
      .limit(1);

    if (!membership) {
      return res.status(403).json({ error: "Kamu harus pernah bergabung di lobby ini untuk memberikan rating." });
    }

    // 6. Check if already rated this host for this lobby
    const [existing] = await db
      .select()
      .from(hostRatings)
      .where(
        and(
          eq(hostRatings.hostId, hostId),
          eq(hostRatings.raterId, rater.id),
          eq(hostRatings.lobbyId, lobbyId)
        )
      )
      .limit(1);

    if (existing) {
      // Update existing rating if changed
      if (existing.isLike === isLike) {
        return res.status(400).json({ error: "Kamu sudah memberikan rating yang sama." });
      }

      // Update rating
      await db
        .update(hostRatings)
        .set({ isLike })
        .where(eq(hostRatings.id, existing.id));

      // Update user counts: swap the counts
      if (isLike) {
        // Changed from dislike to like
        await db
          .update(user)
          .set({
            likesCount: sql`${user.likesCount} + 1`,
            dislikesCount: sql`GREATEST(${user.dislikesCount} - 1, 0)`,
          })
          .where(eq(user.id, hostId));
      } else {
        // Changed from like to dislike
        await db
          .update(user)
          .set({
            likesCount: sql`GREATEST(${user.likesCount} - 1, 0)`,
            dislikesCount: sql`${user.dislikesCount} + 1`,
          })
          .where(eq(user.id, hostId));
      }

      const [updated] = await db
        .select({ likesCount: user.likesCount, dislikesCount: user.dislikesCount })
        .from(user)
        .where(eq(user.id, hostId))
        .limit(1);

      return res.json({
        data: {
          message: isLike ? "Rating diubah ke 👍" : "Rating diubah ke 👎",
          likesCount: updated?.likesCount ?? 0,
          dislikesCount: updated?.dislikesCount ?? 0,
        },
      });
    }

    // 7. Insert new rating
    await db.insert(hostRatings).values({
      hostId,
      raterId: rater.id,
      lobbyId,
      isLike,
    });

    // 8. Update user like/dislike count
    if (isLike) {
      await db
        .update(user)
        .set({ likesCount: sql`${user.likesCount} + 1` })
        .where(eq(user.id, hostId));
    } else {
      await db
        .update(user)
        .set({ dislikesCount: sql`${user.dislikesCount} + 1` })
        .where(eq(user.id, hostId));
    }

    // 9. Return updated counts
    const [updated] = await db
      .select({ likesCount: user.likesCount, dislikesCount: user.dislikesCount })
      .from(user)
      .where(eq(user.id, hostId))
      .limit(1);

    res.status(201).json({
      data: {
        message: isLike ? "Berhasil memberikan 👍" : "Berhasil memberikan 👎",
        likesCount: updated?.likesCount ?? 0,
        dislikesCount: updated?.dislikesCount ?? 0,
      },
    });
  } catch (err: any) {
    console.error("[rating] Error:", err);
    res.status(500).json({ error: "Gagal memberikan rating." });
  }
});

// ─── GET /api/users/:id/reputation — Get host reputation ───
router.get("/:id/reputation", async (req: Request, res: Response) => {
  try {
    const userId = req.params.id as string;
    const [u] = await db
      .select({
        id: user.id,
        name: user.name,
        image: user.image,
        likesCount: user.likesCount,
        dislikesCount: user.dislikesCount,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!u) return res.status(404).json({ error: "User not found." });

    const total = u.likesCount + u.dislikesCount;
    const score = total > 0 ? Math.round((u.likesCount / total) * 100) : 0;

    res.json({
      data: {
        ...u,
        totalRatings: total,
        approvalScore: score, // percentage
      },
    });
  } catch (err: any) {
    console.error("[reputation] Error:", err);
    res.status(500).json({ error: "Failed to fetch reputation." });
  }
});

export default router;
