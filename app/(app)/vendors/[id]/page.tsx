import { notFound } from "next/navigation";
import { EntityDetailView } from "@/components/ui/EntityDetailView";
import { getEntityDetailBySlug, normalizeTab } from "@/lib/data";

type VendorDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export const dynamic = "force-dynamic";

export default async function VendorDetailPage({ params, searchParams }: VendorDetailPageProps) {
  const { id } = await params;
  const detail = await getEntityDetailBySlug("vendor", id);

  if (!detail) {
    notFound();
  }

  const tab = normalizeTab((await searchParams).tab);

  return <EntityDetailView kind="vendor" basePath={`/vendors/${id}`} detail={detail} activeTab={tab} />;
}
