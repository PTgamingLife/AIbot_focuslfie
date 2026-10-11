from PIL import Image, ImageDraw, ImageFont
import sys, math
SC = 2  # 超取樣
W, H = 1536*SC, 1024*SC
NAVY, TEAL, CARD = (30,58,95), (46,196,182), (247,249,251)
img = Image.new('RGB', (W, H), NAVY)
d = ImageDraw.Draw(img)
font = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 70*SC)
gap, pad = 14*SC, 14*SC
cw, ch = (W - 2*pad - gap)//2, (H - 2*pad - gap)//2
cells = ['健康檢測', '財務健康度檢測', '個人資訊填寫', '聯絡專員']
lw = 9*SC
def icon(i, cx, cy, r):
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=TEAL)
    k = r*0.55
    w = lw
    if i == 0:  # 心跳線
        pts = [(-1,0),(-.45,0),(-.25,-.6),(0,.7),(.2,-.3),(.35,0),(1,0)]
        d.line([(cx+x*k, cy+y*k) for x,y in pts], fill=CARD, width=w, joint='curve')
    elif i == 1:  # 上升長條
        for j,h in enumerate([.5,.9,1.4]):
            x0 = cx - k + j*k*0.75
            d.rectangle([x0, cy+k*.8-h*k, x0+k*0.5, cy+k*.8], fill=CARD)
    elif i == 2:  # 名片 + 筆
        d.rounded_rectangle([cx-k, cy-k*.7, cx+k*.6, cy+k*.7], radius=8*SC, outline=CARD, width=w)
        d.ellipse([cx-k*.75, cy-k*.4, cx-k*.25, cy+k*.1], outline=CARD, width=w)
        d.line([(cx-k*.05, cy-k*.25),(cx+k*.35, cy-k*.25)], fill=CARD, width=w)
        d.line([(cx-k*.05, cy+k*.2),(cx+k*.35, cy+k*.2)], fill=CARD, width=w)
        d.line([(cx+k*.5, cy+k*.9),(cx+k*1.1, cy+k*.1)], fill=CARD, width=w*2)
    else:  # 對話框
        d.rounded_rectangle([cx-k, cy-k*.75, cx+k, cy+k*.45], radius=18*SC, outline=CARD, width=w)
        d.polygon([(cx-k*.4, cy+k*.4),(cx-k*.6, cy+k*1.0),(cx-k*.05, cy+k*.4)], fill=CARD)
        for x in (-.45, 0, .45):
            d.ellipse([cx+x*k-7*SC, cy-k*.15-7*SC, cx+x*k+7*SC, cy-k*.15+7*SC], fill=CARD)
for i, label in enumerate(cells):
    x0 = pad + (i%2)*(cw+gap); y0 = pad + (i//2)*(ch+gap)
    d.rounded_rectangle([x0, y0, x0+cw, y0+ch], radius=36*SC, fill=CARD)
    cx = x0 + cw//2
    icon(i, cx, y0 + ch*0.38, 95*SC)
    tw = d.textlength(label, font=font)
    d.text((cx - tw/2, y0 + ch*0.68), label, font=font, fill=NAVY, stroke_width=2*SC, stroke_fill=NAVY)
    d.rounded_rectangle([cx-50*SC, y0+ch-40*SC, cx+50*SC, y0+ch-32*SC], radius=4*SC, fill=TEAL)
img = img.resize((1536, 1024), Image.LANCZOS)
img.save(sys.argv[1], 'JPEG', quality=88, optimize=True)
