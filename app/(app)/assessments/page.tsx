import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EntityWorkspace } from "@/components/ui/EntityWorkspace";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  getAssessmentsList,
  markAssessmentCompletedManually,
  markAssessmentInReviewManually,
  markAssessmentRespondedManually,
} from "@/lib/data";

export const dynamic = "force-dynamic";

const filters = [
  { label: "Company", kind: "text" as const, placeholder: "Filter by company name" },
  { label: "Type", kind: "select" as const, options: ["All Types", "Vendor", "Partner"] },
  {
    label: "Status",
    kind: "select" as const,
    options: ["All Status", "Pending", "Sent", "Responded", "In Review", "Completed"],
  },
  { label: "Risk Level", kind: "select" as const, options: ["All Risks", "Low", "Medium", "High", "Critical"] },
  { label: "Date Range", kind: "button" as const, buttonText: "Last 30 days", className: "sm:max-w-[220px]" },
];

async function markAsRespondedAction(formData: FormData) {
  "use server";

  const id = String(formData.get("assessment_id") ?? "").trim();
  if (!id) return;

  await markAssessmentRespondedManually(id);

  revalidatePath("/assessments");
  revalidatePath("/vendors");
  revalidatePath("/partners");
  revalidatePath("/dashboard");
  redirect("/assessments?updated=responded");
}

async function markAsInReviewAction(formData: FormData) {
  "use server";

  const id = String(formData.get("assessment_id") ?? "").trim();
  if (!id) return;

  await markAssessmentInReviewManually(id);

  revalidatePath("/assessments");
  revalidatePath("/vendors");
  revalidatePath("/partners");
  revalidatePath("/dashboard");
  redirect("/assessments?updated=in_review");
}

async function markAsCompletedAction(formData: FormData) {
  "use server";

  const id = String(formData.get("assessment_id") ?? "").trim();
  if (!id) return;

  await markAssessmentCompletedManually(id);

  revalidatePath("/assessments");
  revalidatePath("/vendors");
  revalidatePath("/partners");
  revalidatePath("/dashboard");
  redirect("/assessments?updated=completed");
}

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ updated?: string }>;
}) {
  const assessments = await getAssessmentsList();
  const params = searchParams ? await searchParams : undefined;

  return (
    <div className="space-y-4">
      {params?.updated ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {params.updated === "responded"
            ? "Assessment atualizado para RESPONDED."
            : params.updated === "in_review"
              ? "Assessment atualizado para IN_REVIEW."
              : "Assessment atualizado para COMPLETED."}
        </div>
      ) : null}
      <EntityWorkspace
        title="Assessments"
        description="Manage and monitor your ongoing vendor and partner due diligence processes."
        actionLabel="New Assessment"
        secondaryActionLabel="Export"
        filters={filters}
        columns={[
          "Company",
          "Empresa",
          "Type",
          "Status",
          "Risk",
          "Response Progress",
          "Analyst",
          "Sent Date",
          "Actions",
        ]}
        tableFooterText={`Showing 1 to ${assessments.length} of ${assessments.length} assessments`}
        summary={[
          {
            label: "In Progress",
            value: assessments.filter((a) => ["pending", "sent", "responded", "in_review"].includes(a.status)).length.toString(),
            note: "Assessments currently in workflow",
            tone: "primary",
          },
          {
            label: "Approved",
            value: assessments.filter((a) => a.status === "completed").length.toString(),
            note: "Completed assessment cycles",
            tone: "success",
          },
          {
            label: "High Risk",
            value: assessments.filter((a) => a.risk === "High" || a.risk === "Critical").length.toString(),
            note: "Requires C-Level sign-off",
            tone: "danger",
          },
        ]}
        rows={assessments.map((item) => (
          <tr key={item.id} className="hover:bg-[var(--color-neutral-100)]/40 transition-colors">
            <td className="px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--color-neutral-100)] text-xs font-bold text-[var(--color-neutral-600)]">
                  {item.company[0]}
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--color-text)]">{item.company}</p>
                  <p className="text-[11px] text-[var(--color-neutral-600)]">{item.domain}</p>
                </div>
              </div>
            </td>
            <td className="px-6 py-4 text-sm font-medium text-[var(--color-neutral-700)]">{item.companyGroup}</td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-700)]">{item.type}</td>
            <td className="px-6 py-4">
              <StatusBadge status={item.status} />
            </td>
            <td className="px-6 py-4">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${item.riskClass}`}>
                <span className={`h-2 w-2 rounded-full ${item.riskDot}`} />
                {item.risk}
              </span>
            </td>
            <td className="px-6 py-4">
              <div className="w-32">
                <p className="mb-1 text-[10px] font-medium text-[var(--color-neutral-700)]">{item.progress}%</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-neutral-100)]">
                  <div className={`h-full ${item.progressClass}`} style={{ width: `${item.progress}%` }} />
                </div>
              </div>
            </td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-700)]">{item.analyst}</td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-600)]">{item.sentDate}</td>
            <td className="px-6 py-4 text-right">
              <div className="flex items-center justify-end gap-2">
                {item.status === "pending" || item.status === "sent" ? (
                  <form action={markAsRespondedAction}>
                    <input type="hidden" name="assessment_id" value={item.id} />
                    <button
                      type="submit"
                      className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                    >
                      Marcar RESPONDED
                    </button>
                  </form>
                ) : null}
                {item.status === "responded" ? (
                  <form action={markAsInReviewAction}>
                    <input type="hidden" name="assessment_id" value={item.id} />
                    <button
                      type="submit"
                      className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 hover:bg-amber-100"
                    >
                      Iniciar Revisão
                    </button>
                  </form>
                ) : null}
                {item.status === "in_review" ? (
                  <form action={markAsCompletedAction}>
                    <input type="hidden" name="assessment_id" value={item.id} />
                    <button
                      type="submit"
                      className="rounded border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700 hover:bg-sky-100"
                    >
                      Concluir Assessment
                    </button>
                  </form>
                ) : null}
                <Link
                  href={item.type === "Vendor" ? `/vendors/${item.slug}` : `/partners/${item.slug}`}
                  className="inline-flex rounded p-1 text-[var(--color-neutral-600)] transition hover:text-[var(--color-primary)]"
                  aria-label={`Abrir detalhes de ${item.company}`}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="6" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="12" cy="18" r="1.8" />
                  </svg>
                </Link>
              </div>
            </td>
          </tr>
        ))}
      />
    </div>
  );
}
