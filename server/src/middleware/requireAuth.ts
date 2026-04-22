import type { Request, Response, NextFunction } from "express";
import { auth } from "../lib/auth.js";
import { fromNodeHeaders } from "better-auth/node";

/**
 * Middleware: Requires a valid Better Auth session.
 * Attaches `req.user` and `req.session` for downstream handlers.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      res.status(401).json({
        error: "Unauthorized",
        message: "You must be signed in to access this resource.",
      });
      return;
    }

    // Attach to request for downstream use
    (req as any).user = session.user;
    (req as any).session = session.session;

    next();
  } catch (error) {
    console.error("[requireAuth] Session check failed:", error);
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired session.",
    });
  }
}

/**
 * Helper: Get authenticated user from request (after requireAuth).
 */
export function getAuthUser(req: Request) {
  return (req as any).user as {
    id: string;
    name: string;
    email: string;
    image?: string;
  };
}
