"""Gambler's Night browser test: a full night through the UI (book, tools, auto/fast, recall, backroom, over, Reputation).
   LANG_ID=tr for Turkish. Screenshots go to $SHOTS."""
import asyncio, pathlib, os, re
LANG_ID = os.environ.get('LANG_ID', 'en'); SHOTS = os.environ.get('SHOTS', '.')
from playwright.async_api import async_playwright
URL = 'file://' + str(pathlib.Path(__file__).parent.resolve()) + '/dist/suit-derby.html'
def shot(n): return SHOTS + '/g-' + LANG_ID + '-' + n
WORDS = re.compile(r"\b(the|and|Race|Buy|Heat|Tools|Draw|Menu|Night|stake|bets?|horse|you|your|wins?|lost|won)\b")
async def leak(pg, label):
    if LANG_ID != 'tr': return
    txt = await pg.evaluate("Array.from(document.querySelectorAll('.screen:not([hidden])')).map(e=>e.innerText).join('\\n')")
    hits = sorted(set(WORDS.findall(txt))); print('LEAK-CHECK', label, hits if hits else 'clean')
async def screen(pg): return await pg.evaluate("document.querySelector('.screen:not([hidden])').id")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1000, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text else None)
        await pg.goto(URL); await pg.wait_for_timeout(300)
        if LANG_ID != 'en': await pg.click(f'[data-lang="{LANG_ID}"]')
        await leak(pg, 'menu'); await pg.screenshot(path=shot('menu.png'))
        txt = await pg.evaluate("document.querySelector('#s-menu').innerText"); print('menu text:', txt.replace('\n', ' | ')[:300])
        # rules page: ten sections, ten tools listed
        await pg.click('#s-menu [data-go="rules"]'); await leak(pg, 'rules'); await pg.screenshot(path=shot('rules.png'), full_page=True)
        assert await pg.locator('#rules section').count() == 10 and await pg.locator('#rules .toolrules li').count() == 10, 'rules content'
        await pg.click('#s-rules [data-go="menu"]')
        # the first-run guide opens once, on the first visit to Gambler's Night
        await pg.click('#s-menu [data-go="gsetup"]')
        assert await pg.locator('#guide:not([hidden])').count() == 1, 'guide opens on first visit'
        await leak(pg, 'guide'); await pg.screenshot(path=shot('guide.png'))
        for i in range(5): await pg.click('#gnext')
        assert await pg.locator('#guide[hidden]').count() == 1, 'guide closes'
        await leak(pg, 'setup'); await pg.screenshot(path=shot('setup.png'), full_page=True)
        await pg.click('#gStart'); await leak(pg, 'book'); await pg.screenshot(path=shot('book.png'), full_page=True)
        stats = {'races': 0, 'tools': 0, 'recalls': 0, 'auto': 0}
        for race in range(5):
            assert await screen(pg) == 's-gbook', 'book screen ' + str(race)
            await pg.click('[data-gbest]')
            if await pg.locator('[data-glock][disabled]').count() and await pg.locator('[data-gchip]:not([disabled])').count():
                await pg.locator('[data-gchip]:not([disabled])').first.click()
            while await pg.locator('[data-glock][disabled]').count() and await pg.locator('.gcell.on').count():
                await pg.locator('.gcell.on').last.click()
            if await pg.locator('[data-glock][disabled]').count():
                print('broke at race', race + 1); await pg.click('[data-gwalk]'); stats['walked'] = 1; break
            if race == 1:
                await pg.click('[data-gtool="peek"]'); await pg.wait_for_timeout(100)
            await pg.click('[data-glock]'); await pg.wait_for_timeout(300)
            assert await screen(pg) == 's-grace'
            if race == 0: await leak(pg, 'race')
            # a few manual draws, tools, a recall, then auto and fast
            for i in range(4): await pg.click('[data-gdraw]'); await pg.wait_for_timeout(60)
            for tool, arg in (('stack', 0), ('mud', 1), ('burn', None)):
                if await pg.locator(f'[data-gtool="{tool}"][aria-disabled="true"]').count(): continue
                await pg.click(f'[data-gtool="{tool}"]')
                if arg is not None and await pg.locator(f'[data-gtarget="{arg}"]:not([disabled])').count(): await pg.click(f'[data-gtarget="{arg}"]')
                stats['tools'] += 1
            if race == 0: await pg.screenshot(path=shot('race.png'), full_page=True)
            if await pg.locator('[data-grecall]').count() and race == 2:
                await pg.locator('[data-grecall]').first.click()
                if await pg.locator('[data-grecall-to]:not([disabled])').count():
                    await pg.locator('[data-grecall-to]:not([disabled])').first.click(); stats['recalls'] += 1
            await pg.click('[data-gauto]'); await pg.wait_for_timeout(1500); stats['auto'] += 1
            if await pg.locator('[data-gauto]').count() and not await pg.locator('[data-gresult]').count():
                await pg.click('[data-gfast]')
            await pg.wait_for_selector('[data-gresult]', timeout=60000)
            if race == 0: await pg.screenshot(path=shot('race-end.png'), full_page=True)
            await pg.click('[data-gresult]'); await pg.wait_for_timeout(300)
            assert await screen(pg) == 's-gback'
            if race == 0: await leak(pg, 'result'); await pg.screenshot(path=shot('result.png'), full_page=True)
            await pg.click('[data-gnext]'); await pg.wait_for_timeout(200); stats['races'] += 1
            if race < 4:
                if race == 0: await leak(pg, 'backroom'); await pg.screenshot(path=shot('backroom.png'), full_page=True)
                if await pg.locator('[data-gfavor]:not([disabled])').count(): await pg.locator('[data-gfavor]:not([disabled])').first.click()
                if race == 1 and await pg.locator('[data-gloan]:not([disabled])').count(): await pg.click('[data-gloan]')
                if await pg.locator('[data-gcool]:not([disabled])').count(): await pg.click('[data-gcool]')
                await pg.click('[data-gnext]'); await pg.wait_for_timeout(300)
        if not stats.get('walked'): pass
        assert await screen(pg) == 's-gover', await screen(pg)
        await leak(pg, 'over'); await pg.screenshot(path=shot('over.png'), full_page=True)
        print('night', stats, await pg.evaluate('JSON.stringify(__gamble.GS.run.over)'))
        await pg.click('#s-gover [data-go="grep"]'); await pg.wait_for_timeout(300)
        await leak(pg, 'rep'); await pg.screenshot(path=shot('rep0.png'))
        n0 = await pg.locator('#gtree .nd').count()
        if await pg.locator('#gtree .nd.st-aff').count():
            await pg.locator('#gtree .nd.st-aff').first.click(); await pg.click('[data-gbuy]'); await pg.wait_for_timeout(300)
        print('tree nodes', n0, '->', await pg.locator('#gtree .nd').count())
        await pg.screenshot(path=shot('rep1.png'))
        # resume: start a night, leave mid-race, continue from the menu
        await pg.click('#s-grep [data-go="gsetup"]'); await pg.click('#gStart'); await pg.click('[data-gbest]'); await pg.click('[data-glock]'); await pg.wait_for_timeout(200)
        for i in range(5): await pg.click('[data-gdraw]'); await pg.wait_for_timeout(60)
        d0 = await pg.evaluate('__gamble.GS.run.race.draws'); await pg.locator('[data-gquit]:visible').first.click(); await pg.wait_for_timeout(200)
        assert await pg.locator('#gResume:not([hidden])').count() == 1, 'resume button'
        await pg.reload(); await pg.wait_for_timeout(300)
        if LANG_ID != 'en': await pg.click(f'[data-lang="{LANG_ID}"]')
        assert await pg.locator('#guide[hidden]').count() == 1, 'guide stays closed after a reload'
        await pg.click('#gResume'); await pg.wait_for_timeout(300)
        d1 = await pg.evaluate('__gamble.GS.run.race.draws'); print('resume draws', d0, d1); assert d0 == d1 == 5
        # phone
        pg2 = await b.new_page(viewport={'width': 390, 'height': 844}); pg2.on('pageerror', lambda e: errs.append('PHONE ' + str(e)))
        await pg2.goto(URL)
        if LANG_ID != 'en': await pg2.click(f'[data-lang="{LANG_ID}"]')
        await pg2.click('#s-menu [data-go="gsetup"]'); await pg2.click('#gskip'); await pg2.click('#gStart'); await pg2.screenshot(path=shot('phone-book.png'), full_page=True)
        print('phone book scrollWidth', await pg2.evaluate('document.documentElement.scrollWidth'))
        await pg2.click('[data-gbest]'); await pg2.click('[data-glock]'); await pg2.wait_for_timeout(300)
        for i in range(6): await pg2.click('[data-gdraw]'); await pg2.wait_for_timeout(60)
        await pg2.screenshot(path=shot('phone-race.png'), full_page=True)
        print('phone race scrollWidth', await pg2.evaluate('document.documentElement.scrollWidth'))
        print('errors', errs); await b.close()
asyncio.run(main())
