import fs from 'node:fs'

const raw = fs.readFileSync('docs/openapi-raw.json', 'utf8')
const doc = JSON.parse(raw)
const paths = doc.paths || {}
const rows = []

function refName(schema) {
  if (!schema) return ''
  if (schema.$ref) return String(schema.$ref).split('/').pop()
  if (schema.type) return schema.type
  return ''
}

for (const [path, methods] of Object.entries(paths)) {
  for (const [method, op] of Object.entries(methods)) {
    if (!op || typeof op !== 'object' || !op.responses) continue
    const tags = (op.tags || []).join(',')
    const summary = op.summary || op.operationId || ''
    const reqSchema = op.requestBody?.content?.['application/json']?.schema
    const resContent = op.responses?.['200']?.content || {}
    const resSchema = resContent['*/*']?.schema || resContent['application/json']?.schema
    rows.push({
      method: method.toUpperCase(),
      path,
      tags,
      summary,
      req: refName(reqSchema),
      res: refName(resSchema),
    })
  }
}

rows.sort((a, b) => a.path.localeCompare(b.path))
const out = {
  title: doc.info?.title,
  version: doc.info?.version,
  count: rows.length,
  rows,
}
fs.writeFileSync('docs/openapi-summary.json', JSON.stringify(out, null, 2), 'utf8')
for (const r of rows) {
  console.log(`${r.method}\t${r.path}\t${r.tags}\t${r.summary}\t${r.req}\t${r.res}`)
}
console.error(`parsed ${rows.length} operations from ${out.title}`)
