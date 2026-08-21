import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createBet } from "../lib/store";
import { useCurrentUser, useStoreState } from "../lib/useStore";
import { CATEGORIES, CATEGORY_EMOJI } from "../lib/categories";
import type { BetCategory } from "../types";

function defaultLockTime() {
  const d = new Date(Date.now() + 4 * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

export function CreateBet() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const state = useStoreState();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectUserId, setSubjectUserId] = useState("");
  const [category, setCategory] = useState<BetCategory>("WFH");
  const [lockTime, setLockTime] = useState(defaultLockTime());
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!title.trim()) {
      setError("Give it a title");
      return;
    }
    const lockDate = new Date(lockTime);
    if (Number.isNaN(lockDate.getTime()) || lockDate.getTime() <= Date.now()) {
      setError("Lock time must be in the future");
      return;
    }
    const bet = createBet({
      title: title.trim(),
      description: description.trim(),
      subjectUserId: subjectUserId || null,
      creatorId: user.id,
      lockTime: lockDate.toISOString(),
      category,
    });
    navigate(`/bets/${bet.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-display text-xl font-semibold text-(--color-ink)">Create a bet</h1>

      <form
        onSubmit={handleSubmit}
        className="mt-5 space-y-4 rounded-2xl bg-(--color-surface) p-6 shadow-sm shadow-black/5"
      >
        <label className="block text-sm font-medium text-(--color-ink)">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Will Nat WFH before 10am?"
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-(--color-yes)"
          />
        </label>

        <label className="block text-sm font-medium text-(--color-ink)">
          Description <span className="font-normal text-(--color-ink-soft)">(optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Any context that helps people decide"
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-(--color-yes)"
          />
        </label>

        <div>
          <p className="text-sm font-medium text-(--color-ink)">Category</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  category === c
                    ? "bg-(--color-ink) text-white"
                    : "bg-(--color-bg) text-(--color-ink-soft) hover:text-(--color-ink)"
                }`}
              >
                {CATEGORY_EMOJI[c]} {c}
              </button>
            ))}
          </div>
        </div>

        <label className="block text-sm font-medium text-(--color-ink)">
          Subject <span className="font-normal text-(--color-ink-soft)">(who's this about?)</span>
          <select
            value={subjectUserId}
            onChange={(e) => setSubjectUserId(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-(--color-yes)"
          >
            <option value="">Nobody in particular</option>
            {state.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-(--color-ink)">
          Lock time
          <input
            type="datetime-local"
            value={lockTime}
            onChange={(e) => setLockTime(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 font-mono text-sm outline-none focus:border-(--color-yes)"
          />
        </label>

        {error && <p className="text-sm text-(--color-no)">{error}</p>}

        <button
          type="submit"
          className="w-full rounded-xl bg-(--color-ink) py-2.5 font-display text-sm font-semibold text-white transition hover:opacity-90"
        >
          Open bet
        </button>
      </form>
    </div>
  );
}
