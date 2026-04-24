/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: '#C45A30',
        accent: {
          DEFAULT: '#C45A30',
          light: '#F5E6DD',
          ink: '#5C2415',
        },
        orange: {
          DEFAULT: '#C45A30',
          light: '#F5E6DD',
        },
        ink: {
          DEFAULT: '#2D2923',
          2: '#5C5549',
          muted: '#5C5549',
          faint: '#8A8379',
        },
        bg: {
          DEFAULT: '#F3F0EB',
          2: '#EDE9E3',
          card: '#FFFFFF',
          muted: '#EDE9E3',
        },
        rule: {
          DEFAULT: '#D4CFC8',
          2: '#BFB9B0',
        },
        success: '#16A34A',
        warning: '#D97706',
        error: '#DC2626',
        dark: {
          bg: '#141412',
          'bg-2': '#1C1C1A',
          'bg-card': '#1C1C1A',
          'bg-muted': '#242422',
          ink: '#F5F4F0',
          'ink-2': '#B8B3AB',
          'ink-muted': '#B8B3AB',
          'ink-faint': '#6B7280',
          rule: '#3A3835',
          'rule-2': '#4A4845',
          accent: '#E07B52',
          orange: '#E07B52',
          'orange-light': '#3D2A20',
          success: '#4ADE80',
          warning: '#FBBF24',
          error: '#F87171',
        },
      },
      fontFamily: {
        serif: ['InstrumentSerif_400Regular'],
        'serif-italic': ['InstrumentSerif_400Regular_Italic'],
        sans: ['Inter_400Regular'],
        'sans-medium': ['Inter_500Medium'],
        'sans-semibold': ['Inter_600SemiBold'],
        mono: ['JetBrainsMono_400Regular'],
        'mono-medium': ['JetBrainsMono_500Medium'],
        // Aliases
        display: ['InstrumentSerif_400Regular'],
        body: ['Inter_400Regular'],
        'body-medium': ['Inter_500Medium'],
      },
    },
  },
  plugins: [],
};
