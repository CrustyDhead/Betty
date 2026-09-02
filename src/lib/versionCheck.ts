// Forces open tabs to pick up a new deploy automatically, instead of
// everyone running whatever bundle was loaded whenever they last opened the
// app. Vite content-hashes the built JS filename (e.g.
// /assets/index-XXXXXX.js), so a new deploy always changes it — this
// periodically re-fetches the deployed index.html and compares that
// filename against the one currently running. A mismatch means a newer
// build exists, so the page reloads to fetch it.
//
// No-op in dev (main.tsx is served directly as an unhashed ES module, so
// there's no bundle filename to compare — Vite's own HMR handles dev
// reloads already).

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const BUNDLE_SRC_PATTERN = /src="(\/assets\/index-[^"]+\.js)"/;

function currentBundleSrc(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  return script?.getAttribute("src") ?? null;
}

async function checkForNewVersion(runningSrc: string) {
  try {
    const res = await fetch("/", { cache: "no-store" });
    const html = await res.text();
    const latestSrc = html.match(BUNDLE_SRC_PATTERN)?.[1];
    if (!latestSrc || latestSrc === runningSrc) return;

    // Don't yank someone out of a live poker/blackjack hand — a reload
    // doesn't run any of the app's own leave/fold logic, it just drops the
    // tab, which reads as the app randomly kicking them and folding them.
    // Deferring here just means this check's normal cadence (every 5min,
    // or on refocus) tries again later, once they're between hands.
    const { isPlayerMidHand } = await import("./store");
    if (isPlayerMidHand()) return;

    window.location.reload();
  } catch {
    // network hiccup — just try again next interval
  }
}

export function startVersionCheck() {
  const runningSrc = currentBundleSrc();
  if (!runningSrc) return; // dev mode — nothing to compare

  setInterval(() => checkForNewVersion(runningSrc), CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForNewVersion(runningSrc);
  });
}
