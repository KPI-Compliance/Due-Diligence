import { notFound } from "next/navigation";
import { EntityDetailView } from "@/components/ui/EntityDetailView";
import { type DetailTabKey, partnerDetailMap } from "@/lib/entity-detail-data";

type PartnerDetailPageProps = {
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

export default async function PartnerDetailPage({ params, searchParams }: PartnerDetailPageProps) {
  const { id } = await params;
  const detail = partnerDetailMap[id];

  if (!detail) {
    notFound();
  }

  const tab = normalizeTab((await searchParams).tab);

  return <EntityDetailView kind="partner" basePath={`/partners/${id}`} detail={detail} activeTab={tab} />;
}
