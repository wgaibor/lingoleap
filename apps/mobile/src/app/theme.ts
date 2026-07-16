// Traducción manual 1:1 de packages/tokens/src/tokens.css (fuente de verdad).
// RN no consume CSS variables; si tokens.css cambia, este archivo se actualiza a mano.
export const theme = {
  colors: {
    primary: '#58CC02',
    primaryDark: '#58A700',
    danger: '#FF4B4B',
    info: '#1CB0F6',
    warning: '#FFC800',
    text: '#3C3C3C',
    textMuted: '#777777',
    border: '#E5E5E5',
    surface: '#FFFFFF',
    background: '#F7F7F7'
  },
  radius: { sm: 8, md: 12, lg: 16, pill: 9999 },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }
} as const;
