#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成社交分享卡片 og.png（1200x630，输出到项目根目录）。

改完文案直接重跑：
    python docker/gen_og.py

产物放在项目根，被 index.html 的 og:image / twitter:image 引用为
https://life.lefng.top/og.png，改文件名记得同步改 index.html。
"""

import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "og.png"))

BG = (20, 27, 45)
INK = (233, 228, 212)
BRASS = (201, 164, 92)
DIM = (154, 163, 184)
CELL_OFF = (42, 53, 80)

FONT_DIR = "C:/Windows/Fonts/"
if not os.path.exists(FONT_DIR):
    FONT_DIR = "/usr/share/fonts/truetype/"


def font(name, size):
    try:
        return ImageFont.truetype(FONT_DIR + name, size)
    except Exception:
        return ImageFont.load_default()


img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# 顶部金色细条
d.rectangle([0, 0, W, 6], fill=BRASS)

# 品牌小字 + 主标题
d.text((72, 62), "L E D G E R", font=font("msyh.ttc", 20), fill=BRASS)
d.text((72, 108), "人生工具箱", font=font("msyhbd.ttc", 82), fill=INK)
d.text((74, 224), "房贷月供 · 复利定投 · 买房租房 · 人生窗口",
       font=font("msyh.ttc", 34), fill=INK)
d.text((74, 286), "五个测算工具，一次算清。纯本地计算，数据不上传。",
       font=font("msyh.ttc", 24), fill=DIM)

# 右下：生命格子（30 列代表 30 年，点亮 10 列 = 30 岁；仅示意，不标寿命口径）
CELL, GAP, COLS, ROWS = 14, 4, 30, 12
gw = COLS * CELL + (COLS - 1) * GAP
gh = ROWS * CELL + (ROWS - 1) * GAP
x0, y0 = W - 72 - gw, H - 72 - gh
used_cols = 10
for c in range(COLS):
    for r in range(ROWS):
        x = x0 + c * (CELL + GAP)
        y = y0 + r * (CELL + GAP)
        fill = BRASS if c < used_cols else CELL_OFF
        d.rectangle([x, y, x + CELL, y + CELL], fill=fill)

# 左下：域名
d.text((72, H - 92), "life.lefng.top", font=font("msyhbd.ttc", 26), fill=BRASS)

img.save(OUT, optimize=True)
print("written:", OUT, os.path.getsize(OUT), "bytes")
