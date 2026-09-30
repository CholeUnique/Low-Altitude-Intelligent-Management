<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  addMapService,
  deleteMapService,
  getMapServiceDetail,
  listMapServices,
  updateMapService,
  updateMapServiceStatus,
  type MapServiceItem,
} from '@/api/map-service'

type EditorMode = 'add' | 'edit' | 'view'

const services = ref<MapServiceItem[]>([])
const loading = ref(false)
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')
const filters = reactive<{ keyword: string; status: '' | 0 | 1 }>({ keyword: '', status: '' })
const editorOpen = ref(false)
const editorMode = ref<EditorMode>('add')
const editorTitle = computed(() => ({ add: '新增地图服务', edit: '编辑地图服务', view: '地图服务详情' })[editorMode.value])
const form = reactive({ id: '' as string | number, name: '', serviceUrl: '', type: 'ARCGIS_MAPSERVER', sort: 0, status: 1, preset: 0, remark: '', createTime: '', updateTime: '' })

const enabledCount = computed(() => services.value.filter((item) => Number(item.status) === 1).length)
const disabledCount = computed(() => services.value.length - enabledCount.value)
const presetCount = computed(() => services.value.filter((item) => Number(item.preset) === 1).length)

function showSuccess(message: string) {
  notice.value = message
  errorMessage.value = ''
  window.setTimeout(() => { if (notice.value === message) notice.value = '' }, 2600)
}

function showError(error: unknown) {
  errorMessage.value = error instanceof Error ? error.message : '操作失败，请稍后重试'
  notice.value = ''
}

function resetForm() {
  Object.assign(form, { id: '', name: '', serviceUrl: '', type: 'ARCGIS_MAPSERVER', sort: 0, status: 1, preset: 0, remark: '', createTime: '', updateTime: '' })
}

function fillForm(service: MapServiceItem) {
  Object.assign(form, {
    id: service.id,
    name: service.name || '',
    serviceUrl: service.serviceUrl || '',
    type: service.type || 'ARCGIS_MAPSERVER',
    sort: Number(service.sort) || 0,
    status: Number(service.status) === 0 ? 0 : 1,
    preset: Number(service.preset) || 0,
    remark: service.remark || '',
    createTime: service.createTime || '',
    updateTime: service.updateTime || '',
  })
}

async function loadServices() {
  loading.value = true
  errorMessage.value = ''
  try {
    services.value = await listMapServices({
      keyword: filters.keyword.trim() || undefined,
      status: filters.status === '' ? undefined : filters.status,
    })
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
  }
}

async function resetFilters() {
  Object.assign(filters, { keyword: '', status: '' })
  await loadServices()
}

async function openEditor(mode: EditorMode, row?: MapServiceItem) {
  editorMode.value = mode
  resetForm()
  if (row) {
    busy.value = true
    try {
      fillForm(await getMapServiceDetail(row.id))
    } catch (error) {
      showError(error)
      return
    } finally {
      busy.value = false
    }
  }
  editorOpen.value = true
}

async function submitService() {
  if (!form.name.trim()) return showError(new Error('请输入服务名称'))
  if (!form.serviceUrl.trim()) return showError(new Error('请输入服务地址'))
  busy.value = true
  try {
    const payload = {
      name: form.name.trim(),
      serviceUrl: form.serviceUrl.trim(),
      type: form.type || 'ARCGIS_MAPSERVER',
      sort: Number(form.sort) || 0,
      remark: form.remark.trim() || undefined,
    }
    if (editorMode.value === 'add') await addMapService(payload)
    else await updateMapService({ id: form.id, ...payload })
    editorOpen.value = false
    showSuccess(editorMode.value === 'add' ? '地图服务已新增' : '地图服务已更新')
    await loadServices()
  } catch (error) {
    showError(error)
  } finally {
    busy.value = false
  }
}

async function toggleService(row: MapServiceItem) {
  const nextStatus: 0 | 1 = Number(row.status) === 1 ? 0 : 1
  if (!window.confirm(`确认${nextStatus ? '启用' : '停用'}地图服务“${row.name}”吗？`)) return
  busy.value = true
  try {
    await updateMapServiceStatus(row.id, nextStatus)
    showSuccess(`地图服务已${nextStatus ? '启用' : '停用'}`)
    await loadServices()
  } catch (error) {
    showError(error)
  } finally {
    busy.value = false
  }
}

async function removeService(row: MapServiceItem) {
  if (!window.confirm(`确认删除地图服务“${row.name}”吗？已被业务关联时后端可能拒绝删除。`)) return
  busy.value = true
  try {
    await deleteMapService(row.id)
    showSuccess('地图服务已删除')
    await loadServices()
  } catch (error) {
    showError(error)
  } finally {
    busy.value = false
  }
}

onMounted(loadServices)
</script>

<template>
  <div class="map-service-panel">
    <div v-if="notice" class="service-message service-message--success">{{ notice }}</div>
    <div v-if="errorMessage" class="service-message service-message--error">{{ errorMessage }}<button type="button" @click="errorMessage = ''">×</button></div>

    <div class="service-heading">
      <div><h2>地图服务管理</h2><p>注册和维护第三方地图服务，控制服务排序及启停状态</p></div>
      <button class="service-button service-button--primary" type="button" @click="openEditor('add')">＋ 新增地图服务</button>
    </div>

    <section class="service-overview">
      <article><span>服务总数</span><strong>{{ services.length }}</strong><small>当前查询结果</small></article>
      <article><span>已启用</span><strong>{{ enabledCount }}</strong><small>可供业务页面加载</small></article>
      <article><span>已停用</span><strong>{{ disabledCount }}</strong><small>不会显示在图层列表</small></article>
      <article><span>预置服务</span><strong>{{ presetCount }}</strong><small>系统内置地图资源</small></article>
    </section>

    <section class="service-card">
      <form class="service-filter" @submit.prevent="loadServices">
        <input v-model.trim="filters.keyword" placeholder="搜索服务名称">
        <select v-model="filters.status"><option value="">全部状态</option><option :value="1">已启用</option><option :value="0">已停用</option></select>
        <button class="service-button service-button--primary" type="submit">查询</button>
        <button class="service-button" type="button" @click="resetFilters">重置</button>
      </form>
      <div class="service-table-wrap">
        <table>
          <thead><tr><th>服务名称</th><th>服务类型</th><th>服务地址</th><th>排序</th><th>来源</th><th>状态</th><th>更新时间</th><th class="actions-column">操作</th></tr></thead>
          <tbody>
            <tr v-if="loading"><td colspan="8" class="empty-cell">正在加载地图服务…</td></tr>
            <tr v-else-if="!services.length"><td colspan="8" class="empty-cell">暂无符合条件的地图服务</td></tr>
            <tr v-for="row in services" v-else :key="row.id">
              <td><strong>{{ row.name }}</strong><small>ID：{{ row.id }}</small></td>
              <td><span class="type-tag">{{ row.type || '未配置' }}</span></td>
              <td><a :href="row.serviceUrl" target="_blank" rel="noopener noreferrer" :title="row.serviceUrl">{{ row.serviceUrl }}</a></td>
              <td>{{ row.sort ?? 0 }}</td>
              <td>{{ Number(row.preset) === 1 ? '系统预置' : '自定义' }}</td>
              <td><span class="service-status" :class="Number(row.status) === 1 ? 'on' : 'off'">{{ Number(row.status) === 1 ? '启用' : '停用' }}</span></td>
              <td>{{ row.updateTime || row.createTime || '-' }}</td>
              <td class="row-actions"><button @click="openEditor('view', row)">详情</button><button @click="openEditor('edit', row)">编辑</button><button @click="toggleService(row)">{{ Number(row.status) === 1 ? '停用' : '启用' }}</button><button class="danger" @click="removeService(row)">删除</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div v-if="editorOpen" class="service-modal-mask" @mousedown.self="editorOpen = false">
      <section class="service-modal" role="dialog" aria-modal="true">
        <header><div><h2>{{ editorTitle }}</h2><p>地图服务注册信息</p></div><button type="button" @click="editorOpen = false">×</button></header>
        <form @submit.prevent="submitService">
          <label><span>服务名称 *</span><input v-model.trim="form.name" maxlength="100" :disabled="editorMode === 'view'" required></label>
          <label><span>服务类型</span><select v-model="form.type" :disabled="editorMode === 'view'"><option value="ARCGIS_MAPSERVER">ArcGIS MapServer</option><option value="ARCGIS_IMAGESERVER">ArcGIS ImageServer</option><option value="WMTS">WMTS</option><option value="WMS">WMS</option></select></label>
          <label class="wide"><span>服务地址 *</span><textarea v-model.trim="form.serviceUrl" maxlength="500" :disabled="editorMode === 'view'" required></textarea></label>
          <label><span>排序</span><input v-model.number="form.sort" type="number" :disabled="editorMode === 'view'"></label>
          <label v-if="editorMode === 'view'"><span>状态</span><input :value="form.status === 1 ? '启用' : '停用'" disabled></label>
          <label v-if="editorMode === 'view'"><span>数据来源</span><input :value="form.preset === 1 ? '系统预置' : '自定义'" disabled></label>
          <label class="wide"><span>备注</span><textarea v-model.trim="form.remark" maxlength="255" :disabled="editorMode === 'view'"></textarea></label>
          <label v-if="editorMode === 'view'"><span>创建时间</span><input :value="form.createTime || '-'" disabled></label>
          <label v-if="editorMode === 'view'"><span>更新时间</span><input :value="form.updateTime || '-'" disabled></label>
          <footer><button type="button" @click="editorOpen = false">{{ editorMode === 'view' ? '关闭' : '取消' }}</button><button v-if="editorMode !== 'view'" class="primary" type="submit" :disabled="busy">{{ busy ? '保存中…' : '保存' }}</button></footer>
        </form>
      </section>
    </div>
  </div>
</template>

<style scoped>
.map-service-panel{color:#dceef5}.service-heading{min-height:54px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between}.service-heading h2,.service-heading p,.service-modal h2,.service-modal p{margin:0}.service-heading h2{font-size:25px;color:#fff}.service-heading p{margin-top:6px;color:#75a2b4;font-size:14px}.service-button{min-height:40px;padding:0 17px;color:#a9d3e2;background:#0b2b3e;border:1px solid #28657d;border-radius:3px;font-size:14px;cursor:pointer}.service-button--primary{color:#fff;background:linear-gradient(135deg,#1488b5,#16a9c6);border-color:#42cbe9}.service-overview{margin-bottom:18px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.service-overview article{min-height:88px;padding:14px 17px;display:grid;grid-template-columns:1fr auto;align-content:center;background:linear-gradient(135deg,#0c2b3f,#092334);border:1px solid #1b526a;border-radius:5px}.service-overview span{color:#77a4b5;font-size:12px}.service-overview strong{grid-row:1/3;grid-column:2;color:#61d8f3;font-size:28px}.service-overview small{margin-top:8px;color:#5f8797;font-size:11px}.service-card{min-height:620px;overflow:hidden;background:#0b2638e8;border:1px solid #1b536b;border-radius:6px;box-shadow:0 12px 30px #00121d44}.service-filter{padding:13px;display:grid;grid-template-columns:minmax(260px,1fr) 150px auto auto;gap:9px;background:#0a2435;border-bottom:1px solid #173e51}.service-filter input,.service-filter select{width:100%;min-height:40px;padding:0 11px;box-sizing:border-box;color:#e9f8fc;background:#071d2b;border:1px solid #20546a;border-radius:3px;font-size:13px}.service-table-wrap{max-height:calc(100vh - 345px);overflow:auto}.service-table-wrap table{width:100%;min-width:1180px;border-collapse:collapse;font-size:13px}.service-table-wrap th{height:44px;padding:0 12px;position:sticky;top:0;z-index:1;color:#78a7b8;background:#081f2e;text-align:left;font-weight:500}.service-table-wrap td{height:58px;max-width:300px;padding:8px 12px;color:#c4dae3;border-top:1px solid #153d50}.service-table-wrap tbody tr:hover{background:#0f3043}.service-table-wrap td strong,.service-table-wrap td small{display:block}.service-table-wrap td strong{color:#edfaff;font-weight:500}.service-table-wrap td small{margin-top:4px;color:#668d9d;font-size:11px}.service-table-wrap td a{display:block;overflow:hidden;color:#5fc9e7;text-overflow:ellipsis;white-space:nowrap}.type-tag{padding:4px 7px;color:#76d6ed;background:#123d51;border-radius:3px;font-size:11px}.service-status{padding:3px 8px;border-radius:3px;font-size:11px}.service-status.on{color:#79e5c4;background:#174a43}.service-status.off{color:#e9a4ad;background:#512b34}.row-actions{white-space:nowrap}.row-actions button{padding:3px 6px;color:#77d6f1;background:transparent;border:0;font-size:12px;cursor:pointer}.row-actions button.danger{color:#ef8794}.empty-cell{height:260px!important;color:#6f98a8!important;text-align:center!important}.service-message{position:fixed;top:82px;left:50%;z-index:120;max-width:560px;padding:11px 40px 11px 16px;transform:translateX(-50%);color:#fff;border-radius:4px;box-shadow:0 10px 30px #00131faa;font-size:13px}.service-message--success{background:#167b6a;border:1px solid #42c9a8}.service-message--error{background:#8e3544;border:1px solid #e26d7b}.service-message button{position:absolute;top:4px;right:7px;color:#fff;background:transparent;border:0;font-size:20px;cursor:pointer}.service-modal-mask{position:fixed;inset:0;z-index:110;padding:30px;display:grid;place-items:center;background:#00111ccc;backdrop-filter:blur(3px)}.service-modal{width:min(760px,95vw);max-height:92vh;overflow:auto;background:#0b2638;border:1px solid #2583a5;border-radius:7px;box-shadow:0 22px 70px #000b}.service-modal>header{padding:18px 22px;display:flex;justify-content:space-between;align-items:center;background:#0d3045;border-bottom:1px solid #205f78}.service-modal h2{color:#fff;font-size:20px}.service-modal header p{margin-top:4px;color:#6f9bab;font-size:13px}.service-modal header button{width:32px;height:32px;color:#9fc5d2;background:transparent;border:0;font-size:24px;cursor:pointer}.service-modal form{padding:22px;display:grid;grid-template-columns:1fr 1fr;gap:16px}.service-modal label span{display:block;margin-bottom:7px;color:#85aab8;font-size:13px}.service-modal input,.service-modal select,.service-modal textarea{width:100%;min-height:42px;padding:0 11px;box-sizing:border-box;color:#e9f8fc;background:#071d2b;border:1px solid #20546a;border-radius:3px;font-size:14px}.service-modal textarea{min-height:82px;padding-top:9px;resize:vertical}.service-modal input:disabled,.service-modal select:disabled,.service-modal textarea:disabled{color:#7894a0;background:#102530}.service-modal .wide{grid-column:1/-1}.service-modal form>footer{grid-column:1/-1;display:flex;justify-content:flex-end;gap:10px}.service-modal form>footer button{min-height:40px;padding:0 18px;color:#aedbea;background:#0a2738;border:1px solid #276781;border-radius:3px;cursor:pointer}.service-modal form>footer .primary{color:#fff;background:linear-gradient(135deg,#1488b5,#16a9c6);border-color:#42cbe9}.service-modal form>footer button:disabled{opacity:.5;cursor:wait}@media(max-width:1000px){.service-overview{grid-template-columns:repeat(2,1fr)}.service-filter{grid-template-columns:1fr 140px}.service-card{min-height:500px}.service-table-wrap{max-height:520px}}@media(max-width:620px){.service-heading{align-items:flex-start;gap:12px}.service-overview,.service-filter,.service-modal form{grid-template-columns:1fr}.service-modal .wide,.service-modal form>footer{grid-column:auto}}
</style>
