import os
from playwright.sync_api import sync_playwright
import json, time
B = os.environ.get("ESTIMO_URL", "http://localhost:8799")
rooms = [{"code": f"room-{i:02d}", "at": int(time.time()*1000) - i*3600000, "deck": "fibonacci", "host": i < 5} for i in range(12)]
allok = True
with sync_playwright() as p:
    b = p.chromium.launch()
    for vw, vh, full, theme in [(390, 844, False, "system"), (390, 844, True, "system"), (375, 667, True, "mission"), (375, 667, False, "retro2007"), (1280, 800, True, "system")]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=vw < 700, has_touch=vw < 700)
        pg = ctx.new_page()
        if full: pg.route("**/api/host/rooms", lambda r: r.fulfill(json={"ok": True, "rooms": [x["code"] for x in rooms[:5]], "max": 5}))
        pg.goto(B); pg.evaluate("([r, t]) => { localStorage.setItem('estimo.recentRooms', JSON.stringify(r)); localStorage.setItem('estimo.theme', JSON.stringify(t)); localStorage.setItem('estimo.name', '\"H\"'); }", [rooms, theme])
        pg.reload(); pg.wait_for_selector(".recent"); pg.wait_for_timeout(700)
        seen, labels, steps = [], [], 0
        while True:
            labels.append(pg.locator(".pager .muted").inner_text())
            seen += [a.get_attribute("href")[3:] for a in pg.locator(".recent-row a").all()]
            over = pg.evaluate("document.scrollingElement.scrollHeight - innerHeight")
            if over > 0 and vw < 700: allok = False; print("  overflow", over)
            nxt = pg.locator("[data-act=recentPage][data-dir='1']")
            if nxt.is_disabled() or steps > 20: break
            nxt.click(); pg.wait_for_timeout(250); steps += 1
        back = 0
        while not pg.locator("[data-act=recentPage][data-dir='-1']").is_disabled() and back < 20: pg.click("[data-act=recentPage][data-dir='-1']"); pg.wait_for_timeout(150); back += 1
        ok = seen == [r["code"] for r in rooms] and back == steps
        allok &= ok
        print(f"{vw}x{vh} {theme:9s} limit={full!s:5} pages {' → '.join(labels)} | covered all once: {seen == [r['code'] for r in rooms]} | back to first: {pg.locator('.pager .muted').inner_text()} {'OK' if ok else 'FAIL'}")
        ctx.close()
    b.close()
print("ALL OK:", allok)
