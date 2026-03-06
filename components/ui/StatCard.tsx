import { cn } from "@/lib/utils";

type TrendDirection = "up" | "down" | "neutral";

type StatCardProps = {
  label: string;
  value: string;
  trend?: string;
  trendDirection?: TrendDirection;
  highlighted?: boolean;
  className?: string;
};

const trendStyles: Record<TrendDirection, string> = {
  up: "text-emerald-600",
  down: "text-orange-600",
  neutral: "text-[var(--color-neutral-600)]",
};

const trendIcon: Record<TrendDirection, string> = {
  up: "↗",
  down: "↘",
  neutral: "•",
};

export function StatCard({
  label,
  value,
  trend,
  trendDirection = "neutral",
  highlighted,
  className,
}: StatCardProps) {
  return (
    <article
      className={cn(
        "rounded-xl border bg-white p-5 shadow-sm",
        highlighted
          ? "border-[var(--color-primary)]/30 ring-1 ring-[var(--color-primary)]/15"
          : "border-[var(--color-neutral-200)]",
        className,
      )}
    >
      <p
        className={cn(
          "text-xs font-semibold uppercase tracking-[0.08em]",
          highlighted ? "text-[var(--color-primary)]" : "text-[var(--color-neutral-600)]",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-3xl font-bold tracking-tight",
          highlighted ? "text-[var(--color-primary)]" : "text-[var(--color-text)]",
        )}
      >
        {value}
      </p>
      {trend ? (
        <p className={cn("mt-2 flex items-center gap-1 text-xs font-semibold", trendStyles[trendDirection])}>
          <span aria-hidden>{trendIcon[trendDirection]}</span>
          {trend}
        </p>
      ) : null}
    </article>
  );
}
