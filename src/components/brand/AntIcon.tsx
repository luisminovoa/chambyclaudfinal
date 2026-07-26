import { cn } from "@/lib/utils";

/**
 * Hormiguita de Chamby — marca vectorial en silueta.
 * Hereda el color vía `currentColor`: úsala en blanco sobre morado
 * y en morado sobre fondos claros.
 */
export function AntIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden className={cn("shrink-0", className)}>
      {/* abdomen */}
      <ellipse cx="17" cy="41" rx="13" ry="9.5" transform="rotate(-18 17 41)" fill="currentColor" />
      {/* tórax */}
      <circle cx="33" cy="33" r="7" fill="currentColor" />
      {/* cabeza */}
      <circle cx="45" cy="23" r="9.5" fill="currentColor" />
      {/* antenas */}
      <path d="M49 15Q52 8 58 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="59" cy="6.5" r="2.3" fill="currentColor" />
      <path d="M42 14Q42 6 47 3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="48" cy="2.8" r="2.3" fill="currentColor" />
      {/* patas */}
      <path d="M39 29Q45 33 48 38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M36 38Q41 46 39 55" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M31 40Q31 49 28 56" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M26 38Q21 46 20 54" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
