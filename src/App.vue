<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { useRoute } from 'vue-router'
import BusinessLayout from '@/layouts/BusinessLayout.vue'
const route = useRoute()
</script>

<template>
  <el-config-provider :locale="zhCn">
    <router-view v-if="route.meta.public" />
    <BusinessLayout v-else><router-view /></BusinessLayout>
  </el-config-provider>
</template>
