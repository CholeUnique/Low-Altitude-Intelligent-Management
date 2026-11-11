import re

p = r'd:\test111\Low-Altitude-Intelligent-Management\src\workspace-components\farmland-facilities\FarmlandFacilitiesWorkspace.vue'
lines = open(p, encoding='utf-8').read().split('\n')
line = lines[279]
for key in ['facility-alert', 'workflow/submit', 'submitError']:
    for m in re.finditer(re.escape(key), line):
        print('--- %s @%d ---' % (key, m.start()))
        print(line[max(0, m.start()-200):m.end()+120].replace('\n', ' '))
        print()
