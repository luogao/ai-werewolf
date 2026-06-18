import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        night: {
          DEFAULT: '#0f1729',
          light: '#1e293b',
        },
        day: {
          DEFAULT: '#fef3c7',
          light: '#fffbeb',
        },
      },
    },
  },
  plugins: [],
};

export default config;
