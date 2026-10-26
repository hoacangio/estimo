import os
from playwright.sync_api import sync_playwright
import json, urllib.request
B = os.environ.get("ESTIMO_URL", "http://localhost:8799"); O = os.path.join(os.path.dirname(__file__), "shots") + "/"; errs = []
def api(path, body, headers={"Content-Type": "application/json"}, method="POST"):
    req = urllib.request.Request(B + path, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, e.read().decode()[:80]
with sync_playwright() as p:
    b = p.chromium.launch()
    h = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    h.on("pageerror", lambda e: errs.append(str(e)))
    h.on("console", lambda m: errs.append(m.text) if m.type == "error" and "PROXY" not in m.text else None)
    h.goto(B); h.fill("#nick", "Hòa")
    codes = []
    for i in range(5):
        h.click("#create-form button[type=submit]"); h.wait_for_selector(".vcard"); codes.append(h.url.rsplit("/", 1)[1])
        h.click(".logo"); h.wait_for_selector("#create-form"); h.wait_for_timeout(300)
    btn = h.locator(".create-btn")
    print("after 5 rooms → create disabled:", btn.is_disabled(), "| label:", btn.inner_text(), "| notice rooms:", h.locator(".notice-rooms .nr").count())
    h.screenshot(path=O + "del-1-full.png")
    # guest sitting in the room that will be deleted
    g = b.new_context().new_page(); g.goto(f"{B}/r/{codes[4]}"); g.fill("#gnick", "Lan"); g.click("#gate-form button[type=submit]"); g.wait_for_selector(".vcard")
    # security of the API
    cid = h.evaluate("JSON.parse(localStorage.getItem('estimo.clientId'))")
    print("API wrong id:", api(f"/api/rooms/{codes[4]}/delete", {"id": "00000000-0000-4000-8000-000000000000"}))
    print("API text/plain:", api(f"/api/rooms/{codes[4]}/delete", {"id": cid}, {"Content-Type": "text/plain"})[0])
    print("API foreign origin:", api(f"/api/rooms/{codes[4]}/delete", {"id": cid}, {"Content-Type": "application/json", "Origin": "https://evil.example"})[0])
    print("API GET:", api(f"/api/rooms/{codes[4]}/delete", None, {}, "GET")[0], "| bad body:", api(f"/api/rooms/{codes[4]}/delete", {"id": 5})[0])
    print("API host rooms (stranger):", api("/api/host/rooms", {"id": "00000000-0000-4000-8000-000000000000"}))
    # delete from home via the bottom sheet
    h.locator(f".recent-row:has(a[href='/r/{codes[4]}']) .row-act").click(); h.wait_for_timeout(450)
    sheet = h.eval_on_selector(".room-sheet", "e => { const r = e.getBoundingClientRect(); return [Math.round(r.bottom), innerHeight, Math.round(r.width)]; }")
    print("sheet docked bottom:", sheet, "| title:", h.locator("#sheet-title").inner_text())
    h.screenshot(path=O + "del-2-sheet.png")
    h.click("[data-act=confirmDeleteRoom]"); h.wait_for_selector(".room-sheet", state="detached"); h.wait_for_timeout(400)
    print("toast:", h.locator("#toast").inner_text(), "| still listed:", h.locator(f"a[href='/r/{codes[4]}']").count(),
          "| notice:", h.locator(".notice").count(), "| create enabled:", not btn.is_disabled(), "| label:", btn.inner_text())
    g.wait_for_timeout(300); print("guest sees:", g.locator("h1").first.inner_text())
    h.screenshot(path=O + "del-3-after.png")
    # delete from inside a room via the drawer
    h.goto(f"{B}/r/{codes[3]}"); h.wait_for_selector(".vcard")
    h.click("button[data-act=toggleDrawer]"); h.wait_for_timeout(400); h.click("button[data-act=askDeleteCurrentRoom]"); h.wait_for_timeout(450)
    print("in-room sheet open:", h.locator(".room-sheet").count(), "| drawer closed:", h.locator(".room.drawer-open").count() == 0)
    h.click("[data-act=confirmDeleteRoom]"); h.wait_for_selector("#create-form"); h.wait_for_timeout(400)
    print("in-room delete → home:", h.url, "| listed:", h.locator(f"a[href='/r/{codes[3]}']").count(), "| toast:", h.locator("#toast").inner_text())
    print("server rooms now:", api("/api/host/rooms", {"id": cid}))
    # non-host row: remove locally
    h.goto(B); g.goto(f"{B}/r/{codes[2]}"); g.wait_for_selector(".vcard"); g.click(".logo"); g.wait_for_selector("#create-form")
    g.locator(f".recent-row:has(a[href='/r/{codes[2]}']) .row-act").click(); g.wait_for_timeout(400)
    print("guest sheet title:", g.locator("#sheet-title").inner_text(), "| btn:", g.locator("[data-act=confirmDeleteRoom]").inner_text())
    g.click("[data-act=confirmDeleteRoom]"); g.wait_for_timeout(300)
    print("guest list after remove:", g.locator(f"a[href='/r/{codes[2]}']").count(), "| room still exists for host:", api("/api/host/rooms", {"id": cid})[1]["rooms"].count(codes[2]))
    # Escape / backdrop closes
    h.locator(".recent-row .row-act").first.click(); h.wait_for_timeout(350); h.keyboard.press("Escape"); h.wait_for_timeout(400)
    print("escape closes sheet:", h.locator(".room-sheet").count() == 0)
    b.close()
print("errors:", errs or "none")
