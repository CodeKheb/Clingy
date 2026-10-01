import { Router } from "express";
import { createOAuthClient, OAUTH_SCOPES } from "../services/googleClient";

export const authRouter = Router();

// TODO(Person A): wire up real OAuth flow.
authRouter.get("/google/url", (req, res) => {
  const client = createOAuthClient();
  // The app passes its deep-link redirect (e.g. clingy://auth-callback) so the
  // callback below knows to hand tokens back to the app instead of the browser.
  // Threaded through OAuth `state` since Google round-trips it unmodified.
  const appRedirectUri = req.query.appRedirectUri as string | undefined;
  const url = client.generateAuthUrl({
    access_type: "offline",
    // Google only returns a refresh token on the first consent unless asked again;
    // without this, a repeat sign-in leaves the app unable to refresh after an hour.
    prompt: "consent",
    scope: OAUTH_SCOPES,
    state: appRedirectUri ? encodeURIComponent(appRedirectUri) : undefined,
  });
  res.json({ url });
});

authRouter.get("/google/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const appRedirectUri = req.query.state as string | undefined;
  if (!code) {
    res.status(400).json({ error: "missing code" });
    return;
  }
  try {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(code);
    const result = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    };

    if (appRedirectUri) {
      const redirect = new URL(decodeURIComponent(appRedirectUri));
      if (result.accessToken) redirect.searchParams.set("accessToken", result.accessToken);
      if (result.refreshToken) redirect.searchParams.set("refreshToken", result.refreshToken);
      if (result.expiresAt) redirect.searchParams.set("expiresAt", result.expiresAt);
      res.redirect(redirect.toString());
      return;
    }

    // No app redirect requested (e.g. manual/debug testing): return JSON as before.
    res.json(result);
  } catch (error: any) {
    console.error("Error exchanging code for tokens:", error?.message || error);
    res.status(400).json({ error: "Failed to exchange auth code for tokens" });
  }
});

authRouter.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    res.status(400).json({ error: "missing refreshToken" });
    return;
  }
  try {
    const client = createOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await client.refreshAccessToken();
    res.json({
      accessToken: credentials.access_token,
      expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
    });
  } catch (error: any) {
    console.error("Error refreshing token:", error?.message || error);
    res.status(400).json({ error: "Failed to refresh access token" });
  }
});
