import re

p = r'd:\test111\Low-Altitude-Intelligent-Management\src\workspace-components\farmland-facilities\FarmlandFacilitiesWorkspace.vue'
line = open(p, encoding='utf-8').read().split('\n')[279]

# 提交函数：找 workflow/submit 调用与 submitError 赋值
for key in ['workflow/submit', 'submitError.value =', 'async function submit', 'function submit']:
    for m in re.finditer(re.escape(key), line):
        print('--- %s ---' % key)
        print(line[max(0, m.start()-260):m.end()+160].replace('\n', ' '))
        print()
