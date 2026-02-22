/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        rova: {
          red: 'var(--color-danger)',
          dark: 'var(--rova-dark)',
          card: 'var(--rova-card)',
        },
      },
    },
  },
  plugins: [],
};
