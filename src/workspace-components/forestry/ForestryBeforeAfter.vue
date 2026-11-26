<script setup lang="ts">
import { computed } from 'vue'
import SpotDistributionMap, { type ComparisonPeriod } from '@/workspace-components/spot-identification/SpotDistributionMap.vue'
import type { GovernanceTaskComparisonImage, TaskAbnormal } from '@/api/governance-task'

/**
 * 林业执法「实地考察 / 科室验收结案」的整改前后影像对比。
 * 只读取任务已关联的参考影像与图斑现场照片，没有影像时明确显示暂无，不猜测整改效果。
 */
const props = defineProps<{ images?: GovernanceTaskComparisonImage[]; spot?: TaskAbnormal; hasEvidence?: boolean; title?: string }>()

const usable = computed(() => (props.images || []).filter((image) => Boolean(image.mapService || image.imageUrl)))
const before = computed(() => usable.value[0])
const after = computed(() => (usable.value.length > 1 ? usable.value[usable.value.length - 1] : undefined))

function periodOf(image?: GovernanceTaskComparisonImage): ComparisonPeriod {
  if (!image) return { number: 1, label: '暂无影像', kind: 'empty' }
  return {
    number: 1,
    label: image.label,
    kind: image.mapService ? 'map-service' : 'image',
    mapService: image.mapService,
    imageUrl: image.imageUrl,
  }
}
</script>

<template>
  <section class="forestry-compare" aria-label="整改前后影像对比">
    <header>
      <b>{{ title || '整改前后影像对比' }}</b>
      <small>核对两期影像；现场照片与附图请在右侧「材料」区上传，随节点一并保存。</small>
      <em v-if="!hasEvidence" class="evidence-hint">尚未上传附图材料</em>
    </header>
    <div class="compare-panes">
      <figure>
        <div class="pane">
          <SpotDistributionMap v-if="before?.mapService && spot" :spot="spot" :period="periodOf(before)" />
          <img v-else-if="before?.imageUrl" :src="before.imageUrl" :alt="before.label" />
          <span v-else>暂无整改前影像</span>
        </div>
        <figcaption>整改前 · {{ before?.label || '暂无影像' }}</figcaption>
      </figure>
      <figure>
        <div class="pane">
          <SpotDistributionMap v-if="after?.mapService && spot" :spot="spot" :period="periodOf(after)" />
          <img v-else-if="after?.imageUrl" :src="after.imageUrl" :alt="after.label" />
          <img v-else-if="spot?.imageUrl" :src="spot.imageUrl" :alt="spot.title" />
          <span v-else>暂无整改后影像</span>
        </div>
        <figcaption>整改后／最近影像 · {{ after?.label || (spot?.imageUrl ? '图斑现场照片' : '暂无影像') }}</figcaption>
      </figure>
    </div>
  </section>
</template>

<style scoped>
.forestry-compare { flex: 0 0 auto; display: grid; gap: 8px; padding: 10px 12px; border: 1px solid #dfe9f1; border-radius: 6px; background: #fff; }
.forestry-compare header { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.forestry-compare header b { color: #294a61; font-size: 13px; }
.forestry-compare header small { color: #8195a6; font-size: 12px; }
.evidence-hint { margin-left: auto; padding: 2px 8px; border: 1px solid #f0c987; border-radius: 10px; color: #a9741f; font-size: 12px; font-style: normal; white-space: nowrap; }
.compare-panes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.compare-panes figure { margin: 0; min-width: 0; }
.pane { position: relative; height: 150px; display: grid; place-items: center; overflow: hidden; border: 1px solid #e3edf4; border-radius: 5px; background: #eef3f7; color: #8195a6; font-size: 12px; }
.pane img { width: 100%; height: 100%; object-fit: contain; }
.pane :deep(.spot-map) { width: 100%; height: 100%; min-height: 0; border: 0; }
.compare-panes figcaption { margin-top: 5px; overflow: hidden; color: #6f8b9d; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 900px) { .pane { height: 120px; } }
</style>
