/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        rova: {
          red: '#FF6A00',
          green: '#1F8F3A',
          orange: '#FF6A00',
          orangeDark: '#E85F00',
          dark: '#0B1220',
          card: '#111B2E',
        },
      },
    },
  },
  plugins: [],
};
