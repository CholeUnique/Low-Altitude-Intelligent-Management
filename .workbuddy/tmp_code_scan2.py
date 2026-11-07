import json, io, os, re

BASE = os.path.dirname(os.path.abspath(__file__))
doc = json.load(open(os.path.join(BASE, 'swagger-api-docs.json'), encoding='utf-8'))
schemas = doc.get('components', {}).get('schemas', {})
paths = doc.get('paths', {})
out = io.StringIO()

out.write('== area related schema props ==\n')
for name, sc in schemas.items():
    for k, v in (sc.get('properties') or {}).items():
        if re.search(r'area|Area|面积|mj|MJ', k):
            out.write('%-45s %-22s %s\n' % (name, k, (v.get('description') or '')[:90]))
out.write('\n== spot/facility no definitions ==\n')
for name, sc in schemas.items():
    for k, v in (sc.get('properties') or {}).items():
        if k in ('spotNo', 'facilityNo', 'taskNo', 'batchNo', 'seqNo'):
            out.write('%-45s %-12s %s\n' % (name, k, v.get('description') or ''))
out.write('\n== recognition spot add/import descriptions ==\n')
for p in ['/api/v1/biz/recognition/spot/add', '/api/v1/biz/recognition/spot/upload/confirm',
          '/api/v1/biz/recognition/spot/api-import', '/api/v1/spatial/layer/list',
          '/api/v1/spatial/spot/compare', '/api/v1/biz/facility/add', '/api/v1/biz/facility/geojson']:
    if p in paths:
        for m, v in paths[p].items():
            if m in ('get', 'post'):
                out.write('### %s %s\n%s\n\n' % (p, m.upper(), (v.get('description') or '')[:900]))
out.write('\n== SpatialLayerVO ==\n')
out.write(json.dumps(schemas.get('SpatialLayerVO', {}), ensure_ascii=False, indent=1)[:2000])
out.write('\n\n== BizSpotVO ==\n')
out.write(json.dumps(schemas.get('BizSpotVO', {}), ensure_ascii=False, indent=1)[:2500])

open(os.path.join(BASE, 'tmp_scan2.txt'), 'w', encoding='utf-8').write(out.getvalue())
print('ok')
