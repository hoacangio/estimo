import os, re, sys, time
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("ESTIMO_URL", "http://localhost:8799")
OUT = os.path.join(os.path.dirname(__file__), "shots") + "/"
os.makedirs(OUT, exist_ok=True)
errors = []

def ctx(b, mobile=False, dark=False):
    c = b.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1440, "height": 960},
                      device_scale_factor=2 if mobile else 1, color_scheme="dark" if dark else "light", is_mobile=mobile, has_touch=mobile)
    p = c.new_page()
    p.on("pageerror", lambda e: errors.append(str(e)))
    p.on("console", lambda m: errors.append(m.text) if m.type == "error" and "TUNNEL" not in m.text else None)
    return p

def join(p, code, name, spectator=False):
    p.goto(f"{BASE}/r/{code}")
    p.fill("#gnick", name)
    if spectator: p.check("#gspec")
    p.click("#gate-form button[type=submit]")
    p.wait_for_selector(".table")

with sync_playwright() as pw:
    b = pw.chromium.launch()
    hoa = ctx(b)
    hoa.goto(BASE)
    hoa.wait_for_timeout(1200)
    hoa.screenshot(path=OUT + "1-home.png")
    hoa.fill("#nick", "Hòa")
    hoa.click("button[data-deck=scale10]")
    hoa.click("text=Create a new room")
    hoa.wait_for_url(re.compile(r"/r/[a-z]+-\d+$"))
    code = hoa.url.rsplit("/", 1)[1]
    hoa.wait_for_selector(".table")
    print("room:", code)

    lan = ctx(b, mobile=True)
    lan.goto(f"{BASE}/r/{code}"); lan.wait_for_timeout(800)
    lan.screenshot(path=OUT + "5-mobile-gate.png")
    lan.fill("#gnick", "Lan"); lan.click("#gate-form button[type=submit]"); lan.wait_for_selector(".table")
    others = {}
    for n in ["Minh", "Tuấn", "Vy", "Khoa"]:
        others[n] = ctx(b); join(others[n], code, n)
    phuong = ctx(b); join(phuong, code, "Phương", spectator=True)

    # deck applied from home
    expect(hoa.locator("#deck")).to_have_value("scale10")
    hoa.fill("#topic", "AUTH-1423 · Migrate login micro-frontend to Module Federation")
    hoa.wait_for_timeout(600)
    expect(lan.locator("#topic")).to_have_value(re.compile("AUTH-1423"))

    hoa.click("button[data-act=vote][data-v='5']")
    lan.click("button[data-act=vote][data-v='8']")
    others["Minh"].keyboard.press("3")          # keyboard shortcut
    others["Tuấn"].click("button[data-act=vote][data-v='5']")
    hoa.wait_for_timeout(500)

    # hidden votes: Minh must not see anyone's values before reveal
    html = others["Minh"].content()
    assert 'class="pcard up' not in html, "values leaked before reveal"
    expect(hoa.locator(".status")).to_contain_text("4 of 6")
    hoa.screenshot(path=OUT + "2-voting.png", full_page=True)
    lan.screenshot(path=OUT + "6-mobile-voting.png")

    # invite dialog with QR
    hoa.click("button[data-act=openInvite]"); hoa.wait_for_timeout(1200)
    qr_ok = hoa.locator("#qr svg").count() == 1
    print("QR rendered:", qr_ok)
    hoa.screenshot(path=OUT + "3-invite.png")
    hoa.locator(".qr").screenshot(path=OUT + "qr-only.png")
    import cv2
    txt, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.imread(OUT + "qr-only.png"))
    print("QR decodes to:", txt, "| expected:", f"{BASE}/r/{code}")
    assert txt == f"{BASE}/r/{code}"
    hoa.keyboard.press("Escape")

    others["Vy"].click("button[data-act=vote][data-v='5']")
    others["Khoa"].click("button[data-act=vote][data-v='6']")
    hoa.wait_for_timeout(300)
    hoa.click("text=Reveal cards"); hoa.wait_for_timeout(800)
    kpis = hoa.locator(".kpis").inner_text()
    print("KPIs:", kpis.replace("\n", " | "))
    assert "5.3" in kpis and "Median\n5" in kpis, kpis
    assert hoa.locator(".pcard.outlier").count() == 2, "expected 2 outliers"
    expect(hoa.locator(".final .opt[aria-pressed=true]")).to_have_text("5")
    hoa.screenshot(path=OUT + "4-revealed.png", full_page=True)
    lan.screenshot(path=OUT + "7-mobile-revealed.png", full_page=True)

    hoa.click("text=Save & next ticket"); hoa.wait_for_timeout(500)
    lan.click("button[data-act=toggleDrawer]"); lan.wait_for_timeout(400)
    hist = lan.locator(".hlist").inner_text()
    lan.screenshot(path=OUT + "8-mobile-drawer.png")
    lan.keyboard.press("Escape"); lan.wait_for_timeout(400)
    print("history:", hist.replace("\n", " | "))
    assert "AUTH-1423" in hist and "5" in hist

    # reconnect keeps vote
    lan.click("button[data-act=vote][data-v='3']"); lan.wait_for_timeout(300)
    lan.reload(); lan.wait_for_selector(".vcard[aria-pressed=true]", timeout=5000)
    print("vote kept after reload:", lan.locator(".vcard[aria-pressed=true]").inner_text())

    # dark mode
    dk = ctx(b, dark=True); join(dk, code, "Dark")
    dk.wait_for_timeout(800); dk.screenshot(path=OUT + "8-dark.png")
    b.close()

print("errors:", errors or "none")
