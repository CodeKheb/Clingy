// App-side OAuth screen, calls backend /auth/google/* routes,
// stores tokens for use by sync/syncService.ts.
//
// The backend (not the app) holds the Google OAuth client secret and does the
// code exchange (/auth/google/url, /auth/google/callback,
// /auth/refresh). This module just: asks the backend for a consent URL, opens it
// in a browser, catches the token-bearing redirect back into the app via its
// custom scheme, and persists tokens in SecureStore.

import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';

import type { AuthTokenResponse, AuthUrlResponse } from '../types';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const ACCESS_TOKEN_KEY = 'clingy.accessToken';
const REFRESH_TOKEN_KEY = 'clingy.refreshToken';
const EXPIRES_AT_KEY = 'clingy.expiresAt';

export type StoredTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
};

function requireBackendUrl(): string {
  if (!BACKEND_URL) {
    throw new Error(
      '[auth] EXPO_PUBLIC_BACKEND_URL is not set — add it to app/.env (see .env for the expected format)',
    );
  }
  return BACKEND_URL;
}

// Extracts query params from a redirect URL without relying on RN's URL/
// URLSearchParams support, which can be incomplete depending on the JS engine.
function parseQueryParams(url: string): Record<string, string> {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return {};
  const query = url.slice(queryStart + 1);
  const params: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [rawKey, rawValue = ''] = pair.split('=');
    params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
  }
  return params;
}

async function storeTokens(tokens: StoredTokens): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }
  if (tokens.expiresAt) {
    await SecureStore.setItemAsync(EXPIRES_AT_KEY, tokens.expiresAt);
  }
}

export async function getStoredTokens(): Promise<StoredTokens | null> {
  const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  if (!accessToken) return null;
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  const expiresAt = await SecureStore.getItemAsync(EXPIRES_AT_KEY);
  return { accessToken, refreshToken, expiresAt };
}

export async function clearStoredTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(EXPIRES_AT_KEY);
}

export type SignInResult =
  | { type: 'success'; tokens: StoredTokens }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

/**
 * Runs the full Google sign-in flow: fetches the consent URL from the backend,
 * opens it in a browser, and resolves once the backend's callback redirects
 * back into the app with tokens (or the user cancels, or something fails).
 */
export async function signInWithGoogle(): Promise<SignInResult> {
  try {
    const backendUrl = requireBackendUrl();
    const appRedirectUri = makeRedirectUri({ scheme: 'clingy', path: 'auth-callback' });

    const urlResponse = await fetch(
      `${backendUrl}/auth/google/url?appRedirectUri=${encodeURIComponent(appRedirectUri)}`,
    );
    if (!urlResponse.ok) {
      return { type: 'error', message: `Failed to get auth URL (${urlResponse.status})` };
    }
    const { url: authUrl } = (await urlResponse.json()) as AuthUrlResponse;

    const result = await WebBrowser.openAuthSessionAsync(authUrl, appRedirectUri);

    if (result.type !== 'success') {
      return { type: 'cancelled' };
    }

    const params = parseQueryParams(result.url);
    if (!params.accessToken) {
      return { type: 'error', message: params.error ?? 'No access token in callback redirect' };
    }

    const tokens: StoredTokens = {
      accessToken: params.accessToken,
      refreshToken: params.refreshToken ?? null,
      expiresAt: params.expiresAt ?? null,
    };
    await storeTokens(tokens);
    return { type: 'success', tokens };
  } catch (e) {
    return { type: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

/** Calls the backend's /auth/refresh with the stored refresh token, updates storage. */
export async function refreshAccessToken(): Promise<StoredTokens | null> {
  const stored = await getStoredTokens();
  if (!stored?.refreshToken) return null;

  const backendUrl = requireBackendUrl();
  const response = await fetch(`${backendUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: stored.refreshToken }),
  });
  if (!response.ok) return null;

  const refreshed = (await response.json()) as AuthTokenResponse;
  const tokens: StoredTokens = {
    accessToken: refreshed.accessToken,
    refreshToken: stored.refreshToken,
    expiresAt: refreshed.expiresAt,
  };
  await storeTokens(tokens);
  return tokens;
}

export async function signOut(): Promise<void> {
  await clearStoredTokens();
}
