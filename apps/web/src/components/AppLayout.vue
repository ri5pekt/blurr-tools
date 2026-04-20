<template>
  <div class="app-layout">

    <!-- Mobile backdrop -->
    <Transition name="backdrop">
      <div
        v-if="sidebarOpen"
        class="sidebar-backdrop"
        @click="sidebarOpen = false"
      />
    </Transition>

    <!-- ─── Sidebar ───────────────────────────────────────────────────── -->
    <aside class="sidebar" :class="{ 'sidebar--open': sidebarOpen }">

      <!-- Brand -->
      <div class="sidebar-brand">
        <div class="brand-logo">B</div>
        <div class="brand-info">
          <span class="brand-name">Blurr Tools</span>
          <span class="brand-version">v{{ APP_VERSION }}</span>
        </div>
      </div>

      <!-- Nav -->
      <nav class="sidebar-nav">
        <template v-for="group in navGroups" :key="group.label">
          <p v-if="group.label" class="nav-group-label">{{ group.label }}</p>
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            :class="{ 'nav-item--active': isNavActive(item) }"
            @click="sidebarOpen = false"
          >
            <i :class="['pi', item.icon, 'nav-icon']" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </template>
      </nav>

    </aside>

    <!-- ─── Main wrapper ──────────────────────────────────────────────── -->
    <div class="main-wrapper">

      <!-- Header -->
      <header class="app-header">
        <div class="header-left">
          <button class="hamburger" aria-label="Toggle sidebar" @click="sidebarOpen = !sidebarOpen">
            <i class="pi pi-bars" />
          </button>
          <span class="header-wordmark">Blurr Tools</span>
        </div>

        <div class="header-right">
          <RouterLink to="/app/profile" class="user-badge" title="My Profile">
            <div class="user-avatar" :style="{ background: avatarColor }">
              {{ initials }}
            </div>
            <div class="user-details">
              <span class="user-name">{{ auth.user?.name }}</span>
              <span class="user-role">{{ auth.user?.role }}</span>
            </div>
          </RouterLink>
          <button class="logout-btn" title="Sign out" @click="handleLogout">
            <i class="pi pi-sign-out" />
          </button>
        </div>
      </header>

      <!-- Page content -->
      <main class="content-area">
        <RouterView />
      </main>

    </div>
  </div>

  <!-- Global toast notifications -->
  <ToastNotifications />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { APP_VERSION } from '../config/version.js'
import ToastNotifications from './ToastNotifications.vue'

const auth   = useAuthStore()
const route  = useRoute()
const router = useRouter()

const sidebarOpen = ref(false)

// ─── Navigation ────────────────────────────────────────────────────────────

interface NavItem {
  to:    string
  label: string
  icon:  string
  exact?: boolean
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups = computed<NavGroup[]>(() => {
  const groups: NavGroup[] = [
    {
      label: '',
      items: [
        { to: '/app',      label: 'Dashboard', icon: 'pi-home', exact: true },
        { to: '/app/logs', label: 'Logs',      icon: 'pi-list' },
      ],
    },
    {
      label: 'Exports',
      items: [
        { to: '/app/daily-orders',    label: 'Daily Orders',    icon: 'pi-calendar' },
        { to: '/app/priority-export', label: 'Priority Export', icon: 'pi-file-export' },
      ],
    },
  ]

  if (auth.user?.role === 'admin') {
    groups.push({
      label: 'Admin',
      items: [
        { to: '/app/settings', label: 'Settings', icon: 'pi-cog' },
      ],
    })
  }

  groups.push({
    label: 'Account',
    items: [
      { to: '/app/profile', label: 'Profile', icon: 'pi-user' },
    ],
  })

  return groups
})

function isNavActive(item: NavItem): boolean {
  if (item.exact) return route.path === item.to
  return route.path === item.to || route.path.startsWith(item.to + '/')
}

// ─── User ───────────────────────────────────────────────────────────────────

const initials = computed(() => {
  const name = auth.user?.name ?? ''
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
})

const avatarColor = computed(() => {
  const colors = ['#b842a9', '#862f7b', '#7c3aed', '#0891b2', '#0d9488']
  const name = auth.user?.name ?? ''
  return colors[name.charCodeAt(0) % colors.length]
})

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<style scoped>
/* ─── Layout container ────────────────────────────────────────────────── */

.app-layout {
  display: flex;
  min-height: 100dvh;
}

/* ─── Sidebar ─────────────────────────────────────────────────────────── */

.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: 240px;
  height: 100dvh;
  background: var(--blurr-sidebar-bg);
  display: flex;
  flex-direction: column;
  z-index: 100;
  overflow-y: auto;
  overflow-x: hidden;
  transition: transform 0.25s ease;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.brand-logo {
  width: 38px;
  height: 38px;
  border-radius: 9px;
  background: linear-gradient(135deg, #b842a9, #862f7b);
  box-shadow: 0 2px 8px rgba(184, 66, 169, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.125rem;
  font-weight: 800;
  color: #fff;
  flex-shrink: 0;
}

.brand-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.brand-name {
  font-size: 0.9375rem;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.2;
}

.brand-version {
  font-size: 0.625rem;
  font-weight: 600;
  color: #fff;
  background: rgba(184, 66, 169, 0.45);
  border: 1px solid rgba(184, 66, 169, 0.6);
  border-radius: 99px;
  padding: 0.05rem 0.4rem;
  display: inline-block;
  line-height: 1.6;
  letter-spacing: 0.02em;
}

/* ─── Nav ─────────────────────────────────────────────────────────────── */

.sidebar-nav {
  padding: 0.75rem 0;
  flex: 1;
}

.nav-group-label {
  margin: 0.75rem 1rem 0.25rem;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.4);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.625rem 1rem;
  margin: 1px 0.5rem;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.nav-item--active {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  font-weight: 600;
  border-left: 3px solid rgba(255, 255, 255, 0.8);
  padding-left: calc(1rem - 3px);
}

.nav-icon {
  font-size: 1rem;
  flex-shrink: 0;
  opacity: 0.85;
}

.nav-item--active .nav-icon {
  opacity: 1;
}

/* ─── Main wrapper ────────────────────────────────────────────────────── */

.main-wrapper {
  margin-left: 240px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  min-width: 0;
}

/* ─── Header ──────────────────────────────────────────────────────────── */

.app-header {
  position: sticky;
  top: 0;
  z-index: 50;
  height: 56px;
  background: #ffffff;
  border-bottom: 1px solid var(--blurr-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.25rem;
  gap: 1rem;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.hamburger {
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  color: #374151;
  font-size: 1.125rem;
  padding: 0.25rem;
  border-radius: 4px;
  line-height: 1;
  transition: color 0.15s;
}

.hamburger:hover {
  color: #111827;
}

.header-wordmark {
  font-size: 0.9375rem;
  font-weight: 700;
  color: #111827;
  display: none;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.user-badge {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  text-decoration: none;
  border-radius: 8px;
  padding: 0.25rem 0.5rem;
  margin: -0.25rem -0.5rem;
  transition: background 0.15s;
}

.user-badge:hover {
  background: #f3f4f6;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: #ffffff;
  flex-shrink: 0;
}

.user-details {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.user-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #111827;
  line-height: 1.2;
}

.user-role {
  font-size: 0.6875rem;
  color: var(--blurr-primary);
  font-weight: 600;
  text-transform: capitalize;
}

.logout-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  font-size: 1rem;
  padding: 0.375rem;
  border-radius: 6px;
  display: flex;
  align-items: center;
  transition: color 0.15s, background 0.15s;
  line-height: 1;
}

.logout-btn:hover {
  color: #ef4444;
  background: #fef2f2;
}

/* ─── Content area ────────────────────────────────────────────────────── */

.content-area {
  flex: 1;
  padding: 1.5rem;
  background: var(--blurr-panel-bg);
  overflow-y: auto;
}

/* ─── Backdrop ────────────────────────────────────────────────────────── */

.sidebar-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 99;
}

.backdrop-enter-active,
.backdrop-leave-active {
  transition: opacity 0.25s;
}
.backdrop-enter-from,
.backdrop-leave-to {
  opacity: 0;
}

/* ─── Mobile ──────────────────────────────────────────────────────────── */

@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
  }

  .sidebar--open {
    transform: translateX(0);
  }

  .main-wrapper {
    margin-left: 0;
  }

  .hamburger {
    display: flex;
  }

  .header-wordmark {
    display: block;
  }

  .user-details {
    display: none;
  }

  .content-area {
    padding: 1rem;
  }
}
</style>
