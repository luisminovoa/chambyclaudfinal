import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#f3f1ff",
          100: "#e9e5ff",
          200: "#d7cfff",
          300: "#b9a9ff",
          400: "#9678ff",
          500: "#7C5CFF",
          600: "#5B3DF5",
          700: "#4c2be0",
          800: "#3f24bc",
          900: "#35209a",
          950: "#1e1168",
        },
        success: {
          50: "#f0fdf4",
          100: "#dcfce7",
          500: "#22C55E",
          600: "#16a34a",
          700: "#15803d",
        },
        warning: {
          50: "#fffbeb",
          100: "#fef3c7",
          500: "#F59E0B",
          600: "#d97706",
          700: "#b45309",
        },
        danger: {
          50: "#fef2f2",
          100: "#fee2e2",
          500: "#EF4444",
          600: "#dc2626",
          700: "#b91c1c",
        },
        surface: "#F8FAFC",
        ink: {
          DEFAULT: "#111827",
          muted: "#6B7280",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(16, 24, 40, 0.04), 0 4px 16px rgba(16, 24, 40, 0.05)",
        card: "0 1px 3px rgba(16, 24, 40, 0.05), 0 10px 30px -12px rgba(16, 24, 40, 0.12)",
        lifted: "0 4px 8px rgba(16, 24, 40, 0.04), 0 18px 40px -14px rgba(91, 61, 245, 0.22)",
        glow: "0 8px 24px -6px rgba(91, 61, 245, 0.45)",
        "glow-sm": "0 4px 14px -4px rgba(91, 61, 245, 0.4)",
        "inner-ring": "inset 0 0 0 1px rgba(255, 255, 255, 0.5)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #5B3DF5 0%, #7C5CFF 55%, #9678ff 100%)",
        "hero-glow":
          "radial-gradient(60% 60% at 50% 0%, rgba(124, 92, 255, 0.14) 0%, rgba(124, 92, 255, 0) 100%)",
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s infinite",
        "fade-up": "fade-up 0.45s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.3s ease-out both",
        "scale-in": "scale-in 0.2s ease-out both",
      },
      transitionDuration: {
        DEFAULT: "200ms",
      },
    },
  },
  plugins: [],
};
export default config;
