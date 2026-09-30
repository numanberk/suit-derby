"""Headless full-run test: calls, shop, card table, then every lap is played with hazards
(Brace), next-card bets and the stamina Spur. Needs python playwright + chromium."""
import asyncio, pathlib
from playwright.async_api import async_playwright
URL = 'file://' + str(pathlib.Path(__file__).parent.resolve()) + '/dist/suit-derby.html'

async def pit_actions(pg, lap):
    for pl in range(1, 4):
        h = (pl + lap) % 4
        loc = pg.locator(f'[data-cell="{pl},{h}"]:not([disabled])')
        if await loc.count(): await loc.click()
    if await pg.locator('[data-stake]').count(): await pg.locator('[data-stake]').first.click()
    if await pg.locator('[data-deal]:not([disabled])').count():
        await pg.click('[data-deal]')
        if await pg.locator('[data-tg="higher"]:not([disabled])').count(): await pg.click('[data-tg="higher"]')
    for _ in range(4):
        btn = pg.locator('[data-buy]:not([disabled])').first
        if await btn.count(): await btn.click()

async def play_lap(pg, stats):
    """One lap: brace every hazard, bet on the likeliest suit now and then, spur at full stamina."""
    await pg.evaluate('__derby.S.speed=4')
    tick = 0
    for _ in range(2000):
        await pg.wait_for_timeout(70)
        tick += 1
        if await pg.evaluate('__derby.S.screen') != 'game': return
        if await pg.locator('#brace:not([disabled])').count():
            await pg.wait_for_timeout(150)
            try:
                await pg.click('#brace', force=True, timeout=1500); stats['brace'] += 1
            except Exception: pass
        if await pg.locator('#spur.full:not([disabled])').count():
            try:
                await pg.click('#spur', timeout=1500); stats['spur'] += 1
            except Exception: pass
        if tick % 10 == 0:
            b = pg.locator('.bbtn.has')
            if await b.count() == 0:
                best = pg.locator('.bbtn:not([disabled]):not(.out):not(.dry)')
                if await best.count():
                    await best.first.click(); stats['bets'] += 1

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1000, 'height': 900})
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(400)
        await pg.screenshot(path='shot-menu.png', full_page=True)
        await pg.click('#s-menu [data-go="setup"]')
        await pg.click('#startRun'); await pg.wait_for_timeout(300)
        print('start screen', await pg.evaluate('__derby.S.screen'))
        await pit_actions(pg, 0)
        assert await pg.locator('[data-cell^="0,"]:not([disabled])').count() == 0, 'first place must be locked'
        await pg.screenshot(path='shot-prep.png', full_page=True)
        await pg.click('#nextLap')
        stats = {'brace': 0, 'spur': 0, 'bets': 0}
        laps = 0
        await pg.wait_for_timeout(3000)
        await pg.screenshot(path='shot-game.png')
        for lap in range(10):
            await play_lap(pg, stats)
            sc = await pg.evaluate('__derby.S.screen')
            if sc == 'pit':
                laps += 1
                await pg.wait_for_timeout(300)
                if laps == 2: await pg.screenshot(path='shot-pit.png', full_page=True)
                await pit_actions(pg, laps)
                await pg.click('#nextLap'); await pg.wait_for_timeout(2800)
            elif sc == 'over': break
        print('laps at pit', laps, 'screen', await pg.evaluate('__derby.S.screen'), stats)
        await pg.wait_for_timeout(500)
        await pg.screenshot(path='shot-over.png', full_page=True)
        print('over', await pg.evaluate('JSON.stringify(__derby.S.run.result)'))
        await pg.click('#s-over [data-go="stable"]')
        if await pg.locator('[data-perk]:not([disabled])').count(): await pg.click('[data-perk]:not([disabled]) >> nth=0')
        await pg.click('#s-stable [data-go="menu"]')
        await pg.click('#s-menu [data-go="rules"]')
        await pg.screenshot(path='shot-rules.png', full_page=True)
        pg2 = await b.new_page(viewport={'width': 390, 'height': 844})
        pg2.on('pageerror', lambda e: errs.append('PHONE ' + str(e)))
        await pg2.goto(URL)
        await pg2.click('#s-menu [data-go="setup"]'); await pg2.click('#startRun'); await pg2.wait_for_timeout(300)
        print('phone prep scrollWidth', await pg2.evaluate('document.documentElement.scrollWidth'))
        await pg2.click('#nextLap'); await pg2.wait_for_timeout(5000)
        await pg2.screenshot(path='shot-phone-game.png')
        print('phone game scrollWidth', await pg2.evaluate('document.documentElement.scrollWidth'))
        print('errors', errs)
        await b.close()
asyncio.run(main())
