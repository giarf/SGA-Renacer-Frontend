/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'institutional-blue': '#003366', // Adjust hex code as needed
        'slate-gray': '#708090',
      },
    },
  },
  plugins: [],
}
