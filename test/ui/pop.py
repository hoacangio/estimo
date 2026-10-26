import os
"""Pop animation must keep its phase when the server echo re-renders the hand mid-animation."""
from playwright.sync_api import sync_playwright
B = os.environ.get("ESTIMO_URL", "http://localhost:8799")
PROG = """() => { const a = document.getAnimations().find(x => x.animationName === 'card-pop'); return a ? +(a.effect.getComputedTiming().localTime).toFixed(0) : null; }"""
with sync_playwright() as p:
    b = p.chromium.launch()
    for theme in ["", "cinema", "samurai", "mission"]:
        pg = b.new_context().new_page()
        pg.add_init_script(f"localStorage.setItem('estimo.theme', JSON.stringify('{theme or 'system'}'))")
        # simulate production latency: hold incoming WebSocket messages for 130 ms
        pg.add_init_script("""(() => { const W = window.WebSocket; window.WebSocket = function (u, p) { const w = new W(u, p);
          const set = Object.getOwnPropertyDescriptor(W.prototype, 'onmessage').set;
          Object.defineProperty(w, 'onmessage', { set(fn) { set.call(w, (e) => setTimeout(() => fn(e), 130)); } }); return w; };
          window.WebSocket.prototype = W.prototype; })()""")
        pg.goto(B); pg.fill("#nick", "Hòa"); pg.click("#create-form button[type=submit]"); pg.wait_for_selector(".vcard"); pg.wait_for_timeout(400)
        pg.click("button.vcard[data-v='5']")
        t0 = pg.evaluate(PROG); pg.wait_for_timeout(200)       # server echo (+130 ms) re-renders in between
        t1 = pg.evaluate(PROG); pg.wait_for_timeout(250)
        t2 = pg.evaluate(PROG)
        print(f"{theme or 'default':8s} pop localTime right after tap {t0} ms → after re-render {t1} ms (continues, not restarted) → done: {t2 is None}")
    b.close()
