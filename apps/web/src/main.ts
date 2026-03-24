import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import 'primeicons/primeicons.css'

import App from './App.vue'
import router from './router/index.js'
import { BlurrTheme } from './theme.js'
import './style.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(VueQueryPlugin)
app.use(PrimeVue, {
  theme: {
    preset: BlurrTheme,
    options: {
      darkModeSelector: false,
    },
  },
})
app.use(ToastService)
app.use(ConfirmationService)

app.mount('#app')
