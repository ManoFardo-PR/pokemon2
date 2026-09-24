import React, { useState } from "react";

export interface CardImageProps {
  urls: readonly string[];
  alt: string;
  size?: "tile" | "detail";
}

export function CardImage({ urls, alt }: CardImageProps) {
  const [index, setIndex] = useState(0);

  const isExhausted = index >= urls.length;

  const containerStyle: React.CSSProperties = {
    aspectRatio: "245 / 337",
    width: "100%",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "var(--line, #e3e3df)",
    borderRadius: 6,
    overflow: "hidden",
  };

  if (isExhausted) {
    return (
      <div style={containerStyle} aria-label={alt}>
        <svg
          viewBox="0 0 245 337"
          style={{ width: "100%", height: "100%", display: "block" }}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="245" height="337" rx="6" fill="#e8e8e6" />
          <path
            d="M82.5 168.5H162.5M122.5 128.5V208.5"
            stroke="#8a8a85"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <text
            x="50%"
            y="75%"
            dominantBaseline="middle"
            textAnchor="middle"
            fill="#5a5a56"
            fontSize="14"
            fontFamily="system-ui, sans-serif"
          >
            {alt}
          </text>
        </svg>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <img
        src={urls[index]}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setIndex((prev) => prev + 1)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    </div>
  );
}
