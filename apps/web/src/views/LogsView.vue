<template>
  <div class="logs-view">

    <!-- Page header -->
    <div class="page-header">
      <div>
        <h1>System Logs</h1>
        <p>All events, job runs, and user actions — newest first.</p>
      </div>
      <button
        class="live-btn"
        :class="{ 'live-btn--on': autoRefresh }"
        @click="autoRefresh = !autoRefresh"
      >
        <span class="live-dot" :class="{ active: autoRefresh }" />
        {{ autoRefresh ? 'Live' : 'Paused' }}
      </button>
    </div>

    <!-- Filters -->
    <div class="filters-panel">
      <div class="filters-row">
        <select v-model="filters.level" class="filter-select">
          <option value="">All levels</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
        </select>

        <select v-model="filters.source" class="filter-select">
          <option value="">All sources</option>
          <option value="api">API</option>
          <option value="worker">Worker</option>
          <option value="scheduler">Scheduler</option>
          <option value="system">System</option>
        </select>

        <select v-model="filters.feature" class="filter-select">
          <option value="">All features</option>
          <option value="daily_orders_export">Daily Orders Export</option>
        </select>

        <input
          v-model="searchInput"
          type="text"
          class="filter-input filter-search"
          placeholder="Search messages..."
        />

        <button v-if="hasFilters" class="clear-btn" @click="clearFilters">
          <i class="pi pi-times" /> Clear
        </button>
      </div>

      <div class="filters-row">
        <div class="date-range">
          <span class="date-label">From</span>
          <input v-model="filters.from" type="date" class="filter-input date-input" />
          <span class="date-label">To</span>
          <input v-model="filters.to"   type="date" class="filter-input date-input" />
        </div>
        <span class="result-count" v-if="!isLoading">
          {{ total.toLocaleString() }} {{ total === 1 ? 'entry' : 'entries' }}
        </span>
      </div>
    </div>

    <!-- Table -->
    <div class="table-wrap">
      <!-- Loading overlay -->
      <div v-if="isLoading" class="table-loading">
        <div class="spinner-ring" />
      </div>

      <table v-else-if="logs.length" class="logs-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Level</th>
            <th>Source</th>
            <th>Feature</th>
            <th>Action</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="log in logs" :key="log.id">
            <tr
              class="log-row"
              :class="{ expanded: expandedIds.has(log.id), [`row--${log.level}`]: true }"
              @click="toggleExpand(log.id)"
            >
              <td class="col-time">{{ formatDate(log.createdAt) }}</td>
              <td class="col-level">
                <span class="level-badge" :class="`level--${log.level}`">
                  {{ log.level }}
                </span>
              </td>
              <td class="col-source">{{ log.source }}</td>
              <td class="col-feature">{{ featureLabel(log.feature) }}</td>
              <td class="col-action"><code>{{ log.action }}</code></td>
              <td class="col-message">{{ log.message }}</td>
            </tr>
            <tr v-if="expandedIds.has(log.id)" class="expand-row">
              <td colspan="6">
                <div class="expand-content">
                  <p class="expand-message">{{ log.message }}</p>
                  <pre v-if="log.meta" class="meta-block">{{ JSON.stringify(log.meta, null, 2) }}</pre>
                  <div class="expand-ids">
                    <span v-if="log.jobId">Job: <code>{{ log.jobId }}</code></span>
                    <span v-if="log.userId">User: <code>{{ log.userId }}</code></span>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <div v-else class="empty-state">
        <i class="pi pi-list" />
        <p>No log entries match the current filters.</p>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="pagination">
      <button class="page-btn" :disabled="page === 0" @click="page--">
        <i class="pi pi-chevron-left" /> Prev
      </button>
      <span class="page-info">Page {{ page + 1 }} of {{ totalPages }}</span>
      <button class="page-btn" :disabled="page >= totalPages - 1" @click="page++">
        Next <i class="pi pi-chevron-right" />
      </button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { apiClient } from '../api/client.js'
import type { SystemLog } from '@blurr-tools/types'

// ─── State ─────────────────────────────────────────────────────────────────

const PAGE_SIZE   = 50
const autoRefresh = ref(false)
const page        = ref(0)
const expandedIds = ref(new Set<string>())
const searchInput = ref('')

const filters = reactive({
  level:   '',
  source:  '',
  feature: '',
  from:    '',
  to:      '',
  search:  '',
})

// Debounce search input
let searchTimer: ReturnType<typeof setTimeout>
watch(searchInput, (val) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    filters.search = val
    page.value = 0
  }, 400)
})

// Reset page when filters change
watch(() => ({ ...filters }), () => { page.value = 0 }, { deep: true })

const hasFilters = computed(() =>
  filters.level || filters.source || filters.feature ||
  filters.search || filters.from || filters.to,
)

function clearFilters() {
  filters.level   = ''
  filters.source  = ''
  filters.feature = ''
  filters.from    = ''
  filters.to      = ''
  filters.search  = ''
  searchInput.value = ''
  page.value = 0
}

// ─── Data fetching ──────────────────────────────────────────────────────────

const queryKey = computed(() => ['logs', { ...filters }, page.value])

const { data, isLoading, isFetching } = useQuery({
  queryKey,
  queryFn: async () => {
    const params = new URLSearchParams()
    params.set('limit',  String(PAGE_SIZE))
    params.set('offset', String(page.value * PAGE_SIZE))
    if (filters.level)   params.set('level',   filters.level)
    if (filters.source)  params.set('source',  filters.source)
    if (filters.feature) params.set('feature', filters.feature)
    if (filters.search)  params.set('search',  filters.search)
    if (filters.from)    params.set('from',    filters.from)
    if (filters.to)      params.set('to',      filters.to)
    const res = await apiClient.get<{ logs: SystemLog[]; total: number }>(`/logs?${params}`)
    return res.data
  },
  refetchInterval: computed(() => autoRefresh.value ? 5000 : false),
})

const logs       = computed(() => data.value?.logs  ?? [])
const total      = computed(() => data.value?.total ?? 0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

// ─── Row expansion ──────────────────────────────────────────────────────────

function toggleExpand(id: string) {
  const set = new Set(expandedIds.value)
  set.has(id) ? set.delete(id) : set.add(id)
  expandedIds.value = set
}

// ─── Formatting ─────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month:  'short',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

const featureNames: Record<string, string> = {
  daily_orders_export: 'Daily Orders',
}

function featureLabel(feature: string | null): string {
  if (!feature) return '—'
  return featureNames[feature] ?? feature
}
</script>

<style scoped>
.logs-view {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* ─── Page header ────────────────────────────────────────── */

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
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

.live-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  border: 1.5px solid var(--blurr-border);
  border-radius: 8px;
  background: #fff;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s, color 0.15s;
}

.live-btn--on {
  border-color: #16a34a;
  color: #16a34a;
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d1d5db;
  flex-shrink: 0;
  transition: background 0.2s;
}

.live-dot.active {
  background: #16a34a;
  animation: pulse-dot 1.5s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

/* ─── Filters ────────────────────────────────────────────── */

.filters-panel {
  background: #fff;
  border: 1px solid var(--blurr-border);
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.filters-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex-wrap: wrap;
}

.filter-select,
.filter-input {
  height: 34px;
  border: 1.5px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  font-size: 0.8125rem;
  color: #374151;
  padding: 0 0.625rem;
  outline: none;
  transition: border-color 0.15s;
}

.filter-select:focus,
.filter-input:focus {
  border-color: var(--blurr-primary);
}

.filter-search {
  flex: 1;
  min-width: 180px;
}

.date-range {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.date-label {
  font-size: 0.8125rem;
  color: #6b7280;
  font-weight: 500;
}

.date-input {
  width: 130px;
}

.result-count {
  margin-left: auto;
  font-size: 0.8125rem;
  color: #9ca3af;
  font-weight: 500;
}

.clear-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0 0.75rem;
  height: 34px;
  background: none;
  border: 1.5px solid #e5e7eb;
  border-radius: 6px;
  font-size: 0.8125rem;
  color: #6b7280;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.clear-btn:hover {
  border-color: #d1d5db;
  color: #374151;
}

/* ─── Table ──────────────────────────────────────────────── */

.table-wrap {
  background: #fff;
  border: 1px solid var(--blurr-border);
  border-radius: 10px;
  overflow: hidden;
  position: relative;
  min-height: 200px;
}

.table-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.8);
  z-index: 2;
}

.spinner-ring {
  width: 28px;
  height: 28px;
  border: 3px solid #e5e7eb;
  border-top-color: var(--blurr-primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.logs-table {
  width: 100%;
  border-collapse: collapse;
}

.logs-table thead tr {
  border-bottom: 2px solid #f3f4f6;
}

.logs-table thead th {
  padding: 0.625rem 1rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #6b7280;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: #fafafa;
  white-space: nowrap;
}

.log-row {
  cursor: pointer;
  transition: background 0.1s;
  border-bottom: 1px solid #f9fafb;
}

.log-row:hover,
.log-row.expanded {
  background: #fafafa;
}

.log-row.row--error { border-left: 3px solid #ef4444; }
.log-row.row--warning { border-left: 3px solid #f59e0b; }
.log-row.row--info  { border-left: 3px solid transparent; }

.logs-table td {
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  color: #374151;
  vertical-align: middle;
}

.col-time    { white-space: nowrap; color: #6b7280; min-width: 140px; }
.col-level   { white-space: nowrap; }
.col-source  { white-space: nowrap; color: #6b7280; }
.col-feature { white-space: nowrap; color: #6b7280; }
.col-action  { white-space: nowrap; }
.col-action code { font-size: 0.75rem; background: #f3f4f6; padding: 0.1rem 0.375rem; border-radius: 4px; }
.col-message { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ─── Level badge ────────────────────────────────────────── */

.level-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 99px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.level--info    { background: #eff6ff; color: #2563eb; }
.level--warning { background: #fffbeb; color: #d97706; }
.level--error   { background: #fef2f2; color: #dc2626; }

/* ─── Row expand ─────────────────────────────────────────── */

.expand-row td {
  padding: 0;
  background: #fafafa;
  border-bottom: 1px solid #e5e7eb;
}

.expand-content {
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.expand-message {
  margin: 0;
  font-size: 0.875rem;
  color: #374151;
  line-height: 1.5;
}

.meta-block {
  margin: 0;
  padding: 0.75rem 1rem;
  background: #1e1e2e;
  color: #cdd6f4;
  border-radius: 6px;
  font-size: 0.75rem;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.expand-ids {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.expand-ids span {
  font-size: 0.75rem;
  color: #9ca3af;
}

.expand-ids code {
  font-size: 0.7rem;
  background: #f3f4f6;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  color: #374151;
}

/* ─── Empty state ────────────────────────────────────────── */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 4rem 1rem;
  color: #9ca3af;
}

.empty-state .pi {
  font-size: 2rem;
}

.empty-state p {
  margin: 0;
  font-size: 0.9375rem;
}

/* ─── Pagination ─────────────────────────────────────────── */

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}

.page-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  background: #fff;
  border: 1.5px solid var(--blurr-border);
  border-radius: 8px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  transition: border-color 0.15s;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--blurr-primary);
  color: var(--blurr-primary);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: 0.8125rem;
  color: #6b7280;
  font-weight: 500;
}

/* ─── Mobile ─────────────────────────────────────────────── */

@media (max-width: 768px) {
  .col-feature,
  .col-action { display: none; }

  .col-message { max-width: 200px; }

  .filter-search { min-width: 120px; }
}
</style>
