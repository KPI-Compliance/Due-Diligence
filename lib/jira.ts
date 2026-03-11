type JiraPrimitive = string | number | boolean | null | undefined;

type JiraAdfNode = {
  type?: string;
  text?: string;
  content?: JiraAdfNode[];
};

type JiraIssueFields = {
  summary?: string;
  description?: JiraPrimitive | JiraAdfNode;
  labels?: string[];
  priority?: { name?: string | null } | null;
  status?: { name?: string | null } | null;
  issuetype?: { name?: string | null } | null;
  project?: { key?: string | null } | null;
  assignee?: { emailAddress?: string | null; displayName?: string | null } | null;
  [key: string]: unknown;
};

export type JiraWebhookPayload = {
  webhookEvent?: string;
  issue_event_type_name?: string;
  issue?: {
    id?: string;
    key?: string;
    self?: string;
    fields?: JiraIssueFields;
  };
  [key: string]: unknown;
};

export type SyncedJiraEntityInput = {
  issueKey: string;
  issueUrl: string | null;
  name: string;
  slug: string;
  kind: "VENDOR" | "PARTNER";
  companyGroup: "VTEX" | "WENI";
  domain: string | null;
  segment: string | null;
  website: string | null;
  contactEmail: string | null;
  description: string | null;
  category: string | null;
  subtitle: string | null;
  statusLabel: string | null;
  status: "PENDING" | "IN_REVIEW" | "RESPONDED" | "COMPLETED";
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  ownerEmail: string | null;
};

type JiraServiceDeskResponse = {
  values?: Array<{
    id?: string;
    projectKey?: string;
  }>;
};

type JiraQueueResponse = {
  jql?: string | null;
};

type JiraJqlMatchResponse = {
  matches?: Array<{
    matchedIssues?: number[];
  }>;
};

function adfToText(node: JiraPrimitive | JiraAdfNode): string {
  if (typeof node === "string") {
    return node;
  }

  if (!node || typeof node !== "object") {
    return "";
  }

  const directText = typeof node.text === "string" ? node.text : "";
  const nestedText = Array.isArray(node.content) ? node.content.map(adfToText).join("\n") : "";

  return [directText, nestedText].filter(Boolean).join("\n");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function findFieldValue(description: string, keys: string[]) {
  for (const key of keys) {
    const pattern = new RegExp(`(?:^|\\n)\\s*${key}\\s*[:|-]\\s*(.+)`, "i");
    const match = description.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function normalizeKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function stringifyUnknown(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = normalizeWhitespace(value);
    return normalized || null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const joined = value
      .map((item) => stringifyUnknown(item))
      .filter((item): item is string => Boolean(item))
      .join(", ");

    return joined || null;
  }

  if (value && typeof value === "object") {
    if ("value" in value) {
      return stringifyUnknown((value as { value?: unknown }).value);
    }

    if ("name" in value) {
      return stringifyUnknown((value as { name?: unknown }).name);
    }

    if ("label" in value) {
      return stringifyUnknown((value as { label?: unknown }).label);
    }

    if ("text" in value) {
      return stringifyUnknown((value as { text?: unknown }).text);
    }
  }

  return null;
}

function findValueInObject(source: unknown, aliases: string[]): string | null {
  const normalizedAliases = aliases.map(normalizeKey);

  function visit(value: unknown): string | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item);
        if (found) return found;
      }
      return null;
    }

    for (const [rawKey, rawValue] of Object.entries(value)) {
      if (normalizedAliases.includes(normalizeKey(rawKey))) {
        const direct = stringifyUnknown(rawValue);
        if (direct) return direct;
      }

      const nested = visit(rawValue);
      if (nested) return nested;
    }

    return null;
  }

  return visit(source);
}

function cleanUrl(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function cleanDomain(value: string | null) {
  if (!value) return null;
  return value
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}

function domainFromEmail(value: string | null) {
  if (!value) return null;
  const match = value.match(/@([^>\s]+)$/);
  return match?.[1] ? cleanDomain(match[1]) : null;
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function inferKind(fields: JiraIssueFields, description: string): "VENDOR" | "PARTNER" {
  const typeName = fields.issuetype?.name?.toLowerCase() ?? "";
  const labels = fields.labels?.map((label) => label.toLowerCase()) ?? [];
  const explicit = findFieldValue(description, ["entity kind", "kind", "tipo"]);

  if (
    typeName.includes("partner") ||
    labels.includes("partner") ||
    labels.includes("parceiro") ||
    explicit?.toLowerCase() === "partner"
  ) {
    return "PARTNER";
  }

  return "VENDOR";
}

function normalizeEntityLabel(value: string | null | undefined): "VENDOR" | "PARTNER" | null {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("partner") || normalized.includes("parceir")) return "PARTNER";
  if (normalized.includes("vendor") || normalized.includes("fornecedor")) return "VENDOR";
  return null;
}

function parseQueueId(queueUrl: string | null | undefined) {
  const value = (queueUrl ?? "").trim();
  if (!value) return null;

  const directMatch = value.match(/\/queues\/custom\/(\d+)/i);
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  const fallbackMatch = value.match(/(\d+)(?:\/)?$/);
  return fallbackMatch?.[1] ?? null;
}

function buildJiraBasicAuthHeader(email: string, token: string) {
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

async function fetchJiraJson<T>(url: string, email: string, token: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: buildJiraBasicAuthHeader(email, token),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Jira API request failed (${response.status}) for ${url}`);
  }

  return (await response.json()) as T;
}

async function fetchServiceDeskId(baseUrl: string, email: string, token: string, projectKey: string) {
  const payload = await fetchJiraJson<JiraServiceDeskResponse>(
    `${baseUrl.replace(/\/$/, "")}/rest/servicedeskapi/servicedesk`,
    email,
    token,
  );

  const match = payload.values?.find((item) => item.projectKey?.toUpperCase() === projectKey.toUpperCase());
  return match?.id ?? null;
}

async function fetchQueueJql(baseUrl: string, email: string, token: string, serviceDeskId: string, queueId: string) {
  const payload = await fetchJiraJson<JiraQueueResponse>(
    `${baseUrl.replace(/\/$/, "")}/rest/servicedeskapi/servicedesk/${serviceDeskId}/queue/${queueId}`,
    email,
    token,
  );

  return payload.jql?.trim() ?? null;
}

async function issueMatchesJql(baseUrl: string, email: string, token: string, issueId: number, jql: string) {
  const payload = await fetchJiraJson<JiraJqlMatchResponse>(
    `${baseUrl.replace(/\/$/, "")}/rest/api/3/jql/match`,
    email,
    token,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        issueIds: [issueId],
        jqls: [jql],
      }),
    },
  );

  return payload.matches?.[0]?.matchedIssues?.includes(issueId) ?? false;
}

export async function resolveKindFromJiraQueues(input: {
  baseUrl: string;
  email: string;
  token: string;
  issueId: string | undefined;
  vendorsProjectKey: string;
  vendorsQueueUrl: string;
  partnersProjectKey: string;
  partnersQueueUrl: string;
}) {
  const numericIssueId = Number(input.issueId ?? "");
  if (!Number.isFinite(numericIssueId) || numericIssueId <= 0) {
    return null;
  }

  const partnerQueueId = parseQueueId(input.partnersQueueUrl);
  const vendorQueueId = parseQueueId(input.vendorsQueueUrl);

  const projectKey = input.partnersProjectKey || input.vendorsProjectKey;
  if (!projectKey || (!partnerQueueId && !vendorQueueId)) {
    return null;
  }

  const serviceDeskId = await fetchServiceDeskId(input.baseUrl, input.email, input.token, projectKey);
  if (!serviceDeskId) {
    return null;
  }

  if (partnerQueueId) {
    const partnerJql = await fetchQueueJql(input.baseUrl, input.email, input.token, serviceDeskId, partnerQueueId);
    if (partnerJql && (await issueMatchesJql(input.baseUrl, input.email, input.token, numericIssueId, partnerJql))) {
      return "PARTNER" as const;
    }
  }

  if (vendorQueueId) {
    const vendorJql = await fetchQueueJql(input.baseUrl, input.email, input.token, serviceDeskId, vendorQueueId);
    if (vendorJql && (await issueMatchesJql(input.baseUrl, input.email, input.token, numericIssueId, vendorJql))) {
      return "VENDOR" as const;
    }
  }

  return null;
}

function inferCompanyGroup(fields: JiraIssueFields, description: string): "VTEX" | "WENI" {
  const explicit = findFieldValue(description, ["company group", "grupo", "business unit"]);
  const labels = fields.labels?.map((label) => label.toLowerCase()) ?? [];
  const projectKey = fields.project?.key?.toLowerCase() ?? "";

  if (
    explicit?.toLowerCase() === "weni" ||
    labels.includes("weni") ||
    projectKey.startsWith("weni")
  ) {
    return "WENI";
  }

  return "VTEX";
}

function normalizeCompanyGroup(value: string | null): "VTEX" | "WENI" | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  if (normalized === "VTEX" || normalized === "WENI") {
    return normalized;
  }

  return null;
}

function inferStatus(fields: JiraIssueFields): "PENDING" | "IN_REVIEW" | "RESPONDED" | "COMPLETED" {
  const status = fields.status?.name?.toLowerCase() ?? "";

  if (/(done|complete|completed|closed|resolved|approved)/i.test(status)) {
    return "COMPLETED";
  }

  if (/(review|analysis|analise|in progress|doing)/i.test(status)) {
    return "IN_REVIEW";
  }

  if (/(responded|answered|awaiting review)/i.test(status)) {
    return "RESPONDED";
  }

  return "PENDING";
}

function formatStatusLabel(status: SyncedJiraEntityInput["status"]) {
  if (status === "COMPLETED") return "Assessment Completed";
  if (status === "IN_REVIEW") return "Security Review in Progress";
  if (status === "RESPONDED") return "Response Received";
  return "Awaiting Response";
}

function inferRiskLevel(fields: JiraIssueFields, description: string): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  const explicit = findFieldValue(description, ["risk", "risk level", "criticidade", "prioridade de risco"])?.toLowerCase();
  const priority = fields.priority?.name?.toLowerCase() ?? "";
  const raw = explicit ?? priority;

  if (/(critical|critico|cr[ití]tico|highest|blocker|severe)/i.test(raw)) {
    return "CRITICAL";
  }

  if (/(high|alto)/i.test(raw)) {
    return "HIGH";
  }

  if (/(medium|med)/i.test(raw)) {
    return "MEDIUM";
  }

  return "LOW";
}

export function isSupportedJiraWebhookEvent(payload: JiraWebhookPayload) {
  const event = payload.webhookEvent?.toLowerCase() ?? "";
  const issueEvent = payload.issue_event_type_name?.toLowerCase() ?? "";

  return (
    event.includes("jira:issue_created") ||
    event.includes("jira:issue_updated") ||
    issueEvent.includes("issue_created") ||
    issueEvent.includes("issue_updated")
  );
}

export function extractEntityFromJiraIssue(
  payload: JiraWebhookPayload,
  forcedKind?: "VENDOR" | "PARTNER" | null,
): SyncedJiraEntityInput | null {
  const issue = payload.issue;
  const fields = issue?.fields;
  const issueKey = issue?.key?.trim();
  const summary = fields?.summary?.trim();

  if (!issueKey || !fields || !summary) {
    return null;
  }

  const description = normalizeWhitespace(adfToText(fields.description ?? ""));
  const payloadKind =
    normalizeEntityLabel(findValueInObject(payload, ["entity kind", "kind", "tipo de entidade", "entity_type"])) ??
    normalizeEntityLabel(summary);
  const entityName =
    findValueInObject(payload, [
      "name of vendor",
      "vendor name",
      "nome do vendor",
      "nome do fornecedor",
      "name of partner",
      "partner name",
      "nome do parceiro",
      "company name",
      "nome da empresa",
    ]) ?? summary;
  const contactEmail =
    findValueInObject(payload, [
      "vendor e-mail address",
      "vendor email address",
      "vendor email",
      "email do vendor",
      "partner e-mail address",
      "partner email address",
      "partner email",
      "email do parceiro",
      "contact email",
      "email",
    ]) ?? findFieldValue(description, ["vendor e-mail address", "partner email", "contact email", "email", "e-mail"]);
  const vtexResponsibleEmail =
    findValueInObject(payload, ["vtex e-mail responsible", "vtex email responsible", "responsavel vtex", "responsible email"]) ??
    findFieldValue(description, ["vtex e-mail responsible", "vtex email responsible", "responsavel vtex"]);
  const languagePreference =
    findValueInObject(payload, ["vendor language preferences", "language preference", "idioma", "language"]) ??
    findFieldValue(description, ["vendor language preferences", "language preference", "idioma"]);
  const companyGroupFromForm =
    normalizeCompanyGroup(
      findValueInObject(payload, ["company", "company group", "grupo", "business unit"]) ??
        findFieldValue(description, ["company", "company group", "grupo", "business unit"]),
    );
  const capNumber =
    findValueInObject(payload, ["cap number", "cap"]) ?? findFieldValue(description, ["cap number", "cap"]);
  const scope =
    findValueInObject(payload, ["scope", "escopo"]) ?? findFieldValue(description, ["scope", "escopo"]);
  const requestDescription =
    findValueInObject(payload, ["description", "descricao"]) ?? description;
  const website = cleanUrl(
    findValueInObject(payload, ["website", "site", "url"]) ?? findFieldValue(description, ["website", "site", "url"]),
  );
  const domain = cleanDomain(
      findValueInObject(payload, ["domain", "dominio"]) ??
      findFieldValue(description, ["domain", "dominio"]) ??
      website ??
      domainFromEmail(contactEmail),
  );
  const kind = forcedKind ?? payloadKind ?? inferKind(fields, description);
  const segment =
    findValueInObject(payload, ["segment", "segmento", "category", "categoria"]) ??
    findFieldValue(description, ["segment", "segmento", "category", "categoria"]) ??
    languagePreference ??
    (kind === "PARTNER" ? "Partner assessment" : "Vendor assessment");
  const companyGroup = companyGroupFromForm ?? inferCompanyGroup(fields, description);
  const status = inferStatus(fields);
  const riskLevel = inferRiskLevel(
    {
      ...fields,
      priority: {
        name:
          findValueInObject(payload, ["priority", "prioridade"]) ??
          stringifyUnknown(fields.priority) ??
          null,
      },
    },
    [requestDescription, scope].filter(Boolean).join("\n\n"),
  );
  const slugBase = slugify(entityName) || slugify(issueKey) || "jira-entity";
  const mergedDescription = [scope, requestDescription]
    .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index)
    .join("\n\n")
    .trim();
  const category = capNumber ? `CAP ${capNumber}` : languagePreference;

  return {
    issueKey,
    issueUrl: issue.self?.trim() || null,
    name: entityName,
    slug: `${slugBase}-${issueKey.toLowerCase()}`,
    kind,
    companyGroup,
    domain,
    segment,
    website,
    contactEmail,
    description: mergedDescription || null,
    category: category || null,
    subtitle: kind === "PARTNER" ? "Partner assessment" : "Vendor assessment",
    statusLabel: formatStatusLabel(status),
    status,
    riskLevel,
    ownerEmail: vtexResponsibleEmail ?? fields.assignee?.emailAddress?.trim() ?? null,
  };
}
