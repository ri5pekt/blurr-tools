# UI & Design System

## Brand Colors

| Name | Hex | Usage |
|------|-----|-------|
| Primary | `#b842a9` | Buttons, links, active sidebar items, badges, accents |
| Primary Dark | `#862f7b` | Hover states, pressed buttons, sidebar background |
| Panel Background | `#f5f5f5` | Card backgrounds, content panels, table alternating rows |
| Text | `#000000` / `#1a1a1a` | Body text, labels, headings |
| White | `#ffffff` | Main content area background, cards |
| Error | PrimeVue default red | Error states, destructive actions |
| Success | PrimeVue default green | Completed status badges |

---

## Tech

| Tool | Role |
|------|------|
| **PrimeVue 4** | UI component library |
| **@primevue/themes** (Aura preset) | Theme system — customized with Blurr colors |
| **PrimeIcons** | Icons throughout the UI |
| **Open Sans** | Primary font (Google Fonts) |

---

## PrimeVue Theme Setup

`apps/web/src/theme.ts` — defines the custom Blurr preset extending Aura:

```typescript
import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'

export const BlurrTheme = definePreset(Aura, {
  semantic: {
    primary: {
      50:  '#fdf0fc',
      100: '#f9d6f7',
      200: '#f3adef',
      300: '#ea7de4',
      400: '#d955d3',
      500: '#b842a9',   // ← main brand color
      600: '#9a358d',
      700: '#862f7b',   // ← dark variant
      800: '#6b2562',
      900: '#531d4c',
      950: '#3a1235',
    },
  },
})
```

This means all PrimeVue components (`Button`, `Badge`, `Select`, focus rings, etc.) automatically use Blurr purple instead of the Aura default.

---

## App Shell Layout

Mirrors `ob-inventory`'s `AppLayout.vue`. Structure:

```
┌─────────────────────────────────────────────────────┐
│  HEADER (56px, white, border-bottom)                │
│  [☰ burger]  [Logo + "Blurr Tools"]  [User menu ▾] │
├───────────┬─────────────────────────────────────────┤
│           │                                         │
│  SIDEBAR  │   MAIN CONTENT AREA                     │
│  (fixed,  │   <RouterView />                        │
│   dark    │   (scrollable)                          │
│   purple) │                                         │
│           │                                         │
└───────────┴─────────────────────────────────────────┘
```

### Sidebar
- **Background:** `#862f7b` (Primary Dark)
- **Width:** 240px (desktop), off-canvas on mobile
- **Active item:** `#b842a9` left border + lighter background
- **Text:** white
- **Sections:** can be grouped (e.g. "Exports", "Settings")
- **Items:** icon (PrimeIcons) + label + `RouterLink`
- **Brand area (top of sidebar):**
  ```
  ┌──────────────────────┐
  │   [logo]             │
  │   Blurr Tools        │
  │   v0.1.0             │  ← from apps/web/src/config/version.ts
  └──────────────────────┘
  ```
  Version is imported from `version.ts` and never hardcoded in the template:
  ```typescript
  // apps/web/src/config/version.ts
  export const APP_VERSION = '0.1.0'
  ```
  ```vue
  <!-- AppLayout.vue -->
  <span class="app-version">v{{ APP_VERSION }}</span>
  ```

### Header
- **Background:** white
- **Border-bottom:** 1px solid `#e5e7eb`
- **Left:** hamburger (mobile) + logo + "Blurr Tools" wordmark
- **Right:** user avatar/initials, name, role chip, logout

### Content Area
- **Background:** white
- **Padding:** 24px (desktop), 16px (mobile)
- **Max-width:** none (full width)

---

## Mobile Responsiveness

Following ob-inventory's approach:

- **≤ 768px:** Sidebar collapses to off-canvas; hamburger in header triggers it; backdrop overlay closes it
- **≤ 480px:** Reduced padding, stacked layouts, full-width buttons
- **Viewport:** `100dvh` to handle mobile browser chrome
- **Touch:** ensure tap targets ≥ 44px

---

## Pages

### Login Page (`/login`)
- Full-page gradient background: `#862f7b` → `#b842a9`
- Centered white card, rounded corners, drop shadow
- Blurr logo / brand mark at top
- Email + Password fields (PrimeVue `InputText`)
- "Sign In" button (primary)
- Error message on invalid credentials

### Dashboard (`/app`)
- Heading: "Blurr Tools"
- Grid of **feature cards** (3 columns → 2 → 1 on smaller screens)
- Each card: icon, feature name, short description, "Open" link
- Background: `#f5f5f5` page background, white cards

### Feature Screen (e.g. `/app/daily-orders`)
- Page header: feature name + description
- **Control panel** (white card, `#f5f5f5` panel bg): inputs and action button
- **Current job status** (if a job is running/recent): `JobStatusCard.vue`
- **Job history** (collapsible or below): `JobLogsPanel.vue`

---

## Reusable Components

### `JobStatusCard.vue`
Displays the status of a single job. Used inline after triggering an export.

Props: `job: Job`

Shows:
- Status badge (color-coded: pending=grey, running=blue, completed=green, failed=red)
- Progress bar (when running, 0–100%)
- Start time / duration
- Error message (when failed)
- Result summary (when completed, e.g. "247 orders written to Sheet")
- Link to Google Sheet (when applicable, from `job.result`)

### `JobLogsPanel.vue`
Job history list for a specific feature. Polls every 5s when a job is running.

Props: `feature: string`

Shows: paginated table of past jobs with status badge, date, triggered by (user or "Scheduled"), duration, quick-view expand.

---

## Status Badges

| Status | Color |
|--------|-------|
| `pending` | Grey |
| `running` | Blue (pulsing) |
| `completed` | Green |
| `failed` | Red |
| `cancelled` | Orange |

---

## CSS Variables (global `style.css`)

```css
:root {
  --blurr-primary: #b842a9;
  --blurr-primary-dark: #862f7b;
  --blurr-panel-bg: #f5f5f5;
  --blurr-text: #1a1a1a;
  --blurr-sidebar-bg: #862f7b;
  --blurr-sidebar-text: #ffffff;
  --blurr-sidebar-active: #b842a9;
}
```
