<template>
  <div class="job-logs-panel">

    <div class="panel-header">
      <h3>Recent Jobs</h3>
      <button class="refresh-btn" :disabled="isFetching" @click="refetch()">
        <i class="pi pi-refresh" :class="{ spinning: isFetching }" />
      </button>
    </div>

    <!-- Loading skeleton -->
    <div v-if="isLoading" class="skeleton-list">
      <div v-for="i in 3" :key="i" class="skeleton-row" />
    </div>

    <!-- Empty state -->
    <div v-else-if="!jobs.length" class="empty-state">
      <i class="pi pi-inbox" />
      <p>No jobs yet for this feature.</p>
    </div>

    <!-- Jobs table -->
    <div v-else class="jobs-table">
      <div
        v-for="job in jobs"
        :key="job.id"
        class="job-row"
      >
        <span class="status-badge" :class="`badge--${job.status}`">
          <span class="dot" :class="{ pulsing: job.status === 'running' }" />
          {{ statusLabel(job.status) }}
        </span>

        <div class="job-meta">
          <span class="job-date">{{ formatDate(job.createdAt) }}</span>
          <span class="job-by">
            {{ job.createdBy?.name ?? 'Scheduled' }}
          </span>
        </div>

        <span class="job-duration">{{ jobDuration(job) }}</span>
      </div>
    </div>

    <!-- Total count -->
    <div v-if="total > jobs.length" class="more-hint">
      Showing {{ jobs.length }} of {{ total }} jobs
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { apiClient } from '../api/client.js'
import type { Job, FeatureKey } from '@blurr-tools/types'

const props = defineProps<{ feature: FeatureKey }>()

const { data, isLoading, isFetching, refetch } = useQuery({
  queryKey: ['jobs', props.feature] as const,
  queryFn: async () => {
    const res = await apiClient.get<{ jobs: Job[]; total: number }>(
      `/jobs?feature=${props.feature}&limit=10`,
    )
    return res.data
  },
  refetchInterval: (query): number | false => {
    const result = query.state.data
    const hasActive = result?.jobs?.some(
      (j: Job) => j.status === 'pending' || j.status === 'running',
    )
    return hasActive ? 5000 : false
  },
})

const jobs  = computed(() => data.value?.jobs  ?? [])
const total = computed(() => data.value?.total ?? 0)

const statusLabels: Record<string, string> = {
  pending:   'Pending',
  running:   'Running',
  completed: 'Completed',
  failed:    'Failed',
  cancelled: 'Cancelled',
}

function statusLabel(s: string): string {
  return statusLabels[s] ?? s
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month:  'short',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function jobDuration(job: Job): string {
  if (!job.startedAt) return '—'
  const start = new Date(job.startedAt).getTime()
  const end   = job.completedAt ? new Date(job.completedAt).getTime() : Date.now()
  const ms    = end - start
  if (ms < 1000)      return `${ms}ms`
  if (ms < 60_000)    return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`
}
</script>

<style scoped>
.job-logs-panel {
  background: #ffffff;
  border: 1px solid var(--blurr-border);
  border-radius: 10px;
  overflow: hidden;
}

/* ─── Header ─────────────────────────────────────────────── */

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.25rem;
  border-bottom: 1px solid var(--blurr-border);
}

.panel-header h3 {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
  color: #111827;
}

.refresh-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  font-size: 0.9rem;
  padding: 0.25rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: color 0.15s;
}

.refresh-btn:hover:not(:disabled) {
  color: var(--blurr-primary);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

/* ─── Skeleton ───────────────────────────────────────────── */

.skeleton-list {
  padding: 0.5rem 0;
}

.skeleton-row {
  height: 48px;
  margin: 0.25rem 1rem;
  border-radius: 6px;
  background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ─── Empty state ────────────────────────────────────────── */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2.5rem 1rem;
  color: #9ca3af;
  text-align: center;
}

.empty-state .pi {
  font-size: 1.75rem;
}

.empty-state p {
  margin: 0;
  font-size: 0.875rem;
}

/* ─── Jobs table ─────────────────────────────────────────── */

.jobs-table {
  padding: 0.25rem 0;
}

.job-row {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.625rem 1.25rem;
  border-bottom: 1px solid #f9fafb;
  transition: background 0.1s;
}

.job-row:last-child {
  border-bottom: none;
}

.job-row:hover {
  background: #f9fafb;
}

/* ─── Status badge ───────────────────────────────────────── */

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 99px;
  white-space: nowrap;
  min-width: 84px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.dot.pulsing {
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}

.badge--pending   { background: #f3f4f6; color: #6b7280; }
.badge--running   { background: #eff6ff; color: #2563eb; }
.badge--completed { background: #f0fdf4; color: #16a34a; }
.badge--failed    { background: #fef2f2; color: #dc2626; }
.badge--cancelled { background: #fff7ed; color: #ea580c; }

/* ─── Job meta ───────────────────────────────────────────── */

.job-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.job-date {
  font-size: 0.8125rem;
  color: #374151;
  font-weight: 500;
}

.job-by {
  font-size: 0.75rem;
  color: #9ca3af;
}

.job-duration {
  font-size: 0.75rem;
  color: #6b7280;
  white-space: nowrap;
}

/* ─── Footer ─────────────────────────────────────────────── */

.more-hint {
  padding: 0.625rem 1.25rem;
  font-size: 0.75rem;
  color: #9ca3af;
  border-top: 1px solid #f3f4f6;
  text-align: center;
}

/* ─── Spinner ────────────────────────────────────────────── */

.spinning {
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
