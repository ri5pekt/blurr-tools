<template>
  <div class="settings">

    <div class="page-header">
      <h1>Settings</h1>
      <p>Manage users and scheduled export jobs.</p>
    </div>

    <!-- ─── Tabs ──────────────────────────────────────────────────────────── -->
    <div class="tab-bar">
      <button
        v-if="auth.user?.role === 'admin'"
        class="tab-btn"
        :class="{ 'tab-btn--active': activeTab === 'users' }"
        @click="activeTab = 'users'"
      >
        <i class="pi pi-users" />
        Users
      </button>
      <button
        class="tab-btn"
        :class="{ 'tab-btn--active': activeTab === 'schedules' }"
        @click="activeTab = 'schedules'"
      >
        <i class="pi pi-clock" />
        Scheduled Exports
      </button>
    </div>

    <!-- ─── Users Tab ─────────────────────────────────────────────────────── -->
    <template v-if="activeTab === 'users'">

      <!-- Invite form -->
      <div class="panel">
        <div class="panel-header">
          <h2>Invite New User</h2>
        </div>
        <div class="panel-body">
          <form class="invite-form" @submit.prevent="handleInvite">
            <div class="form-row">
              <div class="field">
                <label>Full Name</label>
                <input
                  v-model="invite.name"
                  type="text"
                  placeholder="Jane Smith"
                  required
                  :disabled="inviting"
                />
              </div>
              <div class="field">
                <label>Email Address</label>
                <input
                  v-model="invite.email"
                  type="email"
                  placeholder="jane@blurr.com"
                  required
                  :disabled="inviting"
                />
              </div>
              <div class="field field--narrow">
                <label>Role</label>
                <select v-model="invite.role" :disabled="inviting">
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div class="field field--action">
                <button type="submit" class="btn btn--primary" :disabled="inviting">
                  <i class="pi" :class="inviting ? 'pi-spin pi-spinner' : 'pi-send'" />
                  {{ inviting ? 'Sending…' : 'Send Invite' }}
                </button>
              </div>
            </div>
          </form>

          <div
            v-if="inviteResult"
            class="invite-result"
            :class="inviteResult.ok ? 'invite-result--ok' : 'invite-result--warn'"
          >
            <i
              class="pi invite-result-icon"
              :class="inviteResult.ok ? 'pi-check-circle' : 'pi-exclamation-circle'"
            />
            <div class="invite-result-body">
              <p>{{ inviteResult.message }}</p>
              <div v-if="inviteResult.tempPassword" class="temp-password-row">
                <span>Temporary password:</span>
                <code>{{ inviteResult.tempPassword }}</code>
              </div>
            </div>
            <button class="invite-dismiss" @click="inviteResult = null">
              <i class="pi pi-times" />
            </button>
          </div>
        </div>
      </div>

      <!-- Users list -->
      <div class="panel">
        <div class="panel-header">
          <h2>All Users</h2>
          <button class="btn btn--ghost btn--sm" :disabled="usersLoading" @click="loadUsers">
            <i class="pi" :class="usersLoading ? 'pi-spin pi-spinner' : 'pi-refresh'" />
          </button>
        </div>
        <div v-if="usersLoading && !usersList.length" class="panel-state">
          <i class="pi pi-spin pi-spinner" />
          Loading users…
        </div>
        <div v-else-if="usersError" class="panel-state panel-state--error">
          <i class="pi pi-exclamation-triangle" />
          {{ usersError }}
        </div>
        <div v-else class="panel-body panel-body--no-pad">
          <table class="users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="u in usersList"
                :key="u.id"
                :class="{ 'row--inactive': !u.isActive }"
              >
                <td>
                  <div class="user-cell">
                    <div class="user-avatar-sm" :style="{ background: getAvatarColor(u.name) }">
                      {{ getInitials(u.name) }}
                    </div>
                    <div class="user-cell-info">
                      <span class="user-cell-name">{{ u.name }}</span>
                      <span class="user-cell-email">{{ u.email }}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <select
                    class="role-select"
                    :value="u.role"
                    :disabled="u.id === auth.user?.id || userActionsLoading.has(u.id)"
                    @change="handleRoleChange(u, ($event.target as HTMLSelectElement).value as 'admin' | 'staff')"
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>
                  <span
                    class="status-badge"
                    :class="u.isActive ? 'status-badge--active' : 'status-badge--inactive'"
                  >
                    {{ u.isActive ? 'Active' : 'Inactive' }}
                  </span>
                </td>
                <td class="date-cell">{{ formatDate(u.createdAt) }}</td>
                <td class="actions-cell">
                  <span v-if="u.id === auth.user?.id" class="you-label">You</span>
                  <button
                    v-else
                    class="btn btn--ghost btn--sm"
                    :class="u.isActive ? 'btn--danger-ghost' : ''"
                    :disabled="userActionsLoading.has(u.id)"
                    @click="handleToggleActive(u)"
                  >
                    <i
                      class="pi"
                      :class="userActionsLoading.has(u.id)
                        ? 'pi-spin pi-spinner'
                        : u.isActive ? 'pi-ban' : 'pi-check-circle'"
                    />
                    {{ u.isActive ? 'Deactivate' : 'Reactivate' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </template>

    <!-- ─── Schedules Tab ─────────────────────────────────────────────────── -->
    <template v-if="activeTab === 'schedules'">

      <div class="panel">
        <div class="panel-header">
          <h2>Scheduled Export Jobs</h2>
          <button class="btn btn--ghost btn--sm" :disabled="schedulesLoading" @click="loadSchedules">
            <i class="pi" :class="schedulesLoading ? 'pi-spin pi-spinner' : 'pi-refresh'" />
          </button>
        </div>
        <div v-if="schedulesLoading" class="panel-state">
          <i class="pi pi-spin pi-spinner" />
          Loading schedules…
        </div>
        <div v-else-if="schedulesError" class="panel-state panel-state--error">
          <i class="pi pi-exclamation-triangle" />
          {{ schedulesError }}
        </div>
        <div v-else class="panel-body">
          <p v-if="auth.user?.role !== 'admin'" class="schedules-note">
            <i class="pi pi-info-circle" />
            Only admins can enable or disable scheduled exports.
          </p>
          <div v-for="s in schedules" :key="s.feature" class="schedule-card">
            <div class="schedule-icon-wrap">
              <i class="pi pi-calendar" />
            </div>
            <div class="schedule-details">
              <div class="schedule-name">{{ s.displayName }}</div>
              <div class="schedule-meta">
                <span v-if="s.data?.cron" class="schedule-meta-pill">
                  <i class="pi pi-clock" /> {{ s.data.cron }}
                </span>
                <span v-if="s.data?.options?.timezone" class="schedule-meta-pill">
                  <i class="pi pi-globe" /> {{ s.data.options.timezone }}
                </span>
                <span v-if="!s.data" class="schedule-meta-pill schedule-meta-pill--muted">
                  Not configured
                </span>
              </div>
            </div>
            <div class="schedule-toggle-wrap">
              <span
                class="toggle-label"
                :class="s.data?.enabled ? 'toggle-label--on' : 'toggle-label--off'"
              >
                {{ s.data?.enabled ? 'Enabled' : 'Disabled' }}
              </span>
              <label
                class="toggle"
                :class="{ 'toggle--disabled': !s.data || auth.user?.role !== 'admin' || scheduleTogglingIds.has(s.feature) }"
              >
                <input
                  type="checkbox"
                  :checked="s.data?.enabled ?? false"
                  :disabled="!s.data || auth.user?.role !== 'admin' || scheduleTogglingIds.has(s.feature)"
                  @change="handleToggleSchedule(s, ($event.target as HTMLInputElement).checked)"
                />
                <span class="toggle-track" />
              </label>
            </div>
          </div>
        </div>
      </div>

    </template>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth.js'
import { apiClient } from '../api/client.js'

const auth = useAuthStore()

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const activeTab = ref<'users' | 'schedules'>(auth.user?.role === 'admin' ? 'users' : 'schedules')

// ─── Users ────────────────────────────────────────────────────────────────────

interface UserRow {
  id:        string
  email:     string
  name:      string
  role:      'admin' | 'staff'
  isActive:  boolean
  createdAt: string
}

const usersList           = ref<UserRow[]>([])
const usersLoading        = ref(false)
const usersError          = ref<string | null>(null)
const userActionsLoading  = ref(new Set<string>())

async function loadUsers() {
  usersLoading.value = true
  usersError.value   = null
  try {
    const res = await apiClient.get<UserRow[]>('/users')
    usersList.value = res.data
  } catch (err: any) {
    usersError.value = err.response?.data?.error ?? 'Failed to load users'
  } finally {
    usersLoading.value = false
  }
}

// ─── Invite ───────────────────────────────────────────────────────────────────

const invite = reactive({ name: '', email: '', role: 'staff' as 'admin' | 'staff' })
const inviting     = ref(false)
const inviteResult = ref<{ ok: boolean; message: string; tempPassword?: string } | null>(null)

async function handleInvite() {
  inviting.value     = true
  inviteResult.value = null
  try {
    const res = await apiClient.post<{
      user:          UserRow
      emailSent:     boolean
      tempPassword?: string
      message:       string
    }>('/users', {
      email: invite.email,
      name:  invite.name,
      role:  invite.role,
    })
    inviteResult.value = {
      ok:           true,
      message:      res.data.message,
      tempPassword: res.data.tempPassword,
    }
    invite.name  = ''
    invite.email = ''
    invite.role  = 'staff'
    await loadUsers()
  } catch (err: any) {
    inviteResult.value = {
      ok:      false,
      message: err.response?.data?.error ?? 'Failed to invite user',
    }
  } finally {
    inviting.value = false
  }
}

async function handleRoleChange(u: UserRow, role: 'admin' | 'staff') {
  if (u.role === role) return
  userActionsLoading.value = new Set([...userActionsLoading.value, u.id])
  try {
    await apiClient.put(`/users/${u.id}`, { role })
    u.role = role
  } catch (err: any) {
    alert(err.response?.data?.error ?? 'Failed to update role')
  } finally {
    userActionsLoading.value = new Set([...userActionsLoading.value].filter(id => id !== u.id))
  }
}

async function handleToggleActive(u: UserRow) {
  userActionsLoading.value = new Set([...userActionsLoading.value, u.id])
  try {
    if (u.isActive) {
      await apiClient.delete(`/users/${u.id}`)
      u.isActive = false
    } else {
      await apiClient.put(`/users/${u.id}`, { isActive: true })
      u.isActive = true
    }
  } catch (err: any) {
    alert(err.response?.data?.error ?? 'Failed to update user')
  } finally {
    userActionsLoading.value = new Set([...userActionsLoading.value].filter(id => id !== u.id))
  }
}

// ─── Schedules ────────────────────────────────────────────────────────────────

interface ScheduleData {
  id:       string
  feature:  string
  name:     string
  cron:     string
  enabled:  boolean
  options:  { timezone?: string }
}

interface ScheduleEntry {
  feature:     string
  displayName: string
  endpoint:    string
  data:        ScheduleData | null
}

const KNOWN_SCHEDULES: Omit<ScheduleEntry, 'data'>[] = [
  {
    feature:     'daily-orders',
    displayName: 'Daily Orders Export',
    endpoint:    '/features/daily-orders/schedule',
  },
]

const schedules          = ref<ScheduleEntry[]>(KNOWN_SCHEDULES.map(s => ({ ...s, data: null })))
const schedulesLoading   = ref(false)
const schedulesError     = ref<string | null>(null)
const scheduleTogglingIds = ref(new Set<string>())

async function loadSchedules() {
  schedulesLoading.value = true
  schedulesError.value   = null
  try {
    const results = await Promise.all(
      schedules.value.map(async (s) => {
        const res = await apiClient.get<ScheduleData>(s.endpoint)
        return { feature: s.feature, data: res.data }
      }),
    )
    for (const r of results) {
      const entry = schedules.value.find(x => x.feature === r.feature)
      if (entry) entry.data = r.data
    }
  } catch (err: any) {
    schedulesError.value = err.response?.data?.error ?? 'Failed to load schedules'
  } finally {
    schedulesLoading.value = false
  }
}

async function handleToggleSchedule(s: ScheduleEntry, enabled: boolean) {
  scheduleTogglingIds.value = new Set([...scheduleTogglingIds.value, s.feature])
  try {
    const res = await apiClient.put<ScheduleData>(s.endpoint, { enabled })
    s.data = res.data
  } catch (err: any) {
    alert(err.response?.data?.error ?? 'Failed to update schedule')
  } finally {
    scheduleTogglingIds.value = new Set([...scheduleTogglingIds.value].filter(id => id !== s.feature))
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

const AVATAR_COLORS = ['#b842a9', '#862f7b', '#7c3aed', '#0891b2', '#0d9488']
function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Init ─────────────────────────────────────────────────────────────────────

onMounted(() => {
  if (auth.user?.role === 'admin') loadUsers()
  loadSchedules()
})
</script>

<style scoped>
.settings {
  max-width: 900px;
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

/* ─── Tabs ─────────────────────────────────────────────────────────────── */

.tab-bar {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid var(--blurr-border);
  padding-bottom: 0;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.125rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  border-radius: 4px 4px 0 0;
  transition: color 0.15s;
}

.tab-btn:hover {
  color: #374151;
}

.tab-btn--active {
  color: var(--blurr-primary);
  font-weight: 600;
  border-bottom-color: var(--blurr-primary);
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--blurr-border);
}

.panel-header h2 {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
  color: #111827;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.panel-header h2 .pi {
  color: var(--blurr-primary);
  font-size: 1rem;
}

.panel-body {
  padding: 1.25rem;
}

.panel-body--no-pad {
  padding: 0;
}

.panel-state {
  padding: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  color: #6b7280;
  font-size: 0.875rem;
}

.panel-state--error {
  color: #dc2626;
}

/* ─── Invite form ──────────────────────────────────────────────────────── */

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto auto;
  gap: 0.875rem;
  align-items: end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.field--narrow {
  width: 130px;
}

.field--action {
  flex-shrink: 0;
}

.field label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #374151;
}

.field input,
.field select {
  height: 38px;
  padding: 0 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 7px;
  font-size: 0.875rem;
  color: #111827;
  background: #ffffff;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  width: 100%;
  box-sizing: border-box;
}

.field input:focus,
.field select:focus {
  border-color: var(--blurr-primary);
  box-shadow: 0 0 0 3px rgba(184, 66, 169, 0.12);
}

.field input:disabled,
.field select:disabled {
  background: #f9fafb;
  color: #9ca3af;
}

/* ─── Invite result ────────────────────────────────────────────────────── */

.invite-result {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-top: 1rem;
  padding: 0.875rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
}

.invite-result--ok {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}

.invite-result--warn {
  background: #fffbeb;
  border: 1px solid #fde68a;
}

.invite-result-icon {
  font-size: 1.125rem;
  flex-shrink: 0;
  margin-top: 1px;
}

.invite-result--ok .invite-result-icon {
  color: #16a34a;
}

.invite-result--warn .invite-result-icon {
  color: #d97706;
}

.invite-result-body {
  flex: 1;
}

.invite-result-body p {
  margin: 0 0 0.375rem;
  color: #374151;
  line-height: 1.5;
}

.temp-password-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: #6b7280;
  flex-wrap: wrap;
}

.temp-password-row code {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 0.125rem 0.5rem;
  font-family: monospace;
  font-size: 0.875rem;
  color: #1e293b;
  letter-spacing: 0.02em;
  user-select: all;
}

.invite-dismiss {
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  padding: 0.125rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  transition: color 0.15s;
}

.invite-dismiss:hover {
  color: #374151;
}

/* ─── Users table ──────────────────────────────────────────────────────── */

.users-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.users-table thead th {
  padding: 0.625rem 1rem;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
  border-bottom: 1px solid var(--blurr-border);
  background: #f9fafb;
}

.users-table tbody tr {
  border-bottom: 1px solid var(--blurr-border);
  transition: background 0.12s;
}

.users-table tbody tr:last-child {
  border-bottom: none;
}

.users-table tbody tr:hover {
  background: #fafafa;
}

.users-table tbody tr.row--inactive {
  opacity: 0.6;
}

.users-table td {
  padding: 0.75rem 1rem;
  vertical-align: middle;
  color: #374151;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.user-avatar-sm {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: #ffffff;
  flex-shrink: 0;
}

.user-cell-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.user-cell-name {
  font-weight: 600;
  color: #111827;
  font-size: 0.875rem;
}

.user-cell-email {
  font-size: 0.8125rem;
  color: #6b7280;
}

.role-select {
  height: 30px;
  padding: 0 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.8125rem;
  color: #374151;
  background: #ffffff;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
}

.role-select:focus {
  border-color: var(--blurr-primary);
}

.role-select:disabled {
  background: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.625rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
}

.status-badge--active {
  background: #dcfce7;
  color: #15803d;
}

.status-badge--inactive {
  background: #f3f4f6;
  color: #6b7280;
}

.date-cell {
  white-space: nowrap;
  color: #6b7280;
  font-size: 0.8125rem;
}

.actions-cell {
  text-align: right;
  white-space: nowrap;
}

.you-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #9ca3af;
  padding: 0.25rem 0.625rem;
}

/* ─── Buttons ──────────────────────────────────────────────────────────── */

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  height: 38px;
  padding: 0 1rem;
  border: none;
  border-radius: 7px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
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
}

.btn--ghost {
  background: transparent;
  color: #374151;
  border: 1px solid #d1d5db;
}

.btn--ghost:not(:disabled):hover {
  background: #f3f4f6;
}

.btn--sm {
  height: 30px;
  padding: 0 0.625rem;
  font-size: 0.8125rem;
}

.btn--danger-ghost {
  color: #dc2626;
  border-color: #fecaca;
}

.btn--danger-ghost:not(:disabled):hover {
  background: #fef2f2;
  border-color: #dc2626;
}

/* ─── Schedule cards ───────────────────────────────────────────────────── */

.schedules-note {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: #6b7280;
  margin: 0 0 1rem;
}

.schedule-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--blurr-border);
  border-radius: 10px;
  background: #fafafa;
  margin-bottom: 0.75rem;
}

.schedule-card:last-child {
  margin-bottom: 0;
}

.schedule-icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #fdf0fc;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.schedule-icon-wrap .pi {
  font-size: 1.125rem;
  color: var(--blurr-primary);
}

.schedule-details {
  flex: 1;
  min-width: 0;
}

.schedule-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.375rem;
}

.schedule-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.schedule-meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #6b7280;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  padding: 0.15rem 0.55rem;
}

.schedule-meta-pill .pi {
  font-size: 0.7rem;
}

.schedule-meta-pill--muted {
  color: #9ca3af;
}

.schedule-toggle-wrap {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex-shrink: 0;
}

.toggle-label {
  font-size: 0.8125rem;
  font-weight: 600;
}

.toggle-label--on {
  color: #16a34a;
}

.toggle-label--off {
  color: #9ca3af;
}

/* ─── Toggle switch ────────────────────────────────────────────────────── */

.toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-track {
  width: 42px;
  height: 24px;
  border-radius: 12px;
  background: #d1d5db;
  transition: background 0.2s;
  position: relative;
  display: block;
}

.toggle-track::after {
  content: '';
  position: absolute;
  top: 4px;
  left: 4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.toggle input:checked + .toggle-track {
  background: var(--blurr-primary);
}

.toggle input:checked + .toggle-track::after {
  transform: translateX(18px);
}

.toggle--disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* ─── Responsive ───────────────────────────────────────────────────────── */

@media (max-width: 700px) {
  .form-row {
    grid-template-columns: 1fr;
  }

  .field--narrow {
    width: 100%;
  }

  .users-table thead {
    display: none;
  }

  .users-table tbody tr {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--blurr-border);
  }

  .users-table td {
    padding: 0;
  }

  .actions-cell {
    text-align: left;
  }
}
</style>
