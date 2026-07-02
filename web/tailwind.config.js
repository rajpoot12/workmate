/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        phosphor: {
          bg: '#0a0e0a',
          panel: '#0e140e',
          green: '#33ff77',
          dim: '#1f7a3f',
          amber: '#ffb000',
          cyan: '#36e0d0',
          red: '#ff5f56',
          gray: '#7a8a7a',
        },
      },
    },
  },
  plugins: [],
};
