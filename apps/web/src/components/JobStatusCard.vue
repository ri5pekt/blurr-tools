<template>
  <div class="job-status-card" :class="`status--${job.status}`">

    <!-- Header row -->
    <div class="card-header">
      <span class="status-badge" :class="`badge--${job.status}`">
        <span class="status-dot" :class="{ pulsing: job.status === 'running' }" />
        {{ statusLabel }}
      </span>
      <span class="job-time">{{ formatDate(job.createdAt) }}</span>
    </div>

    <!-- Progress bar (running only) -->
    <div v-if="job.status === 'running'" class="progress-wrap">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${job.progress}%` }" />
      </div>
      <span class="progress-label">{{ job.progress }}%</span>
    </div>

    <!-- Error message -->
    <div v-if="job.status === 'failed' && job.errorMessage" class="error-block">
      <i class="pi pi-exclamation-circle" />
      <span>{{ job.errorMessage }}</span>
    </div>

    <!-- Result summary -->
    <div v-if="job.status === 'completed' && resultSummary" class="result-block">
      <i class="pi pi-check-circle" />
      <span>{{ resultSummary }}</span>
      <a
        v-if="sheetUrl"
        :href="sheetUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="sheet-link"
      >
        Open Sheet <i class="pi pi-external-link" />
      </a>
    </div>

    <!-- Timestamps -->
    <div class="timestamps">
      <span v-if="job.startedAt">
        Started {{ formatDate(job.startedAt) }}
      </span>
      <span v-if="duration" class="duration">
        · {{ duration }}
      </span>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Job } from '@blurr-tools/types'

const props = defineProps<{ job: Job }>()

const statusLabels: Record<string, string> = {
  pending:   'Pending',
  running:   'Running',
  completed: 'Completed',
  failed:    'Failed',
  cancelled: 'Cancelled',
}

const statusLabel = computed(() => statusLabels[props.job.status] ?? props.job.status)

const resultSummary = computed(() => {
  const r = props.job.result
  if (!r) return null
  if (typeof r.ordersCount === 'number') {
    return `${r.ordersCount} orders exported successfully`
  }
  return null
})

const sheetUrl = computed(() => {
  const r = props.job.result
  return typeof r?.sheetUrl === 'string' ? r.sheetUrl : null
})

const duration = computed(() => {
  if (!props.job.startedAt) return null
  const start = new Date(props.job.startedAt).getTime()
  const end   = props.job.completedAt
    ? new Date(props.job.completedAt).getTime()
    : Date.now()
  const ms = end - start
  if (ms < 1000)    return `${ms}ms`
  if (ms < 60_000)  return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month:  'short',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
</script>

<style scoped>
.job-status-card {
  background: #ffffff;
  border: 1px solid var(--blurr-border);
  border-radius: 10px;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* ─── Header ─────────────────────────────────────────────── */

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  padding: 0.25rem 0.625rem;
  border-radius: 99px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.status-dot.pulsing {
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.7); }
}

/* Badge variants */
.badge--pending   { background: #f3f4f6; color: #6b7280; }
.badge--running   { background: #eff6ff; color: #2563eb; }
.badge--completed { background: #f0fdf4; color: #16a34a; }
.badge--failed    { background: #fef2f2; color: #dc2626; }
.badge--cancelled { background: #fff7ed; color: #ea580c; }

.job-time {
  font-size: 0.75rem;
  color: #9ca3af;
}

/* ─── Progress ───────────────────────────────────────────── */

.progress-wrap {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: #e5e7eb;
  border-radius: 99px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #2563eb;
  border-radius: 99px;
  transition: width 0.4s ease;
}

.progress-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #2563eb;
  min-width: 32px;
  text-align: right;
}

/* ─── Error ──────────────────────────────────────────────── */

.error-block {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 0.625rem 0.75rem;
  font-size: 0.8125rem;
  color: #dc2626;
  line-height: 1.5;
}

.error-block .pi {
  flex-shrink: 0;
  margin-top: 1px;
}

/* ─── Result ─────────────────────────────────────────────── */

.result-block {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: #16a34a;
}

.sheet-link {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--blurr-primary);
  text-decoration: none;
}

.sheet-link:hover {
  text-decoration: underline;
}

/* ─── Timestamps ─────────────────────────────────────────── */

.timestamps {
  font-size: 0.75rem;
  color: #9ca3af;
}

.duration {
  font-weight: 500;
}
</style>
