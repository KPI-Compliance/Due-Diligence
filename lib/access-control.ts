import { sql } from "@/lib/db";

export type AccessGroup = "ADMIN" | "TECGRC" | "COMPLIANCE" | "PRIVACY" | "PROCUREMENT";

export type AccessPermissions = {
  canManageSettings: boolean;
  canWritePartners: boolean;
  canWriteVendors: boolean;
};

export type ResolvedUserAccess = {
  email: string;
  group: AccessGroup;
  permissions: AccessPermissions;
  source: "bootstrap" | "assigned" | "default";
  isActive: boolean;
};

export type UserAccessProfileRow = {
  email: string;
  fullName: string | null;
  group: AccessGroup;
  isActive: boolean;
  updatedAt: string | null;
};

const GROUPS: AccessGroup[] = ["ADMIN", "TECGRC", "COMPLIANCE", "PRIVACY", "PROCUREMENT"];
const GROUP_SET = new Set<AccessGroup>(GROUPS);
const FULL_ACCESS_GROUPS = new Set<AccessGroup>(["ADMIN", "TECGRC"]);

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function splitEnvList(value: string | undefined) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeGroup(value: unknown): AccessGroup {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase() as AccessGroup;
  return GROUP_SET.has(normalized) ? normalized : "PROCUREMENT";
}

function permissionsForGroup(group: AccessGroup): AccessPermissions {
  const isFullAccess = FULL_ACCESS_GROUPS.has(group);
  return {
    canManageSettings: isFullAccess,
    // COMPLIANCE and PRIVACY are read-only — only ADMIN and TECGRC may write entities.
    canWritePartners: isFullAccess,
    canWriteVendors: isFullAccess,
  };
}

function getBootstrapAdminEmails() {
  const explicit = splitEnvList(process.env.RBAC_ADMIN_EMAILS);
  if (explicit.length > 0) return explicit;
  const fallbackAllowed = splitEnvList(process.env.ALLOWED_GOOGLE_EMAILS);
  return fallbackAllowed.length > 0 ? [fallbackAllowed[0]] : [];
}

export async function resolveUserAccess(email: string): Promise<ResolvedUserAccess> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return {
      email: "",
      group: "PROCUREMENT",
      permissions: permissionsForGroup("PROCUREMENT"),
      source: "default",
      isActive: false,
    };
  }

  try {
    const rows = (await sql`
      SELECT email, access_group, is_active
      FROM user_access_profiles
      WHERE lower(email) = lower(${normalizedEmail})
      LIMIT 1
    `) as Array<{ email: string; access_group: string; is_active: boolean }>;

    const row = rows[0];
    if (row) {
      const group = normalizeGroup(row.access_group);
      const isActive = Boolean(row.is_active);
      const effectiveGroup = isActive ? group : "PROCUREMENT";

      return {
        email: normalizeEmail(row.email),
        group: effectiveGroup,
        permissions: permissionsForGroup(effectiveGroup),
        source: "assigned",
        isActive,
      };
    }
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== "42P01") {
      throw error;
    }
  }

  const bootstrapAdmins = getBootstrapAdminEmails();
  if (bootstrapAdmins.includes(normalizedEmail)) {
    return {
      email: normalizedEmail,
      group: "ADMIN",
      permissions: permissionsForGroup("ADMIN"),
      source: "bootstrap",
      isActive: true,
    };
  }

  return {
    email: normalizedEmail,
    group: "PROCUREMENT",
    permissions: permissionsForGroup("PROCUREMENT"),
    source: "default",
    isActive: true,
  };
}

export async function listUserAccessProfiles() {
  try {
    const rows = (await sql`
      SELECT
        email,
        full_name,
        access_group,
        is_active,
        updated_at::text AS updated_at
      FROM user_access_profiles
      ORDER BY updated_at DESC, email ASC
    `) as Array<{
      email: string;
      full_name: string | null;
      access_group: string;
      is_active: boolean;
      updated_at: string | null;
    }>;

    return rows.map((row) => ({
      email: normalizeEmail(row.email),
      fullName: row.full_name?.trim() || null,
      group: normalizeGroup(row.access_group),
      isActive: Boolean(row.is_active),
      updatedAt: row.updated_at,
    })) satisfies UserAccessProfileRow[];
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01") {
      return [] as UserAccessProfileRow[];
    }
    throw error;
  }
}

export async function upsertUserAccessProfile(input: {
  email: string;
  fullName?: string | null;
  group: AccessGroup;
  isActive: boolean;
}) {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    throw new Error("E-mail inválido para perfil de acesso.");
  }

  const group = normalizeGroup(input.group);
  const fullName = String(input.fullName ?? "").trim() || null;

  try {
    await sql`
      INSERT INTO user_access_profiles (email, full_name, access_group, is_active)
      VALUES (${email}, ${fullName}, ${group}, ${input.isActive})
      ON CONFLICT (email)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        access_group = EXCLUDED.access_group,
        is_active = EXCLUDED.is_active,
        updated_at = now()
    `;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01") {
      throw new Error("Tabela user_access_profiles não encontrada. Rode o migration 018.");
    }
    throw error;
  }
}

export async function deleteUserAccessProfile(emailInput: string) {
  const email = normalizeEmail(emailInput);
  if (!email || !email.includes("@")) {
    throw new Error("E-mail inválido para remoção do perfil de acesso.");
  }

  try {
    await sql`
      DELETE FROM user_access_profiles
      WHERE lower(email) = lower(${email})
    `;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01") {
      throw new Error("Tabela user_access_profiles não encontrada. Rode o migration 018.");
    }
    throw error;
  }
}
