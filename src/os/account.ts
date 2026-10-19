// Signing in to the Dementa cloud (Better Auth; the cloud side is worker/src/auth.ts). The web
// version stays signed in with the cloud's cookie. The desktop app is at a different address from
// the cloud, so it keeps the sign-in token instead and hands it to the app (desktopBridge.ts),
// which adds it to every request to the cloud.

import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { API_URL } from "./cloud";
import { isDesktopApp } from "./desktopBridge";

const TOKEN_KEY = "dementa-os:cloud-token";
const OFFLINE = "Can't reach the Dementa cloud. Check the internet connection.";

export interface Account {
  name: string;
  username?: string | null;
  email: string;
}

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function keepToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage can be blocked; the desktop app then asks to sign in again next time.
  }
  window.dementa?.setCloudSignIn(token ? { cloud: cloudAddress(), token } : null);
}

const cloudAddress = () => API_URL || (typeof window === "undefined" ? "http://localhost" : window.location.origin);

const client = createAuthClient({
  baseURL: `${cloudAddress()}/api/auth`,
  plugins: [usernameClient()],
  fetchOptions: {
    auth: { type: "Bearer", token: () => (isDesktopApp() ? readToken() : undefined) },
    onSuccess: (context) => {
      const token = context.response.headers.get("set-auth-token");
      if (token && isDesktopApp()) keepToken(token);
    },
  },
});

/** Friendlier words for what the cloud says went wrong. */
function problem(error: { message?: string; code?: string; status?: number } | null): string {
  if (!error) return "Something went wrong. Please try again.";
  if (error.status === 0 || error.status === undefined) return OFFLINE;
  switch (error.code) {
    case "INVALID_USERNAME_OR_PASSWORD":
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That username or password isn't right.";
    case "USERNAME_IS_ALREADY_TAKEN":
      return "That username is taken. Try another one.";
    case "USERNAME_TOO_SHORT":
    case "USERNAME_TOO_LONG":
    case "INVALID_USERNAME":
      return "Usernames are 3 to 30 letters, numbers, dots or underscores.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "There's already an account with that email.";
    case "PASSWORD_TOO_SHORT":
      return "The password needs at least 8 characters.";
    case "INVALID_EMAIL":
      return "That email address doesn't look right.";
  }
  return error.message || "Something went wrong. Please try again.";
}

type Result = { account: Account } | { problem: string };

/** Runs a call to the cloud; one that can't get through at all becomes the offline message. */
async function attempt(call: () => Promise<Result>): Promise<Result> {
  try {
    return await call();
  } catch {
    return { problem: OFFLINE };
  }
}

const toAccount = (user: { name: string; email: string; username?: string | null }): Account => ({
  name: user.name,
  email: user.email,
  username: user.username,
});

/** Who's signed in on this computer, or null. Throws when the cloud can't be reached. */
export async function currentAccount(): Promise<Account | null> {
  if (isDesktopApp()) {
    const token = readToken();
    if (!token) return null;
    window.dementa?.setCloudSignIn({ cloud: cloudAddress(), token });
  }
  const { data, error } = await client.getSession();
  if (error && (error.status === 0 || error.status === undefined || error.status >= 500)) throw new Error(problem(error));
  return data?.user ? toAccount(data.user) : null;
}

/** Signs in with a username, or with an email when it has an @. */
export function signIn(login: string, password: string): Promise<Result> {
  const name = login.trim();
  return attempt(async () => {
    const { data, error } = name.includes("@")
      ? await client.signIn.email({ email: name, password })
      : await client.signIn.username({ username: name, password });
    return data?.user ? { account: toAccount(data.user) } : { problem: problem(error) };
  });
}

export function createAccount(details: { name: string; username: string; email: string; password: string }): Promise<Result> {
  return attempt(async () => {
    const { data, error } = await client.signUp.email({
      name: details.name.trim(),
      username: details.username.trim(),
      email: details.email.trim(),
      password: details.password,
    });
    return data?.user ? { account: toAccount(data.user) } : { problem: problem(error) };
  });
}

export async function signOut() {
  try {
    await client.signOut();
  } finally {
    if (isDesktopApp()) keepToken(null);
  }
}
