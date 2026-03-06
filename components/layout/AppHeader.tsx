"use client";

import { usePathname } from "next/navigation";
import { formatSectionTitle } from "@/lib/utils";

export function AppHeader() {
  const pathname = usePathname();
  const sectionTitle = formatSectionTitle(pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-primary)]/10 bg-white">
      <div className="mx-auto flex h-16 w-full max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <h2 className="truncate text-base font-bold text-[var(--color-text)] lg:hidden">{sectionTitle}</h2>
          <label className="relative hidden w-[420px] md:block lg:w-[500px]">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-neutral-600)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              placeholder="Search vendors, partners, or assessments..."
              className="h-10 w-full rounded-lg border border-transparent bg-[var(--color-neutral-100)] pl-10 pr-4 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]/20 focus:ring-2 focus:ring-[var(--color-primary)]/10"
              aria-label="Search"
            />
          </label>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="rounded-lg p-2 text-[var(--color-neutral-700)] transition hover:text-[var(--color-primary)]"
            aria-label="Notificações"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
              <path d="M9 17a3 3 0 0 0 6 0" />
            </svg>
          </button>

          <button
            type="button"
            className="hidden rounded-lg p-2 text-[var(--color-neutral-700)] transition hover:text-[var(--color-primary)] sm:block"
            aria-label="Ajuda"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4" />
              <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
            </svg>
          </button>

          <button
            type="button"
            className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-white transition hover:brightness-95"
          >
            Novo caso
          </button>

          <div className="mx-1 hidden h-8 w-px bg-[var(--color-neutral-200)] sm:block" />

          <div className="flex items-center gap-2 rounded-lg border border-[var(--color-neutral-200)] bg-white px-2 py-1.5">
            <div className="hidden text-right md:block">
              <p className="text-sm font-bold text-[var(--color-text)] leading-tight">Jeff Brito</p>
              <p className="text-[11px] font-medium text-[var(--color-neutral-600)]">Risk Administrator</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--color-primary)]/20 bg-[var(--color-neutral-100)] text-xs font-bold text-[var(--color-secondary)]">
              JB
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
