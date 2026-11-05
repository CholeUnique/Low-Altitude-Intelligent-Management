<script setup lang="ts">
import { onMounted, ref } from 'vue'
import QRCode from 'qrcode'

const props = defineProps<{ target: { longitude: number; latitude: number; address: string } }>()
const emit = defineEmits<{ close: [] }>()
const amapQr = ref('')
const error = ref('')
const teleportTarget = document.fullscreenElement || document.body

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

onMounted(async () => {
  const { longitude, latitude, address } = props.target
  const [lng, lat] = toGcj(longitude, latitude)
  const amap = new URL('https://uri.amap.com/navigation')
  amap.searchParams.set('to', `${lng},${lat},${address.replace(/,/g, '，')}`)
  amap.searchParams.set('mode', 'car')
  amap.searchParams.set('callnative', '1')
  try { amapQr.value = await QRCode.toDataURL(amap.href, { width: 260, margin: 2 }) }
  catch { error.value = '二维码生成失败，请重新打开弹窗' }
})
</script>

<template>
  <Teleport :to="teleportTarget">
    <div class="navigation-qr-mask" @click.self="emit('close')" @keydown.esc.stop="emit('close')">
      <section class="navigation-qr-dialog" role="dialog" aria-modal="true" aria-label="扫码导航">
        <header><strong>扫码导航</strong><button type="button" aria-label="关闭" @click="emit('close')">×</button></header>
        <p>目的地：{{ target.address }}</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="navigation-qr-grid">
          <div v-if="amapQr"><img :src="amapQr" alt="高德地图导航二维码" /><span>高德地图</span></div>
          <div v-else class="qr-placeholder" role="status">无法生成二维码</div>
        </div>
        <p class="origin-note">使用手机微信或高德地图 App 扫码获取导航路线。</p>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.navigation-qr-mask{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#00101bc9}
.navigation-qr-dialog{width:min(480px,calc(100vw - 32px));box-sizing:border-box;padding:20px;color:#dff4fc;background:#102d40;border:1px solid #4a8ca5;border-radius:10px;box-shadow:0 12px 40px #0008;font-size:14px}
header{display:flex;align-items:center;justify-content:space-between;font-size:17px}header button{border:0;background:transparent;color:#dff4fc;font-size:25px;cursor:pointer}p{overflow-wrap:anywhere;line-height:1.5;color:#b8d8e5}.navigation-qr-grid{display:flex;justify-content:center;gap:24px;margin:18px 0}.navigation-qr-grid div{display:grid;gap:8px;text-align:center}.navigation-qr-grid img{width:min(220px,60vw);height:min(220px,60vw);background:#fff;border-radius:5px}
.navigation-qr-grid .qr-placeholder{width:min(220px,60vw);height:min(220px,60vw);place-items:center;box-sizing:border-box;padding:12px;background:#183b4d;border:1px solid #37677d;border-radius:5px;color:#b8d8e5}
.origin-note{font-size:12px}
</style>
