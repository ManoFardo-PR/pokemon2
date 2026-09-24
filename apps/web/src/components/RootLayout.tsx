import React from "react";
import { Link, Outlet } from "@tanstack/react-router";
import { HealthBadge } from "./HealthBadge.js";
import { strings } from "../strings.js";

export function RootLayout() {
  return (
    <>
      <header>
        <Link to="/" className="brand">
          {strings.brand}
        </Link>
        <nav>
          <Link to="/">{strings.nav.search}</Link>
          <Link to="/decks">{strings.nav.decks}</Link>
          <Link to="/meta">{strings.nav.meta}</Link>
          <Link to="/sim">{strings.nav.sim}</Link>
          <Link to="/rules">{strings.nav.rules}</Link>
          <Link to="/sets">{strings.nav.sets}</Link>
        </nav>
        <HealthBadge />
      </header>
      <main>
        <Outlet />
      </main>
      <footer>
        <p>{strings.footer.dataSources}</p>
        <p>{strings.footer.disclaimer}</p>
      </footer>
    </>
  );
}
