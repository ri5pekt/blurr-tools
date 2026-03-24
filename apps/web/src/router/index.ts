import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/app',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
    },
    {
      path: '/app',
      component: () => import('../components/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('../views/DashboardView.vue'),
        },
        {
          path: 'logs',
          name: 'logs',
          component: () => import('../views/LogsView.vue'),
        },
        {
          path:      'daily-orders',
          name:      'daily-orders',
          component: () => import('../views/DailyOrdersExportView.vue'),
        },
        {
          path:      'priority-export',
          name:      'priority-export',
          component: () => import('../views/PriorityExportView.vue'),
        },
        {
          path:      'settings',
          name:      'settings',
          component: () => import('../views/SettingsView.vue'),
        },
        {
          path:      'profile',
          name:      'profile',
          component: () => import('../views/ProfileView.vue'),
        },

        { path: ':pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue') },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }
})

export default router
