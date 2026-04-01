"use client";

import { useMemo, useRef } from "react";

type WorkflowStatusOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function WorkflowStatusAutoSaveSelect({
  formId,
  name,
  defaultValue,
  options,
  className,
  disabled = false,
}: {
  formId: string;
  name: string;
  defaultValue: string;
  options: WorkflowStatusOption[];
  className?: string;
  disabled?: boolean;
}) {
  const submitterRef = useRef<HTMLButtonElement>(null);
  const safeDefaultValue = useMemo(
    () => (options.some((option) => option.value === defaultValue) ? defaultValue : options[0]?.value ?? ""),
    [defaultValue, options],
  );

  return (
    <>
      <select
        name={name}
        form={formId}
        defaultValue={safeDefaultValue}
        disabled={disabled}
        onChange={(event) => {
          if (disabled) return;
          const form = event.currentTarget.form;
          if (!form) return;
          form.requestSubmit(submitterRef.current ?? undefined);
        }}
        className={className}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        ref={submitterRef}
        type="submit"
        form={formId}
        name="submit_intent"
        value="save_draft"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
    </>
  );
}
