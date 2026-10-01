"""Headless full-run test: calls, shop, card table, then every lap is played with hazards
(Brace), next-card bets and the stamina Spur. Needs python playwright + chromium."""
import asyncio, pathlib, os, re
LANG_ID = os.environ.get('LANG_ID', 'en')   # set LANG_ID=tr to play the whole test in Turkish
SHOTS = os.environ.get('SHOTS', '.')
from playwright.async_api import async_playwright
def shot(name): return SHOTS + '/' + LANG_ID + '-' + name
URL = 'file://' + str(pathlib.Path(__file__).parent.resolve()) + '/dist/suit-derby.html'

WORDS = re.compile(r"\b(the|and|Lap|Buy|Spur|Stable|Your|Next|Rules|Play|Menu|Brace|cards?|stake|bets?|horse|run|wins?|lost|won)\b")
async def leak(pg, label):
    if LANG_ID != 'tr': return
    txt = await pg.evaluate("Array.from(document.querySelectorAll('.screen:not([hidden])')).map(e=>e.innerText).join('\\n')")
    hits = sorted(set(WORDS.findall(txt)))
    print('LEAK-CHECK', label, hits if hits else 'clean')

async def leak_modal(pg):
    if LANG_ID != 'tr': return
    txt = await pg.evaluate("document.querySelector('#guide').innerText")
    print('LEAK-CHECK guide', sorted(set(WORDS.findall(txt))) or 'clean')

async def pit_actions(pg, lap):
    # starting pick (before lap 1) or one pit crew per stop: cycle through the crews so every pane gets used
    if await pg.locator('[data-spick]').count():
        await pg.click('[data-ptab="crew"]'); await pg.locator('[data-spick]').nth(lap % 3).click()
    elif lap > 0:
        await pg.click('[data-ptab="crew"]')
        n = await pg.locator('[data-crewpick]:not([disabled])').count()
        if n:
            await pg.locator('[data-crewpick]:not([disabled])').nth(lap % n).click()
            for _ in range(3):
                for sel in ('[data-buy]:not([disabled]):visible', '[data-mbuy]:not([disabled]):visible', '[data-drill]:not([disabled]):visible', '[data-spin]:not([disabled]):visible'):
                    btn = pg.locator(sel).first
                    if await btn.count():
                        try: await btn.click(timeout=1500)
                        except Exception: pass
            if await pg.locator('[data-evt]:not([disabled]):visible').count():
                await pg.locator('[data-evt]:not([disabled]):visible').first.click()
            if await pg.locator('[data-deal]:not([disabled]):visible').count():
                await pg.click('[data-deal]')
                if await pg.locator('[data-tg="higher"]:not([disabled]):visible').count(): await pg.click('[data-tg="higher"]')
    await pg.click('[data-ptab="bets"]')
    for pl in range(1, 4):
        h = (pl + lap) % 4
        loc = pg.locator(f'[data-cell="{pl},{h}"]:not([disabled])')
        if await loc.count(): await loc.click()
    if await pg.locator('[data-stake]').count(): await pg.locator('[data-stake]').first.click()

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
        if await pg.locator('#trap:not([disabled])').count():
            try:
                await pg.click('#trap', timeout=1500); stats['trap'] += 1
            except Exception: pass
        if tick % 37 == 0 and await pg.locator('#peek:not([disabled])').count():
            try:
                await pg.click('#peek', timeout=1500); stats['peek'] += 1
                await pg.wait_for_timeout(100)
                if tick % 74 == 0 and await pg.locator('#burn:not([disabled])').count():
                    await pg.click('#burn', timeout=1500); stats['burn'] += 1
            except Exception: pass
        if tick % 23 == 0 and await pg.locator('[data-ab]:not([disabled])').count():
            try:
                await pg.locator('[data-ab]:not([disabled])').first.click(timeout=1200); stats['ab'] = stats.get('ab', 0) + 1
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
                    try:
                        await best.first.click(timeout=1200); stats['bets'] += 1
                    except Exception: pass

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1000, 'height': 900})
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(400)
        if LANG_ID != 'en': await pg.click(f'[data-lang="{LANG_ID}"]')
        await leak(pg, 'menu')
        await pg.screenshot(path=shot('menu.png'), full_page=True)
        await pg.click('#s-menu [data-go="setup"]')
        await leak(pg, 'setup')
        assert await pg.locator('#guide:not([hidden])').count() == 1, 'guide shows on first run'
        await pg.screenshot(path=shot('guide.png'))
        await leak_modal(pg)
        for _ in range(8):
            if await pg.locator('#guide:not([hidden])').count(): await pg.click('#gnext')
        assert await pg.locator('#guide:not([hidden])').count() == 0, 'guide closes'
        await pg.screenshot(path=shot('setup.png'), full_page=True)
        await pg.click('#startRun'); await pg.wait_for_timeout(300)
        print('start screen', await pg.evaluate('__derby.S.screen'))
        await pit_actions(pg, 0)
        await pg.evaluate("['banana','draftg','cutg'].forEach(i=>__derby.E.grant(__derby.S.run,i)); ['veto','wild','dupe'].forEach(i=>__derby.E.grant(__derby.S.run,i))")
        assert await pg.locator('[data-cell^="0,"]:not([disabled])').count() == 0, 'first place must be locked'
        await pg.screenshot(path=shot('prep.png'), full_page=True)
        await leak(pg, 'prep')
        await pg.click('#nextLap')
        stats = {'brace': 0, 'spur': 0, 'bets': 0, 'trap': 0, 'peek': 0, 'burn': 0, 'ab': 0}
        laps = 0
        await pg.wait_for_timeout(3000)
        await leak(pg, 'game')
        await pg.screenshot(path=shot('game.png'))
        for lap in range(10):
            await play_lap(pg, stats)
            sc = await pg.evaluate('__derby.S.screen')
            if sc == 'pit':
                laps += 1
                await pg.wait_for_timeout(300)
                if laps == 2: await leak(pg, 'pit')
                if laps == 2: await pg.screenshot(path=shot('pit.png'), full_page=True)
                if laps == 2:
                    await pg.click('[data-ptab="crew"]'); await pg.screenshot(path=shot('pit-crew.png'), full_page=True)
                    await pg.click('[data-ptab="bets"]'); await pg.screenshot(path=shot('pit-bets.png'), full_page=True)
                await pit_actions(pg, laps)
                await pg.click('#nextLap'); await pg.wait_for_timeout(300); await (pg.click('#nextLap') if await pg.evaluate('__derby.S.screen') == 'pit' else pg.wait_for_timeout(1)); await pg.wait_for_timeout(2500)
            elif sc == 'over': break
        print('laps at pit', laps, 'screen', await pg.evaluate('__derby.S.screen'), stats)
        await pg.wait_for_timeout(500)
        await leak(pg, 'over')
        await pg.screenshot(path=shot('over.png'), full_page=True)
        print('over', await pg.evaluate('JSON.stringify(__derby.S.run.result)'))
        await pg.click('#s-over [data-go="stable"]')
        await leak(pg, 'stable')
        if await pg.locator('.nd.st-aff').count():
            await pg.locator('.nd.st-aff').first.click()
            if await pg.locator('[data-buynode]:not([disabled])').count(): await pg.click('[data-buynode]')
        await pg.click('#s-stable [data-go="menu"]')
        await pg.click('#s-menu [data-go="rules"]')
        await leak(pg, 'rules')
        await pg.screenshot(path=shot('rules.png'), full_page=True)
        await pg.click('#s-rules #openGuide'); assert await pg.locator('#guide:not([hidden])').count() == 1
        await pg.keyboard.press('Escape')
        await pg.click('#s-rules [data-go="menu"]')
        await pg.screenshot(path=shot('menu2.png'), full_page=True)
        await pg.click('#dailyBtn'); await pg.wait_for_timeout(300)
        print('daily', await pg.evaluate('JSON.stringify([__derby.S.daily, __derby.S.run.me, __derby.S.run.laps])'))
        await pit_actions(pg, 0); await pg.click('#nextLap'); await pg.wait_for_timeout(300); await (pg.click('#nextLap') if await pg.evaluate('__derby.S.screen') == 'pit' else pg.wait_for_timeout(1)); await pg.wait_for_timeout(2500)
        st2 = {'brace': 0, 'spur': 0, 'bets': 0, 'trap': 0, 'peek': 0, 'burn': 0}
        for lap in range(6):
            await play_lap(pg, st2)
            sc = await pg.evaluate('__derby.S.screen')
            if sc == 'pit':
                await pg.wait_for_timeout(300)
                if lap == 1: await pg.screenshot(path=shot('pit-daily.png'), full_page=True)
                await pit_actions(pg, lap + 1); await pg.click('#nextLap'); await pg.wait_for_timeout(300); await (pg.click('#nextLap') if await pg.evaluate('__derby.S.screen') == 'pit' else pg.wait_for_timeout(1)); await pg.wait_for_timeout(2500)
            elif sc == 'over': break
        await pg.wait_for_timeout(600)
        print('daily over', await pg.evaluate('__derby.S.screen'), st2)
        print(await pg.evaluate('document.querySelector("#sharetxt").textContent'))
        await pg.screenshot(path=shot('over-daily.png'), full_page=True)
        await pg.click('#s-over [data-go="stable"]'); await pg.screenshot(path=shot('stable.png'), full_page=True)
        pg2 = await b.new_page(viewport={'width': 390, 'height': 844})
        pg2.on('pageerror', lambda e: errs.append('PHONE ' + str(e)))
        await pg2.goto(URL)
        if LANG_ID != 'en': await pg2.click(f'[data-lang="{LANG_ID}"]')
        await pg2.screenshot(path=shot('phone-menu.png'))
        await pg2.click('#s-menu [data-go="setup"]'); await pg2.screenshot(path=shot('phone-guide.png')); await pg2.keyboard.press('Escape'); await pg2.screenshot(path=shot('phone-setup.png'), full_page=True); await pg2.click('#startRun'); await pg2.wait_for_timeout(300)
        await pg2.screenshot(path=shot('phone-pit.png'), full_page=True)
        print('phone prep scrollWidth', await pg2.evaluate('document.documentElement.scrollWidth'))
        await pg2.locator('[data-spick]').first.click(); await pg2.wait_for_timeout(300)
        print('phone state', await pg2.evaluate('JSON.stringify([__derby.S.pitTab, !!__derby.S.run.startPicks, __derby.S.run.startPick, document.querySelector("#nextLap").disabled, document.querySelectorAll("[data-spick]").length])'))
        await pg2.click('#nextLap', timeout=5000); await pg2.wait_for_timeout(5000)
        await pg2.screenshot(path=shot('phone-game.png'))
        print('phone game scrollWidth', await pg2.evaluate('document.documentElement.scrollWidth'))
        print('errors', errs)
        await b.close()
asyncio.run(main())
