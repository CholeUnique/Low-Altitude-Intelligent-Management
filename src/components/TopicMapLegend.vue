<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import type { TopicDisplayMode } from '@/utils/topic-renderer'

interface LegendSymbol {
  label: string
  color: string
  pattern?: string
  mode: TopicDisplayMode
  geometry: string
  standard?: boolean
  administrative?: boolean
}
interface LegendGroup { key: string; name: string; symbols: LegendSymbol[] }
const props = defineProps<{ groups: LegendGroup[] }>()
const legend = ref<HTMLElement>()
const compact = ref(false)
const density = ref(1)
let observer: ResizeObserver | undefined
let frame = 0

// 始终先测量原字号的单列；真正到达顶部边界后才分列和缩小。
function fitLegend() {
  const element = legend.value, parent = element?.parentElement
  if (!element || !parent) return
  const probe = element.cloneNode(true) as HTMLElement
  probe.setAttribute('aria-hidden', 'true')
  probe.inert = true
  Object.assign(probe.style, { visibility: 'hidden', pointerEvents: 'none', left: '-100000px', top: 'var(--legend-top, var(--left-panel-top, 80px))', bottom: 'auto' })
  parent.appendChild(probe)
  try {
    const top = Math.max(0, parent.getBoundingClientRect().top + parseFloat(getComputedStyle(probe).top))
    const available = Math.max(1, element.getBoundingClientRect().bottom - top)
    const measure = (twoColumns: boolean, scale: number) => {
      probe.classList.toggle('is-compact', twoColumns)
      probe.style.setProperty('--legend-density', String(scale))
      return probe.getBoundingClientRect().height
    }
    const needsColumns = measure(false, 1) > available
    let scale = needsColumns ? 11 / 12 : 1
    if (needsColumns && measure(true, scale) > available) {
      let lower = 0, upper = scale
      // 字号、符号和留白一起收紧，保留全部条目，不滚动、不裁剪。
      for (let step = 0; step < 12; step++) {
        const middle = (lower + upper) / 2
        if (measure(true, middle) <= available) lower = middle
        else upper = middle
      }
      scale = lower
    }
    compact.value = needsColumns
    density.value = scale
  } finally { probe.remove() }
}
function scheduleFit() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(fitLegend)
}
watch(() => props.groups, scheduleFit, { deep: true, flush: 'post' })
watch(legend, element => {
  observer?.disconnect()
  if (element?.parentElement) {
    observer = new ResizeObserver(scheduleFit)
    observer.observe(element.parentElement)
    scheduleFit()
  }
}, { flush: 'post' })
onMounted(() => {
  window.addEventListener('resize', scheduleFit)
  document.fonts?.addEventListener('loadingdone', scheduleFit)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  observer?.disconnect()
  window.removeEventListener('resize', scheduleFit)
  document.fonts?.removeEventListener('loadingdone', scheduleFit)
})
const patternId = useId()
const isPoint = (symbol: LegendSymbol) => /point/i.test(symbol.geometry)
const isLine = (symbol: LegendSymbol) => /polyline/i.test(symbol.geometry)
const repeatsHeading = (group: LegendGroup) => group.symbols.length === 1 && group.symbols[0]?.label === group.name
// 与地图渲染器一致：三调面状图式的细轮廓为灰色，边界模式使用地类色。
const stroke = (symbol: LegendSymbol) => symbol.standard && symbol.mode === 'filled' ? '#605d5c' : symbol.color
</script>

<template>
  <aside v-if="groups.length" ref="legend" class="map-symbol-legend" :class="{ 'is-compact': compact }" :style="{ '--legend-density': density }" aria-label="地图图例">
    <header><h2>图例</h2></header>
    <div class="map-symbol-content" aria-label="图例符号列表">
      <div class="map-symbol-columns">
        <section v-for="(group, groupIndex) in groups" :key="group.key" class="map-legend-group" :aria-label="group.name">
          <h3 v-if="!repeatsHeading(group)">{{ group.name }}</h3>
          <ul class="map-symbol-grid">
            <li v-for="(symbol, index) in group.symbols" :key="index" class="map-symbol-row">
              <svg class="map-symbol" viewBox="0 0 40 26" aria-hidden="true" :data-mode="symbol.mode">
                <defs v-if="symbol.pattern && symbol.mode === 'filled'">
                  <pattern :id="`${patternId}-${groupIndex}-${index}`" width="36" height="36" patternUnits="userSpaceOnUse">
                    <image :href="symbol.pattern" width="36" height="36" />
                  </pattern>
                </defs>
                <!-- 只衬托轮廓，边界模式保持中空，避免将衬底误读为面填充。 -->
                <template v-if="symbol.mode === 'boundary' && !symbol.administrative">
                  <circle v-if="isPoint(symbol)" cx="20" cy="13" r="4.5" fill="none" stroke="#34474b" stroke-width="3.6" />
                  <path v-else-if="isLine(symbol)" d="M 3 18 L 14 10 L 25 15 L 37 7" fill="none" stroke="#34474b" stroke-width="4.2" />
                  <rect v-else x="4" y="4" width="32" height="18" fill="none" stroke="#34474b" stroke-width="3.6" />
                </template>
                <circle v-if="isPoint(symbol)" cx="20" cy="13" r="4.5" :fill="symbol.mode === 'filled' ? symbol.color : 'none'" :stroke="symbol.color" :stroke-width="symbol.mode === 'boundary' ? 2.4 : 1.2" />
                <path v-else-if="isLine(symbol)" d="M 3 18 L 14 10 L 25 15 L 37 7" fill="none" :stroke="symbol.color" :stroke-width="symbol.mode === 'boundary' ? 3 : 2" />
                <template v-else>
                  <rect v-if="symbol.administrative" x="4" y="4" width="32" height="18" fill="none" stroke="#135888" stroke-width="5" />
                  <rect x="4" y="4" width="32" height="18"
                    :fill="symbol.mode === 'boundary' ? 'none' : symbol.pattern ? `url(#${patternId}-${groupIndex}-${index})` : symbol.color"
                    :stroke="stroke(symbol)" :stroke-width="symbol.mode === 'boundary' ? 2.4 : symbol.standard ? .5 : 1.2" />
                </template>
              </svg>
              <span class="map-symbol-label">{{ symbol.label }}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.map-symbol-legend {
  position: absolute;
  z-index: 440;
  left: 20px;
  bottom: 10px;
  width: var(--details-width, 320px);
  max-width: calc(100% - 40px);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: visible;
  border: 0;
  background: transparent;
  color: #f1f6f5;
  text-shadow: 0 1px 2px #001017, 0 0 4px #001017;
  pointer-events: auto;
}
header { flex: none; display: flex; align-items: center; justify-content: center; gap: calc(14px * var(--legend-density)); padding: calc(13px * var(--legend-density)) calc(18px * var(--legend-density)) calc(10px * var(--legend-density)); }
header::before, header::after { content: ''; height: 1px; flex: 1; background: #e3eeec70; }
h2 { margin: 0; font-size: calc(14px * var(--legend-density)); font-weight: 600; line-height: calc(20px * var(--legend-density)); letter-spacing: calc(6px * var(--legend-density)); padding-left: calc(6px * var(--legend-density)); }
/* 面板按内容自然撑高，所有条目直接展示，不限制高度或创建滚动区域。 */
.map-symbol-content { padding: 0 calc(16px * var(--legend-density)) calc(12px * var(--legend-density)); overflow: visible; }
.map-legend-group + .map-legend-group { border-top: 1px solid #e3eeec45; margin-top: calc(10px * var(--legend-density)); padding-top: calc(10px * var(--legend-density)); }
h3 { margin: 0 0 calc(7px * var(--legend-density)); font-size: calc(12px * var(--legend-density)); font-weight: 600; line-height: calc(18px * var(--legend-density)); overflow-wrap: anywhere; break-after: avoid-column; }
.map-symbol-grid { list-style: none; padding: 0; margin: 0; }
.map-symbol-row { display: grid; grid-template-columns: calc(40px * var(--legend-density)) minmax(0, 1fr); align-items: center; column-gap: calc(8px * var(--legend-density)); min-height: calc(28px * var(--legend-density)); break-inside: avoid-column; }
.map-symbol-row + .map-symbol-row { margin-top: calc(4px * var(--legend-density)); }
.map-symbol { display: block; width: calc(40px * var(--legend-density)); height: calc(26px * var(--legend-density)); overflow: visible; filter: drop-shadow(0 1px 1px #001017); }
.map-symbol-label { font-size: calc(12px * var(--legend-density)); line-height: calc(18px * var(--legend-density)); overflow-wrap: anywhere; }
.map-symbol-legend.is-compact { width: min(380px, calc(var(--details-width, 320px) * 1.2)); }
.is-compact header { padding: calc(8px * var(--legend-density)) calc(12px * var(--legend-density)) calc(6px * var(--legend-density)); }
.is-compact .map-symbol-columns { column-count: 2; column-gap: calc(5px * var(--legend-density)); column-rule: 1px solid #e3eeec30; }
.is-compact .map-legend-group + .map-legend-group { margin-top: calc(6px * var(--legend-density)); padding-top: calc(6px * var(--legend-density)); }
.is-compact h3 { margin-bottom: calc(4px * var(--legend-density)); line-height: calc(16px * var(--legend-density)); }
.is-compact .map-symbol-row { grid-template-columns: calc(32px * var(--legend-density)) minmax(0, 1fr); min-height: calc(24px * var(--legend-density)); column-gap: calc(6px * var(--legend-density)); }
.is-compact .map-symbol-row + .map-symbol-row { margin-top: calc(3px * var(--legend-density)); }
.is-compact .map-symbol { width: calc(32px * var(--legend-density)); height: calc(22px * var(--legend-density)); }
</style>
