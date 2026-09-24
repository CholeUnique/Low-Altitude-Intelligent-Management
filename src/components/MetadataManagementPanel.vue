<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  addMetadataItem,
  addMetadataType,
  deleteMetadataItem,
  deleteMetadataType,
  getMetadataItemDetail,
  getMetadataItems,
  getMetadataOptions,
  getMetadataTree,
  getMetadataTypeDetail,
  getMetadataTypes,
  updateMetadataItem,
  updateMetadataItemStatus,
  updateMetadataType,
  updateMetadataTypeStatus,
  type MetadataItem,
  type MetadataOption,
  type MetadataTreeNode,
  type MetadataType,
} from '@/api/metadata'

type EditorMode = 'add' | 'edit' | 'view'

const types = ref<MetadataType[]>([])
const items = ref<MetadataItem[]>([])
const treeNodes = ref<MetadataTreeNode[]>([])
const optionNodes = ref<MetadataOption[]>([])
const itemView = ref<'list' | 'tree' | 'options'>('list')
const selectedTypeId = ref('')
const typeLoading = ref(false)
const itemLoading = ref(false)
const busy = ref(false)
const notice = ref('')
const errorMessage = ref('')
const typeFilters = reactive<{ keyword: string; status: number | '' }>({ keyword: '', status: '' })
const itemFilters = reactive<{ keyword: string; status: number | ''; parentId: string }>({ keyword: '', status: '', parentId: '' })

const selectedType = computed(() => types.value.find((item) => String(item.id) === selectedTypeId.value))
const parentOptions = computed(() => items.value.filter((item) => item.level < (selectedType.value?.maxLevel || Number.MAX_SAFE_INTEGER)))

interface FlatNode {
  id: string
  code: string
  name: string
  depth: number
  status?: number
  childCount: number
}

function flattenNodes(nodes: Array<MetadataTreeNode | MetadataOption>, depth = 0): FlatNode[] {
  return nodes.flatMap((node) => [
    {
      id: String(node.id),
      code: node.code,
      name: node.name,
      depth,
      status: 'status' in node ? node.status : undefined,
      childCount: node.children?.length || 0,
    },
    ...flattenNodes(node.children || [], depth + 1),
  ])
}

const flatTreeNodes = computed(() => flattenNodes(treeNodes.value))
const flatOptionNodes = computed(() => flattenNodes(optionNodes.value))
const enabledItemCount = computed(() => items.value.filter((item) => item.status !== 0).length)

function normalizeType(value: MetadataType): MetadataType {
  return { ...value, id: String(value.id) }
}

function normalizeItem(value: MetadataItem): MetadataItem {
  return {
    ...value,
    id: String(value.id),
    typeId: String(value.typeId),
    parentId: value.parentId == null ? '' : String(value.parentId),
  }
}

function showSuccess(message: string) {
  notice.value = message
  errorMessage.value = ''
  window.setTimeout(() => { if (notice.value === message) notice.value = '' }, 2600)
}

function showError(error: unknown) {
  errorMessage.value = error instanceof Error ? error.message : '操作失败，请稍后重试'
  notice.value = ''
}

async function loadTypes(keepSelection = true) {
  typeLoading.value = true
  try {
    const result = await getMetadataTypes(typeFilters)
    types.value = (result || []).map(normalizeType)
    if (!keepSelection || !types.value.some((item) => String(item.id) === selectedTypeId.value)) {
      selectedTypeId.value = types.value[0] ? String(types.value[0].id) : ''
    }
    await loadItems()
  } catch (error) {
    showError(error)
  } finally {
    typeLoading.value = false
  }
}

async function loadItems() {
  if (!selectedType.value) {
    items.value = []
    treeNodes.value = []
    optionNodes.value = []
    return
  }
  itemLoading.value = true
  try {
    const typeCode = selectedType.value.code
    const [itemResult, treeResult, optionResult] = await Promise.all([
      getMetadataItems({
        typeCode,
        keyword: itemFilters.keyword,
        status: itemFilters.status,
        parentId: itemFilters.parentId,
      }),
      getMetadataTree(typeCode, false),
      getMetadataOptions(typeCode),
    ])
    items.value = (itemResult || []).map(normalizeItem)
    treeNodes.value = treeResult || []
    optionNodes.value = optionResult || []
  } catch (error) {
    showError(error)
  } finally {
    itemLoading.value = false
  }
}

async function selectType(row: MetadataType) {
  selectedTypeId.value = String(row.id)
  Object.assign(itemFilters, { keyword: '', status: '', parentId: '' })
  await loadItems()
}

const typeEditorOpen = ref(false)
const typeEditorMode = ref<EditorMode>('add')
const typeForm = reactive({ id: '', code: '', name: '', description: '', maxLevel: 0, sort: 0, status: 1 })
const typeEditorTitle = computed(() => ({ add: '新增元数据类型', edit: '编辑元数据类型', view: '元数据类型详情' })[typeEditorMode.value])

async function openTypeEditor(mode: EditorMode, row?: MetadataType) {
  typeEditorMode.value = mode
  Object.assign(typeForm, { id: '', code: '', name: '', description: '', maxLevel: 0, sort: 0, status: 1 })
  if (row) {
    busy.value = true
    try {
      const detail = normalizeType(await getMetadataTypeDetail(String(row.id)))
      Object.assign(typeForm, detail)
    } catch (error) {
      showError(error)
      return
    } finally {
      busy.value = false
    }
  }
  typeEditorOpen.value = true
}

async function submitType() {
  if (!/^[a-zA-Z0-9_]{2,50}$/.test(typeForm.code)) return showError(new Error('类型编码需为 2–50 位字母、数字或下划线'))
  if (!typeForm.name.trim()) return showError(new Error('请输入类型名称'))
  busy.value = true
  try {
    const common = {
      code: typeForm.code.trim(), name: typeForm.name.trim(), description: typeForm.description,
      maxLevel: Number(typeForm.maxLevel || 0), sort: Number(typeForm.sort || 0), status: Number(typeForm.status),
    }
    if (typeEditorMode.value === 'add') await addMetadataType(common)
    else await updateMetadataType({ id: typeForm.id, ...common })
    typeEditorOpen.value = false
    showSuccess(typeEditorMode.value === 'add' ? '元数据类型已新增' : '元数据类型已更新')
    await loadTypes()
  } catch (error) {
    showError(error)
  } finally {
    busy.value = false
  }
}

async function toggleType(row: MetadataType) {
  const next = row.status === 0 ? 1 : 0
  if (!window.confirm(`确认${next ? '启用' : '停用'}元数据类型“${row.name}”吗？`)) return
  try {
    await updateMetadataTypeStatus(String(row.id), next)
    showSuccess(`元数据类型已${next ? '启用' : '停用'}`)
    await loadTypes()
  } catch (error) { showError(error) }
}

async function removeType(row: MetadataType) {
  if (!window.confirm(`确认删除元数据类型“${row.name}”吗？类型下存在条目时后端将拒绝删除。`)) return
  try {
    await deleteMetadataType(String(row.id))
    showSuccess('元数据类型已删除')
    await loadTypes(false)
  } catch (error) { showError(error) }
}

const itemEditorOpen = ref(false)
const itemEditorMode = ref<EditorMode>('add')
const itemForm = reactive({ id: '', typeId: '', parentId: '', code: '', name: '', sort: 0, remark: '' })
const itemEditorTitle = computed(() => ({ add: '新增元数据条目', edit: '编辑元数据条目', view: '元数据条目详情' })[itemEditorMode.value])

async function openItemEditor(mode: EditorMode, row?: MetadataItem) {
  if (!selectedType.value) return showError(new Error('请先选择元数据类型'))
  itemEditorMode.value = mode
  Object.assign(itemForm, { id: '', typeId: selectedTypeId.value, parentId: '', code: '', name: '', sort: 0, remark: '' })
  if (row) {
    busy.value = true
    try {
      const detail = normalizeItem(await getMetadataItemDetail(String(row.id)))
      Object.assign(itemForm, detail)
    } catch (error) {
      showError(error)
      return
    } finally {
      busy.value = false
    }
  }
  itemEditorOpen.value = true
}

async function submitItem() {
  if (!/^[a-zA-Z0-9]{1,50}$/.test(itemForm.code)) return showError(new Error('条目编码需为 1–50 位字母或数字'))
  if (!itemForm.name.trim()) return showError(new Error('请输入条目名称'))
  busy.value = true
  try {
    const editable = { code: itemForm.code.trim(), name: itemForm.name.trim(), sort: Number(itemForm.sort || 0), remark: itemForm.remark }
    if (itemEditorMode.value === 'add') {
      await addMetadataItem({ ...editable, typeId: selectedTypeId.value, parentId: itemForm.parentId || undefined })
    } else {
      await updateMetadataItem({ id: itemForm.id, ...editable })
    }
    itemEditorOpen.value = false
    showSuccess(itemEditorMode.value === 'add' ? '元数据条目已新增' : '元数据条目已更新')
    await loadItems()
  } catch (error) {
    showError(error)
  } finally {
    busy.value = false
  }
}

async function toggleItem(row: MetadataItem) {
  const next = row.status === 0 ? 1 : 0
  if (!window.confirm(`确认${next ? '启用' : '停用'}元数据条目“${row.name}”吗？`)) return
  try {
    await updateMetadataItemStatus(String(row.id), next)
    showSuccess(`元数据条目已${next ? '启用' : '停用'}`)
    await loadItems()
  } catch (error) { showError(error) }
}

async function removeItem(row: MetadataItem) {
  if (!window.confirm(`确认删除元数据条目“${row.name}”吗？存在子项时后端将拒绝删除。`)) return
  try {
    await deleteMetadataItem(String(row.id))
    showSuccess('元数据条目已删除')
    await loadItems()
  } catch (error) { showError(error) }
}

function parentName(parentId?: string) {
  if (!parentId || parentId === '0') return '一级条目'
  return items.value.find((item) => String(item.id) === String(parentId))?.name || parentId
}

onMounted(() => void loadTypes(false))
</script>

<template>
  <div class="metadata-panel">
    <div v-if="notice" class="metadata-message metadata-message--success">{{ notice }}</div>
    <div v-if="errorMessage" class="metadata-message metadata-message--error">{{ errorMessage }}<button type="button" @click="errorMessage = ''">×</button></div>
    <div class="metadata-heading">
      <div><h2>元数据管理</h2><p>维护系统字典类型及其层级条目，启停后将影响业务下拉选项</p></div>
    </div>

    <div class="metadata-layout">
      <section class="metadata-card type-card">
        <header>
          <div><h3>元数据类型</h3><span>{{ types.length }} 项</span></div>
          <button class="metadata-button metadata-button--primary" type="button" @click="openTypeEditor('add')">＋ 新增类型</button>
        </header>
        <form class="metadata-filter type-filter" @submit.prevent="loadTypes(false)">
          <input v-model.trim="typeFilters.keyword" placeholder="搜索类型名称或编码">
          <select v-model="typeFilters.status"><option value="">全部状态</option><option :value="1">启用</option><option :value="0">停用</option></select>
          <button type="submit">查询</button>
        </form>
        <div class="type-list">
          <div v-if="typeLoading" class="metadata-empty">正在加载元数据类型…</div>
          <div v-else-if="!types.length" class="metadata-empty">暂无元数据类型</div>
          <article v-for="row in types" v-else :key="row.id" :class="{ active: String(row.id) === selectedTypeId }" @click="selectType(row)">
            <div class="type-title"><strong>{{ row.name }}</strong><span class="metadata-status" :class="row.status === 0 ? 'off' : 'on'">{{ row.status === 0 ? '停用' : '启用' }}</span></div>
            <code>{{ row.code }}</code><p>{{ row.description || '暂无描述' }}</p>
            <footer><span>最大层级：{{ row.maxLevel === 0 ? '不限' : row.maxLevel }}</span><span>排序：{{ row.sort ?? 0 }}</span></footer>
            <div class="type-actions" @click.stop><button @click="openTypeEditor('view', row)">详情</button><button @click="openTypeEditor('edit', row)">编辑</button><button @click="toggleType(row)">{{ row.status === 0 ? '启用' : '停用' }}</button><button class="danger" @click="removeType(row)">删除</button></div>
          </article>
        </div>
      </section>

      <section class="metadata-card item-card">
        <header class="item-card-header">
          <div><h3>{{ selectedType ? `${selectedType.name} · 条目` : '元数据条目' }}</h3><span>{{ items.length }} 项</span></div>
          <div class="item-header-actions">
            <div class="view-switch"><button :class="{ active: itemView === 'list' }" type="button" @click="itemView = 'list'">条目管理</button><button :class="{ active: itemView === 'tree' }" type="button" @click="itemView = 'tree'">层级树</button><button :class="{ active: itemView === 'options' }" type="button" @click="itemView = 'options'">下拉预览</button></div>
            <button class="metadata-button metadata-button--primary" type="button" :disabled="!selectedType" @click="openItemEditor('add')">＋ 新增条目</button>
          </div>
        </header>
        <div v-if="selectedType" class="metadata-overview"><div><span>全部条目</span><strong>{{ items.length }}</strong></div><div><span>启用条目</span><strong>{{ enabledItemCount }}</strong></div><div><span>层级节点</span><strong>{{ flatTreeNodes.length }}</strong></div><div><span>业务可选项</span><strong>{{ flatOptionNodes.length }}</strong></div></div>
        <form v-if="itemView === 'list'" class="metadata-filter item-filter" @submit.prevent="loadItems">
          <input v-model.trim="itemFilters.keyword" placeholder="搜索条目名称或编码">
          <select v-model="itemFilters.parentId"><option value="">全部层级</option><option value="0">仅一级条目</option><option v-for="item in items" :key="item.id" :value="item.id">{{ item.name }}</option></select>
          <select v-model="itemFilters.status"><option value="">全部状态</option><option :value="1">启用</option><option :value="0">停用</option></select>
          <button type="submit">查询</button>
          <button type="button" @click="Object.assign(itemFilters, { keyword: '', status: '', parentId: '' }); loadItems()">重置</button>
        </form>
        <div v-if="itemView === 'list'" class="metadata-table-wrap">
          <table>
            <thead><tr><th>条目名称</th><th>编码</th><th>层级</th><th>父级</th><th>排序</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-if="itemLoading"><td colspan="7" class="metadata-empty">正在加载元数据条目…</td></tr>
              <tr v-else-if="!selectedType"><td colspan="7" class="metadata-empty">请从左侧选择元数据类型</td></tr>
              <tr v-else-if="!items.length"><td colspan="7" class="metadata-empty">该类型暂无条目</td></tr>
              <tr v-for="row in items" v-else :key="row.id">
                <td><strong>{{ row.name }}</strong><small>{{ row.remark || '-' }}</small></td><td><code>{{ row.code }}</code></td><td>{{ row.level }} 级</td><td>{{ parentName(row.parentId) }}</td><td>{{ row.sort ?? 0 }}</td><td><span class="metadata-status" :class="row.status === 0 ? 'off' : 'on'">{{ row.status === 0 ? '停用' : '启用' }}</span></td>
                <td class="row-actions"><button @click="openItemEditor('view', row)">详情</button><button @click="openItemEditor('edit', row)">编辑</button><button @click="toggleItem(row)">{{ row.status === 0 ? '启用' : '停用' }}</button><button class="danger" @click="removeItem(row)">删除</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else-if="itemView === 'tree'" class="tree-preview">
          <div class="preview-intro"><div><strong>完整层级结构</strong><p>包含启用和停用条目，便于检查父子关系。</p></div><span>{{ flatTreeNodes.length }} 个节点</span></div>
          <div v-if="itemLoading" class="metadata-empty">正在读取条目树…</div><div v-else-if="!flatTreeNodes.length" class="metadata-empty">暂无树形条目</div>
          <article v-for="node in flatTreeNodes" v-else :key="node.id" class="tree-node" :style="{ '--depth': node.depth }"><span class="tree-connector">{{ node.childCount ? '▾' : '•' }}</span><div><strong>{{ node.name }}</strong><code>{{ node.code }}</code></div><small>{{ node.depth + 1 }} 级</small><span class="metadata-status" :class="node.status === 0 ? 'off' : 'on'">{{ node.status === 0 ? '停用' : '启用' }}</span></article>
        </div>
        <div v-else class="tree-preview option-preview">
          <div class="preview-intro"><div><strong>业务下拉选项预览</strong><p>只展示业务表单中实际可选择的启用条目。</p></div><span>{{ flatOptionNodes.length }} 个选项</span></div>
          <div v-if="itemLoading" class="metadata-empty">正在读取下拉选项…</div><div v-else-if="!flatOptionNodes.length" class="metadata-empty">当前没有可用选项</div>
          <article v-for="node in flatOptionNodes" v-else :key="node.id" class="option-node" :style="{ '--depth': node.depth }"><span class="option-icon">{{ node.depth ? '└' : '◆' }}</span><div><strong>{{ node.name }}</strong><code>表单值：{{ node.code }}</code></div><small v-if="node.childCount">{{ node.childCount }} 个子选项</small><span class="option-ready">可用</span></article>
        </div>
      </section>
    </div>

    <div v-if="typeEditorOpen" class="metadata-modal-mask" @mousedown.self="typeEditorOpen = false">
      <section class="metadata-modal"><header><div><h2>{{ typeEditorTitle }}</h2><p>维护元数据大类配置</p></div><button @click="typeEditorOpen = false">×</button></header>
        <form @submit.prevent="submitType">
          <label><span>类型编码 *</span><input v-model.trim="typeForm.code" :disabled="typeEditorMode === 'view'" maxlength="50" required></label><label><span>类型名称 *</span><input v-model.trim="typeForm.name" :disabled="typeEditorMode === 'view'" maxlength="100" required></label>
          <label><span>最大层级</span><input v-model.number="typeForm.maxLevel" type="number" min="0" max="10" :disabled="typeEditorMode === 'view'"></label><label><span>排序</span><input v-model.number="typeForm.sort" type="number" :disabled="typeEditorMode === 'view'"></label>
          <label><span>状态</span><select v-model.number="typeForm.status" :disabled="typeEditorMode === 'view'"><option :value="1">启用</option><option :value="0">停用</option></select></label><label class="wide"><span>描述</span><textarea v-model.trim="typeForm.description" :disabled="typeEditorMode === 'view'" maxlength="255"></textarea></label>
          <footer><button type="button" @click="typeEditorOpen = false">{{ typeEditorMode === 'view' ? '关闭' : '取消' }}</button><button v-if="typeEditorMode !== 'view'" class="primary" type="submit" :disabled="busy">保存</button></footer>
        </form>
      </section>
    </div>

    <div v-if="itemEditorOpen" class="metadata-modal-mask" @mousedown.self="itemEditorOpen = false">
      <section class="metadata-modal"><header><div><h2>{{ itemEditorTitle }}</h2><p>{{ selectedType?.name }} · 条目配置</p></div><button @click="itemEditorOpen = false">×</button></header>
        <form @submit.prevent="submitItem">
          <label><span>条目编码 *</span><input v-model.trim="itemForm.code" :disabled="itemEditorMode === 'view'" maxlength="50" required></label><label><span>条目名称 *</span><input v-model.trim="itemForm.name" :disabled="itemEditorMode === 'view'" maxlength="100" required></label>
          <label><span>父级条目</span><select v-model="itemForm.parentId" :disabled="itemEditorMode !== 'add'"><option value="">无（一级条目）</option><option v-for="item in parentOptions" :key="item.id" :value="item.id">{{ item.name }}（{{ item.level }}级）</option></select></label><label><span>排序</span><input v-model.number="itemForm.sort" type="number" :disabled="itemEditorMode === 'view'"></label>
          <label class="wide"><span>备注</span><textarea v-model.trim="itemForm.remark" :disabled="itemEditorMode === 'view'" maxlength="255"></textarea></label>
          <footer><button type="button" @click="itemEditorOpen = false">{{ itemEditorMode === 'view' ? '关闭' : '取消' }}</button><button v-if="itemEditorMode !== 'view'" class="primary" type="submit" :disabled="busy">保存</button></footer>
        </form>
      </section>
    </div>
  </div>
</template>

<style scoped>
.metadata-panel{color:#dceef5}.metadata-heading{min-height:54px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between}.metadata-heading h2,.metadata-heading p,.metadata-card h3,.metadata-modal h2,.metadata-modal p{margin:0}.metadata-heading h2{font-size:25px;color:#fff}.metadata-heading p{margin-top:6px;color:#75a2b4;font-size:14px}.metadata-button{min-height:40px;padding:0 17px;border-radius:3px;font-size:14px;cursor:pointer}.metadata-button--primary{color:#fff;background:linear-gradient(135deg,#1488b5,#16a9c6);border:1px solid #42cbe9}.metadata-button:disabled{opacity:.45;cursor:not-allowed}.metadata-layout{display:grid;grid-template-columns:minmax(330px,36%) minmax(0,1fr);gap:18px}.metadata-card{min-height:650px;overflow:hidden;background:#0b2638e8;border:1px solid #1b536b;border-radius:6px;box-shadow:0 12px 30px #00121d44}.metadata-card>header{min-height:62px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:#0d2d41;border-bottom:1px solid #1b536b}.metadata-card>header>div{display:flex;align-items:center;gap:10px}.metadata-card h3{font-size:18px;color:#edfaff}.metadata-card header span{color:#6fa1b4;font-size:12px}.metadata-filter{padding:12px;display:grid;gap:8px;background:#0a2435;border-bottom:1px solid #173e51}.type-filter{grid-template-columns:minmax(0,1fr) 105px auto}.item-filter{grid-template-columns:minmax(170px,1fr) 160px 110px auto auto}.metadata-filter input,.metadata-filter select{width:100%;min-height:40px;padding:0 10px;box-sizing:border-box;color:#e9f8fc;background:#071d2b;border:1px solid #20546a;border-radius:3px;font-size:13px}.metadata-filter button,.type-actions button,.row-actions button{color:#77d6f1;background:transparent;border:0;cursor:pointer}.metadata-filter button{padding:0 12px;background:#0b4058;border:1px solid #236984;border-radius:3px}.type-list{max-height:calc(100vh - 285px);overflow:auto;padding:10px}.type-list article{position:relative;margin-bottom:8px;padding:14px;background:#092233;border:1px solid #17495f;border-radius:5px;cursor:pointer}.type-list article:hover,.type-list article.active{background:#0d3348;border-color:#2ca0c5}.type-list article.active:before{position:absolute;inset:0 auto 0 0;width:3px;content:"";background:#3bd6ff}.type-title{display:flex;justify-content:space-between;align-items:center}.type-title strong{color:#effaff;font-size:15px}.type-list code,.metadata-table-wrap code{color:#61c8e8}.type-list p{height:34px;margin:9px 0;color:#759aa9;font-size:12px;line-height:1.45;overflow:hidden}.type-list footer{display:flex;gap:16px;color:#658d9e;font-size:11px}.type-actions{margin-top:10px;padding-top:8px;border-top:1px solid #163e50}.type-actions button{padding:2px 8px}.type-actions .danger,.row-actions .danger{color:#ef8794}.metadata-status{padding:3px 7px;border-radius:3px;font-size:11px}.metadata-status.on{color:#79e5c4;background:#174a43}.metadata-status.off{color:#e9a4ad;background:#512b34}.metadata-table-wrap{max-height:calc(100vh - 285px);overflow:auto}.metadata-table-wrap table{width:100%;min-width:820px;border-collapse:collapse;font-size:13px}.metadata-table-wrap th{height:42px;padding:0 11px;color:#78a7b8;background:#081f2e;text-align:left;font-weight:500}.metadata-table-wrap td{height:55px;padding:8px 11px;color:#c4dae3;border-top:1px solid #153d50}.metadata-table-wrap tbody tr:hover{background:#0f3043}.metadata-table-wrap td strong,.metadata-table-wrap td small{display:block}.metadata-table-wrap td strong{color:#edfaff;font-weight:500}.metadata-table-wrap td small{margin-top:4px;color:#668d9d;font-size:11px}.row-actions{white-space:nowrap}.row-actions button{padding:3px 5px;font-size:12px}.metadata-empty{height:220px!important;color:#6f98a8!important;text-align:center!important}.type-list .metadata-empty{display:grid;place-items:center}.metadata-message{position:fixed;top:82px;left:50%;z-index:120;max-width:560px;padding:11px 40px 11px 16px;transform:translateX(-50%);color:#fff;border-radius:4px;box-shadow:0 10px 30px #00131faa;font-size:13px}.metadata-message--success{background:#167b6a;border:1px solid #42c9a8}.metadata-message--error{background:#8e3544;border:1px solid #e26d7b}.metadata-message button{position:absolute;top:4px;right:7px;color:#fff;background:transparent;border:0;font-size:20px;cursor:pointer}.metadata-modal-mask{position:fixed;inset:0;z-index:110;padding:30px;display:grid;place-items:center;background:#00111ccc;backdrop-filter:blur(3px)}.metadata-modal{width:min(720px,95vw);max-height:92vh;overflow:auto;background:#0b2638;border:1px solid #2583a5;border-radius:7px;box-shadow:0 22px 70px #000b}.metadata-modal>header{padding:18px 22px;display:flex;justify-content:space-between;align-items:center;background:#0d3045;border-bottom:1px solid #205f78}.metadata-modal h2{color:#fff;font-size:20px}.metadata-modal header p{margin-top:4px;color:#6f9bab;font-size:13px}.metadata-modal header button{width:32px;height:32px;color:#9fc5d2;background:transparent;border:0;font-size:24px;cursor:pointer}.metadata-modal form{padding:22px;display:grid;grid-template-columns:1fr 1fr;gap:16px}.metadata-modal label span{display:block;margin-bottom:7px;color:#85aab8;font-size:13px}.metadata-modal input,.metadata-modal select,.metadata-modal textarea{width:100%;min-height:42px;padding:0 11px;box-sizing:border-box;color:#e9f8fc;background:#071d2b;border:1px solid #20546a;border-radius:3px;font-size:14px}.metadata-modal textarea{min-height:80px;padding-top:9px;resize:vertical}.metadata-modal input:disabled,.metadata-modal select:disabled,.metadata-modal textarea:disabled{color:#7894a0;background:#102530}.metadata-modal .wide{grid-column:1/-1}.metadata-modal form>footer{grid-column:1/-1;display:flex;justify-content:flex-end;gap:10px}.metadata-modal form>footer button{min-height:40px;padding:0 18px;color:#aedbea;background:#0a2738;border:1px solid #276781;border-radius:3px;cursor:pointer}.metadata-modal form>footer .primary{color:#fff;background:linear-gradient(135deg,#1488b5,#16a9c6);border-color:#42cbe9}@media(max-width:1200px){.metadata-layout{grid-template-columns:1fr}.metadata-card{min-height:400px}.type-list,.metadata-table-wrap{max-height:480px}.item-filter{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.metadata-heading{align-items:flex-start;gap:12px}.metadata-filter,.item-filter,.type-filter,.metadata-modal form{grid-template-columns:1fr}.metadata-modal .wide,.metadata-modal form>footer{grid-column:auto}}
.item-header-actions{display:flex!important;align-items:center;gap:12px!important}.view-switch{padding:3px;display:flex!important;gap:2px!important;background:#071d2b;border:1px solid #1d5269;border-radius:5px}.view-switch button{min-height:32px;padding:0 11px;color:#7faabb;background:transparent;border:0;border-radius:3px;cursor:pointer}.view-switch button.active{color:#effcff;background:#126185;box-shadow:0 2px 8px #00172288}.metadata-overview{padding:10px 14px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;background:linear-gradient(90deg,#0b2d41,#092537);border-bottom:1px solid #17475b}.metadata-overview>div{padding:8px 11px;display:flex;align-items:center;justify-content:space-between;background:#081f2e;border:1px solid #16465c;border-radius:4px}.metadata-overview span{color:#719baa;font-size:11px}.metadata-overview strong{color:#6edaf4;font-size:16px}.tree-preview{max-height:calc(100vh - 390px);overflow:auto}.preview-intro{margin:14px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#0d3348,#09283a);border:1px solid #1d5a73;border-radius:6px}.preview-intro strong{color:#effaff;font-size:14px}.preview-intro p{margin:5px 0 0;color:#7299aa;font-size:12px}.preview-intro>span{padding:5px 9px;color:#70d8f1;background:#0a4963;border-radius:12px;font-size:11px}.tree-node,.option-node{min-height:48px;margin:0 14px;padding:6px 12px 6px calc(14px + var(--depth) * 28px);display:grid;grid-template-columns:22px minmax(0,1fr) auto auto;align-items:center;gap:10px;border-top:1px solid #143b4d}.tree-node:hover,.option-node:hover{background:#0d3043}.tree-connector,.option-icon{color:#43c9ed}.tree-node strong,.tree-node code,.option-node strong,.option-node code{display:block}.tree-node strong,.option-node strong{color:#e8f8fd;font-size:13px}.tree-node code,.option-node code{margin-top:2px;color:#609caf;font-size:11px}.tree-node small,.option-node small{color:#7297a7;font-size:11px}.option-ready{padding:3px 8px;color:#79e5c4;background:#174a43;border-radius:3px;font-size:11px}.tree-preview>.metadata-empty{display:grid;place-items:center}@media(max-width:1200px){.tree-preview{max-height:480px}.item-card-header{align-items:flex-start!important;padding:12px 18px!important}.item-header-actions{align-items:flex-end;flex-direction:column}}@media(max-width:720px){.view-switch button{padding:0 7px}.metadata-overview{grid-template-columns:repeat(2,1fr)}}
</style>
