import asyncio, pathlib
from playwright.async_api import async_playwright
URL = 'file://' + str(pathlib.Path(__file__).parent.resolve()) + '/dist/suit-derby.html'

async def pit_actions(pg, lap):
    # place calls for every place, cycle a stake, play a table hand, buy things
    for pl in range(1,4):
        h=(pl+lap)%4
        loc=pg.locator(f'[data-cell="{pl},{h}"]:not([disabled])')
        if await loc.count(): await loc.click()
    if await pg.locator('[data-stake]').count(): await pg.locator('[data-stake]').first.click()
    if await pg.locator('[data-deal]:not([disabled])').count():
        await pg.click('[data-deal]')
        if await pg.locator('[data-tg="higher"]:not([disabled])').count(): await pg.click('[data-tg="higher"]')
    for _ in range(4):
        btn = pg.locator('[data-buy]:not([disabled])').first
        if await btn.count(): await btn.click()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width':1000,'height':900})
        errs=[]
        pg.on('console', lambda m: errs.append(m.text) if m.type in ('error',) else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(400)
        await pg.screenshot(path='shot-menu.png', full_page=True)
        await pg.click('#s-menu [data-go="setup"]')
        await pg.click('#startRun')
        await pg.wait_for_timeout(300)
        print('start screen', await pg.evaluate('__derby.S.screen'))
        await pg.screenshot(path='shot-prep.png', full_page=True)
        await pit_actions(pg, 0)
        await pg.screenshot(path='shot-prep2.png', full_page=True)
        print('locked first call', await pg.evaluate('JSON.stringify(__derby.S.run.calls[0])'))
        assert await pg.locator('[data-cell^="0,"]:not([disabled])').count()==0
        await pg.locator('[data-cell="0,%d"]' % 1).click(force=True)
        print('after forced click', await pg.evaluate('JSON.stringify(__derby.S.run.calls[0])'))
        await pg.screenshot(path='shot-prep3.png', full_page=True)
        await pg.click('#nextLap')
        await pg.wait_for_timeout(3500)
        await pg.screenshot(path='shot-game.png', full_page=True)
        await pg.evaluate('__derby.S.speed=12')
        laps=0
        for i in range(900):
            await pg.wait_for_timeout(200)
            sc = await pg.evaluate('__derby.S.screen')
            if sc=='pit':
                laps+=1
                if laps==2: await pg.screenshot(path='shot-pit.png', full_page=True)
                await pit_actions(pg, laps)
                if laps==2: await pg.screenshot(path='shot-pit2.png', full_page=True)
                await pg.click('#nextLap')
                await pg.evaluate('__derby.S.speed=12')
                await pg.wait_for_timeout(300)
            if sc=='over': break
        print('laps at pit', laps, 'screen', sc)
        await pg.wait_for_timeout(300)
        await pg.screenshot(path='shot-over.png', full_page=True)
        print('over', await pg.evaluate('JSON.stringify(__derby.S.run.result)'))
        await pg.click('#s-over [data-go="stable"]')
        if await pg.locator('[data-perk]:not([disabled])').count(): await pg.click('[data-perk]:not([disabled]) >> nth=0')
        await pg.click('#s-stable [data-go="menu"]')
        await pg.click('#s-menu [data-go="rules"]')
        await pg.screenshot(path='shot-rules.png', full_page=True)
        print('errors', errs)
        pg2 = await b.new_page(viewport={'width':390,'height':844})
        pg2.on('pageerror', lambda e: errs.append('PHONE '+str(e)))
        await pg2.goto(URL)
        await pg2.click('#s-menu [data-go="setup"]'); await pg2.click('#startRun')
        await pg2.wait_for_timeout(300)
        await pg2.screenshot(path='shot-phone-prep.png', full_page=True)
        print('phone prep scrollWidth', await pg2.evaluate('document.documentElement.scrollWidth'))
        await pg2.click('#nextLap'); await pg2.wait_for_timeout(4200)
        await pg2.screenshot(path='shot-phone-game.png')
        await pg2.evaluate('__derby.S.speed=12')
        for i in range(300):
            await pg2.wait_for_timeout(200)
            if await pg2.evaluate('__derby.S.screen')=='pit': break
        await pg2.screenshot(path='shot-phone-pit.png', full_page=True)
        print('phone pit scrollWidth', await pg2.evaluate('document.documentElement.scrollWidth'))
        print('errors', errs)
        await b.close()
asyncio.run(main())
