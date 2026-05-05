import { eq, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { notifications } from "../db/schema.js";

export class ServiceError extends Error {
  constructor(public message: string, public statusCode: number = 400) {
    super(message);
    this.name = "ServiceError";
  }
}

export async function createNotification(data: {
  userId: string;
  title: string;
  message: string;
  type?: "lobby_join" | "lobby_status" | "system";
  link?: string;
}) {
  const [notification] = await db
    .insert(notifications)
    .values({
      userId: data.userId,
      title: data.title,
      message: data.message,
      type: data.type || "system",
      link: data.link,
    })
    .returning();
  return notification;
}

export async function getNotifications(userId: string) {
  return db.query.notifications.findMany({
    where: eq(notifications.userId, userId),
    orderBy: [desc(notifications.createdAt)],
    limit: 50,
  });
}

export async function markAsRead(notificationId: string, userId: string) {
  // Verify it exists and belongs to user
  const existing = await db.query.notifications.findFirst({
    where: eq(notifications.id, notificationId),
  });

  if (!existing || existing.userId !== userId) {
    throw new ServiceError("Notification not found or unauthorized", 404);
  }

  const [notification] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.id, notificationId))
    .returning();

  return notification;
}

export async function markAllAsRead(userId: string) {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.userId, userId));
  return { success: true };
}
