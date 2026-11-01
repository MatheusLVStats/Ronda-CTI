"""Gera os ícones PNG do app a partir de um SVG, usando o Chrome headless (Playwright).

Uso: python3 scripts/make_icons.py   (a partir da pasta app/)
"""
import pathlib
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

# Azul-marinho do CriticalEye, traço do monitor em branco e um ponto azul-claro.
def svg(size: int, maskable: bool) -> str:
    r = 0 if maskable else round(size * 0.22)
    s = 0.62 if maskable else 0.78  # zona segura do ícone adaptável
    off = (1 - s) / 2 * size
    k = s * size / 192
    path = "M24 100 h34 l14 -42 l26 84 l18 -60 l12 18 h40"
    return f"""<svg xmlns='http://www.w3.org/2000/svg' width='{size}' height='{size}' viewBox='0 0 {size} {size}'>
<rect width='{size}' height='{size}' rx='{r}' fill='#01234F'/>
<g transform='translate({off},{off}) scale({k})'>
<path d='{path}' fill='none' stroke='#FFFFFF' stroke-width='13' stroke-linecap='round' stroke-linejoin='round'/>
<circle cx='168' cy='100' r='10' fill='#7FB2E5'/>
</g></svg>"""


with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    pg = b.new_page()
    for name, size, mask in [("icon-192", 192, False), ("icon-512", 512, False),
                             ("apple-touch-icon", 180, True), ("icon-maskable-512", 512, True)]:
        pg.set_viewport_size({"width": size, "height": size})
        pg.set_content(f"<html><body style='margin:0;background:transparent'>{svg(size, mask)}</body></html>")
        pg.screenshot(path=str(OUT / f"{name}.png"), omit_background=not mask, clip={"x": 0, "y": 0, "width": size, "height": size})
        print("ok", name)
    b.close()
