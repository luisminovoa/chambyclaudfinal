import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 rounded-2xl font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]",
  {
    variants: {
      variant: {
        primary: "bg-brand-gradient text-white shadow-glow-sm hover:shadow-glow hover:brightness-105",
        secondary:
          "border border-primary-200 bg-white text-primary-700 shadow-soft hover:border-primary-300 hover:bg-primary-50",
        ghost: "bg-transparent text-ink-muted hover:bg-slate-100 hover:text-ink",
        success: "bg-success-500 text-white shadow-soft hover:bg-success-600",
        danger: "bg-danger-50 text-danger-600 hover:bg-danger-100",
        outline: "border border-slate-200 bg-white text-slate-700 shadow-soft hover:bg-slate-50",
      },
      size: {
        sm: "min-h-[36px] px-3.5 py-1.5 text-xs",
        md: "min-h-[44px] px-4 py-2.5 text-sm",
        lg: "min-h-[52px] px-6 py-3 text-base",
        icon: "h-10 w-10 rounded-xl p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";
