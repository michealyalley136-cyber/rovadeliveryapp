/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        rova: {
          red: '#E10600',
          dark: '#0B0F19',
          card: '#101826',
        },
      },
    },
  },
  plugins: [],
};
