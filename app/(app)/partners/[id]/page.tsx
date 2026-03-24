import { notFound } from "next/navigation";
import { EntityDetailView } from "@/components/ui/EntityDetailView";
import { getEntityDetailBySlug, normalizePartnerTab } from "@/lib/data";

type PartnerDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; section?: string; saved?: string; note_saved?: string; jira_error?: string; jira_synced?: string; status_guard?: string }>;
};

export const dynamic = "force-dynamic";

export default async function PartnerDetailPage({ params, searchParams }: PartnerDetailPageProps) {
  const { id } = await params;
  const detail = await getEntityDetailBySlug("partner", id);

  if (!detail) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const tab = normalizePartnerTab(resolvedSearchParams.tab);

  return (
    <EntityDetailView
      kind="partner"
      basePath={`/partners/${id}`}
      detail={detail}
      activeTab={tab}
      activeQuestionnaireSection={resolvedSearchParams.section}
      saveStatus={resolvedSearchParams.saved}
      noteSaveStatus={resolvedSearchParams.note_saved}
      jiraErrorStatus={resolvedSearchParams.jira_error}
      jiraSyncStatus={resolvedSearchParams.jira_synced}
      statusGuardStatus={resolvedSearchParams.status_guard}
    />
  );
}
