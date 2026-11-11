import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        black: '#000000',
        blackHole: '#222222',
        coffeeBean: '#2D120D',
        rosewood: '#6B0B0C',
        electricTangerine: {
          DEFAULT: '#FF6D1F',
          hover: '#FA5810',
          glow: 'rgba(255, 109, 31, 0.35)',
        },
        lemonChiffon: {
          DEFAULT: '#FFF8CA',
          hover: '#FFF3A8',
        },
        sustainableLinen: '#FAF3E1',
        recycledCotton: '#F5E7C6',
        botticelli: {
          DEFAULT: '#CDE3E8',
          muted: '#8EA4B5',
        },
        mochaBrown: {
          DEFAULT: '#6F4E37',
          dark: '#4A3324',
          light: '#8B6447',
        },
        platinumSilver: {
          DEFAULT: '#E5E4E2',
          muted: '#C4C3C0',
          pure: '#F0EFEF',
        },
        paleLavender: {
          DEFAULT: '#E6E0F0',
          soft: '#F2EDFA',
          muted: '#CBC3DC',
        },
        textPrimary: '#F5F3ED',
        textSecondary: '#E8E4D5',
        textMuted: '#BCB9AE',
        textTertiary: '#A6A398',
        textPlaceholder: '#9E9B90',
        borderDark: 'rgba(245, 243, 237, 0.18)',
        borderStrong: 'rgba(245, 243, 237, 0.32)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        heading: ['var(--font-heading)', 'Berkelium Sans', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        showcase: ['var(--font-showcase)', 'Ferdinand', 'Playfair Display', 'Georgia', 'serif'],
        body: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        technical: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow-tangerine': '0 0 50px -10px rgba(255, 109, 31, 0.45)',
        'glass-card': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glass-capsule': 'inset 0 1px 0 rgba(245, 243, 237, 0.30), 0 16px 40px -8px rgba(0, 0, 0, 0.65)',
        'glass-rim': 'inset 0 1px 0 rgba(245, 243, 237, 0.30), inset 0 -1px 0 rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.06)',
        'liquid-glass': '0 20px 50px -15px rgba(0, 0, 0, 0.7), inset 0 1px 1px 0 rgba(229, 228, 226, 0.22), inset 0 0 0 1px rgba(255, 255, 255, 0.08)',
        'liquid-nav': '0 16px 36px -10px rgba(0, 0, 0, 0.65), inset 0 1px 0 0 rgba(229, 228, 226, 0.3)',
        'liquid-glow': '0 0 45px -10px rgba(255, 109, 31, 0.4), 0 0 30px -5px rgba(230, 224, 240, 0.2)',
        'metallic': 'inset 0 1px 2px 0 rgba(255, 255, 255, 0.35), inset 0 -2px 4px 0 rgba(0, 0, 0, 0.6), 0 8px 24px rgba(0, 0, 0, 0.5)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.32, 0.72, 0, 1)',
        'out-back': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        fast: '180ms',
        med: '260ms',
      },
      animation: {
        'float-slow': 'float 8s ease-in-out infinite',
        'float-delayed': 'float 10s ease-in-out 3s infinite',
        'pulse-subtle': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
