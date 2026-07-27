#!/usr/bin/env python3
"""Playwright-driven smoke test for the static viewer.

Starts a local http.server, drives headless Chromium against it, and checks
that the landing page and all three topics still work. Not part of the site
itself and not wired into any CI — run it manually before opening a PR:

    python3 tools/smoke_test.py
"""
import functools
import http.server
import re
import sys
import threading
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
CHROMIUM_PATH = "/opt/pw-browsers/chromium"
TOPICS = ["phil", "hist-events", "hist-chars"]


class Failure(Exception):
    """Names the topic and the assertion that failed."""


def start_server():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{port}"
    deadline = time.time() + 5
    while time.time() < deadline:
        try:
            urllib.request.urlopen(base_url, timeout=0.5)
            break
        except Exception:
            time.sleep(0.1)
    else:
        httpd.shutdown()
        thread.join(timeout=5)
        raise RuntimeError("http.server did not come up in time")
    return httpd, thread, base_url


def watch_console(page, bucket):
    page.on("console", lambda m: bucket.append(f"console.error: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: bucket.append(f"pageerror: {e}"))


def block_external_fonts(page):
    # The only external resource is the Google Fonts stylesheet (AGENT_BRIEF.md). Fulfill it
    # with an empty response (not abort(), which logs its own console.error) so the test runs
    # fast and deterministically on networks that stall or block the real request.
    page.route(
        re.compile(r"^https://fonts\.(googleapis|gstatic)\.com/"),
        lambda route: route.fulfill(status=200, content_type="text/css", body=""),
    )


def kicker_count(page):
    text = page.locator(".kicker").inner_text()
    m = re.search(r"\d+", text)
    return int(m.group()) if m else 0


def wait_until(page, js_expr, arg=None, timeout=3000):
    try:
        page.wait_for_function(js_expr, arg=arg, timeout=timeout)
        return True
    except PlaywrightTimeoutError:
        return False


def new_page(browser, errors):
    page = browser.new_page()
    watch_console(page, errors)
    block_external_fonts(page)
    return page


def load_viewer(page, base_url, topic):
    page.goto(f"{base_url}/viewer.html?d={topic}", wait_until="domcontentloaded")
    if not wait_until(page, "() => document.querySelectorAll('#results .row').length > 0", timeout=10000):
        raise Failure(f"{topic}: no result cards appeared after load")


def check_topic(browser, base_url, topic):
    errors = []
    page = new_page(browser, errors)
    load_viewer(page, base_url, topic)

    n = kicker_count(page)
    if n <= 0:
        raise Failure(f"{topic}: entry-count kicker did not show a non-zero number (got {n!r})")

    card_count = page.locator("#results .row").count()
    if card_count < 1:
        raise Failure(f"{topic}: no result cards rendered")

    first_name = page.locator("#results .row .nm a").first.inner_text().strip()
    query = first_name[:5] if len(first_name) >= 5 else first_name
    page.fill("#q", query)
    if not wait_until(
        page,
        "(n) => document.querySelectorAll('#results .row').length !== n",
        arg=card_count,
    ):
        raise Failure(f"{topic}: typing {query!r} into #q did not change the card count")
    filtered_count = page.locator("#results .row").count()
    if filtered_count >= card_count:
        raise Failure(
            f"{topic}: typing {query!r} into #q did not reduce card count "
            f"({card_count} -> {filtered_count})"
        )
    page.close()

    if topic == "phil":
        check_phil_extras(browser, base_url, errors)

    if errors:
        raise Failure(f"{topic}: {'; '.join(errors)}")


def check_phil_extras(browser, base_url, errors):
    # A fresh page per navigation: the app has no hashchange listener, so going from
    # "?d=phil" to "?d=phil#view=timeline" on the same page is a same-document navigation
    # that never re-runs initApp() and would make this check spuriously pass or fail.
    timeline_page = new_page(browser, errors)
    timeline_page.goto(f"{base_url}/viewer.html?d=phil#view=timeline", wait_until="domcontentloaded")
    if not wait_until(
        timeline_page, "() => document.querySelectorAll('.timeline-item').length > 0", timeout=10000
    ):
        raise Failure("phil: timeline view rendered no items")
    timeline_page.close()

    page = new_page(browser, errors)
    load_viewer(page, base_url, "phil")

    before_q = page.locator("#q").input_value()
    page.click("#randBtn")
    if not wait_until(
        page,
        "(v) => document.querySelector('#q').value !== v",
        arg=before_q,
    ):
        raise Failure("phil: random button did not change the visible result")

    theme_before = page.evaluate("document.documentElement.getAttribute('data-theme')")
    page.click("#themeBtn")
    if not wait_until(
        page,
        "(v) => document.documentElement.getAttribute('data-theme') !== v",
        arg=theme_before,
    ):
        raise Failure("phil: toggling dark mode had no effect")
    theme_after = page.evaluate("document.documentElement.getAttribute('data-theme')")
    if theme_after != "dark":
        raise Failure(f"phil: toggling dark mode did not set data-theme=\"dark\" (got {theme_after!r})")
    page.close()


def check_index(browser, base_url):
    errors = []
    page = new_page(browser, errors)
    page.goto(f"{base_url}/index.html", wait_until="domcontentloaded")

    card_count = page.locator("a.topic").count()
    if card_count != len(TOPICS):
        raise Failure(f"index: expected {len(TOPICS)} topic cards, found {card_count}")

    if errors:
        raise Failure(f"index: {'; '.join(errors)}")
    page.close()


def main():
    httpd, thread, base_url = start_server()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=CHROMIUM_PATH, headless=True)
            try:
                for topic in TOPICS:
                    check_topic(browser, base_url, topic)
                check_index(browser, base_url)
            finally:
                browser.close()
    except Failure as e:
        print(f"SMOKE FAIL: {e}", file=sys.stderr)
        return 1
    finally:
        httpd.shutdown()
        thread.join(timeout=5)
    print("SMOKE OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
