import os
"""Bigger cards: measure sizes and one-screen fit for 3 / 12 / 20 voters, voting + revealed, several screens and themes."""
from playwright.sync_api import sync_playwright
import subprocess, time
B = os.environ.get("ESTIMO_URL", "http://localhost:8799"); O = os.path.join(os.path.dirname(__file__), "shots") + "/"; allok=True; errs=[]
VIEWS=[(390,844),(360,640),(375,667),(1280,800),(1440,900),(768,1024)]
def measure(pg):
    return pg.evaluate("""() => { const se=document.scrollingElement, sc=document.querySelector('.stage-scroll'), d=document.querySelector('.dock')?.getBoundingClientRect(),
      pc=document.querySelector('.stage .pcard')?.getBoundingClientRect(), vc=document.querySelector('.dock .vcard')?.getBoundingClientRect();
      return {page:se.scrollHeight-innerHeight, h:se.scrollWidth-innerWidth, inner: sc? sc.scrollHeight-sc.clientHeight:0, dock: d? Math.round(d.bottom):0, vh: innerHeight,
        pcard: pc? [Math.round(pc.width),Math.round(pc.height)]:null, vcard: vc? [Math.round(vc.width),Math.round(vc.height)]:null }; }""")
with sync_playwright() as p:
    b=p.chromium.launch()
    for theme in ["system","mission","retro2007"]:
        for n in [2,11,19]:
            host=b.new_context(viewport={"width":1280,"height":800}).new_page(); host.on("pageerror",lambda e: errs.append(str(e)))
            host.add_init_script(f"localStorage.setItem('estimo.theme', JSON.stringify('{theme}')); localStorage.setItem('estimo.seasonDismissed', JSON.stringify('halloween-2026'))")
            host.goto(B); host.fill("#nick","Hòa"); host.click("#create-form button[type=submit]"); host.wait_for_selector(".vcard"); room=host.url.rsplit("/",1)[1]
            bots=subprocess.Popen(["node", os.path.join(os.path.dirname(__file__), "bots.mjs"),room,str(n),"60"]); time.sleep(1.5)
            for phase in ["voting","revealed"]:
                if phase=="revealed": host.click("button[data-act=reveal]"); time.sleep(.6)
                for vw,vh in VIEWS:
                    ctx=b.new_context(viewport={"width":vw,"height":vh},is_mobile=vw<700,has_touch=vw<700,device_scale_factor=2 if vw<700 else 1)
                    ctx.add_init_script(f"localStorage.setItem('estimo.theme', JSON.stringify('{theme}')); localStorage.setItem('estimo.name', JSON.stringify('Lan')); localStorage.setItem('estimo.seasonDismissed', JSON.stringify('halloween-2026'))")
                    pg=ctx.new_page(); pg.on("pageerror",lambda e: errs.append(str(e))); pg.goto(f"{B}/r/{room}"); pg.wait_for_selector(".table .seats"); pg.wait_for_timeout(500)
                    m=measure(pg); ok=m["page"]<=0 and m["h"]<=0 and m["dock"]<=m["vh"]
                    allok&=ok
                    print(f"{theme:9s} {n+2:2d} voters {phase:8s} {vw}x{vh}: pcard {m['pcard']} vcard {m['vcard']} innerScroll {m['inner']:>3} {'OK' if ok else 'FAIL '+str(m)}")
                    if (vw,vh) in [(390,844),(1280,800)] and theme=="system": pg.screenshot(path=O+f"cards-{n+2}-{phase}-{vw}.png")
                    ctx.close()
            bots.kill(); host.context.close()
    b.close()
print("ALL OK:", allok, "| errors:", errs or "none")
