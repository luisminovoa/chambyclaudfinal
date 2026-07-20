"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface RatingStarsProps {
  value: number;
  onChange?: (value: number) => void;
  size?: "sm" | "md" | "lg";
  readOnly?: boolean;
}

const sizeClasses = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-7 h-7" };

export function RatingStars({ value, onChange, size = "md", readOnly = false }: RatingStarsProps) {
  const [hover, setHover] = useState<number | null>(null);
  const displayValue = hover ?? value;

  return (
    <div className="flex items-center gap-1" role={readOnly ? undefined : "radiogroup"}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          aria-label={`${star} estrellas`}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => !readOnly && setHover(star)}
          onMouseLeave={() => !readOnly && setHover(null)}
          className={cn(!readOnly && "cursor-pointer", readOnly && "cursor-default")}
        >
          <svg
            viewBox="0 0 20 20"
            fill={star <= displayValue ? "#f97316" : "#e2e8f0"}
            className={sizeClasses[size]}
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.447a1 1 0 00-.363 1.118l1.287 3.957c.3.922-.755 1.688-1.539 1.118l-3.366-2.446a1 1 0 00-1.176 0l-3.366 2.446c-.784.57-1.838-.196-1.539-1.118l1.287-3.957a1 1 0 00-.363-1.118L2.064 9.385c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.284-3.958z" />
          </svg>
        </button>
      ))}
    </div>
  );
}
