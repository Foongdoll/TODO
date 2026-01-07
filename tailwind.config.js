/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Bahnschrift", "Segoe UI", "Trebuchet MS", "sans-serif"],
        serif: ["Iowan Old Style", "Palatino Linotype", "Book Antiqua", "serif"],
      },
      boxShadow: {
        soft: "0 18px 45px -30px rgba(15, 23, 42, 0.45)",
      },
    },
  },
  plugins: [],
};
