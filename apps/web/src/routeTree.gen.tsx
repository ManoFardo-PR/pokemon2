import React from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { z } from "zod";
import { RootLayout } from "./components/RootLayout.js";
import { NotFound } from "./components/NotFound.js";

// Root Route
export const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

export interface SearchParams {
  q?: string | undefined;
  page?: number | undefined;
}

// Index / Buscar Placeholder (S02.T12)
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    q: typeof search.q === "string" ? search.q : undefined,
    page: search.page !== undefined ? Number(search.page) : undefined,
  }),
  component: function IndexComponent() {
    const search = indexRoute.useSearch();
    return (
      <div>
        <h2>Buscar Placeholder</h2>
        <p>Owner: S02.T12</p>
        <p>Query: {search.q ?? ""}</p>
        <p>Page: {search.page ?? 1}</p>
      </div>
    );
  },
});

// Card Detail Placeholder (S02.T13)
export const cardDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cards/$cardId",
  component: function CardDetailComponent() {
    const { cardId } = cardDetailRoute.useParams();
    return (
      <div>
        <h2>Card Detail Placeholder</h2>
        <p>Owner: S02.T13</p>
        <p>Card ID: {cardId}</p>
      </div>
    );
  },
});

// Sets Placeholder (S02.T14)
export const setsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sets",
  component: function SetsComponent() {
    return (
      <div>
        <h2>Sets Placeholder</h2>
        <p>Owner: S02.T14</p>
      </div>
    );
  },
});

// Decks Placeholder (S03)
export const decksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/decks",
  component: function DecksComponent() {
    return (
      <div>
        <h2>Decks Placeholder</h2>
        <p>Owner: S03</p>
      </div>
    );
  },
});

// Meta Placeholder (S03.T08)
export const metaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/meta",
  component: function MetaComponent() {
    return (
      <div>
        <h2>Meta Placeholder</h2>
        <p>Owner: S03.T08</p>
      </div>
    );
  },
});

// Sim Placeholder (S04)
export const simRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sim",
  component: function SimComponent() {
    return (
      <div>
        <h2>Simulador Placeholder</h2>
        <p>Owner: S04</p>
      </div>
    );
  },
});

// Rules Placeholder (S05.T13)
export const rulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rules",
  component: function RulesComponent() {
    return (
      <div>
        <h2>Regras Placeholder</h2>
        <p>Owner: S05.T13</p>
      </div>
    );
  },
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  cardDetailRoute,
  setsRoute,
  decksRoute,
  metaRoute,
  simRoute,
  rulesRoute,
]);
