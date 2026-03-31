"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type VendorExternalQuestionnaireCardProps = {
  entitySlug: string;
  assessmentId: string | null | undefined;
  recipientEmail: string | null | undefined;
  currentFormId: string | null;
  forms: Array<{
    id: string;
    name: string;
    formId: string;
    hiddenAssessmentField: string;
  }>;
};

export function VendorExternalQuestionnaireCard({
  entitySlug,
  assessmentId,
  recipientEmail,
  currentFormId,
  forms,
}: VendorExternalQuestionnaireCardProps) {
  const router = useRouter();
  const [selectedFormId, setSelectedFormId] = useState(currentFormId ?? forms[0]?.formId ?? "");
  const [recipientEmails, setRecipientEmails] = useState(recipientEmail ?? "");
  const [sendFeedback, setSendFeedback] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [resolvedAssessmentId, setResolvedAssessmentId] = useState(assessmentId ?? "");

  const selectedForm = useMemo(
    () => forms.find((item) => item.formId === selectedFormId) ?? null,
    [forms, selectedFormId],
  );

  const typeformUrl = useMemo(() => {
    if (!selectedForm) return "";
    const baseUrl = `https://form.typeform.com/to/${selectedForm.formId}`;
    if (!resolvedAssessmentId || !selectedForm.hiddenAssessmentField) {
      return baseUrl;
    }

    const params = new URLSearchParams({
      [selectedForm.hiddenAssessmentField]: resolvedAssessmentId,
    });
    return `${baseUrl}?${params.toString()}`;
  }, [resolvedAssessmentId, selectedForm]);

  const mailtoHref = useMemo(() => {
    const normalizedRecipients = recipientEmails
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .join(",");

    if (!normalizedRecipients || !typeformUrl) return "";

    return normalizedRecipients;
  }, [recipientEmails, typeformUrl]);

  return (
    <article className="rounded-xl border border-[var(--color-primary)]/10 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-[var(--color-text)]">Questionário Externo</h3>
          <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
            Selecione um formulário da fila de vendors e prepare o envio ao ponto focal externo.
          </p>
        </div>
        {currentFormId ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            Formulário selecionado
          </span>
        ) : null}
      </div>

      {forms.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] p-4">
          <p className="text-sm font-semibold text-[var(--color-text)]">Nenhum formulário de vendor disponível.</p>
          <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
            Cadastre e habilite um formulário em Settings {"->"} Typeform Forms para liberar o envio.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
                Formulário Typeform
              </label>
              <select
                value={selectedFormId}
                onChange={(event) => setSelectedFormId(event.target.value)}
                className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--color-primary)]/40 focus:ring-2 focus:ring-[var(--color-primary)]/10"
              >
                {forms.map((item) => (
                  <option key={item.formId} value={item.formId}>
                    {item.name} ({item.formId})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-4">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Ponto focal externo</span>
                <input
                  type="text"
                  value={recipientEmails}
                  onChange={(event) => setRecipientEmails(event.target.value)}
                  placeholder="email@empresa.com, outro@empresa.com"
                  className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-3 text-sm font-semibold text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]/40 focus:ring-2 focus:ring-[var(--color-primary)]/10"
                />
                <p className="text-xs text-[var(--color-neutral-600)]">
                  Você pode informar um ou mais e-mails separados por vírgula ou ponto e vírgula.
                </p>
              </label>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Link preparado</p>
              <p className="mt-1 break-all text-sm text-[var(--color-neutral-700)]">{typeformUrl || "-"}</p>
            </div>
            {sendFeedback ? (
              <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
                sendFeedback.toLowerCase().includes("sucesso")
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}>
                {sendFeedback}
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={typeformUrl || "#"}
              target="_blank"
              rel="noreferrer"
              className={`rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${
                typeformUrl
                  ? "border-[var(--color-neutral-200)] bg-white text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-100)]"
                  : "pointer-events-none border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] text-[var(--color-neutral-500)]"
              }`}
            >
              Abrir formulário
            </a>

            <button
              type="button"
              onClick={() => {
                if (!selectedForm || !mailtoHref || isSending) {
                  if (!selectedForm) {
                    setSendFeedback("Selecione um formulário antes de enviar.");
                  } else if (!mailtoHref) {
                    setSendFeedback("Informe pelo menos um e-mail válido do ponto focal externo.");
                  }
                  return;
                }

                const recipients = recipientEmails
                  .split(/[;,]/)
                  .map((item) => item.trim())
                  .filter(Boolean);

                if (recipients.length === 0) return;

                setIsSending(true);
                setSendFeedback("");

                fetch("/api/vendors/external-questionnaire/send", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    entitySlug,
                    assessmentId: resolvedAssessmentId,
                    selectedFormId: selectedForm.formId,
                    recipients,
                    hiddenAssessmentField: selectedForm.hiddenAssessmentField,
                    questionnaireBaseUrl: `https://form.typeform.com/to/${selectedForm.formId}`,
                  }),
                })
                  .then(async (response) => {
                    const payload = (await response.json().catch(() => null)) as
                      | {
                          ok?: boolean;
                          message?: string;
                          assessmentId?: string;
                          internalQuestionnaire?: {
                            ok?: boolean;
                            mode?: "dm" | "channel";
                            focalEmail?: string | null;
                            message?: string;
                          } | null;
                        }
                      | null;

                    if (!response.ok || !payload?.ok) {
                      throw new Error(payload?.message ?? "Não foi possível enviar o questionário.");
                    }

                    if (payload.assessmentId) {
                      setResolvedAssessmentId(payload.assessmentId);
                    }
                    const internalResult = payload.internalQuestionnaire;
                    if (internalResult?.ok) {
                      const destination = internalResult.mode === "dm" ? "Slack DM" : "canal Slack";
                      const target = internalResult.focalEmail ? ` para ${internalResult.focalEmail}` : "";
                      setSendFeedback(`Questionário externo enviado. Mini questionário interno também enviado via ${destination}${target}.`);
                    } else if (internalResult && internalResult.ok === false) {
                      setSendFeedback(
                        `Questionário externo enviado, mas houve falha no envio interno via Slack: ${internalResult.message ?? "erro não identificado."}`,
                      );
                    } else {
                      setSendFeedback("Questionário enviado com sucesso e registrado na timeline.");
                    }
                    router.refresh();
                  })
                  .catch((error) => {
                    setSendFeedback(error instanceof Error ? error.message : "Não foi possível enviar o questionário.");
                  })
                  .finally(() => {
                    setIsSending(false);
                  });
              }}
              disabled={!mailtoHref || isSending}
              className={`rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${
                mailtoHref && !isSending
                  ? "border-[var(--color-secondary)]/20 bg-[var(--color-secondary)]/5 text-[var(--color-secondary)] hover:bg-[var(--color-secondary)]/10"
                  : "cursor-not-allowed border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] text-[var(--color-neutral-500)]"
              }`}
            >
              {isSending ? "Enviando questionário..." : "Enviar ao ponto focal externo"}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
