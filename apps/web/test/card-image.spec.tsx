import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { CardImage } from "../src/components/CardImage.js";

describe("CardImage component (BR-S01.T08-04)", () => {
  it("renders an img with the first url in chain and reserved 245/337 ratio", () => {
    const { container } = render(
      <CardImage
        urls={["https://images.pokemontcg.io/base1/4.png", "https://assets.tcgdex.net/base1/4.webp"]}
        alt="Charizard"
      />
    );

    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toBe("https://images.pokemontcg.io/base1/4.png");
    expect(img.alt).toBe("Charizard");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveStyle({ aspectRatio: "245 / 337" });
  });

  it("advances through chain on error and eventually renders inline SVG placeholder", () => {
    const urls = [
      "https://cdn.example.com/fail1.png",
      "https://cdn.example.com/fail2.webp",
    ];

    const { container } = render(<CardImage urls={urls} alt="Pikachu" />);

    let img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toBe("https://cdn.example.com/fail1.png");

    // First error -> advances to second URL
    fireEvent.error(img);
    img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toBe("https://cdn.example.com/fail2.webp");

    // Second error -> chain exhausted, renders inline SVG placeholder with card name
    fireEvent.error(img);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(container.textContent).toContain("Pikachu");

    // Keeps the same container box aspect ratio to prevent layout shift
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveStyle({ aspectRatio: "245 / 337" });
  });

  it("renders placeholder immediately when urls array is empty", () => {
    const { container } = render(<CardImage urls={[]} alt="Mewtwo" />);

    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(container.textContent).toContain("Mewtwo");
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveStyle({ aspectRatio: "245 / 337" });
  });
});
