import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          900: '#0b3d2e',
          800: '#0f4d39',
          700: '#136045', // dark green nav
          600: '#1a7a56',
          500: '#22915f',
          100: '#e6f4ee',
        },
        surface: {
          bg: '#f4f5f7', // light grey page background
          card: '#ffffff',
        },
        accent: {
          blue: '#2563eb',
          purple: '#7c3aed',
          green: '#16a34a',
        },
      },
      borderRadius: {
        xl2: '0.875rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(16, 24, 40, 0.06), 0 1px 3px 0 rgba(16, 24, 40, 0.08)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
