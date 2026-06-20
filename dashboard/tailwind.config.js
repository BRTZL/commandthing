const c = (v) => `hsl(var(${v}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: c("--border"),
        input: c("--input"),
        ring: c("--ring"),
        background: c("--background"),
        foreground: c("--foreground"),
        primary: { DEFAULT: c("--primary"), foreground: c("--primary-foreground") },
        secondary: { DEFAULT: c("--secondary"), foreground: c("--secondary-foreground") },
        destructive: { DEFAULT: c("--destructive"), foreground: c("--destructive-foreground") },
        muted: { DEFAULT: c("--muted"), foreground: c("--muted-foreground") },
        accent: { DEFAULT: c("--accent"), foreground: c("--accent-foreground") },
        popover: { DEFAULT: c("--popover"), foreground: c("--popover-foreground") },
        card: { DEFAULT: c("--card"), foreground: c("--card-foreground") },
        working: c("--working"),
        waiting: c("--waiting"),
        idle: c("--idle"),
        thinking: c("--thinking"),
      },
      fontFamily: {
        mono: ['"SF Mono"', "ui-monospace", "Menlo", "monospace"],
      },
      // The Car Thing's fixed screen resolution.
      width: { device: "800px" },
      height: { device: "480px" },
    },
  },
  plugins: [],
};
