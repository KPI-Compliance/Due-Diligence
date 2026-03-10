import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EntityWorkspace } from "@/components/ui/EntityWorkspace";
import { getVendorsList, markAssessmentCompletedManually, markAssessmentInReviewManually, markAssessmentRespondedManually } from "@/lib/data";

export const dynamic = "force-dynamic";

const filters = [
  { label: "Vendor", kind: "text" as const, placeholder: "Filter by vendor name" },
  { label: "Initial Questionnaire", kind: "select" as const, options: ["All", "Pending", "Sent", "Responded", "Analyzed"] },
  { label: "Main Questionnaire", kind: "select" as const, options: ["All", "Pending", "Responded"] },
  { label: "Risk Level", kind: "select" as const, options: ["All Risks", "Low", "Medium", "High", "Critical"] },
  { label: "Owner", kind: "select" as const, options: ["All Owners"] },
  { label: "Date Range", kind: "button" as const, buttonText: "Last 90 days", className: "sm:max-w-[220px]" },
];

function renderWorkflowBadge(label: string) {
  const normalized = label.toLowerCase();
  const className =
    normalized === "analyzed"
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : normalized === "responded"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : normalized === "sent"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-slate-100 text-slate-700";

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>{label}</span>;
}

async function markAsRespondedAction(formData: FormData) {
  "use server";

  const id = String(formData.get("assessment_id") ?? "").trim();
  if (!id) return;

  await markAssessmentRespondedManually(id);

  revalidatePath("/vendors");
  revalidatePath("/partners");
  revalidatePath("/dashboard");
  redirect("/vendors?updated=responded");
}

async function markAsInReviewAction(formData: FormData) {
  "use server";

  const id = String(formData.get("assessment_id") ?? "").trim();
  if (!id) return;

  await markAssessmentInReviewManually(id);

  revalidatePath("/vendors");
  revalidatePath("/partners");
  revalidatePath("/dashboard");
  redirect("/vendors?updated=in_review");
}

async function markAsCompletedAction(formData: FormData) {
  "use server";

  const id = String(formData.get("assessment_id") ?? "").trim();
  if (!id) return;

  await markAssessmentCompletedManually(id);

  revalidatePath("/vendors");
  revalidatePath("/partners");
  revalidatePath("/dashboard");
  redirect("/vendors?updated=completed");
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams?: Promise<{ updated?: string }>;
}) {
  const vendors = await getVendorsList();
  const params = searchParams ? await searchParams : undefined;

  return (
    <div className="space-y-4">
      {params?.updated ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {params.updated === "responded"
            ? "Vendor atualizado para RESPONDED."
            : params.updated === "in_review"
              ? "Vendor movido para análise."
              : "Vendor finalizado."}
        </div>
      ) : null}
      <EntityWorkspace
        title="Vendors"
        description="Centralize vendors e acompanhe o intake inicial, o questionário principal e o risco final por Privacy e Security."
        actionLabel="New Vendor"
        secondaryActionLabel="Export"
        filters={filters}
        columns={[
          "Company",
          "Empresa",
          "Segment",
          "Initial Questionnaire",
          "Main Questionnaire",
          "Final Risk",
          "Owner",
          "Last Review",
          "Actions",
        ]}
        tableFooterText={`Showing 1 to ${vendors.length} of ${vendors.length} vendors`}
        summary={[
          {
            label: "Initial Pending",
            value: vendors.filter((v) => v.intakeStatus === "Pending").length.toString(),
            note: "Vendors aguardando o primeiro questionario",
            tone: "primary",
          },
          {
            label: "Main Responded",
            value: vendors.filter((v) => v.principalQuestionnaireStatus === "Responded").length.toString(),
            note: "Questionario principal ja retornou dados",
            tone: "success",
          },
          {
            label: "Critical",
            value: vendors.filter((v) => v.risk === "Critical").length.toString(),
            note: "Maior risco final entre Privacy e Security",
            tone: "danger",
          },
        ]}
        rows={vendors.map((item) => (
          <tr key={item.id} className="hover:bg-[var(--color-neutral-100)]/40 transition-colors">
            <td className="px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--color-neutral-100)] text-xs font-bold text-[var(--color-neutral-600)]">
                  {item.company[0]}
                </div>
                <div>
                  <Link href={`/vendors/${item.id}`} className="text-sm font-bold text-[var(--color-text)] hover:text-[var(--color-primary)]">
                    {item.company}
                  </Link>
                  <p className="text-[11px] text-[var(--color-neutral-600)]">{item.domain}</p>
                </div>
              </div>
            </td>
            <td className="px-6 py-4 text-sm font-medium text-[var(--color-neutral-700)]">{item.companyGroup}</td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-700)]">{item.segment}</td>
            <td className="px-6 py-4">{renderWorkflowBadge(item.intakeStatus)}</td>
            <td className="px-6 py-4">{renderWorkflowBadge(item.principalQuestionnaireStatus)}</td>
            <td className="px-6 py-4">
              <div className="space-y-1">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${item.riskClass}`}>
                  <span className={`h-2 w-2 rounded-full ${item.riskDot}`} />
                  {item.risk}
                </span>
                <p className="text-[11px] text-[var(--color-neutral-600)]">
                  Privacy: {item.privacyRisk ?? "-"} | Security: {item.securityRisk ?? "-"}
                </p>
              </div>
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
                      ANALYZE
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
                      FINALIZE
                    </button>
                  </form>
                ) : null}
                <Link
                  href={`/vendors/${item.id}`}
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
