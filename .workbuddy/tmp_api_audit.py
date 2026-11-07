import json, io, os, re

ROOT = r'd:\test111\Low-Altitude-Intelligent-Management'
doc = json.load(open(os.path.join(ROOT, '.workbuddy', 'swagger-api-docs.json'), encoding='utf-8'))
paths = doc.get('paths', {})
schemas = doc.get('components', {}).get('schemas', {})

# 1. collect backend endpoints (normalize: strip /api prefix)
backend = {}
for p, ops in paths.items():
    for m, v in ops.items():
        if m in ('get', 'post', 'put', 'delete', 'patch'):
            norm = re.sub(r'^/api', '', p)
            backend[norm] = {'method': m.upper(), 'summary': v.get('summary', ''),
                             'tags': v.get('tags', []), 'desc': (v.get('description') or '')[:160]}
print('backend endpoints:', len(backend))

# 2. walk src/ and find all quoted strings that look like API paths
used = {}
pat = re.compile(r"""['"`](/v1/[A-Za-z0-9_\-/{}\$.]+)['"`]""")
asset_open = os.path.join(ROOT, 'src')
for dirpath, dirnames, filenames in os.walk(asset_open):
    for fn in filenames:
        if not fn.endswith(('.ts', '.vue', '.js')):
            continue
        fp = os.path.join(dirpath, fn)
        try:
            txt = open(fp, encoding='utf-8').read()
        except Exception:
            continue
        for m in pat.finditer(txt):
            p = m.group(1)
            used.setdefault(p, set()).add(os.path.relpath(fp, asset_open))
print('frontend literal paths:', len(used))

# 3. match
def norm_dynamic(p):
    # replace ${...} and template vars with {} for comparison
    p = re.sub(r'\$\{[^}]*\}', '{}', p)
    return p

backend_norm = {}
for p in backend:
    backend_norm[re.sub(r'\{[^}]*\}', '{}', p)] = p

matched, unmatched_front = {}, {}
for p, files in used.items():
    n = norm_dynamic(p)
    if n in backend_norm or p in backend:
        matched.setdefault(backend_norm.get(n, p), set()).update(files)
    else:
        unmatched_front[p] = files

missing = {p: v for p, v in backend.items() if p not in matched and re.sub(r'\{[^}]*\}', '{}', p) not in {re.sub(r'\{[^}]*\}', '{}', x) for x in matched}}

out = io.StringIO()
out.write('=== 1. 未接入的后端接口 (%d / %d) ===\n' % (len(missing), len(backend)))
for p in sorted(missing):
    v = missing[p]
    out.write('%s\n   %-6s [%s] %s\n' % (p, v['method'], ','.join(v['tags']), v['summary']))
    if v['desc']:
        out.write('   > %s\n' % v['desc'].replace('\n', ' '))
    out.write('\n')

out.write('\n=== 2. 前端调用但后端找不到的路径 (%d) ===\n' % len(unmatched_front))
for p in sorted(unmatched_front):
    out.write('%-70s %s\n' % (p, ','.join(sorted(unmatched_front[p]))))

out.write('\n=== 3. 已接入清单 (%d) ===\n' % len(matched))
for p in sorted(matched):
    out.write('%-62s %s\n' % (p, ','.join(sorted(x for x in matched[p] if x.startswith('api')))))

open(os.path.join(ROOT, '.workbuddy', 'tmp_api_audit.txt'), 'w', encoding='utf-8').write(out.getvalue())

# also dump schemas of interescting names for later
ops = io.StringIO()
for p in sorted(missing):
    ops.write(p + '  ->  ' + missing[p]['summary'] + '\n')
open(os.path.join(ROOT, '.workbuddy', 'tmp_missing_list.txt'), 'w', encoding='utf-8').write(ops.getvalue())
print('done')
