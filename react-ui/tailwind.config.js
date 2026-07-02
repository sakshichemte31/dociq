/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        sand: {
          50:  '#FAFAF8',
          100: '#F5F5F0',
          200: '#EBEBEB',
          300: '#D4D4C8',
          400: '#A8A89C',
          500: '#78786E',
          600: '#5A5A52',
        },
        accent: {
          50:  '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FCA65F',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA6C0A',
          700: '#C2560B',
        },
        clay: {
          50:  '#F8F4F0',
          100: '#EDE5DC',
          200: '#D9C9B7',
          300: '#C4AC92',
        },
      },
      animation: {
        'fade-in':  'fadeIn 0.18s ease-out',
        'slide-up': 'slideUp 0.22s ease-out',
        'shimmer':  'shimmer 1.8s linear infinite',
        'float':    'float 4s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' },                                   to: { opacity: '1' } },
        slideUp:   { from: { transform: 'translateY(6px)', opacity: '0' },     to: { transform: 'translateY(0)', opacity: '1' } },
        shimmer:   { '0%': { backgroundPosition: '-200% 0' },                  '100%': { backgroundPosition: '200% 0' } },
        float:     { '0%,100%': { transform: 'translateY(0)' },                '50%': { transform: 'translateY(-5px)' } },
        pulseSoft: { '0%,100%': { opacity: '1' },                              '50%': { opacity: '0.6' } },
      },
      boxShadow: {
        'soft':    '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card':    '0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'lifted':  '0 4px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        'accent':  '0 4px 14px rgba(249,115,22,0.25)',
      },
    },
  },
  plugins: [],
}
