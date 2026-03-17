"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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

function TextFilterInput({
  filter,
  currentValue,
  disabled,
  onCommit,
}: {
  filter: WorkspaceFilterControl;
  currentValue: string;
  disabled: boolean;
  onCommit: (name: string, value: string) => void;
}) {
  const [value, setValue] = useState(filter.value ?? "");

  useEffect(() => {
    if (value.trim() === currentValue.trim()) {
      return;
    }

    const timeout = window.setTimeout(() => {
      onCommit(filter.name, value);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [currentValue, filter.name, onCommit, value]);

  return (
    <input
      type="text"
      placeholder={filter.placeholder}
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
      }}
      disabled={disabled}
      className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-primary)]/40 focus:ring-2 focus:ring-[var(--color-primary)]/10 disabled:cursor-not-allowed disabled:opacity-70"
    />
  );
}

export function WorkspaceFilters({
  filters,
}: {
  filters: WorkspaceFilterControl[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const updateQuery = useCallback((name: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const normalized = value.trim();

    if (normalized.length === 0) {
      params.delete(name);
    } else {
      params.set(name, normalized);
    }

    startTransition(() => {
      const query = params.toString();
      if (query === searchParams.toString()) {
        return;
      }
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  }, [pathname, router, searchParams]);

  return (
    <section className="rounded-xl border border-[var(--color-neutral-200)] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-3">
        {filters.map((filter) => (
          <div key={filter.label} className={cn("min-w-[180px] flex-1", filter.className)}>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
              {filter.label}
            </label>
            {filter.kind === "text" ? (
              <TextFilterInput
                key={`${filter.name}:${filter.value ?? ""}`}
                filter={filter}
                currentValue={searchParams.get(filter.name) ?? ""}
                disabled={isPending}
                onCommit={updateQuery}
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
