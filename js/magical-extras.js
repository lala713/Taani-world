(function () {
  if (window.__TAANI_MAGICAL_EXTRAS_INIT__) return;
  window.__TAANI_MAGICAL_EXTRAS_INIT__ = true;

  const pageShell = document.getElementById("pageShell");
  const birthdayMonth = 6;
  const birthdayDay = 22;
  const birthYear = 2008;
  const sectionRoutes = ["friends", "letters", "reasons", "museum", "playlist", "gift"];
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const compactViewport = window.innerWidth <= 820;
  const lowMotionMode = reduceMotion || coarsePointer || compactViewport;

  const state = {
    visitedRoutes: [],
    mailboxUnread: false,
    stickers: [],
    stars: [],
    night: false,
    cakeCelebrated: false,
    starMessageShown: false,
    flowerWatered: false,
    ambience: { enabled: false, type: "birds", volume: 0.35 }
  };

  const stickerDefs = [
    { id: "cat", label: "Cat", route: "letters", x: 3, y: 36 },
    { id: "sunflower", label: "Sunflower", route: "reasons", x: 96, y: 42 },
    { id: "bee", label: "Bee", route: "museum", x: 3, y: 58 },
    { id: "strawberry", label: "Strawberry", route: "playlist", x: 96, y: 34 },
    { id: "teddy", label: "Teddy Bear", route: "friends", x: 3, y: 68 },
    { id: "butterfly", label: "Butterfly", route: "gift", x: 96, y: 48 }
  ];

  const flowers = [
    ["sunflower", "Sunflower", "Loyalty, happiness and warmth."],
    ["lily", "Lily", "Purity, friendship and kindness."],
    ["daisy", "Daisy", "Hope and new beginnings."],
    ["cherry", "Cherry Blossom", "Cherish every beautiful moment."]
  ];

  const openWhenLetters = {
    happy: "Open when you're happy.\n\nSave this feeling. You deserve every soft and bright moment that finds you.",
    sad: "Open when you're sad.\n\nYou do not have to be okay all at once. Let this little world sit with you for a while.",
    tired: "Open when you're tired.\n\nRest is not something you have to earn. Drink water, breathe, and be gentle with yourself.",
    angry: "Open when you're angry.\n\nYour feelings are allowed to exist. Take a minute, then come back to yourself slowly.",
    lonely: "Open when you're lonely.\n\nEven from far away, your friends are still here. You are not forgotten. You are loved."
  };

  const compliments = [
    "Today you're glowing.",
    "Certified birthday princess.",
    "You're loved more than you know.",
    "Looking adorable today.",
    "Your kindness makes everything warmer.",
    "You are someone's safest notification.",
    "Your laugh belongs in a memory jar.",
    "You make ordinary days feel special.",
    "You are enough exactly as you are.",
    "You make distance feel smaller."
  ];

  const tinyNotes = [
    "Drink water.",
    "Someone loves you more than you know.",
    "Go annoy someone.",
    "Hope you smiled today.",
    "Bestoe.",
    "Take a tiny break.",
    "Eat something nice.",
    "Be dramatic, but hydrate."
  ];

  const cloudLines = [
    "Cloud report: extra soft today.",
    "Tiny weather update: birthday magic.",
    "I saw Coco chasing butterflies.",
    "The village is saving a smile for you.",
    "No thoughts, only fluffy cloud."
  ];

  const cocoLines = ["Woof!", "I found you!", "Happy Birthday!", "Can I have snacks?", "I love Taani!"];

  const quizQuestions = [
    { question: "Favorite flower?", options: ["Sunflower", "Rose", "Tulip", "Lavender"], answer: "Sunflower" },
    { question: "Favorite artist from the playlist?", options: ["MAMAMOO", "John Mayer", "Adele", "Olivia Rodrigo"], answer: "MAMAMOO" },
    { question: "Favorite saying from Taani?", options: ["Bestoe", "Spreadsheet time", "Good morning", "Loading"], answer: "Bestoe" },
    { question: "Which friend added You're Gonna Live Forever in Me?", options: ["Seren", "Tannie", "Lala", "Izel"], answer: "Seren" }
  ];

  let lastRoute = null;
  let quizState = null;
  let ambience = null;
  let previousAudioVolume = null;

  function currentRoute() {
    const route = window.location.hash.replace("#", "").trim();
    if (!route || route === "home" || route === "welcome") return "map";
    return route;
  }

  function normalizeRoute(route) {
    return route === "home" || route === "welcome" ? "map" : route;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function init() {
    ensureRoot();
    enhanceRoute();
    observePageChanges();
    bindEvents();
  }

  function ensureRoot() {
    if (document.querySelector("[data-magical-root]")) return;
    const root = document.createElement("div");
    root.className = "magical-root";
    root.dataset.magicalRoot = "true";
    root.innerHTML = `
      <div class="magical-toast-stack" data-magical-toasts></div>
      <div class="magical-star-counter" data-star-counter>Stars Found 0 / 20</div>
      <div data-firefly-layer></div>
    `;
    document.body.appendChild(root);
  }

  function observePageChanges() {
    if (!pageShell) return;
    new MutationObserver(() => window.requestAnimationFrame(enhanceRoute)).observe(pageShell, { childList: true });
    window.addEventListener("hashchange", () => window.setTimeout(enhanceRoute, 90));
  }

  function enhanceRoute() {
    const route = currentRoute();
    document.body.classList.toggle("magical-map-route", route === "map");
    applyPageArrival();
    if (route !== lastRoute && route !== "map") state.mailboxUnread = true;
    lastRoute = route;
    markVisited(route);
    injectVillageProps(route);
    renderSticker(route);
    updateStarCounter();
    renderFireflies();
  }

  function applyPageArrival() {
    const page = document.querySelector(".chapter-page");
    if (!page || page.dataset.magicalFlipReady) return;
    page.dataset.magicalFlipReady = "true";
    page.classList.add("magical-page-flip");
    page.addEventListener("animationend", () => page.classList.remove("magical-page-flip"), { once: true });
    window.setTimeout(() => page.classList.remove("magical-page-flip"), 560);
  }

  function markVisited(route) {
    if (!sectionRoutes.includes(route) || state.visitedRoutes.includes(route)) return;
    state.visitedRoutes.push(route);
    refreshVillageProps();
    sparkleCake();
    if (state.visitedRoutes.length >= sectionRoutes.length && !state.cakeCelebrated) {
      state.cakeCelebrated = true;
      window.setTimeout(() => {
        if (!lowMotionMode) confetti();
        toast("All candles lit for Taani.");
      }, 450);
    }
  }

  function injectVillageProps(route) {
    if (route !== "map") return;
    const board = document.querySelector(".map-board");
    if (!board) return;
    let props = board.querySelector("[data-village-props]");
    if (!props) {
      props = document.createElement("div");
      props.className = "village-props";
      props.dataset.villageProps = "true";
      board.appendChild(props);
    }
    props.innerHTML = renderVillageProps();
  }

  function renderVillageProps() {
    const stats = birthdayStats();
    const candleHtml = sectionRoutes.map((route, index) => {
      const lit = index < state.visitedRoutes.length ? "lit" : "";
      return `<span class="village-candle ${lit}" title="${escapeHtml(route)}"></span>`;
    }).join("");
    return `
      <button class="village-prop prop-mailbox" type="button" data-open-mailbox aria-label="Birthday mailbox">
        <span></span>${state.mailboxUnread ? `<em>New Mail!</em>` : ""}
      </button>
      <button class="village-prop prop-jar" type="button" data-open-memory-jar aria-label="Memory jar"></button>
      <button class="village-prop prop-mirror" type="button" data-open-mirror aria-label="Magic mirror"></button>
      <button class="village-prop prop-camera" type="button" data-open-camera aria-label="Polaroid camera"></button>
      <button class="village-prop prop-quiz" type="button" data-open-quiz aria-label="Taani quiz"></button>
      <button class="village-prop prop-open-when" type="button" data-open-when aria-label="Open when letters"></button>
      <button class="village-prop prop-hug" type="button" data-open-hug aria-label="Need a hug"></button>
      <button class="village-prop prop-lantern-toggle" type="button" data-toggle-night aria-label="Toggle night lights"></button>
      <button class="village-prop prop-radio" type="button" data-open-ambience aria-label="Cozy ambience"></button>
      <div class="village-cake" aria-label="Birthday cake">${candleHtml}</div>
      <div class="village-sign village-birthday-counter">22 July<br>Turning ${stats.turningAge}<br>Next in ${stats.daysUntil} days</div>
      <div class="village-sign village-star-sign">Stars ${state.stars.length} / 20<br>Stickers ${state.stickers.length} / ${stickerDefs.length}</div>
      <div class="flower-language-patch">
        ${flowers.map(([id, name]) => `<button class="flower-meaning flower-${escapeHtml(id)}" type="button" data-flower="${escapeHtml(id)}" aria-label="${escapeHtml(name)}"></button>`).join("")}
      </div>
    `;
  }

  function refreshVillageProps() {
    if (currentRoute() !== "map") return;
    const props = document.querySelector("[data-village-props]");
    if (props) props.innerHTML = renderVillageProps();
  }

  function birthdayStats() {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let last = new Date(today.getFullYear(), birthdayMonth, birthdayDay);
    if (last > start) last = new Date(today.getFullYear() - 1, birthdayMonth, birthdayDay);
    let next = new Date(today.getFullYear(), birthdayMonth, birthdayDay);
    if (next < start) next = new Date(today.getFullYear() + 1, birthdayMonth, birthdayDay);
    const dayMs = 24 * 60 * 60 * 1000;
    return {
      daysSince: Math.floor((start - last) / dayMs),
      daysUntil: Math.ceil((next - start) / dayMs),
      turningAge: next.getFullYear() - birthYear
    };
  }

  function sparkleCake() {
    toast("A candle lit on the birthday cake.");
    const cake = document.querySelector(".village-cake");
    if (cake) {
      cake.classList.add("sparkling");
      window.setTimeout(() => cake.classList.remove("sparkling"), 900);
    }
  }

  function routeLabel(route) {
    const labels = {
      map: "Taani's World",
      friends: "Friends",
      letters: "Letters",
      reasons: "Love Garden",
      museum: "Memory Museum",
      playlist: "Playlist",
      gift: "Final Gift"
    };
    return labels[route] || route;
  }

  function openMailbox() {
    state.mailboxUnread = false;
    refreshVillageProps();
    openModal("Birthday Mailbox", `
      <div class="magical-envelope" aria-hidden="true"></div>
      <p class="magical-note">${escapeHtml(pick(friendNotes()))}</p>
    `);
  }

  function friendNotes() {
    const friends = window.TAANI_FRIENDS || [];
    return tinyNotes.concat(friends.flatMap((friend) => {
      const name = friend.displayName || "Friend";
      return [`${name}: Drink water.`, `${name}: I miss you.`, `${name}: Go annoy someone.`, `${name}: You are loved.`];
    }));
  }

  function openFlowerMeaning(id) {
    const flower = flowers.find((item) => item[0] === id);
    if (flower) openModal(flower[1], `<p class="magical-note">${escapeHtml(flower[2])}</p>`);
  }

  function waterFlower(button) {
    state.flowerWatered = true;
    button.classList.add("watered");
    toast("The flower bloomed for Taani.");
    spawnBloom(button);
  }

  function spawnBloom(button) {
    const bloom = document.createElement("span");
    bloom.className = "fresh-bloom";
    button.appendChild(bloom);
    window.setTimeout(() => bloom.remove(), 1600);
  }

  function openMirror() {
    openModal("Magic Mirror", `<p class="magical-note">${escapeHtml(pick(compliments))}</p>`);
  }

  function openMemoryJar() {
    openModal("Memory Jar", `<p class="magical-note">${escapeHtml(pick(memoryLines()))}</p>`);
  }

  function memoryLines() {
    const memories = (window.TAANI_MEMORIES || []).flatMap((folder) => (folder.memories || []).map((memory) => `${memory.title || "Memory"}: ${memory.description || memory.whyWeLoveIt || "A tiny saved memory."}`));
    return memories.concat(["Remember when a random conversation became lore?", "The first time we talked still matters.", "That one Discord call is stored safely in the jar."]);
  }

  function openCamera() {
    const photo = pick(memoryPhotos());
    const flash = document.createElement("div");
    flash.className = "camera-flash";
    document.body.appendChild(flash);
    window.setTimeout(() => flash.remove(), 480);
    if (!photo) {
      openModal("Polaroid Camera", `<p class="magical-note">Add memory pictures to develop a photo here.</p>`);
      return;
    }
    openModal("Polaroid Camera", `
      <figure class="polaroid-develop">
        <img src="${escapeHtml(photo.image)}" alt="${escapeHtml(photo.title)}" loading="lazy" decoding="async">
        <figcaption>${escapeHtml(photo.title)}</figcaption>
      </figure>
    `);
  }

  function memoryPhotos() {
    return (window.TAANI_MEMORIES || []).flatMap((folder) => (folder.memories || []).map((memory) => ({
      title: memory.title || folder.title || "Memory",
      image: memory.image
    }))).filter((memory) => memory.image);
  }

  function openQuiz() {
    quizState = { index: 0, score: 0 };
    renderQuiz();
  }

  function renderQuiz(feedback) {
    if (!quizState) return;
    if (quizState.index >= quizQuestions.length) {
      openModal("Quiz Complete", `<p class="magical-note">Score: ${quizState.score} / ${quizQuestions.length}</p><p>Every answer still leads to loving Taani.</p>`);
      return;
    }
    const question = quizQuestions[quizState.index];
    openModal("How Well Do You Know Taani?", `
      <p><strong>Question ${quizState.index + 1} / ${quizQuestions.length}</strong></p>
      <p>${escapeHtml(question.question)}</p>
      <div class="quiz-grid">
        ${question.options.map((option) => `<button class="magical-quiz-answer" type="button" data-quiz-answer="${escapeHtml(option)}">${escapeHtml(option)}</button>`).join("")}
      </div>
      ${feedback ? `<p class="magical-note">${escapeHtml(feedback)}</p>` : ""}
    `);
  }

  function answerQuiz(answer) {
    if (!quizState) return;
    const question = quizQuestions[quizState.index];
    const correct = answer === question.answer;
    if (correct) quizState.score += 1;
    quizState.index += 1;
    renderQuiz(correct ? "Correct." : `Not this time. Answer: ${question.answer}`);
  }

  function openOpenWhen() {
    const buttons = Object.keys(openWhenLetters).map((key) => `<button class="open-when-button" type="button" data-open-when-letter="${key}">Open when you're ${key}.</button>`).join("");
    openModal("Open When...", `<div class="open-when-grid">${buttons}</div><p class="magical-note open-when-message">Choose an envelope.</p>`);
  }

  function showOpenWhenLetter(key) {
    const target = document.querySelector(".open-when-message");
    if (target && openWhenLetters[key]) target.textContent = openWhenLetters[key];
  }

  function toggleNight() {
    state.night = !state.night;
    document.body.classList.toggle("magical-night", state.night);
    renderFireflies();
    refreshVillageProps();
    toast(state.night ? "Fireflies woke up." : "Morning light returned.");
  }

  function renderFireflies() {
    const layer = document.querySelector("[data-firefly-layer]");
    if (!layer) return;
    layer.innerHTML = "";
    if (!state.night) return;
    for (let i = 0; i < 8; i += 1) {
      const firefly = document.createElement("button");
      firefly.type = "button";
      firefly.className = "magical-firefly";
      firefly.dataset.firefly = "true";
      firefly.style.left = `${8 + Math.random() * 84}%`;
      firefly.style.top = `${14 + Math.random() * 70}%`;
      firefly.style.animationDelay = `${Math.random() * -6}s`;
      firefly.setAttribute("aria-label", "Catch a firefly");
      layer.appendChild(firefly);
    }
  }

  function openAmbience() {
    const choices = ["birds", "rain", "wind", "cafe", "forest"];
    openModal("Cozy Ambience", `
      <div class="ambience-grid">
        ${choices.map((choice) => `<button class="magical-button ambience-choice ${state.ambience.type === choice ? "active" : ""}" type="button" data-ambience-choice="${choice}">${escapeHtml(labelAmbience(choice))}</button>`).join("")}
      </div>
      <p>Status: ${state.ambience.enabled ? "On" : "Off"}</p>
      <input class="magical-volume" type="range" min="0" max="1" step="0.01" value="${state.ambience.volume}" data-ambience-volume aria-label="Ambience volume">
      <div class="magical-modal-actions">
        <button class="magical-button" type="button" data-ambience-toggle>${state.ambience.enabled ? "Turn Off" : "Turn On"}</button>
      </div>
    `);
  }

  function labelAmbience(choice) {
    return { birds: "Birds", rain: "Rain", wind: "Wind", cafe: "Cozy cafe", forest: "Forest" }[choice] || choice;
  }

  function chooseAmbience(choice) {
    state.ambience.type = choice;
    if (state.ambience.enabled) startAmbience();
    openAmbience();
  }

  function toggleAmbience() {
    state.ambience.enabled = !state.ambience.enabled;
    if (state.ambience.enabled) startAmbience();
    else stopAmbience();
    openAmbience();
  }

  function setAmbienceVolume(value) {
    state.ambience.volume = Number(value);
    if (ambience?.gain) ambience.gain.gain.value = state.ambience.volume * 0.08;
  }

  function startAmbience() {
    stopAmbience();
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const gain = context.createGain();
      gain.gain.value = state.ambience.volume * 0.08;
      gain.connect(context.destination);
      ambience = { context, gain, nodes: [], timer: null };
      if (state.ambience.type === "rain" || state.ambience.type === "wind") startNoiseAmbience(state.ambience.type);
      else startToneAmbience(state.ambience.type);
    } catch (error) {
      state.ambience.enabled = false;
      toast("Ambience could not start in this browser.");
    }
  }

  function startNoiseAmbience(type) {
    const { context, gain, nodes } = ambience;
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    source.buffer = buffer;
    source.loop = true;
    filter.type = type === "rain" ? "highpass" : "lowpass";
    filter.frequency.value = type === "rain" ? 900 : 380;
    source.connect(filter);
    filter.connect(gain);
    source.start();
    nodes.push(source, filter);
  }

  function startToneAmbience(type) {
    const { context, gain, nodes } = ambience;
    const base = { birds: 520, cafe: 160, forest: 260 }[type] || 260;
    const osc = context.createOscillator();
    const filterGain = context.createGain();
    osc.type = type === "cafe" ? "triangle" : "sine";
    osc.frequency.value = base;
    filterGain.gain.value = type === "cafe" ? 0.18 : 0.08;
    osc.connect(filterGain);
    filterGain.connect(gain);
    osc.start();
    nodes.push(osc, filterGain);
    ambience.timer = window.setInterval(() => chirp(type), type === "cafe" ? 4200 : 2600);
  }

  function chirp(type) {
    if (!ambience) return;
    const { context, gain } = ambience;
    const osc = context.createOscillator();
    const chirpGain = context.createGain();
    osc.type = "sine";
    osc.frequency.value = type === "forest" ? 680 + Math.random() * 180 : 920 + Math.random() * 260;
    chirpGain.gain.value = 0.16;
    osc.connect(chirpGain);
    chirpGain.connect(gain);
    osc.start();
    chirpGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
    osc.stop(context.currentTime + 0.2);
  }

  function stopAmbience() {
    if (!ambience) return;
    window.clearInterval(ambience.timer);
    ambience.nodes.forEach((node) => {
      try {
        if (node.stop) node.stop();
        if (node.disconnect) node.disconnect();
      } catch (error) {
        // Ignore already-stopped audio nodes.
      }
    });
    try {
      ambience.context.close();
    } catch (error) {
      // Ignore browsers that keep the context alive briefly.
    }
    ambience = null;
  }

  function openHug() {
    const audio = document.getElementById("songAudio");
    if (audio) {
      previousAudioVolume = audio.volume;
      audio.volume = Math.min(audio.volume, 0.22);
    }
    openModal("Need a Hug?", `
      <p class="magical-note">If I could, I'd hug you right now.

No matter what happens,
there will always be people who love you.

Take care of yourself.

You matter.</p>
    `, "hug");
  }

  function restoreAudioVolume() {
    const audio = document.getElementById("songAudio");
    if (audio && previousAudioVolume !== null) audio.volume = previousAudioVolume;
    previousAudioVolume = null;
  }

  function renderSticker(route) {
    document.querySelectorAll(".magical-sticker").forEach((node) => node.remove());
    const sticker = stickerDefs.find((item) => item.route === route && !state.stickers.includes(item.id));
    if (!sticker) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `magical-sticker sticker-${sticker.id}`;
    button.dataset.collectSticker = sticker.id;
    button.setAttribute("aria-label", `Collect ${sticker.label} sticker`);
    button.style.left = `${sticker.x}%`;
    button.style.top = `${sticker.y}%`;
    document.body.appendChild(button);
  }

  function collectSticker(id) {
    if (!id || state.stickers.includes(id)) return;
    state.stickers.push(id);
    document.querySelectorAll("[data-collect-sticker]").forEach((node) => {
      if (node.dataset.collectSticker === id) node.remove();
    });
    toast(`${labelForSticker(id)} sticker found.`);
    refreshVillageProps();
  }

  function labelForSticker(id) {
    const sticker = stickerDefs.find((item) => item.id === id);
    return sticker ? sticker.label : "Sticker";
  }

  function updateStarCounter() {
    const counter = document.querySelector("[data-star-counter]");
    if (counter) {
      counter.textContent = `Stars Found ${state.stars.length} / 20`;
      counter.style.display = currentRoute() === "map" ? "none" : "";
    }
    refreshVillageProps();
  }

  function clickCoco() {
    const coco = document.querySelector("[data-coco]");
    if (!coco) return;
    coco.classList.add("coco-happy");
    showCocoSpeech(pick(cocoLines));
    bark();
    window.setTimeout(() => coco.classList.remove("coco-happy"), 900);
  }

  function showCocoSpeech(text) {
    const coco = document.querySelector("[data-coco]");
    const board = document.querySelector(".map-board");
    if (!coco || !board) return;
    board.querySelector(".coco-speech")?.remove();
    const bubble = document.createElement("div");
    const cocoRect = coco.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    bubble.className = "coco-speech";
    bubble.textContent = text;
    bubble.style.left = `${Math.max(8, cocoRect.left - boardRect.left - 24)}px`;
    bubble.style.top = `${Math.max(8, cocoRect.top - boardRect.top - 42)}px`;
    board.appendChild(bubble);
    window.setTimeout(() => bubble.remove(), 1800);
  }

  function openFirefly(button) {
    button.remove();
    openModal("Firefly Glow", `<p class="magical-note">${escapeHtml(pick(compliments.concat(friendNotes(), memoryLines().slice(0, 12))))}</p>`);
  }

  function openCloud() {
    toast(pick(cloudLines));
  }

  function birdSing() {
    toast("The bird sings a tiny birthday song.");
    chirpSound(920);
  }

  function hiddenTeddy() {
    openModal("Hidden Teddy Bear", `<p class="magical-note">You found the teddy bear. It was guarding a tiny hug for Taani.</p>`);
  }

  function openModal(title, body, mode) {
    closeModal();
    const backdrop = document.createElement("div");
    backdrop.className = `magical-modal-backdrop ${mode || ""}`;
    backdrop.dataset.magicalModal = "true";
    backdrop.innerHTML = `
      <div class="magical-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <h2>${escapeHtml(title)}</h2>
        ${body}
        <div class="magical-modal-actions">
          <button class="magical-button" type="button" data-close-magical-modal>Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
  }

  function closeModal() {
    document.querySelector("[data-magical-modal]")?.remove();
    restoreAudioVolume();
  }

  function toast(message) {
    const stack = document.querySelector("[data-magical-toasts]");
    if (!stack) return;
    const note = document.createElement("div");
    note.className = "magical-toast";
    note.textContent = message;
    stack.appendChild(note);
    window.setTimeout(() => note.remove(), 2700);
  }

  function confetti() {
    for (let i = 0; i < 42; i += 1) {
      const piece = document.createElement("span");
      piece.className = "magical-confetti";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = pick(["var(--pink)", "var(--sun)", "var(--butter)", "var(--lily)", "var(--sky)"]);
      piece.style.animationDelay = `${Math.random() * 0.35}s`;
      document.body.appendChild(piece);
      window.setTimeout(() => piece.remove(), 2400);
    }
  }

  function bark() {
    chirpSound(240);
    window.setTimeout(() => chirpSound(300), 90);
  }

  function chirpSound(freq) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.value = 0.035;
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start();
      osc.stop(context.currentTime + 0.1);
      window.setTimeout(() => context.close(), 240);
    } catch (error) {
      // User gesture/audio restrictions are fine; visuals still work.
    }
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (target.closest("[data-coco]")) clickCoco();
      if (target.closest("[data-cloud-message]")) openCloud();
      if (target.closest("[data-bird]")) birdSing();
      if (target.closest("[data-hidden-teddy]")) hiddenTeddy();
      if (target.closest("[data-water-flower]")) waterFlower(target.closest("[data-water-flower]"));
      if (target.closest("[data-open-mailbox]")) openMailbox();
      if (target.closest("[data-open-memory-jar]")) openMemoryJar();
      if (target.closest("[data-open-mirror]")) openMirror();
      if (target.closest("[data-open-camera]")) openCamera();
      if (target.closest("[data-open-quiz]")) openQuiz();
      if (target.closest("[data-open-when]")) openOpenWhen();
      if (target.closest("[data-open-hug]")) openHug();
      if (target.closest("[data-toggle-night]")) toggleNight();
      if (target.closest("[data-open-ambience]")) openAmbience();
      if (target.closest("[data-flower]")) openFlowerMeaning(target.closest("[data-flower]").dataset.flower);
      if (target.closest("[data-collect-sticker]")) collectSticker(target.closest("[data-collect-sticker]").dataset.collectSticker);
      if (target.closest("[data-quiz-answer]")) answerQuiz(target.closest("[data-quiz-answer]").dataset.quizAnswer);
      if (target.closest("[data-open-when-letter]")) showOpenWhenLetter(target.closest("[data-open-when-letter]").dataset.openWhenLetter);
      if (target.closest("[data-ambience-choice]")) chooseAmbience(target.closest("[data-ambience-choice]").dataset.ambienceChoice);
      if (target.closest("[data-ambience-toggle]")) toggleAmbience();
      if (target.closest("[data-firefly]")) openFirefly(target.closest("[data-firefly]"));
      if (target.closest("[data-close-magical-modal]") || target.matches("[data-magical-modal]")) closeModal();
    });
    document.addEventListener("input", (event) => {
      if (event.target.matches("[data-ambience-volume]")) setAmbienceVolume(event.target.value);
    });
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
