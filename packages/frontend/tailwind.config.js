/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "var(--bg)",
          2: "var(--bg-2)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          2: "var(--ink-2)",
          3: "var(--ink-3)",
        },
        rule: {
          DEFAULT: "var(--rule)",
          2: "var(--rule-2)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          ink: "var(--accent-ink)",
        },
      },
      fontFamily: {
        mono: ["var(--mono)"],
        serif: ["var(--serif)"],
        sans: ["var(--sans)"],
      },
      fontSize: {
        caps: ["11px", { letterSpacing: "0.08em", fontWeight: "500" }],
      },
    },
  },
  plugins: [],
};
