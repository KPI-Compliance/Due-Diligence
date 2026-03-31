import { getIntegrationSettings, type SlackConfig } from "@/lib/settings-data";

type SlackApiEnvelope<T> = {
  ok: boolean;
  error?: string;
} & T;

type SlackUserLookupResponse = SlackApiEnvelope<{
  user?: {
    id?: string;
  };
}>;

type SlackConversationOpenResponse = SlackApiEnvelope<{
  channel?: {
    id?: string;
  };
}>;

type SlackChatPostMessageResponse = SlackApiEnvelope<{
  ts?: string;
  channel?: string;
}>;

function getSlackToken() {
  return process.env.SLACK_BOT_TOKEN?.trim() ?? "";
}

async function callSlackApi<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const token = getSlackToken();
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN não configurado.");
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      params.set(key, value);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      params.set(key, String(value));
      continue;
    }
    if (Array.isArray(value)) {
      params.set(
        key,
        value
          .map((item) => (item === null || item === undefined ? "" : String(item)))
          .filter(Boolean)
          .join(","),
      );
      continue;
    }
    params.set(key, JSON.stringify(value));
  }

  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body: params.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Slack API ${method} retornou status ${response.status}.`);
  }

  const data = (await response.json()) as T;
  return data;
}

function getSlackSetting(
  list: Array<{ provider: string; enabled: boolean; config: unknown }>,
): { provider: string; enabled: boolean; config: SlackConfig } | null {
  const found = list.find((item) => item.provider === "SLACK");
  if (!found) return null;
  return found as { provider: string; enabled: boolean; config: SlackConfig };
}

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(value: string | null | undefined) {
  const normalized = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export async function sendSlackDirectMessageByEmail(input: {
  email: string;
  text: string;
}) {
  if (!isValidEmail(input.email)) {
    return { ok: false as const, reason: "invalid_email" as const };
  }

  const lookup = await callSlackApi<SlackUserLookupResponse>("users.lookupByEmail", {
    email: normalizeEmail(input.email),
  });

  if (!lookup.ok || !lookup.user?.id) {
    return { ok: false as const, reason: "user_lookup_failed" as const, error: lookup.error ?? "unknown" };
  }

  const opened = await callSlackApi<SlackConversationOpenResponse>("conversations.open", {
    users: lookup.user.id,
  });

  if (!opened.ok || !opened.channel?.id) {
    return { ok: false as const, reason: "conversation_open_failed" as const, error: opened.error ?? "unknown" };
  }

  const sent = await callSlackApi<SlackChatPostMessageResponse>("chat.postMessage", {
    channel: opened.channel.id,
    text: input.text,
    unfurl_links: false,
    unfurl_media: false,
  });

  if (!sent.ok) {
    return { ok: false as const, reason: "post_message_failed" as const, error: sent.error ?? "unknown" };
  }

  return {
    ok: true as const,
    mode: "dm" as const,
    channel: opened.channel.id,
    ts: sent.ts ?? null,
  };
}

export async function sendSlackChannelMessage(input: { channel: string; text: string }) {
  const channel = String(input.channel ?? "").trim();
  if (!channel) {
    return { ok: false as const, reason: "missing_channel" as const };
  }

  const sent = await callSlackApi<SlackChatPostMessageResponse>("chat.postMessage", {
    channel,
    text: input.text,
    unfurl_links: false,
    unfurl_media: false,
  });

  if (!sent.ok) {
    return { ok: false as const, reason: "post_message_failed" as const, error: sent.error ?? "unknown" };
  }

  return {
    ok: true as const,
    mode: "channel" as const,
    channel,
    ts: sent.ts ?? null,
  };
}

export async function sendInternalQuestionnaireSlackMessage(input: {
  focalEmail: string | null;
  message: string;
}) {
  const settings = await getIntegrationSettings();
  const slack = getSlackSetting(settings);
  if (!slack?.enabled) {
    throw new Error("Integração Slack está desativada em Settings.");
  }

  const focalEmail = normalizeEmail(input.focalEmail);
  if (!isValidEmail(focalEmail)) {
    throw new Error("E-mail do solicitante inválido ou ausente para envio via Slack DM.");
  }

  const dmResult = await sendSlackDirectMessageByEmail({
    email: focalEmail,
    text: input.message,
  });

  if (!dmResult.ok) {
    throw new Error(`Falha ao enviar Slack DM (${dmResult.reason}${"error" in dmResult && dmResult.error ? `: ${dmResult.error}` : ""}).`);
  }

  return dmResult;
}
