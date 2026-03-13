import { getIntegrationSettings, type TypeformConfig } from "@/lib/settings-data";
import { type TypeformFieldDefinition } from "@/lib/typeform";

export async function getTypeformApiCredentials() {
  const settings = await getIntegrationSettings();
  const typeformSetting = settings.find((item) => item.provider === "TYPEFORM");
  const config = (typeformSetting?.config ?? {}) as Partial<TypeformConfig>;

  return {
    user: config.api_user?.trim() || null,
    token: config.api_token?.trim() || process.env.TYPEFORM_API_TOKEN || process.env.TYPEFORM_ACCESS_TOKEN || null,
  };
}

export async function fetchTypeformFormFields(formId: string): Promise<TypeformFieldDefinition[]> {
  const { token } = await getTypeformApiCredentials();
  if (!token) return [];

  const response = await fetch(`https://api.typeform.com/forms/${formId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { fields?: TypeformFieldDefinition[] };
  return payload.fields ?? [];
}
