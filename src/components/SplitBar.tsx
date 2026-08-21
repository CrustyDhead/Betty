interface SplitBarProps {
  yes: number;
  no: number;
  size?: "sm" | "lg";
}

export function SplitBar({ yes, no, size = "sm" }: SplitBarProps) {
  const total = yes + no;
  const yesPct = total === 0 ? 50 : (yes / total) * 100;
  const noPct = 100 - yesPct;
  const height = size === "lg" ? "h-3" : "h-2";

  return (
    <div className="w-full">
      <div className={`flex w-full overflow-hidden rounded-full bg-gray-100 ${height}`}>
        <div
          className="bg-(--color-yes) transition-[width] duration-500 ease-out"
          style={{ width: `${yesPct}%` }}
        />
        <div
          className="bg-(--color-no) transition-[width] duration-500 ease-out"
          style={{ width: `${noPct}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-xs text-(--color-ink-soft)">
        <span className="text-(--color-yes)">{Math.round(yesPct)}% YES</span>
        <span className="text-(--color-no)">{Math.round(noPct)}% NO</span>
      </div>
    </div>
  );
}
