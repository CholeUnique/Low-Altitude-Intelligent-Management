import json, io, os

ROOT = r'd:\test111\Low-Altitude-Intelligent-Management'
doc = json.load(open(os.path.join(ROOT, '.workbuddy', 'swagger-api-docs.json'), encoding='utf-8'))
raw = open(os.path.join(ROOT, '.workbuddy', 'swagger-api-docs.json'), encoding='utf-8').read()
schemas = doc.get('components', {}).get('schemas', {})
out = io.StringIO()

out.write('has report/image literal: %s\n' % ('report/image' in raw))
out.write('has imageId literal: %s\n' % ('imageId' in raw))
out.write('has FacilityReportImage: %s\n' % ('FacilityReportImage' in raw))
idx = raw.find('imageId')
out.write('context: %s\n' % raw[max(0, idx-300):idx+300] if idx >= 0 else 'none')
out.write('\n\n== all schemas with "image" in name ==\n')
for n in schemas:
    if 'mage' in n:
        out.write(n + '\n')

out.write('\n== dept-exclude schemas ==\n')
for n, sc in schemas.items():
    if 'Exclude' in n or 'exclude' in n:
        out.write('--- %s ---\n%s\n' % (n, json.dumps(sc, ensure_ascii=False, indent=1)[:1400]))

out.write('\n== asset schemas ==\n')
for n, sc in schemas.items():
    if 'Asset' in n:
        out.write('--- %s ---\n%s\n' % (n, json.dumps(sc, ensure_ascii=False, indent=1)[:1600]))

out.write('\n== sync schemas ==\n')
for n, sc in schemas.items():
    if 'Sync' in n:
        out.write('--- %s ---\n%s\n' % (n, json.dumps(sc, ensure_ascii=False, indent=1)[:1000]))

out.write('\n== media clean schemas ==\n')
for n, sc in schemas.items():
    if 'Clean' in n:
        out.write('--- %s ---\n%s\n' % (n, json.dumps(sc, ensure_ascii=False, indent=1)[:1400]))

out.write('\n== project schemas ==\n')
for n, sc in schemas.items():
    if n in ('UavProject', 'UavProjectPageReq', 'UavProjectOption') or n.startswith('BaseRspPageVOUavProject'):
        out.write('--- %s ---\n%s\n' % (n, json.dumps(sc, ensure_ascii=False, indent=1)[:1600]))

out.write('\n== dept save / transfer req ==\n')
for n, sc in schemas.items():
    if n in ('UserDeptSaveReq', 'WfTransferReq', 'UavDeptStatItemVO', 'BizDeptStatItemVO', 'BizFlightSummaryVO', 'UavFlightSummaryVO'):
        out.write('--- %s ---\n%s\n' % (n, json.dumps(sc, ensure_ascii=False, indent=1)[:1400]))
for n in sorted(schemas):
    if 'Transfer' in n or 'DeptSave' in n or 'FlightSummary' in n or 'DeptStatItem' in n:
        out.write('--- %s ---\n%s\n' % (n, json.dumps(schemas[n], ensure_ascii=False, indent=1)[:1400]))

open(os.path.join(ROOT, '.workbuddy', 'tmp_schema_dump.txt'), 'w', encoding='utf-8').write(out.getvalue())
print('ok')
