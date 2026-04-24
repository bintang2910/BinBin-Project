import { Server } from "socket.io";
import { auth } from "./lib/auth.js";
import { db } from "./db/index.js";
import { lobbyMessages, user } from "./db/schema.js";
import { eq } from "drizzle-orm";

export function initSocket(httpServer: any) {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!origin) return callback(null, true);
        if (
          origin.includes("localhost") ||
          origin.includes("127.0.0.1") ||
          /^https?:\/\/192\.168\./.test(origin) ||
          /^https?:\/\/10\./.test(origin) ||
          origin.includes(".onrender.com")
        ) {
          return callback(null, true);
        }
        callback(null, false);
      },
      credentials: true,
    }
  });

  io.on("connection", (socket) => {
    console.log("🟢 Client connected:", socket.id);

    socket.on("join_room", (lobbyId) => {
      socket.join(lobbyId);
      console.log(`👤 Socket ${socket.id} joined room: ${lobbyId}`);
    });

    socket.on("send_message", async (data) => {
      try {
        const { lobbyId, content } = data;
        
        let sessionUser = null;

        // Extract session using better-auth headers format
        try {
            const headers = new Headers(socket.request.headers as any);
            const session = await auth.api.getSession({ headers });
            if (session?.user) {
                sessionUser = session.user;
            }
        } catch (authErr) {
            console.error("Auth decode error in socket:", authErr);
        }

        // Fallback for prototype testing if headers strip cookies (e.g. strict CORS):
        // We will accept userId from payload if session extraction fails, but only for prototype!
        let finalUserId = sessionUser?.id || data.userId;

        if (!finalUserId) {
            socket.emit("error", { message: "Unauthorized" });
            return;
        }

        // Fetch User Info to attach to message
        const [sender] = await db.select().from(user).where(eq(user.id, finalUserId));

        // Save to DB
        const [savedMsg] = await db.insert(lobbyMessages).values({
            lobbyId,
            userId: finalUserId,
            content
        }).returning();

        // Broadcast to everyone in room
        io.to(lobbyId).emit("new_message", {
            id: savedMsg.id,
            lobbyId: savedMsg.lobbyId,
            userId: savedMsg.userId,
            content: savedMsg.content,
            createdAt: savedMsg.createdAt,
            user: {
                id: sender.id,
                name: sender.name,
                image: sender.image
            }
        });

      } catch (err) {
        console.error("Socket error handling message:", err);
      }
    });

    socket.on("disconnect", () => {
      console.log("🔴 Client disconnected:", socket.id);
    });
  });
}
