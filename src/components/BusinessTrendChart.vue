<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { init, use, type EChartsType } from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { BusinessTrendItem } from '@/api/business-statistics'

use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{ data: BusinessTrendItem[] }>()
const container = ref<HTMLElement>()
let chart: EChartsType | undefined
let resizeObserver: ResizeObserver | undefined

function render() {
  if (!chart) return
  chart.setOption({
    animationDuration: 500,
    grid: { top: 38, left: 38, right: 30, bottom: 34 },
    tooltip: { trigger: 'axis', backgroundColor: '#061d35ee', borderColor: '#147ca3', textStyle: { color: '#dff9ff', fontSize: 12 } },
    legend: { top: 4, left: 'center', itemWidth: 13, itemHeight: 8, itemGap: 15, textStyle: { color: '#a9d5e5', fontSize: 12 }, data: ['任务数', '异常图斑'] },
    xAxis: {
      type: 'category',
      data: props.data.map((item) => item.date.slice(5).replace('-', '/')),
      axisLabel: { color: '#83aabd', fontSize: 11 }, axisLine: { lineStyle: { color: '#16465f' } }, axisTick: { show: false },
    },
    yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#638ba0', fontSize: 10 }, splitLine: { lineStyle: { color: '#123951', type: 'dashed' } } },
    series: [
      { name: '任务数', type: 'bar', data: props.data.map((item) => item.taskCount), barWidth: 13, itemStyle: { color: '#169de8' } },
      // 后端返回的是按“日”离散汇总值；不可使用平滑插值，否则会生成并不存在的中间趋势。
      { name: '异常图斑', type: 'line', data: props.data.map((item) => item.abnormalCount), symbolSize: 6, smooth: false, connectNulls: false, lineStyle: { width: 2, color: '#ffb83f' }, itemStyle: { color: '#ffca67' } },
    ],
  }, true)
}

onMounted(() => {
  if (!container.value) return
  chart = init(container.value)
  render()
  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(container.value)
})

watch(() => props.data, render, { deep: true })
onBeforeUnmount(() => { resizeObserver?.disconnect(); chart?.dispose() })
</script>

<template><div ref="container" class="business-trend-chart"></div></template>

<style scoped>
.business-trend-chart { width: 100%; height: 100%; min-height: 130px; }
</style>
