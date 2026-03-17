# Hardening Checklist

## Auth e sessao

- Exigir `DD_AUTH_SECRET` em todos os ambientes que exponham a aplicacao.
- Remover qualquer fallback da sessao para `GOOGLE_CLIENT_SECRET`.
- Manter `httpOnly`, `secure` em producao e `sameSite` consistente para os cookies.
- Avaliar expiracao explicita e rotacao de sessao se o risco de roubo de cookie for relevante.

## Acesso

- Restringir o login a dominios ou contas corporativas aprovadas.
- Validar conta, dominio e grupo no callback do Google.
- Adicionar autorizacao por papel ou grupo para areas administrativas, se existirem perfis diferentes.
- Garantir que a aplicacao nao aceite contas externas por engano.

## Bypass e ambientes

- Manter `DEV_AUTH_BYPASS` apenas em maquina local.
- Bloquear a rota de bypass em qualquer preview, homologacao ou ambiente compartilhado.
- Revisar `.env.*` antes de deploy para evitar vazamento de flags de desenvolvimento.

## Rotas e APIs

- Revisar rotas `app/api/*` para checar autorizacao antes de qualquer operacao sensivel.
- Trocar GET state-changing por POST quando houver efeito colateral real.
- Adicionar protecao anti-CSRF para rotas que alterem estado.
- Validar entrada em todas as rotas que recebem query, body ou params.

## Segredos e configuracao

- Manter secrets fora do repositorio.
- Rotacionar qualquer credencial que tenha sido exposta em historico, logs ou ambiente compartilhado.
- Separar secret de sessao, secret de OAuth e secrets de integracao.
- Conferir regularmente `README`, `.env.example` e variaveis de ambiente reais.

## Headers e navegador

- Adicionar `Content-Security-Policy`.
- Adicionar `frame-ancestors` ou `X-Frame-Options` para reduzir clickjacking.
- Definir `Referrer-Policy`.
- Definir `Permissions-Policy`.
- Considerar `X-Content-Type-Options: nosniff`.

## Observabilidade

- Registrar eventos de login, falha de login e logout.
- Alertar tentativas repetidas de autenticacao falha.
- Evitar logar tokens, cookies ou secrets.
- Diferenciar logs de dev e prod.

## Revisao continua

- Rodar revisao de seguranca sempre que novos endpoints sensiveis forem adicionados.
- Revisar mudancas em OAuth, cookies, env vars e middleware antes de cada release.
- Fazer uma checagem manual de acesso apos alterar qualquer fluxo de autenticacao.
