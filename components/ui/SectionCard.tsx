import { cn } from "@/lib/utils";

type SectionCardProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
};

export function SectionCard({ title, description, children, className }: SectionCardProps) {
  return (
    <section className={cn("rounded-2xl border border-[var(--color-neutral-200)] bg-white p-5 shadow-sm", className)}>
      <header className="mb-4">
        <h2 className="text-base font-semibold text-[var(--color-text)]">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-[var(--color-neutral-600)]">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
