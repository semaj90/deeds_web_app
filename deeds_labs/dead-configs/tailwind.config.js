/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      fontFamily: {
        monone: ['"Courier New"', 'monospace'], // Ensure this font is available or replace with a system font
      },
    },
  },
  plugins: [],
};
