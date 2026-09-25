import React from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { useHealth } from "../api/hooks.js";
import { strings } from "../strings.js";
import { ApiError } from "../api/client.js";

export function HealthBadge() {
  // Read the context directly: useQueryClient() throws without a provider, and a hook inside try/catch
  // breaks the rules of hooks.
  const queryClient = React.useContext(QueryClientContext);

  if (!queryClient) {
    return (
      <span
        style={{
          fontSize: "0.8rem",
          padding: "4px 8px",
          borderRadius: "12px",
          border: "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--muted)",
        }}
      >
        {strings.health.loading}
      </span>
    );
  }

  return <HealthBadgeWithQuery />;
}

function HealthBadgeWithQuery() {
  const { data, error, isLoading, isFetching, refetch } = useHealth();

  if (isLoading || isFetching) {
    return (
      <button
        type="button"
        disabled
        style={{
          fontSize: "0.8rem",
          padding: "4px 8px",
          borderRadius: "12px",
          border: "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--muted)",
          cursor: "wait",
        }}
      >
        {strings.health.loading}
      </button>
    );
  }

  if (error || !data) {
    const code = error instanceof ApiError ? error.code : "unavailable";
    return (
      <button
        type="button"
        onClick={() => {
          void refetch();
        }}
        title={`Status API: ${code}`}
        style={{
          fontSize: "0.8rem",
          padding: "4px 8px",
          borderRadius: "12px",
          border: "1px solid var(--warn-ink, #7a5300)",
          background: "var(--warn-bg, #fff4d6)",
          color: "var(--warn-ink, #7a5300)",
          cursor: "pointer",
        }}
      >
        {strings.health.unavailable}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        void refetch();
      }}
      title={`SQLite v${data.sqliteVersion ?? "?"} (${data.databasePath ?? "memory"})`}
      style={{
        fontSize: "0.8rem",
        padding: "4px 8px",
        borderRadius: "12px",
        border: "1px solid var(--accent, #2f5fd6)",
        background: "var(--bg)",
        color: "var(--accent, #2f5fd6)",
        cursor: "pointer",
      }}
    >
      {strings.health.connected}
    </button>
  );
}
