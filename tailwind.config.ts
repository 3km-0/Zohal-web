import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Scholar Design System Colors
        background: 'var(--bg)',
        surface: {
          DEFAULT: 'var(--surface)',
          alt: 'var(--surface-alt)',
        },
        text: {
          DEFAULT: 'var(--text)',
          soft: 'var(--text-soft)',
        },
        border: 'var(--border)',
        accent: {
          DEFAULT: 'var(--accent)',
          alt: 'var(--accent-alt)',
        },
        success: 'var(--success)',
        error: 'var(--error)',
        highlight: 'var(--highlight)',
        grid: 'var(--grid-color)',
      },
      fontFamily: {
        serif: ['var(--font-source-serif)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        scholar: '10px',
        'scholar-sm': '6px',
        'scholar-lg': '16px',
        'scholar-xl': '24px',
      },
      boxShadow: {
        scholar: '0 4px 24px rgba(0, 0, 0, 0.06)',
        'scholar-lg': '0 8px 32px rgba(0, 0, 0, 0.08)',
      },
      spacing: {
        'scholar-xs': '4px',
        'scholar-sm': '8px',
        'scholar-md': '16px',
        'scholar-lg': '24px',
        'scholar-xl': '32px',
        'scholar-2xl': '48px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        shimmer: 'shimmer 1.8s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;

