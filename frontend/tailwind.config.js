/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx,mdx}"],
  // Utilities present in the deployed stylesheet whose using code is not shipped to the browser
  // (server-only branches / unused components). Kept so the compiled CSS matches the deployment.
  safelist: [
    "container",
    "visible",
    "invisible",
    "contents",
    "!hidden",
    "!rule",
    "mt-auto",
    "h-20",
    "grow",
    "select-none",
    "p-5",
    "leading-tight",
    "underline-offset-2",
    "shadow",
    "backdrop-filter",
    "gap-x-1.5",
    "gap-x-2",
    "gap-x-2.5",
    "gap-x-3",
    "gap-x-4",
    "gap-x-5",
    "gap-x-6",
    "gap-x-7",
    "gap-x-8",
    "group-hover:opacity-100",
    "lg:block",
    "[&::-webkit-details-marker]:hidden",
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: "var(--bg-color)",
          border: "var(--border-color)",
          "border-strong": "var(--border-strong)",
          hover: "var(--surface-hover)",
          panel: "var(--surface-panel)",
          raised: "var(--surface-raised)",
        },
        ink: {
          DEFAULT: "var(--text-main)",
          muted: "var(--text-secondary)",
          faint: "var(--text-faint)",
        },
        accent: {
          DEFAULT: "var(--accent-cool)",
          bright: "var(--accent-warm)",
          brand: "var(--accent-brand)",
        },
        risk: {
          DEFAULT: "var(--risk)",
          bg: "var(--risk-bg)",
          border: "var(--risk-border)",
        },
        ok: "var(--ok)",
      },
      borderRadius: {
        DEFAULT: "2px",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(0,0,0,0.28)",
        raised: "0 4px 12px -2px rgba(0,0,0,0.36)",
        float: "0 12px 28px -6px rgba(0,0,0,0.48)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
        serif: ["var(--font-serif-display)", "Georgia", "serif"],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      transitionDuration: {
        DEFAULT: "250ms",
      },
      animation: {
        "fade-in": "fade-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};
