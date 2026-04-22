import { Router } from "express";

const router = Router();

/* ═══════════════════════════════════════════════════
   Payment Webhook Routes (Midtrans / Stripe)
   
   These are placeholder routes prepared for
   future payment gateway integration.
   ═══════════════════════════════════════════════════ */

/**
 * POST /api/payments/webhook/midtrans
 * 
 * Midtrans sends payment notifications here.
 * This endpoint must:
 * 1. Verify the signature from Midtrans server key
 * 2. Update lobby_members.paymentStatus
 * 3. Insert into transactions table
 * 4. Return 200 to acknowledge receipt
 */
router.post("/webhook/midtrans", async (req, res) => {
  try {
    const notification = req.body;

    console.log("[Payment Webhook] Midtrans notification received:", {
      order_id: notification.order_id,
      transaction_status: notification.transaction_status,
      fraud_status: notification.fraud_status,
    });

    // TODO: Implement when Midtrans keys are configured
    // 1. Verify signature:
    //    const isValid = verifyMidtransSignature(notification, MIDTRANS_SERVER_KEY);
    //
    // 2. Parse status:
    //    const { order_id, transaction_status } = notification;
    //
    // 3. Update payment:
    //    if (transaction_status === 'settlement' || transaction_status === 'capture') {
    //      await updatePaymentStatus(order_id, 'paid');
    //    } else if (transaction_status === 'deny' || transaction_status === 'cancel' || transaction_status === 'expire') {
    //      await updatePaymentStatus(order_id, 'failed');
    //    }

    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("[Payment Webhook] Error:", error);
    // Always return 200 to prevent Midtrans retries during dev
    res.status(200).json({ status: "error_logged" });
  }
});

/**
 * POST /api/payments/create-transaction
 * 
 * Frontend calls this to initiate a payment.
 * Returns a Midtrans snap token or payment URL.
 */
router.post("/create-transaction", async (req, res) => {
  try {
    const { lobbyId } = req.body;

    // TODO: Implement when Midtrans keys are configured
    // 1. Get lobby details + admin fee
    // 2. Create Midtrans Snap transaction
    // 3. Return snap_token to frontend

    res.status(501).json({
      error: "Payment gateway not yet configured",
      message: "This endpoint will be available once Midtrans/Stripe integration is complete.",
    });
  } catch (error) {
    console.error("[Payment] Create transaction error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/payments/status/:orderId
 * 
 * Check payment status for a specific order.
 */
router.get("/status/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    // TODO: Query transactions table
    res.status(501).json({
      error: "Payment gateway not yet configured",
      orderId,
    });
  } catch (error) {
    console.error("[Payment] Status check error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
