import { Router } from "express";
import { createOAuthClient, OAUTH_SCOPES } from "../services/googleClient";

export const authRouter = Router();

// TODO(Person A): wire up real OAuth flow.
authRouter.get("/google/url", (_req, res) => {
  const client = createOAuthClient();
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: OAUTH_SCOPES,
  });
  res.json({ url });
});

authRouter.get("/google/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).json({ error: "missing code" });
    return;
  }
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  res.json({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
  });
});

authRouter.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    res.status(400).json({ error: "missing refreshToken" });
    return;
  }
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  res.json({
    accessToken: credentials.access_token,
    expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
  });
});
