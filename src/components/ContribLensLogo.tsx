import React from "react";
import ContribLensMark from "./ContribLensMark";

export interface ContribLensLogoProps {
  className?: string;
  size?: number;
  showTagline?: boolean;
}

export default function ContribLensLogo({
  className = "",
  size = 32,
  showTagline = false,
}: ContribLensLogoProps) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <ContribLensMark size={size} />
      <div className="flex flex-col">
        <span className="font-extrabold tracking-tight text-xl text-sustainableLinen leading-none">
          Contrib<span className="text-electricTangerine">Lens</span>
        </span>
        {showTagline && (
          <span className="text-[10px] text-textMuted tracking-normal mt-0.5 font-normal">
            Security findings → beginner pull requests
          </span>
        )}
      </div>
    </div>
  );
}
