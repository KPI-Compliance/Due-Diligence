import { notFound } from "next/navigation";
import { EntityDetailView } from "@/components/ui/EntityDetailView";
import { type DetailTabKey, vendorDetailMap } from "@/lib/entity-detail-data";

type VendorDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

function normalizeTab(tab?: string): DetailTabKey {
  const validTabs: DetailTabKey[] = [
    "overview",
    "internal_questionnaire",
    "external_questionnaire",
    "evidence",
    "security_review",
    "privacy_review",
    "decision",
  ];

  return validTabs.includes(tab as DetailTabKey) ? (tab as DetailTabKey) : "overview";
}

export default async function VendorDetailPage({ params, searchParams }: VendorDetailPageProps) {
  const { id } = await params;
  const detail = vendorDetailMap[id];

  if (!detail) {
    notFound();
  }

  const tab = normalizeTab((await searchParams).tab);

  return <EntityDetailView kind="vendor" basePath={`/vendors/${id}`} detail={detail} activeTab={tab} />;
}
