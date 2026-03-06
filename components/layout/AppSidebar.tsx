"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/vendors", label: "Vendors" },
  { href: "/partners", label: "Partners" },
  { href: "/assessments", label: "Assessments" },
  { href: "/reviews", label: "Reviews" },
  { href: "/settings", label: "Settings" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-64 shrink-0 border-r border-[var(--color-primary)]/10 bg-white lg:fixed lg:inset-y-0 lg:flex lg:flex-col">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3l7 4v5c0 5-3 8-7 9-4-1-7-4-7-9V7l7-4z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-[var(--color-text)]">Due Diligence VTEX</h1>
          <p className="text-xs font-medium text-[var(--color-neutral-600)]">Risk Management</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-4">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-colors",
                active
                  ? "bg-[var(--color-primary)] text-white font-semibold"
                  : "font-medium text-[var(--color-neutral-700)] hover:bg-[var(--color-primary)]/5 hover:text-[var(--color-primary)]",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-white" : "bg-[var(--color-neutral-600)]")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--color-primary)]/5 p-4">
        <div className="rounded-xl bg-[var(--color-primary)]/5 p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-primary)]">Storage Plan</p>
          <div className="mb-2 h-1.5 w-full rounded-full bg-white">
            <div className="h-1.5 w-3/4 rounded-full bg-[var(--color-primary)]" />
          </div>
          <p className="text-[10px] text-[var(--color-neutral-600)]">75% of data limit used.</p>
        </div>
      </div>
    </aside>
  );
}
