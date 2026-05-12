import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn().mockResolvedValue([]) }));

import { writeAuditLog, getClientIp, getClientUserAgent } from "@/lib/audit";
import { sql } from "@/lib/db";

describe("getClientIp", () => {
  it("extracts the first IP from x-forwarded-for", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = new Request("https://example.com", {
      headers: { "x-real-ip": "9.10.11.12" },
    });
    expect(getClientIp(req)).toBe("9.10.11.12");
  });

  it("returns null when no IP headers are present", () => {
    const req = new Request("https://example.com");
    expect(getClientIp(req)).toBeNull();
  });

  it("trims whitespace from x-forwarded-for entries", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("prefers x-forwarded-for over x-real-ip when both are present", () => {
    const req = new Request("https://example.com", {
      headers: {
        "x-forwarded-for": "1.2.3.4",
        "x-real-ip": "9.10.11.12",
      },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });
});

describe("getClientUserAgent", () => {
  it("returns the user-agent header value", () => {
    const req = new Request("https://example.com", {
      headers: { "user-agent": "Mozilla/5.0 TestBrowser/1.0" },
    });
    expect(getClientUserAgent(req)).toBe("Mozilla/5.0 TestBrowser/1.0");
  });

  it("returns null when user-agent header is absent", () => {
    const req = new Request("https://example.com");
    expect(getClientUserAgent(req)).toBeNull();
  });
});

describe("writeAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sql).mockResolvedValue([] as never);
  });

  it("inserts a LOGIN_SUCCESS row without throwing", async () => {
    await expect(
      writeAuditLog({
        event_type: "LOGIN_SUCCESS",
        actor_email: "user@vtex.com",
        actor_ip: "1.2.3.4",
        actor_ua: "TestBrowser",
        result: "success",
      }),
    ).resolves.toBeUndefined();
    expect(sql).toHaveBeenCalledOnce();
  });

  it("inserts a LOGIN_FAILURE row with failure_reason", async () => {
    await expect(
      writeAuditLog({
        event_type: "LOGIN_FAILURE",
        actor_ip: "1.2.3.4",
        result: "failure",
        failure_reason: "google_unauthorized_account",
      }),
    ).resolves.toBeUndefined();
    expect(sql).toHaveBeenCalledOnce();
  });

  it("inserts a LOGOUT row", async () => {
    await expect(
      writeAuditLog({
        event_type: "LOGOUT",
        actor_email: "user@vtex.com",
        result: "success",
      }),
    ).resolves.toBeUndefined();
    expect(sql).toHaveBeenCalledOnce();
  });

  it("does not throw when the DB insert fails — audit must never break auth flow", async () => {
    vi.mocked(sql).mockRejectedValueOnce(new Error("DB connection lost") as never);
    await expect(
      writeAuditLog({
        event_type: "LOGIN_SUCCESS",
        actor_email: "user@vtex.com",
        result: "success",
      }),
    ).resolves.toBeUndefined();
  });

  it("handles null/undefined optional fields gracefully", async () => {
    await expect(
      writeAuditLog({
        event_type: "LOGIN_FAILURE",
        actor_email: null,
        actor_ip: null,
        actor_ua: null,
        result: "failure",
        failure_reason: null,
        metadata: null,
      }),
    ).resolves.toBeUndefined();
  });
});
