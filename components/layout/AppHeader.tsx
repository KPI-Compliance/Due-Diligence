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
