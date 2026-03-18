"use client";

import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 4 * 60 * 1000;

export function SessionHeartbeat() {
  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        const response = await fetch("/api/auth/session", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          if (!cancelled) {
            window.location.href = `/?error=${encodeURIComponent(payload?.error ?? "session_invalid")}`;
          }
        }
      } catch {
        // Ignore transient network failures and retry on the next heartbeat.
      }
    }

    const intervalId = window.setInterval(ping, HEARTBEAT_INTERVAL_MS);
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        void ping();
      }
    };

    document.addEventListener("visibilitychange", visibilityHandler);
    void ping();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, []);

  return null;
}
