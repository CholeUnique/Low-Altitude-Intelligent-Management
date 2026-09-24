<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { algorithmModels } from '@/mocks/data'
import type { AlgorithmModel } from '@/types'

const router = useRouter()
const route = useRoute()
const props = defineProps<{ embedded?: boolean }>()
const keyword = ref('')
const scene = ref('全部场景')
const category = ref('全部算法')
const source = ref('AI算法')
const pageSize = ref(8)
const currentPage = ref(1)
const gotoPage = ref('1')
const selected = ref<AlgorithmModel>()
const activeDetailTab = ref<'info' | 'validation'>('info')
const now = ref(new Date())
const timer = window.setInterval(() => { now.value = new Date() }, 1000)

const scenes = computed(() => ['全部场景', ...Array.from(new Set(algorithmModels.map((item) => item.scene)))])
const categories = ['全部算法', '目标识别', '变化检测', '分割提取', 'OCR识别', '大模型', '三维重建']
const filteredModels = computed(() => algorithmModels.filter((item) =>
  (scene.value === '全部场景' || item.scene === scene.value)
  && (category.value === '全部算法' || item.category === category.value || item.type === category.value)
  && (!keyword.value.trim() || `${item.name}${item.description}${item.tags.join(' ')}`.toLowerCase().includes(keyword.value.trim().toLowerCase())),
))
const pageCount = computed(() => Math.max(1, Math.ceil(filteredModels.value.length / pageSize.value)))
const pageModels = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredModels.value.slice(start, start + pageSize.value)
})
const gridShape = computed(() => {
  const columns = pageSize.value === 4 ? 2 : pageSize.value === 24 ? 6 : 4
  return { columns, rows: Math.ceil(pageSize.value / columns) }
})
const paginationItems = computed<(number | 'ellipsis')[]>(() => {
  const total = pageCount.value
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const numbers = new Set([1, total, currentPage.value - 2, currentPage.value - 1, currentPage.value, currentPage.value + 1, currentPage.value + 2])
  const sorted = [...numbers].filter((item) => item > 0 && item <= total).sort((a, b) => a - b)
  return sorted.flatMap((item, index) => index && item - sorted[index - 1]! > 1 ? ['ellipsis', item] : [item]) as (number | 'ellipsis')[]
})
const dateText = computed(() => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(now.value))
const timeText = computed(() => now.value.toLocaleTimeString('zh-CN', { hour12: false }))

function openDetail(model: AlgorithmModel) {
  selected.value = model
  activeDetailTab.value = 'info'
}

function openAlgorithmFromRoute(value: unknown) {
  const id = typeof value === 'string' ? value : undefined
  selected.value = id ? algorithmModels.find((item) => item.id === id) : undefined
}

function setPage(page: number) {
  currentPage.value = Math.min(Math.max(1, page), pageCount.value)
  gotoPage.value = String(currentPage.value)
}

function applyGoToPage() {
  const page = Number.parseInt(gotoPage.value, 10)
  setPage(Number.isFinite(page) ? page : currentPage.value)
}

function setPageSize(size: number) {
  pageSize.value = size
  setPage(1)
}

watch([keyword, scene, category, source], () => setPage(1))
watch(pageCount, () => setPage(currentPage.value))
watch(() => route.query.algorithm, openAlgorithmFromRoute, { immediate: true })

onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <div class="algorithm-page" :class="{ embedded: props.embedded }">
    <header v-if="!props.embedded" class="algorithm-header">
      <div class="algorithm-title">
        <button class="back-button" aria-label="返回运行中枢" @click="router.push('/dashboard')">‹ <span>返回</span></button>
        <span class="algorithm-logo">◆</span>
        <h1>算法能力仓库</h1><i></i>
        <p>天地协同 · 智慧感知 · 精准治理 · 服务发展</p>
      </div>
      <div class="algorithm-user"><span class="system-online"><i></i>系统运行正常</span><span class="header-time">{{ dateText }}　{{ timeText }}</span><button class="notification">♧<b>3</b></button><button class="user-button">●　管理员　⌄</button></div>
    </header>

    <main class="algorithm-main">
      <section class="algorithm-controls">
        <div class="search-row">
          <label class="algorithm-search"><span>⌕</span><input v-model="keyword" placeholder="搜索算法名称 / 功能关键词" @keyup.enter="keyword = keyword.trim()" /><button @click="keyword = keyword.trim()">搜索</button></label>
          <div class="import-actions"><button class="primary-action">⇧ 上传算法</button><button>⇩ 导入算法</button></div>
        </div>
        <div class="filter-row"><strong>场景标签：</strong><div class="filter-options"><button v-for="item in scenes" :key="item" :class="{ active: scene === item }" @click="scene = item">{{ item }}</button></div></div>
        <div class="filter-row"><strong>算法类型：</strong><div class="filter-options"><button v-for="item in categories" :key="item" :class="{ active: category === item }" @click="category = item">{{ item }}</button></div><div class="source-filter"><button :class="{ active: source === 'AI算法' }" @click="source = 'AI算法'">AI算法</button><button :class="{ active: source === '大模型' }" @click="source = '大模型'">云端实例</button></div></div>
      </section>

      <p v-if="!filteredModels.length" class="empty-state">没有匹配的算法，请调整筛选条件。</p>
      <section v-else class="algorithm-grid" :style="{ '--grid-columns': gridShape.columns, '--grid-rows': gridShape.rows }">
        <article v-for="model in pageModels" :key="model.id" class="algorithm-card" tabindex="0" @click="openDetail(model)" @keyup.enter="openDetail(model)">
          <div class="algorithm-visual" :class="`visual-${model.visual}`">
            <span class="type-badge">{{ model.type }}</span><span class="deployment"><i></i>{{ model.status }}</span>
            <template v-if="model.comparison"><div class="comparison-side before"><span>{{ model.comparison.before }}</span></div><div class="comparison-side after"><span>{{ model.comparison.after }}</span></div><b class="comparison-slider">‹ ›</b></template>
            <template v-else><i class="detection-box"></i><i class="detection-box secondary"></i></template>
            <div class="media-overlay">支持：{{ model.supportedMedia.join('、') }}</div>
          </div>
          <div class="algorithm-card__body"><h2>{{ model.name }}</h2><p>{{ model.description }}</p><div class="algorithm-tags"><span v-for="tag in model.tags" :key="tag">{{ tag }}</span><b v-if="model.recommended">★ 推荐</b></div></div>
        </article>
      </section>

      <footer class="algorithm-pagination"><div>共 <b>{{ filteredModels.length }}</b> 个算法模型　每页显示 <select :value="pageSize" aria-label="每页显示条数" @change="setPageSize(Number(($event.target as HTMLSelectElement).value))"><option v-for="size in [4, 8, 12]" :key="size" :value="size">{{ size }}</option></select> 条</div><div class="page-controls"><button :disabled="currentPage === 1" @click="setPage(currentPage - 1)">‹</button><template v-for="(item, index) in paginationItems" :key="`${item}-${index}`"><span v-if="item === 'ellipsis'">…</span><button v-else :class="{ active: currentPage === item }" @click="setPage(item)">{{ item }}</button></template><button :disabled="currentPage === pageCount" @click="setPage(currentPage + 1)">›</button><label>前往 <input v-model="gotoPage" inputmode="numeric" @keyup.enter="applyGoToPage" @blur="applyGoToPage" /> 页</label></div></footer>
    </main>

    <div v-if="selected" class="algorithm-modal-backdrop" @click.self="selected = undefined">
      <section class="algorithm-modal" role="dialog" aria-modal="true" :aria-label="`${selected.name}详情`">
        <header><h2>{{ selected.name }}</h2><div class="modal-tabs"><button :class="{ active: activeDetailTab === 'info' }" @click="activeDetailTab = 'info'">算法信息</button><button :class="{ active: activeDetailTab === 'validation' }" @click="activeDetailTab = 'validation'">效果验证</button></div><button class="modal-close" aria-label="关闭" @click="selected = undefined">×</button></header>
        <div v-if="activeDetailTab === 'info'" class="modal-content"><dl><div><dt>算法名称</dt><dd>{{ selected.name }}</dd></div><div><dt>算法类型</dt><dd>{{ selected.type }} · {{ selected.category }}</dd></div><div><dt>场景标签</dt><dd>{{ selected.scene }}</dd></div><div><dt>支持输入媒体</dt><dd>{{ selected.supportedMedia.join('、') }}</dd></div><div><dt>算法状态</dt><dd><span class="modal-status"><i></i>{{ selected.status }}</span></dd></div><div><dt>算法描述</dt><dd>{{ selected.description }}</dd></div></dl><h3>专属信息</h3><div class="detail-placeholder">模型配置将在导入真实算法后展示。</div><h3>算法参数</h3><div class="detail-placeholder">暂无已配置的运行参数。</div></div>
        <div v-else class="validation-empty">暂未上传该算法的验证样本与评测结果。</div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.algorithm-page { width: 100%; min-width: 0; min-height: 100dvh; display: flex; flex-direction: column; color: #e8f5ff; background: radial-gradient(circle at 50% -20%, #0873bd66, transparent 35%), linear-gradient(135deg, #020f25, #031c38 58%, #03142d); font-family: "Microsoft YaHei", sans-serif; }.algorithm-page.embedded { min-height:0; height:100%; }
.algorithm-header { height: 78px; display: flex; align-items: center; justify-content: space-between; padding: 0 32px; border-bottom: 1px solid #1685c5; background: linear-gradient(90deg, #032b59, #064f8d 50%, #022b57); box-shadow: 0 3px 18px #0088ff55; }.algorithm-title,.algorithm-user { display: flex; align-items: center; gap: 16px; }.back-button,.user-button,.notification { border: 0; color: #d9edff; background: transparent; cursor: pointer; }.back-button { padding: 7px 13px; border: 1px solid #3695cf; border-radius: 4px; font-size: 16px; }.back-button span { font-size: 13px; }.algorithm-logo { color: #36d9ff; font-size: 32px; transform: rotate(45deg); }.algorithm-title h1 { margin: 0; color: #fff; font-size: 30px; letter-spacing: 2px; }.algorithm-title>i { height: 30px; border-left: 1px solid #55a6dd; }.algorithm-title p { margin: 0; color: #93c7ec; font-size: 14px; letter-spacing: 2px; }.system-online { color: #e5f6ff; font-size: 13px; }.system-online i,.deployment i,.modal-status i { display: inline-block; width: 9px; height: 9px; margin-right: 6px; border-radius: 50%; background: #21eba4; box-shadow: 0 0 10px #21eba4; }.header-time { color: #b5d6ec; font-size: 12px; }.notification { position: relative; font-size: 24px; }.notification b { position: absolute; top: -3px; right: -5px; display: grid; width: 16px; height: 16px; place-items: center; border-radius: 50%; background: #f05059; color: white; font-size: 10px; }.user-button { padding-left: 15px; border-left: 1px solid #4c93c8; }
.algorithm-main { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 18px 32px 20px; }.algorithm-controls { padding: 17px 20px; border: 1px solid #0d79b9; border-radius: 5px; background: #071d3de0; box-shadow: inset 0 0 24px #0563aa20; }.search-row,.filter-row { display: flex; align-items: center; gap: 18px; }.search-row { margin-bottom: 18px; justify-content: space-between; }.algorithm-search { display: flex; width: min(760px, 58vw); height: 42px; overflow: hidden; border: 1px solid #238dd1; border-radius: 4px; background: #041933; }.algorithm-search span { display: grid; place-items: center; width: 45px; color: #9dceef; font-size: 25px; }.algorithm-search input { min-width: 0; flex: 1; border: 0; outline: 0; color: #e6f6ff; background: transparent; font-size: 14px; }.algorithm-search input::placeholder { color: #739ab9; }.algorithm-search button,.primary-action,.import-actions button { padding: 0 28px; border: 1px solid #168ee0; color: #eaf8ff; background: #0869bb; font-weight: bold; cursor: pointer; }.import-actions { display: flex; gap: 16px; }.import-actions button { height: 42px; border-radius: 4px; background: transparent; }.import-actions .primary-action { background: linear-gradient(135deg, #526aff, #00a6fc); box-shadow: 0 0 13px #008dff88; }.filter-row { margin-top: 13px; }.filter-row strong { flex: 0 0 82px; color: #b3d5ef; font-size: 14px; }.filter-options { display: flex; flex-wrap: wrap; gap: 11px; }.filter-options button,.source-filter button,.algorithm-pagination button,.algorithm-pagination select { min-height: 33px; padding: 0 17px; border: 1px solid #28587f; border-radius: 4px; color: #a6c5df; background: #0b294a; cursor: pointer; }.filter-options button.active,.source-filter button.active,.algorithm-pagination button.active { border-color: #17c3ff; color: #fff; background: linear-gradient(135deg, #167ff3, #00b2f9); box-shadow: 0 0 10px #008cff88; }.source-filter { display: flex; margin-left: auto; overflow: hidden; border: 1px solid #176aa6; border-radius: 4px; }.source-filter button { min-width: 105px; border: 0; border-radius: 0; }.empty-state { flex: 1; display: grid; place-items: center; text-align: center; color: #8cb6d4; }
.algorithm-grid { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr)); grid-template-rows: repeat(var(--grid-rows), minmax(0, 1fr)); gap: 16px; margin-top: 18px; }.algorithm-card { min-height: 0; display: grid; grid-template-rows: minmax(64px, .95fr) minmax(78px, 1.05fr); overflow: hidden; border: 1px solid #1477b2; border-radius: 5px; background: #082347e6; box-shadow: 0 0 14px #001b3c; cursor: pointer; transition: transform .2s, border-color .2s, box-shadow .2s; }.algorithm-card:hover,.algorithm-card:focus { outline: 0; border-color: #39cfff; box-shadow: 0 0 20px #0393e666; transform: translateY(-3px); }.algorithm-visual { position: relative; min-height: 0; overflow: hidden; background-color: #31585a; background-image: linear-gradient(117deg, #fff1 0 2%, transparent 2% 15%, #fff1 15% 17%, transparent 17% 42%, #fff1 42% 44%, transparent 44%), repeating-linear-gradient(24deg, #0017 0 2px, transparent 2px 29px), linear-gradient(135deg, #487754, #193d3d); background-size: 100% 100%, 54px 54px, cover; }.visual-forest-building { background-image: radial-gradient(ellipse at 52% 52%, #cfc8a2 0 9%, transparent 10%), linear-gradient(135deg, #1c5135, #60924e 48%, #1a4c36); }.visual-forest-clearing { background-image: radial-gradient(ellipse at 50% 50%, #bc7e50 0 25%, transparent 26%), repeating-linear-gradient(35deg, #1c5539 0 14px, #396a3d 14px 28px); }.visual-construction { background-image: repeating-linear-gradient(90deg, #d3d1c4 0 10%, #727e7e 10% 18%, #d5c48d 18% 28%), linear-gradient(45deg, #5d716e, #c9c9ba); }.visual-farmland { background-image: repeating-linear-gradient(140deg, #456b26 0 24px, #85a843 24px 45px, #d0af5a 45px 68px); }.visual-road { background-image: linear-gradient(75deg, transparent 40%, #6b7073 40% 60%, transparent 60%), repeating-linear-gradient(12deg, #406c3a 0 18px, #8baa54 18px 33px); }.visual-water { background-image: linear-gradient(135deg, #4597a8 0 46%, #466e48 47% 70%, #b68051 71%), radial-gradient(circle, #7fae57, #346c4c); }.type-badge,.deployment { position: absolute; top: 10px; padding: 5px 9px; border: 1px solid #3e8fd0; border-radius: 3px; background: #07396fcf; color: #e1f4ff; font-size: 12px; }.type-badge { left: 10px; }.deployment { right: 10px; color: #40eab0; background: #042f2bd9; border-color: #148467; }.detection-box { position: absolute; left: 41%; top: 31%; width: 31%; height: 40%; border: 4px solid #ff4d4f; box-shadow: 0 0 0 1px #fbccca, 0 0 14px #ff2020; }.detection-box.secondary { left: 16%; top: 18%; width: 16%; height: 22%; border-width: 2px; }.media-overlay { position: absolute; right: 0; bottom: 0; left: 0; min-height: 42px; display: flex; align-items: center; padding: 8px 12px; color: #eef4f8; background: #252933dc; font-size: 12px; line-height: 1.5; transform: translateY(100%); transition: transform .25s ease; }.algorithm-card:hover .media-overlay,.algorithm-card:focus .media-overlay { transform: translateY(0); }.comparison-side { position: absolute; top: 0; bottom: 0; width: 50%; background: linear-gradient(45deg, #6c7779, #bd9c7c); }.comparison-side.before { left: 0; filter: saturate(.55); }.comparison-side.after { right: 0; background: linear-gradient(45deg, #2f6b43, #9bc76b); }.comparison-side span { position: absolute; bottom: 8px; left: 10px; padding: 3px 5px; color: white; background: #02182caa; font-size: 11px; }.comparison-slider { position: absolute; z-index: 2; top: 50%; left: calc(50% - 15px); display: grid; width: 30px; height: 30px; place-items: center; border-radius: 50%; background: #183d5d; color: white; transform: translateY(-50%); }.algorithm-card__body { min-height: 0; padding: clamp(8px, 1vw, 14px); overflow: hidden; }.algorithm-card__body h2 { margin: 0 0 8px; overflow: hidden; color: #f6fbff; font-size: clamp(14px, 1.1vw, 18px); text-overflow: ellipsis; white-space: nowrap; }.algorithm-card__body p { display: -webkit-box; margin: 0; overflow: hidden; color: #adc8de; font-size: clamp(11px, .8vw, 13px); line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }.algorithm-tags { display: flex; align-items: center; gap: 8px; margin-top: 10px; overflow: hidden; }.algorithm-tags span { padding: 3px 8px; border: 1px solid #2d79bd; border-radius: 3px; color: #b9deff; background: #093665; font-size: 11px; white-space: nowrap; }.algorithm-tags b { margin-left: auto; padding: 4px 7px; border: 1px solid #d59d31; border-radius: 3px; color: #ffcf65; background: #60440d99; font-size: 11px; white-space: nowrap; }.algorithm-pagination { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; margin-top: 19px; color: #a9c6db; font-size: 13px; }.algorithm-pagination b { color: #37cbff; }.algorithm-pagination select { margin: 0 5px; padding-right: 28px; color: #e7f7ff; }.algorithm-pagination button:disabled { opacity: .4; cursor: not-allowed; }.algorithm-pagination>div>button { min-width: 31px; margin-left: 8px; padding: 0 8px; }.page-controls { display: flex; align-items: center; }.page-controls label { margin-left: 20px; }.page-controls input { width: 38px; height: 31px; margin: 0 4px; border: 1px solid #2d6693; border-radius: 3px; color: white; background: #0a2949; text-align: center; }
.algorithm-modal-backdrop { position: fixed; z-index: 20; inset: 0; display: grid; place-items: center; padding: 32px; background: #000a; }.algorithm-modal { width: min(1180px, 94vw); max-height: calc(100vh - 64px); overflow: auto; border: 1px solid #737889; border-radius: 10px; background: #292a35; box-shadow: 0 24px 60px #000b; }.algorithm-modal>header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; min-height: 74px; padding: 0 24px; border-bottom: 1px solid #4b4e5e; }.algorithm-modal h2 { margin: 0; color: white; font-size: 20px; }.modal-tabs { display: flex; overflow: hidden; border: 1px solid #535a70; border-radius: 4px; }.modal-tabs button { padding: 9px 26px; border: 0; color: #c1c6d4; background: transparent; cursor: pointer; }.modal-tabs button.active { color: white; background: #5179ee; }.modal-close { justify-self: end; border: 0; color: #c2c6d2; background: transparent; font-size: 25px; cursor: pointer; }.modal-content { padding: 20px; }.modal-content dl { margin: 0; border: 1px solid #494d5e; border-radius: 5px; }.modal-content dl>div { padding: 11px 15px; border-bottom: 1px solid #434655; }.modal-content dl>div:last-child { border: 0; }.modal-content dt { margin-bottom: 6px; color: #989dac; font-size: 13px; }.modal-content dd { margin: 0; color: #eef0f6; font-size: 14px; line-height: 1.6; }.modal-status { color: #36e6ab; }.modal-content h3 { margin: 22px 0 10px; color: #68b3ff; font-size: 15px; }.detail-placeholder { padding: 15px; border: 1px solid #494d5e; border-radius: 5px; color: #9da3b0; }.validation-empty { padding: 70px; color: #b2b8c6; text-align: center; }
@media (max-width: 1500px) { .algorithm-title p { display: none; } }
@media (max-width: 1180px) { .algorithm-header { padding-inline: 16px; }.algorithm-title h1 { font-size: 24px; }.algorithm-main { padding: 12px 16px; }.algorithm-search { width: min(620px,56vw); }.filter-options { gap: 7px; }.filter-options button,.source-filter button { padding-inline: 10px; } }
</style>
