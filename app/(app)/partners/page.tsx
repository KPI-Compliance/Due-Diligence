import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EntityWorkspace } from "@/components/ui/EntityWorkspace";
import { getPartnersList, markAssessmentCompletedManually, markAssessmentInReviewManually, markAssessmentRespondedManually } from "@/lib/data";

export const dynamic = "force-dynamic";

const filters = [
  { label: "Partner", kind: "text" as const, placeholder: "Filter by partner name" },
  { label: "Assessment Status", kind: "select" as const, options: ["All", "Pending", "In Review", "Completed"] },
  { label: "Risk Level", kind: "select" as const, options: ["All Risks", "Low", "Medium", "High", "Critical"] },
  { label: "Owner", kind: "select" as const, options: ["All Owners"] },
  { label: "Date Range", kind: "button" as const, buttonText: "Last 60 days", className: "sm:max-w-[220px]" },
];

function renderAssessmentBadge(label: string) {
  const normalized = label.toLowerCase();
  const className =
    normalized === "completed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : normalized === "in review"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-100 text-slate-700";

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>{label}</span>;
}

function WorkflowIcon({ kind }: { kind: "responded" | "review" | "finalize" | "details" }) {
  if (kind === "responded") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 12h16" />
        <path d="m13 5 7 7-7 7" />
      </svg>
    );
  }

  if (kind === "review") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="6" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    );
  }

  if (kind === "finalize") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m5 12 4 4L19 6" />
      </svg>
    );
  }

  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="6" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="18" r="1.8" />
    </svg>
  );
}

async function markAsRespondedAction(formData: FormData) {
  "use server";

  const id = String(formData.get("assessment_id") ?? "").trim();
  if (!id) return;

  await markAssessmentRespondedManually(id);

  revalidatePath("/vendors");
  revalidatePath("/partners");
  revalidatePath("/dashboard");
  redirect("/partners?updated=responded");
}

async function markAsInReviewAction(formData: FormData) {
  "use server";

  const id = String(formData.get("assessment_id") ?? "").trim();
  if (!id) return;

  await markAssessmentInReviewManually(id);

  revalidatePath("/vendors");
  revalidatePath("/partners");
  revalidatePath("/dashboard");
  redirect("/partners?updated=in_review");
}

async function markAsCompletedAction(formData: FormData) {
  "use server";

  const id = String(formData.get("assessment_id") ?? "").trim();
  if (!id) return;

  await markAssessmentCompletedManually(id);

  revalidatePath("/vendors");
  revalidatePath("/partners");
  revalidatePath("/dashboard");
  redirect("/partners?updated=completed");
}

export default async function PartnersPage({
  searchParams,
}: {
  searchParams?: Promise<{ updated?: string }>;
}) {
  const partners = await getPartnersList();
  const params = searchParams ? await searchParams : undefined;

  return (
    <div className="space-y-4">
      {params?.updated ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {params.updated === "responded"
            ? "Partner atualizado para RESPONDED."
            : params.updated === "in_review"
              ? "Partner movido para revisão."
              : "Partner finalizado."}
        </div>
      ) : null}
      <EntityWorkspace
        title="Partners"
        description="Acompanhe partners pela etapa da analise e pelo resultado final consolidado de Privacy, Security e Compliance."
        actionLabel="New Partner"
        secondaryActionLabel="Export"
        filters={filters}
        columns={[
          "Company",
          "Empresa",
          "Segment",
          "Assessment Status",
          "Privacy",
          "Security",
          "Compliance",
          "Final Risk",
          "Owner",
          "Last Review",
          "Workflow",
        ]}
        tableFooterText={`Showing 1 to ${partners.length} of ${partners.length} partners`}
        summary={[
          {
            label: "Pending",
            value: partners.filter((v) => v.assessmentStatus === "Pending").length.toString(),
            note: "Partners aguardando avance da avaliacao",
            tone: "primary",
          },
          {
            label: "Completed",
            value: partners.filter((v) => v.assessmentStatus === "Completed").length.toString(),
            note: "Partners com analise encerrada",
            tone: "success",
          },
          {
            label: "Critical",
            value: partners.filter((v) => v.risk === "Critical").length.toString(),
            note: "Risco final consolidado entre as 3 areas",
            tone: "danger",
          },
        ]}
        rows={partners.map((item) => (
          <tr key={item.id} className="hover:bg-[var(--color-neutral-100)]/40 transition-colors">
            <td className="px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--color-neutral-100)] text-xs font-bold text-[var(--color-neutral-600)]">
                  {item.company[0]}
                </div>
                <div>
                  <Link href={`/partners/${item.id}`} className="text-sm font-bold text-[var(--color-text)] hover:text-[var(--color-primary)]">
                    {item.company}
                  </Link>
                  <p className="text-[11px] text-[var(--color-neutral-600)]">{item.domain}</p>
                </div>
              </div>
            </td>
            <td className="px-6 py-4 text-sm font-medium text-[var(--color-neutral-700)]">{item.companyGroup}</td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-700)]">{item.segment}</td>
            <td className="px-6 py-4">{renderAssessmentBadge(item.assessmentStatus)}</td>
            <td className="px-6 py-4 text-sm font-medium text-[var(--color-neutral-700)]">{item.privacyRisk ?? "-"}</td>
            <td className="px-6 py-4 text-sm font-medium text-[var(--color-neutral-700)]">{item.securityRisk ?? "-"}</td>
            <td className="px-6 py-4 text-sm font-medium text-[var(--color-neutral-700)]">{item.complianceRisk ?? "-"}</td>
            <td className="px-6 py-4">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${item.riskClass}`}>
                <span className={`h-2 w-2 rounded-full ${item.riskDot}`} />
                {item.risk}
              </span>
            </td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-700)]">{item.owner}</td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-600)]">{item.lastReview}</td>
            <td className="px-6 py-4 text-right">
              <div className="flex items-center justify-end gap-2">
                {item.activeAssessmentId && (item.activeAssessmentStatus === "pending" || item.activeAssessmentStatus === "sent") ? (
                  <form action={markAsRespondedAction}>
                    <input type="hidden" name="assessment_id" value={item.activeAssessmentId} />
                    <button
                      type="submit"
                      aria-label={`Marcar ${item.company} como responded`}
                      title="Marcar como responded"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    >
                      <WorkflowIcon kind="responded" />
                    </button>
                  </form>
                ) : null}
                {item.activeAssessmentId && item.activeAssessmentStatus === "responded" ? (
                  <form action={markAsInReviewAction}>
                    <input type="hidden" name="assessment_id" value={item.activeAssessmentId} />
                    <button
                      type="submit"
                      aria-label={`Enviar ${item.company} para revisão`}
                      title="Enviar para revisão"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    >
                      <WorkflowIcon kind="review" />
                    </button>
                  </form>
                ) : null}
                {item.activeAssessmentId && item.activeAssessmentStatus === "in_review" ? (
                  <form action={markAsCompletedAction}>
                    <input type="hidden" name="assessment_id" value={item.activeAssessmentId} />
                    <button
                      type="submit"
                      aria-label={`Finalizar análise de ${item.company}`}
                      title="Finalizar análise"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                    >
                      <WorkflowIcon kind="finalize" />
                    </button>
                  </form>
                ) : null}
                <Link
                  href={`/partners/${item.id}`}
                  aria-label={`Abrir detalhes de ${item.company}`}
                  title="Abrir detalhes"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-neutral-200)] text-[var(--color-neutral-600)] transition hover:text-[var(--color-primary)]"
                >
                  <WorkflowIcon kind="details" />
                </Link>
              </div>
            </td>
          </tr>
        ))}
      />
    </div>
  );
}
