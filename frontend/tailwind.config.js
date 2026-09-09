/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Ayurghar brand palette, replacing the default Tailwind "blue"
        // scale so every existing blue-* utility class in the app
        // (buttons, links, focus rings, badges, headers) renders in the
        // brand orange instead. 600 is the exact logo color.
        blue: {
          50: "#fcf6f3",
          100: "#f8eae2",
          200: "#f4d2bd",
          300: "#f2af88",
          400: "#f28c50",
          500: "#f26f21",
          600: "#da5c10",
          700: "#b04d11",
          800: "#883d11",
          900: "#693211",
          950: "#40200c",
        },
      },
    },
  },
  plugins: [],
}

