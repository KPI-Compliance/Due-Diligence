import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/ui/SectionCard";

export default function ReviewsPage() {
  return (
    <PageContainer
      title="Reviews"
      description="Consolidação de pareceres, validações internas e decisões de aprovação."
    >
      <SectionCard title="Módulo em construção" description="As revisões e aprovações serão organizadas neste painel.">
        <p className="text-sm text-[var(--color-neutral-700)]">
          Próximo passo: habilitar trilha de revisão com histórico de comentários e decisão final.
        </p>
      </SectionCard>
    </PageContainer>
  );
}
