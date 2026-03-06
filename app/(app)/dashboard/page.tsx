import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";

const recentActivities = [
  {
    company: "CloudScale Inc.",
    type: "Vendor",
    status: "low" as const,
    owner: "Alex Reed",
    updatedAt: "24 out 2025",
  },
  {
    company: "SwiftLogix",
    type: "Partner",
    status: "in_review" as const,
    owner: "Sarah Chen",
    updatedAt: "22 out 2025",
  },
  {
    company: "DataGuard Systems",
    type: "Vendor",
    status: "critical" as const,
    owner: "Marcio Silva",
    updatedAt: "19 out 2025",
  },
  {
    company: "Nexus Flows",
    type: "Partner",
    status: "pending" as const,
    owner: "Elena Gomez",
    updatedAt: "15 out 2025",
  },
];

const riskDistribution = [
  { label: "Critical", value: "12", height: "h-12", fill: "bg-[var(--color-primary)]/40" },
  { label: "High", value: "26", height: "h-24", fill: "bg-[var(--color-primary)]/60" },
  { label: "Medium", value: "44", height: "h-32", fill: "bg-[var(--color-primary)]/80" },
  { label: "Low", value: "68", height: "h-40", fill: "bg-[var(--color-primary)]" },
];

export default function DashboardPage() {
  return (
    <PageContainer
      title="Dashboard"
      description="Visão consolidada de risco, progresso de assessments e atividade recente de vendors e partners."
      className="space-y-8"
    >
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total Vendors" value="1,284" trend="2.4%" trendDirection="up" />
        <StatCard label="Total Partners" value="452" trend="1.1%" trendDirection="up" />
        <StatCard label="Pending Quests" value="28" trend="5.2%" trendDirection="down" />
        <StatCard label="Reviews in Analysis" value="15" trend="3.0%" trendDirection="up" />
        <StatCard label="High Risk Entities" value="12" trend="Stable" trendDirection="neutral" highlighted />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard
          title="Risk Distribution"
          description="Amostra atual por criticidade para entidades monitoradas."
          className="p-6"
        >
          <div className="flex h-48 items-end justify-between gap-4 px-2">
            {riskDistribution.map((risk) => (
              <div key={risk.label} className="flex flex-1 flex-col items-center gap-2">
                <div className={`relative w-full overflow-hidden rounded-lg bg-[var(--color-neutral-100)] ${risk.height}`}>
                  <div className={`absolute bottom-0 w-full ${risk.fill} h-full`} />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">{risk.label}</p>
                <p className="text-xs font-semibold text-[var(--color-text)]">{risk.value}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Assessment Completion Rate"
          description="Evolução de conclusão de assessments nos últimos 6 meses."
          className="p-6"
        >
          <div className="h-48">
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full">
              <path d="M0,35 Q10,25 20,28 T40,15 T60,22 T80,10 T100,18 L100,40 L0,40 Z" fill="rgba(247, 25, 100, 0.12)" />
              <path d="M0,35 Q10,25 20,28 T40,15 T60,22 T80,10 T100,18" fill="none" stroke="#F71964" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
            <span>Jan</span>
            <span>Feb</span>
            <span>Mar</span>
            <span>Apr</span>
            <span>May</span>
            <span>Jun</span>
          </div>
        </SectionCard>
      </section>

      <SectionCard title="Recent Activity" description="Últimas atualizações e mudanças de status dos casos.">
        <div className="mb-4 flex items-center justify-end">
          <button
            type="button"
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:brightness-95"
          >
            Add Entity
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[var(--color-neutral-100)] text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Last Update</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentActivities.map((activity) => (
                <tr key={activity.company} className="border-b border-[var(--color-neutral-100)] hover:bg-[var(--color-neutral-100)]/40">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--color-neutral-100)] text-xs font-bold text-[var(--color-neutral-600)]">
                        {activity.company[0]}
                      </div>
                      <span className="font-semibold text-[var(--color-text)]">{activity.company}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-[var(--color-neutral-700)]">{activity.type}</td>
                  <td className="px-4 py-4">
                    <StatusBadge status={activity.status} />
                  </td>
                  <td className="px-4 py-4 text-[var(--color-neutral-700)]">{activity.owner}</td>
                  <td className="px-4 py-4 text-[var(--color-neutral-700)]">{activity.updatedAt}</td>
                  <td className="px-4 py-4 text-right">
                    <button
                      type="button"
                      className="rounded-md p-1 text-[var(--color-secondary)] transition hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)]"
                      aria-label={`Ações de ${activity.company}`}
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="1.8" />
                        <circle cx="12" cy="12" r="1.8" />
                        <circle cx="12" cy="19" r="1.8" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-[var(--color-neutral-100)] pt-4">
          <p className="text-sm text-[var(--color-neutral-600)]">Showing 1 to 4 of 1,736 entities</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled
              className="rounded bg-[var(--color-neutral-100)] px-3 py-1 text-sm font-bold text-[var(--color-neutral-600)] disabled:opacity-60"
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded bg-[var(--color-neutral-100)] px-3 py-1 text-sm font-bold text-[var(--color-neutral-700)] transition hover:bg-[var(--color-neutral-200)]"
            >
              Next
            </button>
          </div>
        </div>
      </SectionCard>
    </PageContainer>
  );
}
