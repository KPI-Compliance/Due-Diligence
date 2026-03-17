# Security Review

## Scope

Revisao focada em autenticacao, autorizacao, sessao, cookies, rotas `app/api/auth/*`, pagina de login, variaveis de ambiente e pontos de integracao sensiveis.

## Findings

### High: Login corporativo nao e restringido por dominio ou allowlist

Evidencia:

- [app/api/auth/callback/google/route.ts](/Users/jeff.brito/Documents/Due%20Diligence%20VTEX/due-diligence-platform/app/api/auth/callback/google/route.ts):66-83 cria sessao para qualquer conta Google que retorne `email`, sem verificar dominio, grupo ou allowlist.
- `app/(app)/layout.tsx:11-21` aceita apenas a presenca do cookie assinado, sem checagem adicional de identidade ou papel.
- [app/page.tsx](/Users/jeff.brito/Documents/Due%20Diligence%20VTEX/due-diligence-platform/app/page.tsx):74-78 apresenta o login como acesso corporativo, mas o fluxo nao aplica nenhuma restricao corporativa.

Risco:

- Se o OAuth client aceitar contas externas ou se o consent screen estiver acessivel a usuarios fora do dominio interno, qualquer conta Google autenticada pode virar uma sessao valida na aplicacao.
- Isso e um bypass de controle de acesso para um sistema que aparenta ser interno/corporativo.

Recomendacao:

- Validar dominio corporativo no callback, de preferencia com allowlist explicita de dominios e/ou contas.
- Se houver Google Workspace, exigir dominio aprovado e checar `hd` quando aplicavel, mas sem depender apenas desse campo.
- Para areas sensiveis, adicionar autorizacao por papel ou grupo, nao apenas autenticacao.

### Medium: A sessao assina com o client secret do OAuth quando `DD_AUTH_SECRET` nao existe

Evidencia:

- [lib/auth.ts](/Users/jeff.brito/Documents/Due%20Diligence%20VTEX/due-diligence-platform/lib/auth.ts):76-79 usa `DD_AUTH_SECRET` e, se ausente, cai no `client_secret` do Google OAuth.
- [.env.example](/Users/jeff.brito/Documents/Due%20Diligence%20VTEX/due-diligence-platform/.env.example):16-17 mostra `DD_AUTH_SECRET` como recomendado, nao como obrigatorio.

Risco:

- Se algum ambiente subir sem `DD_AUTH_SECRET`, a seguranca da sessao fica acoplada ao segredo do OAuth.
- Qualquer vazamento ou reutilizacao indevida do secret do Google passa a comprometer tambem a autenticacao da aplicacao.
- O problema pode ficar silencioso em deploys, porque o fallback nao falha fechado.

Recomendacao:

- Exigir `DD_AUTH_SECRET` em todos os ambientes que expuserem a aplicacao.
- Falhar o startup se o segredo dedicado nao estiver presente.
- Manter o secret da sessao independente do client secret do OAuth.

### Medium: Bypass local de autenticacao pode abrir acesso se for habilitado fora do dev isolado

Evidencia:

- [app/api/auth/dev-login/route.ts](/Users/jeff.brito/Documents/Due%20Diligence%20VTEX/due-diligence-platform/app/api/auth/dev-login/route.ts):4-14 cria sessao sem validar Google quando `DEV_AUTH_BYPASS=true`.
- [app/page.tsx](/Users/jeff.brito/Documents/Due%20Diligence%20VTEX/due-diligence-platform/app/page.tsx):128-135 expoe o botao de bypass quando a flag esta ligada.
- [lib/auth.ts](/Users/jeff.brito/Documents/Due%20Diligence%20VTEX/due-diligence-platform/lib/auth.ts):179-180 habilita a flag em qualquer ambiente nao-prod quando a env esta ativa.

Risco:

- Em um ambiente compartilhado de teste, staging ou preview, o bypass remove completamente a barreira do Google SSO.
- O problema nao e o uso local em si, mas o risco operacional de a flag vazar para um ambiente acessivel por terceiros.

Recomendacao:

- Manter `DEV_AUTH_BYPASS` somente em desenvolvimento local isolado.
- Bloquear a rota por origem/host alem da flag, se quiser reduzir erro operacional.
- Garantir que ambientes compartilhados nunca recebam essa variavel.

## Additional observations

- Os cookies de sessao e estado usam `httpOnly` e `sameSite=lax`, o que e melhor do que o baseline.
- Nao encontrei, nesta revisao, exposicao obvia de segredos em rotas publicas ou persistencia de tokens OAuth no cliente.
- O escopo atual nao possui RBAC granular visivel; isso nao e um achado confirmado, mas vale considerar se o produto crescer.
