/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Lato', 'Noto Sans Thai', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        sp: {
          black: '#000000',
          base: '#121212',
          card: '#181818',
          cardHover: '#282828',
          subcard: '#242424',
          green: '#1DB954',
          greenHover: '#1ED760',
          greenActive: '#169C46',
          text: '#FFFFFF',
          muted: '#B3B3B3',
          subdued: '#727272',
          border: '#2A2A2A',
        }
      }
    },
  },
  plugins: [],
}
