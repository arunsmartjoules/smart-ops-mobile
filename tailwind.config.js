/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // App-wide navy/red palette (Claude Design "JouleOps Role Dashboard
        // v2"). The app is dark-only, so `red-*` is the red accent and
        // `slate-*` is the navy ramp every `dark:bg-slate-*` / `text-slate-*`
        // class lands on: 950 page, 900 card, 800 tile, 400 muted, 100 ink.
        red: {
          50: "#FDF0F0",
          100: "#FADADA",
          200: "#F4B5B5",
          300: "#F2A7A7",
          400: "#E25F5F",
          500: "#D94848",
          600: "#D43535",
          700: "#B32828",
          800: "#8C2020",
          900: "#3A1616",
          950: "#2A1010",
        },
        slate: {
          50: "#F5F7FF",
          100: "#E9EEF7",
          200: "#D3DBE9",
          300: "#BCC8E0",
          400: "#7A91BB",
          500: "#5D7196",
          600: "#3E506A",
          700: "#25344F",
          800: "#152038",
          900: "#0F1828",
          950: "#060C1A",
        },
        // SmartJoules direct palette — usable as `bg-sj-thunder`, `text-sj-flame`, …
        sj: {
          flame: "#CA3604",
          frost: "#F5F6FB",
          carbon: "#191312",
          sky: "#28939D",
          thunder: "#072B31",
        },
      },
    },
  },
  plugins: [],
};
