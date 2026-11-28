"""
顔の絵（台詞の枠の顔の丸）を、発注者の立ち絵から作る（docs/KAYKIT.md の 14 章）。

    pip install numpy opencv-python-headless scipy pillow
    python3 scripts/portraits-prepare.py [--preview=フォルダ]

元の絵: art/characters/<人物>.png（1024x1536。黒い地に、人物のまわりの光のにじみ）
出来る物: public/portraits/<人物>.webp（256x256。背景は透明。胸から上）

背景の取り方:
  1. 縁から、なだらかな所（黒い地）を塗りつぶして、人物と光のにじみの塊を取る
  2. その外を背景、内側の芯を人物の見込みとして、GrabCut（色の分布で人と背景を分ける方法）で、光のにじみを取る
  3. 人物に囲まれた光のにじみ（ユナの首とおさげの間）は GrabCut が人物と見るので、SEEDS に背景の印を手で置く

切り抜き: 目の高さ（EYE_Y）と、目からあごまでの長さ（EYE_TO_CHIN）を、4人でそろえる（FACES は元の絵の画素で測った値）。
"""
import sys
import os
import numpy as np
import cv2
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIZE = 256
# 丸の中での目の高さ（上から）と、目からあごまでの長さ（どちらも丸の直径に対する割合）
EYE_Y = 0.46
EYE_TO_CHIN = 0.16

# 人物ごとの、元の絵での両目の真ん中（x, y）とあごの y（画素）
FACES = {
    'touma': (477, 162, 212),
    'father': (480, 127, 192),
    'yuna': (505, 160, 227),
    'mother': (475, 157, 217),
}
# GrabCut が人物と見てしまう、囲まれた光のにじみに置く背景の印（x0, y0, x1, y1）
SEEDS = {
    'yuna': [(585, 212, 615, 238), (612, 245, 640, 262), (478, 232, 505, 262), (442, 252, 468, 272)],
}


def matte(im):
    """人物の不透明度（0〜1）"""
    lum = cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.2)
    g = np.hypot(cv2.Sobel(lum, cv2.CV_32F, 1, 0), cv2.Sobel(lum, cv2.CV_32F, 0, 1))
    lab, _ = ndi.label(g < 6)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outer = np.isin(lab, list(border))
    blob = ndi.binary_fill_holes(ndi.binary_closing(~outer, iterations=3))
    return blob


def cut(name):
    im = cv2.imread(os.path.join(ROOT, 'art', 'characters', f'{name}.png'))
    blob = matte(im)
    mask = np.full(im.shape[:2], cv2.GC_PR_BGD, np.uint8)
    mask[~blob] = cv2.GC_BGD
    mask[ndi.binary_erosion(blob, iterations=40)] = cv2.GC_PR_FGD
    for x0, y0, x1, y1 in SEEDS.get(name, []):
        mask[y0:y1, x0:x1] = cv2.GC_BGD
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(im, mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    fg = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    fg = ndi.binary_opening(fg, iterations=2)
    # 小さな穴（線の内側の細かい所）だけを埋める。大きな穴は背景のまま
    holes = ndi.binary_fill_holes(fg) & ~fg
    hl, hk = ndi.label(holes)
    for i, sz in enumerate(ndi.sum(holes, hl, range(1, hk + 1))):
        if sz < 600:
            fg |= hl == (i + 1)
    l2, k = ndi.label(fg)
    fg = l2 == (1 + int(np.argmax(ndi.sum(fg, l2, range(1, k + 1)))))
    alpha = cv2.GaussianBlur(fg.astype(np.float32), (0, 0), 0.8)
    return im, alpha


def portrait(name):
    im, alpha = cut(name)
    ex, ey, chin = FACES[name]
    scale = EYE_TO_CHIN * SIZE / (chin - ey)
    # 元の絵の点 (x, y) → 丸の中の点
    m = np.array([[scale, 0, SIZE / 2 - ex * scale], [0, scale, EYE_Y * SIZE - ey * scale]], np.float32)
    rgba = np.dstack([im, (alpha * 255).astype(np.uint8)])
    return cv2.warpAffine(rgba, m, (SIZE, SIZE), flags=cv2.INTER_AREA, borderValue=(0, 0, 0, 0))


def main():
    args = dict(a.lstrip('-').split('=', 1) for a in sys.argv[1:] if '=' in a)
    out = os.path.join(ROOT, 'public', 'portraits')
    os.makedirs(out, exist_ok=True)
    tiles = []
    for name in FACES:
        p = portrait(name)
        path = os.path.join(out, f'{name}.webp')
        cv2.imwrite(path, p, [cv2.IMWRITE_WEBP_QUALITY, 88])
        print(path, os.path.getsize(path), 'bytes')
        tiles.append(p)
    if 'preview' in args:
        # 台詞の枠の丸（濃紺の地）に入れた見本
        yy, xx = np.mgrid[0:SIZE, 0:SIZE]
        r = np.hypot(xx - SIZE / 2, yy - SIZE * 0.38) / (SIZE * 0.72)
        c0, c1 = np.array([0x6a, 0x40, 0x34], np.float32), np.array([0x31, 0x1b, 0x13], np.float32)
        ground = c0 + (c1 - c0) * np.clip(r, 0, 1)[..., None]
        inside = (np.hypot(xx - SIZE / 2 + 0.5, yy - SIZE / 2 + 0.5) < SIZE / 2)[..., None]
        row = []
        for p in tiles:
            a = p[..., 3:4].astype(np.float32) / 255
            comp = p[..., :3] * a + ground * (1 - a)
            row.append(np.where(inside, comp, 27).astype(np.uint8))
        os.makedirs(args['preview'], exist_ok=True)
        cv2.imwrite(os.path.join(args['preview'], 'portraits.png'), np.hstack(row))


if __name__ == '__main__':
    main()
