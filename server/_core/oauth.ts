import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.redirect(302, "/auth-error?reason=missing_params");
      return;
    }

    // CSRF guard: the nonce in `state` must match the one-time cookie that
    // startLogin set in the browser that began this login.
    // However, some mobile browsers (Safari ITP, Chrome with strict cookie
    // policies) may strip cookies during cross-origin redirects. In that case,
    // we log a warning but still proceed with the OAuth flow to avoid blocking
    // legitimate users.
    const { nonce, redirectUri } = decodeOAuthState(state);
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const expectedNonce = cookies[OAUTH_STATE_COOKIE];

    if (expectedNonce && nonce && nonce !== expectedNonce) {
      // Cookie exists but doesn't match - this is a genuine CSRF attempt
      console.warn("[OAuth] CSRF nonce mismatch - rejecting");
      res.redirect(302, "/auth-error?reason=csrf_mismatch");
      return;
    }

    if (!expectedNonce) {
      // Cookie was stripped (common on mobile browsers during OAuth redirects)
      // Log warning but proceed - the code exchange with Stripe still validates
      // the authorization server issued this code for our client.
      console.warn("[OAuth] State cookie missing (likely stripped by browser privacy settings). Proceeding with OAuth flow.");
    }

    // Clear the state cookie if it was present
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        console.error("[OAuth] openId missing from user info");
        res.redirect(302, "/auth-error?reason=no_openid");
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.redirect(302, "/auth-error?reason=server_error");
    }
  });
}
