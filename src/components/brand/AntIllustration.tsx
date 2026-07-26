import { cn } from "@/lib/utils";

export type AntPose = "wave" | "search" | "briefcase" | "lost" | "celebrate" | "mail";

interface AntIllustrationProps {
  pose?: AntPose;
  className?: string;
}

/**
 * Ilustraciones de la hormiguita para empty states, éxito y 404.
 * Cuerpo base + accesorio según la pose; hereda color vía `currentColor`
 * y el accesorio usa el amarillo de marca cuando aporta contraste.
 */
export function AntIllustration({ pose = "wave", className }: AntIllustrationProps) {
  return (
    <svg viewBox="0 0 96 80" fill="none" aria-hidden className={cn("shrink-0", className)}>
      {/* sombra */}
      <ellipse cx="40" cy="74" rx="26" ry="3.5" fill="currentColor" opacity="0.12" />

      {/* cuerpo base */}
      <g>
        <ellipse cx="24" cy="52" rx="14" ry="10.5" transform="rotate(-18 24 52)" fill="currentColor" />
        <circle cx="41" cy="44" r="7.5" fill="currentColor" />
        <circle cx="54" cy="33" r="10.5" fill="currentColor" />
        {/* antenas */}
        <path
          d={pose === "celebrate" ? "M58 24Q63 15 70 13" : "M58 24Q61 16 67 15"}
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx={pose === "celebrate" ? 71 : 68} cy={pose === "celebrate" ? 12.5 : 14.5} r="2.4" fill="currentColor" />
        <path
          d={pose === "celebrate" ? "M50 23Q48 13 53 9" : "M51 23Q51 14 56 11"}
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx={pose === "celebrate" ? 53.5 : 57} cy={pose === "celebrate" ? 8.5 : 10.5} r="2.4" fill="currentColor" />
        {/* patas traseras */}
        <path d="M39 50Q34 59 33 68" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M34 52Q28 60 26 68" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M44 51Q45 60 43 69" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </g>

      {/* brazo delantero según pose */}
      {pose === "wave" && (
        <path d="M47 39Q56 32 60 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      )}
      {(pose === "briefcase" || pose === "mail") && (
        <path d="M47 41Q55 45 60 50" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      )}
      {pose === "search" && (
        <path d="M47 40Q55 42 61 44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      )}
      {pose === "lost" && (
        <path d="M47 41Q53 46 55 52" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      )}
      {pose === "celebrate" && (
        <>
          <path d="M47 39Q55 30 58 22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="78" cy="20" r="2.5" fill="#FFC107" />
          <circle cx="86" cy="34" r="2" fill="#FFC107" />
          <circle cx="72" cy="8" r="1.8" fill="currentColor" opacity="0.5" />
          <rect x="82" y="10" width="4" height="4" rx="1" transform="rotate(24 84 12)" fill="#FFC107" />
          <rect x="88" y="24" width="3.5" height="3.5" rx="1" transform="rotate(-18 90 26)" fill="currentColor" opacity="0.4" />
        </>
      )}

      {/* accesorios */}
      {pose === "search" && (
        <>
          <circle cx="70" cy="40" r="8.5" stroke="#FFC107" strokeWidth="3" />
          <path d="M76.5 46.5L84 54" stroke="#FFC107" strokeWidth="3.5" strokeLinecap="round" />
        </>
      )}
      {pose === "briefcase" && (
        <>
          <rect x="58" y="47" width="20" height="15" rx="3.5" fill="#FFC107" />
          <path d="M64 47v-2.5a2.5 2.5 0 012.5-2.5h3a2.5 2.5 0 012.5 2.5V47" stroke="#FFC107" strokeWidth="2.5" />
          <path d="M58 54h20" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
        </>
      )}
      {pose === "mail" && (
        <>
          <rect x="58" y="44" width="22" height="16" rx="3" fill="#FFC107" />
          <path d="M59.5 46.5L69 53.5L78.5 46.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {pose === "lost" && (
        <text
          x="66"
          y="26"
          fontFamily="var(--font-inter), system-ui, sans-serif"
          fontSize="24"
          fontWeight="800"
          fill="#FFC107"
        >
          ?
        </text>
      )}
    </svg>
  );
}
