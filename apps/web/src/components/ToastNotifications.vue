<template>
  <Teleport to="body">
    <div class="toast-region" aria-live="polite" aria-atomic="false">
      <TransitionGroup name="toast" tag="div" class="toast-stack">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast"
          :class="`toast--${toast.type}`"
          role="alert"
          @click="dismiss(toast.id)"
        >
          <div class="toast-icon-wrap">
            <i class="pi" :class="iconClass(toast.type)" />
          </div>
          <div class="toast-content">
            <p class="toast-title">{{ toast.title }}</p>
            <p v-if="toast.message" class="toast-message">{{ toast.message }}</p>
          </div>
          <button class="toast-close" aria-label="Dismiss" @click.stop="dismiss(toast.id)">
            <i class="pi pi-times" />
          </button>
          <div
            class="toast-progress"
            :style="{ animationDuration: `${toast.duration}ms` }"
          />
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useToast } from '../composables/useToast.js'

const { toasts, dismiss } = useToast()

function iconClass(type: string): string {
  switch (type) {
    case 'success': return 'pi-check-circle'
    case 'error':   return 'pi-times-circle'
    case 'warning': return 'pi-exclamation-triangle'
    default:        return 'pi-info-circle'
  }
}
</script>

<style scoped>
.toast-region {
  position: fixed;
  top: 68px;
  right: 1.25rem;
  z-index: 9999;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.toast-stack {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  align-items: flex-end;
}

/* ─── Toast card ───────────────────────────────────────────────────────── */

.toast {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  width: 320px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 0.875rem 1rem 1.125rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1), 0 1px 4px rgba(0, 0, 0, 0.06);
  pointer-events: all;
  cursor: pointer;
  overflow: hidden;
  border-left: 4px solid transparent;
}

.toast--success { border-left-color: #16a34a; }
.toast--error   { border-left-color: #dc2626; }
.toast--warning { border-left-color: #d97706; }
.toast--info    { border-left-color: #2563eb; }

/* ─── Icon ─────────────────────────────────────────────────────────────── */

.toast-icon-wrap {
  flex-shrink: 0;
  margin-top: 1px;
  font-size: 1.125rem;
}

.toast--success .toast-icon-wrap { color: #16a34a; }
.toast--error   .toast-icon-wrap { color: #dc2626; }
.toast--warning .toast-icon-wrap { color: #d97706; }
.toast--info    .toast-icon-wrap { color: #2563eb; }

/* ─── Content ──────────────────────────────────────────────────────────── */

.toast-content {
  flex: 1;
  min-width: 0;
}

.toast-title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 700;
  color: #111827;
  line-height: 1.4;
}

.toast-message {
  margin: 0.2rem 0 0;
  font-size: 0.8125rem;
  color: #6b7280;
  line-height: 1.5;
}

/* ─── Close ────────────────────────────────────────────────────────────── */

.toast-close {
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  font-size: 0.75rem;
  padding: 0.125rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  line-height: 1;
  transition: color 0.15s;
  margin-top: 1px;
}

.toast-close:hover {
  color: #374151;
}

/* ─── Progress bar ─────────────────────────────────────────────────────── */

.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  width: 100%;
  transform-origin: left center;
  animation: shrink linear forwards;
  opacity: 0.35;
}

.toast--success .toast-progress { background: #16a34a; }
.toast--error   .toast-progress { background: #dc2626; }
.toast--warning .toast-progress { background: #d97706; }
.toast--info    .toast-progress { background: #2563eb; }

@keyframes shrink {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}

/* ─── Enter / leave transitions ────────────────────────────────────────── */

.toast-enter-active {
  transition: all 0.28s cubic-bezier(0.34, 1.2, 0.64, 1);
}

.toast-leave-active {
  transition: all 0.2s ease;
  position: absolute;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(calc(100% + 1.25rem));
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(calc(100% + 1.25rem));
}

.toast-move {
  transition: transform 0.25s ease;
}

/* ─── Mobile ────────────────────────────────────────────────────────────── */

@media (max-width: 480px) {
  .toast-region {
    top: auto;
    bottom: 1rem;
    right: 0.75rem;
    left: 0.75rem;
    align-items: stretch;
  }

  .toast-stack {
    align-items: stretch;
  }

  .toast {
    width: 100%;
  }
}
</style>
