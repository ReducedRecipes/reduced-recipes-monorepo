/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: '#E85D26',
        orange: {
          DEFAULT: '#E85D26',
          light: '#FEF0E7',
        },
        ink: {
          DEFAULT: '#1A1A18',
          muted: '#6B7280',
          faint: '#9CA3AF',
        },
        bg: {
          DEFAULT: '#FAFAF8',
          card: '#FFFFFF',
          muted: '#F3F2EF',
        },
        success: '#16A34A',
        warning: '#D97706',
        error: '#DC2626',
        cream: '#FAFAF8',
        muted: '#F3F2EF',
        dark: {
          bg: '#141412',
          'bg-card': '#1C1C1A',
          'bg-muted': '#242422',
          ink: '#F5F4F0',
          'ink-muted': '#9CA3AF',
          'ink-faint': '#6B7280',
          orange: '#FF7A45',
          'orange-light': '#3D2A20',
          success: '#4ADE80',
          warning: '#FBBF24',
          error: '#F87171',
        },
      },
      fontFamily: {
        display: ['Lora_600SemiBold'],
        body: ['DMSans_400Regular'],
        'body-medium': ['DMSans_500Medium'],
      },
    },
  },
  plugins: [],
};
