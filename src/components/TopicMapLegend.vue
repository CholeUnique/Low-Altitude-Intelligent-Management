<script setup lang="ts">
import { useId } from 'vue'
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
defineProps<{ groups: LegendGroup[] }>()
const patternId = useId()
const isPoint = (symbol: LegendSymbol) => /point/i.test(symbol.geometry)
const isLine = (symbol: LegendSymbol) => /polyline/i.test(symbol.geometry)
const repeatsHeading = (group: LegendGroup) => group.symbols.length === 1 && group.symbols[0]?.label === group.name
// 与地图渲染器一致：三调面状图式的细轮廓为灰色，边界模式使用地类色。
const stroke = (symbol: LegendSymbol) => symbol.standard && symbol.mode === 'filled' ? '#605d5c' : symbol.color
</script>

<template>
  <aside v-if="groups.length" class="map-symbol-legend" aria-label="地图图例">
    <header><h2>图例</h2></header>
    <div class="map-symbol-content" aria-label="图例符号列表">
      <section v-for="(group, groupIndex) in groups" :key="group.key" class="map-legend-group" :aria-label="group.name">
        <h3 v-if="!repeatsHeading(group)">{{ group.name }}</h3>
        <ul class="map-symbol-grid">
          <li v-for="(symbol, index) in group.symbols" :key="index" class="map-symbol-row" :class="{ 'wide-label': symbol.label.length > 8 }">
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
  </aside>
</template>

<style scoped>
.map-symbol-legend {
  position: absolute;
  z-index: 440;
  left: 20px;
  bottom: 10px;
  width: var(--details-width);
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
header { flex: none; display: flex; align-items: center; justify-content: center; gap: 14px; padding: 13px 18px 10px; }
header::before, header::after { content: ''; height: 1px; flex: 1; background: #e3eeec70; }
h2 { margin: 0; font-size: 14px; font-weight: 600; line-height: 20px; letter-spacing: 6px; padding-left: 6px; }
/* 图例不做滚动：内容区不限制高度、不裁剪，面板随符号数量完整撑开。 */
.map-symbol-content { padding: 0 16px 12px; overflow: visible; max-height: none; }
.map-legend-group + .map-legend-group { border-top: 1px solid #e3eeec45; margin-top: 10px; padding-top: 10px; }
h3 { margin: 0 0 7px; font-size: 12px; font-weight: 600; line-height: 18px; overflow-wrap: anywhere; }
.map-symbol-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 12px; list-style: none; padding: 0; margin: 0; }
.map-symbol-row { display: grid; grid-template-columns: 40px minmax(0, 1fr); align-items: center; column-gap: 8px; min-height: 28px; }
.map-symbol-row.wide-label { grid-column: 1 / -1; }
.map-symbol { display: block; width: 40px; height: 26px; overflow: visible; filter: drop-shadow(0 1px 1px #001017); }
.map-symbol-label { font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
</style>
