import os
"""Verify press feedback per theme: scale while held, pop on pick (once), Retro unchanged."""
from playwright.sync_api import sync_playwright
B = os.environ.get("ESTIMO_URL", "http://localhost:8799")

def scale_of(t):
    if t in ("none", ""): return 1.0
    v = [float(x) for x in t[t.index("(") + 1:-1].split(",")]
    return round((v[0] ** 2 + v[1] ** 2) ** 0.5, 3)  # matrix(a,b,c,d,e,f) -> scale

def held(pg, sel):
    box = pg.locator(sel).bounding_box()
    pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    pg.mouse.down(); pg.wait_for_timeout(150)
    t = pg.eval_on_selector(sel, "e => getComputedStyle(e).transform")
    f = pg.eval_on_selector(sel, "e => getComputedStyle(e).filter")
    pg.mouse.move(5, 890); pg.mouse.up(); pg.wait_for_timeout(250)  # release elsewhere: no click
    return scale_of(t), f

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={"width": 1280, "height": 900}).new_page()
    pg.goto(B); pg.fill("#nick", "Hòa"); pg.click("#create-form button[type=submit]"); pg.wait_for_selector(".vcard")
    guest = b.new_context().new_page(); guest.goto(pg.url); guest.fill("#gnick", "Lan"); guest.click("#gate-form button[type=submit]"); guest.wait_for_selector(".vcard")
    for theme in ["", "cinema", "samurai", "mission", "retro2007"]:
        pg.select_option("#theme-pick", theme); pg.wait_for_timeout(700)
        card_scale, card_filter = held(pg, "button.vcard[data-v='3']")
        btn_scale, _ = held(pg, "button[data-act=openInvite]")
        # pick a card: pop class on the optimistic render, gone after the server echo re-renders
        pg.click("button.vcard[data-v='5']")
        pop_now = pg.locator(".vcard.pop").count()
        guest.click("button.vcard[data-v='8']" if theme != "retro2007" else "button.vcard[data-v='2']"); pg.wait_for_timeout(400)
        pop_after = pg.locator(".vcard.pop").count()
        pg.click("button.vcard[data-v='5']"); pg.wait_for_timeout(300)  # withdraw for next round
        print(f"{theme or 'default':10s} card held scale {card_scale:<5} filter {card_filter:<16} | button held scale {btn_scale:<5} | pop on pick {pop_now}, after re-render {pop_after}")
    b.close()
