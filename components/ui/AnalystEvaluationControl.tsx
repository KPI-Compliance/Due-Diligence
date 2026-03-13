"use client";

import { useState } from "react";
import type { AnalystEvaluationStatus, ReviewStatus } from "@/lib/entity-detail-data";

const evaluationOptions: Array<{
  value: AnalystEvaluationStatus;
  label: string;
  tone: string;
}> = [
  {
    value: "DOES_NOT_MEET",
    label: "Nao Atende",
    tone: "border-red-200 text-red-600 bg-red-50/80",
  },
  {
    value: "PARTIALLY",
    label: "Parcialmente",
    tone: "border-amber-200 text-amber-600 bg-amber-50/80",
  },
  {
    value: "FULLY",
    label: "Totalmente",
    tone: "border-emerald-200 text-emerald-600 bg-emerald-50/80",
  },
  {
    value: "NA",
    label: "N/A",
    tone: "border-slate-200 text-slate-600 bg-slate-50/80",
  },
];

export function AnalystEvaluationControl({
  responseId,
  analystEvaluation,
  reviewStatus,
  editable,
}: {
  responseId?: string;
  analystEvaluation?: AnalystEvaluationStatus;
  reviewStatus: ReviewStatus;
  editable: boolean;
}) {
  const [selectedEvaluation, setSelectedEvaluation] = useState<AnalystEvaluationStatus>(
    analystEvaluation ?? "NOT_EVALUATED",
  );
  const selectedEvaluationLabel =
    evaluationOptions.find((option) => option.value === selectedEvaluation)?.label ?? "Nao avaliado";

  return (
    <>
      {responseId ? <input type="hidden" name="response_id" value={responseId} /> : null}
      {responseId ? (
        <input type="hidden" name={`evaluation_${responseId}`} value={selectedEvaluation} />
      ) : null}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {evaluationOptions.map((option) => {
          const isSelected = selectedEvaluation === option.value;
          const fallbackSelected =
            !editable &&
            ((option.value === "PARTIALLY" && reviewStatus === "needs_review") ||
              (option.value === "FULLY" && reviewStatus === "compliant"));

          return (
            <button
              key={`${responseId ?? "question"}-${option.value}`}
              type="button"
              onClick={() => {
                if (!editable) return;
                setSelectedEvaluation(option.value);
              }}
              className={`flex items-center justify-center rounded-lg border-2 px-3 py-3 text-center text-xs font-bold transition ${
                option.tone
              } ${editable ? "hover:brightness-95" : "pointer-events-none opacity-65"} ${
                isSelected || fallbackSelected ? "shadow-sm ring-2 ring-current/15" : ""
              }`}
              aria-pressed={isSelected}
              disabled={!editable}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm font-semibold text-[var(--color-neutral-700)]">
        Status selecionado: <span className="text-[var(--color-text)]">{selectedEvaluationLabel}</span>
      </p>
    </>
  );
}
