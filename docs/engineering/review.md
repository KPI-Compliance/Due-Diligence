# Engineering Review

## Executive Summary

O codebase e um app Next.js 16 com App Router, Server Components, Server Actions, SQL direto no Neon e varias integracoes de negocio (Typeform, Jira, Google Sheets e Google OAuth). A arquitetura funciona, mas hoje ela esta concentrada em poucos arquivos grandes, com bastante regra de negocio misturada a query, mapeamento e renderizacao de UI.

O maior risco tecnico nao e falta de funcionalidade, e sim concentracao de complexidade. Isso aparece principalmente em `lib/data.ts`, `components/ui/EntityDetailView.tsx` e `app/(app)/settings/page.tsx`. O resultado e um sistema dificil de testar, caro de evoluir e com risco elevado de regressao quando um fluxo muda.

## Architecture Snapshot

- Frontend e backend vivem no mesmo app Next.js, com paginas server-rendered para dashboard, vendors, partners, assessments e settings.
- A camada de dados usa `@neondatabase/serverless` via um helper simples em `lib/db.ts`.
- A camada de dominio centraliza transformacoes e queries em `lib/data.ts`.
- Integracoes externas estao isoladas em rotas `app/api/*` e em helpers como `lib/typeform.ts`, `lib/jira.ts` e `lib/google-sheets.ts`.
- A configuracao operacional fica em tabelas de banco como `integration_settings`, `platform_settings` e `typeform_forms`.

## Main Findings

- `lib/data.ts` funciona como um "god module" de leitura e mapeamento de dominio. Ele concentra queries de vendors, partners, assessments e detail views em um unico arquivo enorme, o que aumenta acoplamento e dificulta testes unitarios.
- `components/ui/EntityDetailView.tsx` acumula renderizacao, regras de classificacao, templates de questionnaire e logica de secao no mesmo componente. O arquivo e grande o suficiente para virar uma area de manutencao constante.
- `app/(app)/settings/page.tsx` concentra muito mais do que a pagina deveria: tabs, validacoes, server actions, normalizacao de config e redirecionamentos. O acoplamento entre UI e persistencia esta alto demais.
- `components/ui/WorkspaceFilters.tsx` usa sincronizacao de estado via `useEffect` e atualizacao de query string no mesmo componente, o que gera fragilidade e ja aparece como problema de lint no repositorio.
- `app/(app)/dashboard/page.tsx` ainda usa dados mockados para cards, grafico e atividade recente. Isso reduz a confianca operacional no dashboard, porque a pagina parece viva mas nao reflete o banco.
- `package.json` nao tem scripts de `typecheck` nem de testes. Hoje existe `build`, `lint` e dois backfills, mas falta o minimo de automacao para validar regressao com frequencia.

## Strengths

- O schema do banco e bem explicitado em migrations e usa enums, indices e constraints.
- As integracoes principais tem rotas dedicadas e idempotencia em pontos importantes, como Typeform.
- O projeto tem uma separacao razoavel entre UI (`components/`), dominio (`lib/`) e persistencia (`database/`), mesmo que a separacao ainda nao esteja madura.
- O README de banco e util para operacao e onboarding inicial.

## Prioritized Recommendations

1. Quebrar os grandes blocos de dominio e UI em unidades menores e testaveis.
2. Tirar dashboards e metrics de dados estaticos e conectar em fontes reais.
3. Criar uma camada mais clara de servicos/repositorio para consultas SQL.
4. Adicionar tipo-verificacao e testes basicos ao fluxo de desenvolvimento.
5. Padronizar validacao e transformacao de entradas em helpers compartilhados.

## Engineering Risks To Watch

- Alteracoes pequenas em `lib/data.ts` podem quebrar varios fluxos ao mesmo tempo.
- Mudancas no detalhe de entidade afetam vendor e partner porque a view e muito compartilhada.
- Settings e integracoes externas sao sensiveis a regressao porque concentram persistencia e acao de servidor no mesmo arquivo.
- Sem testes e sem typecheck dedicado, uma refatoracao pode introduzir quebra silenciosa.

## Suggested Direction

O melhor proximo passo tecnico e reduzir o tamanho das superficies de mudanca. Em vez de adicionar mais logica nesses arquivos grandes, o ideal e decompor em camadas mais previsiveis: query layer, domain mapping layer, page composition layer e feature components.
