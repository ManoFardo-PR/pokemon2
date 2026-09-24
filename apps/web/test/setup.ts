import "@testing-library/jest-dom";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Mock window.scrollTo for jsdom (TanStack Router scroll restoration)
Object.defineProperty(window, "scrollTo", {
  value: vi.fn(),
  writable: true,
});

afterEach(() => {
  cleanup();
});

