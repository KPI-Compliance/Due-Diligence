import { sql } from "@/lib/db";

export type PlatformSettingsKey = "GENERAL" | "RISK_SCORING" | "NOTIFICATIONS";

export type GeneralSettings = {
  organization_name: string;
  primary_business_unit: "VTEX" | "WENI";
  platform_domain: string;
  sla_response_days: number;
  sla_review_days: number;
  default_risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  auto_create_assessment: boolean;
  require_security_review: boolean;
};

export type RiskScoringSettings = {
  security_weight: number;
  privacy_weight: number;
  compliance_weight: number;
  fully_score: number;
  partially_score: number;
  does_not_meet_score: number;
  low_max: number;
  medium_max: number;
};

export type NotificationSettings = {
  notify_on_responded: boolean;
  notify_on_critical: boolean;
  notify_on_overdue: boolean;
  slack_channel: string;
  escalation_emails: string;
};

function fallbackSettings(key: PlatformSettingsKey) {
  if (key === "GENERAL") {
    return {
      organization_name: "Due Diligence VTEX",
      primary_business_unit: "VTEX",
      platform_domain: "https://due-diligence-eight.vercel.app",
      sla_response_days: 10,
      sla_review_days: 5,
      default_risk_level: "MEDIUM",
      auto_create_assessment: true,
      require_security_review: true,
    } satisfies GeneralSettings;
  }

  if (key === "RISK_SCORING") {
    return {
      security_weight: 50,
      privacy_weight: 30,
      compliance_weight: 20,
      fully_score: 0,
      partially_score: 5,
      does_not_meet_score: 10,
      low_max: 3,
      medium_max: 6,
    } satisfies RiskScoringSettings;
  }

  return {
    notify_on_responded: true,
    notify_on_critical: true,
    notify_on_overdue: false,
    slack_channel: "#risk-alerts",
    escalation_emails: "risk@vtex.com, compliance@vtex.com",
  } satisfies NotificationSettings;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function normalizeGeneralSettings(raw: unknown): GeneralSettings {
  const base = fallbackSettings("GENERAL") as GeneralSettings;
  if (!raw || typeof raw !== "object") return base;

  const source = raw as Record<string, unknown>;
  const unit = source.primary_business_unit === "WENI" ? "WENI" : "VTEX";
  const risk = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(String(source.default_risk_level))
    ? (source.default_risk_level as GeneralSettings["default_risk_level"])
    : base.default_risk_level;

  return {
    organization_name: String(source.organization_name ?? base.organization_name),
    primary_business_unit: unit,
    platform_domain: String(source.platform_domain ?? base.platform_domain),
    sla_response_days: clampNumber(source.sla_response_days, 1, 365, base.sla_response_days),
    sla_review_days: clampNumber(source.sla_review_days, 1, 365, base.sla_review_days),
    default_risk_level: risk,
    auto_create_assessment: Boolean(source.auto_create_assessment),
    require_security_review: Boolean(source.require_security_review),
  };
}

export function normalizeRiskScoringSettings(raw: unknown): RiskScoringSettings {
  const base = fallbackSettings("RISK_SCORING") as RiskScoringSettings;
  if (!raw || typeof raw !== "object") return base;

  const source = raw as Record<string, unknown>;
  return {
    security_weight: clampNumber(source.security_weight, 0, 100, base.security_weight),
    privacy_weight: clampNumber(source.privacy_weight, 0, 100, base.privacy_weight),
    compliance_weight: clampNumber(source.compliance_weight, 0, 100, base.compliance_weight),
    fully_score: clampNumber(source.fully_score, 0, 10, base.fully_score),
    partially_score: clampNumber(source.partially_score, 0, 10, base.partially_score),
    does_not_meet_score: clampNumber(source.does_not_meet_score, 0, 10, base.does_not_meet_score),
    low_max: clampNumber(
      source.low_max,
      0,
      10,
      typeof source.low_min === "number" ? Math.round((100 - source.low_min) / 10) : base.low_max,
    ),
    medium_max: clampNumber(
      source.medium_max,
      0,
      10,
      typeof source.medium_min === "number" ? Math.round((100 - source.medium_min) / 10) : base.medium_max,
    ),
  };
}

export function normalizeNotificationSettings(raw: unknown): NotificationSettings {
  const base = fallbackSettings("NOTIFICATIONS") as NotificationSettings;
  if (!raw || typeof raw !== "object") return base;

  const source = raw as Record<string, unknown>;
  return {
    notify_on_responded: Boolean(source.notify_on_responded),
    notify_on_critical: Boolean(source.notify_on_critical),
    notify_on_overdue: Boolean(source.notify_on_overdue),
    slack_channel: String(source.slack_channel ?? base.slack_channel),
    escalation_emails: String(source.escalation_emails ?? base.escalation_emails),
  };
}

export async function getPlatformSettings<T>(
  key: PlatformSettingsKey,
  normalizer: (raw: unknown) => T,
): Promise<T> {
  try {
    const rows = (await sql`
      SELECT value
      FROM platform_settings
      WHERE key = ${key}
      LIMIT 1
    `) as Array<{ value: unknown }>;

    if (rows.length === 0) {
      return normalizer(fallbackSettings(key));
    }

    return normalizer(rows[0].value);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01") {
      return normalizer(fallbackSettings(key));
    }
    throw error;
  }
}

export async function upsertPlatformSettings<T>(
  key: PlatformSettingsKey,
  value: T,
) {
  try {
    await sql`
      INSERT INTO platform_settings (key, value)
      VALUES (${key}, ${JSON.stringify(value)}::jsonb)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value
    `;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01") {
      throw new Error("platform_settings table not found. Run database/006_platform_settings.sql.");
    }
    throw error;
  }
}
