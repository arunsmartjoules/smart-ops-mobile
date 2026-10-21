/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // App-wide carbon palette (Claude Design "JouleOps App"). `slate-*`
        // is the neutral ramp every `dark:bg-slate-*` / `text-slate-*` class
        // lands on: 950 page, 900 card, 800 raised, 700 track, 400 muted,
        // 100 ink. `red-*` stays the alert red.
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
          50: "#F7F7F8",
          100: "#F4F4F6",
          200: "#E2E2E7",
          300: "#C9C9D1",
          400: "#8A8A96",
          500: "#6E6E7A",
          600: "#5A5A66",
          700: "#26262E",
          800: "#1C1C22",
          900: "#141418",
          950: "#0A0A0C",
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
