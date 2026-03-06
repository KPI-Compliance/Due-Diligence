import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/ui/SectionCard";

export default function SettingsPage() {
  return (
    <PageContainer
      title="Settings"
      description="Configurações de governança, parâmetros de risco e preferências do sistema."
    >
      <SectionCard title="Módulo em construção" description="As configurações avançadas serão adicionadas em breve.">
        <p className="text-sm text-[var(--color-neutral-700)]">
          Próximo passo: incluir políticas, limites de risco e personalização de notificações.
        </p>
      </SectionCard>
    </PageContainer>
  );
}
