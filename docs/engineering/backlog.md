# Engineering Backlog

## Quick Wins

- Adicionar scripts `typecheck` e `test` no `package.json` para criar uma rotina minima de validacao antes de merge.
- Corrigir `components/ui/WorkspaceFilters.tsx` para evitar sincronizacao de estado via `useEffect` e reduzir re-render desnecessario.
- Trocar os dados mockados de `app/(app)/dashboard/page.tsx` por consultas reais ou marcar a pagina claramente como ambiente de demo.
- Substituir `img` por `next/image` nos pontos mais visiveis da UI para melhorar LCP e padronizar performance.
- Padronizar helpers de normalizacao e validacao que hoje aparecem espalhados entre `lib/data.ts`, `lib/typeform-sync.ts` e `lib/google-sheets.ts`.

## Medium Term

- Quebrar `lib/data.ts` em blocos menores por dominio, como vendors, partners, assessments e detail mapping.
- Extrair regras de transformacao e classificacao de `components/ui/EntityDetailView.tsx` para helpers e componentes por tab.
- Separar `app/(app)/settings/page.tsx` em actions, forms e validacoes menores para deixar a pagina mais legivel e testavel.
- Criar testes de integracao para os webhooks de Typeform e Jira, cobrindo idempotencia, validacao e mapeamento de entidade.
- Introduzir uma camada de servico/repositorio para consultas SQL mais repetidas, reduzindo duplicacao e o risco de query divergente.

## High Impact

- Construir uma pipeline de CI com `lint`, `typecheck` e testes basicos para impedir regressao estrutural.
- Implementar observabilidade simples para webhooks e syncs, com logs estruturados e pontos de auditoria.
- Migrar a obtencao de metrics e cards do dashboard para consultas reais com cache ou materialized views.
- Formalizar um domain layer para as entidades principais, separando persistencia, regra de negocio e apresentacao.
- Criar testes de regressao para os fluxos mais sensiveis: login, dashboard, vendors, settings e integracoes externas.

## Recommended Order

1. Fechar quick wins de qualidade e automacao.
2. Reduzir tamanho e acoplamento de `lib/data.ts` e `EntityDetailView`.
3. Separar `settings` em unidades menores.
4. Cobrir os fluxos de integracao com testes.
5. Levar dashboard e metrics para dados reais.

## Exit Criteria For This Backlog

- O projeto consegue rodar validacoes basicas sem depender de memoria manual.
- Os maiores arquivos deixam de concentrar varias responsabilidades ao mesmo tempo.
- O dashboard passa a refletir o sistema real.
- As integracoes criticas ganham testes e trilha de auditoria.
