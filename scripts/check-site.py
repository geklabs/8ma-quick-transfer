#!/usr/bin/env python3
"""Public, dependency-free health check for the 8ma promotion site."""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from argparse import ArgumentParser
from datetime import UTC, datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

DEFAULT_BASE_URL = os.environ.get("SITE_URL", "https://t.8ma.co/about/")
USER_AGENT = "8ma-promotion-site-check/1.0"
SENSITIVE_TERMS = ("stun", "webrtc", "turn server", "signaling server", "network candidate")
SUPPORTED_LANGUAGES = {
    "en": "en",
    "es": "es",
    "ar": "ar",
    "hi": "hi",
    "fr": "fr",
    "ja": "ja",
    "ko": "ko",
}
REQUIRED_HREFLANGS = {"zh-CN", *SUPPORTED_LANGUAGES}
EXPECTED_PAGES_PER_LANGUAGE = 13


class PageFacts(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.canonical = ""
        self.title = ""
        self.description = ""
        self.keywords = ""
        self.robots = ""
        self.language = ""
        self.open_graph: set[str] = set()
        self.twitter: set[str] = set()
        self.json_ld = 0
        self.h1 = 0
        self.alternates: set[str] = set()
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "html":
            self.language = values.get("lang") or ""
        elif tag == "title":
            self._in_title = True
        elif tag == "h1":
            self.h1 += 1
        elif tag == "link" and values.get("rel") == "canonical":
            self.canonical = values.get("href") or ""
        elif tag == "link" and values.get("rel") == "alternate" and values.get("hreflang"):
            self.alternates.add(values["hreflang"])
        elif tag == "meta" and values.get("name") == "description":
            self.description = values.get("content") or ""
        elif tag == "meta" and values.get("name") == "keywords":
            self.keywords = values.get("content") or ""
        elif tag == "meta" and values.get("name") == "robots":
            self.robots = values.get("content") or ""
        elif tag == "meta" and values.get("property", "").startswith("og:"):
            self.open_graph.add(values["property"])
        elif tag == "meta" and values.get("name", "").startswith("twitter:"):
            self.twitter.add(values["name"])
        elif tag == "script" and values.get("type") == "application/ld+json":
            self.json_ld += 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data.strip()


def fetch(url: str, attempts: int = 3) -> tuple[int, bytes]:
    for attempt in range(attempts):
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return response.status, response.read()
        except (urllib.error.URLError, TimeoutError):
            if attempt + 1 == attempts:
                raise
            time.sleep(1 << attempt)
    raise RuntimeError("unreachable")

def json_ld_languages(text: str, url: str, errors: list[str]) -> list[str]:
    languages: list[str] = []

    def walk(value: object) -> None:
        if isinstance(value, dict):
            language = value.get("inLanguage")
            if isinstance(language, str):
                languages.append(language)
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    for body in re.findall(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>', text, re.IGNORECASE):
        try:
            walk(json.loads(body))
        except json.JSONDecodeError as error:
            errors.append(f"{url}: invalid JSON-LD ({error})")
    return languages


def main() -> int:
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--report", help="Write a machine-readable indexing readiness report")
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/") + "/"
    sitemap_url = urljoin(base_url, "sitemap.xml")
    local_mode = urlparse(base_url).hostname != "t.8ma.co"

    errors: list[str] = []
    report: dict[str, object] = {
        "generatedAt": datetime.now(UTC).isoformat(),
        "baseUrl": base_url,
        "sitemapUrl": sitemap_url,
        "pages": [],
        "signals": {},
    }

    def finish(code: int) -> int:
        report["ok"] = code == 0
        report["errors"] = errors
        if args.report:
            Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return code

    try:
        status, sitemap_body = fetch(sitemap_url)
        if status != 200:
            errors.append(f"{sitemap_url}: HTTP {status}")
    except (urllib.error.URLError, TimeoutError) as error:
        errors.append(f"Unable to load sitemap: {error}")
        print(errors[-1], file=sys.stderr)
        return finish(1)

    try:
        root = ET.fromstring(sitemap_body)
        namespace = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        urls = [node.text.strip() for node in root.findall("s:url/s:loc", namespace) if node.text]
    except ET.ParseError as error:
        errors.append(f"Invalid sitemap XML: {error}")
        print(errors[-1], file=sys.stderr)
        return finish(1)

    report["sitemapPageCount"] = len(urls)
    expected_page_count = EXPECTED_PAGES_PER_LANGUAGE * (len(SUPPORTED_LANGUAGES) + 1)
    if len(urls) != expected_page_count:
        errors.append(f"Sitemap has {len(urls)} URLs; expected {expected_page_count}")
    if len(urls) != len(set(urls)):
        errors.append("Sitemap contains duplicate URLs")

    signals = report["signals"]
    assert isinstance(signals, dict)
    for asset, required_text in (("robots.txt", "Sitemap:"), ("llms.txt", "8")):
        asset_url = urljoin(base_url, asset)
        try:
            status, body = fetch(asset_url)
            text = body.decode("utf-8", errors="replace")
            signals[asset] = {"status": status, "requiredTextPresent": required_text in text}
            if status != 200 or required_text not in text:
                errors.append(f"{asset_url}: indexing signal is incomplete")
        except (urllib.error.URLError, TimeoutError) as error:
            signals[asset] = {"status": 0, "error": str(error)}
            errors.append(f"{asset_url}: {error}")

    pages = report["pages"]
    assert isinstance(pages, list)
    language_page_counts = {language: 0 for language in REQUIRED_HREFLANGS}
    for url in urls:
        page_report: dict[str, object] = {"url": url}
        pages.append(page_report)
        if urlparse(url).netloc != "t.8ma.co":
            errors.append(f"{url}: unexpected host")
            page_report["status"] = 0
            page_report["indexable"] = False
            continue
        try:
            page_path = urlparse(url).path.removeprefix("/about/")
            status, body = fetch(urljoin(base_url, page_path) if local_mode else url)
        except (urllib.error.URLError, TimeoutError) as error:
            errors.append(f"{url}: {error}")
            page_report["status"] = 0
            page_report["indexable"] = False
            page_report["error"] = str(error)
            continue
        page_report["status"] = status
        if status != 200:
            errors.append(f"{url}: HTTP {status}")
            page_report["indexable"] = False
            continue
        text = body.decode("utf-8", errors="replace")
        facts = PageFacts()
        facts.feed(text)
        page_report.update({
            "title": facts.title,
            "description": facts.description,
            "keywords": facts.keywords,
            "canonical": facts.canonical,
            "language": facts.language,
            "hreflang": sorted(facts.alternates),
            "robots": facts.robots,
            "indexable": "noindex" not in facts.robots.lower(),
        })
        if facts.canonical != url:
            errors.append(f"{url}: canonical is {facts.canonical or 'missing'}")
        if not facts.title or not facts.description:
            errors.append(f"{url}: missing title or description")
        relative_url_path = urlparse(url).path.removeprefix("/about/").lstrip("/")
        language_prefix = relative_url_path.split("/", 1)[0]
        expected_language = SUPPORTED_LANGUAGES.get(language_prefix, "zh-CN")
        language_page_counts[expected_language] += 1
        if facts.language != expected_language:
            errors.append(f"{url}: html lang is {facts.language or 'missing'}, expected {expected_language}")
        if facts.h1 != 1:
            errors.append(f"{url}: expected one h1, found {facts.h1}")
        if "noindex" in facts.robots.lower():
            errors.append(f"{url}: page is marked noindex")
        if not REQUIRED_HREFLANGS.issubset(facts.alternates):
            missing = ", ".join(sorted(REQUIRED_HREFLANGS - facts.alternates))
            errors.append(f"{url}: missing language alternates: {missing}")
        if "/privacy" not in url and "/terms" not in url:
            if not facts.keywords:
                errors.append(f"{url}: missing localized long-tail keywords")
            if not {"og:title", "og:description", "og:url", "og:image"}.issubset(facts.open_graph):
                errors.append(f"{url}: incomplete Open Graph metadata")
            if not {"twitter:card", "twitter:title", "twitter:description", "twitter:image"}.issubset(facts.twitter):
                errors.append(f"{url}: incomplete Twitter Card metadata")
            if facts.json_ld < 1:
                errors.append(f"{url}: missing structured data")
            structured_languages = json_ld_languages(text, url, errors)
            if not structured_languages:
                errors.append(f"{url}: structured data is missing inLanguage")
            elif any(language != expected_language for language in structured_languages):
                errors.append(f"{url}: JSON-LD inLanguage is {structured_languages}, expected {expected_language}")
        lowered = text.lower()
        for term in SENSITIVE_TERMS:
            if term in lowered:
                errors.append(f"{url}: public page contains restricted technical term '{term}'")

    for language, count in language_page_counts.items():
        if count != EXPECTED_PAGES_PER_LANGUAGE:
            errors.append(f"Sitemap has {count} {language} pages; expected {EXPECTED_PAGES_PER_LANGUAGE}")

    for asset in ("assets/logo.svg", "assets/social-card.png", "assets/promo/social-horizontal-zh.png"):
        url = urljoin(base_url, asset)
        try:
            status, _ = fetch(url)
            if status != 200:
                errors.append(f"{url}: HTTP {status}")
        except (urllib.error.URLError, TimeoutError) as error:
            errors.append(f"{url}: {error}")

    if errors:
        print("\n".join(f"ERROR {error}" for error in errors), file=sys.stderr)
        return finish(1)
    print(f"OK {len(urls)} pages and 3 key assets")
    return finish(0)


if __name__ == "__main__":
    raise SystemExit(main())
