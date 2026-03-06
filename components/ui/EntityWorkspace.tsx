import { PageContainer } from "@/components/layout/PageContainer";
import { cn } from "@/lib/utils";

type FilterControl = {
  label: string;
  kind: "text" | "select" | "button";
  placeholder?: string;
  options?: string[];
  buttonText?: string;
  className?: string;
};

type SummaryTone = "primary" | "success" | "danger";

type SummaryItem = {
  label: string;
  value: string;
  note: string;
  tone: SummaryTone;
};

type EntityWorkspaceProps = {
  title: string;
  description: string;
  actionLabel: string;
  secondaryActionLabel?: string;
  filters: FilterControl[];
  columns: string[];
  rows: React.ReactNode;
  tableFooterText: string;
  summary: SummaryItem[];
};

const toneStyles: Record<SummaryTone, { border: string; icon: string }> = {
  primary: {
    border: "border-[var(--color-primary)]",
    icon: "text-[var(--color-primary)]",
  },
  success: {
    border: "border-emerald-500",
    icon: "text-emerald-600",
  },
  danger: {
    border: "border-red-500",
    icon: "text-red-600",
  },
};

export function EntityWorkspace({
  title,
  description,
  actionLabel,
  secondaryActionLabel,
  filters,
  columns,
  rows,
  tableFooterText,
  summary,
}: EntityWorkspaceProps) {
  return (
    <PageContainer
      title={title}
      description={description}
      actions={
        <div className="flex gap-2">
          {secondaryActionLabel ? (
            <button
              type="button"
              className="rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-neutral-700)] transition hover:bg-[var(--color-neutral-100)]"
            >
              {secondaryActionLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:brightness-95"
          >
            {actionLabel}
          </button>
        </div>
      }
      className="space-y-6"
    >
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {summary.map((item) => {
          const tone = toneStyles[item.tone];

          return (
            <article
              key={item.label}
              className={cn("rounded-xl border border-l-4 border-[var(--color-neutral-200)] bg-white p-5 shadow-sm", tone.border)}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">{item.label}</h3>
                <span className={cn("text-sm", tone.icon)}>●</span>
              </div>
              <p className="text-3xl font-extrabold text-[var(--color-text)]">{item.value}</p>
              <p className="mt-1 text-xs text-[var(--color-neutral-600)]">{item.note}</p>
            </article>
          );
        })}
      </section>

      <section className="rounded-xl border border-[var(--color-neutral-200)] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          {filters.map((filter) => (
            <div key={filter.label} className={cn("min-w-[180px] flex-1", filter.className)}>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
                {filter.label}
              </label>
              {filter.kind === "text" ? (
                <input
                  type="text"
                  placeholder={filter.placeholder}
                  className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-primary)]/40 focus:ring-2 focus:ring-[var(--color-primary)]/10"
                />
              ) : null}
              {filter.kind === "select" ? (
                <select className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-primary)]/40 focus:ring-2 focus:ring-[var(--color-primary)]/10">
                  {filter.options?.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              ) : null}
              {filter.kind === "button" ? (
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-left text-sm"
                >
                  <span>{filter.buttonText}</span>
                  <span className="text-[var(--color-neutral-600)]">▾</span>
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--color-neutral-200)] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)]">
                {columns.map((column) => (
                  <th
                    key={column}
                    className={cn(
                      "px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]",
                      column === "Actions" ? "text-right" : "",
                    )}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-neutral-100)]">{rows}</tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-6 py-4">
          <p className="text-sm text-[var(--color-neutral-600)]">{tableFooterText}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-8 w-8 rounded border border-[var(--color-neutral-200)] bg-white text-sm text-[var(--color-neutral-600)]"
              disabled
            >
              ‹
            </button>
            <button type="button" className="h-8 w-8 rounded bg-[var(--color-primary)] text-xs font-bold text-white">
              1
            </button>
            <button
              type="button"
              className="h-8 w-8 rounded border border-[var(--color-neutral-200)] bg-white text-xs font-medium text-[var(--color-neutral-700)]"
            >
              2
            </button>
            <button
              type="button"
              className="h-8 w-8 rounded border border-[var(--color-neutral-200)] bg-white text-sm text-[var(--color-neutral-600)]"
            >
              ›
            </button>
          </div>
        </div>
      </section>
    </PageContainer>
  );
}
