import { useEffect, useState } from "react";

function format(msLeft: number) {
  if (msLeft <= 0) return "LOCKED";
  const totalMinutes = Math.floor(msLeft / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function Countdown({ lockTime }: { lockTime: string }) {
  const target = new Date(lockTime).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const msLeft = target - now;
  const locked = msLeft <= 0;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 font-mono text-xs font-medium ${
        locked ? "bg-gray-100 text-(--color-ink-soft)" : "bg-(--color-yes-soft) text-(--color-yes)"
      }`}
    >
      {format(msLeft)}
    </span>
  );
}
