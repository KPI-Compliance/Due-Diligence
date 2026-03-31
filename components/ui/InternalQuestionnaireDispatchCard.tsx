"use client";

import { useState } from "react";

type InternalQuestionnaireDispatchCardProps = {
  entitySlug: string;
  vendorName: string;
  jiraTicket: string | null;
  defaultFocalEmail: string;
};

export function InternalQuestionnaireDispatchCard({
  entitySlug,
  vendorName,
  jiraTicket,
  defaultFocalEmail,
}: InternalQuestionnaireDispatchCardProps) {
  const [focalEmail, setFocalEmail] = useState(defaultFocalEmail);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState("");

  return (
    <section className="rounded-xl border border-[var(--color-primary)]/10 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[var(--color-text)]">Disparar Triagem Interna</h3>
          <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
            Envie o Google Form interno no Slack para o ponto focal da VTEX e acompanhe as respostas na aba Internal Questionnaire.
          </p>
        </div>
        <span className="rounded-full border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 px-3 py-1 text-xs font-bold text-[var(--color-primary)]">
          {jiraTicket ?? "Sem ticket"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Vendor</span>
          <input
            type="text"
            value={vendorName}
            readOnly
            className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Ponto focal VTEX (e-mail)</span>
          <input
            type="email"
            value={focalEmail}
            onChange={(event) => setFocalEmail(event.target.value)}
            placeholder="nome@vtex.com"
            className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      {feedback ? (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 text-sm font-semibold ${
            feedback.toLowerCase().includes("sucesso")
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {feedback}
        </div>
      ) : null}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={isSending}
          onClick={() => {
            setIsSending(true);
            setFeedback("");

            fetch("/api/vendors/internal-questionnaire/send", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                entitySlug,
                focalEmail,
              }),
            })
              .then(async (response) => {
                const payload = (await response.json().catch(() => null)) as
                  | {
                      ok?: boolean;
                      message?: string;
                      slackMode?: "dm" | "channel";
                      focalEmail?: string | null;
                    }
                  | null;

                if (!response.ok || !payload?.ok) {
                  throw new Error(payload?.message ?? "Não foi possível enviar o formulário interno.");
                }

                const destination = payload.slackMode === "dm" ? "Slack DM" : "canal Slack";
                const target = payload.focalEmail ? ` para ${payload.focalEmail}` : "";
                setFeedback(`Formulário interno enviado com sucesso via ${destination}${target}.`);
              })
              .catch((error) => {
                setFeedback(error instanceof Error ? error.message : "Não foi possível enviar o formulário interno.");
              })
              .finally(() => {
                setIsSending(false);
              });
          }}
          className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
            isSending
              ? "cursor-wait border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] text-[var(--color-neutral-500)]"
              : "border border-[var(--color-secondary)]/20 bg-[var(--color-secondary)]/5 text-[var(--color-secondary)] hover:bg-[var(--color-secondary)]/10"
          }`}
        >
          {isSending ? "Enviando no Slack..." : "Enviar Formulário Interno no Slack"}
        </button>
      </div>
    </section>
  );
}
