# Security Next Phase Plan

## Objetivo

Documentar o estado atual de maturidade de seguranca do projeto e orientar a proxima etapa de execucao do `Security Remediation Specialist`.

## Leitura resumida do estado atual

Comparado ao baseline inicial, o sistema ficou materialmente mais protegido nos pontos mais sensiveis do fluxo de autenticacao:

- o login Google agora pode ser restringido por dominio e/ou allowlist de contas
- a sessao depende de `DD_AUTH_SECRET`, sem fallback para o `GOOGLE_CLIENT_SECRET`
- o bypass local ficou restrito a ambiente de desenvolvimento e host local confiavel
- o callback de autenticacao foi endurecido

## Maturidade atual

### Nivel atual sugerido

`Basico para intermediario`

### O que ja existe de positivo

- cookies com `httpOnly`
- `secure` em producao
- `sameSite=lax`
- segregacao melhor entre auth real e bypass local
- base inicial de documentacao e checklist de hardening

### O que ainda impede um nivel mais alto

- ausencia de autorizacao por papel/grupo
- falta de controles anti-CSRF em rotas com efeito colateral
- ausencia de cabecalhos de seguranca mais fortes
- pouca observabilidade de eventos de autenticacao e falhas
- risco operacional ligado a segredos, ambientes e integracoes

## Conclusao executiva

O sistema esta mais protegido do que antes, especialmente contra acessos indevidos simples no fluxo de login. Ainda assim, ele nao deve ser tratado como um ambiente com hardening avancado. A proxima etapa deve focar em controles de autorizacao, protecao das rotas que alteram estado, observabilidade e seguranca de navegador.

## Missao da proxima etapa

O `Security Remediation Specialist` deve executar uma segunda rodada focada em:

1. reduzir risco de abuso de rotas autenticadas
2. elevar protecao no navegador e na sessao
3. fortalecer governanca de acesso e operacao

## Backlog priorizado

### Prioridade 1

- Implementar autorizacao por papel, grupo ou allowlist mais estruturada para areas sensiveis.
- Revisar todas as rotas `app/api/*` com efeito colateral e eliminar operacoes sensiveis expostas via GET.
- Adicionar protecao anti-CSRF nas rotas de alteracao de estado.
- Revisar logout, callbacks e operacoes de sessao para garantir comportamento consistente e auditavel.

### Prioridade 2

- Adicionar headers de seguranca como `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy` e `X-Content-Type-Options`.
- Revisar risco de clickjacking com `frame-ancestors` ou `X-Frame-Options`.
- Mapear respostas de erro para evitar excesso de detalhe em producao.

### Prioridade 3

- Criar trilha minima de auditoria para login, falha de login, logout e erros de integracao.
- Revisar segredos e env vars por ambiente, com checklist de rotacao e segregacao.
- Validar que preview/staging/local nao recebam flags ou bypass indevidos.

## Entregaveis esperados do agente especialista

- `docs/security/authorization-review.md`
  Revisao de autorizacao, perfis e superficies administrativas.

- `docs/security/route-hardening-plan.md`
  Inventario de rotas sensiveis, metodo HTTP, risco e remediacao recomendada.

- patches de codigo para os itens de prioridade 1

- atualizacao de `docs/security/hardening-checklist.md`
  refletindo os controles implementados

## Ordem recomendada de execucao

1. mapear rotas com efeito colateral
2. classificar autenticacao x autorizacao por fluxo
3. aplicar protecao anti-CSRF e revisar metodos HTTP
4. adicionar headers de seguranca
5. fechar observabilidade minima

## Criterios de pronto da proxima etapa

- nenhuma rota sensivel relevante depende de GET para alterar estado
- existe camada minima de autorizacao para areas administrativas ou operacionais sensiveis
- headers de seguranca principais estao ativos
- eventos criticos de autenticacao possuem logging controlado
- checklist de hardening esta atualizado com o novo baseline

## Prompt recomendado para o proximo ciclo

Voce e o Security Remediation Specialist deste projeto. Considere que a primeira rodada ja endureceu o fluxo de autenticacao e sessao. Agora execute a segunda etapa com foco em autorizacao, CSRF, rotas com efeito colateral, headers de seguranca e observabilidade minima. Trabalhe a partir de `docs/security/review.md`, `docs/security/hardening-checklist.md` e `docs/security/next-phase-plan.md`, priorizando patches reais para os itens de prioridade 1 e produzindo documentacao objetiva para o restante.
