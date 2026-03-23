import { getIntegrationSettings, type JiraConfig } from "@/lib/settings-data";

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
  jiraFormData: {
    vendorEmail: string | null;
    vtexResponsibleEmail: string | null;
    languagePreference: string | null;
    priority: string | null;
    company: string | null;
    capNumber: string | null;
    scope: string | null;
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

  return null;
}

async function extractVendorFieldsFromAttachmentPdf(input: {
  baseUrl: string;
  email: string;
  token: string;
  issueKey: string;
}) {
  let PDFParseCtor: typeof import("pdf-parse").PDFParse | null = null;
  try {
    const pdfParseModule = await import("pdf-parse");
    PDFParseCtor = pdfParseModule.PDFParse;
  } catch (error) {
    console.warn(
      `[jira] pdf parser unavailable while enriching attachments for ${input.issueKey}:`,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }

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
      const left = Date.parse(a.created ?? "");
      const right = Date.parse(b.created ?? "");
      return right - left;
    });

  for (const attachment of pdfAttachments) {
    const contentUrl = attachment.content?.trim();
    if (!contentUrl) continue;

    const response = await fetch(contentUrl, {
      headers: {
        Authorization: buildJiraBasicAuthHeader(input.email, input.token),
        Accept: "application/pdf",
      },
      cache: "no-store",
    });

    if (!response.ok) continue;

    const fileBuffer = Buffer.from(await response.arrayBuffer());
    if (!PDFParseCtor) continue;
    const parser = new PDFParseCtor({ data: fileBuffer });
    const parsed = await parser.getText();
    await parser.destroy();

    const lines = (parsed.text ?? "")
      .replace(/\r/g, "\n")
      .split(/\n+/)
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean);

    if (lines.length === 0) continue;

    const vendorEmail = parseLabeledValueFromLines(lines, [
      "Vendor e-mail address",
      "Vendor e-mail",
      "Vendor email address",
      "Vendor email",
      "E-mail do vendor",
      "Email do vendor",
      "Email do fornecedor",
    ]);
    const scope = parseLabeledValueFromLines(lines, [
      "Scope",
      "Escopo",
      "Context",
      "Contexto",
    ]);
    const vtexResponsibleEmail = parseLabeledValueFromLines(lines, [
      "VTEX e-mail responsible",
      "VTEX email responsible",
      "Responsavel VTEX",
      "Responsável VTEX",
    ]);

    if (vendorEmail || scope || vtexResponsibleEmail) {
      return {
        vendorEmail,
        scope,
        vtexResponsibleEmail,
      };
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
    findValueInObject(payload, ["vtex e-mail responsible", "vtex email responsible", "responsavel vtex", "responsible email"]) ??
    findFieldValue(description, ["vtex e-mail responsible", "vtex email responsible", "responsavel vtex"]);
  const languagePreference =
    findValueInObject(payload, ["vendor language preferences", "language preference", "idioma", "language"]) ??
    findFieldValue(description, ["vendor language preferences", "language preference", "idioma"]);
  const companyGroupFromForm = findCompanyGroupFromPayload(payload, description);
  const capNumber =
    findValueInObject(payload, ["cap number", "cap"]) ?? findFieldValue(description, ["cap number", "cap"]);
  const scope =
    findValueInObject(payload, ["scope", "escopo", "context", "contexto"]) ??
    findFieldValue(description, ["scope", "escopo", "context", "contexto"]);
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
  const priorityLabel =
    findValueInObject(payload, ["priority", "prioridade"]) ??
    stringifyUnknown(fields.priority) ??
    findFieldValue(description, ["priority", "prioridade"]);
  const status = inferStatus(fields);
  const riskLevel = inferRiskLevel(
    {
      ...fields,
      priority: {
        name:
          priorityLabel ??
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
    jiraFormData: {
      vendorEmail: contactEmail,
      vtexResponsibleEmail: vtexResponsibleEmail ?? fields.assignee?.emailAddress?.trim() ?? null,
      languagePreference,
      priority: priorityLabel,
      company: companyGroupFromForm ?? companyGroup,
      capNumber,
      scope,
    },
  };
}
