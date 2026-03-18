"use client";

import { useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL_MS = 4 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 2;

export function SessionHeartbeat() {
  const consecutiveFailuresRef = useRef(0);

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
          consecutiveFailuresRef.current += 1;

          if (!cancelled && consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
            window.location.href = `/?error=${encodeURIComponent(payload?.error ?? "session_invalid")}`;
          }
          return;
        }

        consecutiveFailuresRef.current = 0;
      } catch {
        // Ignore transient network failures and retry on the next heartbeat.
        consecutiveFailuresRef.current = 0;
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
