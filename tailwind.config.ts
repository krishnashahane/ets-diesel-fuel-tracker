import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7ff', 100: '#d9edff', 200: '#bce0ff', 300: '#8ecdff',
          400: '#59b0ff', 500: '#328fff', 600: '#1b6ff5', 700: '#1458e1',
          800: '#1748b6', 900: '#193f8f', 950: '#142757',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
