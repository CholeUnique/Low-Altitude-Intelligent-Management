<script setup lang="ts">
defineProps<{ name: 'brand' | 'notification' | 'avatar' | 'drone' | 'task' | 'pending' | 'rate' }>()
</script>

<template>
  <svg v-if="name === 'brand'" viewBox="0 0 40 40" aria-hidden="true">
    <defs><linearGradient id="brand-gradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#55e9ff" /><stop offset="1" stop-color="#087bda" /></linearGradient></defs>
    <path fill="url(#brand-gradient)" d="m20 4 13 8-5 4-8-4-8 4-5-4z" /><path fill="url(#brand-gradient)" d="m8 18 12 6 12-6 5 4-17 9L3 22z" /><path fill="#0a8ee8" d="m11 28 9 5 9-5-9 8z" />
  </svg>
  <svg v-else-if="name === 'notification'" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 22h16l-2-3v-6a6 6 0 0 0-12 0v6z" fill="#7fc9ff" stroke="#bde7ff" stroke-width="1.3" /><path d="M13 25c.5 2 1.4 3 3 3s2.5-1 3-3" fill="none" stroke="#7fc9ff" stroke-width="1.5" stroke-linecap="round" /><path d="M16 5V3" stroke="#bde7ff" stroke-width="1.5" stroke-linecap="round" /></svg>
  <svg v-else-if="name === 'avatar'" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="#0a416f" stroke="#45bdf4" stroke-width="1.5" /><circle cx="16" cy="12" r="4" fill="#a9e5ff" /><path d="M9.5 24c.8-4 3.1-6 6.5-6s5.7 2 6.5 6" fill="#a9e5ff" /></svg>
  <svg v-else-if="name === 'drone'" viewBox="0 0 44 44" aria-hidden="true"><path d="M13 16h18M16 16l4 6m8-6-4 6M13 16l-5-3m23 3 5-3M8 13h-3m34 0h-3" fill="none" stroke="#70e7ff" stroke-width="2.1" stroke-linecap="round" /><path d="M16 20c0-2 2-3 6-3s6 1 6 3v5c0 2-2 3-6 3s-6-1-6-3z" fill="#0c6f9e" stroke="#a4f3ff" stroke-width="1.8" /><path d="M19 28h6l2 4M19 28l-2 4M19 23h6" fill="none" stroke="#84ecff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /><circle cx="5" cy="13" r="2.5" fill="none" stroke="#43c5fb" stroke-width="1.6" /><circle cx="39" cy="13" r="2.5" fill="none" stroke="#43c5fb" stroke-width="1.6" /><path d="M19 32h6" stroke="#b7f7ff" stroke-width="1.8" stroke-linecap="round" /></svg>
  <svg v-else-if="name === 'task'" viewBox="0 0 44 44" aria-hidden="true"><rect x="13" y="9" width="18" height="26" rx="2" fill="none" stroke="#76dfff" stroke-width="2" /><path d="M18 8h8v4h-8zM18 18h8M18 23h8M18 28h6" stroke="#a3efff" stroke-width="2" stroke-linecap="round" /></svg>
  <svg v-else-if="name === 'pending'" viewBox="0 0 44 44" aria-hidden="true"><path d="M12 9h18v26H12z" fill="none" stroke="#76dfff" stroke-width="2" /><path d="M17 16h8M17 21h6" stroke="#a3efff" stroke-width="2" stroke-linecap="round" /><circle cx="29" cy="29" r="8" fill="#0a5686" stroke="#71e4ff" stroke-width="2" /><path d="M29 24v5l3 2" fill="none" stroke="#d1f8ff" stroke-width="1.8" stroke-linecap="round" /></svg>
  <svg v-else viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="14" fill="none" stroke="#72e6ff" stroke-width="3" /><path d="M22 8a14 14 0 1 1-10 4l10 10z" fill="#50cffa" /><circle cx="22" cy="22" r="5" fill="#07395e" /></svg>
</template>
