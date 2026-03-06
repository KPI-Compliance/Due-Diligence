import { cn } from "@/lib/utils";

type PageContainerProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function PageContainer({ title, description, actions, children, className }: PageContainerProps) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl space-y-6", className)}>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">{title}</h1>
          {description ? (
            <p className="mt-2 text-sm text-[var(--color-neutral-600)]">{description}</p>
          ) : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}
