import React from "react";
import { Link } from "@tanstack/react-router";
import { strings } from "../strings.js";

export function NotFound() {
  return (
    <div style={{ textAlign: "center", padding: "48px 16px" }}>
      <h2>{strings.notFound.title}</h2>
      <p style={{ margin: "16px 0", color: "var(--muted)" }}>{strings.notFound.message}</p>
      <Link
        to="/"
        style={{
          display: "inline-block",
          padding: "8px 16px",
          background: "var(--accent)",
          color: "var(--accent-ink)",
          textDecoration: "none",
          borderRadius: "4px",
        }}
      >
        {strings.notFound.backToHome}
      </Link>
    </div>
  );
}
