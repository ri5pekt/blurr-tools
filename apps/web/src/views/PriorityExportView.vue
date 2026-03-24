<template>
  <div class="priority-export-view">

    <div class="page-header">
      <h1>Priority Export</h1>
      <p>Fetch Shopify orders and export them as a Priority-compatible TXT file for import.</p>
    </div>

    <!-- ─── Manual Export ─────────────────────────────────────────────── -->

    <section class="panel">
      <div class="panel-head">
        <h2>Export</h2>
      </div>

      <div class="export-form">

        <!-- Date Range -->
        <div class="field">
          <label>Date Range <span class="field-hint">(optional if Order IDs provided)</span></label>
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

        <!-- Order IDs -->
        <div class="field">
          <label>Order IDs <span class="field-hint">(optional — overrides date range)</span></label>
          <textarea
            v-model="orderIdsInput"
            class="ids-textarea"
            placeholder="Enter Shopify order IDs, one per line or comma-separated…&#10;e.g. 3745749, 3745750, 3745751"
            rows="4"
          />
          <span v-if="parsedOrderIds.length > 0" class="ids-count">
            {{ parsedOrderIds.length }} order{{ parsedOrderIds.length > 1 ? 's' : '' }} entered
          </span>
        </div>

        <div class="export-actions">
          <button
            class="btn btn-primary"
            :disabled="!canExport || isTriggering"
            @click="triggerExport"
          >
            <i v-if="isTriggering" class="pi pi-spin pi-spinner" />
            <i v-else class="pi pi-file-export" />
            {{ isTriggering ? 'Queuing…' : 'Export to TXT' }}
          </button>
        </div>

        <div v-if="triggerError" class="alert alert-error">
          <i class="pi pi-exclamation-triangle" />
          {{ triggerError }}
        </div>
      </div>
    </section>

    <!-- ─── Latest job status ─────────────────────────────────────────── -->

    <Transition name="panel-appear">
      <section v-if="latestJobId" class="panel">
        <div class="panel-head">
          <h2>Latest Export</h2>
        </div>
        <div class="panel-body">
          <div v-if="!latestJob" class="loading-row">
            <i class="pi pi-spin pi-spinner" /> Loading…
          </div>
          <template v-else>
            <JobStatusCard :job="latestJob" />
            <div v-if="latestJob.status === 'completed'" class="download-wrap">
              <button
                class="btn btn-download"
                :disabled="isDownloading"
                @click="downloadFile(latestJob.id)"
              >
                <i v-if="isDownloading" class="pi pi-spin pi-spinner" />
                <i v-else class="pi pi-download" />
                {{ isDownloading ? 'Downloading…' : 'Download TXT File' }}
              </button>
              <span class="download-hint">
                {{ latestJob.result?.ordersCount ?? 0 }} orders · {{ latestJob.result?.fileName ?? '' }}
              </span>
            </div>
          </template>
        </div>
      </section>
    </Transition>

    <!-- ─── Job History ────────────────────────────────────────────────── -->

    <section class="panel">
      <div class="panel-head">
        <h2>Job History</h2>
      </div>
      <PriorityJobHistory @download="downloadFile" />
    </section>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import DatePicker from 'primevue/datepicker'
import { apiClient } from '../api/client.js'
import { useToast } from '../composables/useToast.js'
import type { Job } from '@blurr-tools/types'
import JobStatusCard from '../components/JobStatusCard.vue'
import PriorityJobHistory from '../components/PriorityJobHistory.vue'

const queryClient = useQueryClient()
const toast       = useToast()

// ─── Date helpers ─────────────────────────────────────────────────────────────

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

// ─── Date range ───────────────────────────────────────────────────────────────

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

// ─── Order IDs ────────────────────────────────────────────────────────────────

const orderIdsInput = ref('')

const parsedOrderIds = computed(() => {
  if (!orderIdsInput.value.trim()) return []
  return orderIdsInput.value
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean)
})

// ─── Validation ───────────────────────────────────────────────────────────────

const canExport = computed(() => {
  if (parsedOrderIds.value.length > 0) return true
  return !!dateFrom.value && !!dateTo.value
})

// ─── Trigger export ───────────────────────────────────────────────────────────

const isTriggering = ref(false)
const triggerError = ref<string | null>(null)
const latestJobId  = ref<string | null>(null)

async function triggerExport() {
  if (!canExport.value || isTriggering.value) return
  isTriggering.value = true
  triggerError.value = null

  try {
    const body: Record<string, unknown> = {}

    if (parsedOrderIds.value.length > 0) {
      body.orderIds = parsedOrderIds.value
    } else {
      body.dateFrom = dateFrom.value
      body.dateTo   = dateTo.value
    }

    const res = await apiClient.post<{ jobId: string }>(
      '/features/priority-export/export',
      body,
    )
    latestJobId.value = res.data.jobId

    const desc = parsedOrderIds.value.length > 0
      ? `${parsedOrderIds.value.length} order IDs`
      : dateFrom.value === dateTo.value
        ? dateFrom.value
        : `${dateFrom.value} → ${dateTo.value}`

    toast.info('Export queued', `Processing orders: ${desc}`)
    queryClient.invalidateQueries({ queryKey: ['jobs', 'priority_export'] })
  } catch (err: any) {
    triggerError.value = err.response?.data?.error ?? 'Failed to trigger export'
  } finally {
    isTriggering.value = false
  }
}

// ─── Latest job polling ───────────────────────────────────────────────────────

const notifiedJobId = ref<string | null>(null)

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
  if (!job || job.id === notifiedJobId.value) return

  if (job.status === 'completed') {
    notifiedJobId.value = job.id
    const count = typeof job.result?.ordersCount === 'number' ? job.result.ordersCount : null
    toast.success(
      'Export complete',
      count !== null ? `${count} orders exported — ready to download` : 'File ready to download',
    )
    queryClient.invalidateQueries({ queryKey: ['jobs', 'priority_export'] })
  } else if (job.status === 'failed') {
    notifiedJobId.value = job.id
    toast.error('Export failed', job.errorMessage ?? 'An error occurred during export')
    queryClient.invalidateQueries({ queryKey: ['jobs', 'priority_export'] })
  }
})

// ─── Download ─────────────────────────────────────────────────────────────────

const isDownloading = ref(false)

async function downloadFile(jobId: string) {
  if (isDownloading.value) return
  isDownloading.value = true
  try {
    const res = await apiClient.get(`/features/priority-export/download/${jobId}`, {
      responseType: 'blob',
    })
    const blob = new Blob([res.data], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)

    const contentDisposition = res.headers['content-disposition'] ?? ''
    const fileNameMatch = contentDisposition.match(/filename="?([^";\n]+)"?/)
    const fileName = fileNameMatch?.[1] ?? `priority-export-${jobId}.txt`

    const a = document.createElement('a')
    a.href     = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    toast.error('Download failed', 'Could not download the export file')
  } finally {
    isDownloading.value = false
  }
}
</script>

<style scoped>
.priority-export-view {
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
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ─── Export form ────────────────────────────────────────────────────── */

.export-form {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
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

.field-hint {
  font-weight: 400;
  color: #9ca3af;
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

/* ─── Order IDs textarea ─────────────────────────────────────────────── */

.ids-textarea {
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.875rem;
  color: #111827;
  background: #fff;
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;
  transition: border-color 0.15s, box-shadow 0.15s;
  outline: none;
  box-sizing: border-box;
}

.ids-textarea:focus {
  border-color: var(--blurr-primary);
  box-shadow: 0 0 0 3px rgba(184, 66, 169, 0.12);
}

.ids-textarea::placeholder {
  color: #9ca3af;
}

.ids-count {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--blurr-primary);
}

/* ─── Export actions ─────────────────────────────────────────────────── */

.export-actions {
  display: flex;
  gap: 0.75rem;
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

.btn-download {
  background: #0891b2;
  color: #fff;
  border-color: #0891b2;
}

.btn-download:not(:disabled):hover {
  background: #0e7490;
}

/* ─── Download row ───────────────────────────────────────────────────── */

.download-wrap {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.download-hint {
  font-size: 0.8125rem;
  color: #6b7280;
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
}

.alert-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
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

/* ─── Panel transition ────────────────────────────────────────────────── */

.panel-appear-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.panel-appear-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.panel-appear-enter-from,
.panel-appear-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ─── Responsive ─────────────────────────────────────────────────────── */

@media (max-width: 600px) {
  .picker-wrap {
    flex-direction: column;
    align-items: flex-start;
  }

  .range-picker :deep(.p-datepicker-input) {
    width: 100%;
  }

  .btn { justify-content: center; }

  .download-wrap {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
