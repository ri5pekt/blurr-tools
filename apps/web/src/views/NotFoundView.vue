<template>
  <div class="not-found">
    <div class="icon-wrap">
      <i class="pi pi-hourglass" />
    </div>
    <h2>Coming soon</h2>
    <p>This feature is planned but hasn't been built yet.</p>
    <RouterLink to="/app" class="back-link">
      <i class="pi pi-arrow-left" /> Back to Dashboard
    </RouterLink>
  </div>
</template>

<style scoped>
.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 0.75rem;
  text-align: center;
}

.icon-wrap {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: #fdf0fc;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;
}

.icon-wrap .pi {
  font-size: 1.75rem;
  color: var(--blurr-primary);
}

h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
}

p {
  margin: 0;
  color: #6b7280;
  font-size: 0.9375rem;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--blurr-primary);
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}
</style>
