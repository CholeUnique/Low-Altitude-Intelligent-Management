import { chromium } from '/Users/choleunique/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const base = process.env.PREVIEW_BASE || 'http://127.0.0.1:5173'
const output = path.resolve('output/effect-mockups')
await mkdir(output, { recursive: true })

const pages = [
  ['01-unit-overview', '/dashboard'],
  ['02-flight-fleet', '/flight/fleet'],
  ['03-flight-route-planning', '/patrol/route-plan'],
  ['04-flight-plans', '/flight/plans'],
  ['05-flight-live', '/patrol/live'],
  ['06-recognition-intelligent', '/recognition/intelligent'],
  ['07-recognition-algorithms', '/algorithms'],
  ['08-task-overview', '/task-center/overview'],
  ['09-task-list', '/tasks'],
  ['10-task-scenes', '/task-center/scenes'],
  ['11-task-todo', '/task-center/todo'],
  ['12-assets-map-services', '/assets/map-services'],
  ['13-assets-recognition-results', '/assets/recognition-results'],
  ['14-assets-routes', '/assets/routes'],
  ['15-assets-flight-results', '/assets/flight-results'],
  ['16-assets-other', '/assets/other'],
]
const onlyPage = process.argv[2]

const workspaces = {
  'forestry-enforcement': ['task-detail','director-review','section-review','task-dispatch','field-verification','rectification-tracking','review-archive'],
}

let n = pages.length
for (const [scene, nodes] of Object.entries(workspaces)) {
  for (const node of nodes) {
    n += 1
    pages.push([`${String(n).padStart(2,'0')}-workspace-${scene}-${node}`, `/workspace/${scene}?node=${node}`])
  }
}
pages.push(['24-demand-work-orders', '/task-center/work-orders'])
pages.push(['25-flight-results', '/recognition/flight-results'])

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})
if (!onlyPage) {
  const obsolete = (await readdir(output)).filter(name => /^\d{2}-workspace-forestry-enforcement-[\w-]+\.png$/.test(name) && !pages.some(([pageName]) => `${pageName}.png` === name))
  await Promise.all(obsolete.map(name => unlink(path.join(output, name))))
}
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await context.addInitScript(() => {
  localStorage.setItem('access_token', 'design-preview')
  localStorage.setItem('current_user', JSON.stringify({ id:'preview', username:'preview', realName:'系统管理员', role:'ADMIN', deptList:[] }))
  localStorage.setItem('organization_id', 'natural-resources')
})
const page = await context.newPage()
const manifest = []
for (const [name, route] of pages.filter(([name]) => !onlyPage || name === onlyPage)) {
  const url = `${base}${route}${route.includes('?') ? '&' : '?'}preview=1`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForTimeout(name === '01-unit-overview' ? 1800 : 500)
  const file = `${name}.png`
  await page.screenshot({ path: path.join(output, file), fullPage: false })
  manifest.push({ name, route, file, title: await page.title() })
  process.stdout.write(`captured ${file}\n`)
}
await browser.close()

if (!onlyPage) {
  const groups = manifest.map(item => `- [${item.name}](./${item.file}) - \`${item.route}\``).join('\n')
  await writeFile(path.join(output, 'README.md'), `# 海陵区自然资源综合监管平台 - 页面效果图\n\n生成尺寸：1440 x 900。共 ${manifest.length} 页。第 17–23 页为林业监管流程示意；审核层级及办理人员需按海陵区实际岗位配置。第 24 页为需求工单，第 25 页为飞行结果。图斑及数值为演示数据。\n\n${groups}\n\n## 流程依据与边界\n\n公开规定支持内业资料核查、外业现地核实、业务会审、问题交办和整改复核等环节，但不代表海陵区已采用图中的“分管局长→分管科长”内部审批顺序；这两个节点按本项目效果图需求示意，须由业务方确认并配置。参考：[湖南省林草湿资源督查管理办法](https://lyj.hunan.gov.cn/lyj/xxgk_71167/zcfg/zcwj/202304/t20230425_29323778.html)、[福建省森林督查管理办法](https://lyj.fujian.gov.cn/zwgk/zcfg/gfxwjk/202208/t20220816_5976853.htm)。\n`)
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2))
}
