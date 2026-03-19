"use client";

import { useFormStatus } from "react-dom";

type SubmitActionButtonProps = {
  intent: "save_section" | "save_final_observation" | "finalize_review";
  idleLabel: string;
  pendingLabel: string;
  className: string;
};

function isActiveIntent(formData: FormData | null, intent: SubmitActionButtonProps["intent"]) {
  return String(formData?.get("submit_intent") ?? "") === intent;
}

export function ExternalQuestionnairePendingNotice() {
  const { pending, data } = useFormStatus();

  if (!pending) {
    return null;
  }

  const intent = String(data?.get("submit_intent") ?? "");
  const message =
    intent === "finalize_review"
      ? "Finalizando revisão e sincronizando os dados da aba. Isso pode levar alguns segundos."
      : intent === "save_final_observation"
        ? "Salvando a observação final da aba."
        : "Salvando as avaliações da aba.";

  return (
    <div
      aria-live="polite"
      className="rounded-xl border border-[var(--color-primary)]/15 bg-[var(--color-primary)]/5 px-4 py-3 text-sm font-semibold text-[var(--color-text)]"
      role="status"
    >
      {message}
    </div>
  );
}

export function SubmitActionButton({ intent, idleLabel, pendingLabel, className }: SubmitActionButtonProps) {
  const { pending, data } = useFormStatus();
  const isCurrentAction = pending && isActiveIntent(data, intent);

  return (
    <button
      type="submit"
      name="submit_intent"
      value={intent}
      disabled={pending}
      aria-disabled={pending}
      className={`${className} ${pending ? "cursor-wait opacity-70" : ""}`}
    >
      {isCurrentAction ? pendingLabel : idleLabel}
    </button>
  );
}
