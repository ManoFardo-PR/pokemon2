import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { QueryState } from "../src/components/QueryState.js";
import { ApiError } from "../src/api/client.js";

describe("QueryState component (BR-S01.T08-08)", () => {
  it("renders loading state when isLoading is true", () => {
    render(
      <QueryState
        isLoading={true}
        error={null}
        isEmpty={false}
      >
        <div>Content</div>
      </QueryState>
    );

    expect(screen.getByText(/Carregando/i)).toBeInTheDocument();
    expect(screen.queryByText("Content")).not.toBeInTheDocument();
  });

  it("renders error state with mapped pt-BR message and retry button when error is present", () => {
    const onRetry = vi.fn();
    const error = new ApiError("Not found", {
      status: 404,
      code: "not_found",
    });

    render(
      <QueryState
        isLoading={false}
        error={error}
        isEmpty={false}
        onRetry={onRetry}
      >
        <div>Content</div>
      </QueryState>
    );

    expect(screen.getByText(/Não encontrado/i)).toBeInTheDocument();
    expect(screen.getByText(/not_found/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole("button", { name: /Tentar novamente/i });
    expect(retryBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Content")).not.toBeInTheDocument();
  });

  it("renders empty state when isEmpty is true", () => {
    render(
      <QueryState
        isLoading={false}
        error={null}
        isEmpty={true}
        emptyMessage="Nenhum card encontrado com esses filtros."
      >
        <div>Content</div>
      </QueryState>
    );

    expect(screen.getByText("Nenhum card encontrado com esses filtros.")).toBeInTheDocument();
    expect(screen.queryByText("Content")).not.toBeInTheDocument();
  });

  it("renders children when query succeeds and not empty", () => {
    render(
      <QueryState
        isLoading={false}
        error={null}
        isEmpty={false}
      >
        <div data-testid="real-content">Card Grid Loaded</div>
      </QueryState>
    );

    expect(screen.getByTestId("real-content")).toHaveTextContent("Card Grid Loaded");
    expect(screen.queryByText(/Carregando/i)).not.toBeInTheDocument();
  });
});
