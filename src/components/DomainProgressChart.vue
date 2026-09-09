<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { init, use, type EChartsType } from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

interface ProgressItem {
  name: string
  planned: number
  completed: number
  rate: number
}

const props = defineProps<{ data: ProgressItem[] }>()
const container = ref<HTMLElement>()
let chart: EChartsType | undefined
let resizeObserver: ResizeObserver | undefined

onMounted(() => {
  if (!container.value) return
  chart = init(container.value)
  chart.setOption({
    animationDuration: 800,
    grid: { top: 38, left: 38, right: 32, bottom: 46 },
    tooltip: { trigger: 'axis', backgroundColor: '#061d35ee', borderColor: '#147ca3', textStyle: { color: '#dff9ff', fontSize: 12 } },
    legend: { top: 4, left: 'center', itemWidth: 13, itemHeight: 8, itemGap: 13, textStyle: { color: '#a9d5e5', fontSize: 12 }, data: ['计划数', '完成数', '完成率'] },
    xAxis: {
      type: 'category',
      data: props.data.map((item) => item.name.length > 6 ? `${item.name.slice(0, 5)}\n${item.name.slice(5, 9)}` : item.name),
      axisLabel: { color: '#83aabd', fontSize: 12, lineHeight: 15 },
      axisLine: { lineStyle: { color: '#16465f' } },
      axisTick: { show: false },
    },
    yAxis: [
      { type: 'value', min: 0, max: 200, axisLabel: { color: '#638ba0', fontSize: 10 }, splitLine: { lineStyle: { color: '#123951', type: 'dashed' } } },
      { type: 'value', min: 0, max: 100, axisLabel: { color: '#638ba0', fontSize: 10, formatter: '{value}%' }, splitLine: { show: false } },
    ],
    series: [
      { name: '计划数', type: 'bar', data: props.data.map((item) => item.planned), barWidth: 12, itemStyle: { color: '#169de8' } },
      { name: '完成数', type: 'bar', data: props.data.map((item) => item.completed), barWidth: 12, itemStyle: { color: '#22d5aa' } },
      { name: '完成率', type: 'line', yAxisIndex: 1, data: props.data.map((item) => item.rate), symbolSize: 6, smooth: true, lineStyle: { width: 2, color: '#ffb83f' }, itemStyle: { color: '#ffca67' } },
    ],
  })
  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(container.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
})
</script>

<template><div ref="container" class="domain-chart"></div></template>

<style scoped>
.domain-chart { width: 100%; height: 100%; min-height: 130px; }
</style>
