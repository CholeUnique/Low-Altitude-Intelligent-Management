<script setup lang="ts">
import { computed } from 'vue'
import type { PortalTask, WorkspaceNodeConfig } from '@/types'
import { useBackendTaskData } from '@/workspace-components/shared/use-backend-task'
import TaskRangeMap from '@/components/TaskRangeMap.vue'

/**
 * 土地供后巡查「项目匹配」：展示该巡查任务已关联的地块范围、参考影像与素材。
 * 供地合同、受让单位、出让面积等字段后端暂无接口，页面明确标注而不填充演示值。
 */
const props = defineProps<{ task?: PortalTask; sceneName?: string; node?: WorkspaceNodeConfig }>()
const source = computed(() => props.task?.id)
const { task, detail, geometry, abnormals, images, results, loading, errors, text, load } = useBackendTaskData({ get taskId() { return source.value } })

const summaries = computed(() => [
  { icon: '单', label: '任务编号', value: task.value?.taskNo },
  { icon: '部', label: '主责部门', value: task.value?.deptName },
  { icon: '范', label: '地块范围', value: geometry.value.features.length ? `${geometry.value.features.length} 个要素` : '暂无范围' },
  { icon: '斑', label: '关联图斑', value: `${abnormals.value.length} 个` },
  { icon: '影', label: '参考影像', value: `${task.value?.comparisonImages?.length || 0} 期` },
  { icon: '材', label: '成果批次', value: `${results.value.length} 批` },
])
const relations = computed<Array<[string, unknown]>>(() => [
  ['关联类型', task.value?.refType],
  ['关联对象', task.value?.refId],
  ['关联说明', detail.value?.refSummary],
  ['范围名称', task.value?.rangeName],
  ['范围面积', task.value?.rangeArea == null ? undefined : `${task.value.rangeArea} ${task.value.rangeAreaUnit || ''}`],
  ['计划开始', task.value?.planStartTime],
  ['计划结束', task.value?.planEndTime],
  ['实际开始', task.value?.actualStartTime],
  ['实际结束', task.value?.actualEndTime],
])
const missing = [
  '供地合同编号、受让单位、出让面积与用途',
  '约定开工/竣工日期与投资强度',
  '合同附件与出让公告',
]
</script>

<template>
  <div class="supply-page">
    <section class="summary-strip">
      <article v-for="item in summaries" :key="item.label" class="summary-card"><i>{{ item.icon }}</i><span><small>{{ item.label }}</small><b :title="text(item.value)">{{ text(item.value) }}</b></span></article>
    </section>
    <p v-if="errors.length" class="page-error" role="alert">{{ errors.join('；') }}</p>
    <div class="supply-columns">
      <section class="panel map-panel">
        <h3>地块范围</h3>
        <div class="map-body">
          <TaskRangeMap v-if="geometry.features.length" :geo-json="geometry" :abnormal-points="abnormals" :fit-abnormal-points="true" :fit-padding="4" show-dom-imagery />
          <p v-else class="empty">任务尚未关联地块范围，请先在任务中绘制或导入</p>
        </div>
      </section>
      <section class="panel relation-panel">
        <h3>关联信息</h3>
        <dl class="pairs"><template v-for="[label, value] in relations" :key="label"><dt>{{ label }}</dt><dd>{{ text(value) }}</dd></template></dl>
        <div class="missing">
          <b>待后端补充的合同字段</b>
          <ul><li v-for="item in missing" :key="item">{{ item }}</li></ul>
          <small>建议接口：`POST /v1/biz/supply/contract/{page,detail}`</small>
        </div>
      </section>
      <section class="panel imagery-panel">
        <h3>参考影像与素材 <small>{{ (task?.comparisonImages?.length || 0) + images.length }} 项</small></h3>
        <ul class="imagery-list">
          <li v-for="image in task?.comparisonImages || []" :key="image.id"><b>{{ image.label }}</b><small>{{ image.mapService ? '地图服务' : image.imageUrl ? '影像文件' : '暂无地址' }}</small></li>
          <li v-for="image in images" :key="image.id"><b>{{ image.fileName || image.id }}</b><small>{{ text(image.shootTime) }}</small></li>
        </ul>
        <p v-if="!(task?.comparisonImages?.length || images.length)" class="empty">暂无参考影像或巡查素材</p>
      </section>
    </div>
    <footer class="page-footer"><span role="status">{{ loading ? '正在读取真实任务…' : '数据来自后端任务、范围、影像与成果接口' }}</span><button type="button" :disabled="loading" @click="load">刷新</button></footer>
  </div>
</template>

<style scoped>
.supply-page { height: 100%; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 12px; overflow: hidden; background: #eef3f8; color: #29475a; }
.summary-strip { flex: 0 0 auto; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
.summary-card { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 10px 12px; border: 1px solid #d9e3ee; border-radius: 7px; background: #fff; }
.summary-card i { width: 32px; height: 32px; flex: 0 0 32px; display: grid; place-items: center; border-radius: 7px; color: #1687ef; background: #e8f2fd; font-style: normal; font-size: 14px; }
.summary-card small { display: block; color: #8195a6; font-size: 12px; }
.summary-card b { display: block; overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.supply-columns { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(280px, .9fr) minmax(240px, .8fr); gap: 12px; }
.panel { min-height: 0; display: flex; flex-direction: column; overflow: hidden; padding: 12px; border: 1px solid #dde7ef; border-radius: 7px; background: #fff; }
.panel h3 { flex: 0 0 auto; margin: 0 0 10px; color: #1f3d52; font-size: 14px; }
.panel h3 small { margin-left: 6px; color: #8195a6; font-weight: 400; }
.map-body { flex: 1; min-height: 0; overflow: hidden; border-radius: 6px; }
.map-body :deep(.task-range-map) { height: 100%; }
.pairs { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 8px; margin: 0; overflow: auto; font-size: 12px; }
.pairs dt { color: #8195a6; }
.pairs dd { margin: 0; overflow-wrap: anywhere; }
.missing { flex: 0 0 auto; margin-top: 12px; padding: 10px; border: 1px dashed #d9c48a; border-radius: 6px; color: #8a6d24; background: #fdf8ea; font-size: 12px; }
.missing ul { margin: 6px 0; padding-left: 18px; line-height: 1.7; }
.missing small { color: #9c8748; }
.imagery-list { margin: 0; padding: 0; overflow: auto; list-style: none; font-size: 12px; }
.imagery-list li { display: grid; gap: 3px; padding: 8px 0; border-bottom: 1px solid #edf2f6; }
.imagery-list b { overflow-wrap: anywhere; font-weight: 500; }
.imagery-list small { color: #8195a6; }
.empty { margin: 12px 0; color: #8195a6; font-size: 12px; text-align: center; }
.page-error { margin: 0; padding: 8px 10px; border-radius: 6px; color: #b04747; background: #fdeeee; font-size: 12px; }
.page-footer { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; font-size: 12px; color: #6b8394; }
.page-footer span { margin-right: auto; }
.page-footer button { height: 30px; padding: 0 14px; border: 1px solid #c8d9e4; border-radius: 4px; color: #426174; background: #fff; cursor: pointer; }
.page-footer button:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 1280px) { .supply-columns { grid-template-columns: minmax(0, 1fr) minmax(260px, .9fr); } .imagery-panel { display: none; } .summary-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
