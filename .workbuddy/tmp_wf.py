import json, os, io, re

BASE = r'd:\test111\Low-Altitude-Intelligent-Management\.workbuddy'
d = json.load(open(os.path.join(BASE, 'swagger-api-docs.json'), encoding='utf-8-sig'))
sch = d['components']['schemas']
out = io.StringIO()

for n in ['WfSubmitReq', 'WfNodeInstanceVO', 'WfFlowDetailVO', 'WfNodeDetailVO']:
    s = sch.get(n)
    if not s:
        continue
    out.write('=== %s (desc: %s) ===\n' % (n, s.get('description')))
    for k, v in (s.get('properties') or {}).items():
        out.write('  %-20s %-9s %s\n' % (k, v.get('type', ''), (v.get('description') or '')[:100]))
    out.write('  required: %s\n' % s.get('required'))
    out.write('\n')

# workflow/submit 端点描述
for p, ops in d['paths'].items():
    if '/workflow/submit' in p:
        o = ops.get('post', {})
        out.write('=== %s ===\n%s\n\n' % (p, (o.get('description') or '')[:700]))

# 节点 key 枚举线索：搜索描述里含 RECHECK / AUDIT / 部门审核 的 schema 字段
out.write('=== 描述里含 RECHECK_AUDIT / 部门审核 / FINISH_FACILITY 的位置 ===\n')
raw = json.dumps(sch, ensure_ascii=False)
for kw in ['RECHECK_AUDIT', 'FINISH_FACILITY', '部门审核', 'DEPT_AUDIT', 'AUDIT_DEPT']:
    idxs = [mm.start() for mm in re.finditer(re.escape(kw), raw)]
    out.write('  %-14s %d 处\n' % (kw, len(idxs)))
    if idxs:
        for i in idxs[:3]:
            out.write('      ...%s...\n' % raw[max(0, i-160):i+60].replace('\n', ' '))

open(os.path.join(BASE, 'wf.txt'), 'w', encoding='utf-8').write(out.getvalue())
print('ok')
