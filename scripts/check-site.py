#!/usr/bin/env python3
"""Public, dependency-free health check for the 8ma promotion site."""

from __future__ import annotations

import os
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

BASE_URL = os.environ.get("SITE_URL", "https://t.8ma.co/about/").rstrip("/") + "/"
SITEMAP_URL = urljoin(BASE_URL, "sitemap.xml")
LOCAL_MODE = urlparse(BASE_URL).hostname != "t.8ma.co"
USER_AGENT = "8ma-promotion-site-check/1.0"
SENSITIVE_TERMS = ("stun", "webrtc", "turn server", "signaling server", "network candidate")


class PageFacts(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.canonical = ""
        self.title = ""
        self.description = ""
        self.h1 = 0
        self.alternates: set[str] = set()
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "title":
            self._in_title = True
        elif tag == "h1":
            self.h1 += 1
        elif tag == "link" and values.get("rel") == "canonical":
            self.canonical = values.get("href") or ""
        elif tag == "link" and values.get("rel") == "alternate" and values.get("hreflang"):
            self.alternates.add(values["hreflang"])
        elif tag == "meta" and values.get("name") == "description":
            self.description = values.get("content") or ""

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data.strip()


def fetch(url: str) -> tuple[int, bytes]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.status, response.read()


def main() -> int:
    errors: list[str] = []
    try:
        status, sitemap_body = fetch(SITEMAP_URL)
        if status != 200:
            errors.append(f"{SITEMAP_URL}: HTTP {status}")
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"Unable to load sitemap: {error}", file=sys.stderr)
        return 1

    try:
        root = ET.fromstring(sitemap_body)
        namespace = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        urls = [node.text.strip() for node in root.findall("s:url/s:loc", namespace) if node.text]
    except ET.ParseError as error:
        print(f"Invalid sitemap XML: {error}", file=sys.stderr)
        return 1

    if len(urls) < 20:
        errors.append(f"Sitemap has {len(urls)} URLs; expected at least 20")
    if len(urls) != len(set(urls)):
        errors.append("Sitemap contains duplicate URLs")

    for url in urls:
        if urlparse(url).netloc != "t.8ma.co":
            errors.append(f"{url}: unexpected host")
            continue
        try:
            page_path = urlparse(url).path.removeprefix("/about/")
            status, body = fetch(urljoin(BASE_URL, page_path) if LOCAL_MODE else url)
        except (urllib.error.URLError, TimeoutError) as error:
            errors.append(f"{url}: {error}")
            continue
        if status != 200:
            errors.append(f"{url}: HTTP {status}")
            continue
        text = body.decode("utf-8", errors="replace")
        facts = PageFacts()
        facts.feed(text)
        if facts.canonical != url:
            errors.append(f"{url}: canonical is {facts.canonical or 'missing'}")
        if not facts.title or not facts.description:
            errors.append(f"{url}: missing title or description")
        if facts.h1 != 1:
            errors.append(f"{url}: expected one h1, found {facts.h1}")
        if "/privacy" not in url and "/terms" not in url and not {"zh-CN", "en"}.issubset(facts.alternates):
            errors.append(f"{url}: missing zh-CN/en alternates")
        lowered = text.lower()
        for term in SENSITIVE_TERMS:
            if term in lowered:
                errors.append(f"{url}: public page contains restricted technical term '{term}'")

    for asset in ("assets/logo.svg", "assets/social-card.png", "assets/promo/social-horizontal-zh.png"):
        url = urljoin(BASE_URL, asset)
        try:
            status, _ = fetch(url)
            if status != 200:
                errors.append(f"{url}: HTTP {status}")
        except (urllib.error.URLError, TimeoutError) as error:
            errors.append(f"{url}: {error}")

    if errors:
        print("\n".join(f"ERROR {error}" for error in errors), file=sys.stderr)
        return 1
    print(f"OK {len(urls)} pages and 3 key assets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
