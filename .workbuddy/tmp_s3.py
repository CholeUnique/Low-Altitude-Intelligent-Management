from PIL import Image

src = r'C:\Users\无敌小黄鸭\.workbuddy\clipboard-images\clipboard-2026-11-10T10-43-36-003Z-5cb17ce0.png'
im = Image.open(src).convert('RGB')
w, h = im.size
print('size', w, h)
out = r'd:\test111\Low-Altitude-Intelligent-Management\.workbuddy'

s = w / 1080.0
a = im.crop((int(240*s), int(10*s), int(760*s), int(60*s)))
a = a.resize((int(a.width*1.6), int(a.height*1.6)), Image.LANCZOS)
a.save(out + r'\steps.png')

b = im.crop((int(850*s), int(300*s), w, int(510*s)))
b = b.resize((int(b.width*1.5), int(b.height*1.5)), Image.LANCZOS)
b.save(out + r'\timeline.png')
print('ok', a.size, b.size)
