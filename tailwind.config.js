/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17212b',
        line: '#d7dee8',
        brand: '#0c7c7a',
        coral: '#d85f4f',
        gold: '#d79a2b',
        mist: '#eef4f6',
      },
      boxShadow: {
        panel: '0 18px 45px rgba(23, 33, 43, 0.10)',
      },
    },
  },
  plugins: [],
};
