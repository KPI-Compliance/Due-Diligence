import { cn } from "@/lib/utils";

type Status =
  | "low"
  | "medium"
  | "high"
  | "critical"
  | "pending"
  | "in_review"
  | "sent"
  | "completed"
  | "responded";

type StatusBadgeProps = {
  status: Status;
  className?: string;
};

const statusConfig: Record<Status, { label: string; className: string }> = {
  low: {
    label: "Baixo",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  },
  medium: {
    label: "Médio",
    className: "bg-amber-50 text-amber-700 ring-amber-100",
  },
  high: {
    label: "Alto",
    className: "bg-orange-50 text-orange-700 ring-orange-100",
  },
  critical: {
    label: "Crítico",
    className: "bg-rose-50 text-rose-700 ring-rose-100",
  },
  pending: {
    label: "Pendente",
    className: "bg-slate-100 text-slate-700 ring-slate-200",
  },
  in_review: {
    label: "Em revisão",
    className: "bg-blue-50 text-blue-700 ring-blue-100",
  },
  sent: {
    label: "Enviado",
    className: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  },
  responded: {
    label: "Respondido",
    className: "bg-cyan-50 text-cyan-700 ring-cyan-100",
  },
  completed: {
    label: "Concluído",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
