import json, re, io, os

BASE = os.path.dirname(os.path.abspath(__file__))
doc = json.load(open(os.path.join(BASE, 'swagger-api-docs.json'), encoding='utf-8'))

out = io.StringIO()

paths = doc.get('paths', {})
schemas = doc.get('components', {}).get('schemas', {})

out.write('== TOTALS ==\n')
out.write('paths=%d schemas=%d\n\n' % (len(paths), len(schemas)))

out.write('== ALL PATHS ==\n')
for p in sorted(paths):
    methods = ','.join(m.upper() for m in paths[p] if m in ('get', 'post', 'put', 'delete', 'patch'))
    summ = ''
    for m, v in paths[p].items():
        if m in ('get', 'post', 'put', 'delete', 'patch'):
            summ = v.get('summary') or v.get('description') or ''
            break
    out.write('%-58s %-18s %s\n' % (p, methods, summ[:70]))
out.write('\n')

# keyword scan
KW = ['赋码', '编码', '地块', '码', 'code', 'Code', 'encode', 'Encode', 'plot', 'Plot', 'parcel', 'Parcel',
      'landNo', 'landCode', 'plotCode', 'parcelCode', 'unitCode', 'fieldCode', 'gridCode', 'qrcode', 'Qrcode',
      'QRCode', 'qrcodeUrl', 'hash', 'sign']

out.write('== PATHS WITH KEYWORDS ==\n')
for p in sorted(paths):
    if any(k in p for k in ['code', 'Code', 'qrcode', 'parcel', 'plot', 'land']):
        out.write(p + '\n')
        for m, v in paths[p].items():
            if m in ('get', 'post', 'put', 'delete', 'patch'):
                out.write('   %-6s %s | %s\n' % (m.upper(), v.get('summary', ''), (v.get('description') or '')[:200].replace('\n', ' ')))
                for prm in v.get('parameters', []):
                    out.write('        param: %s (%s)\n' % (prm.get('name'), prm.get('in')))
                rb = v.get('requestBody')
                if rb:
                    ref = json.dumps(rb)[:300]
                    out.write('        body: %s\n' % ref)
out.write('\n')

out.write('== SCHEMAS CONTAINING CODE-LIKE FIELDS ==\n')
for name, sc in schemas.items():
    props = sc.get('properties') or {}
    hits = [k for k in props if re.search(r'(code|Code|编码|赋码|no$|No$|sn|SN)', k)]
    if hits:
        out.write('%s -> %s\n' % (name, ', '.join(hits)))

out.write('\n== FACILITY SCHEMAS FULL ==\n')
for name, sc in schemas.items():
    if 'acility' in name:
        out.write('--- %s ---\n' % name)
        out.write(json.dumps(sc, ensure_ascii=False, indent=1)[:2500])
        out.write('\n')

open(os.path.join(BASE, 'tmp_scan_result.txt'), 'w', encoding='utf-8').write(out.getvalue())
print('done')
