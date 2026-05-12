import { describe, it, expect, vi, afterEach } from "vitest";

// isSameOrigin reads process.env at call time, so we can mutate between tests
import { isSameOrigin } from "@/lib/csrf";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  (process.env as Record<string, string>).NODE_ENV = "test";
});

describe("isSameOrigin", () => {
  describe("requests without Origin header", () => {
    it("allows requests with no Origin (server-to-server / curl)", () => {
      const req = new Request("https://app.vtex.com/api/send");
      expect(isSameOrigin(req)).toBe(true);
    });
  });

  describe("production environment", () => {
    it("allows same-origin requests when Origin matches NEXT_PUBLIC_APP_URL", () => {
      (process.env as Record<string, string>).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_APP_URL = "https://app.vtex.com";
      const req = new Request("https://app.vtex.com/api/send", {
        headers: { origin: "https://app.vtex.com" },
      });
      expect(isSameOrigin(req)).toBe(true);
    });

    it("rejects cross-origin requests in production", () => {
      (process.env as Record<string, string>).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_APP_URL = "https://app.vtex.com";
      const req = new Request("https://app.vtex.com/api/send", {
        headers: { origin: "https://attacker.com" },
      });
      expect(isSameOrigin(req)).toBe(false);
    });

    it("rejects requests from a subdomain (not same origin)", () => {
      (process.env as Record<string, string>).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_APP_URL = "https://app.vtex.com";
      const req = new Request("https://app.vtex.com/api/send", {
        headers: { origin: "https://evil.app.vtex.com" },
      });
      expect(isSameOrigin(req)).toBe(false);
    });

    it("strips trailing slash from NEXT_PUBLIC_APP_URL before comparing", () => {
      (process.env as Record<string, string>).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_APP_URL = "https://app.vtex.com/";
      const req = new Request("https://app.vtex.com/api/send", {
        headers: { origin: "https://app.vtex.com" },
      });
      expect(isSameOrigin(req)).toBe(true);
    });

    it("fails closed when NEXT_PUBLIC_APP_URL is not configured", () => {
      (process.env as Record<string, string>).NODE_ENV = "production";
      delete process.env.NEXT_PUBLIC_APP_URL;
      const req = new Request("https://app.vtex.com/api/send", {
        headers: { origin: "https://anywhere.com" },
      });
      expect(isSameOrigin(req)).toBe(false);
    });
  });

  describe("development environment", () => {
    it("allows localhost origins without NEXT_PUBLIC_APP_URL", () => {
      (process.env as Record<string, string>).NODE_ENV = "development";
      const req = new Request("http://localhost:3000/api/send", {
        headers: { origin: "http://localhost:3000" },
      });
      expect(isSameOrigin(req)).toBe(true);
    });

    it("allows 127.0.0.1 origins in development", () => {
      (process.env as Record<string, string>).NODE_ENV = "development";
      const req = new Request("http://127.0.0.1:3000/api/send", {
        headers: { origin: "http://127.0.0.1:3000" },
      });
      expect(isSameOrigin(req)).toBe(true);
    });

    it("still rejects non-localhost cross-origin in development", () => {
      (process.env as Record<string, string>).NODE_ENV = "development";
      process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
      const req = new Request("http://localhost:3000/api/send", {
        headers: { origin: "https://attacker.com" },
      });
      expect(isSameOrigin(req)).toBe(false);
    });
  });
});
