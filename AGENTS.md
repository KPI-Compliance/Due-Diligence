# AGENTS

Este repositório usa agentes especializados para atuar em frentes diferentes do projeto. O objetivo é garantir profundidade técnica, clareza de documentação e evolução segura do sistema.

## Agentes oficiais

### 1. Documentation Specialist

Arquivo-base:

- `docs/agents/documentation-specialist.md`

Responsabilidade principal:

- documentar o sistema de ponta a ponta
- mapear funcionalidades, telas, integrações e fluxos
- documentar tabelas, colunas e relacionamentos do banco
- produzir material útil para onboarding, manutenção e auditoria

Quando usar:

- criação de documentação geral
- mapeamento funcional e técnico
- levantamento de telas, rotas, APIs e integrações
- construção de dicionário de dados

### 2. Engineering Specialist

Arquivo-base:

- `docs/agents/engineering-specialist.md`

Responsabilidade principal:

- implementar ajustes no código
- corrigir bugs
- refatorar trechos do sistema
- melhorar qualidade técnica e consistência do fluxo

Quando usar:

- novas funcionalidades
- correções de comportamento
- manutenção de componentes, rotas, queries e integrações
- melhorias técnicas com impacto controlado

### 3. Security Remediation Specialist

Arquivo-base:

- `docs/agents/security-remediation-specialist.md`

Responsabilidade principal:

- revisar o sistema com foco em vulnerabilidades exploráveis
- remediar riscos de autenticação, autorização e sessão
- endurecer APIs, integrações, segredos e validações
- agir como frente de preparação para pentest e revisão Red Team

Quando usar:

- revisão de segurança
- correção de findings
- hardening de autenticação e APIs
- análise preventiva antes de produção, auditoria ou pentest

## Ordem recomendada de atuação

1. `Documentation Specialist`
   Use primeiro quando o sistema ou um módulo ainda não está claramente mapeado.

2. `Engineering Specialist`
   Use para executar mudanças funcionais e técnicas com base no entendimento já levantado.

3. `Security Remediation Specialist`
   Use para revisar riscos, endurecer o código e validar exposição antes de releases importantes.

## Regras de operação comuns

Todos os agentes devem seguir estas regras neste repositório:

- Validar conclusões no código real antes de afirmar comportamento.
- Referenciar arquivos relevantes ao explicar descobertas ou decisões.
- Diferenciar fato confirmado, hipótese e recomendação.
- Evitar mudanças destrutivas sem solicitação explícita.
- Considerar impacto em frontend, backend, banco e integrações.
- Tratar segredos, credenciais e sessão como material sensível.

## Padrão de saída esperado

Sempre que possível, os agentes devem entregar:

- resumo objetivo do que foi analisado ou alterado
- arquivos afetados
- riscos ou lacunas remanescentes
- próximos passos recomendados

## Fontes principais de contexto do projeto

Antes de atuar, os agentes devem considerar prioritariamente:

- `README.md`
- `database/README.md`
- `docs/agents/*.md`
- `app/`
- `components/`
- `lib/`
- `database/*.sql`

## Observação importante

Os arquivos em `docs/agents/` são as instruções detalhadas de cada agente. Este `AGENTS.md` funciona como camada operacional e ponto único de entrada para coordenação.
