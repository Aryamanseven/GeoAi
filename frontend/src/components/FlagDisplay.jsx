import { useState } from "react";

const SIZE_MAP = {
  sm: 32,
  md: 64,
  lg: 96,
};

export default function FlagDisplay({ iso2, emoji, size = "md" }) {
  const [imgError, setImgError] = useState(false);
  const heightPx = SIZE_MAP[size] || SIZE_MAP.md;

  if (!iso2 || imgError) {
    return (
      <span
        style={{
          fontSize: heightPx * 0.75,
          lineHeight: 1,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          height: heightPx,
          minWidth: heightPx,
        }}
        role="img"
        aria-label="flag"
      >
        {emoji || "🏳️"}
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/w160/${iso2.toLowerCase()}.png`}
      alt={`${iso2.toUpperCase()} flag`}
      onError={() => setImgError(true)}
      style={{
        height: heightPx,
        width: "auto",
        objectFit: "contain",
        borderRadius: 6,
      }}
      draggable={false}
    />
  );
}
