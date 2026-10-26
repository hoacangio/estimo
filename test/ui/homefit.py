import os
from playwright.sync_api import sync_playwright
import json, time
B = os.environ.get("ESTIMO_URL", "http://localhost:8799"); O = os.path.join(os.path.dirname(__file__), "shots") + "/"
rooms = [{"code": f"calm-otter-{i}", "at": int(time.time()*1000) - i*86400000, "deck": "fibonacci", "host": i < 3} for i in range(7)]
ok = True; errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for vw, vh, ios in [(390, 844, True), (375, 667, True), (360, 640, False)]:
        ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" if ios else None
        ctx = b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=ua)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(B)
        for theme in ["system", "cinema", "samurai", "mission", "retro2007"]:
            pg.evaluate("([r, t]) => { localStorage.setItem('estimo.recentRooms', JSON.stringify(r)); localStorage.setItem('estimo.name', JSON.stringify('Hòa')); localStorage.setItem('estimo.theme', JSON.stringify(t)); }", [rooms, theme])
            pg.reload(); pg.wait_for_selector("#create-form"); pg.wait_for_timeout(700)
            r = pg.evaluate("() => ({ over: document.scrollingElement.scrollHeight - innerHeight, h: document.scrollingElement.scrollWidth - innerWidth, rec: document.querySelectorAll('.recent a').length, install: !!document.querySelector('.install'), pager: document.querySelector('.pager .muted')?.textContent })")
            good = r["over"] <= 0 and r["h"] <= 0; ok &= good
            print(f"{vw}x{vh} {theme:9s} overflow {r['over']:>4} recent shown {r['rec']} pager {r['pager']} install {r['install']} {'OK' if good else 'FAIL'}")
            if vw == 390: pg.screenshot(path=O + f"home-{theme}.png")
        pg.click("button[data-act=recentPage][data-dir='1']"); pg.wait_for_timeout(200)
        print("  next page:", pg.locator(".pager .muted").inner_text(), [a.inner_text().split("\n")[0] for a in pg.locator(".recent a").all()])
        ctx.close()
    d = b.new_page(viewport={"width": 1280, "height": 800}); d.goto(B); d.wait_for_selector("#create-form"); d.screenshot(path=O + "home-desktop.png")
    print("desktop hero text visible:", d.locator(".hero h1").is_visible())
    b.close()
print("ALL FIT:", ok, "| errors:", errs or "none")
