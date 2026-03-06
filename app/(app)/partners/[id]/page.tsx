import { notFound } from "next/navigation";
import { EntityDetailView } from "@/components/ui/EntityDetailView";
import { getEntityDetailBySlug, normalizeTab } from "@/lib/data";

type PartnerDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export const dynamic = "force-dynamic";

export default async function PartnerDetailPage({ params, searchParams }: PartnerDetailPageProps) {
  const { id } = await params;
  const detail = await getEntityDetailBySlug("partner", id);

  if (!detail) {
    notFound();
  }

  const tab = normalizeTab((await searchParams).tab);

  return <EntityDetailView kind="partner" basePath={`/partners/${id}`} detail={detail} activeTab={tab} />;
}
