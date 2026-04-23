import { Router } from "express";
import lobbyRoutes from "./lobby.routes.js";
import paymentRoutes from "./payment.routes.js";
import walletRoutes from "./wallet.routes.js";
import ratingRoutes from "./rating.routes.js";

const router = Router();

router.use("/lobbies", lobbyRoutes);
router.use("/payments", paymentRoutes);
router.use("/wallet", walletRoutes);
router.use("/users", ratingRoutes);

// Health check
router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "binbin-api",
    timestamp: new Date().toISOString(),
  });
});

export default router;
