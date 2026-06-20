const color = (v) => `hsl(var(${v}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: color("--background"),
        foreground: color("--foreground"),
        "foreground-dim": color("--foreground-dim"),
        card: color("--card"),
        "card-2": color("--card-2"),
        "card-selected": color("--card-selected"),
        "surface-2": color("--surface-2"),
        border: color("--border"),
        muted: color("--muted"),
        accent: color("--accent"),
        ink: color("--ink"),
        working: color("--working"),
        waiting: color("--waiting"),
        idle: color("--idle"),
        thinking: color("--thinking"),
        destructive: color("--destructive"),
        "destructive-foreground": color("--destructive-foreground"),
        toast: color("--toast"),
      },
      fontFamily: {
        mono: ['"SF Mono"', "ui-monospace", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": "0.5625rem", // 9px
        xs: "0.6875rem", // 11px
        sm: "0.8125rem", // 13px
        base: "0.9375rem", // 15px
        md: "1rem", // 16px
        lg: "1.0625rem", // 17px
        xl: "1.25rem", // 20px
        "2xl": "1.375rem", // 22px
        "3xl": "1.875rem", // 30px
      },
      borderRadius: {
        sm: "0.25rem", // 4px
        md: "0.4375rem", // 7px
        lg: "0.75rem", // 12px
        xl: "0.875rem", // 14px
      },
      // Extend the 4px spacing scale linearly with the values the UI needs
      // (key * 4px = value), so components use scale tokens, never arbitrary px.
      spacing: {
        0.75: "0.1875rem", // 3px
        1.25: "0.3125rem", // 5px
        1.75: "0.4375rem", // 7px
        2.25: "0.5625rem", // 9px
        2.75: "0.6875rem", // 11px
        3.25: "0.8125rem", // 13px
        3.75: "0.9375rem", // 15px
        4.5: "1.125rem", // 18px
        5.5: "1.375rem", // 22px
        7.5: "1.875rem", // 30px
        11.5: "2.875rem", // 46px
        13: "3.25rem", // 52px
        18.5: "4.625rem", // 74px
        19.5: "4.875rem", // 78px
        37.5: "9.375rem", // 150px
        47.5: "11.875rem", // 190px
        95: "23.75rem", // 380px
      },
      width: { device: "800px" },
      height: { device: "480px" },
    },
  },
  plugins: [],
};
