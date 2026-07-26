import Link from "next/link";
import { cn } from "@/lib/utils";
import { AntIcon } from "@/components/brand/AntIcon";

interface LogoProps {
  /** "color": morado sobre fondos claros · "white": blanco sobre morado/oscuro */
  tone?: "color" | "white";
  /** Muestra el eslogan "CONECTA, CHAMBEA Y COBRA" sobre el nombre */
  withSlogan?: boolean;
  className?: string;
}

/**
 * Logo horizontal oficial: hormiguita + "Chamby" (+ eslogan opcional).
 * Nunca deformar: la hormiguita y el texto escalan juntos.
 */
export function LogoHorizontal({ tone = "color", withSlogan = false, className }: LogoProps) {
  const isWhite = tone === "white";
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <AntIcon className={cn("h-8 w-8", isWhite ? "text-white" : "text-primary-600")} />
      <span className="flex flex-col leading-none">
        {withSlogan && (
          <span
            className={cn(
              "text-[7px] font-bold uppercase tracking-[0.18em]",
              isWhite ? "text-white/80" : "text-primary-500"
            )}
          >
            Conecta, chambea y cobra
          </span>
        )}
        <span
          className={cn(
            "text-xl font-extrabold tracking-tight",
            isWhite ? "text-white" : "text-ink"
          )}
        >
          Chamby
        </span>
      </span>
    </span>
  );
}

/** Marca compacta: hormiguita blanca sobre tile con gradiente de marca. */
export function LogoCompacto({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-gradient shadow-glow-sm",
        className
      )}
    >
      <AntIcon className="h-6 w-6 text-white" />
    </span>
  );
}

/** Logo enlazado al inicio, para navbar y footer. */
export function LogoLink({
  tone = "color",
  withSlogan = true,
  className,
}: LogoProps) {
  return (
    <Link href="/" aria-label="Chamby, inicio" className={cn("group inline-flex", className)}>
      <span className="transition-transform duration-200 group-hover:scale-[1.03]">
        <LogoHorizontal tone={tone} withSlogan={withSlogan} />
      </span>
    </Link>
  );
}
