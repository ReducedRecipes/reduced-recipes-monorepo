/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: '#E85D26',
        ink: '#1A1A18',
        bg: '#FAFAF8',
      },
      fontFamily: {
        display: ['Lora_600SemiBold'],
        body: ['DMSans_400Regular'],
      },
    },
  },
  plugins: [],
};
