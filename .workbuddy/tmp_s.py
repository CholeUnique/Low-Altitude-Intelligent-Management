from PIL import Image

src = r'C:\Users\无敌小黄鸭\.workbuddy\clipboard-images\clipboard-2026-11-10T10-43-36-003Z-5cb17ce0.png'
im = Image.open(src).convert('RGB')
w, h = im.size
print('size', w, h)
out = r'd:\test111\Low-Altitude-Intelligent-Management\.workbuddy'

# 顶部步进条
a = im.crop((int(w*0.28), int(h*0.015), int(w*0.99), int(h*0.075)))
a = a.resize((a.width*2, a.height*2), Image.LANCZOS)
a.save(out + r'\steps.png')

# 右侧 处置时间线 + 任务操作记录
b = im.crop((int(w*0.80), int(h*0.30), int(w*0.995), int(h*0.78)))
b = b.resize((b.width*2, b.height*2), Image.LANCZOS)
b.save(out + r'\timeline.png')
print('ok')
