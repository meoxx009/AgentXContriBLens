import React from "react";

export interface ContribLensMarkProps {
  className?: string;
  size?: number;
}

export default function ContribLensMark({
  className = "",
  size = 32,
}: ContribLensMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="ContribLens Mark"
    >
      <defs>
        <linearGradient id="cl-c-grad" x1="16" y1="16" x2="80" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E5E4E2" />
          <stop offset="50%" stopColor="#CDE3E8" />
          <stop offset="100%" stopColor="#FF6D1F" />
        </linearGradient>
        <linearGradient id="cl-lens-grad" x1="32" y1="32" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF6D1F" />
          <stop offset="100%" stopColor="#FFF8CA" />
        </linearGradient>
      </defs>

      {/* Outer C-shaped Hexagonal Hull */}
      <path
        d="M 78 18 L 38 18 L 16 40 L 16 60 L 38 82 L 66 82 L 66 68 L 44 68 L 30 54 L 30 46 L 44 32 L 78 32 Z"
        fill="url(#cl-c-grad)"
      />

      {/* Inner Lens */}
      <circle
        cx="48"
        cy="48"
        r="14"
        stroke="url(#cl-lens-grad)"
        strokeWidth="5.5"
        fill="#161418"
      />

      {/* Lens Highlight */}
      <circle cx="43.5" cy="43.5" r="3" fill="#FFF8CA" opacity="0.9" />

      {/* Lens Handle */}
      <line
        x1="58"
        y1="58"
        x2="78"
        y2="78"
        stroke="#FF6D1F"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
