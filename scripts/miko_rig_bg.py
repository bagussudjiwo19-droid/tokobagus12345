"""Hapus latar putih jadi transparan (flood-fill dari tepi) + autocrop + resize.
Karakter punya outline gelap tertutup sehingga flood-fill putih dari tepi
tidak bocor ke dalam tubuh (tubuh cream tetap utuh)."""
import os
from collections import deque
from PIL import Image

OUT = "/app/frontend/assets/miko_rig"
MAX = 512  # ukuran akhir sisi terpanjang (cukup tajam, hemat memori HP)
TOL = 30   # toleransi "putih"


def is_bg(px):
    r, g, b = px[0], px[1], px[2]
    return r >= 255 - TOL and g >= 255 - TOL and b >= 255 - TOL


def remove_bg(path):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    q = deque()

    def push(x, y):
        i = y * w + x
        if not visited[i]:
            visited[i] = 1
            q.append((x, y))

    for x in range(w):
        push(x, 0); push(x, h - 1)
    for y in range(h):
        push(0, y); push(w - 1, y)

    while q:
        x, y = q.popleft()
        r, g, b, a = px[x, y]
        if not is_bg((r, g, b)):
            continue
        px[x, y] = (r, g, b, 0)
        if x > 0: push(x - 1, y)
        if x < w - 1: push(x + 1, y)
        if y > 0: push(x, y - 1)
        if y < h - 1: push(x, y + 1)

    # autocrop ke bounding box konten
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    # resize sisi terpanjang -> MAX
    w, h = im.size
    scale = MAX / max(w, h)
    if scale < 1:
        im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    im.save(path)
    return im.size


if __name__ == "__main__":
    for fn in sorted(os.listdir(OUT)):
        if fn.endswith(".png"):
            p = os.path.join(OUT, fn)
            try:
                sz = remove_bg(p)
                print(f"[OK] {fn} -> {sz}")
            except Exception as e:
                print(f"[ERR] {fn}: {e}")
