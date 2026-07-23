(function () {
  const preferenceKey = "8ma-promo-language";
  const currentLanguage = document.documentElement.lang.startsWith("zh") ? "zh" : "en";
  const storedLanguage = localStorage.getItem(preferenceKey);
  const primaryBrowserLanguage = (navigator.languages?.[0] || navigator.language || "").toLowerCase();
  const browserLanguage = primaryBrowserLanguage.startsWith("zh") ? "zh" : "en";
  const alternatePath = document.documentElement.dataset.alternatePath;
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

  if (alternatePath && currentLanguage === "zh" && (storedLanguage === "en" || (!storedLanguage && browserLanguage === "en"))) {
    window.location.replace(new URL(alternatePath, window.location.href));
    return;
  }

  if (alternatePath && currentLanguage === "en" && (storedLanguage === "zh" || (!storedLanguage && browserLanguage === "zh"))) {
    window.location.replace(new URL(alternatePath, window.location.href));
    return;
  }

  document.querySelectorAll("[data-language-choice]").forEach((link) => {
    link.addEventListener("click", () => {
      localStorage.setItem(preferenceKey, link.dataset.languageChoice);
    });
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
