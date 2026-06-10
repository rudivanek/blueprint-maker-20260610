/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#2575FC',
          dark: '#1a5fe0',
          light: '#4d8ffd',
        },
      },
      fontFamily: {
        sans: ['Segoe UI', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['Consolas', 'Cascadia Code', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '5px',
        sm: '3px',
        md: '5px',
        lg: '5px',
        xl: '5px',
        '2xl': '5px',
        full: '9999px',
      },
      animation: {
        'slide-in': 'slide-in 200ms ease forwards',
        'fade-in': 'fade-in 200ms ease forwards',
      },
      keyframes: {
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
