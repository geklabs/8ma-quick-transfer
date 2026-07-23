(function () {
  const preferenceKey = "8ma-promo-language";
  const currentLanguage = document.documentElement.lang.startsWith("zh") ? "zh" : "en";
  const storedLanguage = localStorage.getItem(preferenceKey);
  const primaryBrowserLanguage = (navigator.languages?.[0] || navigator.language || "").toLowerCase();
  const browserLanguage = primaryBrowserLanguage.startsWith("zh") ? "zh" : "en";
  const alternatePath = document.documentElement.dataset.alternatePath;

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
      target.searchParams.set("from", "promotion");
      link.href = target.toString();
    }
  });

  const year = document.querySelector("[data-current-year]");
  if (year) year.textContent = String(new Date().getFullYear());
})();
