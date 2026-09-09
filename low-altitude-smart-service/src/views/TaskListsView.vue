<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import BasicLayout from '@/layouts/BasicLayout.vue'
import { tasks } from '@/mocks/data'

const router = useRouter()
const keyword = ref('')
const status = ref('')
const filteredTasks = computed(() => tasks.filter((item) =>
  (!keyword.value || `${item.name}${item.id}${item.area}`.includes(keyword.value))
  && (!status.value || item.status === status.value),
))
</script>

<template>
  <BasicLayout>
    <div class="page-heading"><div><h2>巡查任务总览</h2><p>统一管理巡查、核查、复核及归档任务</p></div><el-button type="primary">＋ 新建巡查任务</el-button></div>
    <section class="panel filter-panel">
      <el-input v-model="keyword" clearable placeholder="搜索任务名称、编号或区域" />
      <el-select v-model="status" clearable placeholder="任务状态"><el-option v-for="item in ['巡航采集中','待研判','待下发','待复核','已归档']" :key="item" :label="item" :value="item" /></el-select>
      <el-select placeholder="业务领域"><el-option label="林业监管" value="forestry" /></el-select>
      <el-date-picker type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" />
    </section>
    <section class="panel table-panel">
      <div class="panel-title"><b>任务列表</b><span>共 {{ filteredTasks.length }} 项任务</span></div>
      <el-table :data="filteredTasks" stripe>
        <el-table-column prop="id" label="任务编号" width="170" />
        <el-table-column label="任务信息" min-width="260"><template #default="{ row }"><b>{{ row.name }}</b><small class="table-sub">{{ row.area }} · {{ row.field }}</small></template></el-table-column>
        <el-table-column prop="owner" label="责任单位" width="130" />
        <el-table-column label="进度" width="150"><template #default="{ row }"><el-progress :percentage="row.progress" /></template></el-table-column>
        <el-table-column label="状态" width="130"><template #default="{ row }"><el-tag effect="light">{{ row.status }}</el-tag></template></el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="170" />
        <el-table-column label="操作" width="180" fixed="right"><template #default="{ row }"><el-button link type="primary">查看</el-button><el-button link type="primary" @click="router.push(`/workspace/forestry/${row.id}`)">进入工作台</el-button></template></el-table-column>
      </el-table>
      <div class="pagination"><el-pagination background layout="total, prev, pager, next" :total="filteredTasks.length" /></div>
    </section>
  </BasicLayout>
</template>
