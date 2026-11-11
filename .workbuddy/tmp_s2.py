from PIL import Image

src = r'C:\Users\无敌小黄鸭\.workbuddy\clipboard-images\clipboard-2026-11-10T10-43-36-003Z-5cb17ce0.png'
im = Image.open(src).convert('RGB')
w, h = im.size
print('size', w, h)
out = r'd:\test111\Low-Altitude-Intelligent-Management\.workbuddy'

a = im.crop((int(w*0.25), 12, int(w*0.72), 58))
a = a.resize((a.width*3, a.height*3), Image.LANCZOS)
a.save(out + r'\steps.png')

b = im.crop((int(w*0.79), int(h*0.53), w, int(h*0.80)))
b = b.resize((b.width*3, b.height*3), Image.LANCZOS)
b.save(out + r'\timeline.png')
print('ok')
