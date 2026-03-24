<template>
  <div class="scaffold-page">
    <div class="scaffold-card">
      <div class="brand">
        <div class="brand-logo">B</div>
        <div class="brand-text">
          <h1>Blurr Tools</h1>
          <span class="version">v{{ APP_VERSION }}</span>
        </div>
      </div>

      <div class="status-list">
        <div class="status-item">
          <span class="status-dot" :class="apiStatus === 'ok' ? 'ok' : apiStatus === 'checking' ? 'checking' : 'error'" />
          <span class="status-label">API</span>
          <span class="status-value">{{ apiStatusText }}</span>
        </div>
        <div class="status-item">
          <span class="status-dot ok" />
          <span class="status-label">Frontend</span>
          <span class="status-value">Running on :5173</span>
        </div>
      </div>

      <p class="note">Phase 0 scaffold complete. Auth and app shell coming in Phase 1 & 2.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { APP_VERSION } from '../config/version.js'

const apiStatus = ref<'checking' | 'ok' | 'error'>('checking')
const apiStatusText = ref('Checking...')

onMounted(async () => {
  try {
    const res = await fetch('/api/health')
    const data = await res.json()
    if (data.status === 'ok') {
      apiStatus.value = 'ok'
      apiStatusText.value = `Running · ${data.version}`
    } else {
      throw new Error('unexpected response')
    }
  } catch {
    apiStatus.value = 'error'
    apiStatusText.value = 'Not reachable'
  }
})
</script>

<style scoped>
.scaffold-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #862f7b 0%, #b842a9 100%);
  padding: 1rem;
}

.scaffold-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 2.5rem;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.brand {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.brand-logo {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: linear-gradient(135deg, #b842a9, #862f7b);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 700;
  color: #ffffff;
  flex-shrink: 0;
}

.brand-text h1 {
  margin: 0 0 0.125rem;
  font-size: 1.375rem;
  font-weight: 700;
  color: #1a1a1a;
}

.version {
  font-size: 0.75rem;
  color: #9ca3af;
  font-weight: 500;
}

.status-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 1rem;
  background: #f5f5f5;
  border-radius: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.ok       { background: #22c55e; }
.status-dot.checking { background: #f59e0b; animation: pulse 1s infinite; }
.status-dot.error    { background: #ef4444; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.status-label {
  font-weight: 600;
  font-size: 0.8125rem;
  color: #374151;
  min-width: 70px;
}

.status-value {
  font-size: 0.8125rem;
  color: #6b7280;
}

.note {
  margin: 0;
  font-size: 0.75rem;
  color: #9ca3af;
  text-align: center;
  line-height: 1.5;
}
</style>
