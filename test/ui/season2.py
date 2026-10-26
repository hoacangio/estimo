import os
from playwright.sync_api import sync_playwright
from datetime import datetime
B = os.environ.get("ESTIMO_URL", "http://localhost:8799"); errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    for when in [datetime(2026,10,9,10),datetime(2026,10,10,10),datetime(2026,11,20,10),datetime(2026,12,4,10),datetime(2027,1,16,10),datetime(2027,2,20,10),datetime(2034,2,20,10)]:
        ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True); pg=ctx.new_page(); pg.on("pageerror",lambda e: errs.append(str(e)))
        pg.clock.install(time=when); pg.goto(B); pg.wait_for_selector("#create-form")
        pg.click("[data-act=openSettings]"); pg.clock.run_for(400)
        opts=[t.strip() for t in pg.locator(".theme-opt").all_inner_texts()][5:]
        print(f"{when:%Y-%m-%d} theme={pg.evaluate('document.documentElement.dataset.theme') or 'default':9s} seasonal options={opts}")
        ctx.close()
    # a seasonal theme picked by hand ends with its season
    ctx=b.new_context(); pg=ctx.new_page(); pg.clock.install(time=datetime(2026,12,10,10)); pg.goto(B); pg.wait_for_selector("#create-form")
    pg.evaluate("localStorage.setItem('estimo.seasonalThemes','false')"); pg.click("[data-act=openSettings]"); pg.clock.run_for(300); pg.click(".theme-opt[data-theme=christmas]"); pg.clock.run_for(300)
    print("picked by hand on 12-10:", pg.evaluate("document.documentElement.dataset.theme"))
    pg.clock.set_system_time(datetime(2027,1,3,10)); pg.reload(); pg.wait_for_selector("#create-form")
    print("same browser on 2027-01-03:", pg.evaluate("document.documentElement.dataset.theme || 'default'"))
    b.close()
print("errors:", errs or "none")
