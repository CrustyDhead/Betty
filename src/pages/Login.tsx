import { useState, type FormEvent } from "react";
import { loginExisting, redeemSignupCode, requestSignupCode } from "../lib/store";

export function Login() {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requesting, setRequesting] = useState(false);

  function switchMode(next: "existing" | "new") {
    setMode(next);
    setError(null);
    setInfo(null);
    setPin("");
    setCode("");
  }

  async function handleExistingSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter your name");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const user = await loginExisting(name, pin);
      if (!user) {
        setError("No account with that name yet — switch to \"New here?\" below.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestCode() {
    if (!name.trim()) {
      setError("Enter your name first");
      return;
    }
    setError(null);
    setInfo(null);
    setRequesting(true);
    try {
      await requestSignupCode(name);
      setInfo("Code requested — ask an admin to tell you the code, then enter it below.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRequesting(false);
    }
  }

  async function handleRedeemSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter your name");
      return;
    }
    if (!code.trim()) {
      setError("Enter the code an admin gave you");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await redeemSignupCode(name, code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-(--color-surface) p-8 shadow-sm shadow-black/5">
        <h1 className="font-display text-2xl font-semibold text-(--color-ink)">MizuHeng888</h1>
        <p className="mt-1 text-sm text-(--color-ink-soft)">No real money. Pure bragging rights.</p>

        <div className="mt-6 flex gap-1.5 rounded-xl bg-(--color-bg) p-1">
          <button
            type="button"
            onClick={() => switchMode("existing")}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${
              mode === "existing" ? "bg-(--color-surface) text-(--color-ink) shadow-sm" : "text-(--color-ink-soft)"
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => switchMode("new")}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${
              mode === "new" ? "bg-(--color-surface) text-(--color-ink) shadow-sm" : "text-(--color-ink-soft)"
            }`}
          >
            New here?
          </button>
        </div>

        {mode === "existing" ? (
          <form onSubmit={handleExistingSubmit}>
            <label className="mt-5 block text-sm font-medium text-(--color-ink)">
              Your name
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sai"
                className="mt-1.5 w-full rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-(--color-yes-text)"
              />
            </label>

            <label className="mt-4 block text-sm font-medium text-(--color-ink)">
              Team PIN
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-(--color-yes-text)"
              />
            </label>

            {error && <p className="mt-3 text-sm text-(--color-no-text)">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full rounded-xl bg-(--color-ink) py-2.5 font-display text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Entering…" : "Enter"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRedeemSubmit}>
            <label className="mt-5 block text-sm font-medium text-(--color-ink)">
              Your name
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sai"
                className="mt-1.5 w-full rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-(--color-yes-text)"
              />
            </label>

            <button
              type="button"
              onClick={handleRequestCode}
              disabled={requesting}
              className="mt-3 w-full rounded-xl bg-(--color-bg) py-2 text-xs font-medium text-(--color-ink-soft) transition hover:text-(--color-ink) disabled:opacity-60"
            >
              {requesting ? "Requesting…" : "Don't have a code yet? Request one"}
            </button>

            <label className="mt-4 block text-sm font-medium text-(--color-ink)">
              Access code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6-digit code from an admin"
                className="mt-1.5 w-full rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-(--color-yes-text)"
              />
            </label>

            {info && <p className="mt-3 text-sm text-(--color-yes-text)">{info}</p>}
            {error && <p className="mt-3 text-sm text-(--color-no-text)">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full rounded-xl bg-(--color-ink) py-2.5 font-display text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Joining…" : "Join"}
            </button>

            <p className="mt-4 text-xs text-(--color-ink-soft)">
              New teammates need an access code from an admin — ask in person or on chat.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
