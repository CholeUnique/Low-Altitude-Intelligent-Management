/** 只在本地浏览器拦截接口绘制界面预览；不向后端创建任务或提交材料。 */
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'file:///C:/Users/DELL/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const stages = [
  ['task-acceptance', '任务受理', 'TASK_ACCEPTANCE'],
  ['department-review', '部门审核', 'DEPARTMENT_REVIEW'],
  ['on-site-verification', '现场核查', 'ON_SITE_VERIFICATION'],
  ['department-recheck', '部门复核', 'DEPARTMENT_RECHECK'],
  ['case-archive', '结案归档', 'CASE_ARCHIVE'],
]
const task = {
  id: 'preview-01', taskNo: 'DEMO-GBTX-20261102-001', sceneCode: 'FARMLAND_FACILITIES',
  sceneName: '高标准农田工程设施管理', name: '九龙镇输水管线破损报修（界面预览）',
  deptId: '1', deptName: '农业农村局', refType: 'FACILITY', refId: 'GBTX-QL-032',
  executeMode: 'MANUAL', taskStatus: 1, taskStatusDesc: '处理中', priority: 2,
  rangeName: '九龙镇东片区', description: '巡检人员扫码发现输水管线接口渗漏，需核查并维修。',
  contactName: '演示报修人', contactPhone: '仅界面预览', createTime: '2026-11-02T09:30:00',
}
const geometry = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { facilityCode: 'GBTX-QL-032' }, geometry: { type: 'LineString', coordinates: [[119.914, 32.457], [119.920, 32.454], [119.928, 32.451], [119.934, 32.448]] } }] }
const savedResults = [
  { facilityCode: 'GBTX-QL-032', issueCategory: '管线渗漏', description: task.description, acceptanceOpinion: '已核对报修信息，转部门审核。' },
  { issueLevel: '较重', responsibleUnit: '九龙镇管护单位', deadlineNote: '两日内到场', reviewOpinion: '请核查渗漏点并安排维修。' },
  { faultConfirmed: '属实', faultCause: '接口密封件老化', repairAction: '更换密封件并重新加固接口', materials: '密封圈 2 件', testResult: '试运行无渗漏' },
  { checkMethod: '现场复核', repairResult: '通过', retestResult: '连续运行正常', recheckOpinion: '维修结果符合要求。' },
  { closureConclusion: '完成维修并归档', closureSummary: '本次渗漏问题已处置完成，设施恢复运行。' },
]
const files = [
  [{ id: 'a1', fileName: '报修现场照片.jpg', createTime: '2026-11-02 09:31:00' }],
  [{ id: 'b1', fileName: '现场派单说明.pdf', createTime: '2026-11-02 10:12:00' }],
  [{ id: 'c1', fileName: '维修前照片.jpg', createTime: '2026-11-02 13:00:00' }, { id: 'c2', fileName: '维修后照片.jpg', createTime: '2026-11-02 16:25:00' }],
  [{ id: 'd1', fileName: '现场复测记录.pdf', createTime: '2026-11-02 17:18:00' }],
  [{ id: 'e1', fileName: '结案汇总.pdf', createTime: '2026-11-02 18:00:00' }],
]
const output = resolve('docs/previews/farmland-facilities')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] })
try {
  for (let index = 0; index < stages.length; index++) {
    const [key, name, backendKey] = stages[index]
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'preview-only-no-server-token')
      localStorage.setItem('current_user', JSON.stringify({ id: 'preview-user', username: 'preview', realName: '预览办理人', role: 'ADMIN', deptId: '1', deptName: '农业农村局', deptList: [{ deptId: '1', deptName: '农业农村局' }] }))
      localStorage.setItem('active_dept_id', '1')
      localStorage.setItem('auth_mode', 'real')
      localStorage.setItem('organization_id', 'agriculture-rural')
    })
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname
      const nodes = stages.slice(0, index + 1).map(([stageKey, stageName, stageBackendKey], position) => ({
        id: `preview-node-${position + 1}`, bizTaskId: task.id, nodeKey: stageBackendKey, nodeName: stageName,
        nodeType: 'REVIEW', status: position < index ? 'COMPLETED' : 'PROCESSING',
        assigneeId: 'preview-user', assigneeName: '预览办理人', deptId: '1', deptName: '农业农村局',
        createTime: `2026-11-02T${String(9 + position).padStart(2, '0')}:30:00`,
        submitTime: position < index ? `2026-11-02T${String(10 + position).padStart(2, '0')}:20:00` : undefined,
        resultData: position < index ? savedResults[position] : {}, files: files[position],
      }))
      let data
      if (path.endsWith('/biz/task/detail')) data = { task, refSummary: '线状设施 · 输水管线，扫码报修示意', results: [], process: { logs: [] } }
      else if (path.endsWith('/workflow/flow/detail')) data = { flowInstanceId: 'preview-flow', flowKey: 'FACILITY_REPAIR_PREVIEW', status: 'RUNNING', currentNode: nodes.at(-1), timeline: nodes }
      else if (path.endsWith('/biz/task/geometry/geojson')) data = geometry
      else if (path.endsWith('/biz/result/image/list')) data = [{ id: 'photo-01', fileName: '报修现场示意.jpg', mediaType: 'photo', imageUrl: '/src/assets/algorithms/real/road.jpg', thumbnailUrl: '/src/assets/algorithms/real/road.jpg' }]
      else if (path.endsWith('/biz/task/operate-log')) data = [{ id: 'log-1', operateType: 'CREATE', operateTypeDesc: '扫码报修', operateDesc: '上报管线接口渗漏', operatorName: '演示报修人', createTime: '2026-11-02T09:30:00' }]
      else if (path.endsWith('/biz/scene/assignee/query')) data = []
      else if (path.endsWith('/biz/task/my-todo/page') || path.endsWith('/biz/task/page') || path.endsWith('/workflow/todo/page')) data = { records: [], total: 0 }
      else data = []
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, msg: '预览数据', data }) })
    })
    // 截图仅验证布局，避免向外部地图瓦片服务发送预览请求。
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:5189).*/, route => route.abort())
    await page.goto(`http://127.0.0.1:5189/workspace/FARMLAND_FACILITIES/${task.id}?node=${key}`, { waitUntil: 'domcontentloaded' })
    try { await page.locator('.facility-main-card').waitFor({ timeout: 20000 }) }
    catch (reason) {
      console.error('preview diagnostic', page.url(), (await page.locator('body').innerText()).slice(0, 900), errors)
      await page.screenshot({ path: resolve(output, 'debug.png'), fullPage: true })
      throw reason
    }
    await page.locator('.facility-loading').waitFor({ state: 'hidden', timeout: 20000 })
    await page.addStyleTag({ content: '.facility-map-canvas{background-image:url("/src/assets/algorithms/spatial_map.jpg")!important;background-position:center;background-size:cover}.facility-map-canvas .leaflet-tile-pane{display:none!important}' })
    await page.waitForFunction(() => !document.querySelector('.facility-map-canvas .leaflet-overlay-pane svg')?.getAttribute('style')?.includes('scale('), undefined, { timeout: 5000 }).catch(() => {})
    await page.evaluate(() => { const tag = document.createElement('div'); tag.textContent = '界面预览 · 数据仅用于截图'; Object.assign(tag.style, { position: 'fixed', zIndex: '99999', bottom: '14px', right: '20px', padding: '8px 13px', background: '#fff5cc', border: '1px solid #d8a943', borderRadius: '6px', color: '#845616', fontSize: '13px', fontWeight: '700', boxShadow: '0 4px 12px #3333' }); document.body.append(tag) })
    await page.screenshot({ path: resolve(output, `${String(index + 1).padStart(2, '0')}-${name}.png`), fullPage: true })
    if (key === 'on-site-verification') {
      await page.locator('.facility-panel-scroll').evaluate(element => { element.scrollTop = element.scrollHeight })
      await page.screenshot({ path: resolve(output, '03b-现场核查-证据材料.png'), fullPage: true })
    }
    console.log(`${index + 1}. ${name}: ${await page.locator('.facility-panel-head h1').innerText()} ${errors.length ? `page errors: ${errors.join(' | ')}` : 'ok'}`)
    await page.close()
  }
} finally { await browser.close() }
