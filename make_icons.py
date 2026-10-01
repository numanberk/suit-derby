"""Draws the app icons (icons/icon-192.png, icon-512.png) with headless Chromium. Run once: python3 make_icons.py"""
import asyncio, pathlib
from playwright.async_api import async_playwright
HTML = """<body style="margin:0;width:512px;height:512px;background:radial-gradient(circle at 50% 40%,#22301e,#0d110c 70%);display:flex;align-items:center;justify-content:center;font-family:Georgia,serif">
<div style="position:relative;width:512px;height:512px">
<div style="position:absolute;left:0;right:0;top:92px;text-align:center;font-size:250px;line-height:1;color:#e9cf73">&#9824;</div>
<div style="position:absolute;left:0;right:0;top:332px;text-align:center;font:900 62px/1 Impact,'Arial Narrow',sans-serif;letter-spacing:8px;color:#ece8da">DERBY</div>
<div style="position:absolute;left:96px;right:96px;top:318px;height:6px;background:#e9cf73;opacity:.7"></div>
</div></body>"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 512, 'height': 512})
        await pg.set_content(HTML)
        await pg.screenshot(path='icons/icon-512.png')
        await pg.set_viewport_size({'width': 512, 'height': 512})
        await pg.evaluate("document.body.style.zoom=0.375")
        await pg.set_viewport_size({'width': 192, 'height': 192})
        await pg.screenshot(path='icons/icon-192.png')
        await b.close()
asyncio.run(main())
