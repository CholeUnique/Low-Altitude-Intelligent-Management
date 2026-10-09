<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElTooltip } from 'element-plus'

type AlgorithmFamily = 'ai' | 'spatial'
type ViewMode = 'grid' | 'list'
type AlgorithmStatus = '已部署' | '在线' | '测试中' | '已发布'
interface MockAlgorithm { id:string; family:AlgorithmFamily; name:string; version:string; status:AlgorithmStatus; description:string; tags:string[]; category:string; scene:string; capability:string; owner:string; updatedAt:string; visual:string }
interface CapabilityGroup { title:string; items:string[] }

const props = defineProps<{ embedded?: boolean }>()
const family = ref<AlgorithmFamily>('ai')
const keyword = ref('')
const category = ref('全部')
const scene = ref('全部')
const capability = ref('')
const viewMode = ref<ViewMode>('grid')
const currentPage = ref(1)
const pageSize = ref(6)
const selected = ref<MockAlgorithm>()
const notice = ref('')
let noticeTimer: number | undefined

const algorithms: MockAlgorithm[] = [
  { id:'ai-forest', family:'ai', name:'林地侵占识别', version:'V1.2', status:'已部署', description:'识别林地范围内新增构筑物、道路、采石等疑似非法占用行为，辅助林业监测监管。', tags:['目标识别','图斑提取','林业监管'], category:'目标识别', scene:'林业监管', capability:'AI遥感', owner:'自然资源局', updatedAt:'2026/06/10 14:22', visual:'forest' },
  { id:'ai-building', family:'ai', name:'新增建设用地预警', version:'V2.0', status:'在线', description:'识别新增的建设用地、建筑物和硬化地面，支持历史对比分析，用于土地动态监测与预警。', tags:['变化识别','图斑提取','国土监管'], category:'变化检测', scene:'国土监管', capability:'变化检测', owner:'自然资源局', updatedAt:'2026/06/12 09:18', visual:'building' },
  { id:'ai-grain', family:'ai', name:'非粮化地块识别', version:'V1.5', status:'已部署', description:'识别耕地中疑似非粮化利用的地块，支持多时相影像分析，服务于耕地保护与粮食安全监管。', tags:['目标识别','变化识别','农业监管'], category:'目标识别', scene:'农业监管', capability:'无人机遥感', owner:'农业农村局', updatedAt:'2026/06/08 16:37', visual:'farmland' },
  { id:'ai-change', family:'ai', name:'多期影像变化检测', version:'V1.0', status:'在线', description:'基于多时相遥感影像的自动变化检测，识别地物新增、消失和变化区域，支持变化图斑提取。', tags:['变化识别','图斑提取','遥感监测'], category:'变化检测', scene:'遥感监测', capability:'卫星遥感', owner:'自然资源局', updatedAt:'2026/06/07 11:05', visual:'change' },
  { id:'ai-road', family:'ai', name:'道路违章堆料识别', version:'V1.1', status:'测试中', description:'识别道路沿线的土方、砂石、建筑材料等违章堆料行为，适用于交通管理与城市治理场景。', tags:['目标识别','图斑提取','交通巡检'], category:'目标识别', scene:'交通巡检', capability:'分割', owner:'交通运输局', updatedAt:'2026/06/15 09:42', visual:'road' },
  { id:'ai-water', family:'ai', name:'水体周边异常识别', version:'V1.3', status:'在线', description:'识别水域周边的违法建设、倾倒垃圾、采砂等异常行为，服务于水生态环境保护。', tags:['目标识别','图斑提取','生态环境'], category:'分类', scene:'生态环境', capability:'AI遥感', owner:'生态环境局', updatedAt:'2026/06/11 15:21', visual:'water' },
  { id:'sp-overlay', family:'spatial', name:'空间叠加分析', version:'V1.2', status:'已发布', description:'对多源空间数据进行叠加分析，识别图层间的空间关系与属性组合，支持并、交、差等操作。', tags:['叠加分析','矢量分析','空间关系'], category:'基础空间分析', scene:'自然资源', capability:'空间叠加', owner:'自然资源局', updatedAt:'2026/06/10 14:22', visual:'overlay' },
  { id:'sp-buffer', family:'spatial', name:'缓冲区分析', version:'V2.0', status:'在线', description:'基于点、线、面要素生成缓冲区，支持多级缓冲设置，用于影响范围分析、风险评估等场景。', tags:['缓冲区','范围分析','矢量分析'], category:'基础空间分析', scene:'风险评估', capability:'缓冲区分析', owner:'自然资源局', updatedAt:'2026/06/12 09:18', visual:'buffer' },
  { id:'sp-distance', family:'spatial', name:'距离测算', version:'V1.5', status:'已发布', description:'计算两点、点线、点面或线面之间的空间距离，支持最近距离、最短距离等多种计算方式。', tags:['距离分析','空间计算','矢量分析'], category:'空间关系计算', scene:'通用分析', capability:'距离测算', owner:'农业农村局', updatedAt:'2026/06/08 16:37', visual:'distance' },
  { id:'sp-range', family:'spatial', name:'范围判断', version:'V1.0', status:'在线', description:'判断点、线、面是否位于指定范围内，支持行政区、规划区、管控区等多种地理要素的包含判断。', tags:['范围分析','空间关系','矢量分析'], category:'基础空间分析', scene:'规划管控', capability:'范围判断', owner:'自然资源局', updatedAt:'2026/06/07 11:05', visual:'range' },
  { id:'sp-clip', family:'spatial', name:'裁剪与相交分析', version:'V1.1', status:'测试中', description:'基于指定范围对数据进行裁剪、相交或提取，支持多种几何类型的空间运算与结果输出。', tags:['数据处理','矢量分析','空间运算'], category:'数据处理', scene:'交通巡检', capability:'裁剪', owner:'交通运输局', updatedAt:'2026/06/15 09:42', visual:'clip' },
  { id:'sp-near', family:'spatial', name:'邻近设施检索', version:'V1.3', status:'在线', description:'在指定范围内检索周边设施要素，支持按类型、距离、数量等条件进行邻近分析与结果统计。', tags:['邻近分析','设施检索','空间查询'], category:'空间关系计算', scene:'生态环境', capability:'邻近分析', owner:'生态环境局', updatedAt:'2026/06/11 15:21', visual:'nearby' },
]

const capabilityGroups: Record<AlgorithmFamily, CapabilityGroup[]> = {
  ai: [
    { title:'AI遥感', items:['变化检测','分割','分类'] },
    { title:'遥感解译', items:['卫星遥感','无人机遥感','AI遥感','长势时序分析','气象预警'] },
    { title:'数据预处理', items:['卫星数据预处理','无人机数据预处理'] },
    { title:'农机轨迹清洗', items:['农机轨迹清洗'] },
  ],
  spatial: [
    { title:'基础空间分析', items:['空间叠加','缓冲区分析','范围判断'] },
    { title:'空间关系计算', items:['距离测算','邻近分析','相交分析','包含判断'] },
    { title:'数据处理', items:['裁剪','融合','提取'] },
    { title:'网络与服务', items:['路径分析','服务区分析'] },
  ],
}

const familyModels = computed(() => algorithms.filter((item) => item.family === family.value))
const categories = computed(() => ['全部', ...new Set(familyModels.value.map((item) => item.category))])
const scenes = computed(() => ['全部', ...new Set(familyModels.value.map((item) => item.scene))])
const filteredModels = computed(() => familyModels.value.filter((item) => {
  const text = `${item.name}${item.description}${item.tags.join('')}${item.capability}`.toLowerCase()
  return (!keyword.value.trim() || text.includes(keyword.value.trim().toLowerCase()))
    && (category.value === '全部' || item.category === category.value)
    && (scene.value === '全部' || item.scene === scene.value)
    && (!capability.value || item.capability === capability.value || item.tags.includes(capability.value))
}))
const pageCount = computed(() => Math.max(1, Math.ceil(filteredModels.value.length / pageSize.value)))
const pageModels = computed(() => filteredModels.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
const pageNumbers = computed(() => Array.from({ length: pageCount.value }, (_, index) => index + 1))
const pageTitle = computed(() => family.value === 'ai' ? 'AI识别算法' : '空间分析算法')
const pageDescription = computed(() => family.value === 'ai'
  ? '集中展示和管理 AI 识别能力，用于目标识别、变化识别、问题图斑提取等业务。'
  : '集中展示和管理 GIS 空间分析能力，管理空间分析算子，用于空间叠加、缓冲区分析、距离与范围判断等业务。')

function setFamily(value: AlgorithmFamily) { family.value=value; category.value='全部'; scene.value='全部'; capability.value=''; currentPage.value=1 }
function showNotice(message:string) { notice.value=message; if (noticeTimer !== undefined) window.clearTimeout(noticeTimer); noticeTimer=window.setTimeout(() => { notice.value='' }, 2200) }
function setPage(page:number) { currentPage.value=Math.min(Math.max(1,page),pageCount.value) }
watch([keyword, category, scene, capability, pageSize], () => { currentPage.value=1 })
watch(pageCount, () => setPage(currentPage.value))
</script>

<template>
  <div class="algorithm-page" :class="{ embedded: props.embedded }">
    <aside class="catalog-panel">
      <div class="family-tabs"><button :class="{active:family==='ai'}" @click="setFamily('ai')">AI识别算法</button><button :class="{active:family==='spatial'}" @click="setFamily('spatial')">空间分析算法</button></div>
      <div class="capability-scroll"><section v-for="group in capabilityGroups[family]" :key="group.title" class="capability-group"><h3>{{ group.title }}({{ group.items.length }})</h3><div><button v-for="item in group.items" :key="item" :class="{active:capability===item}" @click="capability=capability===item?'':item">{{ item }}</button></div></section></div>
      <div class="catalog-watermark"><i></i><p>用地理信息　让世界更智能</p></div>
    </aside>

    <main class="repository-main">
      <header class="repository-heading">
        <div><h1>{{ pageTitle }}</h1><p>{{ pageDescription }}</p></div>
        <ElTooltip trigger="click" placement="bottom-end" effect="light" :popper-style="{ padding: '0', border: '1px solid #c4dde8', borderRadius: '8px', boxShadow: '0 10px 28px #123b5240' }">
          <template #content><div class="algorithm-pending-tip" role="status"><strong>该功能待后端接入</strong></div></template>
          <button type="button" class="add-button">新增算法</button>
        </ElTooltip>
      </header>
      <section class="toolbar">
        <label class="search-box"><i>⌕</i><input v-model="keyword" placeholder="搜索算法名称、关键词或描述..." /></label>
        <label><span>算法类型</span><select v-model="category"><option v-for="item in categories" :key="item">{{ item }}</option></select></label>
        <label><span>{{ family==='ai'?'场景标签':'应用场景' }}</span><select v-model="scene"><option v-for="item in scenes" :key="item">{{ item }}</option></select></label>
        <div class="view-switch"><button :class="{active:viewMode==='grid'}" title="卡片视图" @click="viewMode='grid'">▦</button><button :class="{active:viewMode==='list'}" title="列表视图" @click="viewMode='list'">☷</button></div>
      </section>

      <section v-if="pageModels.length" class="algorithm-results" :class="`view-${viewMode}`">
        <article v-for="model in pageModels" :key="model.id" class="algorithm-card" tabindex="0" @click="selected=model" @keydown.enter="selected=model">
          <div class="card-visual" :class="`visual-${model.visual}`" aria-label="算法演示示意图">
            <span class="version">{{ model.version }}</span>
            <span class="status" :class="{testing:model.status==='测试中'}"><i></i>{{ model.status }}</span>
            <span class="visual-demo">模拟示意</span>
            <div v-if="model.visual==='change'" class="compare-line"><b>2023-03</b><em>›</em><b>2024-03</b></div>
            <svg v-else-if="family==='spatial'" class="spatial-overlay" viewBox="0 0 600 320" preserveAspectRatio="none" aria-hidden="true">
              <g v-if="model.visual==='overlay'">
                <path class="overlay-blue" d="M125 83 258 66 301 146 270 237 154 221 103 151Z" />
                <path class="overlay-green" d="M253 105 418 82 458 178 398 257 278 227 239 153Z" />
              </g>
              <g v-else-if="model.visual==='buffer'" class="buffer-rings">
                <circle cx="302" cy="165" r="110" /><circle cx="302" cy="165" r="80" /><circle cx="302" cy="165" r="48" /><circle class="buffer-center" cx="302" cy="165" r="8" />
              </g>
              <g v-else-if="model.visual==='distance'" class="distance-line">
                <path d="M146 196 451 114" /><circle cx="146" cy="196" r="8" /><circle cx="451" cy="114" r="8" /><text x="282" y="133">1.25 km</text>
              </g>
              <g v-else-if="model.visual==='range'" class="range-zone">
                <path d="M174 110 291 65 411 119 444 224 318 264 169 218 143 155Z" /><circle cx="285" cy="170" r="8" /><circle cx="221" cy="194" r="6" /><circle cx="362" cy="200" r="6" />
              </g>
              <g v-else-if="model.visual==='clip'">
                <path class="overlay-blue" d="M98 85 245 58 292 148 260 237 126 219 78 152Z" />
                <path class="overlay-green" d="M357 106 478 89 512 184 464 249 358 224 324 151Z" />
                <path class="clip-arrow" d="M278 164h54m-12-12 12 12-12 12" />
              </g>
              <g v-else class="nearby-zone">
                <circle cx="306" cy="164" r="92" /><circle cx="306" cy="164" r="58" /><circle class="nearby-center" cx="306" cy="164" r="10" />
                <circle class="nearby-point" cx="203" cy="110" r="8" /><circle class="nearby-point" cx="421" cy="105" r="8" /><circle class="nearby-point" cx="452" cy="213" r="8" /><circle class="nearby-point" cx="204" cy="232" r="8" />
              </g>
            </svg>
            <template v-else><i class="detect detect-a"></i><i class="detect detect-b"></i><i v-if="model.visual==='road'" class="detect detect-c"></i></template>
          </div>
          <div class="card-content"><h2>{{ model.name }}</h2><p>{{ model.description }}</p><div class="tags"><span v-for="tag in model.tags" :key="tag">{{ tag }}</span></div></div>
          <footer><span class="owner-avatar"></span><b>{{ model.owner }}</b><time>{{ model.updatedAt }}</time><div><button title="编辑" @click.stop="showNotice(`${model.name}：编辑功能为 Mock`)">✎</button><button title="统计" @click.stop="showNotice(`${model.name}：暂无运行统计`)">▥</button><button title="更多" @click.stop="showNotice(`${model.name}：暂无更多操作`)">•••</button></div></footer>
        </article>
      </section>
      <div v-else class="empty-state">暂无符合当前筛选条件的算法</div>
      <footer class="pagination"><div>共 <b>{{ filteredModels.length }}</b> 条算法模型　每页显示 <select v-model="pageSize"><option :value="6">6</option><option :value="12">12</option></select> 条</div><nav><button :disabled="currentPage===1" @click="setPage(currentPage-1)">‹</button><button v-for="page in pageNumbers" :key="page" :class="{active:currentPage===page}" @click="setPage(page)">{{ page }}</button><button :disabled="currentPage===pageCount" @click="setPage(currentPage+1)">›</button></nav></footer>
    </main>

    <transition name="notice"><div v-if="notice" class="mock-notice">{{ notice }}</div></transition>
    <div v-if="selected" class="detail-mask" @click.self="selected=undefined"><section class="detail-dialog"><header><div><small>{{ selected.version }} · {{ selected.status }}</small><h2>{{ selected.name }}</h2></div><button @click="selected=undefined">×</button></header><p>{{ selected.description }}</p><dl><div><dt>算法类型</dt><dd>{{ selected.category }}</dd></div><div><dt>应用场景</dt><dd>{{ selected.scene }}</dd></div><div><dt>能力标签</dt><dd>{{ selected.tags.join('、') }}</dd></div><div><dt>维护单位</dt><dd>{{ selected.owner }}</dd></div><div><dt>更新时间</dt><dd>{{ selected.updatedAt }}</dd></div></dl><footer><button @click="selected=undefined">关闭</button><ElTooltip trigger="click" placement="top-end" effect="light" :popper-style="{ padding: '0', border: '1px solid #c4dde8', borderRadius: '8px', boxShadow: '0 10px 28px #123b5240' }"><template #content><div class="algorithm-pending-tip" role="status"><strong>该功能待后端接入</strong></div></template><button type="button" class="primary">配置算法</button></ElTooltip></footer></section></div>
  </div>
</template>

<style scoped lang="scss">
.algorithm-page{width:100%;height:100%;min-height:0;display:grid;grid-template-columns:270px minmax(0,1fr);overflow:hidden;color:#243451;background:#f5f7fb;font-family:"Microsoft YaHei","PingFang SC",sans-serif}.catalog-panel{position:relative;min-height:0;display:flex;flex-direction:column;background:#fff;border-right:1px solid #dfe5ee}.family-tabs{height:72px;display:grid;grid-template-columns:1fr 1fr;padding:0 20px;border-bottom:1px solid #edf0f5}.family-tabs button{position:relative;border:0;color:#34435f;background:transparent;font-size:16px;font-weight:600;cursor:pointer;white-space:nowrap}.family-tabs button.active{color:#3276f6}.family-tabs button.active::after{position:absolute;right:7px;bottom:0;left:7px;height:3px;border-radius:2px;background:#3478f6;content:""}.capability-scroll{min-height:0;flex:1;overflow:auto;padding:12px 20px 120px}.capability-group{margin-bottom:30px}.capability-group h3{margin:0 0 13px;color:#263751;font-size:17px}.capability-group>div{display:flex;flex-wrap:wrap;gap:10px 8px}.capability-group button{min-height:38px;padding:0 13px;border:1px solid transparent;border-radius:7px;color:#4c5b70;background:#f1f3f6;font-size:14px;cursor:pointer}.capability-group button:hover,.capability-group button.active{color:#276be9;border-color:#a9c8ff;background:#edf4ff}.catalog-watermark{position:absolute;right:0;bottom:0;left:0;height:105px;display:grid;place-items:end center;padding-bottom:20px;color:#8192ad;background:linear-gradient(180deg,transparent,#fff 32%);pointer-events:none}.catalog-watermark i{position:absolute;bottom:18px;left:32px;width:105px;height:66px;opacity:.42;background:linear-gradient(135deg,transparent 48%,#dbeaff 49% 62%,transparent 63%),linear-gradient(45deg,transparent 45%,#e7f1ff 46% 68%,transparent 69%)}.catalog-watermark p{z-index:1;margin:0;font-size:12px;letter-spacing:3px}.repository-main{min-width:0;min-height:0;display:flex;flex-direction:column;padding:20px 28px 16px;overflow:hidden}.repository-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.repository-heading h1{margin:0;color:#182944;font-size:29px;line-height:1.2}.repository-heading p{margin:9px 0 0;color:#70809a;font-size:14px}.add-button{height:46px;padding:0 22px;border:0;border-radius:7px;color:#fff;background:#3675ef;box-shadow:0 5px 14px #3675ef35;font-size:15px;cursor:pointer}.add-button b{margin-right:7px;font-size:24px;font-weight:300;vertical-align:-2px}.toolbar{display:grid;grid-template-columns:minmax(260px,1.4fr) minmax(210px,.85fr) minmax(210px,.85fr) auto;align-items:center;gap:18px;margin-top:20px}.search-box{height:44px;display:flex!important;align-items:center;border:1px solid #d6deea;border-radius:7px;background:#fff}.search-box i{width:43px;color:#657693;font-size:22px;font-style:normal;text-align:center}.search-box input{min-width:0;flex:1;border:0;outline:0;color:#2c3d58;background:transparent;font-size:14px}.toolbar>label:not(.search-box){display:grid;grid-template-columns:auto minmax(100px,1fr);align-items:center;gap:11px;color:#46546c;font-size:14px;font-weight:600}.toolbar select{height:44px;padding:0 35px 0 14px;border:1px solid #d6deea;border-radius:7px;color:#53627a;background:#fff;font-size:14px;outline:0}.view-switch{height:44px;display:flex;overflow:hidden;border:1px solid #d6deea;border-radius:7px;background:#fff}.view-switch button{width:52px;border:0;border-left:1px solid #e1e6ee;color:#3f4e67;background:#fff;font-size:22px;cursor:pointer}.view-switch button:first-child{border-left:0}.view-switch button.active{color:#3478f6;box-shadow:inset 0 0 0 1px #3478f6;background:#f4f8ff}.algorithm-results{min-height:0;flex:1;margin-top:16px;overflow:auto}.algorithm-results.view-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:minmax(280px,1fr);gap:16px}.algorithm-card{min-width:0;min-height:0;display:grid;grid-template-rows:minmax(120px,1fr) auto 48px;overflow:hidden;border:1px solid #dfe5ed;border-radius:9px;background:#fff;box-shadow:0 3px 12px #263f6420;cursor:pointer;transition:.18s}.algorithm-card:hover,.algorithm-card:focus{outline:0;border-color:#77a6ff;box-shadow:0 7px 20px #2e5fa82b;transform:translateY(-2px)}.card-visual{position:relative;min-height:120px;overflow:hidden;background-color:#b9c6bb;background-size:cover}.visual-forest{background-image:radial-gradient(ellipse at 56% 53%,#917c65 0 20%,transparent 21%),repeating-radial-gradient(circle at 20% 30%,#234f34 0 7px,#39704a 8px 15px)}.visual-building{background-image:linear-gradient(25deg,transparent 33%,#c6a17d 34% 60%,transparent 61%),repeating-linear-gradient(120deg,#849186 0 20px,#d6c4a3 21px 38px)}.visual-farmland{background-image:repeating-linear-gradient(145deg,#426d37 0 24px,#a0aa52 25px 47px,#d1b45b 48px 69px)}.visual-change{background-image:linear-gradient(90deg,#8c998c 0 49.5%,#64a15b 50.5% 100%),repeating-linear-gradient(35deg,transparent 0 18px,#ffffff25 19px 22px)}.visual-road{background-image:linear-gradient(165deg,transparent 0 38%,#777b7c 39% 62%,transparent 63%),repeating-linear-gradient(20deg,#648a54 0 18px,#a5b679 19px 35px)}.visual-water{background-image:linear-gradient(145deg,#4fa3b3 0 48%,#4d7854 49% 69%,#bd895d 70%)}.visual-overlay,.visual-buffer,.visual-distance,.visual-range,.visual-clip,.visual-nearby{background-image:linear-gradient(#ffffff80,#ffffff80),repeating-linear-gradient(30deg,#dfeadc 0 22px,#cbdcc7 23px 42px)}.version,.status{position:absolute;z-index:3;top:10px;padding:6px 10px;border-radius:5px;color:#fff;background:#3978dfd9;font-size:12px}.version{left:10px}.status{right:10px;background:#075e4fe8}.status i{display:inline-block;width:9px;height:9px;margin-right:6px;border-radius:50%;background:#1ee9b2;box-shadow:0 0 7px #1ee9b2}.status.testing{color:#293448;background:#ffc43a}.status.testing i{background:#263d4b;box-shadow:none}.detect{position:absolute;border:2px solid #ff5058;box-shadow:0 0 3px #ff3333}.detect-a{left:39%;top:28%;width:31%;height:43%}.detect-b{left:16%;top:20%;width:17%;height:23%}.compare-line{position:absolute;right:10px;bottom:9px;left:10px;display:flex;justify-content:space-between;align-items:center;color:#fff}.compare-line b{padding:3px 5px;background:#21364acc;font-size:10px}.compare-line em{width:31px;height:31px;display:grid;place-items:center;border:2px solid #fff;border-radius:50%;background:#2c4d77;font-size:24px;font-style:normal}.shape{position:absolute;border:2px solid #397cff;background:#4f8cff4d;clip-path:polygon(15% 5%,82% 0,100% 55%,70% 100%,10% 85%,0 35%)}.shape-a{left:26%;top:18%;width:30%;height:60%}.shape-b{left:47%;top:25%;width:29%;height:55%;border-color:#1ebc75;background:#36d88352}.visual-buffer .shape-a{left:35%;top:8%;width:30%;height:76%;border-radius:50%;clip-path:none;box-shadow:0 0 0 17px #4d80e134,0 0 0 34px #4d80e124}.visual-distance .shape-a{left:23%;top:48%;width:53%;height:0;border:0;border-top:3px dashed #3278f3;background:none;clip-path:none}.visual-range .shape-a{left:28%;top:12%;width:44%;height:70%;border-color:#ff535a;background:#ff535a38}.visual-clip .shape-b{left:58%;width:22%}.map-pin{position:absolute;left:50%;top:42%;width:14px;height:14px;border:5px solid #ff4b55;border-radius:50% 50% 50% 0;background:#fff;transform:rotate(-45deg)}.card-content{padding:12px 14px 9px}.card-content h2{margin:0;color:#1d2d47;font-size:18px}.card-content p{display:-webkit-box;min-height:44px;margin:7px 0 8px;overflow:hidden;color:#5f6f88;font-size:13px;line-height:1.65;-webkit-box-orient:vertical;-webkit-line-clamp:2}.tags{display:flex;gap:7px;overflow:hidden}.tags span{padding:4px 8px;border-radius:4px;color:#2f72e9;background:#eaf2ff;font-size:11px;white-space:nowrap}.algorithm-card>footer{display:grid;grid-template-columns:30px auto 1fr auto;align-items:center;gap:8px;padding:0 12px;border-top:1px solid #edf0f4;color:#70809a;font-size:11px}.owner-avatar{width:26px;height:26px;border-radius:50%;background:linear-gradient(#70a6df 0 42%,#4c7c34 43% 64%,#203b25 65%)}.algorithm-card>footer>b{font-weight:500}.algorithm-card>footer time{white-space:nowrap}.algorithm-card>footer div{display:flex}.algorithm-card>footer button{width:31px;height:31px;border:0;color:#425776;background:transparent;font-size:15px;cursor:pointer}.view-list{display:grid;gap:10px}.view-list .algorithm-card{grid-template-columns:240px minmax(0,1fr) 250px;grid-template-rows:150px}.view-list .card-content{align-self:center}.view-list .algorithm-card>footer{border-top:0;border-left:1px solid #edf0f4}.empty-state{min-height:0;flex:1;display:grid;place-items:center;color:#8795aa}.pagination{height:50px;flex:0 0 50px;display:flex;align-items:end;justify-content:space-between;color:#60708a;font-size:13px}.pagination b{color:#263851}.pagination select{height:34px;margin:0 5px;padding:0 25px 0 10px;border:1px solid #d5dde8;border-radius:5px;color:#34445e;background:#fff}.pagination nav{display:flex;gap:7px}.pagination nav button{width:34px;height:34px;border:1px solid #d6deea;border-radius:5px;color:#53627a;background:#fff;cursor:pointer}.pagination nav button.active{color:#fff;border-color:#3678ef;background:#3678ef}.pagination nav button:disabled{opacity:.45;cursor:not-allowed}.mock-notice{position:fixed;z-index:60;top:92px;left:50%;padding:10px 18px;color:#fff;background:#243853e8;border-radius:5px;box-shadow:0 6px 20px #1c2d4866;transform:translateX(-50%)}.notice-enter-active,.notice-leave-active{transition:.2s}.notice-enter-from,.notice-leave-to{opacity:0;transform:translate(-50%,-8px)}.detail-mask{position:fixed;z-index:70;inset:0;display:grid;place-items:center;padding:24px;background:#14233a70}.detail-dialog{width:min(620px,calc(100vw - 48px));overflow:hidden;border-radius:10px;background:#fff;box-shadow:0 20px 55px #17294566}.detail-dialog>header{display:flex;align-items:center;justify-content:space-between;padding:19px 22px;border-bottom:1px solid #e5eaf1}.detail-dialog h2{margin:4px 0 0;color:#1e304c}.detail-dialog header small{color:#4b79d2}.detail-dialog header button{border:0;color:#6a7890;background:transparent;font-size:28px;cursor:pointer}.detail-dialog>p{margin:0;padding:18px 22px;color:#596b84;line-height:1.8}.detail-dialog dl{display:grid;grid-template-columns:1fr 1fr;margin:0;padding:0 22px 20px;gap:10px}.detail-dialog dl>div{padding:10px;border-radius:6px;background:#f5f7fa}.detail-dialog dt{color:#8793a5;font-size:12px}.detail-dialog dd{margin:5px 0 0;color:#34455f;font-size:14px}.detail-dialog>footer{display:flex;justify-content:flex-end;gap:10px;padding:13px 22px;background:#f5f7fa}.detail-dialog>footer button{min-width:82px;height:36px;border:1px solid #d3dbe7;border-radius:5px;color:#52617a;background:#fff;cursor:pointer}.detail-dialog>footer .primary{color:#fff;border-color:#3678ef;background:#3678ef}
.search-box input:focus::placeholder{color:transparent}
@media(max-width:1400px){.algorithm-page{grid-template-columns:235px minmax(0,1fr)}.repository-main{padding-inline:20px}.algorithm-results.view-grid{gap:11px}.toolbar{gap:10px}.toolbar>label:not(.search-box){grid-template-columns:1fr}.toolbar>label:not(.search-box) span{display:none}.algorithm-card>footer time{display:none}}
@media(max-width:1050px){.algorithm-results.view-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.view-list .algorithm-card{grid-template-columns:190px minmax(0,1fr)}.view-list .algorithm-card>footer{display:none}}
.toolbar select:hover,.toolbar select:focus{color:#fff;background:#315f91;border-color:#315f91}.toolbar select option{color:#53627a;background:#fff}
.pagination select{cursor:pointer;transition:background-color .18s,border-color .18s,color .18s}
.pagination select:hover,.pagination select:focus{color:#fff;background:#315f91;border-color:#315f91;outline:0}
.pagination select option{color:#34445e;background:#fff}
.algorithm-pending-tip{padding:9px 12px;border-radius:7px;background:linear-gradient(135deg,#fff,#fff5f6);font-family:"Microsoft YaHei",sans-serif}
.algorithm-pending-tip strong{display:block;color:#c43b4d;font-size:12px;line-height:1.4;white-space:nowrap}
/* Local demonstration imagery: generated aerial thumbnails and a shared GIS basemap. */
.card-visual{background-position:center;background-size:cover}
.visual-forest{background-image:url('../assets/algorithms/forest.jpg')}
.visual-building{background-image:url('../assets/algorithms/building.jpg')}
.visual-farmland{background-image:url('../assets/algorithms/farmland.jpg')}
.visual-change{background-image:url('../assets/algorithms/change_before.jpg')}
.visual-change::before{position:absolute;z-index:1;inset:0;background:url('../assets/algorithms/change_after.jpg') center/cover;clip-path:inset(0 0 0 36%);content:""}
.visual-change::after{position:absolute;z-index:2;top:0;bottom:0;left:36%;width:2px;background:#fff;box-shadow:0 0 0 1px #17324b55;content:""}
.visual-road{background-image:url('../assets/algorithms/road.jpg')}
.visual-water{background-image:url('../assets/algorithms/water.jpg')}
.visual-overlay,.visual-buffer,.visual-distance,.visual-range,.visual-clip,.visual-nearby{background-image:url('../assets/algorithms/spatial_map.jpg');background-size:135% auto}
.visual-overlay{background-position:32% 42%}.visual-buffer{background-position:62% 50%}.visual-distance{background-position:47% 59%}.visual-range{background-position:20% 66%}.visual-clip{background-position:78% 45%}.visual-nearby{background-position:54% 32%}
.visual-demo{position:absolute;z-index:4;right:10px;bottom:9px;padding:3px 7px;border:1px solid #ffffff80;border-radius:4px;color:#fff;background:#102b3cb5;font-size:10px;letter-spacing:.5px;pointer-events:none}
.visual-change .visual-demo{bottom:45px}
.compare-line{z-index:3}.compare-line em{z-index:2}.visual-change .compare-line em{position:absolute;left:36%;transform:translateX(-50%)}
.detect{z-index:2;border:2px solid #ff555d;background:#ff555d21;box-shadow:0 0 0 1px #fff8,0 0 7px #fa313b99}
.visual-forest .detect-a{left:37%;top:22%;width:35%;height:52%}.visual-forest .detect-b{left:22%;top:39%;width:16%;height:26%}
.visual-building .detect-a{left:37%;top:26%;width:29%;height:40%}.visual-building .detect-b{left:62%;top:18%;width:17%;height:24%}
.visual-farmland .detect-a{left:44%;top:28%;width:26%;height:46%;border-color:#f2d83c;background:#e7d52a23;box-shadow:0 0 0 1px #fff8}.visual-farmland .detect-b{display:none}
.visual-road .detect-a{left:24%;top:13%;width:13%;height:17%}.visual-road .detect-b{left:59%;top:10%;width:13%;height:18%}.visual-road .detect-c{left:55%;top:73%;width:17%;height:17%}
.visual-water .detect-a{left:29%;top:37%;width:24%;height:32%}.visual-water .detect-b{left:58%;top:52%;width:16%;height:22%}
.spatial-overlay{position:absolute;z-index:2;inset:0;width:100%;height:100%;filter:drop-shadow(0 1px 2px #173b614a)}
.spatial-overlay .overlay-blue{fill:#397cff50;stroke:#3678fa;stroke-width:3}.spatial-overlay .overlay-green{fill:#22c97867;stroke:#0cad70;stroke-width:3}
.buffer-rings circle{fill:#4a7cf021;stroke:#3f76f0;stroke-width:2}.buffer-rings circle:nth-child(2){fill:#4a7cf02e}.buffer-rings circle:nth-child(3){fill:#4a7cf044}.buffer-rings .buffer-center{fill:#fc575c;stroke:#fff;stroke-width:3}
.distance-line path{fill:none;stroke:#337cff;stroke-width:4;stroke-dasharray:10 7}.distance-line circle{fill:#337cff;stroke:#fff;stroke-width:4}.distance-line text{fill:#234670;font-size:20px;font-weight:700;paint-order:stroke;stroke:#fff;stroke-width:5}
.range-zone path{fill:#fc5b6359;stroke:#f5505c;stroke-width:3}.range-zone circle{fill:#367cf3;stroke:#fff;stroke-width:3}
.clip-arrow{fill:none;stroke:#294967;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}
.nearby-zone circle{fill:#397cff12;stroke:#397cff;stroke-width:2;stroke-dasharray:8 7}.nearby-zone .nearby-center{fill:#fb5964;stroke:#fff;stroke-width:3;stroke-dasharray:none}.nearby-zone .nearby-point{fill:#397cff;stroke:#fff;stroke-width:3;stroke-dasharray:none}
/* Keep this style block versioned with the light algorithm-management layout. */
</style>
