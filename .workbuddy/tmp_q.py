import json, os

p = r'd:\test111\Low-Altitude-Intelligent-Management\.workbuddy\swagger-api-docs.json'
d = json.load(open(p, encoding='utf-8-sig'))
paths = d['paths']
for k, ops in paths.items():
    if 'qrcode' in k:
        print('===', k)
        for m, o in ops.items():
            print(' method:', m, '| summary:', o.get('summary'))
            print(' desc:', (o.get('description') or '')[:600])
            rb = o.get('requestBody') or {}
            ref = ''
            try:
                ref = rb['content']['application/json']['schema']['$ref']
            except Exception:
                pass
            print(' body ref:', ref)
            print(' responses:', ', '.join(o.get('responses', {}).keys()))
            print(' security:', o.get('security'))
        print()

sch = d['components']['schemas']
for n in sch:
    if 'Qrcode' in n or 'QRCode' in n:
        print('--- schema', n)
        print(json.dumps(sch[n], ensure_ascii=False, indent=1)[:800])
        print()
print('securitySchemes:', list(d.get('components', {}).get('securitySchemes', {}).keys()))
print('global security:', d.get('security'))
