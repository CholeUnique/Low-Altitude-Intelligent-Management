import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'

const ledger = parse(readFileSync('src/views/EngineeringFacilityLedger.vue', 'utf8')).descriptor
const template = ledger.template.content
assert.equal((template.match(/class="facility-map-link"/g) || []).length, 2, '编号和名称均可跳转')
assert.equal((template.match(/view: 'map', facilityId: String\(item.id\)/g) || []).length, 2, '使用设施 ID 跳转地图')
assert.match(template, /class="facility-row" @click="openFacilityMap\(item\)"/, '整行可跳转')
for (const action of ['detailRecord = item', 'openReport(item)', 'openQrcode(item)', 'openEdit(item)', 'askDelete(item)']) assert(template.includes(`@click.stop="${action}"`), `${action} 不触发行跳转`)
assert.equal((template.match(/class="facility-map-link" @click.stop/g) || []).length, 2, '链接自身不重复触发行跳转')
assert.match(ledger.scriptSetup.content, /view: 'map', facilityId: String\(record.id\)/, '行跳转携带当前设施 ID')
const script = parse(readFileSync('src/views/EngineeringFacilitiesOverview.vue', 'utf8')).descriptor.scriptSetup.content
const ast = ts.createSourceFile('map.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'selectFromRoute')
assert(fn)
const js = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const items = Array.from({ length: 16 }, (_, i) => ({ key: String(i + 1), geometry: i === 14 ? null : { type: 'Point' } }))
const ctx = { route: { query: { facilityId: '14' } }, map: {}, pending: { value: false }, facilities: { value: items }, selectionNotice: { value: '' }, keyword: { value: 'old' }, typeFilter: { value: 'old' }, statusFilter: { value: 'old' }, page: { value: 1 }, pageSize: 12, nextTick: fn => fn(), selectFacility: item => { ctx.selected = item } }
const select = new Function('ctx', `const {${Object.keys(ctx).join(',')}} = ctx; ${js}; return selectFromRoute`)(ctx)
select()
assert.equal(ctx.selected.key, '14')
assert.equal(ctx.page.value, 2)
assert.equal(ctx.keyword.value, '')
assert.equal(ctx.typeFilter.value, '')
assert.equal(ctx.statusFilter.value, '')
ctx.route.query.facilityId = '15'; select()
assert.equal(ctx.selected.key, '15')
assert.match(ctx.selectionNotice.value, /暂无地图位置/)
ctx.route.query.facilityId = '999'; select()
assert.match(ctx.selectionNotice.value, /未找到该设施/)
ctx.pending.value = true; ctx.selectionNotice.value = ''; select()
assert.equal(ctx.selectionNotice.value, '', '加载完成前不应报未找到')
console.log('Ledger facility links and map selection passed')
