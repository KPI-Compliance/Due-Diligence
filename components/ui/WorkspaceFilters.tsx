"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type WorkspaceFilterControl = {
  name: string;
  label: string;
  kind: "text" | "select" | "button";
  placeholder?: string;
  options?: string[];
  buttonText?: string;
  className?: string;
  value?: string;
};

export function WorkspaceFilters({
  filters,
}: {
  filters: WorkspaceFilterControl[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [textValues, setTextValues] = useState<Record<string, string>>(
    Object.fromEntries(filters.filter((filter) => filter.kind === "text").map((filter) => [filter.name, filter.value ?? ""])),
  );

  useEffect(() => {
    setTextValues(
      Object.fromEntries(filters.filter((filter) => filter.kind === "text").map((filter) => [filter.name, filter.value ?? ""])),
    );
  }, [filters]);

  const updateQuery = (name: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const normalized = value.trim();

    if (normalized.length === 0) {
      params.delete(name);
    } else {
      params.set(name, normalized);
    }

    startTransition(() => {
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  };

  useEffect(() => {
    const entries = Object.entries(textValues);
    if (entries.length === 0) return;

    const timeout = window.setTimeout(() => {
      for (const [name, value] of entries) {
        const currentValue = searchParams.get(name) ?? "";
        if (currentValue !== value.trim()) {
          updateQuery(name, value);
        }
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [textValues, searchParams]);

  return (
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
                value={textValues[filter.name] ?? ""}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setTextValues((current) => ({ ...current, [filter.name]: nextValue }));
                }}
                className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-primary)]/40 focus:ring-2 focus:ring-[var(--color-primary)]/10"
              />
            ) : null}
            {filter.kind === "select" ? (
              <select
                value={filter.value ?? filter.options?.[0] ?? ""}
                onChange={(event) => updateQuery(filter.name, event.target.value)}
                className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-primary)]/40 focus:ring-2 focus:ring-[var(--color-primary)]/10"
              >
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
        <div className="flex min-w-[180px] items-end gap-2">
          <a
            href={pathname}
            className="rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-neutral-700)] transition hover:bg-[var(--color-neutral-100)]"
          >
            Limpar
          </a>
          {isPending ? <span className="text-xs text-[var(--color-neutral-600)]">Atualizando...</span> : null}
        </div>
      </div>
    </section>
  );
}
