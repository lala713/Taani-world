(function () {
  const pageShell = document.getElementById("pageShell");
  const worldClock = document.getElementById("worldClock");
  const worldTimeZone = document.getElementById("worldTimeZone");
  const soundToggle = document.getElementById("soundToggle");
  const audio = document.getElementById("songAudio");
  const BIRTHDAY_MONTH_INDEX = 6;
  const BIRTHDAY_DAY = 22;
  const TAANI_TURNING_AGE = 17;
  const COUNTDOWN_UNITS = ["days", "hours", "minutes", "seconds"];

  function fillNumberedPattern(template, number) {
    const padded = String(number).padStart(2, "0");
    return String(template || "")
      .replace(/\{nn\}/g, padded)
      .replace(/\{n\}/g, String(number));
  }

  function expandNumberedImages(items) {
    return (items || []).flatMap((item) => {
      if (!item || !item.imagePattern) return [item];
      const start = Number.isFinite(Number(item.start)) ? Number(item.start) : 1;
      const count = Number.isFinite(Number(item.count)) ? Number(item.count) : 1;
      return Array.from({ length: Math.max(0, count) }, (_, offset) => {
        const number = start + offset;
        const expanded = {
          ...item,
          title: fillNumberedPattern(item.titlePattern || item.title || "Photo {nn}", number),
          image: fillNumberedPattern(item.imagePattern, number),
          optionalImage: item.optionalImage !== false
        };
        delete expanded.imagePattern;
        delete expanded.titlePattern;
        delete expanded.start;
        delete expanded.count;
        return expanded;
      });
    }).filter(Boolean);
  }

  function expandMemoryFolders(folders) {
    return (folders || []).map((folder) => ({
      ...folder,
      memories: expandNumberedImages(folder.memories || [])
    }));
  }

  function expandFriendProfiles(friends) {
    return (friends || []).map((friend) => ({
      ...friend,
      photos: expandNumberedImages(friend.photos || [])
    }));
  }

  const data = {
    letters: window.TAANI_LETTERS || [],
    playlist: window.TAANI_PLAYLIST || { fullPlaylistLink: "", songs: [] },
    friends: expandFriendProfiles(window.TAANI_FRIENDS || []),
    memories: expandMemoryFolders(window.TAANI_MEMORIES || []),
    reasons: window.TAANI_REASONS || []
  };

  function readSessionValue(key) {
    try {
      return sessionStorage.getItem(key) || "";
    } catch (error) {
      return "";
    }
  }

  function writeSessionValue(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (error) {
      // Session storage may be unavailable in private browsing contexts.
    }
  }

  function firstExistingId(items, requestedId) {
    const requested = (items || []).find((item) => item.id === requestedId);
    return requested ? requested.id : ((items && items[0] && items[0].id) || "");
  }

  const state = {
    route: "map",
    letterId: data.letters[0] ? data.letters[0].id : "",
    friendId: firstExistingId(data.friends, readSessionValue("taani-active-friend")),
    gardenPerson: "",
    songIndex: 0,
    muted: false,
    secretUnlocked: localStorage.getItem("taani-secret-unlocked") === "true",
    lightbox: null,
    missingImages: new Set(),
    scrollPositions: {}
  };

  let playlistStatus = "Choose a song to start the tiny music player.";
  let appIntervalId = null;
  let lastClockText = "";
  let lastTimeZoneText = "";

  const locations = [
    { route: "friends", label: "Friends", shortLabel: "Friends", detail: "Profiles, timers, jokes, and notes", icon: "village", x: 18, y: 68 },
    { route: "letters", label: "Letters", shortLabel: "Letters", detail: "Illustrated letters and text", icon: "cottage", x: 18, y: 24 },
    { route: "reasons", label: "Love Garden", shortLabel: "Love Garden", detail: "Flowers from each friend", icon: "garden", x: 41, y: 58 },
    { route: "museum", label: "Memory Museum", shortLabel: "Memory Museum", detail: "Real photos and screenshots", icon: "museum", x: 68, y: 56 },
    { route: "playlist", label: "Playlist", shortLabel: "Playlist", detail: "Songs and notes", icon: "pond", x: 58, y: 26 },
    { route: "gift", label: "Final Gift", shortLabel: "Final Gift", detail: "The final birthday message", icon: "gate", x: 86, y: 38 }
  ];

  const primaryNav = [
    { route: "map", label: "Home" },
    { route: "friends", label: "Friends" },
    { route: "letters", label: "Letters" },
    { route: "reasons", label: "Love Garden" },
    { route: "museum", label: "Memory Museum" },
    { route: "playlist", label: "Playlist" },
    { route: "gift", label: "Final Gift" }
  ];

  const routes = {
    map: renderMap,
    welcome: renderMap,
    letters: renderLetters,
    reasons: renderReasons,
    playlist: renderPlaylist,
    museum: renderMemoryMuseum,
    friends: renderFriends,
    gift: renderFinalGift
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function paragraph(value) {
    return escapeHtml(value);
  }

  function isOptionalImage(item) {
    return Boolean(item && (item.optionalImage || item.imageOptional));
  }

  function optionalImageCardAttr(item) {
    return isOptionalImage(item) ? " data-optional-image-card" : "";
  }

  function optionalImageAttr(item) {
    const source = item && (item.image || item.src);
    return isOptionalImage(item) && source ? ` data-optional-image="${escapeHtml(source)}"` : "";
  }

  function availableLightboxImages(images) {
    return images.filter((image) => image.src && !state.missingImages.has(image.src));
  }

  function getRouteFromHash() {
    const rawRoute = window.location.hash.replace("#", "").trim();
    const route = normalizeRoute(rawRoute);
    if (routes[route]) return route;
    if (rawRoute) window.history.replaceState(null, "", "#map");
    return "map";
  }

  function normalizeRoute(route) {
    return route === "home" || route === "welcome" ? "map" : route;
  }

  function go(route) {
    const destination = normalizeRoute(route);
    saveScrollPosition();
    if (window.location.hash === `#${destination}`) {
      render();
      return;
    }
    window.location.hash = destination;
  }

  function render() {
    closeLightbox();
    closeLetterTextModal();
    const nextRoute = getRouteFromHash();
    const routeChanged = nextRoute !== state.route;
    if (routeChanged) saveScrollPosition();
    state.route = nextRoute;
    document.title = state.route === "map" ? "Taani's World" : `Taani's World - ${routeLabel(state.route)}`;
    pageShell.innerHTML = `<div class="chapter-page">${routes[state.route]()}${renderLocationFooter(state.route)}</div>`;
    const now = new Date();
    updateClock(now);
    updateBirthdayUi(now);
    updateSoundButton();
    updateFriendTimer(now);
    updatePlayerUi();
    if (routeChanged) {
      const top = state.scrollPositions[state.route] || 0;
      window.requestAnimationFrame(() => window.scrollTo({ top, behavior: "auto" }));
    }
  }

  function routeLabel(route) {
    const location = locations.find((item) => item.route === normalizeRoute(route));
    return location ? location.label : "Taani's World Map";
  }

  function saveScrollPosition() {
    if (!state.route || !routes[state.route]) return;
    state.scrollPositions[state.route] = window.scrollY || 0;
  }

  function renderLocationNav(route, placement) {
    return `
      <nav class="primary-nav primary-nav-${escapeHtml(placement)}" aria-label="Primary navigation">
        ${primaryNav.map((item) => `
          <button class="nav-pill ${normalizeRoute(route) === item.route ? "active" : ""}" type="button" data-route="${escapeHtml(item.route)}">
            ${escapeHtml(item.label)}
          </button>
        `).join("")}
      </nav>
    `;
  }

  function renderLocationFooter(route) {
    if (route === "map") return "";
    return "";
  }

  function renderPageHeader(route, subtitle) {
    return `
      <div class="page-header">
        <div>
          <h2 class="page-heading">${escapeHtml(routeLabel(route))}</h2>
          <p class="page-subtitle">${escapeHtml(subtitle)}</p>
        </div>
        ${renderLocationNav(route, "top")}
      </div>
    `;
  }

  function renderBirthdayPanel() {
    return `
      <section class="birthday-countdown-card" data-birthday-widget aria-label="Birthday countdown to 22 July">
        <div class="birthday-status" aria-live="polite">
          <span class="birthday-date">Birthday: 22 July</span>
          <strong data-birthday-status>Birthday countdown</strong>
          <span data-birthday-detail>Turning ${TAANI_TURNING_AGE}</span>
        </div>
        <span class="birthday-age-badge">Turning ${TAANI_TURNING_AGE}</span>
        <div class="birthday-countdown-grid" aria-hidden="true">
          ${COUNTDOWN_UNITS.map((unit) => `
            <div class="birthday-countdown-unit">
              <strong data-birthday-unit="${unit}">0</strong>
              <span>${unit}</span>
            </div>
          `).join("")}
        </div>
        <div class="birthday-celebration-art" aria-hidden="true">
          <span class="birthday-cake-mini"></span>
          <span class="birthday-sparkle birthday-sparkle-one"></span>
          <span class="birthday-sparkle birthday-sparkle-two"></span>
          <span class="birthday-sparkle birthday-sparkle-three"></span>
        </div>
      </section>
    `;
  }

  function renderMap() {
    return `
      <section class="storybook-map birthday-village" aria-label="Tiny magical birthday village">
        <div class="map-copy">
          <span class="welcome-kicker">Welcome to</span>
          <h2>Taani's World</h2>
          <p>Choose a path through friends, letters, the love garden, memory museum, playlist, and final gift.</p>
          ${renderBirthdayPanel()}
          ${renderLocationNav("map", "home")}
        </div>
        <div class="map-board">
          <svg class="map-path village-path" viewBox="0 0 1000 620" aria-hidden="true" preserveAspectRatio="none">
            <path class="map-path-shadow" d="M130 150 C230 85 310 235 380 350 S550 520 665 380 S770 145 875 270 S800 515 610 500 S360 535 260 450 S180 260 130 150"></path>
            <path class="map-path-line" d="M130 150 C230 85 310 235 380 350 S550 520 665 380 S770 145 875 270 S800 515 610 500 S360 535 260 450 S180 260 130 150"></path>
          </svg>
          <div class="tiny-river" aria-hidden="true"><span class="fish fish-one"></span><span class="fish fish-two"></span></div>
          <div class="tiny-bridge" aria-hidden="true"></div>
          <div class="village-windmill" aria-hidden="true"><span></span></div>
          <button class="map-cloud map-cloud-one" type="button" data-cloud-message aria-label="Ask a cloud"></button>
          <button class="map-cloud map-cloud-two" type="button" data-cloud-message aria-label="Ask a cloud"></button>
          <span class="map-cloud map-cloud-three" aria-hidden="true"></span>
          <span class="tree tree-one" aria-hidden="true"></span>
          <span class="tree tree-two" aria-hidden="true"></span>
          <span class="tree tree-three" aria-hidden="true"></span>
          <span class="bush bush-one" aria-hidden="true"></span>
          <span class="bush bush-two" aria-hidden="true"></span>
          <span class="wood-fence fence-one" aria-hidden="true"></span>
          <span class="wood-fence fence-two" aria-hidden="true"></span>
          <span class="lamp-post lamp-one" aria-hidden="true"></span>
          <span class="lamp-post lamp-two" aria-hidden="true"></span>
          <button class="village-bird bird-one" type="button" data-bird aria-label="Listen to bird"></button>
          <button class="village-bird bird-two" type="button" data-bird aria-label="Listen to bird"></button>
          <span class="map-sparkle map-sparkle-one"></span>
          <span class="map-sparkle map-sparkle-two"></span>
          <span class="map-sparkle map-sparkle-three"></span>
          <span class="map-petal map-petal-one"></span>
          <span class="map-petal map-petal-two"></span>
          <span class="map-butterfly map-butterfly-one"></span>
          <span class="map-butterfly map-butterfly-two"></span>
          <span class="map-bee map-bee-one"></span>
          <span class="heart-bee heart-bee-one" aria-hidden="true"></span>
          <span class="village-ladybug ladybug-one" aria-hidden="true"></span>
          <span class="village-ladybug ladybug-two" aria-hidden="true"></span>
          <button class="hidden-teddy" type="button" data-hidden-teddy aria-label="Hidden teddy bear"></button>
          <span class="village-flower flower-a" aria-hidden="true"></span>
          <span class="village-flower flower-b" aria-hidden="true"></span>
          <button class="village-flower flower-c flower-envelope" type="button" data-open-mailbox aria-label="Open tiny envelope"></button>
          <button class="water-flower flower-d" type="button" data-water-flower aria-label="Water flower"></button>
          <span class="map-cat" aria-hidden="true"><span></span></span>
          <span class="map-bunny" aria-hidden="true"></span>
          <button class="coco coco-walking" type="button" data-coco aria-label="Coco the French Bulldog">
            <span class="coco-face"></span>
            <span class="coco-tail"></span>
          </button>
          ${locations.map(renderMapLocation).join("")}
        </div>
        <div class="map-footer-note">
          ${renderNowPlaying()}
        </div>
      </section>
    `;
  }

  function renderMapLocation(location, index) {
    return `
      <button class="map-location map-location-${escapeHtml(location.icon)}" type="button" data-route="${escapeHtml(location.route)}" style="--map-x: ${location.x}%; --map-y: ${location.y}%;">
        <span class="map-icon map-icon-${escapeHtml(location.icon)}" aria-hidden="true"></span>
        <span class="map-sign">
          <strong>${index + 1}. ${escapeHtml(location.label)}</strong>
          <span>${escapeHtml(location.detail)}</span>
        </span>
      </button>
    `;
  }

  function renderWelcome() {
    return `
      <div class="home-grid">
        <section class="garden-panel" aria-label="Animated birthday garden">
          <div class="garden-header">
            <span>Birthday Garden</span>
            <span>LV. 12</span>
          </div>
          <div class="garden-frame">
            ${renderGarden()}
          </div>
        </section>

        <section class="main-menu-panel welcome-panel" aria-label="Welcome chapter">
          <div class="panel-title">
            <span>Chapter 01</span>
            <span>press start</span>
          </div>
          <div class="welcome-card">
            <span class="welcome-kicker">Welcome to</span>
            <h2>Welcome to Taani's World</h2>
            <p>A tiny birthday storybook made from memories, letters, songs, screenshots, and love.</p>
            <p>Press start to open the first envelope and move through the pages like a cozy little game.</p>
            <button class="pixel-button start-button" type="button" data-route="letters">Start</button>
          </div>
        </section>

        <aside class="right-sidebar" aria-label="Site notes">
          <section class="sidebar-panel">
            <div class="panel-title">
              <span>ABOUT THIS SITE</span>
              <span>♡</span>
            </div>
            <p>A tiny handmade birthday game world from ${data.friends.length} online friends, filled with letters, memories, music, flowers, sleepy cats, and soft internet magic.</p>
          </section>
          <section class="sidebar-panel">
            <div class="panel-title">
              <span>HOW TO USE</span>
              <span>✦</span>
            </div>
            <ul>
              <li>Pick a card from the menu.</li>
              <li>Open envelopes, folders, songs, and profiles.</li>
              <li>Come back for the final gift last.</li>
            </ul>
          </section>
          <section class="sidebar-panel">
            <div class="panel-title">
              <span>NOW PLAYING</span>
              <span>♪</span>
            </div>
            ${renderNowPlaying()}
          </section>
        </aside>
      </div>
    `;
  }

  function menuCard(route, title, description, iconClass, wide) {
    return `
      <button class="menu-card ${wide ? "wide locked" : ""}" type="button" data-route="${route}">
        <span class="menu-icon ${iconClass}" aria-hidden="true"></span>
        <span class="menu-text">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(description)}</span>
        </span>
      </button>
    `;
  }

  function renderNowPlaying() {
    const song = data.playlist.songs[state.songIndex] || data.playlist.songs[0];
    const title = song ? song.title : "No song selected";
    const addedBy = song ? song.addedBy : "Add songs in playlist.js";
    return `
      <div class="now-playing-card">
        <div class="tiny-cover" aria-hidden="true"></div>
        <div>
          <strong id="nowPlayingTitle">${escapeHtml(title)}</strong>
          <span id="nowPlayingMeta">${escapeHtml(addedBy)}</span>
        </div>
      </div>
    `;
  }

  function renderGarden() {
    return `
      <svg class="garden-art" viewBox="0 0 320 560" role="img" aria-label="Animated pixel garden with lilies, sunflowers, a sleeping cat, bunny, butterflies, bees, birds, fence, grass, flowers, and clouds" shape-rendering="crispEdges">
        <rect width="320" height="560" fill="#f9e7b0"></rect>
        <rect y="0" width="320" height="210" fill="#bce2e1"></rect>
        <rect y="210" width="320" height="350" fill="#8fbf62"></rect>
        <rect y="420" width="320" height="140" fill="#79a94f"></rect>
        <path d="M72 560 L138 382 L186 382 L252 560 Z" fill="#e6be72"></path>
        <path d="M84 560 L144 394 L180 394 L240 560 Z" fill="#f0d18f"></path>

        <g transform="translate(24 44)"><g class="cloud">
          <rect x="0" y="14" width="70" height="20" fill="#fffaf0" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="12" y="2" width="28" height="18" fill="#fffaf0" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="38" y="8" width="24" height="16" fill="#fffaf0" stroke="#7b512f" stroke-width="3"></rect>
        </g></g>
        <g transform="translate(194 70)"><g class="cloud cloud-two">
          <rect x="0" y="14" width="80" height="20" fill="#fffaf0" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="16" y="2" width="30" height="18" fill="#fffaf0" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="46" y="7" width="24" height="17" fill="#fffaf0" stroke="#7b512f" stroke-width="3"></rect>
        </g></g>

        <g stroke="#4f783d" stroke-width="4" fill="none">
          <path d="M38 154 L46 146 L54 154"></path>
          <path d="M248 130 L258 121 L268 130"></path>
          <path d="M112 116 L121 108 L130 116"></path>
        </g>

        <g transform="translate(16 316)">
          <rect x="0" y="58" width="288" height="14" fill="#c7965b" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="8" y="22" width="18" height="64" fill="#f3d28c" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="50" y="14" width="18" height="72" fill="#f3d28c" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="92" y="24" width="18" height="62" fill="#f3d28c" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="212" y="18" width="18" height="68" fill="#f3d28c" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="254" y="26" width="18" height="60" fill="#f3d28c" stroke="#7b512f" stroke-width="3"></rect>
        </g>

        <g transform="translate(52 286)"><g class="sway-a">
          <rect x="22" y="42" width="6" height="66" fill="#4f783d"></rect>
          <rect x="2" y="16" width="18" height="18" fill="#f8bd3a" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="30" y="16" width="18" height="18" fill="#f8bd3a" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="16" y="2" width="18" height="18" fill="#f8bd3a" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="16" y="30" width="18" height="18" fill="#f8bd3a" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="16" y="16" width="18" height="18" fill="#7b512f"></rect>
          <rect x="6" y="70" width="20" height="10" fill="#6f9f52" stroke="#4f783d" stroke-width="3"></rect>
        </g></g>

        <g transform="translate(230 268)"><g class="sway-b">
          <rect x="20" y="54" width="6" height="78" fill="#4f783d"></rect>
          <rect x="0" y="22" width="18" height="18" fill="#f8bd3a" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="28" y="22" width="18" height="18" fill="#f8bd3a" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="14" y="6" width="18" height="18" fill="#f8bd3a" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="14" y="38" width="18" height="18" fill="#f8bd3a" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="14" y="22" width="18" height="18" fill="#7b512f"></rect>
        </g></g>

        <g transform="translate(24 398)"><g class="sway-b">
          <rect x="18" y="38" width="5" height="54" fill="#4f783d"></rect>
          <rect x="2" y="4" width="14" height="30" fill="#fffef8" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="24" y="4" width="14" height="30" fill="#fffef8" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="13" y="0" width="14" height="34" fill="#fffef8" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="18" y="20" width="5" height="8" fill="#f8bd3a"></rect>
        </g></g>

        <g transform="translate(256 410)"><g class="sway-a">
          <rect x="16" y="36" width="5" height="50" fill="#4f783d"></rect>
          <rect x="0" y="6" width="14" height="28" fill="#fffef8" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="22" y="6" width="14" height="28" fill="#fffef8" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="11" y="0" width="14" height="32" fill="#fffef8" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="16" y="19" width="5" height="8" fill="#f8bd3a"></rect>
        </g></g>

        <g transform="translate(114 348)">
          <g class="cat-tail">
            <rect x="88" y="54" width="14" height="54" fill="#d99d62" stroke="#7b512f" stroke-width="4"></rect>
            <rect x="94" y="44" width="18" height="16" fill="#d99d62" stroke="#7b512f" stroke-width="4"></rect>
          </g>
          <g class="cat-body">
            <rect x="10" y="58" width="92" height="58" rx="10" fill="#d99d62" stroke="#7b512f" stroke-width="4"></rect>
            <rect x="24" y="22" width="62" height="52" rx="8" fill="#eab47b" stroke="#7b512f" stroke-width="4"></rect>
            <polygon class="cat-ear" points="28,23 38,2 48,24" fill="#eab47b" stroke="#7b512f" stroke-width="4"></polygon>
            <polygon class="cat-ear" points="62,24 74,2 82,24" fill="#eab47b" stroke="#7b512f" stroke-width="4"></polygon>
            <rect class="cat-eye" x="40" y="43" width="8" height="4" fill="#4f3427"></rect>
            <rect class="cat-eye" x="62" y="43" width="8" height="4" fill="#4f3427"></rect>
            <rect x="54" y="52" width="6" height="4" fill="#f6a6b9"></rect>
            <rect x="34" y="86" width="18" height="8" fill="#f1c196"></rect>
            <rect x="62" y="86" width="18" height="8" fill="#f1c196"></rect>
          </g>
          <text class="zzz" x="94" y="20" fill="#7b512f" font-family="Courier New" font-size="20" font-weight="700">Z</text>
          <text class="zzz zzz-two" x="116" y="5" fill="#7b512f" font-family="Courier New" font-size="14" font-weight="700">z</text>
        </g>

        <g transform="translate(32 462)">
          <rect x="18" y="30" width="38" height="32" fill="#fffaf0" stroke="#7b512f" stroke-width="4"></rect>
          <rect x="23" y="8" width="9" height="28" fill="#fffaf0" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="42" y="6" width="9" height="30" fill="#fffaf0" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="32" y="43" width="5" height="5" fill="#4f3427"></rect>
          <rect x="45" y="43" width="5" height="5" fill="#4f3427"></rect>
          <rect x="39" y="51" width="5" height="4" fill="#f6a6b9"></rect>
        </g>

        <g transform="translate(60 196)"><g class="butterfly">
          <rect x="16" y="12" width="5" height="20" fill="#4f3427"></rect>
          <rect x="0" y="8" width="16" height="14" fill="#f6a6b9" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="21" y="8" width="16" height="14" fill="#ffe0e8" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="6" y="24" width="12" height="12" fill="#ffe0e8" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="20" y="24" width="12" height="12" fill="#f6a6b9" stroke="#7b512f" stroke-width="3"></rect>
        </g></g>

        <g transform="translate(218 178)"><g class="butterfly butterfly-two">
          <rect x="14" y="10" width="5" height="18" fill="#4f3427"></rect>
          <rect x="0" y="8" width="14" height="12" fill="#fffef8" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="19" y="8" width="14" height="12" fill="#ffd96f" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="5" y="22" width="10" height="10" fill="#ffd96f" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="18" y="22" width="10" height="10" fill="#fffef8" stroke="#7b512f" stroke-width="3"></rect>
        </g></g>

        <g transform="translate(42 274)"><g class="bee">
          <rect x="0" y="8" width="28" height="16" fill="#ffd96f" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="8" y="8" width="4" height="16" fill="#7b512f"></rect>
          <rect x="18" y="8" width="4" height="16" fill="#7b512f"></rect>
          <rect x="7" y="0" width="10" height="8" fill="#fffef8" stroke="#7b512f" stroke-width="2"></rect>
        </g></g>

        <g transform="translate(252 238)"><g class="bee bee-two">
          <rect x="0" y="8" width="28" height="16" fill="#ffd96f" stroke="#7b512f" stroke-width="3"></rect>
          <rect x="8" y="8" width="4" height="16" fill="#7b512f"></rect>
          <rect x="18" y="8" width="4" height="16" fill="#7b512f"></rect>
          <rect x="7" y="0" width="10" height="8" fill="#fffef8" stroke="#7b512f" stroke-width="2"></rect>
        </g></g>

        <rect class="spark" x="170" y="238" width="10" height="10" fill="#fffef8" stroke="#d89625" stroke-width="2" transform="rotate(45 175 243)"></rect>
        <rect class="spark spark-two" x="98" y="252" width="8" height="8" fill="#fffef8" stroke="#d89625" stroke-width="2" transform="rotate(45 102 256)"></rect>
        <rect class="petal" x="126" y="156" width="8" height="12" fill="#f6a6b9"></rect>
        <rect class="petal petal-two" x="204" y="128" width="8" height="12" fill="#fffef8"></rect>

        <g fill="#e94f64" stroke="#7b512f" stroke-width="2">
          <rect x="88" y="494" width="12" height="10"></rect>
          <rect x="222" y="506" width="12" height="10"></rect>
        </g>
        <g fill="#4f3427">
          <rect x="91" y="497" width="2" height="2"></rect>
          <rect x="96" y="500" width="2" height="2"></rect>
          <rect x="225" y="509" width="2" height="2"></rect>
          <rect x="230" y="512" width="2" height="2"></rect>
        </g>
      </svg>
    `;
  }

  function renderLetters() {
    const active = data.letters.find((letter) => letter.id === state.letterId) || data.letters[0];
    if (!active) {
      return renderPageHeader("letters", "Add letters in data/letters.js") + `<div class="empty-state">No letters yet.</div>`;
    }

    return `
      ${renderPageHeader("letters", "A cozy desk with envelopes, paper, tape, and birthday letters.")}
      <div class="content-panel location-scene letter-layout letter-desk-scene">
        <nav class="envelope-list" aria-label="Letter envelopes">
          ${data.letters.map((letter) => `
            <button class="envelope-button ${letter.id === active.id ? "active" : ""}" type="button" data-letter="${escapeHtml(letter.id)}">
              <strong>${escapeHtml(letter.label)}</strong>
              <span>${escapeHtml(letter.from)}</span>
            </button>
          `).join("")}
        </nav>
        <article class="letter-paper">
          <div class="letter-meta">
            <h2>${escapeHtml(active.title)}</h2>
            <p>From ${escapeHtml(active.from)} • ${escapeHtml(active.date)}</p>
          </div>
          ${renderLetterBody(active)}
          <span class="paper-corner-flower" aria-hidden="true"></span>
        </article>
      </div>
    `;
  }

  function renderLetterBody(letter) {
    const imageIndex = getLetterImageIndex(letter.id);
    const hasText = Boolean(letter.text);
    const hasImage = Boolean(letter.image && letter.imageAvailable !== false && !state.missingImages.has(letter.image));
    const imageMarkup = hasImage ? `
      <figure class="letter-image-card"${optionalImageCardAttr(letter)}>
        <button class="image-open-button" type="button" data-lightbox-context="letters" data-lightbox-index="${imageIndex}" data-lightbox-src="${escapeHtml(letter.image)}" aria-label="Open full decorated letter from ${escapeHtml(letter.from)}">
          <img src="${escapeHtml(letter.image)}" alt="${escapeHtml(letter.imageAlt || letter.title)}" loading="lazy" decoding="async"${optionalImageAttr(letter)}>
        </button>
        <figcaption>Click the decorated letter to open the full image.</figcaption>
        ${letter.fullLetterLink ? `<a class="external-link letter-full-link" href="${escapeHtml(letter.fullLetterLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(letter.fullLetterLabel || "Open Full Letter")}</a>` : ""}
      </figure>
    ` : "";

    const textToggleMarkup = hasImage && hasText ? `
      <button class="external-link letter-text-toggle" type="button" data-open-letter-text="${escapeHtml(letter.id)}" aria-haspopup="dialog">
        Read as text
      </button>
    ` : "";

    const textMarkup = hasText && !hasImage ? `
      <div class="letter-content">
        ${paragraph(letter.text)}
      </div>
    ` : "";

    return `${imageMarkup}${textToggleMarkup}${textMarkup}`;
  }

  function getLetterImageIndex(letterId) {
    return data.letters.filter((letter) => letter.image && letter.imageAvailable !== false && !state.missingImages.has(letter.image)).findIndex((letter) => letter.id === letterId);
  }

  function renderMemoryMuseum() {
    const memories = getMuseumMemoryItems();
    if (!memories.length) {
      return renderPageHeader("museum", "Add real memory photos and screenshots in data/memories.js.") + `<div class="empty-state">No memories yet.</div>`;
    }

    return `
      ${renderPageHeader("museum", "Real memory photos, screenshots, inside jokes, and explanations.")}
      <div class="content-panel location-scene museum-room-scene">
        <div class="memory-grid">
          ${memories.map((memory, index) => renderMemoryCard(memory, index, "museum")).join("")}
        </div>
      </div>
    `;
  }

  function renderMemoryCard(memory, index, context = "museum") {
    const meta = memory.folderTitle
      ? `${memory.date} • ${memory.folderTitle} • submitted by ${memory.submittedBy}`
      : `${memory.date} • submitted by ${memory.submittedBy}`;

    return `
      <article class="memory-card"${optionalImageCardAttr(memory)}>
        <button class="image-open-button" type="button" data-lightbox-context="${escapeHtml(context)}" data-lightbox-index="${index}" data-lightbox-src="${escapeHtml(memory.image)}" aria-label="Open full image for ${escapeHtml(memory.title)}">
          <img src="${escapeHtml(memory.image)}" alt="${escapeHtml(memory.title)}" loading="lazy" decoding="async"${optionalImageAttr(memory)}>
        </button>
        <div class="memory-body">
          <h3>${escapeHtml(memory.title)}</h3>
          <div class="memory-meta">${escapeHtml(meta)}</div>
          ${memory.description ? `<p>${escapeHtml(memory.description)}</p>` : ""}
          ${memory.whyWeLoveIt ? `<div class="memory-love"><strong>Why we love it:</strong> ${escapeHtml(memory.whyWeLoveIt)}</div>` : ""}
        </div>
      </article>
    `;
  }

  function getFlatMemoryItems() {
    return data.memories.flatMap((folder) => (folder.memories || []).map((memory) => ({
      ...memory,
      folderTitle: folder.title,
      folderId: folder.id,
      folderDescription: folder.description
    }))).filter((memory) => !state.missingImages.has(memory.image));
  }

  function getMuseumMemoryItems() {
    const seen = new Set();
    return getFlatMemoryItems().filter((memory) => {
      if (!memory.image || seen.has(memory.image)) return false;
      seen.add(memory.image);
      return true;
    });
  }

  function getLightboxImages(context) {
    context = String(context || "");
    let images = [];

    if (context === "museum") {
      images = getMuseumMemoryItems().map((memory) => ({
        src: memory.image,
        title: memory.title,
        meta: `${memory.date} - ${memory.folderTitle} - submitted by ${memory.submittedBy}`,
        optionalImage: memory.optionalImage
      }));
    }

    if (context === "letters") {
      images = data.letters.filter((letter) => letter.image && letter.imageAvailable !== false).map((letter) => ({
        src: letter.image,
        title: letter.title,
        meta: `Letter from ${letter.from}`,
        optionalImage: letter.imageOptional || letter.optionalImage
      }));
    }

    if (context.startsWith("friend:")) {
      const friendId = context.slice("friend:".length);
      const friend = data.friends.find((item) => item.id === friendId);
      images = (friend ? getFriendProfileMedia(friend) : []).map((memory) => ({
        src: memory.image,
        title: memory.title,
        meta: `${memory.date} - submitted by ${memory.submittedBy}`,
        optionalImage: memory.optionalImage
      }));
    }

    return availableLightboxImages(images);
  }

  function openLightbox(context, index, source) {
    const images = getLightboxImages(context);
    if (!images.length) return;
    const sourceIndex = source ? images.findIndex((image) => image.src === source) : -1;
    const safeIndex = sourceIndex >= 0
      ? sourceIndex
      : Math.max(0, Math.min(Number(index) || 0, images.length - 1));
    state.lightbox = { images, index: safeIndex };
    renderLightbox();
  }

  function closeLightbox(clearState = true) {
    const existing = document.querySelector("[data-lightbox-overlay]");
    if (existing) existing.remove();
    document.body.classList.remove("lightbox-open");
    if (clearState) state.lightbox = null;
  }

  function changeLightbox(delta) {
    if (!state.lightbox || state.lightbox.images.length < 2) return;
    const total = state.lightbox.images.length;
    state.lightbox.index = (state.lightbox.index + delta + total) % total;
    renderLightbox();
  }

  function renderLightbox() {
    closeLightbox(false);
    if (!state.lightbox) return;

    const { images, index } = state.lightbox;
    const image = images[index];
    const hasMultiple = images.length > 1;
    const overlay = document.createElement("div");
    overlay.className = "lightbox-overlay";
    overlay.dataset.lightboxOverlay = "true";
    overlay.innerHTML = `
      <div class="lightbox-frame" role="dialog" aria-modal="true" aria-label="${escapeHtml(image.title)}">
        <button class="lightbox-close" type="button" data-lightbox-close aria-label="Close full image">X</button>
        <button class="lightbox-arrow lightbox-prev" type="button" data-lightbox-prev aria-label="Previous image" ${hasMultiple ? "" : "disabled"}>&lt;</button>
        <img class="lightbox-image" src="${escapeHtml(image.src)}" alt="${escapeHtml(image.title)}"${optionalImageAttr(image)}>
        <button class="lightbox-arrow lightbox-next" type="button" data-lightbox-next aria-label="Next image" ${hasMultiple ? "" : "disabled"}>&gt;</button>
        <div class="lightbox-caption">
          <strong>${escapeHtml(image.title)}</strong>
          <span>${escapeHtml(image.meta)} (${index + 1} / ${images.length})</span>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.classList.add("lightbox-open");
  }

  function openLetterTextModal(letter) {
    if (!letter || !letter.text) return;
    closeLetterTextModal();
    const titleId = `letterTextTitle-${letter.id}`;
    const overlay = document.createElement("div");
    overlay.className = "letter-text-modal-overlay";
    overlay.dataset.letterTextOverlay = "true";
    overlay.innerHTML = `
      <article class="letter-text-dialog" role="dialog" aria-modal="true" aria-labelledby="${escapeHtml(titleId)}">
        <button class="letter-text-close" type="button" data-letter-text-close aria-label="Close text letter">X</button>
        <div class="letter-text-modal-meta">
          <h2 id="${escapeHtml(titleId)}">${escapeHtml(letter.title)}</h2>
          <p>From ${escapeHtml(letter.from)} - ${escapeHtml(letter.date)}</p>
        </div>
        <div class="letter-text-modal-content">${paragraph(letter.text)}</div>
        <button class="external-link letter-text-close-action" type="button" data-letter-text-close>Close text</button>
      </article>
    `;
    document.body.appendChild(overlay);
    document.body.classList.add("letter-text-open");
    overlay.querySelector("[data-letter-text-close]")?.focus({ preventScroll: true });
  }

  function closeLetterTextModal() {
    const existing = document.querySelector("[data-letter-text-overlay]");
    if (existing) existing.remove();
    document.body.classList.remove("letter-text-open");
  }

  document.addEventListener("error", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement) || !target.dataset.optionalImage) return;
    state.missingImages.add(target.dataset.optionalImage);

    if (target.classList.contains("lightbox-image") && state.lightbox) {
      state.lightbox.images = state.lightbox.images.filter((image) => image.src !== target.dataset.optionalImage);
      if (!state.lightbox.images.length) {
        closeLightbox();
        return;
      }
      state.lightbox.index = Math.min(state.lightbox.index, state.lightbox.images.length - 1);
      renderLightbox();
      return;
    }

    const card = target.closest("[data-optional-image-card]");
    if (card && card.classList.contains("letter-image-card")) {
      render();
      return;
    }
    if (card) card.remove();
  }, true);

  function renderReasons() {
    const gardenReasons = data.reasons.filter((reason) => reasonMessage(reason));
    if (!gardenReasons.length) {
      return renderPageHeader("reasons", "Add reasons in data/reasons.js.") + `<div class="empty-state">No flowers yet.</div>`;
    }
    const active = gardenReasons.find((reason) => reason.person === state.gardenPerson) || null;
    const hanging = gardenReasons.slice(0, 2);
    const shelves = [
      gardenReasons.slice(2, 5),
      gardenReasons.slice(5, 8),
      gardenReasons.slice(8)
    ].filter((row) => row.length);

    return `
      <div class="page-header love-garden-page-header">
        <div>
          <h2 class="page-heading">Love Grows Here</h2>
          <p class="page-subtitle">Every flower holds one reason you are loved.</p>
          <p class="greenhouse-handnote">Pick a flower, Taani </p>
        </div>
        ${renderLocationNav("reasons", "top")}
      </div>
      <div class="content-panel location-scene love-garden-scene">
        <section class="love-garden-board greenhouse-board" aria-label="Interactive flower conservatory">
          <span class="greenhouse-sunbeam greenhouse-sunbeam-one" aria-hidden="true"></span>
          <span class="greenhouse-sunbeam greenhouse-sunbeam-two" aria-hidden="true"></span>
          <span class="greenhouse-butterfly greenhouse-butterfly-one" aria-hidden="true"></span>
          <span class="greenhouse-butterfly greenhouse-butterfly-two" aria-hidden="true"></span>
          <span class="greenhouse-petal greenhouse-petal-one" aria-hidden="true"></span>
          <span class="greenhouse-petal greenhouse-petal-two" aria-hidden="true"></span>
          <span class="greenhouse-petal greenhouse-petal-three" aria-hidden="true"></span>
          <div class="greenhouse-shell">
            <div class="greenhouse-roof" aria-hidden="true">
              <span></span><span></span><span></span>
            </div>
            <div class="greenhouse-glass">
              <div class="greenhouse-decor greenhouse-watering-can" aria-hidden="true"></div>
              <div class="greenhouse-decor greenhouse-gloves" aria-hidden="true"></div>
              <div class="greenhouse-hanging-row" aria-label="Hanging planters">
                ${hanging.map((reason, index) => renderGardenPot(reason, index, active, true)).join("")}
              </div>
              <div class="greenhouse-shelves" aria-label="Friend flower shelves">
                ${shelves.map((row, rowIndex) => `
                  <div class="greenhouse-shelf greenhouse-shelf-${rowIndex + 1}">
                    <div class="greenhouse-shelf-plants">
                      ${row.map((reason, index) => renderGardenPot(reason, index + 2 + rowIndex * 3, active, false)).join("")}
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
            <div class="greenhouse-base" aria-hidden="true">
              <span class="greenhouse-ribbon"></span>
              <span class="greenhouse-heart-doodle">♡</span>
              <span class="greenhouse-pressed-flower"></span>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderGardenPot(reason, index, active, hanging) {
    const plantTypes = ["sunflower", "lily", "daisy", "tulip", "forget", "hydrangea", "babysbreath", "rose", "lavender", "wildflower"];
    const doodles = ["♡", "✿", "✦", "❀", "⋆", "❁", "⌁", "☼", "✧", "❋"];
    const plantType = plantTypes[index % plantTypes.length];
    const isOpen = Boolean(active && active.person === reason.person);
    const noteId = `garden-note-${index}`;
    const message = reasonMessage(reason);

    return `
      <div class="greenhouse-slot greenhouse-slot-${index % 5} ${hanging ? "greenhouse-slot-hanging" : ""} ${isOpen ? "is-open" : ""}" style="--plant-delay: ${index * -0.35}s;">
        ${hanging ? `<span class="hanger-cord" aria-hidden="true"></span>` : ""}
        <button class="greenhouse-pot plant-${plantType}" type="button" data-garden-person="${escapeHtml(reason.person)}" aria-expanded="${isOpen}" aria-controls="${escapeHtml(noteId)}">
          <span class="plant-stage" aria-hidden="true">
            <span class="plant-stem plant-stem-one"></span>
            <span class="plant-stem plant-stem-two"></span>
            <span class="plant-leaf plant-leaf-left"></span>
            <span class="plant-leaf plant-leaf-right"></span>
            <span class="plant-bloom plant-bloom-one"><i></i><i></i><i></i><i></i><i></i></span>
            <span class="plant-bloom plant-bloom-two"><i></i><i></i><i></i><i></i><i></i></span>
            <span class="plant-bloom plant-bloom-three"><i></i><i></i><i></i><i></i><i></i></span>
          </span>
          <span class="plant-pot" aria-hidden="true"><span>${escapeHtml(doodles[index % doodles.length])}</span></span>
          <span class="plant-label">${escapeHtml(reason.person)}</span>
        </button>
        ${isOpen ? `
          <aside class="plant-note" id="${escapeHtml(noteId)}" aria-live="polite">
            <button class="plant-note-close" type="button" data-garden-close aria-label="Close ${escapeHtml(reason.person)}'s note">X</button>
            <strong>${escapeHtml(reason.person)}</strong>
            <p>${escapeHtml(message)}</p>
          </aside>
        ` : ""}
      </div>
    `;
  }

  function reasonSections(reason) {
    if (!reason) return [];
    const sections = Array.isArray(reason.sections) && reason.sections.length
      ? reason.sections.filter((section) => section.value)
      : [
        { label: "One thing I admire", value: reason.admire },
        { label: "One funny thing you always do", value: reason.funny },
        { label: "One favorite memory with you", value: reason.favoriteMemory },
        { label: "One wish for you", value: reason.wish }
      ].filter((section) => section.value);
    return sections;
  }

  function reasonMessage(reason) {
    const sections = reasonSections(reason).filter((section) => isSubmittedReasonText(section.value));
    const preferred = sections.find((section) => /admire/i.test(section.label))
      || sections.find((section) => /wish/i.test(section.label))
      || sections[0];
    return preferred ? preferred.value : "";
  }

  function isSubmittedReasonText(value) {
    const normalized = String(value || "").trim();
    return Boolean(normalized) && !/^not provided\.?$/i.test(normalized) && !/^no answer submitted\.?$/i.test(normalized);
  }

  function renderReasonDetails(reason) {
    const sections = reasonSections(reason);
    if (!sections.length) return "";
    return `
      <dl class="profile-reason-list">
        ${sections.map((section) => `
          <div>
            <dt>${escapeHtml(section.label)}</dt>
            <dd>${escapeHtml(section.value)}</dd>
          </div>
        `).join("")}
      </dl>
    `;
  }

  function renderPlaylist() {
    const songs = data.playlist.songs || [];
    const active = songs[state.songIndex] || songs[0];
    if (!active) {
      return renderPageHeader("playlist", "Add songs in data/playlist.js") + `<div class="empty-state">No songs yet.</div>`;
    }

    const canPlay = hasLocalAudio(active);
    const externalLabel = active.link && active.link.includes("open.spotify.com") ? "Open on Spotify" : "Open Song Link";
    const fullPlaylistLink = data.playlist.fullPlaylistLink || "";

    return `
      ${renderPageHeader("playlist", "A music pond with lily-pad songs, notes, covers, and links.")}
      ${fullPlaylistLink ? `
        <div class="playlist-actions">
          <a class="external-link" href="${escapeHtml(fullPlaylistLink)}" target="_blank" rel="noopener noreferrer">Open Full Birthday Playlist</a>
        </div>
      ` : ""}
      <div class="content-panel location-scene playlist-layout music-pond-scene">
        <nav class="song-list" aria-label="Songs">
          ${songs.map((song, index) => `
            <button class="song-button ${index === state.songIndex ? "active" : ""}" type="button" data-song-index="${index}">
              <span class="song-number">${String(index + 1).padStart(2, "0")}</span>
              <span>
                <strong>${escapeHtml(song.title)}</strong>
                <span>${escapeHtml(song.artist)} • added by ${escapeHtml(song.addedBy)}</span>
              </span>
            </button>
          `).join("")}
        </nav>
        <section class="song-detail">
          <div class="player-top">
            <img class="song-cover" src="${escapeHtml(active.cover)}" alt="${escapeHtml(active.title)} cover" loading="lazy" decoding="async">
            <div>
              <h2>${escapeHtml(active.title)}</h2>
              <div class="song-meta">${escapeHtml(active.artist)} • added by ${escapeHtml(active.addedBy)}</div>
              ${active.note ? `<p>${escapeHtml(active.note)}</p>` : ""}
              <a class="external-link" href="${escapeHtml(active.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(externalLabel)}</a>
              ${canPlay
                ? `<p class="replace-note">Local audio file available.</p>`
                : `<p class="replace-note">No local audio file has been added yet. Use the Spotify button above.</p>`
              }
            </div>
          </div>
          ${canPlay ? `<div class="player-controls">
            <div class="control-row">
              <button class="control-button" type="button" data-player="previous">Prev</button>
              <button class="control-button" type="button" data-player="play" ${canPlay ? "" : "disabled"}>Play</button>
              <button class="control-button" type="button" data-player="pause" ${canPlay ? "" : "disabled"}>Pause</button>
              <button class="control-button" type="button" data-player="next">Next</button>
            </div>
            <div class="progress-wrap">
              <label for="progressRange">Progress</label>
              <input id="progressRange" type="range" min="0" max="100" value="0" data-progress>
              <span id="timeReadout">0:00</span>
            </div>
            <div class="volume-wrap">
              <label for="volumeRange">Volume</label>
              <input id="volumeRange" type="range" min="0" max="1" step="0.01" value="${audio.volume || 0.75}" data-volume>
              <span>${state.muted ? "muted" : "on"}</span>
            </div>
            <div class="player-note" id="playerNote">${escapeHtml(playlistStatus)}</div>
          </div>` : ""}
        </section>
      </div>
    `;
  }

  function renderFriends() {
    const active = data.friends.find((friend) => friend.id === state.friendId) || data.friends[0];
    if (!active) {
      return renderPageHeader("friends", "Add friend profiles in data/friends.js") + `<div class="empty-state">No friends yet.</div>`;
    }
    if (state.friendId !== active.id) {
      state.friendId = active.id;
      writeSessionValue("taani-active-friend", active.id);
    }

    return `
      ${renderPageHeader("friends", "A tiny friends village with profile houses and live friendship timers.")}
      <div class="content-panel location-scene friends-layout friends-village-scene">
        <section class="friend-card-grid" aria-label="Friend cards">
          ${data.friends.map((friend) => `
            <button class="friend-card ${friend.id === active.id ? "active" : ""}" type="button" data-friend="${escapeHtml(friend.id)}">
              <img class="friend-avatar" src="${escapeHtml(friend.profilePicture)}" alt="${escapeHtml(friend.displayName)} profile picture" loading="lazy" decoding="async">
              <h3>${escapeHtml(friend.displayName)}</h3>
              ${friend.nickname ? `<div class="friend-meta">${escapeHtml(friend.nickname)}</div>` : ""}
            </button>
          `).join("")}
        </section>
        <article class="friend-profile">
          ${renderFriendProfile(active)}
        </article>
      </div>
    `;
  }

  function renderFriendProfile(friend) {
    return `
      <div class="friend-profile-stack">
        <div class="profile-top">
          <img class="profile-photo" src="${escapeHtml(friend.profilePicture)}" alt="${escapeHtml(friend.displayName)} profile picture" loading="lazy" decoding="async">
          <div>
            <h2>${escapeHtml(friend.displayName)}</h2>
            ${friend.nickname ? `<div class="friend-meta">Nickname: ${escapeHtml(friend.nickname)}</div>` : ""}
            ${friend.intro ? `<p>${escapeHtml(friend.intro)}</p>` : ""}
            ${friend.twitter ? `<a class="external-link" href="${escapeHtml(friend.twitter)}" target="_blank" rel="noopener noreferrer">Twitter</a>` : ""}
            ${friend.instagram ? `<a class="external-link" href="${escapeHtml(friend.instagram)}" target="_blank" rel="noopener noreferrer">${escapeHtml(friend.instagramLabel || "Instagram")}</a>` : ""}
          </div>
        </div>
        ${renderFriendshipSection(friend)}
        ${renderFriendLetterSection(friend)}
        ${renderFriendReasonsSection(friend)}
        ${renderFriendPlaylistSection(friend)}
        ${renderFriendFavoriteQuoteSection(friend)}
        ${renderFriendMemoriesAndJokes(friend)}
        ${renderSecretMessageSection(friend)}
      </div>
    `;
  }

  function renderFriendshipSection(friend) {
    const sinceText = friend.friendsSinceDisplay
      || (friend.friendsSinceLabel ? `Friends since: ${friend.friendsSinceLabel}` : "")
      || (friend.friendsSince ? `Friends since: ${friend.friendsSince}` : "");
    if (!sinceText && (friend.hideFriendshipTimer || !friend.friendsSince)) return "";

    return `
      <section class="friend-section profile-friendship">
        <div>
          <h3>Friendship information</h3>
          ${sinceText ? `<p>${escapeHtml(sinceText)}</p>` : ""}
        </div>
        ${friend.hideFriendshipTimer || !friend.friendsSince ? "" : `<div class="timer-grid" data-friend-timer="${escapeHtml(friend.friendsSince)}">
          ${timerCell("years", 0)}
          ${timerCell("months", 0)}
          ${timerCell("days", 0)}
          ${timerCell("hours", 0)}
          ${timerCell("minutes", 0)}
          ${timerCell("seconds", 0)}
        </div>`}
      </section>
    `;
  }

  function renderFriendLetterSection(friend) {
    const letter = findFriendLetter(friend);
    if (!letter) return "";
    return `
      <section class="friend-section profile-letter-section">
        <h3>Letter</h3>
        ${renderLetterBody(letter)}
      </section>
    `;
  }

  function renderFriendReasonsSection(friend) {
    const reason = findFriendReason(friend);
    if (!reason) return "";
    return `
      <section class="friend-section">
        <h3>Reasons We Love You</h3>
        ${renderReasonDetails(reason)}
      </section>
    `;
  }

  function renderFriendPlaylistSection(friend) {
    const songs = getFriendSongs(friend);
    if (!songs.length) return "";
    return `
      <section class="friend-section">
        <h3>Playlist</h3>
        <div class="profile-song-list">
          ${songs.map((song) => {
            const externalLabel = song.link && song.link.includes("open.spotify.com") ? "Open on Spotify" : "Open Song Link";
            return `
              <article class="profile-song">
                <strong>${escapeHtml(song.title)}</strong>
                <span>${escapeHtml(song.artist)}</span>
                ${song.note ? `<p>${escapeHtml(song.note)}</p>` : ""}
                ${song.link ? `<a class="external-link" href="${escapeHtml(song.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(externalLabel)}</a>` : ""}
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function renderFriendFavoriteQuoteSection(friend) {
    const hasQuote = Boolean(friend.favoriteQuote);
    const hasQuoteList = Array.isArray(friend.quotesFromTaani) && friend.quotesFromTaani.length;
    if (!hasQuote && !hasQuoteList) return "";
    return `
      <section class="friend-section">
        <h3>Favorite quote</h3>
        ${hasQuote ? `<p class="profile-quote">${escapeHtml(friend.favoriteQuote)}</p>` : ""}
        ${hasQuoteList ? `<ul class="quote-list">${friend.quotesFromTaani.map((quote) => `<li>${escapeHtml(quote)}</li>`).join("")}</ul>` : ""}
      </section>
    `;
  }

  function renderFriendMemoriesAndJokes(friend) {
    const media = getFriendProfileMedia(friend);
    if (!friend.insideJokes && !media.length) return "";
    return `
      <section class="friend-section">
        <h3>Memories and inside jokes</h3>
        ${friend.insideJokes ? `<p class="profile-inside-jokes">${escapeHtml(friend.insideJokes)}</p>` : ""}
        ${media.length ? `<div class="memory-grid profile-memory-grid">${media.map((memory, index) => renderMemoryCard(memory, index, `friend:${friend.id}`)).join("")}</div>` : ""}
      </section>
    `;
  }

  function renderSecretMessageSection(friend) {
    if (!friend.secretEndingMessage) return "";
    return `
      <section class="friend-section">
        <h3>Secret message</h3>
        <p class="profile-secret-message">${escapeHtml(friend.secretEndingMessage)}</p>
      </section>
    `;
  }

  function normalizePersonName(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function findFriendLetter(friend) {
    const friendKey = normalizePersonName(friend.displayName);
    return data.letters.find((letter) => letter.id === friend.id || normalizePersonName(letter.from) === friendKey);
  }

  function findFriendReason(friend) {
    const friendKey = normalizePersonName(friend.displayName);
    return data.reasons.find((reason) => normalizePersonName(reason.person) === friendKey);
  }

  function getFriendSongs(friend) {
    const friendKey = normalizePersonName(friend.displayName);
    return (data.playlist.songs || []).filter((song) => normalizePersonName(song.addedBy) === friendKey);
  }

  function getFriendProfileMedia(friend) {
    const friendKey = normalizePersonName(friend.displayName);
    const memoryItems = getMuseumMemoryItems().filter((memory) => {
      return memory.folderId === friend.id || normalizePersonName(memory.submittedBy) === friendKey;
    });
    const profilePhotos = (friend.photos || [])
      .filter((photo) => photo.image && !state.missingImages.has(photo.image))
      .map((photo) => ({
        title: photo.title,
        image: photo.image,
        date: photo.date || "Birthday 2026",
        submittedBy: photo.submittedBy || friend.displayName,
        description: photo.caption || "",
        whyWeLoveIt: "",
        optionalImage: photo.optionalImage
      }));
    const seen = new Set();
    return memoryItems.concat(profilePhotos).filter((item) => {
      if (!item.image || seen.has(item.image)) return false;
      seen.add(item.image);
      return true;
    });
  }

  function timerCell(label, value) {
    return `
      <div class="timer-cell">
        <strong data-timer-value="${label}">${value}</strong>
        <span>${label}</span>
      </div>
    `;
  }

  function renderFinalGift() {
    return `
      ${renderPageHeader("gift", "The sunflower gate stays locked until Taani opens the final birthday message.")}
      <section class="secret-stage location-scene sunflower-gate-scene">
        ${state.secretUnlocked ? renderFinalGiftUnlocked() : renderFinalGiftLocked()}
      </section>
    `;
  }

  function renderFinalGiftLocked() {
    return `
      <div class="secret-lock">
        <div class="lock-box">
          <div class="big-lock" aria-hidden="true"></div>
          <h2>Final Gift Locked</h2>
          <p>This page is saved for the final birthday moment.</p>
          <button class="pixel-button" type="button" data-unlock-final-gift>Unlock Final Gift</button>
        </div>
      </div>
    `;
  }

  function renderFinalGiftUnlocked() {
    const friendMessages = data.friends
      .filter((friend) => friend.secretEndingMessage)
      .map((friend) => `
        <section class="secret-friend-message">
          <h3>${escapeHtml(friend.displayName)}</h3>
          <p>${escapeHtml(friend.secretEndingMessage)}</p>
        </section>
      `)
      .join("");

    return `
      <div class="secret-unlocked">
        <div class="secret-message">
          <h2>Final Gift</h2>
          <p>Thank you for existing. Thank you for being part of our lives.</p>
        </div>
        ${friendMessages ? `<div class="secret-friend-grid">${friendMessages}</div>` : ""}
      </div>
    `;
  }

  function selectSong(index, shouldPlay) {
    const songs = data.playlist.songs || [];
    if (!songs.length) return;
    state.songIndex = (index + songs.length) % songs.length;
    const song = songs[state.songIndex];
    if (hasLocalAudio(song)) {
      audio.src = song.audio;
      audio.load();
      playlistStatus = `Loaded "${song.title}".`;
    } else {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      playlistStatus = `"${song.title}" is available on Spotify. Add a local audio file to enable playback.`;
    }
    render();
    if (shouldPlay && hasLocalAudio(song)) {
      playCurrentSong();
    }
  }

  function playCurrentSong() {
    const song = data.playlist.songs[state.songIndex];
    if (!song) return;
    if (!hasLocalAudio(song)) {
      playlistStatus = `"${song.title}" does not have a local audio file yet. Open it on Spotify instead.`;
      updatePlayerUi();
      return;
    }
    if (!audio.getAttribute("src")) {
      audio.src = song.audio;
      audio.load();
    }
    audio.muted = state.muted;
    audio.play().then(() => {
      playlistStatus = `Playing "${song.title}".`;
      updatePlayerUi();
    }).catch(() => {
      playlistStatus = `"${song.title}" could not be played from the local audio file.`;
      updatePlayerUi();
    });
  }

  function pauseCurrentSong() {
    audio.pause();
    playlistStatus = "Paused.";
    updatePlayerUi();
  }

  function hasLocalAudio(song) {
    return Boolean(song && song.audio && song.audio.trim());
  }

  function updatePlayerUi() {
    const song = data.playlist.songs[state.songIndex];
    const note = document.getElementById("playerNote");
    const progress = document.querySelector("[data-progress]");
    const timeReadout = document.getElementById("timeReadout");
    const nowTitle = document.getElementById("nowPlayingTitle");
    const nowMeta = document.getElementById("nowPlayingMeta");

    if (note) note.textContent = playlistStatus;
    if (song && nowTitle) nowTitle.textContent = song.title;
    if (song && nowMeta) nowMeta.textContent = song.addedBy;

    if (progress && timeReadout) {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        progress.value = String((audio.currentTime / audio.duration) * 100);
        timeReadout.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
      } else {
        progress.value = "0";
        timeReadout.textContent = "0:00";
      }
    }
  }

  function formatTime(seconds) {
    const safeSeconds = Math.max(0, Math.floor(seconds || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const rest = safeSeconds % 60;
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  }

  function isBirthdayToday(now) {
    return now.getMonth() === BIRTHDAY_MONTH_INDEX && now.getDate() === BIRTHDAY_DAY;
  }

  function getNextBirthday(now) {
    if (isBirthdayToday(now)) return null;

    let birthday = new Date(
      now.getFullYear(),
      BIRTHDAY_MONTH_INDEX,
      BIRTHDAY_DAY,
      0,
      0,
      0,
      0
    );

    if (birthday <= now) {
      birthday = new Date(
        now.getFullYear() + 1,
        BIRTHDAY_MONTH_INDEX,
        BIRTHDAY_DAY,
        0,
        0,
        0,
        0
      );
    }

    return birthday;
  }

  function splitCountdown(milliseconds) {
    let remaining = Math.max(0, milliseconds);
    const days = Math.floor(remaining / 86400000);
    remaining -= days * 86400000;
    const hours = Math.floor(remaining / 3600000);
    remaining -= hours * 3600000;
    const minutes = Math.floor(remaining / 60000);
    remaining -= minutes * 60000;
    const seconds = Math.floor(remaining / 1000);
    return { days, hours, minutes, seconds };
  }

  function calculateBirthdayState(now) {
    if (isBirthdayToday(now)) {
      return {
        isBirthday: true,
        status: "IT'S TAANI'S BIRTHDAY!",
        detail: `Taani is turning ${TAANI_TURNING_AGE} today!`,
        units: { days: 0, hours: 0, minutes: 0, seconds: 0 }
      };
    }

    const birthday = getNextBirthday(now);
    const units = splitCountdown(birthday - now);
    return {
      isBirthday: false,
      status: "Birthday countdown",
      detail: `Birthday: 22 July - Turning ${TAANI_TURNING_AGE}`,
      units
    };
  }

  function formatCountdownUnit(unit, value) {
    return unit === "days" ? String(value) : String(value).padStart(2, "0");
  }

  function updateBirthdayUi(now = new Date()) {
    const widget = document.querySelector("[data-birthday-widget]");
    if (!widget) return;

    const birthday = calculateBirthdayState(now);
    const signature = [
      birthday.isBirthday ? "birthday" : "countdown",
      birthday.status,
      birthday.detail,
      ...COUNTDOWN_UNITS.map((unit) => `${unit}:${birthday.units[unit]}`)
    ].join("|");

    if (signature === widget.dataset.birthdaySignature) return;
    widget.dataset.birthdaySignature = signature;

    widget.classList.toggle("is-birthday", birthday.isBirthday);

    const status = widget.querySelector("[data-birthday-status]");
    const detail = widget.querySelector("[data-birthday-detail]");
    if (status && status.textContent !== birthday.status) status.textContent = birthday.status;
    if (detail && detail.textContent !== birthday.detail) detail.textContent = birthday.detail;

    COUNTDOWN_UNITS.forEach((unit) => {
      const node = widget.querySelector(`[data-birthday-unit="${unit}"]`);
      const value = formatCountdownUnit(unit, birthday.units[unit]);
      if (node && node.textContent !== value) node.textContent = value;
    });
  }

  function updateClock(now = new Date()) {
    const clockText = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(now);
    const timeZoneText = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time zone";

    if (worldClock && clockText !== lastClockText) {
      worldClock.textContent = clockText;
      lastClockText = clockText;
    }

    if (worldTimeZone && timeZoneText !== lastTimeZoneText) {
      worldTimeZone.textContent = timeZoneText;
      lastTimeZoneText = timeZoneText;
    }
  }

  function updateSoundButton() {
    soundToggle.classList.toggle("is-muted", state.muted);
    soundToggle.textContent = state.muted ? "×" : "♪";
    soundToggle.setAttribute("aria-label", state.muted ? "Unmute sound" : "Mute sound");
    audio.muted = state.muted;
  }

  function updateFriendTimer(now = new Date()) {
    const timer = document.querySelector("[data-friend-timer]");
    if (!timer) return;
    const parts = calculateFriendship(timer.dataset.friendTimer, now);
    Object.entries(parts).forEach(([key, value]) => {
      const node = timer.querySelector(`[data-timer-value="${key}"]`);
      if (node) node.textContent = value;
    });
  }

  function calculateFriendship(startDate, now = new Date()) {
    const start = new Date(`${startDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || start > now) {
      return { years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
    }

    let cursor = new Date(start);
    let years = now.getFullYear() - start.getFullYear();
    cursor.setFullYear(start.getFullYear() + years);
    if (cursor > now) {
      years -= 1;
      cursor = new Date(start);
      cursor.setFullYear(start.getFullYear() + years);
    }

    let months = (now.getFullYear() - cursor.getFullYear()) * 12 + now.getMonth() - cursor.getMonth();
    const monthCursor = new Date(cursor);
    monthCursor.setMonth(cursor.getMonth() + months);
    if (monthCursor > now) {
      months -= 1;
    }
    cursor.setMonth(cursor.getMonth() + months);

    let diff = now - cursor;
    const days = Math.floor(diff / 86400000);
    diff -= days * 86400000;
    const hours = Math.floor(diff / 3600000);
    diff -= hours * 3600000;
    const minutes = Math.floor(diff / 60000);
    diff -= minutes * 60000;
    const seconds = Math.floor(diff / 1000);

    return { years, months, days, hours, minutes, seconds };
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-letter-text-close]") || event.target.matches("[data-letter-text-overlay]")) {
      closeLetterTextModal();
      return;
    }

    if (event.target.closest("[data-lightbox-close]") || event.target.matches("[data-lightbox-overlay]")) {
      closeLightbox();
      return;
    }

    if (event.target.closest("[data-lightbox-prev]")) {
      changeLightbox(-1);
      return;
    }

    if (event.target.closest("[data-lightbox-next]")) {
      changeLightbox(1);
      return;
    }

    if (state.lightbox && !event.target.closest(".lightbox-image")) {
      closeLightbox();
      return;
    }

    const lightboxButton = event.target.closest("[data-lightbox-context]");
    if (lightboxButton) {
      openLightbox(lightboxButton.dataset.lightboxContext, lightboxButton.dataset.lightboxIndex, lightboxButton.dataset.lightboxSrc);
      return;
    }

    const routeButton = event.target.closest("[data-route]");
    if (routeButton) {
      go(routeButton.dataset.route);
      return;
    }

    const letterButton = event.target.closest("[data-letter]");
    if (letterButton) {
      state.letterId = letterButton.dataset.letter;
      render();
      return;
    }

    const letterTextButton = event.target.closest("[data-open-letter-text]");
    if (letterTextButton) {
      const letter = data.letters.find((item) => item.id === letterTextButton.dataset.openLetterText);
      openLetterTextModal(letter);
      return;
    }

    if (event.target.closest("[data-garden-close]")) {
      state.gardenPerson = "";
      render();
      return;
    }

    const gardenButton = event.target.closest("[data-garden-person]");
    if (gardenButton) {
      state.gardenPerson = gardenButton.dataset.gardenPerson;
      render();
      return;
    }

    const friendButton = event.target.closest("[data-friend]");
    if (friendButton) {
      state.friendId = friendButton.dataset.friend;
      writeSessionValue("taani-active-friend", state.friendId);
      render();
      return;
    }

    const songButton = event.target.closest("[data-song-index]");
    if (songButton) {
      selectSong(Number(songButton.dataset.songIndex), true);
      return;
    }

    const playerButton = event.target.closest("[data-player]");
    if (playerButton) {
      const action = playerButton.dataset.player;
      if (action === "previous") selectSong(state.songIndex - 1, true);
      if (action === "next") selectSong(state.songIndex + 1, true);
      if (action === "play") playCurrentSong();
      if (action === "pause") pauseCurrentSong();
      return;
    }

    if (event.target.closest("[data-unlock-final-gift]")) {
      state.secretUnlocked = true;
      localStorage.setItem("taani-secret-unlocked", "true");
      render();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.querySelector("[data-letter-text-overlay]")) {
      closeLetterTextModal();
      return;
    }
    if (!state.lightbox) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") changeLightbox(-1);
    if (event.key === "ArrowRight") changeLightbox(1);
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-volume]")) {
      const volume = Number(event.target.value);
      audio.volume = volume;
    }

    if (event.target.matches("[data-progress]") && Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = (Number(event.target.value) / 100) * audio.duration;
    }
  });

  soundToggle.addEventListener("click", () => {
    state.muted = !state.muted;
    updateSoundButton();
  });

  audio.addEventListener("timeupdate", updatePlayerUi);
  audio.addEventListener("ended", () => selectSong(state.songIndex + 1, true));
  audio.addEventListener("error", () => {
    const song = data.playlist.songs[state.songIndex];
    playlistStatus = song ? `"${song.title}" could not be played from the local audio file.` : "Audio file missing.";
    updatePlayerUi();
  });

  function tick() {
    const now = new Date();
    updateClock(now);
    updateBirthdayUi(now);
    updateFriendTimer(now);
    updatePlayerUi();
  }

  function startAppTicker() {
    if (appIntervalId !== null) return;
    tick();
    appIntervalId = window.setInterval(tick, 1000);
  }

  function stopAppTicker() {
    if (appIntervalId === null) return;
    window.clearInterval(appIntervalId);
    appIntervalId = null;
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("beforeunload", stopAppTicker, { once: true });

  audio.volume = 0.75;
  render();
  startAppTicker();
})();
