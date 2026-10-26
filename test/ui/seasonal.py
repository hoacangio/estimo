import os
from playwright.sync_api import sync_playwright
from datetime import datetime
B = os.environ.get("ESTIMO_URL", "http://localhost:8799"); errs=[]
DATES={"programmers":datetime(2026,9,10,10),"halloween":datetime(2026,10,26,10),"christmas":datetime(2026,12,20,10),"tet":datetime(2027,2,3,10),"womensday":datetime(2027,3,8,10),"none":datetime(2027,5,1,10)}
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,when in DATES.items():
        ctx=b.new_context(viewport={"width":390,"height":844},device_scale_factor=2,is_mobile=True,has_touch=True)
        pg=ctx.new_page(); pg.on("pageerror",lambda e: errs.append(str(e)))
        pg.clock.install(time=when)
        pg.goto(B); pg.wait_for_selector("#create-form"); pg.wait_for_timeout(300)
        pg.clock.run_for(900)
        th=pg.evaluate("document.documentElement.dataset.theme||''"); strip=pg.locator(".season-strip").all_inner_texts()
        toast=pg.locator("#toast").inner_text()
        over=pg.evaluate("document.scrollingElement.scrollHeight-innerHeight")
        print(f"{when:%Y-%m-%d} expect {name:9s} → theme={th or 'default':9s} strip={strip} toast={toast!r} homeOverflow={over}")
        if name!="none":
            pg.screenshot(path=os.path.join(os.path.dirname(__file__), "shots", f"season-{name}-home.png")
            pg.fill("#nick","Hoa"); pg.click("#create-form button[type=submit]"); pg.wait_for_selector(".vcard")
            g=b.new_context().new_page(); g.clock.install(time=when); g.goto(pg.url); g.fill("#gnick","Lan"); g.click("#gate-form button[type=submit]"); g.wait_for_selector(".vcard"); g.click("button.vcard[data-v='5']")
            pg.wait_for_timeout(300); pg.clock.run_for(500)
            print("   room: theme", pg.evaluate("document.documentElement.dataset.theme"), "| strip", pg.locator(".season-strip").count(), "| overflow", pg.evaluate("document.scrollingElement.scrollHeight-innerHeight"))
            pg.screenshot(path=os.path.join(os.path.dirname(__file__), "shots", f"season-{name}-room.png"); g.context.close()
        if name=="halloween":
            pg.goto(B); pg.wait_for_selector("#create-form"); pg.click("[data-act=openSettings]"); pg.clock.run_for(400)
            print("   settings shows:", [t.strip() for t in pg.locator(".theme-opt").all_inner_texts()], "| switch removed:", pg.locator("[data-act=toggleSeasonal]").count() == 0)
            pg.screenshot(path=os.path.join(os.path.dirname(__file__), "shots", "season-settings.png")
            pg.click(".theme-opt[data-theme='']"); pg.clock.run_for(300)
            pg.reload(); pg.wait_for_selector("#create-form")
            print("   after choosing Default + reload:", pg.evaluate("document.documentElement.dataset.theme||'default'"))
        if name=="christmas":
            pg.goto(B); pg.wait_for_selector("#create-form"); pg.click("[data-act=openSettings]"); pg.clock.run_for(400)
            print("   switch removed:", pg.locator("[data-act=toggleSeasonal]").count() == 0)
            pg.click(".theme-opt[data-theme='']"); pg.clock.run_for(300)
            print("   Default chosen →", pg.evaluate("document.documentElement.dataset.theme||'default'"))
            pg.reload(); pg.wait_for_selector("#create-form"); print("   after reload →", pg.evaluate("document.documentElement.dataset.theme||'default'"))
        ctx.close()
    b.close()
print("errors:", errs or "none")
