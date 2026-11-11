from PIL import Image

src = r'C:\Users\无敌小黄鸭\.workbuddy\clipboard-images\clipboard-2026-11-10T10-43-36-003Z-5cb17ce0.png'
im = Image.open(src).convert('RGB')
w, h = im.size
c = im.crop((470, 60, 640, h - 40))
c = c.resize((int(c.width * 2.2), int(c.height * 2.2)), Image.LANCZOS)
c.save(r'd:\test111\Low-Altitude-Intelligent-Management\.workbuddy\col4.png')
print('ok', c.size)
