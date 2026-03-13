import { notFound } from "next/navigation";
import { EntityDetailView } from "@/components/ui/EntityDetailView";
import { getEntityDetailBySlug, normalizeTab } from "@/lib/data";

type VendorDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; section?: string }>;
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
    />
  );
}
