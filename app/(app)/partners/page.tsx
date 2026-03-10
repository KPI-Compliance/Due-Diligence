import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EntityWorkspace } from "@/components/ui/EntityWorkspace";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getPartnersList, markAssessmentCompletedManually, markAssessmentInReviewManually, markAssessmentRespondedManually } from "@/lib/data";

export const dynamic = "force-dynamic";

const filters = [
  { label: "Partner", kind: "text" as const, placeholder: "Filter by partner name" },
  { label: "Status", kind: "select" as const, options: ["All Status", "Pending", "Sent", "In Review", "Completed"] },
  { label: "Risk Level", kind: "select" as const, options: ["All Risks", "Low", "Medium", "High", "Critical"] },
  { label: "Region", kind: "select" as const, options: ["All Regions"] },
  { label: "Date Range", kind: "button" as const, buttonText: "Last 60 days", className: "sm:max-w-[220px]" },
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
  redirect("/partners?updated=responded");
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
  redirect("/partners?updated=in_review");
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
            ? "Assessment atualizado para RESPONDED."
            : params.updated === "in_review"
              ? "Assessment atualizado para IN_REVIEW."
              : "Assessment atualizado para COMPLETED."}
        </div>
      ) : null}
      <EntityWorkspace
        title="Partners"
        description="Centralize strategic partners and track relationship risk across active due diligence cycles."
        actionLabel="New Partner"
        secondaryActionLabel="Export"
        filters={filters}
        columns={[
          "Company",
          "Empresa",
          "Segment",
          "Status",
          "Risk",
          "Open Assessments",
          "Owner",
          "Last Review",
          "Actions",
        ]}
        tableFooterText={`Showing 1 to ${partners.length} of ${partners.length} partners`}
        summary={[
          {
            label: "In Progress",
            value: partners.filter((v) => v.status === "in_review" || v.status === "pending" || v.status === "sent").length.toString(),
            note: "Partners with active due diligence workflows",
            tone: "primary",
          },
          {
            label: "Approved",
            value: partners.filter((v) => v.status === "completed").length.toString(),
            note: "Partners with completed assessments",
            tone: "success",
          },
          {
            label: "Critical",
            value: partners.filter((v) => v.risk === "Critical").length.toString(),
            note: "Executive attention required",
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
            <td className="px-6 py-4">
              <StatusBadge status={item.status} />
            </td>
            <td className="px-6 py-4">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${item.riskClass}`}>
                <span className={`h-2 w-2 rounded-full ${item.riskDot}`} />
                {item.risk}
              </span>
            </td>
            <td className="px-6 py-4 text-sm font-semibold text-[var(--color-text)]">{item.openAssessments}</td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-700)]">{item.owner}</td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-600)]">{item.lastReview}</td>
            <td className="px-6 py-4 text-right">
              <div className="flex items-center justify-end gap-2">
                {item.activeAssessmentId && (item.activeAssessmentStatus === "pending" || item.activeAssessmentStatus === "sent") ? (
                  <form action={markAsRespondedAction}>
                    <input type="hidden" name="assessment_id" value={item.activeAssessmentId} />
                    <button
                      type="submit"
                      className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                    >
                      RESPONDED
                    </button>
                  </form>
                ) : null}
                {item.activeAssessmentId && item.activeAssessmentStatus === "responded" ? (
                  <form action={markAsInReviewAction}>
                    <input type="hidden" name="assessment_id" value={item.activeAssessmentId} />
                    <button
                      type="submit"
                      className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 hover:bg-amber-100"
                    >
                      IN REVIEW
                    </button>
                  </form>
                ) : null}
                {item.activeAssessmentId && item.activeAssessmentStatus === "in_review" ? (
                  <form action={markAsCompletedAction}>
                    <input type="hidden" name="assessment_id" value={item.activeAssessmentId} />
                    <button
                      type="submit"
                      className="rounded border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700 hover:bg-sky-100"
                    >
                      COMPLETED
                    </button>
                  </form>
                ) : null}
                <Link
                  href={`/partners/${item.id}`}
                  aria-label={`Abrir detalhes de ${item.company}`}
                  className="inline-flex rounded p-1 text-[var(--color-neutral-600)] transition hover:text-[var(--color-primary)]"
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
