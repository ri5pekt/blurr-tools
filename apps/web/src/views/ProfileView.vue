<template>
  <div class="profile">

    <div class="page-header">
      <h1>My Profile</h1>
      <p>{{ auth.user?.email }}</p>
    </div>

    <!-- ─── Account Details ───────────────────────────────────────────────── -->
    <div class="panel">
      <div class="panel-header">
        <h2>Account Details</h2>
      </div>
      <div class="panel-body">
        <form class="profile-form" @submit.prevent="handleSaveName">
          <div class="form-section">
            <div class="field">
              <label for="profile-name">Display Name</label>
              <input
                id="profile-name"
                v-model="nameForm.name"
                type="text"
                placeholder="Your full name"
                required
                :disabled="nameSaving"
              />
            </div>
            <div class="field field--static">
              <label>Email</label>
              <div class="static-value">{{ auth.user?.email }}</div>
            </div>
            <div class="field field--static">
              <label>Role</label>
              <span class="role-chip" :class="`role-chip--${auth.user?.role}`">
                {{ auth.user?.role }}
              </span>
            </div>
          </div>

          <div v-if="nameSuccess" class="form-feedback form-feedback--ok">
            <i class="pi pi-check-circle" />
            Name updated successfully.
          </div>
          <div v-if="nameError" class="form-feedback form-feedback--error">
            <i class="pi pi-times-circle" />
            {{ nameError }}
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn--primary" :disabled="nameSaving || nameForm.name === auth.user?.name">
              <i class="pi" :class="nameSaving ? 'pi-spin pi-spinner' : 'pi-check'" />
              {{ nameSaving ? 'Saving…' : 'Save Name' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ─── Change Password ───────────────────────────────────────────────── -->
    <div class="panel">
      <div class="panel-header">
        <h2>Change Password</h2>
      </div>
      <div class="panel-body">
        <form class="profile-form" @submit.prevent="handleChangePassword">
          <div class="form-section">
            <div class="field">
              <label for="old-password">Current Password</label>
              <div class="input-wrap">
                <input
                  id="old-password"
                  v-model="pwForm.oldPassword"
                  :type="showOld ? 'text' : 'password'"
                  placeholder="Enter current password"
                  required
                  :disabled="pwSaving"
                  autocomplete="current-password"
                />
                <button
                  type="button"
                  class="input-eye"
                  tabindex="-1"
                  @click="showOld = !showOld"
                >
                  <i class="pi" :class="showOld ? 'pi-eye-slash' : 'pi-eye'" />
                </button>
              </div>
            </div>
            <div class="field">
              <label for="new-password">New Password</label>
              <div class="input-wrap">
                <input
                  id="new-password"
                  v-model="pwForm.newPassword"
                  :type="showNew ? 'text' : 'password'"
                  placeholder="At least 8 characters"
                  required
                  minlength="8"
                  :disabled="pwSaving"
                  autocomplete="new-password"
                />
                <button
                  type="button"
                  class="input-eye"
                  tabindex="-1"
                  @click="showNew = !showNew"
                >
                  <i class="pi" :class="showNew ? 'pi-eye-slash' : 'pi-eye'" />
                </button>
              </div>
            </div>
            <div class="field">
              <label for="confirm-password">Confirm New Password</label>
              <div class="input-wrap">
                <input
                  id="confirm-password"
                  v-model="pwForm.confirmPassword"
                  :type="showConfirm ? 'text' : 'password'"
                  placeholder="Repeat new password"
                  required
                  :disabled="pwSaving"
                  autocomplete="new-password"
                  :class="{ 'input--mismatch': pwMismatch }"
                />
                <button
                  type="button"
                  class="input-eye"
                  tabindex="-1"
                  @click="showConfirm = !showConfirm"
                >
                  <i class="pi" :class="showConfirm ? 'pi-eye-slash' : 'pi-eye'" />
                </button>
              </div>
              <span v-if="pwMismatch" class="field-hint field-hint--error">
                Passwords do not match
              </span>
            </div>
          </div>

          <div v-if="pwSuccess" class="form-feedback form-feedback--ok">
            <i class="pi pi-check-circle" />
            Password changed successfully.
          </div>
          <div v-if="pwError" class="form-feedback form-feedback--error">
            <i class="pi pi-times-circle" />
            {{ pwError }}
          </div>

          <div class="form-actions">
            <button
              type="submit"
              class="btn btn--primary"
              :disabled="pwSaving || !pwForm.oldPassword || !pwForm.newPassword || pwMismatch"
            >
              <i class="pi" :class="pwSaving ? 'pi-spin pi-spinner' : 'pi-lock'" />
              {{ pwSaving ? 'Updating…' : 'Update Password' }}
            </button>
          </div>
        </form>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()

// ─── Name form ────────────────────────────────────────────────────────────────

const nameForm   = reactive({ name: auth.user?.name ?? '' })
const nameSaving = ref(false)
const nameSuccess = ref(false)
const nameError  = ref<string | null>(null)

async function handleSaveName() {
  nameSaving.value  = true
  nameSuccess.value = false
  nameError.value   = null
  try {
    await auth.updateProfile({ name: nameForm.name })
    nameSuccess.value = true
    setTimeout(() => { nameSuccess.value = false }, 3000)
  } catch (err: any) {
    nameError.value = err.response?.data?.error ?? 'Failed to update name'
  } finally {
    nameSaving.value = false
  }
}

// ─── Password form ────────────────────────────────────────────────────────────

const pwForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const pwSaving  = ref(false)
const pwSuccess = ref(false)
const pwError   = ref<string | null>(null)
const showOld     = ref(false)
const showNew     = ref(false)
const showConfirm = ref(false)

const pwMismatch = computed(
  () => !!pwForm.confirmPassword && pwForm.newPassword !== pwForm.confirmPassword,
)

async function handleChangePassword() {
  if (pwMismatch.value) return
  pwSaving.value  = true
  pwSuccess.value = false
  pwError.value   = null
  try {
    await auth.updateProfile({
      oldPassword: pwForm.oldPassword,
      newPassword: pwForm.newPassword,
    })
    pwSuccess.value          = true
    pwForm.oldPassword       = ''
    pwForm.newPassword       = ''
    pwForm.confirmPassword   = ''
    setTimeout(() => { pwSuccess.value = false }, 3000)
  } catch (err: any) {
    const code = err.response?.data?.code
    if (code === 'WRONG_PASSWORD') {
      pwError.value = 'Current password is incorrect.'
    } else {
      pwError.value = err.response?.data?.error ?? 'Failed to update password'
    }
  } finally {
    pwSaving.value = false
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

onMounted(async () => {
  const me = await auth.fetchMe()
  if (me) nameForm.name = me.name
})
</script>

<style scoped>
.profile {
  max-width: 680px;
}

/* ─── Page header ──────────────────────────────────────────────────────── */

.page-header {
  margin-bottom: 1.75rem;
}

.page-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.25rem;
}

.page-header p {
  margin: 0;
  font-size: 0.9375rem;
  color: #6b7280;
}

/* ─── Panel ────────────────────────────────────────────────────────────── */

.panel {
  background: #ffffff;
  border: 1px solid var(--blurr-border);
  border-radius: 12px;
  margin-bottom: 1.25rem;
  overflow: hidden;
}

.panel-header {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--blurr-border);
}

.panel-header h2 {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
  color: #111827;
}

.panel-body {
  padding: 1.25rem;
}

/* ─── Form ─────────────────────────────────────────────────────────────── */

.form-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.25rem;
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
  height: 40px;
  padding: 0 0.875rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.9375rem;
  color: #111827;
  background: #ffffff;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  width: 100%;
  box-sizing: border-box;
}

.field input:focus {
  border-color: var(--blurr-primary);
  box-shadow: 0 0 0 3px rgba(184, 66, 169, 0.12);
}

.field input:disabled {
  background: #f9fafb;
  color: #9ca3af;
}

.field input.input--mismatch {
  border-color: #ef4444;
}

.field-hint {
  font-size: 0.75rem;
}

.field-hint--error {
  color: #dc2626;
}

.field--static .static-value {
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 0.875rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.9375rem;
  color: #6b7280;
}

.role-chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 0.75rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: capitalize;
  align-self: flex-start;
}

.role-chip--admin {
  background: #fdf0fc;
  color: var(--blurr-primary);
}

.role-chip--staff {
  background: #eff6ff;
  color: #2563eb;
}

/* ─── Password input with eye button ───────────────────────────────────── */

.input-wrap {
  position: relative;
}

.input-wrap input {
  padding-right: 2.75rem;
}

.input-eye {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  font-size: 1rem;
  display: flex;
  align-items: center;
  padding: 0;
  transition: color 0.15s;
}

.input-eye:hover {
  color: #374151;
}

/* ─── Feedback ─────────────────────────────────────────────────────────── */

.form-feedback {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.form-feedback--ok {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #15803d;
}

.form-feedback--error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
}

/* ─── Form actions ─────────────────────────────────────────────────────── */

.form-actions {
  display: flex;
  justify-content: flex-end;
}

/* ─── Buttons ──────────────────────────────────────────────────────────── */

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  height: 40px;
  padding: 0 1.25rem;
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn--primary {
  background: var(--blurr-primary);
  color: #ffffff;
}

.btn--primary:not(:disabled):hover {
  background: #a037a0;
  box-shadow: 0 2px 8px rgba(184, 66, 169, 0.3);
}
</style>
