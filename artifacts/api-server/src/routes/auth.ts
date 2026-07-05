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
    console.log("[auth] login failed: invalid credentials");
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Store the canonical env-var username (trimmed) so /auth/me returns a
  // consistent value regardless of what the client submitted.
  const session = req.session as { adminUser?: string };
  session.adminUser = ADMIN_USERNAME;
  console.log("[auth] login succeeded");
  res.json({ username: ADMIN_USERNAME });
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
