(function () {
  const supportedLanguages = ["zh-CN", "en", "es", "ar", "hi", "fr", "ja", "ko"];
  const currentLanguage = document.documentElement.lang;
  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
  const browserLanguage = browserLanguages
    .map((item) => item.toLowerCase())
    .map((item) => supportedLanguages.find((language) => item.startsWith(language.toLowerCase().split("-")[0])))
    .find(Boolean) || "en";
  const pathAfterAbout = window.location.pathname.replace(/^\/about\/?/, "");
  const requestedLanguage = new URLSearchParams(window.location.search).get("lang");
  const explicitLanguage = supportedLanguages.includes(requestedLanguage) || supportedLanguages.some((language) => (
    language !== "zh-CN" && (pathAfterAbout === language || pathAfterAbout.startsWith(`${language}/`))
  ));
  const requestedSource = new URLSearchParams(window.location.search).get("from") || "";
  let referrerSource = "";
  try {
    referrerSource = new URL(document.referrer).hostname.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  } catch {
    referrerSource = "";
  }
  const campaignSource = /^[a-z0-9_-]{1,40}$/i.test(requestedSource)
    ? requestedSource.toLowerCase()
    : (/^[a-z0-9_-]{1,40}$/i.test(referrerSource) ? referrerSource : "promotion");

  if (!explicitLanguage && browserLanguage !== currentLanguage) {
    const alternate = document.querySelector(`link[rel="alternate"][hreflang="${browserLanguage}"]`);
    if (alternate?.href) {
      window.location.replace(alternate.href);
      return;
    }
  }

  document.querySelectorAll(".language-switcher").forEach((navigation) => {
    const links = [...navigation.querySelectorAll("[data-language-choice]")];
    if (!links.length) return;
    const select = document.createElement("select");
    select.setAttribute("aria-label", navigation.getAttribute("aria-label") || "Language");
    links.forEach((link) => {
      const option = document.createElement("option");
      option.value = link.href;
      option.textContent = link.textContent;
      option.selected = link.getAttribute("aria-current") === "page";
      option.dataset.language = link.getAttribute("data-language-choice");
      select.append(option);
    });
    select.addEventListener("change", () => {
      const target = new URL(select.value);
      if (select.selectedOptions[0]?.dataset.language === "zh-CN") target.searchParams.set("lang", "zh-CN");
      window.location.assign(target);
    });
    navigation.replaceChildren(select);
  });

  document.querySelectorAll('a[href^="https://t.8ma.co"]').forEach((link) => {
    const target = new URL(link.href);
    if (target.pathname === "/" && !target.searchParams.has("from")) {
      target.searchParams.set("from", campaignSource);
      link.href = target.toString();
    }
  });

  const eventBody = JSON.stringify({
    type: "promotion_view",
    path: window.location.pathname,
    referrer: document.referrer,
    source: campaignSource,
  });
  const queued = navigator.sendBeacon?.("/api/events", new Blob([eventBody], { type: "application/json" }));
  if (!queued) {
    void fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: eventBody,
      keepalive: true,
    }).catch(() => undefined);
  }

  const year = document.querySelector("[data-current-year]");
  if (year) year.textContent = String(new Date().getFullYear());
})();
