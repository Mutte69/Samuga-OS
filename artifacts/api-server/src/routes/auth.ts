import { Router, type IRouter } from "express";
import { LoginBody } from "@workspace/api-zod";
import { requireAdminSession } from "../middlewares/session-auth";

const router: IRouter = Router();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME?.trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim();

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  throw new Error(
    "ADMIN_USERNAME and ADMIN_PASSWORD environment variables are required. Set them in your environment secrets.",
  );
}

console.log(
  `[auth] ADMIN_USERNAME loaded (length=${ADMIN_USERNAME.length})`,
);

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;
  const valid =
    username.trim() === ADMIN_USERNAME && password.trim() === ADMIN_PASSWORD;

  if (!valid) {
    console.log(
      "[auth] login failed: invalid credentials",
      `(operator_id_length=${username.trim().length})`,
    );
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Regenerate the session ID on successful login to prevent session fixation:
  // any session that existed before login (e.g. from an anonymous visit) is
  // destroyed and replaced with a fresh ID that only the authenticated user knows.
  req.session.regenerate((regenerateErr) => {
    if (regenerateErr) {
      console.error("[auth] session regenerate failed:", regenerateErr.message);
      res.status(500).json({ error: "Session could not be created. Try again." });
      return;
    }

    // Store the canonical env-var username (trimmed) so /auth/me returns a
    // consistent value regardless of what the client submitted.
    const session = req.session as { adminUser?: string };
    session.adminUser = ADMIN_USERNAME;

    // Explicitly save AFTER setting data so the session is written to the store
    // before the response is sent.  Without this, express-session saves lazily;
    // the next request (/auth/me) can arrive before the save completes, causing
    // a 401 even on a correct login.
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error("[auth] session save failed:", saveErr.message);
        res.status(500).json({ error: "Session could not be saved. Try again." });
        return;
      }
      console.log("[auth] login succeeded");
      res.json({ username: ADMIN_USERNAME });
    });
  });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {});
  res.json({ success: true });
});

router.get("/auth/me", requireAdminSession, (req, res): void => {
  const session = req.session as { adminUser?: string };
  res.json({ username: session.adminUser });
});

export default router;
