# Security Review

## Estado atual (remediacoes aplicadas)

- Rota `dev-login` / bypass local: **removida**; login apenas via Google OAuth.
- `DD_AUTH_SECRET`: **obrigatorio** para assinar a sessao (`lib/auth.ts`); comparacao de assinatura da cookie com `timingSafeEqual`.
- Webhook Jira: em **producao**, `JIRA_WEBHOOK_SECRET` **obrigatorio**; sem segredo retorna 503.
- Webhook Typeform: limite de tamanho do corpo; modo **unsigned** bloqueado em producao; assinatura validada quando aplicavel.
- Cron e health internos: `Authorization: Bearer` (`CRON_SECRET` ou `INTERNAL_TOOL_SECRET`); health tambem aceita admin com `canManageSettings` para uso no browser.
- Envio de questionario externo: `entitySlug` obrigatorio; assessment amarrado a entidade; `questionnaireBaseUrl` restrita a hosts Typeform com form id.
- Proxy de ficheiros Typeform: exige sessao e, quando possivel, validacao contra `assessments`.
- Credenciais Google Workspace em `lib/email.ts`: sem path absoluto no codigo; usar env ou `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_FILE`.

Este documento mantem os achados historicos abaixo para contexto; alguns itens ja foram enderecados ou parcialmente enderecados.

## Scope

Revisao focada em autenticacao, autorizacao, sessao, cookies, rotas `app/api/auth/*`, pagina de login, variaveis de ambiente e pontos de integracao sensiveis.

## Findings

### High: Risco operacional de allowlist Google mal configurada

Evidencia (atual):

- [app/api/auth/callback/google/route.ts](app/api/auth/callback/google/route.ts) chama `isAllowedGoogleIdentity` com `ALLOWED_GOOGLE_DOMAINS` / `ALLOWED_GOOGLE_EMAILS` (`lib/auth.ts`).
- Se ambas as listas estiverem vazias, `isAllowedGoogleIdentity` retorna `false` para qualquer e-mail (ninguem entra). Se estiverem mal configuradas (demasiado abertas), contas nao desejadas podem entrar.

Risco:

- OAuth client ou consent screen acessiveis a contas externas combinados com allowlist larga.

Recomendacao:

- Manter allowlists explicitas e minimas; revisar em cada release.
- Para Google Workspace, considerar `hd` como reforco, sem depender apenas dele.
- RBAC por grupo ja existe em `user_access_profiles` / `resolveUserAccess`; rever permissoes por area sensivel.

### ~~Medium: A sessao assina com o client secret do OAuth quando `DD_AUTH_SECRET` nao existe~~ (remediado)

Historico: o codigo atual exige `DD_AUTH_SECRET` em `getSessionSecret()` e falha se ausente. Manter o segredo da sessao independente do client secret do Google em todos os deploys.

### ~~Medium: Bypass local de autenticacao~~ (remediado)

Historico: existia rota `dev-login` e flag `DEV_AUTH_BYPASS`. Foram removidos; login apenas via Google com allowlist no callback.

## Additional observations

- Os cookies de sessao e estado usam `httpOnly` e `sameSite=lax`, o que e melhor do que o baseline.
- Nao encontrei, nesta revisao, exposicao obvia de segredos em rotas publicas ou persistencia de tokens OAuth no cliente.
- Existe RBAC baseado em `user_access_profiles` e grupos (`lib/access-control.ts`); revisar periodicamente quem tem `canManageSettings` e permissoes de escrita vendors/partners.
