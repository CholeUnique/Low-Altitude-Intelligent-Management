<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PlatformLayout from '@/layouts/PlatformLayout.vue'

type FlightResult = {
  planId: string
  planName: string
  orderNo: string
  routeType: '网格航线' | '线性航线' | '定点环绕' | '自由航线'
  missionType: '综合巡检' | '林地巡查' | '河道巡查' | '地图测试'
  device: string
  completedAt: string
  duration: number
  photos: number
  videos: number
  maps: number
  size: string
}

const menu = [
  { label: '飞行结果', path: '/recognition/flight-results', icon: '飞' },
  { label: '智能识别', path: '/recognition/intelligent', icon: '识' },
  { label: '算法仓库', path: '/algorithms', icon: '算' },
]
const results: FlightResult[] = [
  { planId: 'FL-20260920-1527', planName: '九龙镇综合巡检 · 北片区', orderNo: 'GD260916114956791', routeType: '网格航线', missionType: '综合巡检', device: '海陵站 · M4D', completedAt: '2026-09-22 13:59', duration: 38, photos: 246, videos: 2, maps: 1, size: '3.8 GB' },
  { planId: 'FL-20260920-1058', planName: '九龙镇综合巡检 · 南片区', orderNo: 'GD260916114956791', routeType: '网格航线', missionType: '综合巡检', device: '海陵站 · M4D', completedAt: '2026-09-22 12:57', duration: 42, photos: 218, videos: 3, maps: 1, size: '3.2 GB' },
  { planId: 'FL-20260921-1314', planName: '林地变化图斑复飞', orderNo: 'GD260910093114447', routeType: '定点环绕', missionType: '林地巡查', device: '海陵站 · M4D', completedAt: '2026-09-21 14:09', duration: 27, photos: 126, videos: 1, maps: 0, size: '1.4 GB' },
  { planId: 'FL-20260921-1246', planName: '引江河沿线常态巡查', orderNo: 'GD260908110751262', routeType: '线性航线', missionType: '河道巡查', device: '移动组 · M4D', completedAt: '2026-09-21 13:30', duration: 44, photos: 174, videos: 4, maps: 0, size: '2.7 GB' },
  { planId: 'FL-20260920-1057', planName: '泰州站地图精度测试', orderNo: 'GD260910093114447', routeType: '网格航线', missionType: '地图测试', device: '海陵站 · M4D', completedAt: '2026-09-21 12:46', duration: 31, photos: 192, videos: 0, maps: 1, size: '2.1 GB' },
  { planId: 'FL-20260920-1525', planName: '城东街道建设用地巡检', orderNo: 'GD260916114956791', routeType: '自由航线', missionType: '综合巡检', device: '城东组 · M350 RTK', completedAt: '2026-09-20 15:54', duration: 35, photos: 145, videos: 2, maps: 0, size: '1.9 GB' },
  { planId: 'FL-20260916-1203', planName: '林地边界核验航飞', orderNo: 'GD260910093114447', routeType: '线性航线', missionType: '林地巡查', device: '海陵站 · M4D', completedAt: '2026-09-20 12:46', duration: 29, photos: 168, videos: 1, maps: 1, size: '2.5 GB' },
  { planId: 'FL-20260911-1024', planName: '河道重点断面巡查', orderNo: 'GD260908110751262', routeType: '定点环绕', missionType: '河道巡查', device: '移动组 · M4D', completedAt: '2026-09-12 13:43', duration: 22, photos: 88, videos: 2, maps: 0, size: '980 MB' },
]

const planQuery = ref('')
const orderQuery = ref('')
const routeType = ref('')
const missionType = ref('')
const device = ref('')
const dateStart = ref('')
const dateEnd = ref('')
const fileType = ref('')
const page = ref(1)
const pageSize = ref(6)
const selected = ref<FlightResult | null>(null)
const notice = ref('')

const filtered = computed(() => results.filter(item =>
  (!planQuery.value || `${item.planId}${item.planName}`.toLowerCase().includes(planQuery.value.trim().toLowerCase())) &&
  (!orderQuery.value || item.orderNo.toLowerCase().includes(orderQuery.value.trim().toLowerCase())) &&
  (!routeType.value || item.routeType === routeType.value) &&
  (!missionType.value || item.missionType === missionType.value) &&
  (!device.value || item.device === device.value) &&
  (!dateStart.value || item.completedAt.slice(0, 10) >= dateStart.value) &&
  (!dateEnd.value || item.completedAt.slice(0, 10) <= dateEnd.value) &&
  (!fileType.value || (fileType.value === '照片' && item.photos > 0) || (fileType.value === '视频' && item.videos > 0) || (fileType.value === '正射影像' && item.maps > 0)),
))
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const photosTotal = computed(() => filtered.value.reduce((sum, item) => sum + item.photos, 0))
const videoTotal = computed(() => filtered.value.reduce((sum, item) => sum + item.videos, 0))
const mapsTotal = computed(() => filtered.value.reduce((sum, item) => sum + item.maps, 0))
const devices = [...new Set(results.map(item => item.device))]
watch([planQuery, orderQuery, routeType, missionType, device, dateStart, dateEnd, fileType, pageSize], () => { page.value = 1 })
function resetFilters() { planQuery.value = ''; orderQuery.value = ''; routeType.value = ''; missionType.value = ''; device.value = ''; dateStart.value = ''; dateEnd.value = ''; fileType.value = '' }
function openResult(item: FlightResult) { selected.value = item; notice.value = '' }
function showDemoNotice() { notice.value = '效果图演示：成果文件下载需接入实际飞行成果服务。' }
</script>

<template>
  <PlatformLayout section="recognition" title="识别研判" subtitle="飞行成果入库、智能识别与算法分析" :menu="menu">
    <div class="flight-results-page">
      <div class="page-head"><div><h2>飞行结果</h2><p>按飞行计划汇总已结束任务的影像、视频和测绘成果；每个飞行计划一行</p></div><span class="update"><i></i>飞行结束后自动汇集 · 演示数据</span></div>

      <section class="flight-result-filters"><div class="filter-heading"><div><b>成果筛选</b><span>按计划、工单、航线与文件类型定位结果</span></div><button @click="resetFilters">重置条件</button></div><div class="filter-grid"><label>飞行计划<input v-model="planQuery" placeholder="计划名称 / 编号" /></label><label>需求工单号<input v-model="orderQuery" placeholder="输入工单编号" /></label><label>航线类型<select v-model="routeType"><option value="">全部航线</option><option>网格航线</option><option>线性航线</option><option>定点环绕</option><option>自由航线</option></select></label><label>任务类型<select v-model="missionType"><option value="">全部类型</option><option>综合巡检</option><option>林地巡查</option><option>河道巡查</option><option>地图测试</option></select></label><label>飞行设备<select v-model="device"><option value="">全部设备</option><option v-for="item in devices" :key="item">{{ item }}</option></select></label><label>完成日期 · 起<input v-model="dateStart" type="date" /></label><label>完成日期 · 止<input v-model="dateEnd" type="date" /></label><label>成果类型<select v-model="fileType"><option value="">全部文件</option><option>照片</option><option>视频</option><option>正射影像</option></select></label></div></section>

      <section class="summary"><article><i>▣</i><div><span>飞行计划</span><b>{{ filtered.length }}</b><small>当前筛选结果</small></div></article><article><i>▧</i><div><span>照片文件</span><b>{{ photosTotal.toLocaleString() }}</b><small>原始影像 / 抓拍</small></div></article><article><i>▶</i><div><span>视频文件</span><b>{{ videoTotal }}</b><small>巡检录像 / 片段</small></div></article><article><i>◫</i><div><span>正射成果</span><b>{{ mapsTotal }}</b><small>可用于后续研判</small></div></article><article class="summary-hint"><b>成果管理提示</b><p>点击“查看成果”，可按照片、视频和正射文件浏览该飞行计划的归档内容。</p></article></section>

      <section class="result-table"><header><div><b>全部飞行结果</b><span>已完成计划 · {{ filtered.length }} 条</span></div><div class="table-tools"><span><i></i>已归集</span><button @click="notice='效果图演示：导出需接入实际飞行结果接口。'">⇩ 导出清单</button></div></header><div class="table-scroll"><table><thead><tr><th>飞行计划 / 结果目录</th><th>关联需求工单</th><th>航线类型</th><th>任务类型</th><th>执行设备</th><th>完成时间</th><th>时长</th><th>成果文件</th><th>操作</th></tr></thead><tbody><tr v-for="item in visible" :key="item.planId"><td><div class="plan-cell"><span class="folder-icon">▰</span><span><b>{{ item.planName }}</b><small>{{ item.planId }}</small></span></div></td><td><span class="order-code">{{ item.orderNo }}</span></td><td><span class="route-chip">{{ item.routeType }}</span></td><td>{{ item.missionType }}</td><td><b class="device-name">{{ item.device }}</b></td><td>{{ item.completedAt }}</td><td>{{ item.duration }} min</td><td><div class="file-counts"><span>图 {{ item.photos }}</span><span>视 {{ item.videos }}</span><span v-if="item.maps">正 {{ item.maps }}</span></div><small class="file-size">{{ item.size }}</small></td><td><button class="view-btn" @click="openResult(item)">查看成果 ›</button></td></tr><tr v-if="!visible.length"><td colspan="9" class="empty">未找到符合条件的飞行结果，请调整筛选条件。</td></tr></tbody></table></div><footer><span>共 <b>{{ filtered.length }}</b> 条记录　每页显示 <b>{{ pageSize }}</b> 条</span><div><button :disabled="page===1" @click="page--">‹</button><button class="active">{{ page }}</button><button :disabled="page===pageCount" @click="page++">›</button><label>每页 <select v-model.number="pageSize"><option :value="6">6</option><option :value="8">8</option><option :value="20">20</option></select> 条</label></div></footer></section>
      <div v-if="notice && !selected" class="notice" role="status">{{ notice }}<button @click="notice=''">×</button></div>
    </div>

    <div v-if="selected" class="drawer-shade" @click.self="selected=null"><aside class="result-drawer"><header><div><small>FLIGHT RESULT / {{ selected.planId }}</small><h3>飞行成果目录</h3><p>{{ selected.planName }}</p></div><button @click="selected=null">×</button></header><div class="drawer-meta"><span>关联工单<b>{{ selected.orderNo }}</b></span><span>完成时间<b>{{ selected.completedAt }}</b></span><span>执行设备<b>{{ selected.device }}</b></span><span>航线类型<b>{{ selected.routeType }}</b></span></div><div class="drawer-files"><h4>按文件类型查看 <small>总大小 {{ selected.size }}</small></h4><button @click="showDemoNotice"><i>▧</i><span><b>原始照片</b><small>JPEG / 定位与拍摄时间元数据</small></span><em>{{ selected.photos }} 个</em></button><button @click="showDemoNotice"><i>▶</i><span><b>巡检视频</b><small>MP4 / 航线实时画面</small></span><em>{{ selected.videos }} 个</em></button><button v-if="selected.maps" @click="showDemoNotice"><i>◫</i><span><b>正射影像</b><small>GeoTIFF / 可用于图斑比对</small></span><em>{{ selected.maps }} 份</em></button><button @click="showDemoNotice"><i>▤</i><span><b>飞行记录</b><small>航迹、设备信息及任务日志</small></span><em>1 份</em></button></div><div class="drawer-note">本页按“一个飞行计划一条结果”展示；文件数量与名称为效果图演示，实际需从飞行成果服务读取。</div><footer><span>{{ notice || '选择目录以查看相应成果文件。' }}</span><button @click="selected=null">关闭</button></footer></aside></div>
  </PlatformLayout>
</template>

<style scoped>
.flight-results-page{height:100%;min-height:0;display:flex;flex-direction:column;gap:10px;color:#23495c}.page-head{flex:0 0 52px!important;margin-bottom:0!important}.page-head .update i{display:inline-block;width:7px;height:7px;margin-right:5px;background:#22bc94;border-radius:50%}.flight-result-filters{flex:0 0 auto;background:white;border:1px solid #d5e4ec;border-radius:6px;box-shadow:0 3px 12px #173b5010}.filter-heading{height:39px;display:flex;align-items:center;justify-content:space-between;padding:0 13px;border-bottom:1px solid #e8f0f4}.filter-heading b{font-size:12px}.filter-heading span{margin-left:11px;color:#8fa5b0;font-size:9px}.filter-heading button{border:0;background:transparent;color:#0c91ad;font-size:10px;cursor:pointer}.filter-grid{display:grid;grid-template-columns:1.2fr 1.1fr repeat(6,minmax(0,1fr));gap:8px;padding:11px}.filter-grid label{min-width:0;color:#66818e;font-size:10px}.filter-grid input,.filter-grid select{box-sizing:border-box;display:block;width:100%;height:32px;margin-top:5px;padding:0 7px;border:1px solid #cfe0e8;border-radius:4px;color:#31586a;background:#fafdfe;font-size:10px}.filter-grid input::placeholder{color:#9bb0b8}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) 1.38fr;gap:8px;flex:0 0 70px}.summary article{display:flex;align-items:center;gap:10px;min-width:0;padding:9px 12px;background:white;border:1px solid #d8e5ec;border-radius:5px}.summary article>i{width:34px;height:34px;flex:0 0 auto;display:grid;place-items:center;border-radius:50%;background:#e9f7fa;color:#1395aa;font-size:16px;font-style:normal}.summary article div{min-width:0}.summary span,.summary small{display:block;color:#839ca8;font-size:9px}.summary b{display:block;color:#0a6585;font-size:19px;line-height:20px}.summary small{font-size:8px}.summary .summary-hint{display:block;background:linear-gradient(110deg,#e8f8fb,#f8fcfd);border-color:#b9dde8}.summary-hint b{font-size:11px}.summary-hint p{margin:6px 0 0;color:#5d8190;font-size:9px;line-height:1.5}.result-table{display:flex;flex:1;min-height:0;flex-direction:column;background:white;border:1px solid #d5e4ec;border-radius:6px;box-shadow:0 3px 12px #173b5010;overflow:hidden}.result-table>header{height:43px;flex:0 0 43px;display:flex;align-items:center;justify-content:space-between;padding:0 13px;border-bottom:1px solid #e5eef2}.result-table>header b{font-size:12px}.result-table>header span{margin-left:9px;color:#89a0a9;font-size:9px}.table-tools{display:flex;align-items:center;gap:13px}.table-tools span i{display:inline-block;width:7px;height:7px;background:#23b990;border-radius:50%}.table-tools button{padding:6px 10px;border:1px solid #b9dbe5;border-radius:4px;background:#eff9fb;color:#138aa4;font-size:10px;cursor:pointer}.table-scroll{flex:1;min-height:0;overflow:auto}table{width:100%;border-collapse:collapse;table-layout:fixed}th{height:42px;padding:0 9px;text-align:left;background:#eff7fb;color:#668698;font-size:10px;font-weight:600}td{height:60px;padding:0 9px;border-bottom:1px solid #e6eff3;color:#456a7c;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}th:nth-child(1){width:21%}th:nth-child(2){width:13%}th:nth-child(3){width:8%}th:nth-child(4){width:8%}th:nth-child(5){width:12%}th:nth-child(6){width:12%}th:nth-child(7){width:6%}th:nth-child(8){width:13%}th:nth-child(9){width:7%}.plan-cell{display:flex;align-items:center;gap:8px;min-width:0}.plan-cell>span:last-child{min-width:0}.plan-cell b,.plan-cell small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.plan-cell b{color:#244e63;font-size:10px}.plan-cell small{margin-top:4px;color:#83a0ad;font-size:9px}.folder-icon{flex:0 0 26px;height:25px;display:grid;place-items:center;background:#e7f6fb;border-radius:5px;color:#088dad;font-size:17px}.order-code{color:#0b88a6;font-size:9px}.route-chip{padding:4px 6px;background:#ebf6fa;color:#247f9c;border-radius:3px}.device-name{color:#456a7c;font-size:9px;font-weight:600}.file-counts{display:flex;gap:3px}.file-counts span{padding:3px 4px;border-radius:3px;background:#eaf7f9;color:#1886a0;font-size:9px}.file-size{display:block;margin-top:3px;color:#a0b2ba;font-size:8px}.view-btn{padding:7px 8px;border:1px solid #8bcad9;border-radius:3px;background:#edf9fc;color:#0b89a7;font-size:9px;white-space:nowrap;cursor:pointer}.empty{height:150px;text-align:center;color:#899faa}.result-table footer{height:44px;flex:0 0 44px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-top:1px solid #e9f0f3;color:#738d9b;font-size:10px}.result-table footer>div{display:flex;align-items:center;gap:5px}.result-table footer button{height:26px;min-width:25px;border:1px solid #d4e2e9;border-radius:3px;background:#fff;color:#587889;cursor:pointer}.result-table footer button.active{background:#0d8eac;border-color:#0d8eac;color:#fff}.result-table footer button:disabled{opacity:.45}.result-table footer label{margin-left:8px}.result-table footer select{height:26px;border:1px solid #d4e2e9;background:white;color:#587889}.notice{position:fixed;right:20px;bottom:20px;padding:10px 13px;background:#e8f8fa;border:1px solid #acdce5;border-radius:4px;color:#167e98;font-size:10px}.notice button{margin-left:8px;border:0;background:none;color:inherit}.drawer-shade{position:fixed;inset:0;z-index:30;background:#031f3480}.result-drawer{position:absolute;top:0;right:0;bottom:0;width:min(440px,90vw);display:flex;flex-direction:column;background:#f1f6f9;box-shadow:-10px 0 30px #00192638}.result-drawer>header{display:flex;align-items:flex-start;justify-content:space-between;padding:22px;background:linear-gradient(110deg,#064560,#07304b);color:white}.result-drawer header small{color:#6fd3df;font-size:9px;letter-spacing:1px}.result-drawer h3{margin:8px 0 5px;font-size:21px}.result-drawer header p{margin:0;color:#a9d3dc;font-size:11px}.result-drawer header button{border:0;background:none;color:white;font-size:24px;cursor:pointer}.drawer-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:14px}.drawer-meta span{padding:10px;background:white;color:#8aa1ab;font-size:9px}.drawer-meta b{display:block;margin-top:5px;color:#31576a;font-size:11px}.drawer-files{flex:1;padding:0 14px;overflow:auto}.drawer-files h4{display:flex;justify-content:space-between;margin:12px 0;font-size:12px}.drawer-files h4 small{color:#93a5ad;font-size:10px;font-weight:400}.drawer-files button{width:100%;display:flex;align-items:center;gap:10px;margin:8px 0;padding:14px;border:1px solid #d7e5eb;border-radius:5px;background:#fff;text-align:left;cursor:pointer}.drawer-files button i{width:35px;height:35px;display:grid;place-items:center;border-radius:6px;background:#e7f6f9;color:#118aa4;font-size:18px;font-style:normal}.drawer-files button span{flex:1}.drawer-files button b,.drawer-files button small{display:block}.drawer-files button b{font-size:11px}.drawer-files button small{margin-top:4px;color:#91a5ae;font-size:9px}.drawer-files button em{color:#108ba7;font-size:10px;font-style:normal}.drawer-note{margin:14px;padding:11px;border-left:3px solid #1da6b8;background:#e9f7fa;color:#668a98;font-size:10px;line-height:1.6}.result-drawer footer{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 15px;background:white;border-top:1px solid #dbe8ed}.result-drawer footer span{color:#7e99a4;font-size:9px}.result-drawer footer button{padding:7px 12px;border:1px solid #c7dce5;background:white;color:#457287;border-radius:4px;cursor:pointer}
.flight-results-page td{font-size:11px}.flight-results-page .plan-cell b,.flight-results-page .device-name{font-size:11px}.flight-results-page .plan-cell small,.flight-results-page .order-code,.flight-results-page .route-chip,.flight-results-page .file-counts span,.flight-results-page .view-btn{font-size:10px}
</style>
