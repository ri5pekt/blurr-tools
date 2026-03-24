<template>
  <div class="daily-orders-view">

    <div class="page-header">
      <h1>Daily Orders Export</h1>
      <p>Fetch Shopify orders for a date range and write them to Google Sheets.</p>
    </div>

    <!-- ─── Manual Export ─────────────────────────────────────────────── -->

    <section class="panel">
      <div class="panel-head">
        <h2>Manual Export</h2>
      </div>

      <div class="export-controls">
        <div class="field">
          <label>Date Range</label>
          <div class="picker-wrap">
            <DatePicker
              v-model="dateRange"
              selection-mode="range"
              :manual-input="false"
              show-icon
              icon-display="input"
              date-format="M dd, yy"
              placeholder="Select date range…"
              class="range-picker"
            />
            <span v-if="selectedDayCount > 1" class="day-count">
              {{ selectedDayCount }} days
            </span>
          </div>
        </div>

        <button
          class="btn btn-primary"
          :disabled="!canExport || isTriggering"
          @click="triggerExport"
        >
          <i v-if="isTriggering" class="pi pi-spin pi-spinner" />
          <i v-else class="pi pi-upload" />
          {{ isTriggering ? 'Queuing…' : (selectedDayCount > 1 ? `Export ${selectedDayCount} Days` : 'Export') }}
        </button>
      </div>

      <div v-if="triggerError" class="alert alert-error">
        <i class="pi pi-exclamation-triangle" />
        {{ triggerError }}
      </div>

      <div v-if="triggeredCount !== null" class="alert alert-success">
        <i class="pi pi-check-circle" />
        {{ triggeredCount === 1
          ? `Export job queued for ${triggeredDateFrom}.`
          : `${triggeredCount} export jobs queued for ${triggeredDateFrom} → ${triggeredDateTo}.`
        }}
        Job history will update below as they run.
      </div>
    </section>

    <!-- ─── Active job status (latest triggered job) ──────────────────── -->

    <section v-if="latestJobId" class="panel">
      <div class="panel-head">
        <h2>Latest Job</h2>
      </div>
      <div class="panel-body">
        <JobStatusCard v-if="latestJob" :job="latestJob" />
        <div v-else class="loading-row">
          <i class="pi pi-spin pi-spinner" /> Loading…
        </div>
      </div>
    </section>

    <!-- ─── Scheduled Export ──────────────────────────────────────────── -->

    <section class="panel">
      <div class="panel-head">
        <h2>Daily Auto-Export</h2>
        <span class="schedule-badge" :class="schedule?.enabled ? 'badge-on' : 'badge-off'">
          {{ schedule?.enabled ? 'Enabled' : 'Disabled' }}
        </span>
      </div>

      <div v-if="scheduleLoading" class="skeleton-block" />

      <div v-else class="schedule-form">
        <p class="schedule-hint">
          When enabled, the export runs automatically each day and exports the previous day's orders.
        </p>

        <div class="schedule-row">
          <div class="field">
            <label>Run time</label>
            <div class="time-select-wrap">
              <select v-model="scheduleHour" class="select-input">
                <option v-for="opt in hourOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <span class="time-colon">:</span>
              <select v-model="scheduleMinute" class="select-input select-input--sm">
                <option value="0">00</option>
                <option value="15">15</option>
                <option value="30">30</option>
                <option value="45">45</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label>Timezone</label>
            <select v-model="scheduleTimezone" class="select-input select-input--tz">
              <optgroup label="UTC">
                <option value="UTC">UTC</option>
              </optgroup>
              <optgroup label="North America">
                <option value="America/New_York">Eastern Time (ET)</option>
                <option value="America/Chicago">Central Time (CT)</option>
                <option value="America/Denver">Mountain Time (MT)</option>
                <option value="America/Los_Angeles">Pacific Time (PT)</option>
              </optgroup>
              <optgroup label="Europe">
                <option value="Europe/London">London (GMT/BST)</option>
                <option value="Europe/Paris">Central European Time (CET)</option>
              </optgroup>
              <optgroup label="Middle East">
                <option value="Asia/Jerusalem">Israel Time (IST)</option>
                <option value="Asia/Dubai">Gulf Time (GST)</option>
              </optgroup>
              <optgroup label="Asia / Pacific">
                <option value="Asia/Singapore">Singapore (SGT)</option>
                <option value="Asia/Tokyo">Japan (JST)</option>
                <option value="Australia/Sydney">Sydney (AEST)</option>
              </optgroup>
            </select>
          </div>
        </div>

        <div class="schedule-actions">
          <button
            class="btn btn-outline"
            :disabled="isSavingSchedule || !isAdmin"
            :title="!isAdmin ? 'Admin only' : ''"
            @click="saveSchedule(schedule?.enabled)"
          >
            <i v-if="isSavingSchedule && !togglingEnabled" class="pi pi-spin pi-spinner" />
            <i v-else class="pi pi-save" />
            Save Time & Timezone
          </button>

          <button
            class="btn"
            :class="schedule?.enabled ? 'btn-danger-outline' : 'btn-success'"
            :disabled="isSavingSchedule || !isAdmin"
            :title="!isAdmin ? 'Admin only' : ''"
            @click="saveSchedule(!schedule?.enabled)"
          >
            <i v-if="isSavingSchedule && togglingEnabled" class="pi pi-spin pi-spinner" />
            <i v-else :class="schedule?.enabled ? 'pi pi-times' : 'pi pi-check'" />
            {{ schedule?.enabled ? 'Disable' : 'Enable' }}
          </button>
        </div>

        <div v-if="scheduleError" class="alert alert-error">
          <i class="pi pi-exclamation-triangle" />
          {{ scheduleError }}
        </div>

        <div v-if="scheduleSaved" class="alert alert-success">
          <i class="pi pi-check-circle" />
          Schedule saved. Changes take effect within 5 minutes.
        </div>
      </div>
    </section>

    <!-- ─── Job History ────────────────────────────────────────────────── -->

    <section class="panel">
      <div class="panel-head">
        <h2>Job History</h2>
      </div>
      <JobLogsPanel feature="daily_orders_export" />
    </section>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import DatePicker from 'primevue/datepicker'
import { apiClient } from '../api/client.js'
import { useAuthStore } from '../stores/auth.js'
import type { Job, ScheduledExport } from '@blurr-tools/types'
import JobStatusCard from '../components/JobStatusCard.vue'
import JobLogsPanel from '../components/JobLogsPanel.vue'

const auth        = useAuthStore()
const queryClient = useQueryClient()
const isAdmin     = computed(() => auth.user?.role === 'admin')

// ─── Date helpers ────────────────────────────────────────────────────────────

function toLocalDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const yesterdayDate = computed(() => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  d.setHours(0, 0, 0, 0)
  return d
})

// ─── Date range (PrimeVue DatePicker range mode returns [Date, Date | null]) ─

const dateRange = ref<Date[]>([yesterdayDate.value, yesterdayDate.value])

const dateFrom = computed(() => {
  const d = dateRange.value?.[0]
  return d ? toLocalDate(d) : ''
})

const dateTo = computed(() => {
  const d = dateRange.value?.[1]
  return d ? toLocalDate(d) : ''
})

const selectedDayCount = computed(() => {
  if (!dateFrom.value || !dateTo.value) return 0
  const start = new Date(`${dateFrom.value}T00:00:00Z`)
  const end   = new Date(`${dateTo.value}T00:00:00Z`)
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
})

const canExport = computed(() => !!dateFrom.value && !!dateTo.value)

// ─── Trigger export ──────────────────────────────────────────────────────────

const isTriggering    = ref(false)
const triggerError    = ref<string | null>(null)
const triggeredCount  = ref<number | null>(null)
const triggeredDateFrom = ref('')
const triggeredDateTo   = ref('')
const latestJobId     = ref<string | null>(null)

async function triggerExport() {
  if (!canExport.value || isTriggering.value) return
  isTriggering.value   = true
  triggerError.value   = null
  triggeredCount.value = null

  try {
    const res = await apiClient.post<{ jobIds: string[]; count: number }>(
      '/features/daily-orders/export',
      { dateFrom: dateFrom.value, dateTo: dateTo.value },
    )
    latestJobId.value       = res.data.jobIds[0] ?? null
    triggeredCount.value    = res.data.count
    triggeredDateFrom.value = dateFrom.value
    triggeredDateTo.value   = dateTo.value
    queryClient.invalidateQueries({ queryKey: ['jobs', 'daily_orders_export'] })
  } catch (err: any) {
    triggerError.value = err.response?.data?.error ?? 'Failed to trigger export'
  } finally {
    isTriggering.value = false
  }
}

// ─── Latest job polling ──────────────────────────────────────────────────────

const { data: latestJob } = useQuery({
  queryKey:  computed(() => ['job', latestJobId.value]),
  queryFn:   async () => {
    const res = await apiClient.get<Job>(`/jobs/${latestJobId.value!}`)
    return res.data
  },
  enabled:         computed(() => !!latestJobId.value),
  refetchInterval: (query): number | false => {
    const s = query.state.data?.status
    return s === 'pending' || s === 'running' ? 3000 : false
  },
})

watch(latestJob, (job) => {
  if (job && (job.status === 'completed' || job.status === 'failed')) {
    queryClient.invalidateQueries({ queryKey: ['jobs', 'daily_orders_export'] })
  }
})

// ─── Schedule ────────────────────────────────────────────────────────────────

const scheduleHour     = ref(8)
const scheduleMinute   = ref(0)
const scheduleTimezone = ref('America/New_York')
const isSavingSchedule = ref(false)
const togglingEnabled  = ref(false)
const scheduleError    = ref<string | null>(null)
const scheduleSaved    = ref(false)

// 12-hour hour options
const hourOptions = Array.from({ length: 24 }, (_, i) => {
  const period = i < 12 ? 'AM' : 'PM'
  const h12    = i === 0 ? 12 : i > 12 ? i - 12 : i
  return { value: i, label: `${h12}:00 ${period}` }
})

const { data: schedule, isLoading: scheduleLoading } = useQuery({
  queryKey: ['schedule', 'daily_orders_export'],
  queryFn:  async () => {
    const res = await apiClient.get<ScheduledExport | null>('/features/daily-orders/schedule')
    return res.data
  },
})

watch(schedule, (s) => {
  if (!s) return
  // Parse cron to hour/minute: "30 8 * * *" → hour=8, minute=30
  const parts = s.cron.split(' ')
  if (parts.length >= 2) {
    const minute = parseInt(parts[0], 10)
    const hour   = parseInt(parts[1], 10)
    if (!isNaN(hour))   scheduleHour.value   = hour
    if (!isNaN(minute)) scheduleMinute.value = minute
  }
  scheduleTimezone.value = s.timezone
}, { immediate: true })

function buildCron(): string {
  return `${scheduleMinute.value} ${scheduleHour.value} * * *`
}

async function saveSchedule(enabled?: boolean) {
  if (!isAdmin.value) return
  isSavingSchedule.value = true
  togglingEnabled.value  = enabled !== undefined && enabled !== schedule.value?.enabled
  scheduleError.value    = null
  scheduleSaved.value    = false

  try {
    const body: Record<string, unknown> = {
      cron:     buildCron(),
      timezone: scheduleTimezone.value,
    }
    if (enabled !== undefined) body.enabled = enabled

    await apiClient.put('/features/daily-orders/schedule', body)
    queryClient.invalidateQueries({ queryKey: ['schedule', 'daily_orders_export'] })
    scheduleSaved.value = true
    setTimeout(() => { scheduleSaved.value = false }, 4000)
  } catch (err: any) {
    scheduleError.value = err.response?.data?.error ?? 'Failed to save schedule'
  } finally {
    isSavingSchedule.value = false
    togglingEnabled.value  = false
  }
}

</script>

<style scoped>
.daily-orders-view {
  max-width: 860px;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* ─── Header ─────────────────────────────────────────────────────────── */

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

/* ─── Panel ─────────────────────────────────────────────────────────── */

.panel {
  background: #fff;
  border: 1px solid var(--blurr-border);
  border-radius: 12px;
  overflow: hidden;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--blurr-border);
}

.panel-head h2 {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
  color: #111827;
}

.panel-body {
  padding: 1.25rem;
}

/* ─── Export controls ───────────────────────────────────────────────── */

.export-controls {
  display: flex;
  align-items: flex-end;
  gap: 1.25rem;
  padding: 1.25rem;
  flex-wrap: wrap;
}

.picker-wrap {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.day-count {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--blurr-primary);
  background: rgba(184, 66, 169, 0.08);
  border-radius: 99px;
  padding: 0.2rem 0.625rem;
  white-space: nowrap;
}

/* ─── PrimeVue DatePicker overrides ─────────────────────────────────── */

.range-picker :deep(.p-datepicker-input) {
  width: 230px;
  height: 38px;
  padding: 0 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.875rem;
  color: #111827;
  background: #fff;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.range-picker :deep(.p-datepicker-input:focus) {
  border-color: var(--blurr-primary);
  box-shadow: 0 0 0 3px rgba(184, 66, 169, 0.12);
}

.range-picker :deep(.p-datepicker-input-icon-container) {
  right: 0.5rem;
  color: #9ca3af;
}

.range-picker :deep(.p-datepicker-panel) {
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
}

.range-picker :deep(.p-datepicker-day-selected),
.range-picker :deep(.p-datepicker-day-selected-range) {
  background: var(--blurr-primary) !important;
  color: #fff !important;
  border-radius: 6px;
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

/* ─── Inputs ─────────────────────────────────────────────────────────── */

.select-input,
.text-input {
  height: 38px;
  padding: 0 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.875rem;
  color: #111827;
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
  outline: none;
  cursor: pointer;
}

.select-input {
  width: 160px;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%239ca3af' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 2rem;
}

.select-input--sm {
  width: 80px;
}

.select-input--tz {
  width: 230px;
}

.select-input:focus,
.text-input:focus {
  border-color: var(--blurr-primary);
  box-shadow: 0 0 0 3px rgba(184, 66, 169, 0.12);
}

/* ─── Buttons ───────────────────────────────────────────────────────── */

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0 1rem;
  height: 38px;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--blurr-primary);
  color: #fff;
  border-color: var(--blurr-primary);
}

.btn-primary:not(:disabled):hover {
  background: #9e3590;
}

.btn-outline {
  background: #fff;
  color: #374151;
  border-color: #d1d5db;
}

.btn-outline:not(:disabled):hover {
  background: #f9fafb;
  border-color: #9ca3af;
}

.btn-success {
  background: #16a34a;
  color: #fff;
  border-color: #16a34a;
}

.btn-success:not(:disabled):hover {
  background: #15803d;
}

.btn-danger-outline {
  background: #fff;
  color: #dc2626;
  border-color: #fca5a5;
}

.btn-danger-outline:not(:disabled):hover {
  background: #fef2f2;
}

/* ─── Alerts ─────────────────────────────────────────────────────────── */

.alert {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  border-radius: 6px;
  padding: 0.625rem 0.875rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  margin: 0 1.25rem 1rem;
}

.alert-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
}

.alert-success {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}

.alert .pi {
  flex-shrink: 0;
  margin-top: 1px;
}

/* ─── Loading ─────────────────────────────────────────────────────────── */

.loading-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #9ca3af;
  font-size: 0.875rem;
}

/* ─── Schedule ──────────────────────────────────────────────────────── */

.schedule-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.625rem;
  border-radius: 99px;
}

.badge-on  { background: #f0fdf4; color: #16a34a; }
.badge-off { background: #f3f4f6; color: #6b7280; }

.skeleton-block {
  height: 130px;
  margin: 1.25rem;
  border-radius: 8px;
  background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.schedule-form {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.schedule-hint {
  margin: 0;
  font-size: 0.8125rem;
  color: #6b7280;
}

.schedule-row {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.time-select-wrap {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.time-colon {
  font-size: 1rem;
  font-weight: 700;
  color: #374151;
  padding-bottom: 0;
}

.schedule-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

/* ─── Responsive ─────────────────────────────────────────────────────── */

@media (max-width: 600px) {
  .export-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .picker-wrap {
    flex-direction: column;
    align-items: flex-start;
  }

  .range-picker :deep(.p-datepicker-input) {
    width: 100%;
  }

  .btn { justify-content: center; }

  .schedule-row { flex-direction: column; }

  .select-input--tz { width: 100%; }
}
</style>
