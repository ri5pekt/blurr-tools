<template>
  <div class="dashboard">

    <div class="page-header">
      <h1>Dashboard</h1>
      <p>Welcome back, {{ auth.user?.name }}.</p>
    </div>

    <div class="feature-grid">
      <RouterLink
        v-for="feature in features"
        :key="feature.to"
        :to="feature.to"
        class="feature-card"
      >
        <div class="card-icon-wrap" :style="{ background: feature.iconBg }">
          <i :class="['pi', feature.icon]" :style="{ color: feature.iconColor }" />
        </div>
        <div class="card-body">
          <h3>{{ feature.name }}</h3>
          <p>{{ feature.description }}</p>
        </div>
        <div class="card-footer">
          <span class="card-open">
            Open <i class="pi pi-arrow-right" />
          </span>
        </div>
      </RouterLink>
    </div>

  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()

const features = [
  {
    to:          '/app/daily-orders',
    icon:        'pi-calendar',
    iconColor:   '#b842a9',
    iconBg:      '#fdf0fc',
    name:        'Daily Orders Export',
    description: 'Fetch Shopify orders for a selected date and write them to Google Sheets.',
  },
  {
    to:          '/app/logs',
    icon:        'pi-list',
    iconColor:   '#2563eb',
    iconBg:      '#eff6ff',
    name:        'System Logs',
    description: 'View all actions, job runs, errors, and scheduled triggers in one place.',
  },
  {
    to:          '/app/settings',
    icon:        'pi-cog',
    iconColor:   '#4b5563',
    iconBg:      '#f3f4f6',
    name:        'Settings',
    description: 'Manage Shopify credentials, Google Sheets config, users, and scheduled exports.',
  },
]
</script>

<style scoped>
.dashboard {
  max-width: 1100px;
}

/* ─── Header ──────────────────────────────────────────────────────────── */

.page-header {
  margin-bottom: 2rem;
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

/* ─── Grid ────────────────────────────────────────────────────────────── */

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.25rem;
}

/* ─── Card ────────────────────────────────────────────────────────────── */

.feature-card {
  background: #ffffff;
  border: 1px solid var(--blurr-border);
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.18s, border-color 0.18s, transform 0.15s;
}

.feature-card:hover {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  border-color: #d1d5db;
  transform: translateY(-2px);
}

.card-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-icon-wrap .pi {
  font-size: 1.375rem;
}

.card-body {
  flex: 1;
}

.card-body h3 {
  margin: 0 0 0.375rem;
  font-size: 1rem;
  font-weight: 700;
  color: #111827;
}

.card-body p {
  margin: 0;
  font-size: 0.8125rem;
  color: #6b7280;
  line-height: 1.55;
}

.card-footer {
  border-top: 1px solid var(--blurr-border);
  padding-top: 0.875rem;
  margin-top: auto;
}

.card-open {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--blurr-primary);
  transition: gap 0.15s;
}

.feature-card:hover .card-open {
  gap: 0.5rem;
}

/* ─── Responsive ──────────────────────────────────────────────────────── */

@media (max-width: 900px) {
  .feature-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 540px) {
  .feature-grid {
    grid-template-columns: 1fr;
  }
}
</style>
