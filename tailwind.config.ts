import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        obsidian: {
          950: "#0c0906",
          900: "#14100b",
          800: "#1d1710",
          700: "#282016",
        },
        gilded: {
          DEFAULT: "#d4af37",
          300: "#f3d478",
          400: "#e5c158",
          500: "#d4af37",
          600: "#aa8220",
          glow: "rgba(212, 175, 55, 0.32)",
        },
        parchment: {
          50: "#fbf6eb",
          100: "#f5ebd6",
          200: "#e6d3b3",
          300: "#d2b689",
          800: "#2b1d0e",
          900: "#1a1209",
        },
        electric: {
          DEFAULT: "#d4af37",
          400: "#e5c158",
          500: "#c59b27",
          glow: "rgba(212, 175, 55, 0.28)",
        },
        signal: {
          DEFAULT: "#c84b31",
          400: "#e06348",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Cormorant Garamond", "Georgia", "serif"],
        codex: ["var(--font-codex)", "Cinzel", "Cormorant Garamond", "serif"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        glass: "var(--shadow-glass)",
        electric: "var(--shadow-electric)",
        "inner-specular": "inset 0 1px 0 0 rgba(255, 255, 255, 0.12)",
      },
      animation: {
        marquee: "marquee 34s linear infinite",
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer: "shimmer 2.2s linear infinite",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
