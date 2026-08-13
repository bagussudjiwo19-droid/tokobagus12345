import numpy as np
from PIL import Image

OUT = "/app/frontend/assets/mascot"
for n in ["happy", "wave", "surprised", "love"]:
    p = f"{OUT}/miko_{n}.png"
    im = Image.open(p).convert("RGBA")
    a = np.array(im).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # piksel abu-abu latar: saturasi rendah (R≈G≈B) & terang sedang (140..222)
    mx = np.max(a[..., :3], axis=2)
    mn = np.min(a[..., :3], axis=2)
    grayish = (mx - mn) < 22
    midtone = (r > 135) & (r < 226)
    bg = grayish & midtone
    alpha = a[..., 3].copy()
    alpha[bg] = 0
    a[..., 3] = alpha
    out = a.astype(np.uint8)
    img = Image.fromarray(out, "RGBA")
    # crop ke bounding box konten (alpha > 0)
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    # buat kanvas persegi transparan agar proporsi pas di kotak 92x92
    w, h = img.size
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
    canvas.thumbnail((512, 512), Image.LANCZOS)
    canvas.save(p, "PNG")
    # verifikasi sudut transparan
    px = canvas.load()
    print(n, canvas.size, "corner alpha:", px[0, 0][3])
