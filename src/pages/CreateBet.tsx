import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createBet, joinNames } from "../lib/store";
import { useCurrentUser, useStoreState } from "../lib/useStore";
import { CATEGORIES, CATEGORY_EMOJI } from "../lib/categories";
import type { BetCategory } from "../types";

function parseOtherNames(text: string): string[] {
  return text
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

function toLocalDateTimeValue(d: Date) {
  // datetime-local inputs read/write local wall-clock time, not UTC — build
  // the string from local components so it round-trips through new Date()
  // to the same instant regardless of timezone.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultLockTime() {
  return toLocalDateTimeValue(new Date(Date.now() + 4 * 60 * 60 * 1000));
}

// "Will X happen today?" bets read better locking at end-of-workday than a
// flat +4h — falls back to the usual default if it's already past that.
function endOfWorkdayLockTime() {
  const target = new Date();
  target.setHours(18, 0, 0, 0);
  return target.getTime() > Date.now() ? toLocalDateTimeValue(target) : defaultLockTime();
}

const QUICK_TEMPLATES: { category: BetCategory; emoji: string; label: string; question: (name: string) => string }[] = [
  { category: "WFH", emoji: "🏠", label: "WFH today?", question: (name) => `Will ${name} WFH today?` },
  { category: "Sick", emoji: "🤒", label: "Out sick?", question: (name) => `Will ${name} call in sick today?` },
  { category: "Late", emoji: "⏰", label: "Late today?", question: (name) => `Will ${name} be late today?` },
];

export function CreateBet() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const state = useStoreState();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectUserIds, setSubjectUserIds] = useState<string[]>([]);
  const [otherNamesText, setOtherNamesText] = useState("");
  const [category, setCategory] = useState<BetCategory>("WFH");
  const [lockTime, setLockTime] = useState(defaultLockTime());
  const [error, setError] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<(typeof QUICK_TEMPLATES)[number] | null>(null);

  function currentSubjectNames(otherText: string) {
    const registeredNames = subjectUserIds
      .map((id) => state.users.find((u) => u.id === id)?.name)
      .filter((n): n is string => !!n);
    return [...registeredNames, ...parseOtherNames(otherText)];
  }

  function applyTemplate(tpl: (typeof QUICK_TEMPLATES)[number]) {
    setActiveTemplate(tpl);
    setCategory(tpl.category);
    setLockTime(endOfWorkdayLockTime());
    const names = currentSubjectNames(otherNamesText);
    setTitle(tpl.question(names.length > 0 ? joinNames(names) : "___"));
  }

  function toggleSubject(id: string) {
    const next = subjectUserIds.includes(id)
      ? subjectUserIds.filter((x) => x !== id)
      : [...subjectUserIds, id];
    setSubjectUserIds(next);
    if (activeTemplate) {
      const registeredNames = next
        .map((uid) => state.users.find((u) => u.id === uid)?.name)
        .filter((n): n is string => !!n);
      const names = [...registeredNames, ...parseOtherNames(otherNamesText)];
      setTitle(activeTemplate.question(names.length > 0 ? joinNames(names) : "___"));
    }
  }

  function handleOtherNamesChange(text: string) {
    setOtherNamesText(text);
    if (activeTemplate) {
      const names = currentSubjectNames(text);
      setTitle(activeTemplate.question(names.length > 0 ? joinNames(names) : "___"));
    }
  }

  async function handleSubmit(e: FormEvent) {
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
    setError(null);
    try {
      const bet = await createBet({
        title: title.trim(),
        description: description.trim(),
        subjectUserIds,
        subjectNames: parseOtherNames(otherNamesText),
        creatorId: user.id,
        lockTime: lockDate.toISOString(),
        category,
      });
      navigate(`/bets/${bet.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-display text-xl font-semibold text-(--color-ink)">Create a bet</h1>

      <div className="mt-5 rounded-2xl bg-(--color-surface) p-6 shadow-sm shadow-black/5">
        <p className="text-sm font-medium text-(--color-ink)">Quick start</p>
        <p className="mt-0.5 text-xs text-(--color-ink-soft)">
          Tap one, then pick who it's about below — everything else fills in for you.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_TEMPLATES.map((tpl) => (
            <button
              key={tpl.category}
              type="button"
              onClick={() => applyTemplate(tpl)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                activeTemplate?.category === tpl.category
                  ? "bg-(--color-ink) text-white"
                  : "bg-(--color-bg) text-(--color-ink-soft) hover:text-(--color-ink)"
              }`}
            >
              {tpl.emoji} {tpl.label}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-4 space-y-4 rounded-2xl bg-(--color-surface) p-6 shadow-sm shadow-black/5"
      >
        <label className="block text-sm font-medium text-(--color-ink)">
          Title
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setActiveTemplate(null);
            }}
            placeholder="Will Nat WFH before 10am?"
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-(--color-yes-text)"
          />
        </label>

        <label className="block text-sm font-medium text-(--color-ink)">
          Description <span className="font-normal text-(--color-ink-soft)">(optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Any context that helps people decide"
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-(--color-yes-text)"
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

        <div>
          <p className="text-sm font-medium text-(--color-ink)">
            Subjects <span className="font-normal text-(--color-ink-soft)">(who's this about? pick any number)</span>
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {state.users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleSubject(u.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  subjectUserIds.includes(u.id)
                    ? "bg-(--color-ink) text-white"
                    : "bg-(--color-bg) text-(--color-ink-soft) hover:text-(--color-ink)"
                }`}
              >
                {u.name}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs font-normal text-(--color-ink-soft)">
            Anyone picked here can't wager on this bet themselves.
          </p>
        </div>

        <label className="block text-sm font-medium text-(--color-ink)">
          Other subjects <span className="font-normal text-(--color-ink-soft)">(not on the app yet, optional)</span>
          <input
            value={otherNamesText}
            onChange={(e) => handleOtherNamesChange(e.target.value)}
            placeholder="e.g. Ploy, Nat"
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-(--color-yes-text)"
          />
          <span className="mt-1 block text-xs font-normal text-(--color-ink-soft)">
            Comma-separated. They don't need an account for this — but they'll need one to bet themselves.
          </span>
        </label>

        <label className="block text-sm font-medium text-(--color-ink)">
          Lock time
          <input
            type="datetime-local"
            value={lockTime}
            onChange={(e) => setLockTime(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 font-mono text-sm outline-none focus:border-(--color-yes-text)"
          />
        </label>

        {error && <p className="text-sm text-(--color-no-text)">{error}</p>}

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
