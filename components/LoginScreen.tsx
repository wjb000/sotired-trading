"use client";

import { FormEvent, useState } from "react";
import { unlock } from "@/lib/auth";

export function LoginScreen({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!unlock(password)) {
      setError("nah.");
      return;
    }
    onUnlock();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <div className="absolute left-6 top-6 font-mono text-[11px] tracking-[0.22em] text-gold-dim uppercase">
        private desk
      </div>
      <div className="w-full max-w-[420px]">
        <p className="font-mono text-[11px] tracking-[0.28em] text-gold uppercase">
          sotired trading
        </p>
        <h1 className="mt-3 font-serif text-6xl leading-none text-cream sm:text-7xl">
          sit down.
        </h1>
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-mute">
          Solana shitcoin desk. Trending names, buy/sell calls, and when to
          actually press the button.
        </p>
        <form onSubmit={onSubmit} className="mt-10">
          <label className="font-mono text-[11px] tracking-[0.2em] text-mute uppercase">
            password
          </label>
          <div className="mt-2 flex items-end gap-3 border-b border-gold/40 pb-2">
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent font-serif text-3xl text-cream outline-none placeholder:text-mute/40"
              placeholder="••••••"
              autoComplete="current-password"
            />
            <button
              type="submit"
              disabled={!password}
              className="shrink-0 font-mono text-[11px] tracking-[0.18em] text-gold uppercase disabled:opacity-40"
            >
              enter →
            </button>
          </div>
          {error ? (
            <p className="mt-3 font-mono text-sm text-stop">{error}</p>
          ) : (
            <p className="mt-3 font-mono text-[11px] text-mute">ask your brother.</p>
          )}
        </form>
      </div>
    </main>
  );
}
