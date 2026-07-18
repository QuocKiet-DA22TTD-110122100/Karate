/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        board: '#0d0d0d',
        ao: '#1a1ae0',
        aka: '#e01f1f',
        draw: '#8ed89a',
        timer: '#f2c230',
        senshu: '#d4a017',
        warning: '#4a4aff',
      },
    },
  },
  plugins: [],
};
