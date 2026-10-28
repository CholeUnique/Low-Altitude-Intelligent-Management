<script setup lang="ts">
defineProps<{ name: 'profile' | 'users' | 'departments' | 'scenes' | 'permissions' | 'metadata' | 'map-services' }>()
</script>

<template>
  <svg class="management-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <template v-if="name === 'profile'">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="2" /><path d="M5.8 16c.4-1.8 1.5-2.7 3.2-2.7s2.8.9 3.2 2.7M15 9h3M15 12h3M15 15h2" />
    </template>
    <template v-else-if="name === 'users'">
      <circle cx="9" cy="8" r="3" /><path d="M3.5 19v-1.2c0-2.7 2.3-4.5 5.5-4.5s5.5 1.8 5.5 4.5V19zM15.4 5.3a3 3 0 0 1 0 5.6M17 13.6c2.3.4 3.5 2 3.5 4.2V19h-3" />
    </template>
    <template v-else-if="name === 'departments'">
      <rect x="4" y="7" width="16" height="13" rx="1.5" /><path d="M9 20v-4h6v4M8 10.5h1M12 10.5h1M16 10.5h.1M8 13.5h1M12 13.5h1M16 13.5h.1M8 7V4.5h8V7" />
    </template>
    <template v-else-if="name === 'scenes'">
      <path d="m3 6 5.7-2.2 6.6 2.4L21 4v14l-5.7 2.2-6.6-2.4L3 20zM8.7 3.8v14M15.3 6.2v14" /><circle cx="12" cy="11.5" r="1.4" />
    </template>
    <template v-else-if="name === 'permissions'">
      <path d="M12 3.2 19 6v5.2c0 4.4-2.6 7.5-7 9.6-4.4-2.1-7-5.2-7-9.6V6z" /><path d="m9 11.8 2 2 4-4" />
    </template>
    <template v-else-if="name === 'metadata'">
      <ellipse cx="12" cy="6" rx="7.5" ry="2.7" /><path d="M4.5 6v6c0 1.5 3.4 2.7 7.5 2.7s7.5-1.2 7.5-2.7V6M4.5 12v6c0 1.5 3.4 2.7 7.5 2.7s7.5-1.2 7.5-2.7v-6" />
    </template>
    <template v-else>
      <path d="m12 3 9 4.5-9 4.5-9-4.5zM4.5 12 12 15.8l7.5-3.8M4.5 16 12 19.8 19.5 16" />
    </template>
  </svg>
</template>
