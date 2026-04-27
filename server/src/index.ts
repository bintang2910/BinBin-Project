import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import apiRoutes from "./routes/index.js";
import { createServer } from "http";
import { initSocket } from "./socket.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ═══════════════════════════════════════════════════
   BinBin API Server
   ═══════════════════════════════════════════════════ */

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// ─── CORS (dynamic — allows any local network origin) ───
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc)
      if (!origin) return callback(null, true);
      // Allow any localhost or local network IP
      if (
        origin.includes("localhost") ||
        origin.includes("127.0.0.1") ||
        origin.match(/^https?:\/\/192\.168\./) ||
        origin.match(/^https?:\/\/10\./) ||
        origin.match(/^https?:\/\/172\.(1[6-9]|2\d|3[01])\./) ||
        origin.includes(".onrender.com") ||
        origin.includes(".vercel.app")
      ) {
        return callback(null, true);
      }
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ─── Body Parsers ───
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Request Logger (dev) ───
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    const timestamp = new Date().toISOString().slice(11, 19);
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    next();
  });
}

// ─── Better Auth Handler ───
// All auth routes: /api/auth/sign-up, /api/auth/sign-in, /api/auth/sign-out, etc.
app.all("/api/auth/*splat", toNodeHandler(auth));

// ─── API Routes ───
app.use("/api", apiRoutes);

// ─── Serve Frontend Static Files (Production) ───
// In production, Express serves the frontend from the parent directory
const frontendPath = path.join(__dirname, "../../");
app.use(express.static(frontendPath));

// ─── SPA Fallback: serve index.html for non-API routes ───
app.use((req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      error: "Not Found",
      message: "The requested endpoint does not exist.",
    });
  }
  // Try to serve the exact file, or fallback to index.html
  const filePath = path.join(frontendPath, req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.sendFile(path.join(frontendPath, "index.html"));
    }
  });
});

// ─── Global Error Handler ───
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[FATAL]", err);
  res.status(500).json({
    error: "Internal Server Error",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

// ─── Start Server ───
const httpServer = createServer(app);
initSocket(httpServer);

// ─── Auto-Expire Lobbies (runs every 5 minutes) ───
import { expireOldLobbies } from "./services/lobby.service.js";

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║  🐝 BinBin API Server                   ║
  ║  📡 Local:   http://localhost:${PORT}     ║
  ║  📡 Network: http://0.0.0.0:${PORT}      ║
  ║  🔐 Auth: /api/auth/*                   ║
  ║  📦 API:  /api/lobbies, /api/payments    ║
  ║  💰 Wallet: /api/wallet                  ║
  ║  💚 Health: /api/health                  ║
  ║  ⏰ Auto-Expire: every 5 minutes         ║
  ╚══════════════════════════════════════════╝
  `);

  // Run once on startup, then every 5 minutes
  expireOldLobbies();
  setInterval(expireOldLobbies, 5 * 60 * 1000);
});

export default app;
