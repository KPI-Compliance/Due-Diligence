import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/settings-data", () => ({
  getIntegrationSettings: vi.fn(),
}));

import {
  isSupportedJiraWebhookEvent,
  jiraStatusNameFromWebhookField,
  normalizeVendorDisplayName,
  extractEntityFromJiraIssue,
  type JiraWebhookPayload,
} from "@/lib/jira";

describe("isSupportedJiraWebhookEvent", () => {
  it("returns true for jira:issue_created event", () => {
    expect(isSupportedJiraWebhookEvent({ webhookEvent: "jira:issue_created" })).toBe(true);
  });

  it("returns true for jira:issue_updated event", () => {
    expect(isSupportedJiraWebhookEvent({ webhookEvent: "jira:issue_updated" })).toBe(true);
  });

  it("returns true for issue_created via issue_event_type_name", () => {
    expect(isSupportedJiraWebhookEvent({ issue_event_type_name: "issue_created" })).toBe(true);
  });

  it("returns true for issue_updated via issue_event_type_name", () => {
    expect(isSupportedJiraWebhookEvent({ issue_event_type_name: "issue_updated" })).toBe(true);
  });

  it("returns false for unsupported event types", () => {
    expect(isSupportedJiraWebhookEvent({ webhookEvent: "jira:issue_deleted" })).toBe(false);
    expect(isSupportedJiraWebhookEvent({ webhookEvent: "jira:version_created" })).toBe(false);
    expect(isSupportedJiraWebhookEvent({})).toBe(false);
  });

  it("is case-insensitive for event names", () => {
    expect(isSupportedJiraWebhookEvent({ webhookEvent: "JIRA:ISSUE_UPDATED" })).toBe(true);
  });
});

describe("jiraStatusNameFromWebhookField", () => {
  it("returns the status name from an object with a name property", () => {
    expect(jiraStatusNameFromWebhookField({ name: "In Progress" })).toBe("In Progress");
  });

  it("returns null when status is null", () => {
    expect(jiraStatusNameFromWebhookField(null)).toBeNull();
  });

  it("returns null when status is undefined", () => {
    expect(jiraStatusNameFromWebhookField(undefined)).toBeNull();
  });

  it("returns null when status object has no name", () => {
    expect(jiraStatusNameFromWebhookField({})).toBeNull();
  });

  it("returns null when the name is null", () => {
    expect(jiraStatusNameFromWebhookField({ name: null })).toBeNull();
  });
});

describe("normalizeVendorDisplayName", () => {
  it("returns null for null input", () => {
    expect(normalizeVendorDisplayName(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(normalizeVendorDisplayName(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeVendorDisplayName("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(normalizeVendorDisplayName("   ")).toBeNull();
  });

  it("returns the name trimmed for a valid company name", () => {
    const result = normalizeVendorDisplayName("Acme Corp");
    expect(result).toBe("Acme Corp");
  });

  it("truncates names longer than 120 characters", () => {
    const longName = "A".repeat(200);
    const result = normalizeVendorDisplayName(longName);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(120);
  });
});

describe("extractEntityFromJiraIssue", () => {
  const minimalValidPayload: JiraWebhookPayload = {
    webhookEvent: "jira:issue_created",
    issue: {
      key: "TPRM-999",
      fields: {
        summary: "Onboarding Acme Corp",
        issuetype: { name: "Vendor Assessment" },
        status: { name: "Open" },
        labels: [],
        description: null,
        assignee: null,
        reporter: null,
        priority: { name: "Medium" },
      },
    },
  };

  it("returns null when issueKey is missing", () => {
    const payload: JiraWebhookPayload = {
      webhookEvent: "jira:issue_created",
      issue: { fields: minimalValidPayload.issue!.fields },
    };
    expect(extractEntityFromJiraIssue(payload)).toBeNull();
  });

  it("returns null when fields are missing", () => {
    const payload: JiraWebhookPayload = {
      webhookEvent: "jira:issue_created",
      issue: { key: "TPRM-1" },
    };
    expect(extractEntityFromJiraIssue(payload)).toBeNull();
  });

  it("returns null when summary is empty", () => {
    const payload: JiraWebhookPayload = {
      ...minimalValidPayload,
      issue: {
        ...minimalValidPayload.issue,
        fields: { ...minimalValidPayload.issue!.fields, summary: "" },
      },
    };
    expect(extractEntityFromJiraIssue(payload)).toBeNull();
  });

  it("returns a SyncedJiraEntityInput for a valid minimal payload", () => {
    const result = extractEntityFromJiraIssue(minimalValidPayload);
    expect(result).not.toBeNull();
    expect(result!.issueKey).toBe("TPRM-999");
    expect(result!.slug).toBeTruthy();
    expect(result!.kind).toMatch(/^(VENDOR|PARTNER)$/);
  });

  it("respects forcedKind override", () => {
    const result = extractEntityFromJiraIssue(minimalValidPayload, "PARTNER");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("PARTNER");
  });
});
