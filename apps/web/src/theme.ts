import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'

export const BlurrTheme = definePreset(Aura, {
  semantic: {
    primary: {
      50:  '#fdf0fc',
      100: '#f9d6f7',
      200: '#f3adef',
      300: '#ea7de4',
      400: '#d955d3',
      500: '#b842a9',
      600: '#9a358d',
      700: '#862f7b',
      800: '#6b2562',
      900: '#531d4c',
      950: '#3a1235',
    },
  },
})
