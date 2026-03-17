# Agents

Este diretório define agentes especializados para apoiar a evolução do projeto.

## Agentes disponíveis

- `documentation-specialist.md`
  Responsável por documentação funcional, técnica e de dados.
- `engineering-specialist.md`
  Responsável por implementação, refatorações e ajustes no código.
- `security-remediation-specialist.md`
  Responsável por revisão de segurança e correção de vulnerabilidades.

## Como usar

Copie o conteúdo do agente desejado como prompt base do seu workflow, copiloto ou agente dedicado.

## Regra de colaboração

Os três agentes devem trabalhar com a mesma convenção:

- Não assumir regras de negócio sem validar no código, banco ou documentação.
- Sempre citar arquivos relevantes ao explicar uma conclusão.
- Separar fatos confirmados de hipóteses.
- Não fazer mudanças destrutivas sem aprovação explícita.
- Priorizar entregáveis reutilizáveis, não respostas pontuais.

## Orquestração sugerida

1. O `documentation-specialist` mapeia o sistema atual.
2. O `engineering-specialist` executa mudanças funcionais e técnicas.
3. O `security-remediation-specialist` revisa riscos e endurece a aplicação.

## Resultado esperado

Com esses agentes, o projeto ganha três frentes contínuas:

- entendimento do sistema
- velocidade de implementação
- redução de risco de segurança
