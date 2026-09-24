import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { createRouter, createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "../src/routeTree.gen.js";

describe("TanStack Router & Route Placeholders (BR-S01.T08-07)", () => {
  it("restores search parameters from URL on search placeholder route", async () => {
    const memoryHistory = createMemoryHistory({
      initialEntries: ["/?q=charizard&page=2"],
    });

    const router = createRouter({
      routeTree,
      history: memoryHistory,
    });

    render(<RouterProvider router={router} />);

    // Check placeholder rendered and ownership tag is shown
    expect(await screen.findByText(/S02\.T12/i)).toBeInTheDocument();
    // Check parameters restored into view
    expect(screen.getByText(/charizard/i)).toBeInTheDocument();
  });

  it("renders card detail placeholder with cardId param", async () => {
    const memoryHistory = createMemoryHistory({
      initialEntries: ["/cards/base1-4"],
    });

    const router = createRouter({
      routeTree,
      history: memoryHistory,
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByText(/S02\.T13/i)).toBeInTheDocument();
    expect(screen.getByText(/base1-4/i)).toBeInTheDocument();
  });

  it("renders other section placeholders identifying owner subtasks", async () => {
    const routesToTest = [
      { path: "/sets", expected: /S02\.T14/i },
      { path: "/decks", expected: /S03/i },
      { path: "/meta", expected: /S03\.T08/i },
      { path: "/sim", expected: /S04/i },
      { path: "/rules", expected: /S05\.T13/i },
    ];

    for (const { path, expected } of routesToTest) {
      const memoryHistory = createMemoryHistory({ initialEntries: [path] });
      const router = createRouter({ routeTree, history: memoryHistory });
      const { unmount } = render(<RouterProvider router={router} />);
      expect(await screen.findByText(expected)).toBeInTheDocument();
      unmount();
    }
  });

  it("renders NotFoundRoute on unknown URL with link back to Buscar", async () => {
    const memoryHistory = createMemoryHistory({
      initialEntries: ["/rota-inexistente-xyz"],
    });

    const router = createRouter({
      routeTree,
      history: memoryHistory,
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByText(/Não encontrado/i)).toBeInTheDocument();
    const homeLinks = screen.getAllByRole("link", { name: /Buscar/i });
    expect(homeLinks.length).toBeGreaterThan(0);
  });
});
