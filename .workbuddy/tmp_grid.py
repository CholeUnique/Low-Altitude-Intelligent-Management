from PIL import Image, ImageDraw

src = r'C:\Users\无敌小黄鸭\.workbuddy\clipboard-images\clipboard-2026-11-10T10-43-36-003Z-5cb17ce0.png'
im = Image.open(src).convert('RGB')
w, h = im.size
grid = im.copy()
d = ImageDraw.Draw(grid)
for x in range(0, w, 100):
    d.line([(x, 0), (x, h)], fill=(255, 0, 255), width=2)
    d.text((x + 4, 4), str(x), fill=(255, 255, 0))
for y in range(0, h, 100):
    d.line([(0, y), (w, y)], fill=(255, 0, 255), width=2)
    d.text((4, y + 4), str(y), fill=(255, 255, 0))
grid.save(r'd:\test111\Low-Altitude-Intelligent-Management\.workbuddy\grid.png')
print('ok', im.size)
