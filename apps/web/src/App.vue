<template>
  <RouterView />
  <Toast position="top-right" />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import Toast from 'primevue/toast'
import { useAuthStore } from './stores/auth.js'

const auth = useAuthStore()

onMounted(async () => {
  if (auth.accessToken) {
    await auth.fetchMe()
  }
})
</script>
