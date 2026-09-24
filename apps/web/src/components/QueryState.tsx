import React from "react";
import { ApiError } from "../api/client.js";
import { strings, errorMessage } from "../strings.js";

export interface QueryStateProps {
  isLoading: boolean;
  error: Error | null;
  isEmpty: boolean;
  emptyMessage?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}

export function QueryState({
  isLoading,
  error,
  isEmpty,
  emptyMessage,
  onRetry,
  children,
}: QueryStateProps) {
  if (isLoading) {
    return (
      <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)" }}>
        <p>{strings.loading}</p>
      </div>
    );
  }

  if (error) {
    const code = error instanceof ApiError ? error.code : undefined;
    const localizedMessage = errorMessage(code);

    return (
      <div
        role="alert"
        style={{
          padding: "24px",
          border: "1px solid var(--line)",
          borderRadius: "8px",
          backgroundColor: "var(--warn-bg, #fff4d6)",
          color: "var(--warn-ink, #7a5300)",
          margin: "16px 0",
        }}
      >
        <p style={{ fontWeight: 600, marginBottom: "8px" }}>{localizedMessage}</p>
        {code && (
          <p style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: "12px" }}>
            Código: {code}
          </p>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              padding: "6px 12px",
              backgroundColor: "var(--accent, #2f5fd6)",
              color: "var(--accent-ink, #fff)",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            {strings.retry}
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)" }}>
        <p>{emptyMessage ?? "Nenhum resultado encontrado."}</p>
      </div>
    );
  }

  return <>{children}</>;
}
