/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        // ── Developer / terminal theme ───────────────────────────────
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
        // ── Friendly / clean theme ───────────────────────────────────
        friendly: {
          bg:       '#f8f9fb',
          surface:  '#ffffff',
          border:   '#e4e7ec',
          accent:   '#4f6ef7',
          accentBg: '#eef1fe',
          text:     '#111827',
          muted:    '#6b7280',
          green:    '#16a34a',
          greenBg:  '#dcfce7',
          amber:    '#d97706',
          amberBg:  '#fef3c7',
          red:      '#dc2626',
          redBg:    '#fee2e2',
          cyan:     '#0891b2',
          cyanBg:   '#cffafe',
        },
      },
    },
  },
  plugins: [],
};
