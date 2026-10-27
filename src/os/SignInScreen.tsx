"use client";

// The sign-in screen after starting up, like Windows' and macOS' own: sign in, make an account, or
// carry on without one (the apps work, but Files has nothing to show).

import { Loader2, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createAccount, currentAccount, signIn, type Account } from "./account";
import { WALLPAPERS, type WallpaperId } from "./apps";
import { DementaLogo } from "./common";

interface Props {
  wallpaper: WallpaperId;
  /** Signed in (an account), or carrying on without one (null). */
  onDone: (account: Account | null) => void;
}

export function SignInScreen({ wallpaper, onDone }: Props) {
  const [mode, setMode] = useState<"checking" | "signIn" | "create">("checking");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [details, setDetails] = useState({ name: "", username: "", email: "" });

  // Still signed in from last time? Then straight to the desktop.
  useEffect(() => {
    let live = true;
    currentAccount()
      .then((account) => {
        if (!live) return;
        if (account) onDone(account);
        else setMode("signIn");
      })
      .catch((err: Error) => {
        if (!live) return;
        setProblem(err.message);
        setMode("signIn");
      });
    return () => {
      live = false;
    };
  }, [onDone]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    const result = mode === "create" ? await createAccount({ ...details, password }) : await signIn(login, password);
    setBusy(false);
    if ("account" in result) onDone(result.account);
    else setProblem(result.problem);
  }

  const switchTo = (next: "signIn" | "create") => {
    setMode(next);
    setProblem(null);
    setPassword("");
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 text-white select-none" style={{ background: WALLPAPERS[wallpaper].css }}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      {mode === "checking" ? (
        <Loader2 size={32} className="relative animate-spin opacity-80" aria-label="Checking who's signed in" />
      ) : (
        <form onSubmit={submit} className="boot-fade relative flex w-full max-w-xs flex-col items-center gap-3">
          <span className="mb-1 flex h-24 w-24 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30 backdrop-blur">
            {mode === "create" ? <UserRound size={48} strokeWidth={1.5} /> : <DementaLogo size={56} />}
          </span>
          <h1 className="text-2xl font-light">{mode === "create" ? "Create your account" : "Sign in to Dementa"}</h1>

          {mode === "create" ? (
            <>
              <Field label="Your name" value={details.name} onChange={(name) => setDetails((d) => ({ ...d, name }))} autoComplete="name" autoFocus />
              <Field
                label="Username"
                value={details.username}
                onChange={(username) => setDetails((d) => ({ ...d, username }))}
                autoComplete="username"
                hint="3 to 30 letters or numbers. You sign in with it."
              />
              <Field
                label="Email (a parent's is fine)"
                type="email"
                value={details.email}
                onChange={(email) => setDetails((d) => ({ ...d, email }))}
                autoComplete="email"
              />
              <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" hint="At least 8 characters." />
            </>
          ) : (
            <>
              <Field label="Username or email" value={login} onChange={setLogin} autoComplete="username" autoFocus />
              <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
            </>
          )}

          {problem && (
            <p role="alert" className="w-full rounded-md bg-red-500/80 px-3 py-2 text-center text-sm">
              {problem}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !password || (mode === "create" ? !details.name.trim() || !details.username.trim() || !details.email.trim() : !login.trim())}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-white/90 py-2 font-medium text-slate-900 hover:bg-white disabled:opacity-50"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {mode === "create" ? "Create account" : "Sign in"}
          </button>

          <div className="mt-2 flex w-full flex-col items-center gap-1.5 text-sm">
            <LinkButton onClick={() => switchTo(mode === "create" ? "signIn" : "create")}>
              {mode === "create" ? "I already have an account" : "Create an account"}
            </LinkButton>
            <LinkButton onClick={() => onDone(null)}>Use without an account</LinkButton>
          </div>
        </form>
      )}
    </div>
  );
}

function Field(p: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex w-full flex-col gap-1 text-sm">
      <span className="sr-only">{p.label}</span>
      <input
        type={p.type ?? "text"}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        placeholder={p.label}
        autoComplete={p.autoComplete}
        autoFocus={p.autoFocus}
        autoCapitalize="off"
        spellCheck={false}
        className="w-full rounded-md border border-white/30 bg-white/15 px-3 py-2 text-white placeholder:text-white/70 outline-none select-text focus:border-white focus:bg-white/25"
      />
      {p.hint && <span className="px-1 text-xs text-white/75">{p.hint}</span>}
    </label>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded px-2 py-0.5 text-white/90 underline-offset-2 hover:underline">
      {children}
    </button>
  );
}
