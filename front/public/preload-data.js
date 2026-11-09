// Starts downloading the data for the game in the URL while the app's own script is still
// downloading, instead of after it. The app's fetches of the same URLs then reuse these.
// The URL rules mirror useQueryParams and useGameData; anything else is left to the app.
(function () {
  var GAME_SLUG = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]{2,}-[a-z0-9]{2,}$/i;
  var DATE = /^\d{4}-\d{2}-\d{2}$/;

  function preload(href) {
    var link = document.createElement('link');
    link.setAttribute('rel', 'preload');
    link.setAttribute('as', 'fetch');
    // Matches a plain fetch(), so the browser can hand this response to the app.
    link.setAttribute('crossorigin', 'anonymous');
    link.setAttribute('href', href);
    document.head.appendChild(link);
  }

  try {
    var script = document.currentScript || document.querySelector('script[src$="preload-data.js"]');
    // Set by the build (vite.config.js); missing means the data's location isn't known here.
    var prefix = script && script.getAttribute('data-prefix');
    if (prefix === null || prefix === undefined) return;

    var segments = window.location.pathname.split('/').filter(Boolean);
    var params = new URLSearchParams(window.location.search);
    var slug = null;
    for (var i = 0; i < segments.length && !slug; i += 1) {
      var segment = decodeURIComponent(segments[i]);
      if (GAME_SLUG.test(segment)) slug = segment.toLowerCase();
    }
    if (!slug && GAME_SLUG.test(params.get('gameid') || '')) {
      slug = params.get('gameid').toLowerCase();
    }

    var date = slug ? slug.slice(0, 10) : null;
    if (!date && segments.length && DATE.test(segments[0])) date = segments[0];
    if (!date) return;

    preload(prefix + '/schedule/' + date + '.json.gz');
    if (slug) preload(prefix + '/data/gamepack/' + slug + '.json.gz');
  } catch (error) {
    // The app fetches everything itself anyway.
  }
})();
