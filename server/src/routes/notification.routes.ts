import { Router } from "express";
import { requireAuth, getAuthUser } from "../middleware/requireAuth.js";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  ServiceError,
} from "../services/notification.service.js";
import { z } from "zod";

const router = Router();
const uuidParam = z.string().uuid("Invalid notification ID format.");

// GET /api/notifications -> get all user notifications
router.get("/", requireAuth, async (req, res) => {
  try {
    const user = getAuthUser(req);
    const notifications = await getNotifications(user.id);
    // Return both the list and the unread count
    const unreadCount = notifications.filter((n) => !n.isRead).length;
    res.json({ data: notifications, unreadCount });
  } catch (error) {
    handleError(res, error);
  }
});

// POST /api/notifications/read-all -> mark all as read
router.post("/read-all", requireAuth, async (req, res) => {
  try {
    const user = getAuthUser(req);
    const result = await markAllAsRead(user.id);
    res.json({ data: result });
  } catch (error) {
    handleError(res, error);
  }
});

// POST /api/notifications/:id/read -> mark specific notification as read
router.post("/:id/read", requireAuth, async (req, res) => {
  try {
    const notificationId = uuidParam.parse(req.params.id);
    const user = getAuthUser(req);
    const result = await markAsRead(notificationId, user.id);
    res.json({ data: result });
  } catch (error) {
    handleError(res, error);
  }
});

function handleError(res: any, error: unknown) {
  if (error instanceof ServiceError) {
    res.status(error.statusCode).json({ error: error.message, code: error.statusCode });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Validation failed", details: error.errors });
    return;
  }
  console.error("[notification.routes] Error:", error);
  res.status(500).json({ error: "Internal server error" });
}

export default router;
