import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getDashboardData } from "@/lib/data";

type DashboardBadgeStatus = React.ComponentProps<typeof StatusBadge>["status"];

export default async function DashboardPage() {
  const dashboard = await getDashboardData();

  return (
    <PageContainer
      title="Dashboard"
      description="Visão consolidada de risco, progresso de assessments e atividade recente de vendors e partners."
      className="space-y-8"
    >
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total Vendors" value={dashboard.stats.totalVendors.toString()} trend="Dados reais" trendDirection="neutral" />
        <StatCard label="Total Partners" value={dashboard.stats.totalPartners.toString()} trend="Dados reais" trendDirection="neutral" />
        <StatCard label="Pending Quests" value={dashboard.stats.pendingQuestionnaires.toString()} trend="Assessments pendentes ou enviados" trendDirection="neutral" />
        <StatCard label="Reviews in Analysis" value={dashboard.stats.reviewsInAnalysis.toString()} trend="Assessments em revisão" trendDirection="neutral" />
        <StatCard label="High Risk Entities" value={dashboard.stats.highRiskEntities.toString()} trend="Risco alto ou crítico" trendDirection="neutral" highlighted />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard
          title="Risk Distribution"
          description="Amostra atual por criticidade para entidades monitoradas."
          className="p-6"
        >
          <div className="flex h-48 items-end justify-between gap-4 px-2">
            {dashboard.riskDistribution.map((risk) => (
              <div key={risk.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="relative flex w-full items-end overflow-hidden rounded-lg bg-[var(--color-neutral-100)]" style={risk.heightStyle}>
                  <div className={`absolute bottom-0 h-full w-full ${risk.fillClass}`} />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">{risk.label}</p>
                <p className="text-xs font-semibold text-[var(--color-text)]">{risk.value}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Assessment Status"
          description="Distribuição atual dos assessments por estágio operacional."
          className="p-6"
        >
          <div className="space-y-4">
            {dashboard.assessmentStatus.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)]/60 px-4 py-3">
                <p className="text-sm font-semibold text-[var(--color-text)]">{item.label}</p>
                <p className="text-2xl font-black text-[var(--color-primary)]">{item.value}</p>
              </div>
            ))}
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
              {dashboard.recentActivity.map((activity) => (
                <tr key={activity.id} className="border-b border-[var(--color-neutral-100)] hover:bg-[var(--color-neutral-100)]/40">
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
                    <StatusBadge status={activity.status as DashboardBadgeStatus} />
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
          <p className="text-sm text-[var(--color-neutral-600)]">Mostrando {dashboard.recentActivity.length} entidades atualizadas mais recentemente</p>
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
