<script setup lang="ts">
import { ref } from 'vue'
import PlatformLayout from '@/layouts/PlatformLayout.vue'

const menu = [
  { label:'机队总览',path:'/flight/fleet',icon:'机' },{ label:'航线规划',path:'/patrol/route-plan',icon:'线' },
  { label:'飞行计划',path:'/flight/plans',icon:'计' },{ label:'实时巡航',path:'/patrol/live',icon:'巡' },
]
const active = ref('DJI Dock 2 · 海陵站')
const devices = [
  {name:'DJI Dock 2 · 海陵站',code:'DOCK-HAI-01',drone:'Matrice 3D · UAV-001',state:'作业中',battery:78,health:96,task:'东城河道巡查'},
  {name:'DJI Dock 2 · 高港站',code:'DOCK-GG-02',drone:'Matrice 3TD · UAV-006',state:'待命',battery:100,health:98,task:'下一计划 14:30'},
  {name:'移动作业组 · 姜堰',code:'TEAM-JY-03',drone:'Matrice 350 RTK · UAV-009',state:'维护',battery:42,health:82,task:'云台标定中'},
]
const alerts=[['低','高港站机场舱温偏高','11:32'],['中','UAV-009 电池循环达 186 次','10:18'],['低','海陵站固件可更新','昨天']]
</script>
<template>
  <PlatformLayout section="flight" title="飞行作业" subtitle="统一管理机队、航线、计划与实时作业" :menu="menu">
    <div class="page-head"><div><h2>机队总览</h2><p>设备在线、机场环境、适航状态与任务负载的统一运行视图</p></div><span class="update">设备心跳正常 · 10 秒刷新</span></div>
    <section class="metrics">
      <article><i>机</i><span>无人机总数<b>12<small>架</small></b><em>在线 9 · 作业中 3</em></span></article>
      <article><i>舱</i><span>机场 / 机库<b>6<small>座</small></b><em>正常 5 · 告警 1</em></span></article>
      <article><i>时</i><span>今日飞行<b>18.6<small>小时</small></b><em>完成 21 / 计划 24</em></span></article>
      <article><i>率</i><span>机队可用率<b>91.7<small>%</small></b><em>较上周 +2.4%</em></span></article>
    </section>
    <section class="fleet-grid">
      <article class="surface map-panel">
        <header><b>设备分布与作业态势</b><span>全部设备　⌄</span></header>
        <div class="fleet-map"><div class="river"></div><div class="road r1"></div><div class="road r2"></div><button v-for="(d,i) in devices" :key="d.code" class="map-device" :class="[`p${i+1}`,{active:active===d.name}]" @click="active=d.name"><i>{{i===2?'△':'✦'}}</i><b>{{d.name}}</b><small>{{d.state}} · {{d.drone.split(' · ')[1]}}</small></button><div class="map-legend"><span><i class="ok"></i>在线</span><span><i class="busy"></i>作业中</span><span><i class="warn"></i>告警</span></div></div>
      </article>
      <aside class="surface device-detail">
        <header><b>设备健康详情</b><span>实时遥测</span></header>
        <template v-for="d in devices.filter(x=>x.name===active)" :key="d.code">
          <div class="device-title"><i>✦</i><span><b>{{d.name}}</b><small>{{d.code}} · {{d.drone}}</small></span><em :class="d.state==='维护'?'warn':''">{{d.state}}</em></div>
          <div class="health-ring" :style="{'--health':`${d.health*3.6}deg`} "><div><b>{{d.health}}</b><small>健康评分</small></div></div>
          <dl><div><dt>飞行电池</dt><dd>{{d.battery}}%</dd></div><div><dt>图传链路</dt><dd>32 Mbps</dd></div><div><dt>机场温湿度</dt><dd>26℃ / 58%</dd></div><div><dt>定位状态</dt><dd>RTK FIX</dd></div><div><dt>当前任务</dt><dd>{{d.task}}</dd></div></dl>
          <button class="detail-button">查看设备档案</button>
        </template>
      </aside>
      <article class="surface utilization"><header><b>近 7 日机队利用率</b><span>飞行时长 / 架次</span></header><div class="chart"><div v-for="(v,i) in [48,66,55,82,72,91,64]" :key="i"><i :style="{height:v+'%'}"></i><b>{{[12,16,13,21,18,24,15][i]}}</b><small>{{['09/15','09/16','09/17','09/18','09/19','09/20','今日'][i]}}</small></div></div></article>
      <article class="surface alerts"><header><b>设备告警与维保</b><button>全部记录 ›</button></header><div v-for="a in alerts" :key="a[1]"><i :class="a[0]==='中'?'mid':''">{{a[0]}}</i><span><b>{{a[1]}}</b><small>建议在下一架次前完成检查</small></span><time>{{a[2]}}</time></div></article>
    </section>
  </PlatformLayout>
</template>
<style scoped lang="scss">
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px}.metrics article{display:flex;align-items:center;gap:13px;padding:14px 16px;background:#fff;border:1px solid #d8e5eb;border-radius:8px;box-shadow:0 3px 12px #18394d0b}.metrics>article>i{width:42px;height:42px;display:grid;place-items:center;border-radius:10px;color:#08738f;background:#e6f6f8;font-style:normal;font-weight:700}.metrics span{color:#6d8290;font-size:12px}.metrics b{display:block;margin:4px 0 2px;color:#11394f;font-size:26px}.metrics b small{margin-left:4px;color:#718793;font-size:11px}.metrics em{color:#6b8b98;font-size:10px;font-style:normal}.fleet-grid{height:calc(100vh - 226px);min-height:490px;display:grid;grid-template-columns:minmax(500px,1.65fr) minmax(290px,.72fr);grid-template-rows:minmax(300px,1fr) 178px;gap:12px}.surface>header{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid #e7eef2}.surface>header b{font-size:13px}.surface>header span,.surface>header button{color:#77909c;background:none;border:0;font-size:10px}.map-panel{overflow:hidden}.fleet-map{position:relative;height:calc(100% - 44px);overflow:hidden;background:radial-gradient(ellipse at 38% 34%,#bdd3bd 0 9%,transparent 10%),radial-gradient(ellipse at 70% 58%,#b8d3be 0 13%,transparent 14%),linear-gradient(135deg,#dfe9d4,#cadfcf)}.fleet-map:before{content:"";position:absolute;inset:0;opacity:.45;background-image:linear-gradient(28deg,transparent 47%,#fff 48% 50%,transparent 51%),linear-gradient(95deg,transparent 47%,#b9c7a9 48% 50%,transparent 51%);background-size:120px 95px,155px 130px}.river{position:absolute;left:44%;top:-20%;width:70px;height:150%;background:#86bfd0;transform:rotate(16deg);box-shadow:inset 12px 0 #acd4dd66}.road{position:absolute;height:5px;background:#f2c56a;border:1px solid #d49b3e}.r1{left:-10%;top:54%;width:120%;transform:rotate(-4deg)}.r2{left:30%;top:40%;width:75%;transform:rotate(60deg)}.map-device{position:absolute;width:180px;display:grid;grid-template-columns:34px 1fr;gap:1px 7px;padding:8px;color:#294d5c;background:#fffffff2;border:1px solid #b9d0d8;border-radius:6px;text-align:left;box-shadow:0 4px 14px #27475533}.map-device>i{grid-row:1/3;width:32px;height:32px;display:grid;place-items:center;color:#fff;background:#10a8b8;border-radius:50%;font-style:normal}.map-device>b{font-size:10px}.map-device>small{color:#78909a;font-size:8px}.map-device.active{border-color:#00a9c3;box-shadow:0 0 0 2px #00a9c322,0 5px 18px #16414f44}.map-device.p1{left:14%;top:23%}.map-device.p2{right:12%;top:45%}.map-device.p3{left:32%;bottom:15%}.map-legend{position:absolute;right:10px;bottom:9px;display:flex;gap:12px;padding:7px 10px;background:#fffffff0;border-radius:4px;font-size:9px}.map-legend i{display:inline-block;width:7px;height:7px;margin-right:4px;border-radius:50%;background:#28bd91}.map-legend .busy{background:#22aadd}.map-legend .warn{background:#f2a738}.device-detail{grid-row:1/3;overflow:auto}.device-title{display:flex;align-items:center;gap:10px;padding:14px}.device-title>i{width:37px;height:37px;display:grid;place-items:center;color:#fff;background:#119db7;border-radius:8px;font-style:normal}.device-title span{flex:1}.device-title b,.device-title small{display:block}.device-title b{font-size:12px}.device-title small{margin-top:4px;color:#82939d;font-size:8px}.device-title em{padding:4px 7px;color:#078c68;background:#e0f7ef;border-radius:10px;font-size:9px;font-style:normal}.device-title em.warn{color:#a56b08;background:#fff0cc}.health-ring{--health:346deg;width:118px;height:118px;display:grid;place-items:center;margin:3px auto 14px;border-radius:50%;background:conic-gradient(#11b99b var(--health),#e5eef1 0);position:relative}.health-ring:after{content:"";position:absolute;inset:9px;border-radius:50%;background:white}.health-ring div{z-index:1;text-align:center}.health-ring b{display:block;color:#0d6f7a;font-size:28px}.health-ring small{color:#82959f;font-size:9px}.device-detail dl{margin:0 14px;border-top:1px solid #e4ecef}.device-detail dl div{display:flex;justify-content:space-between;padding:10px 2px;border-bottom:1px solid #edf2f4;font-size:10px}.device-detail dt{color:#81929c}.device-detail dd{margin:0;color:#274654;font-weight:600}.detail-button{width:calc(100% - 28px);margin:14px;padding:9px;color:#08758c;background:#e8f7f9;border:1px solid #acdfe4;border-radius:4px;font-size:10px}.utilization,.alerts{overflow:hidden}.chart{height:132px;display:flex;align-items:flex-end;justify-content:space-around;padding:14px 18px 20px}.chart div{position:relative;width:9%;height:100%;display:flex;align-items:flex-end;justify-content:center}.chart i{width:70%;min-height:12px;background:linear-gradient(#25c9cf,#168bb1);border-radius:3px 3px 0 0}.chart b{position:absolute;bottom:calc(var(--h,0) + 2px);top:-2px;color:#47707e;font-size:8px}.chart small{position:absolute;bottom:-15px;white-space:nowrap;color:#82959e;font-size:8px}.alerts>div{display:grid;grid-template-columns:25px 1fr 36px;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid #eef2f4}.alerts>div>i{width:22px;height:22px;display:grid;place-items:center;color:#87701d;background:#fff3c9;border-radius:50%;font-size:8px;font-style:normal}.alerts>div>i.mid{color:#b6573a;background:#ffe3d9}.alerts span b,.alerts span small{display:block}.alerts span b{font-size:9px}.alerts span small{margin-top:2px;color:#93a1a8;font-size:7px}.alerts time{color:#899ba4;font-size:8px}
.fleet-grid{grid-template-columns:minmax(260px,1fr) minmax(240px,.9fr) 290px}.map-panel{grid-column:1/3}.device-detail{grid-column:3;grid-row:1/3}
</style>
