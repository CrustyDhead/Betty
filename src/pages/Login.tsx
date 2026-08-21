import { useState, type FormEvent } from "react";
import { login } from "../lib/store";

const TEAM_PIN = import.meta.env.VITE_TEAM_PIN as string | undefined;

export function Login() {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter a name");
      return;
    }
    if (TEAM_PIN && pin !== TEAM_PIN) {
      setError("Wrong team PIN");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-(--color-surface) p-8 shadow-sm shadow-black/5"
      >
        <h1 className="font-display text-2xl font-semibold text-(--color-ink)">MizuHeng888</h1>
        <p className="mt-1 text-sm text-(--color-ink-soft)">
          No real money. Pure bragging rights.
        </p>

        <label className="mt-6 block text-sm font-medium text-(--color-ink)">
          Your name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sai"
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-(--color-yes-text)"
          />
        </label>

        {TEAM_PIN && (
          <label className="mt-4 block text-sm font-medium text-(--color-ink)">
            Team PIN
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-(--color-yes-text)"
            />
          </label>
        )}

        {error && <p className="mt-3 text-sm text-(--color-no-text)">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-xl bg-(--color-ink) py-2.5 font-display text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Entering…" : "Enter"}
        </button>

        <p className="mt-4 text-xs text-(--color-ink-soft)">
          New name? You're in — starting balance is 1,000 tokens.
        </p>
      </form>
    </div>
  );
}
