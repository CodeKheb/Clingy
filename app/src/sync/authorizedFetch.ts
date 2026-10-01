// Calls the backend with the stored Google access token, refreshing it once on a 401.

import { getStoredTokens, refreshAccessToken } from '../auth/googleAuth';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

function requireBackendUrl(): string {
  if (!BACKEND_URL) {
    throw new Error('[sync] EXPO_PUBLIC_BACKEND_URL is not set — see app/.env.example');
  }
  return BACKEND_URL;
}

export async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const backendUrl = requireBackendUrl();
  let tokens = await getStoredTokens();
  if (!tokens) {
    throw new Error('[sync] not signed in — no stored tokens');
  }

  const call = (accessToken: string) =>
    fetch(`${backendUrl}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${accessToken}` },
    });

  let response = await call(tokens.accessToken);

  // Access tokens expire; retry once after a refresh (CONTRACT.md /auth/refresh).
  if (response.status === 401 && tokens.refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      tokens = refreshed;
      response = await call(tokens.accessToken);
    }
  }

  return response;
}
