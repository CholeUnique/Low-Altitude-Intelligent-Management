<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { useRoute } from 'vue-router'
import { watchEffect } from 'vue'
import { useUserStore } from '@/stores/user'
import { getPlatformBrand } from '@/utils/platform-brand'
import BusinessLayout from '@/layouts/BusinessLayout.vue'
const route = useRoute()
const user = useUserStore()
watchEffect(() => {
  document.title = getPlatformBrand(route.meta.public ? undefined : user.organizationId).title
})
</script>

<template>
  <el-config-provider :locale="zhCn">
    <router-view v-if="route.meta.public" />
    <BusinessLayout v-else><router-view /></BusinessLayout>
  </el-config-provider>
</template>
