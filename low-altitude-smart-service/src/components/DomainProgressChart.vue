<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { init, use, type EChartsType } from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { domainProgress } from '@/mocks/data'

use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const container = ref<HTMLElement>()
let chart: EChartsType | undefined
let resizeObserver: ResizeObserver | undefined

onMounted(() => {
  if (!container.value) return
  chart = init(container.value)
  chart.setOption({
    animationDuration: 800,
    grid: { top: 20, left: 34, right: 28, bottom: 32 },
    tooltip: { trigger: 'axis', backgroundColor: '#061d35ee', borderColor: '#147ca3', textStyle: { color: '#dff9ff', fontSize: 10 } },
    legend: { top: 0, right: 6, itemWidth: 8, itemHeight: 5, textStyle: { color: '#7faabd', fontSize: 8 }, data: ['计划数', '完成数', '完成率'] },
    xAxis: {
      type: 'category',
      data: domainProgress.map((item) => item.name.replace('监管', '\n监管').replace('调查', '\n调查').replace('管控', '\n管控').replace('治理', '\n治理')),
      axisLabel: { color: '#83aabd', fontSize: 8, lineHeight: 11 },
      axisLine: { lineStyle: { color: '#16465f' } },
      axisTick: { show: false },
    },
    yAxis: [
      { type: 'value', min: 0, max: 200, axisLabel: { color: '#638ba0', fontSize: 8 }, splitLine: { lineStyle: { color: '#123951', type: 'dashed' } } },
      { type: 'value', min: 0, max: 100, axisLabel: { color: '#638ba0', fontSize: 8, formatter: '{value}%' }, splitLine: { show: false } },
    ],
    series: [
      { name: '计划数', type: 'bar', data: domainProgress.map((item) => item.planned), barWidth: 12, itemStyle: { color: '#169de8' } },
      { name: '完成数', type: 'bar', data: domainProgress.map((item) => item.completed), barWidth: 12, itemStyle: { color: '#22d5aa' } },
      { name: '完成率', type: 'line', yAxisIndex: 1, data: domainProgress.map((item) => item.rate), symbolSize: 5, smooth: true, lineStyle: { width: 2, color: '#ffb83f' }, itemStyle: { color: '#ffca67' } },
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
