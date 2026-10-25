"""Client-side performance: page weight, load timing, render cost with many participants.

    node scripts/local-server.mjs 8787 &
    python3 test/perf/client_perf.py http://localhost:8787
"""
import gzip, json, os, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8787"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
out = {}

# 1. Page weight (what a first visit downloads from our origin)
weight = {}
for f in ["index.html", "app.js", "qr.js"]:
    raw = open(os.path.join(ROOT, "public", f), "rb").read()
    weight[f] = {"raw": len(raw), "gzip": len(gzip.compress(raw, 9))}
weight["total"] = {k: sum(v[k] for v in weight.values()) for k in ("raw", "gzip")}
out["weight"] = weight
print("Page weight (own origin):", ", ".join(f"{k} {v['gzip']/1024:.1f} KB gz" for k, v in weight.items()))

# 2. Background crowd: N bot participants held open by a small Node script
def crowd(room, n):
    js = f"""
const ws=[];for(let i=0;i<{n};i++){{const w=new WebSocket('{BASE.replace('http','ws')}/ws/{room}');
w.onopen=()=>w.send(JSON.stringify({{t:'join',id:crypto.randomUUID(),name:'bot'+i,create:true}}));ws.push(w);}}
setTimeout(()=>ws.forEach((w,i)=>i%2&&w.send(JSON.stringify({{t:'vote',v:'5'}}))),1500);
setTimeout(()=>process.exit(0),60000);"""
    return subprocess.Popen(["node", "-e", js])

with sync_playwright() as p:
    b = p.chromium.launch()
    # Load timing (cold, no fonts cache) — fonts are blocked offline, so timings exclude them
    ctx = b.new_context(); pg = ctx.new_page()
    pg.goto(BASE, wait_until="load")
    nav = pg.evaluate("JSON.stringify(performance.getEntriesByType('navigation')[0])")
    nav = json.loads(nav)
    fcp = pg.evaluate("(performance.getEntriesByName('first-contentful-paint')[0]||{}).startTime||null")
    out["load"] = {"domContentLoaded": round(nav["domContentLoadedEventEnd"], 1), "load": round(nav["loadEventEnd"], 1), "fcp": round(fcp, 1) if fcp else None}
    print(f"Home load: DOMContentLoaded {out['load']['domContentLoaded']} ms · load {out['load']['load']} ms · FCP {out['load']['fcp']} ms")

    # Render cost with 10 / 50 / 100 participants
    out["render"] = {}
    for n in (10, 50, 99):
        room = f"perf-client-{n}-{int(time.time())}"
        bots = crowd(room, n)
        time.sleep(1.5)  # bots create the room first
        pg2 = b.new_context().new_page()
        pg2.add_init_script("""
          window.__renders = [];
          window.addEventListener('DOMContentLoaded', () => {
            const orig = window.render;
            window.render = function () { const t = performance.now(); orig.apply(this, arguments); window.__renders.push(performance.now() - t); };
          });""")
        pg2.goto(f"{BASE}/r/{room}")
        pg2.fill("#gnick", "Measurer"); pg2.click("#gate-form button[type=submit]")
        pg2.wait_for_function(f"document.querySelectorAll('.seat').length >= {n + 1}", timeout=20000)
        pg2.evaluate("window.__renders = []")
        for v in ["1", "2", "3", "5", "8", "13", "1", "2", "3", "5", "8", "13"]:
            pg2.click(f"button[data-act=vote][data-v='{v}']"); pg2.wait_for_timeout(260)
        pg2.click("text=Reveal cards"); pg2.wait_for_timeout(500)
        r = sorted(pg2.evaluate("window.__renders"))
        dom = pg2.evaluate("document.getElementsByTagName('*').length")
        heap = pg2.evaluate("performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576*10)/10 : null")
        out["render"][n + 1] = {"p50": round(r[len(r) // 2], 2), "max": round(r[-1], 2), "samples": len(r), "domNodes": dom, "heapMB": heap}
        print(f"  {n + 1:3d} participants: render p50 {r[len(r)//2]:.2f} ms · max {r[-1]:.2f} ms · {dom} DOM nodes · heap {heap} MB")
        pg2.context.close(); bots.kill()

    # QR encode cost
    qr = pg.evaluate("(() => { const t = performance.now(); for (let i = 0; i < 50; i++) EstimoQR.toSvg('https://estimo.example.workers.dev/r/calm-otter-' + i); return (performance.now() - t) / 50; })()")
    out["qrMs"] = round(qr, 2)
    print(f"QR encode: {qr:.2f} ms per code")
    b.close()

print("\nSUMMARY " + json.dumps(out))
