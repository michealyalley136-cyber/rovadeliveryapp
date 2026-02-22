/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        rova: {
          red: 'var(--color-danger)',
          green: 'var(--color-secondary)',
          orange: 'var(--color-primary)',
          orangeDark: 'var(--color-primary-hover)',
          dark: 'var(--color-background)',
          card: 'var(--color-surface)',
        },
      },
    },
  },
  plugins: [],
};
