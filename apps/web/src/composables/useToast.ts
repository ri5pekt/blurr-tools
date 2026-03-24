import { reactive } from 'vue'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id:       number
  type:     ToastType
  title:    string
  message?: string
  duration: number
}

// Module-level singleton — shared across the entire app
const toasts = reactive<Toast[]>([])
let _id = 0

export function useToast() {
  function add(opts: Omit<Toast, 'id' | 'duration'> & { duration?: number }) {
    const id       = ++_id
    const duration = opts.duration ?? 4500
    toasts.push({ ...opts, id, duration })
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration)
    }
    return id
  }

  function dismiss(id: number) {
    const idx = toasts.findIndex(t => t.id === id)
    if (idx !== -1) toasts.splice(idx, 1)
  }

  function success(title: string, message?: string, duration?: number) {
    return add({ type: 'success', title, message, duration })
  }

  function error(title: string, message?: string, duration?: number) {
    return add({ type: 'error', title, message, duration: duration ?? 6000 })
  }

  function info(title: string, message?: string, duration?: number) {
    return add({ type: 'info', title, message, duration })
  }

  function warning(title: string, message?: string, duration?: number) {
    return add({ type: 'warning', title, message, duration: duration ?? 5500 })
  }

  return { toasts, add, dismiss, success, error, info, warning }
}
