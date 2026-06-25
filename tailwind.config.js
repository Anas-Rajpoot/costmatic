/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand:   { DEFAULT: '#0E6E58', dark: '#0C4A3D', soft: '#E3F1EC' },
        accent:  { DEFAULT: '#C99A3E', soft: '#F6ECD6' },
        page:    '#F6F7F5',
        surface: '#FFFFFF',
        ink:     { DEFAULT: '#14211D', body: '#3C4B46', muted: '#7C8A84' },
        cash:    { DEFAULT: '#15924F', soft: '#E7F4EC' },
        due:     { DEFAULT: '#D33A4F', soft: '#FBEAEC' },
        low:     { DEFAULT: '#E08A1E', soft: '#FBEFD9' },
        info:    { DEFAULT: '#2D74C8', soft: '#E9F1FB' },
        line:    '#E6E9E6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        urdu: ['"Noto Nastaliq Urdu"', 'serif'],
        'urdu-table': ['"Noto Sans Arabic"', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        btn: '10px',
        input: '8px',
      },
    },
  },
  plugins: [],
}
