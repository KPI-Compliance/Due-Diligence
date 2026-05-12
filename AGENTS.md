# AGENTS — Due Diligence Platform

This file is the coordination layer for all agents operating in this repository. Read [CLAUDE.md](./CLAUDE.md) first for project-wide context and invariants.

---

## Agent roster

| Agent | File | Role |
|---|---|---|
| [Documentation Specialist](#documentation-specialist) | `docs/agents/documentation-specialist.md` | Produce and maintain SDD documentation |
| [Engineering Specialist](#engineering-specialist) | `docs/agents/engineering-specialist.md` | Implement code changes end-to-end |
| [Code Reviewer](#code-reviewer) | `docs/agents/code-reviewer.md` | Review code before merge |
| [Spec Verifier](#spec-verifier) | `docs/agents/spec-verifier.md` | Verify implementation matches the spec |
| [Security Remediation Specialist](#security-remediation-specialist) | `docs/agents/security-remediation-specialist.md` | Remediate vulnerabilities |
| [Security Auditor (OWASP)](#security-auditor-owasp) | `docs/agents/security-auditor.md` | Audit against OWASP Top 10 + compliance frameworks |
| [Market Benchmarking Specialist](#market-benchmarking-specialist) | `docs/agents/market-benchmarking.md` | TPRM market research and gap analysis |

---

## When to use which agent

### By task type

| Task | Agent |
|---|---|
| Implement a new feature | Engineering Specialist |
| Fix a bug | Engineering Specialist |
| Refactor existing code | Engineering Specialist |
| Review a PR before merge | Code Reviewer |
| Update or create documentation | Documentation Specialist |
| Check if the spec matches the code | Spec Verifier |
| Identify security vulnerabilities | Security Auditor (OWASP) |
| Fix a security vulnerability | Security Remediation Specialist |
| Prepare for a pentest or Red Team | Security Auditor → Security Remediation Specialist |
| Research what competitors offer | Market Benchmarking Specialist |
| Assess regulatory compliance coverage | Market Benchmarking Specialist |

### By question type

| Question | Agent |
|---|---|
| "Does our platform cover X?" | Spec Verifier |
| "How do we compare to OneTrust/Vanta?" | Market Benchmarking Specialist |
| "Is this code safe?" | Security Auditor (OWASP) |
| "What vulnerabilities does our system have?" | Security Auditor (OWASP) |
| "Fix this vulnerability" | Security Remediation Specialist |
| "Is our documentation accurate?" | Documentation Specialist |
| "Add this feature to the platform" | Engineering Specialist |
| "Review this code change" | Code Reviewer |

---

## Recommended workflow

### New feature development

```
1. Documentation Specialist
   → Update docs/spec/platform-spec.md with the new feature's spec
   → Update integration docs if a new integration is involved

2. Engineering Specialist
   → Implement the feature against the updated spec
   → Run typecheck + build

3. Code Reviewer
   → Review the implementation
   → Route BLOCKERS back to Engineering Specialist

4. Security Auditor (OWASP)
   → Audit the new surface area
   → Route findings to Security Remediation Specialist

5. Security Remediation Specialist
   → Fix confirmed vulnerabilities
   → Update docs/security/hardening-checklist.md

6. Documentation Specialist
   → Update CHANGELOG.md
   → Confirm docs/spec is still accurate after implementation
```

### Security review cycle (before release or pentest)

```
1. Security Auditor (OWASP)
   → Full OWASP Top 10 + API Security Top 10 audit
   → Map to LGPD, ISO 27001, SOC 2

2. Security Remediation Specialist
   → Fix CRITICAL and HIGH findings
   → Document residual risks

3. Spec Verifier
   → Confirm the security model in the spec is still accurate
```

### Spec drift check (quarterly or after major changes)

```
1. Spec Verifier
   → Run full spec verification
   → Produce gap report (SPEC_AHEAD, CODE_AHEAD, DIVERGENCE, etc.)

2. Documentation Specialist
   → Update docs to close DIVERGENCE and CODE_AHEAD gaps

3. Engineering Specialist
   → Implement SPEC_AHEAD items that are still relevant
```

### Market alignment review (semi-annual)

```
1. Market Benchmarking Specialist
   → Research TPRM market and produce gap analysis
   → Map regulatory compliance gaps

2. Engineering Specialist + Documentation Specialist
   → Translate STRATEGIC gaps into backlog items in docs/engineering/backlog.md
   → Update docs/spec/platform-spec.md with planned capabilities
```

---

## Operating rules (all agents)

1. **Read before acting.** Read `CLAUDE.md` and the relevant spec docs before touching code or documentation.
2. **Validate claims.** Every assertion about code behavior must be verified in the source files.
3. **Cite sources.** Reference file paths and line numbers when explaining findings or decisions.
4. **Distinguish fact from hypothesis.** Use `confirmed:`, `hypothesis:`, or `recommendation:` prefixes when the distinction matters.
5. **Respect boundaries.** Auditor agents identify; remediation agents fix. Don't collapse the two roles.
6. **No destructive changes without explicit request.** Never drop tables, delete files, or force-push without being explicitly asked.
7. **Secrets are sensitive.** Never log, echo, or embed real credentials or tokens.

---

## Agent detail

### Documentation Specialist

**When to use:** Creating or updating any documentation file.  
**Reads:** Source code, migrations, `CLAUDE.md`, existing docs.  
**Writes:** `docs/spec/`, `docs/integrations/`, `docs/adr/`, `docs/runbooks/`, `docs/system/`, `CHANGELOG.md`, `README.md`.  
**Does not:** Implement features or run security analysis.  
**Full instructions:** [docs/agents/documentation-specialist.md](docs/agents/documentation-specialist.md)

---

### Engineering Specialist

**When to use:** Implementing features, fixing bugs, refactoring.  
**Reads:** All source files — especially `lib/`, `app/api/`, `database/`.  
**Writes:** Any source file, with migration files for schema changes.  
**Does not:** Perform security audits or produce documentation as a primary output.  
**Full instructions:** [docs/agents/engineering-specialist.md](docs/agents/engineering-specialist.md)

---

### Code Reviewer

**When to use:** Before merging any code change.  
**Reads:** Changed files, `CLAUDE.md`, project conventions.  
**Writes:** Review report only — no code changes.  
**Does not:** Implement fixes. Routes BLOCKERS and MAJOR findings to Engineering Specialist.  
**Severity:** BLOCKER / MAJOR / MINOR / NIT  
**Full instructions:** [docs/agents/code-reviewer.md](docs/agents/code-reviewer.md)

---

### Spec Verifier

**When to use:** After significant code changes, before releases, or on a quarterly cadence.  
**Reads:** `docs/spec/platform-spec.md`, `docs/integrations/*.md`, all source files.  
**Writes:** Verification gap report only — no code or doc changes.  
**Gap types:** SPEC_AHEAD / CODE_AHEAD / DIVERGENCE / MISSING_ENV / DEAD_CONFIG / SCHEMA_GAP / SCHEMA_PHANTOM  
**Full instructions:** [docs/agents/spec-verifier.md](docs/agents/spec-verifier.md)

---

### Security Remediation Specialist

**When to use:** After the Security Auditor produces findings, or when a specific vulnerability needs to be fixed.  
**Reads:** Audit reports, `CLAUDE.md`, `docs/security/hardening-checklist.md`, source files.  
**Writes:** Source code fixes, configuration recommendations, `docs/security/` updates.  
**Does not:** Perform the initial audit (that is the Security Auditor's job).  
**Severity:** CRITICAL / HIGH / MEDIUM / LOW / INFO  
**Full instructions:** [docs/agents/security-remediation-specialist.md](docs/agents/security-remediation-specialist.md)

---

### Security Auditor (OWASP)

**When to use:** Before releases, after new features are added, on a security review cadence, or before a pentest.  
**Reads:** All source files, `CLAUDE.md`, `docs/security/hardening-checklist.md`.  
**Writes:** Audit report — no code changes.  
**Framework:** OWASP Top 10 (2021) + OWASP API Security Top 10 (2023)  
**Compliance:** LGPD, ISO 27001:2022, SOC 2  
**Full instructions:** [docs/agents/security-auditor.md](docs/agents/security-auditor.md)

---

### Market Benchmarking Specialist

**When to use:** Before strategic planning cycles, when evaluating platform roadmap, or when assessing regulatory compliance coverage.  
**Reads:** `docs/spec/platform-spec.md`, `docs/engineering/backlog.md`, public market data (web search required).  
**Writes:** Benchmarking report with gap analysis and recommendations.  
**Market coverage:** OneTrust, ServiceNow VRM, Aravo, Prevalent, ProcessUnity, Vanta, Drata, Whistic, Panorays, UpGuard  
**Frameworks:** LGPD, GDPR, ISO 27001, NIST CSF, SOC 2, CAIQ, SIG  
**Full instructions:** [docs/agents/market-benchmarking.md](docs/agents/market-benchmarking.md)

---

## Context sources (all agents should read these first)

| File | Purpose |
|---|---|
| [CLAUDE.md](./CLAUDE.md) | Project overview, tech stack, critical invariants |
| [docs/spec/platform-spec.md](./docs/spec/platform-spec.md) | Full product specification |
| [docs/system/overview.md](./docs/system/overview.md) | Routes, flows, integrations |
| [database/README.md](./database/README.md) | Database setup and migration guide |
| [docs/security/hardening-checklist.md](./docs/security/hardening-checklist.md) | Security controls already in place |
| [docs/engineering/backlog.md](./docs/engineering/backlog.md) | What is already planned |
