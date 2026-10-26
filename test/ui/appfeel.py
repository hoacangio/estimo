import os
from playwright.sync_api import sync_playwright
B = os.environ.get("ESTIMO_URL", "http://localhost:8799"); errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,device_scale_factor=2).new_page()
    pg.on("pageerror",lambda e: errs.append(str(e)))
    pg.goto(B); pg.wait_for_selector("#create-form"); pg.fill("#nick","Hoa")
    run = lambda n: pg.evaluate(f"document.getAnimations().filter(a=>a.animationName==='{n}').length")
    pg.tap("button.chip[data-deck='fibonacci']"); pg.wait_for_timeout(40)
    print("tap chip → re-rendered chip replays press:", pg.locator("button.chip.tapped").count(), "| running:", run("tap-release"))
    pg.evaluate("() => { window.__vt = 0; const o = document.startViewTransition.bind(document); document.startViewTransition = (cb) => { window.__vt++; return o(cb); }; }")
    pg.tap("#create-form button[type=submit]"); pg.wait_for_selector(".vcard")
    print("navigation used a view transition:", pg.evaluate("window.__vt"))
    pg.tap("button.vcard[data-v='3']"); pg.wait_for_timeout(40)
    print("vote card pop running:", run("card-pop"))
    pg.wait_for_timeout(400)
    pg.tap("button[data-act=toggleDrawer]"); pg.wait_for_timeout(40)
    print("menu button press replay:", run("tap-release"), "| drawer slide:", run("drawer-in"))
    pg.wait_for_timeout(500); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.tap("button[data-act=openInvite]"); pg.wait_for_timeout(60); print("invite sheet slide:", run("sheet-in"))
    b.close()
print("errors:", errs or "none")
