import { getIntegrationSettings, type JiraConfig } from "@/lib/settings-data";
import { getDocument as getPdfDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

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
  reporter?: { emailAddress?: string | null; displayName?: string | null } | null;
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
  jiraFormData: {
    vendorEmail: string | null;
    vtexResponsibleEmail: string | null;
    languagePreference: string | null;
    priority: string | null;
    company: string | null;
    capNumber: string | null;
    scope: string | null;
    reporterName: string | null;
    reporterEmail: string | null;
  };
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

type JiraIssueDetailResponse = {
  id?: string | null;
  names?: Record<string, string>;
  fields?: {
    created?: string | null;
    attachment?: Array<{
      id?: string | null;
      filename?: string | null;
      mimeType?: string | null;
      content?: string | null;
      created?: string | null;
    }>;
  };
};

type JiraIssueEditMetaResponse = {
  fields?: Record<
    string,
    {
      name?: string;
      allowedValues?: Array<Record<string, unknown>>;
    }
  >;
};

type JiraIssueStatusResponse = {
  fields?: {
    status?: {
      name?: string | null;
    } | null;
  } | null;
};

type JiraTransitionsResponse = {
  transitions?: Array<{
    id?: string | null;
    name?: string | null;
    to?: {
      name?: string | null;
    } | null;
  }>;
};

type JiraServiceDeskRequestDetailResponse = {
  requestFieldValues?: unknown;
  values?: unknown;
  [key: string]: unknown;
};

function getJiraSetting<T>(
  list: Array<{ provider: string; enabled: boolean; config: unknown }>,
  provider: string,
) {
  return list.find((item) => item.provider === provider) as { provider: string; enabled: boolean; config: T } | undefined;
}

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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findFieldValue(description: string, keys: string[]) {
  for (const key of keys) {
    const escapedKey = escapeRegex(key);
    const inlinePattern = new RegExp(`(?:^|\\n)\\s*${escapedKey}\\s*[:|-]\\s*(.+)`, "i");
    const inlineMatch = description.match(inlinePattern);
    if (inlineMatch?.[1]) {
      return inlineMatch[1].trim();
    }

    // Jira Forms often render as:
    // "Field Label *"
    // "Field value"
    const multilinePattern = new RegExp(`(?:^|\\n)\\s*${escapedKey}\\s*\\*?\\s*\\n\\s*([^\\n]+)`, "i");
    const multilineMatch = description.match(multilinePattern);
    if (multilineMatch?.[1]) {
      return multilineMatch[1].trim();
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
    const typedValue = value as Record<string, unknown>;

    if ("emailAddress" in typedValue) {
      return stringifyUnknown(typedValue.emailAddress);
    }

    if ("displayName" in typedValue) {
      return stringifyUnknown(typedValue.displayName);
    }

    if ("content" in typedValue && Array.isArray(typedValue.content)) {
      const adfText = normalizeWhitespace(adfToText(value as JiraAdfNode));
      if (adfText) return adfText;
    }

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

    const objectValues = Object.values(typedValue)
      .map((item) => stringifyUnknown(item))
      .filter((item): item is string => Boolean(item));
    if (objectValues.length > 0) {
      return objectValues.join(", ");
    }
  }

  return null;
}

function valueFromTopLevelPayload(payload: JiraWebhookPayload, keys: string[]) {
  for (const key of keys) {
    const value = stringifyUnknown(payload[key]);
    if (value) return value;
  }

  return null;
}

function valueFromLabeledEntry(value: unknown, normalizedAliases: string[]): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const labelCandidates = [
    record.label,
    record.name,
    record.title,
    record.question,
    record.prompt,
    record.field,
    record.key,
  ]
    .map((item) => stringifyUnknown(item))
    .filter((item): item is string => Boolean(item))
    .map(normalizeKey);

  const hasLabelMatch = labelCandidates.some((candidate) =>
    normalizedAliases.some((alias) => candidate === alias || candidate.includes(alias) || alias.includes(candidate)),
  );

  if (!hasLabelMatch) return null;

  const valueCandidates = [record.value, record.answer, record.response, record.selected, record.text, record.content];
  for (const candidate of valueCandidates) {
    const normalized = stringifyUnknown(candidate);
    if (normalized) return normalized;
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

    const fromLabeledEntry = valueFromLabeledEntry(value, normalizedAliases);
    if (fromLabeledEntry) return fromLabeledEntry;

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

function findAllValuesInObject(source: unknown, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeKey);
  const matches: string[] = [];

  function visit(value: unknown) {
    if (!value || typeof value !== "object") {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    const fromLabeledEntry = valueFromLabeledEntry(value, normalizedAliases);
    if (fromLabeledEntry) {
      matches.push(fromLabeledEntry);
    }

    for (const [rawKey, rawValue] of Object.entries(value)) {
      if (normalizedAliases.includes(normalizeKey(rawKey))) {
        const direct = stringifyUnknown(rawValue);
        if (direct) {
          matches.push(direct);
        }
      }

      visit(rawValue);
    }
  }

  visit(source);
  return matches;
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

async function postJiraJson<T>(url: string, email: string, token: string, body: unknown, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    method: init?.method ?? "POST",
    headers: {
      Accept: "application/json",
      Authorization: buildJiraBasicAuthHeader(email, token),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jira API request failed (${response.status}) for ${url}: ${errorText}`);
  }

  if (response.status === 204) {
    return null as T;
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

export async function fetchJiraIssueCreatedAt(input: {
  baseUrl: string;
  email: string;
  token: string;
  issueKey: string;
}) {
  const payload = await fetchJiraJson<JiraIssueDetailResponse>(
    `${input.baseUrl.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(input.issueKey)}?fields=created`,
    input.email,
    input.token,
  );

  return payload.fields?.created?.trim() || null;
}

function findIssueFieldValue(
  issueFields: Record<string, unknown>,
  fieldNames: Record<string, string>,
  aliases: string[],
) {
  const normalizedAliases = aliases.map(normalizeKey);
  const rankedMatches: Array<{ score: number; value: string }> = [];

  for (const [fieldKey, rawValue] of Object.entries(issueFields)) {
    const fieldLabel = fieldNames[fieldKey] ?? fieldKey;
    const normalizedFieldKey = normalizeKey(fieldKey);
    const normalizedFieldLabel = normalizeKey(fieldLabel);

    let score = 0;
    for (const alias of normalizedAliases) {
      if (!alias) continue;
      if (normalizedFieldLabel === alias || normalizedFieldKey === alias) {
        score = Math.max(score, 3);
      } else if (normalizedFieldLabel.includes(alias) || alias.includes(normalizedFieldLabel)) {
        score = Math.max(score, 2);
      } else if (normalizedFieldKey.includes(alias) || alias.includes(normalizedFieldKey)) {
        score = Math.max(score, 1);
      }
    }

    if (score === 0) continue;
    const value = stringifyUnknown(rawValue);
    if (!value) continue;
    rankedMatches.push({ score, value });
  }

  if (rankedMatches.length === 0) return null;
  rankedMatches.sort((left, right) => right.score - left.score || right.value.length - left.value.length);
  return rankedMatches[0]?.value ?? null;
}

export async function enrichVendorFieldsFromJiraIssue(input: {
  baseUrl: string;
  email: string;
  token: string;
  issueKey: string;
}) {
  try {
    const issuePayload = await fetchJiraJson<JiraIssueDetailResponse>(
      `${input.baseUrl.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(input.issueKey)}?fields=*all&expand=names`,
      input.email,
      input.token,
    );

    const requestLookupCandidates = [input.issueKey, issuePayload.id ?? ""]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
    let requestPayload: JiraServiceDeskRequestDetailResponse | null = null;
    for (const requestId of requestLookupCandidates) {
      try {
        requestPayload = await fetchJiraJson<JiraServiceDeskRequestDetailResponse>(
          `${input.baseUrl.replace(/\/$/, "")}/rest/servicedeskapi/request/${encodeURIComponent(requestId)}?expand=requestFieldValues`,
          input.email,
          input.token,
        );
        if (requestPayload) break;
      } catch {
        continue;
      }
    }

    const issueFields =
      issuePayload.fields && typeof issuePayload.fields === "object" && !Array.isArray(issuePayload.fields)
        ? (issuePayload.fields as Record<string, unknown>)
        : {};
    const issueFieldNames =
      issuePayload.names && typeof issuePayload.names === "object" && !Array.isArray(issuePayload.names)
        ? issuePayload.names
        : {};
    const issueDescription = normalizeWhitespace(adfToText((issueFields.description as JiraPrimitive | JiraAdfNode) ?? ""));
    const source = {
      issue: issuePayload,
      request: requestPayload,
      requestFieldValues:
        requestPayload && typeof requestPayload === "object"
          ? (requestPayload.requestFieldValues ?? requestPayload.values ?? null)
          : null,
    };

    const vendorEmail =
      findValueInObject(source, [
        "vendor e-mail address",
        "vendor email address",
        "vendor e-mail",
        "vendor email",
        "fornecedor e-mail",
        "fornecedor email",
        "email do vendor",
        "email do fornecedor",
      ]) ??
      findIssueFieldValue(issueFields, issueFieldNames, [
        "vendor e-mail address",
        "vendor email address",
        "vendor e-mail",
        "vendor email",
        "supplier email",
        "email do vendor",
        "email do fornecedor",
      ]) ??
      findFieldValue(issueDescription, [
        "vendor e-mail address",
        "vendor email address",
        "vendor e-mail",
        "vendor email",
        "email do vendor",
      ]);
    const vtexResponsibleEmail =
      findValueInObject(source, [
        "vtex e-mail responsible",
        "vtex email responsible",
        "responsavel vtex",
        "responsável vtex",
        "responsible email",
        "ponto focal vtex",
        "vtex focal point",
      ]) ??
      findIssueFieldValue(issueFields, issueFieldNames, [
        "vtex e-mail responsible",
        "vtex email responsible",
        "responsavel vtex",
        "responsável vtex",
        "vtex responsible",
        "responsible email",
        "ponto focal vtex",
      ]) ??
      findFieldValue(issueDescription, ["vtex e-mail responsible", "vtex email responsible", "responsavel vtex"]);
    const languagePreference =
      findValueInObject(source, ["vendor language preferences", "language preference", "idioma", "language"]) ??
      findIssueFieldValue(issueFields, issueFieldNames, [
        "vendor language preferences",
        "language preference",
        "idioma",
        "language",
      ]) ??
      findFieldValue(issueDescription, ["vendor language preferences", "language preference", "idioma"]);
    const priority =
      findValueInObject(source, ["priority", "prioridade"]) ??
      findIssueFieldValue(issueFields, issueFieldNames, ["priority", "prioridade"]) ??
      findFieldValue(issueDescription, ["priority", "prioridade"]);
    const company =
      findValueInObject(source, ["company", "empresa", "business unit", "company group", "grupo"]) ??
      findIssueFieldValue(issueFields, issueFieldNames, [
        "company",
        "empresa",
        "business unit",
        "company group",
        "grupo",
      ]) ??
      findFieldValue(issueDescription, ["company", "empresa", "business unit", "company group", "grupo"]);
    const capNumber =
      findValueInObject(source, ["cap number", "cap", "cap-number", "numero cap", "número cap"]) ??
      findIssueFieldValue(issueFields, issueFieldNames, ["cap number", "cap", "cap-number", "numero cap", "número cap"]) ??
      findFieldValue(issueDescription, ["cap number", "cap", "cap-number", "numero cap", "número cap"]);
    const scope =
      findValueInObject(source, ["scope", "escopo", "context", "contexto"]) ??
      findIssueFieldValue(issueFields, issueFieldNames, ["scope", "escopo", "context", "contexto"]) ??
      findFieldValue(issueDescription, ["scope", "escopo", "context", "contexto"]);

    const sanitized = sanitizeVendorFormFieldValues({
      vendorEmail: vendorEmail || null,
      vtexResponsibleEmail: vtexResponsibleEmail || null,
      languagePreference: languagePreference || null,
      priority: priority || null,
      company: company || null,
      capNumber: capNumber || null,
      scope: scope || null,
    });

    return {
      vendorEmail: sanitized.vendorEmail,
      vtexResponsibleEmail: sanitized.vtexResponsibleEmail,
      languagePreference: sanitized.languagePreference,
      priority: sanitized.priority,
      company: sanitized.company,
      capNumber: sanitized.capNumber,
      scope: sanitized.scope,
      description: issueDescription || null,
    };
  } catch (error) {
    console.warn(
      `[jira] failed to enrich vendor fields from issue fields for ${input.issueKey}:`,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

async function fetchJiraIssueId(input: {
  baseUrl: string;
  email: string;
  token: string;
  issueKey: string;
}) {
  const payload = await fetchJiraJson<JiraIssueDetailResponse>(
    `${input.baseUrl.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(input.issueKey)}?fields=created`,
    input.email,
    input.token,
  );

  return payload.id?.trim() || null;
}

async function resolveConfiguredJiraIssueContext(input: {
  issueKey: string;
  entityKind: "VENDOR" | "PARTNER";
}) {
  const settings = await getIntegrationSettings();
  const jiraSetting = getJiraSetting<JiraConfig>(settings, "JIRA");

  if (!jiraSetting?.enabled) {
    throw new Error("Jira integration is disabled.");
  }

  const config = jiraSetting.config;
  const baseUrl = config.base_url.trim();
  const email = config.api_email.trim() || process.env.JIRA_API_EMAIL || "";
  const token = config.api_token.trim() || process.env.JIRA_API_TOKEN || "";

  if (!baseUrl || !email || !token) {
    throw new Error("Jira integration credentials are incomplete.");
  }

  const queueConfig = input.entityKind === "PARTNER" ? config.partners : config.vendors;
  const projectKey = queueConfig.project_key.trim();
  const queueId = parseQueueId(queueConfig.queue_url);

  if (!projectKey || !queueId) {
    throw new Error(`Jira queue configuration is invalid for ${input.entityKind}.`);
  }

  const issueId = await fetchJiraIssueId({
    baseUrl,
    email,
    token,
    issueKey: input.issueKey,
  });

  if (!issueId) {
    throw new Error(`Jira issue ${input.issueKey} was not found.`);
  }

  const serviceDeskId = await fetchServiceDeskId(baseUrl, email, token, projectKey);
  if (!serviceDeskId) {
    throw new Error(`Service desk for project ${projectKey} was not found.`);
  }

  const queueJql = await fetchQueueJql(baseUrl, email, token, serviceDeskId, queueId);
  if (!queueJql) {
    throw new Error(`Queue JQL for ${input.entityKind} could not be resolved.`);
  }

  const matchesQueue = await issueMatchesJql(baseUrl, email, token, Number(issueId), queueJql);
  if (!matchesQueue) {
    throw new Error(`Jira issue ${input.issueKey} does not belong to the configured ${input.entityKind} queue.`);
  }

  return { baseUrl, email, token };
}

function normalizeSecRiskValue(value: string | null | undefined): "Low" | "Moderate" | "High" | "Extreme" | null {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized || normalized.includes("pending")) return null;
  if (normalized.includes("extreme") || normalized.includes("critical")) return "Extreme";
  if (normalized.includes("high")) return "High";
  if (normalized.includes("moderate") || normalized.includes("medium")) return "Moderate";
  if (normalized.includes("low")) return "Low";
  return null;
}

function normalizeFieldName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeJiraStatusName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function jiraStatusMatchesAlias(candidate: string | null | undefined, alias: string) {
  const normalizedCandidate = normalizeJiraStatusName(candidate);
  const normalizedAlias = normalizeJiraStatusName(alias);
  if (!normalizedCandidate || !normalizedAlias) return false;
  return (
    normalizedCandidate === normalizedAlias ||
    normalizedCandidate.includes(normalizedAlias) ||
    normalizedAlias.includes(normalizedCandidate)
  );
}

function getWorkflowStatusAliases(workflowStatusLabel: string) {
  const normalized = normalizeJiraStatusName(workflowStatusLabel);

  if (normalized === "opened" || normalized === "open") {
    return ["opened", "open"];
  }

  if (normalized === "waiting vendor") {
    return ["waiting vendor", "waiting for vendor", "awaiting response", "waiting for customer"];
  }

  if (normalized === "received quest." || normalized === "received quest") {
    return ["received quest.", "received quest", "response received", "received questionnaire"];
  }

  if (normalized === "red team") {
    return ["red team", "in review", "security review in progress"];
  }

  if (normalized === "concluido" || normalized === "concluído") {
    return ["concluido", "concluído", "completed", "done", "closed", "resolved"];
  }

  return [];
}

function findJiraAllowedValueOption(allowedValues: Array<Record<string, unknown>>, target: "Low" | "Moderate" | "High" | "Extreme") {
  return allowedValues.find((item) => {
    const value = typeof item.value === "string" ? item.value : "";
    const name = typeof item.name === "string" ? item.name : "";
    const label = typeof item.label === "string" ? item.label : "";
    return [value, name, label].some((candidate) => candidate.trim().toLowerCase() === target.toLowerCase());
  });
}

function parseLabeledValueFromLines(lines: string[], labels: string[]) {
  const normalizedLabels = labels.map((label) => normalizeKey(label));

  const isKnownLabel = (line: string) => {
    const normalizedLine = normalizeKey(line);
    return (
      normalizedLabels.some(
        (label) =>
          normalizedLine === label ||
          normalizedLine.startsWith(label) ||
          normalizedLine.includes(label),
      ) ||
      /(nameofvendor|vendoremail|vtexemailresponsible|vendorlanguagepreferences|priority|capnumber|company|scope|escopo|contexto)/i.test(
        normalizedLine,
      )
    );
  };

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index] ?? "";
    const normalizedCurrent = normalizeKey(current);
    const labelMatch = normalizedLabels.some(
      (label) =>
        normalizedCurrent === label ||
        normalizedCurrent.startsWith(label) ||
        normalizedCurrent.includes(label),
    );

    if (!labelMatch) continue;

    const collected: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor]?.trim() ?? "";
      if (!candidate) continue;
      if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(candidate)) break;
      if (isKnownLabel(candidate)) break;
      collected.push(candidate);
    }

    const merged = collected.join("\n").trim();
    if (merged) return merged;
  }

  const flattened = lines.join(" ").replace(/\s+/g, " ").trim();
  if (!flattened) return null;
  const fieldBoundaries = [
    "Name of Vendor",
    "Vendor e-mail address",
    "Vendor e-mail",
    "Vendor email address",
    "Vendor email",
    "VTEX e-mail responsible",
    "VTEX email responsible",
    "Vendor Language Preferences",
    "Priority",
    "CAP NUMBER",
    "Company",
    "Scope",
    "Escopo",
    "Context",
    "Contexto",
  ];
  const boundariesPattern = fieldBoundaries.map((item) => escapeRegex(item)).join("|");
  for (const label of labels) {
    const pattern = new RegExp(
      `${escapeRegex(label)}\\s*\\*?\\s*[:|-]?\\s*(.+?)(?=\\s+(?:${boundariesPattern})\\s*\\*?|$)`,
      "i",
    );
    const match = flattened.match(pattern);
    if (match?.[1]) {
      const value = normalizeWhitespace(match[1]);
      if (value) return value;
    }
  }

  return null;
}

function extractEmailFromText(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0]?.trim().toLowerCase() ?? null;
}

function parseEmailByLabel(text: string, labels: string[]) {
  for (const label of labels) {
    const regex = new RegExp(
      `${escapeRegex(label)}\\s*\\*?\\s*[:|-]?\\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,})`,
      "iu",
    );
    const match = text.match(regex);
    if (match?.[1]) {
      return extractEmailFromText(match[1]);
    }
  }

  return null;
}

function parseTextByLabel(text: string, labels: string[], boundaries: string[]) {
  const boundaryPattern = boundaries.map((item) => escapeRegex(item)).join("|");
  for (const label of labels) {
    const regex = new RegExp(
      `${escapeRegex(label)}\\s*\\*?\\s*[:|-]?\\s*([\\s\\S]{1,500}?)(?=(?:${boundaryPattern})\\s*\\*?\\s*[:|-]?|$)`,
      "iu",
    );
    const match = text.match(regex);
    if (match?.[1]) {
      const normalized = normalizeWhitespace(match[1]).replace(/\s+/g, " ").trim();
      if (normalized) return normalized;
    }
  }

  return null;
}

function normalizeExtractedCompany(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const strippedLabel = normalized.replace(/^(company|empresa)\s*\*?\s*[:|-]?\s*/i, "").trim();
  const cleaned = strippedLabel || normalized;
  if (!cleaned) return null;

  if (/^(cap|cap number)$/i.test(cleaned)) return null;

  if (/company\s*\*/i.test(cleaned) || /empresa\s*\*/i.test(cleaned)) {
    const token = cleaned
      .replace(/^(company|empresa)\s*\*?\s*/i, "")
      .split(/\s+/)
      .filter(Boolean)
      .pop();
    return token?.trim() || null;
  }

  return cleaned.length <= 120 ? cleaned : null;
}

function normalizeExtractedCapNumber(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const strippedLabel = normalized.replace(/^(cap|cap number)\s*\*?\s*[:|-]?\s*/i, "").trim();
  const cleaned = strippedLabel || normalized;
  if (!cleaned) return null;

  if (/company|empresa/i.test(cleaned) && !/\d/.test(cleaned)) return null;

  const digitMatch = cleaned.match(/\b\d{2,}\b/);
  if (digitMatch?.[0]) return digitMatch[0];

  if (/company|empresa|scope|escopo|context/i.test(cleaned)) return null;

  const compact = cleaned.replace(/\s+/g, "");
  if (/^[a-z0-9-]{2,20}$/i.test(compact)) {
    return compact;
  }

  return null;
}

function sanitizeLabelOnlyTextValue(value: string | null | undefined, labels: string[]) {
  const normalized = normalizeWhitespace(value ?? "");
  if (!normalized) return null;

  const lowered = normalized.toLowerCase();
  const isLabelOnly = labels.some((label) => lowered === normalizeWhitespace(label).toLowerCase());
  if (isLabelOnly) return null;

  return normalized;
}

function sanitizeVendorFormFieldValues(fields: {
  vendorEmail?: string | null;
  vtexResponsibleEmail?: string | null;
  languagePreference?: string | null;
  priority?: string | null;
  company?: string | null;
  capNumber?: string | null;
  scope?: string | null;
}) {
  const vendorEmail = extractEmailFromText(fields.vendorEmail ?? null);
  const vtexResponsibleEmail = extractEmailFromText(fields.vtexResponsibleEmail ?? null);
  const languagePreference = sanitizeLabelOnlyTextValue(fields.languagePreference ?? null, [
    "vendor language preferences",
    "language preference",
    "language",
    "idioma",
  ]);
  const priority = sanitizeLabelOnlyTextValue(fields.priority ?? null, ["priority", "prioridade"]);
  const company = normalizeExtractedCompany(fields.company ?? null);
  const capNumber = normalizeExtractedCapNumber(fields.capNumber ?? null);
  const scope = sanitizeLabelOnlyTextValue(fields.scope ?? null, ["scope", "escopo", "context", "contexto"]);

  return {
    vendorEmail,
    vtexResponsibleEmail,
    languagePreference,
    priority,
    company,
    capNumber,
    scope,
  };
}

function isVendorRequestPdfFilename(filename: string | null | undefined) {
  const normalized = String(filename ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes("vendor request") && normalized.endsWith(".pdf");
}

type ExtractedVendorAttachmentFields = {
  vendorEmail: string | null;
  scope: string | null;
  vtexResponsibleEmail: string | null;
  languagePreference: string | null;
  priority: string | null;
  company: string | null;
  capNumber: string | null;
};

function extractVendorFieldsFromPdfText(rawText: string): ExtractedVendorAttachmentFields | null {
  const rawNormalizedText = normalizeWhitespace(rawText);
  if (!rawNormalizedText) return null;

  const rawSingleLineText = rawNormalizedText.replace(/\s+/g, " ").trim();
  const lines = rawText
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  if (lines.length === 0) return null;

  const knownBoundaries = [
    "Name of Vendor",
    "Vendor e-mail address",
    "Vendor e-mail",
    "Vendor email address",
    "Vendor email",
    "VTEX e-mail responsible",
    "VTEX email responsible",
    "Vendor Language Preferences",
    "Priority",
    "CAP NUMBER",
    "Company",
    "Scope",
    "Escopo",
    "Context",
    "Contexto",
  ];

  const vendorEmail = parseEmailByLabel(rawSingleLineText, [
    "Vendor e-mail address",
    "Vendor e-mail",
    "Vendor email address",
    "Vendor email",
    "E-mail do vendor",
    "Email do vendor",
    "Email do fornecedor",
  ]) ?? parseLabeledValueFromLines(lines, [
    "Vendor e-mail address",
    "Vendor e-mail",
    "Vendor email address",
    "Vendor email",
    "E-mail do vendor",
    "Email do vendor",
    "Email do fornecedor",
  ]);

  const scope =
    parseTextByLabel(rawNormalizedText, ["Scope", "Escopo", "Context", "Contexto"], knownBoundaries) ??
    parseLabeledValueFromLines(lines, ["Scope", "Escopo", "Context", "Contexto"]);

  const vtexResponsibleEmail = parseEmailByLabel(rawSingleLineText, [
    "VTEX e-mail responsible",
    "VTEX email responsible",
    "Responsavel VTEX",
    "Responsável VTEX",
    "Ponto focal VTEX",
  ]) ?? parseLabeledValueFromLines(lines, [
    "VTEX e-mail responsible",
    "VTEX email responsible",
    "Responsavel VTEX",
    "Responsável VTEX",
  ]);

  const languagePreference =
    parseTextByLabel(rawNormalizedText, ["Vendor Language Preferences", "Language Preference", "Idioma", "Language"], knownBoundaries) ??
    parseLabeledValueFromLines(lines, ["Vendor Language Preferences", "Language Preference", "Idioma", "Language"]);

  const priority =
    parseTextByLabel(rawNormalizedText, ["Priority", "Prioridade"], knownBoundaries) ??
    parseLabeledValueFromLines(lines, ["Priority", "Prioridade"]);

  const company =
    parseTextByLabel(rawNormalizedText, ["Company", "Empresa", "Business unit", "Company group", "Grupo"], knownBoundaries) ??
    parseLabeledValueFromLines(lines, ["Company", "Empresa", "Business unit", "Company group", "Grupo"]);

  const capNumber =
    parseTextByLabel(rawNormalizedText, ["CAP NUMBER", "CAP", "CAP Number"], knownBoundaries) ??
    parseLabeledValueFromLines(lines, ["CAP NUMBER", "CAP", "CAP Number"]);

  const normalized = sanitizeVendorFormFieldValues({
    vendorEmail,
    vtexResponsibleEmail,
    languagePreference,
    priority,
    company,
    capNumber,
    scope,
  });

  if (
    normalized.vendorEmail ||
    normalized.scope ||
    normalized.vtexResponsibleEmail ||
    normalized.languagePreference ||
    normalized.priority ||
    normalized.company ||
    normalized.capNumber
  ) {
    return {
      vendorEmail: normalized.vendorEmail,
      scope: normalized.scope,
      vtexResponsibleEmail: normalized.vtexResponsibleEmail,
      languagePreference: normalized.languagePreference,
      priority: normalized.priority,
      company: normalized.company,
      capNumber: normalized.capNumber,
    };
  }

  return null;
}

function scoreExtractedVendorAttachmentFields(fields: ExtractedVendorAttachmentFields | null) {
  if (!fields) return 0;
  let score = 0;
  if (fields.vendorEmail) score += 3;
  if (fields.vtexResponsibleEmail) score += 3;
  if (fields.scope) score += 3;
  if (fields.languagePreference) score += 1;
  if (fields.priority) score += 1;
  if (fields.company) score += 1;
  if (fields.capNumber) score += 1;
  return score;
}

async function extractVendorFieldsFromAttachmentPdf(input: {
  baseUrl: string;
  email: string;
  token: string;
  issueKey: string;
}) {
  const issue = await fetchJiraJson<JiraIssueDetailResponse>(
    `${input.baseUrl.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(input.issueKey)}?fields=attachment`,
    input.email,
    input.token,
  );

  const attachments = issue.fields?.attachment ?? [];
  const pdfAttachments = attachments
    .filter((attachment) => {
      const name = (attachment.filename ?? "").toLowerCase();
      const mimeType = (attachment.mimeType ?? "").toLowerCase();
      return mimeType === "application/pdf" || name.endsWith(".pdf");
    })
    .sort((a, b) => {
      const leftPreferred = isVendorRequestPdfFilename(a.filename) ? 1 : 0;
      const rightPreferred = isVendorRequestPdfFilename(b.filename) ? 1 : 0;
      if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred;
      const left = Date.parse(a.created ?? "");
      const right = Date.parse(b.created ?? "");
      return right - left;
    });

  for (const attachment of pdfAttachments) {
    const contentUrl = attachment.content?.trim();
    if (!contentUrl) continue;

    let response = await fetch(contentUrl, {
      headers: {
        Authorization: buildJiraBasicAuthHeader(input.email, input.token),
        Accept: "*/*",
      },
      cache: "no-store",
    });

    if (!response.ok && attachment.id) {
      const fallbackUrl = `${input.baseUrl.replace(/\/$/, "")}/rest/api/3/attachment/content/${encodeURIComponent(attachment.id)}`;
      response = await fetch(fallbackUrl, {
        headers: {
          Authorization: buildJiraBasicAuthHeader(input.email, input.token),
          Accept: "*/*",
        },
        cache: "no-store",
      });
    }

    if (!response.ok) continue;

    const fileBuffer = Buffer.from(await response.arrayBuffer());
    const rawTexts: string[] = [];
    try {
      const loadingTask = getPdfDocument({
        data: new Uint8Array(fileBuffer),
        stopAtErrors: false,
        isEvalSupported: false,
        disableFontFace: true,
        verbosity: 0,
      });
      const pdfDocument = await loadingTask.promise;
      const pageTexts: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        const page = await pdfDocument.getPage(pageNumber);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => {
            if (!("str" in item) || typeof item.str !== "string") return "";
            const suffix = "hasEOL" in item && item.hasEOL ? "\n" : " ";
            return `${item.str}${suffix}`;
          })
          .join("")
          .trim();
        if (pageText) pageTexts.push(pageText);
      }
      await pdfDocument.destroy();
      if (pageTexts.length > 0) rawTexts.push(pageTexts.join("\n"));
    } catch (error) {
      console.warn(
        `[jira] pdf parse failed while enriching attachments for ${input.issueKey}:`,
        error instanceof Error ? error.message : String(error),
      );
      continue;
    }

    const uniqueRawTexts = Array.from(new Set(rawTexts.map((value) => normalizeWhitespace(value)).filter(Boolean)));
    let bestExtracted: ExtractedVendorAttachmentFields | null = null;
    let bestScore = 0;

    for (const rawText of uniqueRawTexts) {
      const extracted = extractVendorFieldsFromPdfText(rawText);
      const score = scoreExtractedVendorAttachmentFields(extracted);
      if (score > bestScore) {
        bestScore = score;
        bestExtracted = extracted;
      }
    }

    if (bestExtracted) {
      return bestExtracted;
    }
  }

  return null;
}

export async function enrichVendorFieldsFromJiraAttachments(input: {
  baseUrl: string;
  email: string;
  token: string;
  issueKey: string;
}) {
  try {
    return await extractVendorFieldsFromAttachmentPdf(input);
  } catch (error) {
    console.warn(
      `[jira] failed to enrich vendor fields from attachments for ${input.issueKey}:`,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
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

export async function addInternalCommentToConfiguredJiraIssue(input: {
  issueKey: string;
  entityKind: "VENDOR" | "PARTNER";
  commentBody: string;
}) {
  const { baseUrl, email, token } = await resolveConfiguredJiraIssueContext({
    issueKey: input.issueKey,
    entityKind: input.entityKind,
  });

  await postJiraJson(
    `${baseUrl.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(input.issueKey)}/comment`,
    email,
    token,
    {
      body: {
        version: 1,
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: input.commentBody,
              },
            ],
          },
        ],
      },
      properties: [
        {
          key: "sd.public.comment",
          value: {
            internal: true,
          },
        },
      ],
    },
  );
}

export async function updateConfiguredJiraIssueSecRisk(input: {
  issueKey: string;
  entityKind: "VENDOR" | "PARTNER";
  classification: string | null;
}) {
  const { baseUrl, email, token } = await resolveConfiguredJiraIssueContext({
    issueKey: input.issueKey,
    entityKind: input.entityKind,
  });

  const targetRisk = normalizeSecRiskValue(input.classification);
  const editMeta = await fetchJiraJson<JiraIssueEditMetaResponse>(
    `${baseUrl.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(input.issueKey)}/editmeta`,
    email,
    token,
  );

  const fieldEntry = Object.entries(editMeta.fields ?? {}).find(([, meta]) =>
    normalizeFieldName(meta?.name) === "[sec] risk",
  );

  if (!fieldEntry) {
    throw new Error("Jira field [SEC] Risk was not found in issue edit metadata.");
  }

  const [fieldId, fieldMeta] = fieldEntry;
  const allowedValues = Array.isArray(fieldMeta.allowedValues) ? fieldMeta.allowedValues : [];

  let jiraFieldValue: unknown = null;
  if (targetRisk) {
    const matchedOption = findJiraAllowedValueOption(allowedValues, targetRisk);
    if (matchedOption) {
      if (typeof matchedOption.id === "string" && matchedOption.id.trim()) {
        jiraFieldValue = { id: matchedOption.id };
      } else if (typeof matchedOption.value === "string" && matchedOption.value.trim()) {
        jiraFieldValue = { value: matchedOption.value };
      } else if (typeof matchedOption.name === "string" && matchedOption.name.trim()) {
        jiraFieldValue = { name: matchedOption.name };
      } else {
        jiraFieldValue = targetRisk;
      }
    } else {
      jiraFieldValue = targetRisk;
    }
  }

  await postJiraJson<null>(
    `${baseUrl.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(input.issueKey)}`,
    email,
    token,
    {
      fields: {
        [fieldId]: jiraFieldValue,
      },
    },
    {
      method: "PUT",
    },
  );
}

export async function updateConfiguredJiraIssueWorkflowStatus(input: {
  issueKey: string;
  entityKind: "VENDOR" | "PARTNER";
  workflowStatusLabel: string;
}) {
  const aliases = getWorkflowStatusAliases(input.workflowStatusLabel);
  if (aliases.length === 0) {
    return;
  }

  const { baseUrl, email, token } = await resolveConfiguredJiraIssueContext({
    issueKey: input.issueKey,
    entityKind: input.entityKind,
  });

  const issue = await fetchJiraJson<JiraIssueStatusResponse>(
    `${baseUrl.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(input.issueKey)}?fields=status`,
    email,
    token,
  );
  const currentStatus = normalizeJiraStatusName(issue.fields?.status?.name);
  if (aliases.some((alias) => jiraStatusMatchesAlias(currentStatus, alias))) {
    return;
  }

  const transitionPayload = await fetchJiraJson<JiraTransitionsResponse>(
    `${baseUrl.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(input.issueKey)}/transitions`,
    email,
    token,
  );

  const availableTransitions = transitionPayload.transitions ?? [];
  let selectedTransitionId: string | null = null;
  for (const alias of aliases) {
    const match = availableTransitions.find((transition) => {
      const transitionName = transition.name;
      const destinationName = transition.to?.name;
      return jiraStatusMatchesAlias(transitionName, alias) || jiraStatusMatchesAlias(destinationName, alias);
    });
    if (match?.id?.trim()) {
      selectedTransitionId = match.id.trim();
      break;
    }
  }

  if (!selectedTransitionId) {
    const available = availableTransitions.map((item) => item.to?.name || item.name || "unknown").join(", ");
    throw new Error(
      `No Jira transition found for workflow status "${input.workflowStatusLabel}". Available transitions: ${available || "none"}.`,
    );
  }

  await postJiraJson<null>(
    `${baseUrl.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(input.issueKey)}/transitions`,
    email,
    token,
    {
      transition: {
        id: selectedTransitionId,
      },
    },
  );
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

function findCompanyGroupFromPayload(payload: unknown, description: string) {
  const payloadMatches = findAllValuesInObject(payload, ["company", "company group", "grupo", "business unit"])
    .map((value) => normalizeCompanyGroup(value))
    .filter((value): value is "VTEX" | "WENI" => Boolean(value));
  const descriptionMatch = normalizeCompanyGroup(
    findFieldValue(description, ["company", "company group", "grupo", "business unit"]),
  );

  if (descriptionMatch) {
    return descriptionMatch;
  }

  if (payloadMatches.includes("WENI")) {
    return "WENI";
  }

  if (payloadMatches.includes("VTEX")) {
    return "VTEX";
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
    valueFromTopLevelPayload(payload, [
      "name-of-vendor",
      "name_of_vendor",
      "name of vendor",
      "name-of-partner",
      "name_of_partner",
      "name of partner",
    ]) ??
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
    valueFromTopLevelPayload(payload, [
      "vendor-e-mail-address",
      "vendor_email_address",
      "vendor email address",
      "vendedor-e-mail-address",
      "partner-e-mail-address",
      "partner_email_address",
      "partner email address",
    ]) ??
    findValueInObject(payload, [
      "vendor e-mail address",
      "vendor email address",
      "vendor e-mail",
      "vendor email",
      "email do vendor",
      "email do fornecedor",
      "partner e-mail address",
      "partner email address",
      "partner email",
      "email do parceiro",
      "contact email",
      "email",
    ]) ?? findFieldValue(description, ["vendor e-mail address", "partner email", "contact email", "email", "e-mail"]);
  const vtexResponsibleEmail =
    valueFromTopLevelPayload(payload, [
      "vtex-e-mail-responsible",
      "vtex_email_responsible",
      "vtex email responsible",
      "responsavel-vtex",
      "responsável-vtex",
    ]) ??
    findValueInObject(payload, ["vtex e-mail responsible", "vtex email responsible", "responsavel vtex", "responsible email"]) ??
    findFieldValue(description, ["vtex e-mail responsible", "vtex email responsible", "responsavel vtex"]);
  const languagePreference =
    valueFromTopLevelPayload(payload, [
      "vendor-language-preferences",
      "vendor_language_preferences",
      "vendor language preferences",
      "vendor-language",
      "vendor language",
    ]) ??
    findValueInObject(payload, ["vendor language preferences", "vendor language", "idioma do vendor"]) ??
    findFieldValue(description, ["vendor language preferences", "vendor language", "idioma do vendor"]);
  const companyGroupFromForm = findCompanyGroupFromPayload(payload, description);
  const capNumber =
    valueFromTopLevelPayload(payload, ["cap-number", "cap_number", "cap number", "cap"]) ??
    findValueInObject(payload, ["cap number", "cap"]) ??
    findFieldValue(description, ["cap number", "cap"]);
  const scope =
    valueFromTopLevelPayload(payload, ["scope", "escopo", "context", "contexto"]) ??
    findValueInObject(payload, ["scope", "escopo", "context", "contexto"]) ??
    findFieldValue(description, ["scope", "escopo", "context", "contexto"]);
  const formPriority =
    valueFromTopLevelPayload(payload, ["priority", "vendor-priority", "vendor_priority", "vendor priority"]) ??
    findValueInObject(payload, ["vendor priority", "prioridade do vendor", "prioridade vendor"]) ??
    findFieldValue(description, ["vendor priority", "prioridade do vendor", "prioridade vendor"]);
  const reporterName =
    valueFromTopLevelPayload(payload, ["reporter-name", "reporter_name", "reporter name", "relator", "nome-relator"]) ??
    findValueInObject(payload, ["reporter name", "reporter", "relator", "nome do relator"]) ??
    fields.reporter?.displayName?.trim() ??
    null;
  const reporterEmail =
    valueFromTopLevelPayload(payload, ["reporter-email", "reporter_email", "reporter email", "email-relator"]) ??
    findValueInObject(payload, ["reporter email", "email do relator"]) ??
    fields.reporter?.emailAddress?.trim() ??
    null;
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
  const riskPriorityLabel =
    stringifyUnknown(fields.priority) ??
    findFieldValue(description, ["priority", "prioridade"]);
  const status = inferStatus(fields);
  const riskLevel = inferRiskLevel(
    {
      ...fields,
      priority: {
        name:
          riskPriorityLabel ??
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
  const initialWorkflowLabel =
    kind === "VENDOR" && status === "PENDING" ? "Opened" : formatStatusLabel(status);
  const sanitizedVendorFormData = sanitizeVendorFormFieldValues({
    vendorEmail: contactEmail,
    vtexResponsibleEmail: vtexResponsibleEmail ?? fields.assignee?.emailAddress?.trim() ?? null,
    languagePreference,
    priority: formPriority,
    company: companyGroupFromForm ? companyGroupFromForm : null,
    capNumber,
    scope,
  });

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
    statusLabel: initialWorkflowLabel,
    status,
    riskLevel,
    ownerEmail: sanitizedVendorFormData.vtexResponsibleEmail ?? fields.assignee?.emailAddress?.trim() ?? null,
    jiraFormData: {
      vendorEmail: sanitizedVendorFormData.vendorEmail,
      vtexResponsibleEmail: sanitizedVendorFormData.vtexResponsibleEmail ?? fields.assignee?.emailAddress?.trim() ?? null,
      languagePreference: sanitizedVendorFormData.languagePreference,
      priority: sanitizedVendorFormData.priority,
      company: sanitizedVendorFormData.company,
      capNumber: sanitizedVendorFormData.capNumber,
      scope: sanitizedVendorFormData.scope,
      reporterName,
      reporterEmail,
    },
  };
}
