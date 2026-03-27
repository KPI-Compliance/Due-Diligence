import { notFound } from "next/navigation";
import { EntityDetailView } from "@/components/ui/EntityDetailView";
import { getEntityDetailBySlug, normalizeTab } from "@/lib/data";

type VendorDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    section?: string;
    saved?: string;
    note_saved?: string;
    jira_error?: string;
    jira_synced?: string;
    status_guard?: string;
    sync_forced?: string;
    sync_error?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function VendorDetailPage({ params, searchParams }: VendorDetailPageProps) {
  const { id } = await params;
  const detail = await getEntityDetailBySlug("vendor", id);

  if (!detail) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const tab = normalizeTab(resolvedSearchParams.tab);

  return (
    <EntityDetailView
      kind="vendor"
      basePath={`/vendors/${id}`}
      detail={detail}
      activeTab={tab}
      activeQuestionnaireSection={resolvedSearchParams.section}
      saveStatus={resolvedSearchParams.saved}
      noteSaveStatus={resolvedSearchParams.note_saved}
      jiraErrorStatus={resolvedSearchParams.jira_error}
      jiraSyncStatus={resolvedSearchParams.jira_synced}
      statusGuardStatus={resolvedSearchParams.status_guard}
      syncForcedStatus={resolvedSearchParams.sync_forced}
      syncErrorStatus={resolvedSearchParams.sync_error}
    />
  );
}
