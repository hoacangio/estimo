/* Runs before first paint (classic script in <head>): apply the saved theme so the page
   never flashes the default colours while the app module loads. Kept tiny on purpose. */
(function () {
  try {
    // "activeTheme" is what ThemeManager applied last time (including an automatic seasonal theme)
    var theme = JSON.parse(localStorage.getItem("estimo.activeTheme") || localStorage.getItem("estimo.theme") || '"system"');
    if (theme && theme !== "system") document.documentElement.setAttribute("data-theme", theme);
    if (/^[a-z0-9]+$/.test(theme) && !/^(system|light|dark)$/.test(theme)) {
      var link = document.createElement("link");
      link.rel = "stylesheet"; link.href = "/themes/" + theme + ".css";
      link.id = "theme-css-" + theme; link.dataset.key = "theme-css-" + theme;
      document.head.appendChild(link);
    }
  } catch (e) { /* storage blocked: default theme */ }
})();
