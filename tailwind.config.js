/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // JouleOps brand — mirrors admin/src/app/globals.css red-* remap so
        // `bg-red-600`, `text-red-600`, etc. render as the SJ Thunder teal
        // across mobile, just like the admin web app.
        red: {
          50: "#EFF4F4",
          100: "#DCE7E8",
          200: "#B6CED1",
          300: "#7DA5A9",
          400: "#437A80",
          500: "#1F555B",
          600: "#072B31",
          700: "#052024",
          800: "#041519",
          900: "#020D10",
          950: "#010608",
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
