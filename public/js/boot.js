/* Runs before first paint (classic script in <head>): apply the saved theme so the page
   never flashes the default colours while the app module loads. Kept tiny on purpose. */
(function () {
  try {
    var theme = JSON.parse(localStorage.getItem("estimo.theme") || '"system"');
    if (theme && theme !== "system") document.documentElement.setAttribute("data-theme", theme);
    if (/^(retro2007|cinema|samurai|mission)$/.test(theme)) {
      var link = document.createElement("link");
      link.rel = "stylesheet"; link.href = "/themes/" + theme + ".css";
      link.id = "theme-css-" + theme; link.dataset.key = "theme-css-" + theme;
      document.head.appendChild(link);
    }
  } catch (e) { /* storage blocked: default theme */ }
})();
