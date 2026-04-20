<template>
  <div class="login-page">
    <div class="login-card">

      <!-- Brand -->
      <div class="brand">
        <div class="brand-logo">B</div>
        <div class="brand-text">
          <h1>Blurr Tools</h1>
          <span class="version">v{{ APP_VERSION }}</span>
        </div>
      </div>

      <!-- Form -->
      <form class="form" @submit.prevent="handleSubmit">
        <div class="field">
          <label for="email">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            :disabled="loading"
            required
          />
        </div>

        <div class="field">
          <label for="password">Password</label>
          <div class="password-wrapper">
            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="••••••••"
              :disabled="loading"
              required
            />
            <button
              type="button"
              class="toggle-password"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              @click="showPassword = !showPassword"
            >
              <i :class="showPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" />
            </button>
          </div>
        </div>

        <!-- Error -->
        <div v-if="errorMessage" class="error-banner" role="alert">
          <i class="pi pi-exclamation-circle" />
          {{ errorMessage }}
        </div>

        <!-- Submit -->
        <button type="submit" class="submit-btn" :disabled="loading">
          <span v-if="loading" class="spinner" />
          <span v-else>Sign In</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { APP_VERSION } from '../config/version.js'

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()

const email        = ref('')
const password     = ref('')
const showPassword = ref(false)
const loading      = ref(false)
const errorMessage = ref('')

async function handleSubmit() {
  errorMessage.value = ''
  loading.value = true

  try {
    await auth.login(email.value, password.value)
    const redirect = (route.query.redirect as string) || '/app'
    router.push(redirect)
  } catch (err: any) {
    const code = err.response?.data?.code
    if (code === 'INVALID_CREDENTIALS') {
      errorMessage.value = 'Incorrect email or password.'
    } else if (code === 'ACCOUNT_DISABLED') {
      errorMessage.value = 'Your account has been disabled. Contact an administrator.'
    } else {
      errorMessage.value = 'Something went wrong. Please try again.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #862f7b 0%, #b842a9 100%);
  padding: 1rem;
}

.login-card {
  background: #ffffff;
  border-radius: 16px;
  padding: 2.5rem;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
}

/* ─── Brand ──────────────────────────────────────────────── */

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
  box-shadow: 0 4px 14px rgba(184, 66, 169, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 700;
  color: #ffffff;
  flex-shrink: 0;
}

.brand-text h1 {
  margin: 0 0 0.25rem;
  font-size: 1.375rem;
  font-weight: 700;
  color: #1a1a1a;
}

.version {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #b842a9;
  background: rgba(184, 66, 169, 0.08);
  border: 1px solid rgba(184, 66, 169, 0.2);
  border-radius: 99px;
  padding: 0.1rem 0.5rem;
  letter-spacing: 0.02em;
}

/* ─── Form ───────────────────────────────────────────────── */

.form {
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.field label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #374151;
}

.field input {
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.9375rem;
  color: #111827;
  background: #fff;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}

.field input:focus {
  border-color: #b842a9;
  box-shadow: 0 0 0 3px rgba(184, 66, 169, 0.12);
}

.field input:disabled {
  background: #f9fafb;
  color: #9ca3af;
  cursor: not-allowed;
}

.password-wrapper {
  position: relative;
}

.password-wrapper input {
  padding-right: 2.75rem;
}

.toggle-password {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  padding: 0;
  display: flex;
  align-items: center;
  font-size: 1rem;
  transition: color 0.15s;
}

.toggle-password:hover {
  color: #6b7280;
}

/* ─── Error ──────────────────────────────────────────────── */

.error-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  color: #b91c1c;
}

.error-banner i {
  flex-shrink: 0;
  font-size: 1rem;
}

/* ─── Submit ─────────────────────────────────────────────── */

.submit-btn {
  width: 100%;
  padding: 0.75rem;
  background: linear-gradient(135deg, #b842a9, #862f7b);
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  margin-top: 0.25rem;
}

.submit-btn:hover:not(:disabled) {
  opacity: 0.92;
}

.submit-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.submit-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

/* ─── Spinner ────────────────────────────────────────────── */

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
