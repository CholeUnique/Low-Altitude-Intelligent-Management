<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getContentQrcode } from '@/api/facility'

const props = defineProps<{ target: { longitude: number; latitude: number; address: string } }>()
const emit = defineEmits<{ close: [] }>()

const apps = [
  { key: 'amap', label: '高德地图' },
  { key: 'tencent', label: '腾讯地图' },
  { key: 'baidu', label: '百度地图' },
] as const
type AppKey = (typeof apps)[number]['key']
type QrKey = AppKey | 'baiduApp'

const activeApp = ref<AppKey>('amap')
// 百度第二个码在「网页版」和「App scheme 版」之间切换。
const baiduAppMode = ref(false)
const error = ref('')
const loadingKey = ref<QrKey | ''>('')
const sources = ref<Partial<Record<QrKey, string>>>({})
const objectUrls: string[] = []
const teleportTarget = document.fullscreenElement || document.body

const currentLabel = computed(() => apps.find((item) => item.key === activeApp.value)?.label || '')
const activeQrKey = computed<QrKey>(() =>
  activeApp.value === 'baidu' ? (baiduAppMode.value ? 'baiduApp' : 'baidu') : activeApp.value)
const currentSrc = computed(() => sources.value[activeQrKey.value] || '')
const currentLoading = computed(() => loadingKey.value === activeQrKey.value)

// 高德路径规划使用 GCJ-02；素材坐标按 WGS84 处理。
function toGcj(longitude: number, latitude: number): [number, number] {
  if (longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271) return [longitude, latitude]
  const x = longitude - 105, y = latitude - 35, pi = Math.PI
  let lat = -100 + 2*x + 3*y + .2*y*y + .1*x*y + .2*Math.sqrt(Math.abs(x))
  lat += (20*Math.sin(6*x*pi) + 20*Math.sin(2*x*pi))*2/3
  lat += (20*Math.sin(y*pi) + 40*Math.sin(y*pi/3))*2/3 + (160*Math.sin(y*pi/12) + 320*Math.sin(y*pi/30))*2/3
  let lon = 300 + x + 2*y + .1*x*x + .1*x*y + .1*Math.sqrt(Math.abs(x))
  lon += (20*Math.sin(6*x*pi) + 20*Math.sin(2*x*pi))*2/3
  lon += (20*Math.sin(x*pi) + 40*Math.sin(x*pi/3))*2/3 + (150*Math.sin(x*pi/12) + 300*Math.sin(x*pi/30))*2/3
  const rad = latitude / 180*pi, magic = 1 - .006693421622965943*Math.sin(rad)**2, root = Math.sqrt(magic)
  return [longitude + lon*180/(6378245/root*Math.cos(rad)*pi), latitude + lat*180/((6378245*(1-.006693421622965943))/(magic*root)*pi)]
}

// 百度使用 BD-09。
function toBd09(longitude: number, latitude: number): [number, number] {
  const z = Math.sqrt(longitude*longitude + latitude*latitude) + .00002*Math.sin(latitude*Math.PI*3000/180)
  const theta = Math.atan2(latitude, longitude) + .000003*Math.cos(longitude*Math.PI*3000/180)
  return [z*Math.cos(theta) + .0065, z*Math.sin(theta) + .006]
}

/** 四种码对应的跳转内容；百度 App 码用 scheme，其余用 https。 */
const links = computed<Record<QrKey, string>>(() => {
  const { longitude, latitude, address } = props.target
  const [lng, lat] = toGcj(longitude, latitude)
  const [bdLng, bdLat] = toBd09(lng, lat)

  const amap = new URL('https://uri.amap.com/navigation')
  amap.searchParams.set('to', `${lng},${lat},${address.replace(/,/g, '，')}`)
  amap.searchParams.set('mode', 'car')
  amap.searchParams.set('callnative', '1')

  // 腾讯地图与高德同为 GCJ-02；官方 Web URI 会 302 到移动端驾车路线页，无需自备 key。
  const tencent = new URL('https://apis.map.qq.com/uri/v1/routeplan')
  tencent.searchParams.set('type', 'drive')
  tencent.searchParams.set('to', address)
  tencent.searchParams.set('tocoord', `${lat},${lng}`)
  tencent.searchParams.set('policy', '0')
  tencent.searchParams.set('referer', 'tzscene')

  // 百度的网页路线 URI（api.map.baidu.com/direction）已下线，只能用「标注」URI。
  const baidu = new URL('https://api.map.baidu.com/marker')
  baidu.searchParams.set('location', `${bdLat},${bdLng}`)
  baidu.searchParams.set('title', address)
  baidu.searchParams.set('content', '林草核查目标点')
  baidu.searchParams.set('output', 'html')
  baidu.searchParams.set('coord_type', 'bd09ll')
  baidu.searchParams.set('zoom', '17')
  baidu.searchParams.set('src', 'webapp.tzscene.nav')

  // 只对中文名称做 URL 编码，保留 latlng:/,/|/name: 这些百度 scheme 认的字面结构。
  const baiduApp = 'baidumap://map/direction'
    + `?destination=latlng:${bdLat},${bdLng}|name:${encodeURIComponent(address)}`
    + '&mode=driving&coord_type=bd09ll&src=webapp.tzscene.nav'

  return { amap: amap.href, tencent: tencent.href, baidu: baidu.href, baiduApp }
})

/** 按需向后端取码，取过的复用 objectURL，避免每次切换都请求。 */
async function loadQr(key: QrKey) {
  if (sources.value[key]) return
  loadingKey.value = key
  error.value = ''
  try {
    const blob = await getContentQrcode({ content: links.value[key], size: 300 })
    const url = URL.createObjectURL(blob)
    objectUrls.push(url)
    sources.value = { ...sources.value, [key]: url }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '二维码生成失败'
  } finally {
    if (loadingKey.value === key) loadingKey.value = ''
  }
}

function selectApp(key: AppKey) {
  activeApp.value = key
  if (key !== 'baidu') baiduAppMode.value = false
}

watch(activeQrKey, (key) => { void loadQr(key) }, { immediate: true })
onBeforeUnmount(() => { objectUrls.forEach((url) => URL.revokeObjectURL(url)) })
</script>

<template>
  <Teleport :to="teleportTarget">
    <div class="navigation-qr-mask" @click.self="emit('close')" @keydown.esc.stop="emit('close')">
      <section class="navigation-qr-dialog" role="dialog" aria-modal="true" aria-label="扫码导航">
        <header><strong>扫码导航</strong><button type="button" aria-label="关闭" @click="emit('close')">×</button></header>
        <p class="destination">目的地：{{ target.address }}</p>

        <div class="app-switch" role="tablist" aria-label="选择地图应用">
          <button v-for="item in apps" :key="item.key" type="button" role="tab"
            :aria-selected="activeApp === item.key" :class="{ active: activeApp === item.key }"
            @click="selectApp(item.key)">{{ item.label }}</button>
        </div>

        <p v-if="error" role="alert">{{ error }}</p>

        <div class="qr-stage">
          <img v-if="currentSrc" :src="currentSrc" :alt="`${currentLabel}导航二维码`" />
          <div v-else class="qr-placeholder" role="status">{{ currentLoading ? '正在生成二维码…' : '二维码暂不可用' }}</div>
          <button v-if="activeApp === 'baidu'" type="button" class="qr-switch"
            @click="baiduAppMode = !baiduAppMode">{{ baiduAppMode ? '用微信/相机扫' : '用百度地图App扫' }}</button>
        </div>

        <p v-if="activeApp === 'baidu'" class="origin-note">百度地图默认码使用微信或相机扫描进入定位页;若使用百度地图App扫码，请先点击二维码下方的按钮切换后再扫。</p>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.navigation-qr-mask{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#00101bc9}
.navigation-qr-dialog{width:min(420px,calc(100vw - 32px));box-sizing:border-box;padding:20px;color:#dff4fc;background:#102d40;border:1px solid #4a8ca5;border-radius:10px;box-shadow:0 12px 40px #0008;font-size:14px}
header{display:flex;align-items:center;justify-content:space-between;font-size:17px}
header button{border:0;background:transparent;color:#dff4fc;font-size:25px;cursor:pointer}
p{overflow-wrap:anywhere;line-height:1.5;color:#b8d8e5}
.destination{margin:8px 0 14px}
.app-switch{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:4px;background:#0a2434;border:1px solid #255a72;border-radius:8px}
.app-switch button{min-height:34px;padding:0 6px;border:1px solid transparent;border-radius:6px;color:#a7c9d8;background:transparent;font-size:13px;cursor:pointer;transition:color .18s,background .18s,border-color .18s}
.app-switch button:hover{color:#eafcff;background:#123c53}
.app-switch button.active{color:#eafcff;background:#10516a;border-color:#32b8dc;font-weight:600}
.qr-stage{display:grid;gap:10px;justify-items:center;margin:18px 0 10px}
.qr-stage img{width:min(268px,62vw);height:min(268px,62vw);background:#fff;border-radius:6px}
.qr-placeholder{width:min(268px,62vw);height:min(268px,62vw);display:grid;place-items:center;box-sizing:border-box;padding:12px;background:#183b4d;border:1px solid #37677d;border-radius:6px;color:#b8d8e5;text-align:center}
.qr-switch{min-height:26px;padding:0 11px;border:1px solid #4a8ca5;border-radius:13px;color:#8fe3f7;background:#123c53;font-size:12px;line-height:1;cursor:pointer;transition:background .18s,border-color .18s,color .18s}
.qr-switch:hover{color:#eafcff;background:#1b5876;border-color:#6fd3ea}
.origin-note{margin:0;font-size:12px;line-height:1.6}
</style>
