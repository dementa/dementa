// Sign-in for the Dementa cloud (Better Auth). Accounts live in a SQL database: Cloudflare D1 on
// Cloudflare, a SQLite file on this computer (worker/dev/server.ts). People sign in with a username
// or email and a password; the web version keeps them signed in with a cookie, the desktop app with
// a token (the bearer plugin), since it isn't on the same address as the cloud.

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { bearer, username } from "better-auth/plugins";
import type { Env } from "./types.ts";

/** Where Dementa OS itself runs; only these may call the cloud with someone's sign-in. */
export const DEFAULT_APP_ORIGINS = ["http://localhost:3000", "app://dementa"];

export const appOrigins = (env: Env) =>
  env.APP_ORIGINS ? env.APP_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean) : DEFAULT_APP_ORIGINS;

/** The settings, apart from starting Better Auth, so the dev server can make the tables first. */
export function authOptions(env: Env) {
  return {
    database: env.DB as never,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    trustedOrigins: appOrigins(env),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    plugins: [username({ minUsernameLength: 3, maxUsernameLength: 30 }), bearer()],
  } satisfies BetterAuthOptions;
}

export const createAuth = (env: Env) => betterAuth(authOptions(env));

export type Auth = ReturnType<typeof createAuth>;

// One instance per environment: Workers keep the same env between requests.
const instances = new WeakMap<Env, Auth>();

export function authFor(env: Env): Auth {
  let auth = instances.get(env);
  if (!auth) {
    auth = createAuth(env);
    instances.set(env, auth);
  }
  return auth;
}
