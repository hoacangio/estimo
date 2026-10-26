import os
"""Room page must fit one screen (no page scroll) on phone + desktop, every theme, voting and revealed."""
from playwright.sync_api import sync_playwright
B = os.environ.get("ESTIMO_URL", "http://localhost:8799"); O = os.path.join(os.path.dirname(__file__), "shots") + "/"
errs = []
def check(pg, tag):
    r = pg.evaluate("""() => {
      const se = document.scrollingElement, sc = document.querySelector('.stage-scroll');
      const dock = document.querySelector('.dock')?.getBoundingClientRect();
      return { page: se.scrollHeight - innerHeight, inner: sc ? sc.scrollHeight - sc.clientHeight : null,
               dockBottom: dock ? Math.round(dock.bottom) : null, vh: innerHeight, hscroll: se.scrollWidth - innerWidth };
    }""")
    ok = r["page"] <= 0 and r["hscroll"] <= 0 and (r["dockBottom"] or 0) <= r["vh"]
    print(f"{tag:34s} pageOverflow {r['page']:>4} innerOverflow {r['inner']!s:>4} dockBottom {r['dockBottom']}/{r['vh']} {'OK' if ok else 'FAIL'}")
    return ok
with sync_playwright() as p:
    b = p.chromium.launch()
    d = b.new_context(viewport={"width": 1280, "height": 800}).new_page()
    d.on("pageerror", lambda e: errs.append(str(e)))
    d.goto(B); d.fill("#nick", "Hòa"); d.click("#create-form button[type=submit]"); d.wait_for_selector(".vcard")
    m = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True).new_page()
    m.on("pageerror", lambda e: errs.append(str(e)))
    m.goto(d.url); m.fill("#gnick", "Lan"); m.click("#gate-form button[type=submit]"); m.wait_for_selector(".vcard")
    small = b.new_context(viewport={"width": 360, "height": 640}, has_touch=True, is_mobile=True).new_page()
    small.goto(d.url); small.fill("#gnick", "Minh"); small.click("#gate-form button[type=submit]"); small.wait_for_selector(".vcard")
    for i, n in enumerate(["An", "Bình", "Châu", "Dũng", "Em"]):
        g = b.new_context().new_page(); g.goto(d.url); g.fill("#gnick", n); g.click("#gate-form button[type=submit]"); g.wait_for_selector(".vcard"); g.click(f"button.vcard[data-v='{[3,5,5,8,9][i]}']")
    allok = True
    for theme in ["", "cinema", "samurai", "mission", "retro2007"]:
        d.select_option("#theme-pick", theme); d.wait_for_timeout(700)
        for pg in (m, small): pg.evaluate("t => localStorage.setItem('estimo.theme', JSON.stringify(t || 'system'))", theme)
        m.reload(); small.reload(); m.wait_for_selector(".vcard"); small.wait_for_selector(".vcard"); m.wait_for_timeout(600)
        name = theme or "default"
        allok &= check(d, f"{name} desktop voting"); allok &= check(m, f"{name} phone voting"); allok &= check(small, f"{name} small phone voting")
        m.screenshot(path=O + f"fit-{name}-m-vote.png"); d.screenshot(path=O + f"fit-{name}-d-vote.png")
        d.click("button.vcard[data-v='5']"); d.wait_for_timeout(200); d.click("button[data-act=reveal]"); d.wait_for_timeout(700)
        allok &= check(d, f"{name} desktop revealed"); allok &= check(m, f"{name} phone revealed"); allok &= check(small, f"{name} small phone revealed")
        m.screenshot(path=O + f"fit-{name}-m-reveal.png"); d.screenshot(path=O + f"fit-{name}-d-reveal.png")
        # drawer on phone
        m.click("button[data-act=toggleDrawer]"); m.wait_for_timeout(450)
        vis = m.eval_on_selector(".drawer", "e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), innerWidth, getComputedStyle(e).visibility]; }")
        m.screenshot(path=O + f"fit-{name}-m-drawer.png")
        m.click(".scrim", position={"x": 10, "y": 300}); m.wait_for_timeout(400)
        closed = m.eval_on_selector(".drawer", "e => getComputedStyle(e).visibility")
        print(f"   drawer open at {vis}, after scrim tap: {closed}")
        d.click("button[data-act=reset] >> nth=-1"); d.wait_for_timeout(400)
        # re-vote guests after reset
    print("ALL FIT:", allok)
    b.close()
print("errors:", errs or "none")
