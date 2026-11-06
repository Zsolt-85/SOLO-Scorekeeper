(function () {
  'use strict';

  const local = Store.createStore(window.localStorage);
  const adapter = window.Firebase && window.Firebase.configured() ? window.Firebase : null;
  const sync = Sync.create({ adapter: adapter, storage: window.localStorage });

  let space = null;
  let backend = local;

  const EMOJI = [
    '🐱', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸',
    '🐵', '🐔', '🐧', '🐦', '🦉', '🦄', '🐝', '🦋', '🐙', '🦑',
    '🐳', '🐬', '🐢', '🐍', '🦖', '🐓', '🦜', '🦩', '🐕', '🐈',
    '🐇', '🦔', '🐿️', '🦥', '🐁', '🦀', '🐠', '🦈', '🐊', '🐡'
  ];

  const ICONS = {
    pencil: { stroke: 2, paths: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>' },
    trash: { stroke: 2, paths: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>' },
    check: { stroke: 3, paths: '<path d="M20 6 9 17l-5-5"/>' },
    plus: { stroke: 2, paths: '<path d="M12 5v14"/><path d="M5 12h14"/>' },
    refresh: { stroke: 2, paths: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>' }
  };

  const ui = {
    addPanelOpen: false, addEmoji: EMOJI[0], addTarget: 'roster', addEditId: null,
    addError: '', addName: '', bannerDismissed: false, manageMode: false, pendingDelete: null,
    lobbyForm: null, lobbyName: '', lobbyCode: '', lobbyNote: '', busy: null,
    roundGameId: null, roundDraft: {}, refreshing: false, podiumPlayed: null,
    board: null, boardKey: null, boardName: '', boardEmoji: EMOJI[0], boardBusy: false,
    boardError: '', boardNotice: '', boardLoadError: '',
    showArchived: false, newGame: null, newGameError: '', newGameBusy: false,
    houseError: '', houseNotice: '', joinCode: '', joining: false, leaving: false,
    rosterFilter: ''
  };

  const views = {
    library: document.getElementById('view-library'),
    'new-game': document.getElementById('view-new-game'),
    box: document.getElementById('view-box'),
    play: document.getElementById('view-game'),
    podium: document.getElementById('view-podium'),
    rules: document.getElementById('view-rules'),
    friends: document.getElementById('view-friends'),
    community: document.getElementById('view-community'),
    leaderboard: document.getElementById('view-leaderboard'),
    players: document.getElementById('view-players')
  };
  const banner = document.getElementById('banner');

  // Last-resort visibility: an uncaught error used to leave a black page with
  // nothing to read. Show the stack in a fixed panel so the cause is visible.
  function showCrash(error) {
    const message = (error && (error.stack || error.message)) || String(error);
    let note = document.getElementById('crash-note');
    if (!note) {
      note = document.createElement('aside');
      note.id = 'crash-note';
      note.setAttribute('role', 'alert');
      note.style.cssText = 'position:fixed;left:10px;right:10px;bottom:10px;z-index:9999;'
        + 'max-height:45vh;overflow:auto;padding:10px;background:#3a0e0e;color:#ffd9d9;'
        + 'border:1px solid #ef7f6b;border-radius:10px;'
        + 'font:12px/1.4 ui-monospace,monospace;white-space:pre-wrap';
      (document.body || document.documentElement).appendChild(note);
    }
    note.textContent = message;
    if (window.console && console.error) console.error('[SCORELOCK] crashed:', error);
  }
  window.addEventListener('error', function (event) { showCrash(event.error || event.message); });
  window.addEventListener('unhandledrejection', function (event) { showCrash(event.reason); });

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function icon(name, size) {
    const spec = ICONS[name];
    return '<svg class="icon" viewBox="0 0 24 24" width="' + size + '" height="' + size
      + '" fill="none" stroke="currentColor" stroke-width="' + spec.stroke
      + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
      + spec.paths + '</svg>';
  }

  function currentRoute() {
    const hash = (location.hash || '#/library').replace(/^#\/?/, '');
    const parts = hash.split('/');
    return {
      name: parts[0] || 'library',
      id: parts[1] || null,
      tab: parts[2] || null
    };
  }

  function navigate(path) {
    const next = '#/' + path;
    if (location.hash === next) { render(); return; }
    location.hash = next;
  }

  function gameFor(id) {
    const game = id ? backend.getGame(id) : backend.getActiveGame();
    if (!game || game.finishedAt !== null) return null;
    return game;
  }

  function currentGameId() {
    const route = currentRoute();
    if (route.name !== 'play') return null;
    const game = gameFor(route.id);
    return game ? game.id : null;
  }

  function inLobby() {
    return space !== null;
  }

  function deviceId() {
    let id = null;
    try { id = window.localStorage.getItem('noting-more.device'); } catch (error) { id = null; }
    if (!id) {
      id = 'd' + Math.random().toString(36).slice(2, 10);
      try { window.localStorage.setItem('noting-more.device', id); } catch (error) { /* fine */ }
    }
    return id;
  }

  function chunkCode(code) {
    return String(code || '').replace(/(.{4})(?=.)/, '$1 ');
  }

  function typeForGame(game) {
    return game ? backend.getType(game.typeId) || null : null;
  }

  function gameName(game) {
    return game && game.typeName ? game.typeName : 'SOLO';
  }

  function ruleLabel(rules) {
    if (!rules) return '';
    return (rules.winner === 'highest' ? 'Highest wins' : 'Lowest wins')
      + ' · ' + (rules.end && rules.end.type === 'limit'
        ? 'To ' + rules.end.limit : 'Manual');
  }

  function ruleChips(type) {
    return '<span class="chip">' + (type.rules.winner === 'highest' ? 'Highest wins' : 'Lowest wins')
      + '</span><span class="chip">'
      + (type.rules.end.type === 'limit' ? 'To ' + type.rules.end.limit : 'Manual')
      + '</span>';
  }

  function coverHtml(type, extraClass) {
    if (!type) {
      return '<div class="cover cover-pips generic' + (extraClass ? ' ' + extraClass : '')
        + '"><span class="cover-face" aria-hidden="true">🎲</span>'
        + '<span class="cover-label">A game</span></div>';
    }
    return '<div class="cover cover-' + escapeHtml(type.pattern) + (extraClass ? ' ' + extraClass : '')
      + '" style="--cover:' + escapeHtml(type.colour) + '">'
      + '<span class="cover-face" aria-hidden="true">' + escapeHtml(type.emoji) + '</span>'
      + '<span class="cover-label">' + escapeHtml(type.name) + '</span></div>';
  }

  // Best-effort: registering a name and freezing a finished game. Failures land in
  // Sync's outbox, so a finish is never blocked by the network.
  function publishFinished(mode, players, games) {
    const origin = mode === 'lobby' && space ? space.status().code : '';
    (games || []).forEach(function (game) {
      const gameId = game.typeId || (game.lowerWins === false ? 'uno' : 'solo');
      (game.seats || []).forEach(function (seat) {
        if (!seat || !seat.name) return;
        sync.register(seat.name, seat.emoji, { game: gameId }).catch(function () {});
      });
      const result = Leaderboard.resultFor(game, {
        mode: mode,
        origin: origin,
        lowerWins: game && typeof game.lowerWins === 'boolean' ? game.lowerWins : true
      });
      if (result) sync.publish(result).catch(function () {});
    });
    sync.flush();
  }

  function backfillSolo() {
    const state = local.getState();
    publishFinished('solo', state.players, state.games.filter(function (game) {
      return game.finishedAt !== null && game.finishedAt !== undefined;
    }));
  }

  // A lobby's finished games can arrive one at a time (another phone ends a game),
  // so publish whenever the connected player or game count changes. The published
  // and registered sets make repeats free.
  function watchLobbyBackfill() {
    let seenGames = -1;
    let seenPlayers = -1;
    let seenReady = false;
    function check() {
      if (!space) return;
      const status = space.status();
      if (!status.connected) return;
      const state = space.getState();
      const games = space.finishedGames();
      if (seenReady && games.length === seenGames && state.players.length === seenPlayers) return;
      seenReady = true;
      seenGames = games.length;
      seenPlayers = state.players.length;
      publishFinished('lobby', state.players, games);
    }
    space.whenReady(check);
    space.subscribe(check);
  }

  function enterLobby(code, name, type) {
    if (space) space.leave();
    space = Space.create({
      adapter: adapter,
      code: code,
      name: name,
      type: type || local.getActiveType(),
      deviceId: deviceId()
    });
    backend = space;
    space.subscribe(function () {
      if (!space) return;
      const status = space.status();
      const remembered = local.getState().lobby;
      if (status.tableReady && status.game) {
        if (status.game !== (remembered && remembered.typeId)) {
          const localType = local.getType(status.game);
          local.setLobby({
            code: status.code,
            name: status.name || (remembered && remembered.name) || '',
            joinedAt: remembered && remembered.joinedAt,
            typeId: status.game
          });
          if (localType && !localType.archived) local.setActiveType(status.game);
        }
        if (ui.joining) {
          ui.joining = false;
          navigate('box/' + status.game);
          return;
        }
      }
      render();
    });
    watchLobbyBackfill();
    render();
  }

  function freshCode(attempts) {
    const left = attempts === undefined ? 5 : attempts;
    const code = Space.newCode();
    return adapter.spaceExists(code).then(function (taken) {
      if (!taken) return code;
      if (left <= 0) throw new Error('Could not find a free lobby code. Please try again.');
      return freshCode(left - 1);
    });
  }

  // A short confirmation ("Code copied.") that takes itself away again, without a
  // full re-render: that would steal the focus from whatever is half-typed.
  let noteTimer = null;
  function flashNote(text) {
    if (noteTimer) { clearTimeout(noteTimer); noteTimer = null; }
    ui.lobbyNote = text;
    render();
    noteTimer = setTimeout(function () {
      noteTimer = null;
      if (ui.lobbyNote !== text) return;
      ui.lobbyNote = '';
      const note = document.querySelector('.lobby-note');
      if (note && note.parentNode) note.parentNode.removeChild(note);
    }, 3000);
  }

  // One tap: the code is the whole setup, so there is nothing to fill in first.
  function createLobby(typeId) {
    if (ui.busy || !adapter) return;
    const type = local.getType(typeId) || local.getActiveType();
    if (!type || !type.builtin) {
      ui.addError = 'Live tables are available for SOLO and UNO in this release.';
      render();
      return;
    }
    ui.busy = 'create';
    ui.lobbyNote = '';
    ui.addError = '';
    render();
    function attempt(left) {
      freshCode().then(function (code) {
        return adapter.createSpace(code, '').then(function () {
          local.setLobby({ code: code, name: '', joinedAt: Date.now(), typeId: type.id });
          ui.busy = null;
          ui.lobbyNote = 'Send the code to the other phone.';
          enterLobby(code, '', type);
          if (space) space.initTable();
          navigate('box/' + type.id);
        }, function (error) {
          if (error && error.code === 'already-exists' && left > 1) { attempt(left - 1); return; }
          throw error;
        });
      }).catch(function (error) {
        ui.busy = null;
        ui.addError = (error && error.message) || 'The lobby could not be created.';
        render();
      });
    }
    attempt(3);
  }

  function copyCode() {
    const code = space.status().code;
    const done = function () { flashNote('Code copied.'); };
    const failed = function () { flashNote('Copying is blocked here — type the code in by hand.'); };
    try {
      const clip = navigator.clipboard;
      if (!clip || !clip.writeText) { failed(); return; }
      clip.writeText(code).then(done, failed);
    } catch (error) {
      failed();
    }
  }

  const SHELL = [
    './', 'styles.css', 'js/ranking.js', 'js/library.js', 'js/model.js', 'js/leaderboard.js',
    'js/store.js', 'js/space.js', 'js/firebase-config.js', 'js/firebase.js',
    'js/sync.js', 'js/reveal.js', 'js/ui.js'
  ];

  // A normal reload can still be served from the browser's copy for up to ten
  // minutes (GitHub Pages caches that long). Fetching every shell file with
  // cache: 'reload' replaces those cached copies first, so the reload afterwards
  // really does run the newest build.
  function revalidateShell() {
    if (!window.fetch) return Promise.resolve();
    return Promise.all(SHELL.map(function (path) {
      return fetch(new URL(path, location.href).href, { cache: 'reload', credentials: 'same-origin' })
        .catch(function () { return null; });
    }));
  }

  function refreshApp() {
    if (ui.refreshing) return;
    const typed = Object.keys(ui.roundDraft).some(function (id) {
      return String(ui.roundDraft[id] || '').trim() !== '';
    });
    if (typed && !window.confirm('There are points typed for this round that are not saved yet. Refresh anyway?')) return;
    ui.refreshing = true;
    document.querySelectorAll('[data-action="refresh-app"]').forEach(function (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    });
    // Let any lobby write reach the server before tearing the page down.
    const idle = space && space.whenIdle ? space.whenIdle(4000) : Promise.resolve(true);
    idle.catch(function () { return false; })
      .then(revalidateShell)
      .catch(function () { return null; })
      .then(function () { location.reload(); });
  }

  function joinLobby(input) {
    if (ui.busy) return;
    const code = Space.normalizeCode(input);
    if (!Space.validCode(code)) {
      ui.addError = 'A lobby code is 8 characters, using letters and numbers.';
      render();
      return;
    }
    if (!canLeaveTable('another table')) return;
    if (space) leaveLobby();
    ui.busy = 'join';
    ui.addError = '';
    ui.joining = true;
    render();
    adapter.spaceExists(code).then(function (exists) {
      ui.busy = null;
      if (!exists) {
        ui.joining = false;
        ui.addError = 'No lobby found for that code.';
        render();
        focusById('lobby-code');
        return;
      }
      local.setLobby({ code: code, name: '', joinedAt: Date.now(), typeId: null });
      ui.lobbyForm = null;
      ui.lobbyNote = '';
      enterLobby(code, '', local.getActiveType());
      navigate('library');
    }).catch(function (error) {
      ui.busy = null;
      ui.joining = false;
      ui.addError = (error && error.message) || 'The lobby could not be reached.';
      render();
      focusById('lobby-code');
    });
  }

  function leaveLobby() {
    if (space) space.leave();
    if (noteTimer) { clearTimeout(noteTimer); noteTimer = null; }
    space = null;
    backend = local;
    local.setLobby(null);
    ui.lobbyForm = null;
    ui.lobbyName = '';
    ui.lobbyCode = '';
    ui.lobbyNote = '';
    ui.busy = null;
    ui.joining = false;
    navigate('library');
  }

  function refreshBanner() {
    if (ui.bannerDismissed || !backend.isDegraded()) {
      banner.hidden = true;
      banner.textContent = '';
      return;
    }
    const message = backend.degradedReason() === 'blocked'
      ? 'This browser is blocking storage, so scores will be lost when you close the tab.'
      : 'Scores could not be saved to this browser and may not persist.';
    banner.innerHTML = '<span>' + escapeHtml(message) + '</span>'
      + '<button type="button" class="banner-dismiss" data-action="dismiss-banner" aria-label="Dismiss">Dismiss</button>';
    banner.hidden = false;
  }

  function lastPlayedFor(typeId) {
    let newest = 0;
    backend.finishedGames().forEach(function (game) {
      if (game.typeId === typeId && game.finishedAt > newest) newest = game.finishedAt;
    });
    backend.activeGames().forEach(function (game) {
      if (game.typeId === typeId && game.startedAt > newest) newest = game.startedAt;
    });
    return newest;
  }

  function finishedCountFor(typeId) {
    return backend.finishedGames().filter(function (game) {
      return game.typeId === typeId;
    }).length;
  }

  function shelfOrder(library) {
    return library.slice().sort(function (a, b) {
      const played = lastPlayedFor(b.id) - lastPlayedFor(a.id);
      if (played !== 0) return played;
      const builtin = (a.builtin ? 0 : 1) - (b.builtin ? 0 : 1);
      if (builtin !== 0) return builtin;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  function render() {
    try {
    const route = currentRoute();
    if (route.name === 'home') { navigate('library'); return; }
    if (route.name === 'history') {
      const active = backend.getActiveType();
      navigate('box/' + (active ? active.id : 'solo') + '/log');
      return;
    }
    if (route.name === 'game' && route.id) { navigate('play/' + route.id); return; }
    if (route.name === 'new-game' && space) { navigate('library'); return; }
    if (route.name === 'box') {
      const type = route.id ? backend.getType(route.id) : null;
      if (!type) { navigate('library'); return; }
      if (space && space.status().game !== type.id) { navigate('library'); return; }
      if (route.tab === 'rules' && type.archived) { navigate('box/' + type.id + '/hall'); return; }
    }
    if (route.name === 'play' && !gameFor(route.id)) {
      if (backend.getGame(route.id)) { navigate('podium/' + route.id); return; }
      navigate('library');
      return;
    }
    if (route.name === 'podium') {
      const target = route.id ? backend.getGame(route.id) : backend.finishedGames()[0];
      if (!target) { navigate('library'); return; }
    }
    Object.keys(views).forEach(function (name) {
      views[name].hidden = name !== route.name;
    });
    const routeKey = window.location.hash || '#/library';
    if (ui.lastRouteKey !== routeKey) {
      ui.lastRouteKey = routeKey;
      // Browser scroll restoration would re-scroll to the saved position
      // even after a reload — take manual control so every route change
      // (and initial load) starts at the top.
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      window.scrollTo(0, 0);
    }
    if (route.name === 'library') views.library.innerHTML = renderLibrary();
    if (route.name === 'new-game') views['new-game'].innerHTML = renderNewGame();
    if (route.name === 'leaderboard') views.leaderboard.innerHTML = renderLeaderboard(route.id);
    if (route.name === 'players') views.players.innerHTML = renderPlayers();
    if (route.name === 'box') views.box.innerHTML = renderBox(route.id, route.tab || 'table');
    if (route.name === 'play') views.play.innerHTML = renderGame(route.id);
    if (route.name === 'podium') {
      const key = 'podium/' + (route.id || 'latest');
      const settled = ui.podiumPlayed === key;
      views.podium.innerHTML = renderPodium(route.id, settled);
      if (!settled) { ui.podiumPlayed = key; Reveal.playPodium(views.podium); }
    } else {
      ui.podiumPlayed = null;
    }
    if (route.name === 'rules') views.rules.innerHTML = renderRules();
    if (route.name === 'friends') views.friends.innerHTML = renderFriends();
    if (route.name === 'community') views.community.innerHTML = renderCommunity();
    if (route.name === 'box' && (route.tab || 'table') === 'hall') {
      const key = 'box/' + route.id;
      if (ui.boardKey !== key) { ui.boardKey = key; loadBoard(); }
    } else if (route.name === 'box' && (route.tab || 'table') === 'table') {
      // The merged roster mixes in the online pool, so the Table tab must
      // fetch like the other pages — otherwise fresh sessions show only locals.
      const key = 'box-table/' + route.id;
      if (ui.boardKey !== key) { ui.boardKey = key; loadBoard(); }
    } else if (route.name === 'leaderboard' || route.name === 'players') {
      // One fetch per visit; both pages render from the same loaded board.
      if (ui.boardKey !== 'board') { ui.boardKey = 'board'; loadBoard(); }
    } else {
      ui.boardKey = null;
    }
    refreshBanner();
    } catch (error) {
      // Even if some handler somewhere swallows this, the screen reports it.
      showCrash(error);
      throw error;
    }
  }

  function lowerWins() {
    return backend.getSettings().lowerWins;
  }

  function tagline() {
    return lowerWins()
      ? 'House rules · fewest points wins'
      : 'Standard scoring · most points wins';
  }

  // "Win 2 · Lose 1" on the card, once there is anything to show.
  function recordHtml(player, type) {
    const games = backend.finishedGames().filter(function (game) {
      return game.typeId === type.id;
    });
    const record = Ranking.record(games, player, type.rules.winner === 'lowest');
    if (record.wins + record.losses === 0) return '';
    return '<span class="rec">Win ' + record.wins + ' &middot; Lose ' + record.losses + '</span>';
  }

  function cardHtml(player, seated, type) {
    const selected = seated.indexOf(player.id) !== -1;
    const name = escapeHtml(player.name);
    const record = recordHtml(player, type);
    const body = '<span class="disc" aria-hidden="true">' + escapeHtml(player.emoji) + '</span>'
      + (selected ? '<span class="tick" aria-hidden="true">' + icon('check', 13) + '</span>' : '')
      + '<span class="nm">' + name + '</span>'
      + '<span class="st">' + (selected ? 'playing' : (ui.manageMode ? 'not playing' : 'tap to add')) + '</span>'
      + record;
    const classes = 'pcard' + (selected ? ' on' : '') + (record ? ' has-record' : '');
    const filter = Leaderboard.normalise(ui.rosterFilter || '');
    const hidden = filter !== ''
      && Leaderboard.normalise(player.name).indexOf(filter) === -1;

    if (!ui.manageMode) {
      return '<article class="' + classes + '" style="--pc:' + escapeHtml(player.color) + '"'
        + (hidden ? ' hidden' : '') + '>'
        + '<button type="button" class="pcard-body" data-action="toggle-seat" data-id="' + player.id
        + '" data-name="' + name + '" data-emoji="' + escapeHtml(player.emoji)
        + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' + body + '</button></article>';
    }

    const confirming = ui.pendingDelete === player.id;
    const tools = confirming
      ? '<div class="tools">'
        + '<button type="button" data-action="cancel-delete" aria-label="Cancel deleting ' + name + '">Cancel</button>'
        + '<button type="button" class="del solid" data-action="confirm-delete" data-id="' + player.id
        + '" aria-label="Yes, delete ' + name + '">Delete</button></div>'
      : '<div class="tools">'
        + '<button type="button" data-action="edit-player" data-id="' + player.id
        + '" aria-label="Edit ' + name + '" title="Edit">' + icon('pencil', 16) + '</button>'
        + '<button type="button" class="del" data-action="ask-delete" data-id="' + player.id
        + '" aria-label="Delete ' + name + '" title="Delete">' + icon('trash', 16) + '</button></div>';
    return '<article class="' + classes + (confirming ? ' confirming' : '') + '" style="--pc:'
      + escapeHtml(player.color) + '"><span class="pcard-body static">' + body + '</span>' + tools + '</article>';
  }

  function libraryHeader() {
    const table = space ? space.status() : null;
    return '<header class="topbar library-topbar"><div>'
      + '<h1 class="wordmark">SCORELOCK</h1>'
      + '<p class="tagline">' + (table
        ? escapeHtml(table.name || 'Live table') + ' · ' + codeChip(table.code)
        : 'Pick a game from the shelf') + '</p></div>'
      + '<nav class="topbar-links">'
      + '<a class="btn ghost" href="#/library">Library</a>'
      + '<a class="btn ghost" href="#/rules">How to play</a>'
      + '<button type="button" class="btn ghost" data-action="open-join">Join</button>'
      + refreshBtn() + '</nav></header>';
  }

  function canLeaveTable(nextLabel) {
    if (!space) return true;
    return window.confirm('Leave the live table' + (nextLabel ? ' and open ' + nextLabel : '')
      + '? The table stays online; you can rejoin with its code.');
  }

  function openBox(id) {
    const table = space ? space.status() : null;
    if (table && table.game !== id && !canLeaveTable('another game')) return;
    if (table && table.game !== id) leaveLobby();
    navigate('box/' + id);
  }

  function newGameDraft() {
    if (!ui.newGame) {
      ui.newGame = {
        name: '', emoji: '🃏', colour: '#f0b429', pattern: 'pips',
        winner: 'lowest', end: 'manual', limit: '500'
      };
    }
    return ui.newGame;
  }

  function renderLibrary() {
    const state = backend.getState();
    const all = backend.getLibrary();
    const visible = shelfOrder(all.filter(function (type) { return !type.archived; }));
    const hidden = all.filter(function (type) { return type.archived; });
    const active = backend.activeGames()
      .slice()
      .sort(function (a, b) { return (b.startedAt || 0) - (a.startedAt || 0); })[0] || null;
    const table = space ? space.status() : null;
    const tableType = table ? (space.getType(table.game) || space.getActiveType()) : null;
    let html = libraryHeader();

    if (table && !table.tableReady) {
      html += '<section class="hero joining"><p class="label">Joining live table</p>'
        + codeChip(table.code) + '<p class="hint">Waiting for the table&rsquo;s game&hellip;</p></section>';
    } else if (table) {
      html += '<section class="hero"><div>' + coverHtml(tableType, 'hero-cover')
        + '</div><div class="hero-copy"><p class="label">Live table</p>'
        + '<h2>' + escapeHtml(tableType ? tableType.name : 'Shared game') + '</h2>'
        + '<p class="hint">' + codeChip(table.code) + ' · ' + table.online + ' here</p>'
        + '<button type="button" class="btn primary" data-action="open-box" data-id="'
        + escapeHtml(table.game) + '">Resume table</button></div></section>';
    } else if (active) {
      const type = typeForGame(active);
      html += '<section class="hero"><div>' + coverHtml(type, 'hero-cover')
        + '</div><div class="hero-copy"><p class="label">Continue</p>'
        + '<h2>' + escapeHtml(gameName(active)) + '</h2>'
        + '<p class="hint">Round ' + (active.rounds.length + 1) + ' · '
        + escapeHtml(active.seats.map(function (seat) { return seat.name; }).join(' · ')) + '</p>'
        + '<button type="button" class="btn primary" data-action="resume-game" data-id="'
        + escapeHtml(active.id) + '">Resume game</button></div></section>';
    } else {
      const type = backend.getActiveType();
      html += '<section class="hero quiet"><div>' + coverHtml(type, 'hero-cover')
        + '</div><div class="hero-copy"><p class="label">Ready when you are</p>'
        + '<h2>Open a game to start</h2><p class="hint">Pick any game on the shelf below, or start a table from its page.</p></div></section>';
    }

    html += '<section class="section"><div class="section-head"><h2>Shelf</h2>'
      + '<button type="button" class="btn ghost" data-action="open-new-game">Add a game</button></div>'
      + '<div class="shelf">' + visible.map(function (type) {
        const count = finishedCountFor(type.id);
        const live = space && space.status().game === type.id;
        const playing = backend.activeGames().some(function (game) {
          return game.typeId === type.id;
        });
        return '<button type="button" class="box-card" data-action="open-box" data-id="'
          + escapeHtml(type.id) + '" aria-label="Open ' + escapeHtml(type.name) + '">'
          + coverHtml(type)
          + '<span class="box-chips">' + ruleChips(type) + '</span>'
          + '<span class="box-meta">' + count + ' finished'
          + (live ? ' · live' : (playing ? ' · playing' : '')) + '</span></button>';
      }).join('') + '<button type="button" class="box-card add-box" data-action="open-new-game">'
      + '<span class="add-face" aria-hidden="true">' + icon('plus', 28) + '</span>'
      + '<span class="box-meta">Add a game</span></button></div></section>';

    if (hidden.length) {
      html += '<section class="section"><button type="button" class="btn ghost" data-action="toggle-archived" aria-expanded="'
        + (ui.showArchived ? 'true' : 'false') + '">' + (ui.showArchived ? 'Hide hidden games' : 'Hidden games (' + hidden.length + ')')
        + '</button>';
      if (ui.showArchived) {
        html += '<ul class="archive-list">' + hidden.map(function (type) {
          return '<li><span>' + escapeHtml(type.name) + '</span>'
            + (space ? '' : '<button type="button" class="btn ghost" data-action="restore-type" data-id="'
              + escapeHtml(type.id) + '">Restore</button>') + '</li>';
        }).join('') + '</ul>';
      }
      html += '</section>';
    }

    if (ui.lobbyForm === 'join') html += joinSheetHtml();
    if (ui.addError) html += '<p class="error">' + escapeHtml(ui.addError) + '</p>';
    return html;
  }

  function renderFriends() {
    const people = {};
    (backend.finishedGames() || []).forEach(function (game) {
      (game.seats || []).forEach(function (seat) {
        if (!seat || !seat.name) return;
        const row = people[seat.name] || {
          name: seat.name, emoji: seat.emoji, games: 0, last: 0, typeId: 'solo'
        };
        row.games += 1;
        if ((game.startedAt || 0) >= row.last) {
          row.last = game.startedAt || 0;
          row.typeId = game.typeId || row.typeId;
          if (seat.emoji) row.emoji = seat.emoji;
        }
        people[seat.name] = row;
      });
    });
    const players = Object.keys(people).map(function (name) { return people[name]; })
      .sort(function (a, b) { return b.games - a.games || b.last - a.last; });
    let html = '<header class="topbar library-topbar"><div><h1 class="wordmark">SCORELOCK</h1>'
      + '<p class="tagline">Friends &mdash; everyone at your tables</p></div></header>';
    html += '<section class="section"><div class="section-head"><h2>Players</h2></div>';
    if (!players.length) {
      html += '<p class="hint">No players yet &mdash; open a game and start a table. Every seat joins your circle.</p>';
    } else {
      html += '<div class="player-pool">' + players.map(function (player) {
        return '<button type="button" class="player-tile" data-action="open-box" data-id="'
          + escapeHtml(player.typeId) + '">'
          + '<span class="tile-avatar" aria-hidden="true">' + escapeHtml(player.emoji || '&#127922;') + '</span>'
          + '<strong class="tile-name">' + escapeHtml(player.name) + '</strong>'
          + '<span class="tile-stats">' + player.games + ' game' + (player.games === 1 ? '' : 's') + '</span>'
          + '</button>';
      }).join('') + '</div>';
    }
    html += '</section>';
    return html;
  }

  function renderCommunity() {
    const visible = shelfOrder((backend.getLibrary() || [])
      .filter(function (type) { return !type.archived; }));
    const finished = backend.finishedGames() || [];
    const plays = {};
    finished.forEach(function (game) {
      plays[game.typeId] = (plays[game.typeId] || 0) + 1;
    });
    const popular = Object.keys(plays).sort(function (a, b) {
      return plays[b] - plays[a];
    })[0] || null;
    let html = '<header class="topbar library-topbar"><div><h1 class="wordmark">SCORELOCK</h1>'
      + '<p class="tagline">Community &mdash; discover games</p></div></header>';
    html += '<section class="section"><div class="section-head"><h2>Discover</h2>'
      + '<button type="button" class="btn ghost" data-action="open-new-game">Add a game</button></div>';
    if (!visible.length) {
      html += '<p class="hint">Nothing to discover yet &mdash; add a game from the shelf.</p>';
    } else {
      if (finished.length) {
        html += '<p class="hint">Most played around here: <strong>'
          + escapeHtml((backend.getType(popular) || { name: '?' }).name)
          + '</strong> with ' + plays[popular] + ' finished game' + (plays[popular] === 1 ? '' : 's') + '.</p>';
      }
      html += '<div class="shelf">' + visible.map(function (type) {
        const count = finishedCountFor(type.id);
        return '<button type="button" class="box-card" data-action="open-box" data-id="'
          + escapeHtml(type.id) + '" aria-label="Open ' + escapeHtml(type.name) + '">'
          + coverHtml(type)
          + '<span class="box-chips">' + ruleChips(type) + '</span>'
          + '<span class="box-meta">' + count + ' finished'
          + (type.id === popular ? ' &middot; most played' : '') + '</span></button>';
      }).join('') + '</div>';
    }
    html += '</section>';
    return html;
  }

  function renderNewGame() {
    const draft = newGameDraft();
    let html = '<header class="topbar library-topbar"><div><h1 class="wordmark">New game</h1>'
      + '<p class="tagline">Make it yours</p></div>'
      + '<nav class="topbar-links"><a class="btn ghost" href="#/library">Back</a></nav></header>'
      + '<form id="new-game-form" class="panel new-game">';
    html += '<p class="label">Presets</p><div class="row">'
      + (window.Library ? window.Library.PRESETS.map(function (preset) {
        return '<button type="button" class="btn ghost preset-chip" data-action="new-game-preset" data-preset="'
          + preset.id + '">' + preset.label + '</button>';
      }).join('') : '') + '</div>';
    html += '<label class="label" for="game-name">Name</label>'
      + '<input id="game-name" class="input" maxlength="24" required value="' + escapeHtml(draft.name) + '">';
    html += '<p class="label">Emoji</p><div class="emoji-grid" role="group" aria-label="Game emoji">'
      + EMOJI.map(function (face) {
        return '<button type="button" class="emoji" data-action="new-game-emoji" data-emoji="' + face
          + '" aria-pressed="' + (face === draft.emoji ? 'true' : 'false') + '">' + face + '</button>';
      }).join('') + '</div>';
    html += '<p class="label">Colour</p><div class="swatches">'
      + (window.Library ? window.Library.PALETTE.map(function (colour) {
        return '<button type="button" class="swatch" style="--swatch:' + colour
          + '" data-action="new-game-colour" data-colour="' + colour
          + '" aria-pressed="' + (colour === draft.colour ? 'true' : 'false') + '" aria-label="Colour ' + colour + '"></button>';
      }).join('') : '') + '</div>';
    html += '<p class="label">Cover pattern</p><div class="patterns">'
      + (window.Library ? window.Library.PATTERNS.map(function (pattern) {
        return '<button type="button" class="pattern-chip cover-' + pattern
          + '" data-action="new-game-pattern" data-pattern="' + pattern
          + '" aria-pressed="' + (pattern === draft.pattern ? 'true' : 'false') + '"><span>' + pattern + '</span></button>';
      }).join('') : '') + '</div>';
    html += '<fieldset class="rules-field"><legend>Winner</legend>'
      + '<label><input type="radio" name="winner" value="lowest"'
      + (draft.winner === 'lowest' ? ' checked' : '') + '> Lowest total wins</label>'
      + '<label><input type="radio" name="winner" value="highest"'
      + (draft.winner === 'highest' ? ' checked' : '') + '> Highest total wins</label></fieldset>';
    html += '<fieldset class="rules-field"><legend>End</legend>'
      + '<label><input type="radio" name="end" value="manual"'
      + (draft.end === 'manual' ? ' checked' : '') + '> Manual</label>'
      + '<label><input type="radio" name="end" value="limit"'
      + (draft.end === 'limit' ? ' checked' : '') + '> At a score limit</label>'
      + '<label for="game-limit">Limit</label>'
      + '<input id="game-limit" class="input" inputmode="numeric" pattern="[0-9]*" value="'
      + escapeHtml(draft.limit) + '"' + (draft.end === 'limit' ? '' : ' disabled') + '></label></fieldset>';
    if (ui.newGameError) html += '<p class="error">' + escapeHtml(ui.newGameError) + '</p>';
    html += '<div class="row"><button type="submit" class="btn primary"'
      + (ui.newGameBusy ? ' disabled aria-busy="true"' : '') + '>Save game</button>'
      + '<a class="btn ghost" href="#/library">Cancel</a></div></form>';
    return html;
  }

  function renderBox(id, tab) {
    const type = backend.getType(id);
    if (!type) { navigate('library'); return ''; }
    if (!space && !type.archived && backend.getState().activeType !== type.id) {
      backend.setActiveType(type.id);
    }
    const effectiveTab = ['table', 'hall', 'log', 'rules'].indexOf(tab) === -1 ? 'table' : tab;
    const live = space && space.status().game === type.id && space.status().tableReady;
    const active = backend.activeGames().filter(function (game) {
      return game.typeId === type.id;
    });
    let html = '<header class="topbar box-topbar"><div>'
      + '<a class="btn ghost" href="#/library">Library</a>'
      + '<h1 class="wordmark">' + escapeHtml(type.name) + '</h1></div>'
      + '<nav class="topbar-links">'
      + (live ? '<span class="live-badge">Live</span>' : '')
      + refreshBtn()
      + '<a class="btn ghost" href="#/box/' + escapeHtml(type.id) + '/rules" aria-label="House rules">House rules</a>'
      + '</nav></header>';

    html += '<section class="box-hero">' + coverHtml(type, 'box-cover')
      + '<div class="box-copy"><h2>' + escapeHtml(type.name) + '</h2>'
      + '<p class="box-chips">' + ruleChips(type) + '</p>'
      + (type.archived
        ? '<p class="hint">This game is archived. Its Hall and Log are read-only.</p>'
          + '<button type="button" class="btn primary" data-action="restore-type" data-id="'
          + escapeHtml(type.id) + '">Restore game</button>'
        : '<div class="row"><button type="button" class="btn primary" data-action="box-play">'
          + (active.length ? 'Resume game' : 'Start local game') + '</button>'
          + (type.builtin && !live && adapter
            ? '<button type="button" class="btn ghost" data-action="start-live" data-id="'
              + escapeHtml(type.id) + '">Start online table</button>'
            : '')
          + '</div>'
          + (active.length ? '' : '<p class="hint">Local games still sync their results to the web, so they count on your leaderboard.</p>'))
      + '</div></section>';

    html += '<nav class="tabs" aria-label="Game sections">'
      + tabLink(type, 'table', 'Table', effectiveTab)
      + tabLink(type, 'hall', 'Hall of Fame', effectiveTab)
      + tabLink(type, 'log', 'Log', effectiveTab)
      + '</nav>';

    if (effectiveTab === 'table') html += boxTableHtml(type, active, live);
    if (effectiveTab === 'hall') html += boxHallHtml(type);
    if (effectiveTab === 'log') html += boxLogHtml(type);
    if (effectiveTab === 'rules') html += houseRulesHtml(type);
    return html;
  }

  function tabLink(type, tab, label, current) {
    const href = '#/box/' + type.id + (tab === 'table' ? '' : '/' + tab);
    return '<a class="tab" href="' + href + '"'
      + (tab === current ? ' aria-current="page"' : '') + '>' + label + '</a>';
  }

  function liveTableHtml(type) {
    const status = space.status();
    const state = space.getState();
    const problem = status.problem
      ? '<p class="error">' + escapeHtml(status.problem) + '</p>' : '';
    const offline = navigator.onLine === false
      ? '<p class="error">This phone is offline &mdash; changes stay here until the connection comes back.</p>'
      : '';
    let html = '<p class="hint">Everyone with the code ' + codeChip(status.code)
      + ' sees this table. ' + status.online + ' here.</p>' + problem + offline;
    html += '<div class="roster">' + state.players.map(function (player) {
      return cardHtml(player, state.selection, type);
    }).join('') + '<button type="button" class="pcard add-card" data-action="open-add">'
      + '<span class="add-face" aria-hidden="true">' + icon('plus', 20) + '</span>'
      + '<span class="nm">Add player</span></button></div>';
    if (ui.addPanelOpen) html += addPanelHtml();
    if (ui.addError) html += '<p class="error">' + escapeHtml(ui.addError) + '</p>';
    html += '<div class="row"><button type="button" class="btn primary" data-action="start-game"'
      + (state.selection.length ? '' : ' disabled') + '>Start online game</button>'
      + '<button type="button" class="btn ghost" data-action="rename-lobby">Rename table</button>'
      + '</div>';
    if (ui.lobbyNote) html += '<p class="hint lobby-note" role="status">' + escapeHtml(ui.lobbyNote) + '</p>';
    return html;
  }

  function boxTableHtml(type, active, live) {
    if (type.archived) {
      return '<section class="panel"><p class="hint">Restore this game to play it again.</p></section>';
    }
    if (live) {
      return '<section class="panel"><p class="label">Live table</p>'
        + liveTableHtml(type)
        + '<p class="hint">This table&rsquo;s rules are locked: ' + escapeHtml(ruleLabel(type.rules)) + '.</p>'
        + '<button type="button" class="btn ghost" data-action="leave-lobby">Leave table</button></section>';
    }

    const state = backend.getState();
    const boardInfo = boardData();
    const total = Leaderboard.mergePlayers(
      state.players,
      boardInfo.pool || [],
      boardInfo.results || [],
      tombstones()
    );
    // Manage mode edits the device roster: pool-only names have no Edit/Delete
    // that could work, so they do not appear there.
    const merged = ui.manageMode ? total.filter(function (p) { return !p.pooled; }) : total;
    let html = '<section class="panel"><div class="section-head"><h2>Players</h2>'
      + '<button type="button" class="btn ghost" data-action="toggle-manage" aria-pressed="'
      + (ui.manageMode ? 'true' : 'false') + '">' + (ui.manageMode ? 'Done' : 'Edit players') + '</button></div>';
    if (!state.players.length && merged.length && !ui.manageMode) {
      html += '<p class="hint">Everyone from your tables is on the list. Tap a name and they are added.</p>';
    }
    if (merged.length > 8 && !ui.manageMode) {
      html += '<input type="search" id="roster-search" class="input roster-search" placeholder="Find a player"'
        + ' autocomplete="off" value="' + escapeHtml(ui.rosterFilter || '') + '"'
        + ' aria-label="Filter the player list">';
    }
    html += '<div class="roster">' + merged.map(function (player) {
      return cardHtml(player, state.selection, type);
    }).join('') + '<button type="button" class="pcard add-card" data-action="open-add">'
      + '<span class="add-face" aria-hidden="true">' + icon('plus', 20) + '</span>'
      + '<span class="nm">Add player</span></button></div></section>';

    if (ui.addPanelOpen) html += addPanelHtml();
    if (ui.addError) html += '<p class="error">' + escapeHtml(ui.addError) + '</p>';

    html += '<div class="footer"><button class="btn primary big" data-action="start-game"'
      + (state.selection.length ? '' : ' disabled') + '>Start online game</button>';
    if (!state.selection.length) html += '<p class="hint">Tap the players who are playing.</p>';
    html += '</div>';

    if (active.length) {
      html += '<section class="section"><h2>Playing now</h2><ul class="games">'
        + active.map(function (game) {
          return '<li><button class="game-row" data-action="resume-game" data-id="'
            + escapeHtml(game.id) + '"><span class="label">Round ' + (game.rounds.length + 1)
            + '</span><span class="game-winner">'
            + escapeHtml(game.seats.map(function (seat) { return seat.name; }).join(' · '))
            + '</span><span class="game-totals">' + game.rounds.length + ' round'
            + (game.rounds.length === 1 ? '' : 's') + '</span></button></li>';
        }).join('') + '</ul></section>';
    }
    html += '<p class="hint"><button type="button" class="btn ghost" data-action="open-join">Join a live table</button></p>';
    return html;
  }

  // Names removed from the Players page. Blocks automatic resurrection from
  // old results; adding a same-named player on purpose is always allowed.
  function tombstones() {
    try {
      const raw = window.localStorage.getItem('noting-more.removed-players');
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(function (n) { return typeof n === 'string'; }) : [];
    } catch (error) { return []; }
  }
  function entomb(name) {
    const keyish = Leaderboard.normalise(name);
    if (!keyish) return;
    try {
      const list = tombstones();
      if (list.indexOf(keyish) === -1) list.push(keyish);
      while (list.length > 200) list.shift();
      window.localStorage.setItem('noting-more.removed-players', JSON.stringify(list));
    } catch (error) { /* storage full/blocked: removal stays session-only */ }
  }
  // Deliberately adding a name on purpose is not resurrection: clear the tomb.
  function untomb(name) {
    const keyish = Leaderboard.normalise(name);
    if (!keyish) return;
    try {
      const list = tombstones();
      if (list.indexOf(keyish) === -1) return;
      window.localStorage.setItem('noting-more.removed-players',
        JSON.stringify(list.filter(function (n) { return n !== keyish; })));
    } catch (error) { /* best effort */ }
  }
  // Write a pool profile straight through (sync.register remembers a name as
  // registered and would quietly skip a re-added player's fresh profile).
  function publishPlayer(name, emoji) {
    const key = Leaderboard.keyFor(name);
    if (!adapter || !key) return;
    const type = local.getActiveType();
    adapter.putPoolPlayer(key, {
      name: String(name === null || name === undefined ? '' : name)
        .replace(/\s+/g, ' ').trim(),
      emoji: String(emoji || ''),
      game: type ? type.id : 'solo'
    }).catch(function () {});
  }

  // Cloud board when it is loaded; otherwise last locally saved results, so the
  // pages are never stuck on "Loading the board…" (a muted note says which).
  function boardData() {
    if (ui.board && ((ui.board.pool && ui.board.pool.length)
      || (ui.board.results && ui.board.results.length))) {
      return { pool: ui.board.pool || [], results: ui.board.results || [], fallback: false };
    }
    const results = [];
    backend.finishedGames().forEach(function (game) {
      const result = Leaderboard.resultFor(game, {
        mode: 'solo',
        origin: '',
        lowerWins: typeof game.lowerWins === 'boolean' ? game.lowerWins : true
      });
      if (result) results.push(result);
    });
    return { pool: [], results: results, fallback: true };
  }

  function leaderboardBoards(data) {
    const boards = [];
    backend.getLibrary().forEach(function (type) {
      const rows = Leaderboard.aggregate(data.pool, data.results, type.id);
      const games = data.results.filter(function (result) {
        return Leaderboard.gameOf(result) === type.id;
      }).length;
      if (type.archived && !games) return;
      boards.push({ type: type, rows: rows, games: games });
    });
    return boards;
  }

  function leaderboardBoardHtml(board) {
    const rows = board.rows;
    const ranked = rows.filter(function (row) { return row.ranked; });
    const learning = rows.filter(function (row) { return !row.ranked && row.games > 0; });
    const idle = rows.filter(function (row) { return row.games === 0; });
    const name = escapeHtml(board.type.name);
    return '<section class="panel lb-card"><header class="lb-head">'
      + '<a class="lb-cover" href="#/leaderboard/' + escapeHtml(board.type.id)
      + '" aria-label="Show only the leaderboard for ' + name + '">'
      + coverHtml(board.type, 'lb-cover-art') + '</a>'
      + '<div class="lb-title"><h2>' + name + '</h2><p class="board-meta">'
      + rows.length + ' player' + (rows.length === 1 ? '' : 's')
      + ' &middot; ' + board.games + ' game' + (board.games === 1 ? '' : 's') + '</p></div></header>'
      + (board.type.archived ? '<p class="board-note muted">Archived &mdash; read-only.</p>' : '')
      + boardGroup('Ranked', ranked, 'Win % decides the order. Three games to qualify.')
      + boardGroup('Not ranked yet', learning, 'Three games to qualify.')
      + boardGroup('No games yet', idle, '')
      + (rows.length ? '' : '<p class="hint">No players yet. Play a table from this game and it appears here.</p>')
      + '</section>';
  }

  function renderLeaderboard(gameId) {
    const data = boardData();
    const boards = leaderboardBoards(data);
    const wanted = boards.filter(function (board) { return board.type.id === gameId; })[0] || null;
    let html = '<header class="topbar library-topbar"><div><h1 class="wordmark">Leaderboard</h1>'
      + '<p class="tagline">' + (wanted
        ? escapeHtml(wanted.type.name) + ' standings'
        : 'Every game, ranked') + '</p></div>'
      + '<nav class="topbar-links"><a class="btn ghost" href="#/new-game">Add a game</a></nav></header>';
    if (wanted) {
      html += '<div class="lb-filters"><a class="btn ghost" href="#/leaderboard">All games</a></div>';
    } else if (!boards.length) {
      html += '<div class="empty-state"><p>No games to rank yet.</p>'
        + '<p class="hint">Add a game and play a table &mdash; standings appear here.</p></div>';
      return html;
    }
    if (data.fallback) {
      html += '<p class="muted">Showing your saved local results.'
        + (navigator.onLine === false ? ' This device is offline.' : '') + '</p>';
    }
    html += (wanted ? leaderboardBoardHtml(wanted)
      : boards.map(leaderboardBoardHtml).join(''));
    return html;
  }

  function playersRowHtml(row) {
    const record = row.games
      ? row.games + ' game' + (row.games === 1 ? '' : 's') + ' &middot; ' + row.wins + ' W'
      : 'No games yet';
    const pct = row.games ? '<span class="board-pct">' + Leaderboard.winPercent(row) + '%</span>' : '';
    const fav = row.favourite
      ? '<span class="pr-fav">Mostly ' + escapeHtml(row.favourite.name) + '</span>'
      : '';
    return '<li class="pr-row">'
      + '<span class="disc" style="--pc:' + escapeHtml(row.color) + '" aria-hidden="true">'
      + escapeHtml(row.emoji || '') + '</span>'
      + '<span class="pr-who"><span class="nm">' + escapeHtml(row.name) + '</span>'
      + '<span class="board-record">' + record + '</span></span>'
      + '<span class="pr-den">' + pct + fav + '</span>'
      + '<button type="button" class="btn ghost rm" data-action="remove-person"'
      + ' data-key="' + escapeHtml(row.key) + '" data-name="' + escapeHtml(row.name) + '"'
      + ' aria-label="Remove ' + escapeHtml(row.name) + '">Remove</button></li>';
  }

  function renderPlayers() {
    const data = boardData();
    const dead = tombstones();
    const alive = function (name) { return dead.indexOf(Leaderboard.normalise(name)) === -1; };
    const pool = (data.pool || []).filter(function (p) { return p && p.name && alive(p.name); });
    // Trim dead players out of each result's entries instead of dropping the
    // whole result — game counts for co-players must not change.
    const results = (data.results || []).map(function (result) {
      if (!result || !Array.isArray(result.players)) return result;
      return Object.assign({}, result, {
        players: result.players.filter(function (p) { return !p || !p.name || alive(p.name); })
      });
    }).filter(function (result) {
      return result && Array.isArray(result.players) && result.players.length > 0;
    });
    const rows = Leaderboard.allPlayers(pool, results);
    let html = '<header class="topbar library-topbar"><div><h1 class="wordmark">Players</h1>'
      + '<p class="tagline">Everyone from your tables</p></div>'
      + '<nav class="topbar-links"><button type="button" class="btn primary" data-action="open-add">Add player</button>'
      + '<a class="btn ghost" href="#/leaderboard">Leaderboard</a></nav></header>';
    if (ui.boardLoadError) html += '<p class="error">' + escapeHtml(ui.boardLoadError) + '</p>';
    if (ui.boardError) html += '<p class="error">' + escapeHtml(ui.boardError) + '</p>';
    if (ui.boardNotice) html += '<p class="muted" role="status">' + escapeHtml(ui.boardNotice) + '</p>';
    if (rows.length === 0) {
      html += '<div class="empty-state"><p>No players yet.</p>'
        + '<p class="hint">Add one here, or play a table &mdash; everyone who joins shows up here.</p></div>';
      if (ui.addPanelOpen) html += addPanelHtml();
      if (ui.addError) html += '<p class="error">' + escapeHtml(ui.addError) + '</p>';
      return html;
    }
    if (data.fallback) {
      html += '<p class="muted">Showing players from your saved local results.'
        + (navigator.onLine === false ? ' This device is offline.' : '') + '</p>';
    }
    html += '<ul class="pr-list">' + rows.map(playersRowHtml).join('') + '</ul>'
      + '<p class="board-privacy">A name is the player. Every table adds to the same roster.</p>'
      + '<p class="muted">Removing a player takes them off your tables here. Their past results stay on the leaderboard.</p>';
    if (ui.addPanelOpen) html += addPanelHtml();
    if (ui.addError) html += '<p class="error">' + escapeHtml(ui.addError) + '</p>';
    return html;
  }

  function boxHallHtml(type) {
    const board = ui.board;
    const pool = board && Array.isArray(board.pool) ? board.pool : [];
    const results = board && Array.isArray(board.results) ? board.results : [];
    const rows = board ? Leaderboard.aggregate(pool, results, type.id) : [];
    const ranked = rows.filter(function (row) { return row.ranked; });
    const learning = rows.filter(function (row) { return !row.ranked && row.games > 0; });
    const idle = rows.filter(function (row) { return row.games === 0; });
    const games = results.filter(function (result) {
      return Leaderboard.gameOf(result) === type.id;
    }).length;
    const pending = sync.pending();
    return '<section class="panel board-panel"><div class="board-head"><h2>'
      + escapeHtml(type.name) + ' Hall of Fame</h2>'
      + '<p class="board-meta">' + rows.length + ' player' + (rows.length === 1 ? '' : 's')
      + ' &middot; ' + games + ' game' + (games === 1 ? '' : 's') + '</p></div>'
      + (ui.boardLoadError ? '<p class="error">' + escapeHtml(ui.boardLoadError) + '</p>' : '')
      + (board && board.stale ? '<p class="muted">Showing the last saved board.</p>' : '')
      + (pending ? '<p class="muted">' + pending + ' change' + (pending === 1 ? '' : 's')
        + ' waiting to sync.</p>' : '')
      + (board ? '' : '<p class="muted">Loading the board&hellip;</p>')
      + (board && !rows.length
        ? '<p class="muted">No players yet. Register the first one below.</p>' : '')
      + boardGroup('Ranked', ranked, 'Win % decides the order. Three games to qualify.')
      + boardGroup('Not ranked yet', learning, 'Three games to qualify.')
      + boardGroup('No games yet', idle, '')
      + boardRegisterHtml(type.id)
      + '<p class="board-privacy">Per-game record. A name is the player.</p></section>';
  }

  function boxLogHtml(type) {
    const games = backend.finishedGames().filter(function (game) {
      return game.typeId === type.id;
    });
    if (!games.length) {
      return '<div class="empty-state"><p>No matches yet.</p>'
        + '<p class="hint">Play a game and it will show up here.</p></div>';
    }
    return '<ul class="games log-list">' + games.map(function (game) {
      const ranked = Ranking.rank(game, Ranking.directionFor(game, true));
      const winner = ranked.filter(function (entry) { return entry.isWinner; })
        .map(function (entry) { return entry.seat.name + ' ' + entry.total; }).join(' & ');
      const others = ranked.map(function (entry) {
        return escapeHtml(entry.seat.name) + ' ' + entry.total;
      }).join(' · ');
      return '<li><button class="game-row" data-action="open-game" data-id="' + game.id + '">'
        + '<span class="label">' + escapeHtml(formatDate(game.startedAt)) + '</span>'
        + '<span class="game-winner">🏆 ' + escapeHtml(winner) + '</span>'
        + '<span class="game-totals">' + others + ' · ' + escapeHtml(ruleLabel(game.rules)) + '</span>'
        + '</button></li>';
    }).join('') + '</ul>';
  }

  function joinSheetHtml() {
    const joining = ui.busy === 'join';
    return '<section class="panel join-sheet"><p class="label">Join a live table</p>'
      + '<form id="join-lobby-form">'
      + '<label class="label" for="lobby-code">Code</label>'
      + '<input id="lobby-code" class="input" maxlength="9" autocomplete="off"'
      + ' autocapitalize="characters" spellcheck="false" placeholder="ABCD 2345" value="'
      + escapeHtml(ui.lobbyCode) + '">'
      + '<div class="row"><button type="submit" class="btn primary"'
      + (joining ? ' disabled aria-busy="true"' : '') + '>'
      + (joining ? 'Joining&hellip;' : 'Join table') + '</button>'
      + '<button type="button" class="btn ghost" data-action="close-lobby-form">Cancel</button></div>'
      + '</form></section>';
  }

  function houseDraft(type) {
    if (!ui.houseDraft || ui.houseTypeId !== type.id) {
      ui.houseTypeId = type.id;
      ui.houseDraft = {
        name: type.name, emoji: type.emoji, colour: type.colour, pattern: type.pattern,
        winner: type.rules.winner,
        end: type.rules.end.type,
        limit: type.rules.end.type === 'limit' ? String(type.rules.end.limit) : '500'
      };
    }
    return ui.houseDraft;
  }

  function houseRulesHtml(type) {
    const draft = houseDraft(type);
    const hasActive = backend.activeGames().some(function (game) {
      return game.typeId === type.id;
    });
    const hasLive = space && space.status().game === type.id;
    const locked = type.archived || hasLive;
    let html = '<section class="panel house-rules"><h2>House rules</h2>';
    if (type.archived) html += '<p class="hint">Archived games are read-only. Restore to edit.</p>';
    if (hasLive) html += '<p class="hint">A live table keeps the rules it started with. Leave the table to change them.</p>';
    html += '<label class="label" for="house-name">Name</label>'
      + '<input id="house-name" class="input" maxlength="24" value="' + escapeHtml(draft.name) + '"'
      + (locked ? ' disabled' : '') + '>';
    html += '<p class="label" style="margin-top:0.9rem">Emoji</p><div class="emoji-grid">'
      + EMOJI.map(function (face) {
        return '<button type="button" class="emoji" data-action="house-emoji" data-emoji="' + face
          + '" aria-pressed="' + (face === draft.emoji ? 'true' : 'false') + '"'
          + (locked ? ' disabled' : '') + '>' + face + '</button>';
      }).join('') + '</div>';
    html += '<p class="label" style="margin-top:0.9rem">Colour</p><div class="swatches">'
      + Library.PALETTE.map(function (colour) {
        return '<button type="button" class="swatch" style="--swatch:' + colour
          + '" data-action="house-colour" data-colour="' + colour + '" aria-pressed="'
          + (colour === draft.colour ? 'true' : 'false') + '"' + (locked ? ' disabled' : '') + '></button>';
      }).join('') + '</div>';
    html += '<p class="label" style="margin-top:0.9rem">Cover pattern</p><div class="patterns">'
      + Library.PATTERNS.map(function (pattern) {
        return '<button type="button" class="pattern-chip cover-' + pattern
          + '" data-action="house-pattern" data-pattern="' + pattern + '" aria-pressed="'
          + (pattern === draft.pattern ? 'true' : 'false') + '"' + (locked ? ' disabled' : '') + '>'
          + pattern + '</button>';
      }).join('') + '</div>';
    html += '<fieldset class="rules-field"><legend>Winner</legend>'
      + '<label><input type="radio" name="house-winner" value="lowest"'
      + (draft.winner === 'lowest' ? ' checked' : '') + (locked ? ' disabled' : '') + '> Lowest</label>'
      + '<label><input type="radio" name="house-winner" value="highest"'
      + (draft.winner === 'highest' ? ' checked' : '') + (locked ? ' disabled' : '') + '> Highest</label></fieldset>';
    html += '<fieldset class="rules-field"><legend>End</legend>'
      + '<label><input type="radio" name="house-end" value="manual"'
      + (draft.end === 'manual' ? ' checked' : '') + (locked ? ' disabled' : '') + '> Manual</label>'
      + '<label><input type="radio" name="house-end" value="limit"'
      + (draft.end === 'limit' ? ' checked' : '') + (locked ? ' disabled' : '') + '> Limit</label>'
      + '<label for="house-limit">Limit</label><input id="house-limit" class="input" inputmode="numeric" value="'
      + escapeHtml(draft.limit) + '"' + (draft.end === 'limit' && !locked ? '' : ' disabled') + '></fieldset>';
    if (ui.houseError) html += '<p class="error">' + escapeHtml(ui.houseError) + '</p>';
    if (ui.houseNotice) html += '<p class="muted">' + escapeHtml(ui.houseNotice) + '</p>';
    html += '<p class="hint">Changes apply to future matches. '
      + (hasActive || hasLive ? 'Active matches and live tables keep the rules they started with.' : '')
      + '</p>';
    if (!locked) {
      html += '<div class="row"><button type="button" class="btn primary" data-action="save-house">Save rules</button>'
        + (type.builtin
          ? '<button type="button" class="btn ghost" data-action="reset-type" data-id="' + type.id + '">Reset to defaults</button>'
          : '<button type="button" class="btn danger" data-action="archive-type" data-id="' + type.id
            + '"' + (hasActive ? ' disabled' : '') + '>Archive game</button>')
        + '</div>';
    }
    html += '</section>';
    return html;
  }

  function saveHouseRules() {
    const type = backend.getType(currentRoute().id);
    const draft = houseDraft(type);
    ui.houseError = '';
    try {
      backend.updateType(type.id, {
        name: draft.name,
        emoji: draft.emoji,
        colour: draft.colour,
        pattern: draft.pattern,
        rules: {
          winner: draft.winner,
          end: draft.end === 'limit'
            ? { type: 'limit', limit: Number(draft.limit) }
            : { type: 'manual' }
        }
      });
      ui.houseDraft = null;
      ui.houseNotice = 'House rules saved. They apply to future matches.';
      render();
    } catch (error) {
      ui.houseError = error.message;
      render();
    }
  }

  function openNewGame() {
    if (!canLeaveTable('a new game')) return;
    if (space) leaveLobby();
    ui.newGame = null;
    navigate('new-game');
  }

  // The code is the whole invitation, so tapping it copies it ready to send.
  function codeChip(code) {
    return '<button type="button" class="code-chip" data-action="copy-code"'
      + ' aria-label="Copy lobby code ' + escapeHtml(code) + '" title="Copy code">'
      + escapeHtml(chunkCode(code)) + '</button>';
  }

  // Fetches the newest build and reloads without touching the scores.
  function refreshBtn() {
    return '<button type="button" class="btn ghost icon-btn" data-action="refresh-app"'
      + ' aria-label="Refresh app" title="Refresh app">' + icon('refresh', 16) + '</button>';
  }

  function playTogetherHtml() {
    if (space) {
      const status = space.status();
      const problem = status.problem
        ? '<p class="error">' + escapeHtml(status.problem) + '</p>' : '';
      const offline = navigator.onLine === false
        ? '<p class="error">This phone is offline &mdash; changes stay here until the connection comes back.</p>'
        : '';
      let html = '<section class="panel"><p class="label">This lobby</p>';
      if (ui.lobbyForm === 'rename') {
        html += '<form id="rename-lobby-form">'
          + '<label class="label" for="lobby-name">Name this space</label>'
          + '<input id="lobby-name" class="input" maxlength="24" autocomplete="off" value="'
          + escapeHtml(ui.lobbyName) + '">'
          + '<div class="row"><button type="submit" class="btn primary">Save name</button>'
          + '<button type="button" class="btn ghost" data-action="close-lobby-form">Cancel</button></div>'
          + '</form>';
      } else {
        html += '<p class="hint">Everyone with the code ' + codeChip(status.code)
          + ' sees and edits this scorekeeper. Scores save to the internet, not just this phone.</p>'
          + problem
          + offline
          + '<div class="row"><button type="button" class="btn ghost" data-action="rename-lobby">Rename</button>'
          + '<button type="button" class="btn ghost" data-action="leave-lobby">Leave lobby</button></div>';
      }
      if (ui.lobbyNote) html += '<p class="hint lobby-note" role="status">' + escapeHtml(ui.lobbyNote) + '</p>';
      return html + '</section>';
    }

    if (!adapter) {
      return '<section class="panel"><p class="label">Play together</p>'
        + '<p class="hint">Sharing is not set up on this copy of the app, so scores stay on this phone.</p>'
        + '</section>';
    }

    let html = '<section class="panel"><p class="label">Play together</p>'
      + '<p class="hint">Share one scorekeeper with another phone: the players, the games and the history.</p>';

    if (ui.lobbyForm === 'join') {
      const joining = ui.busy === 'join';
      html += '<form id="join-lobby-form">'
        + '<label class="label" for="lobby-code">Lobby code</label>'
        + '<input id="lobby-code" class="input" maxlength="9" autocomplete="off" autocapitalize="characters"'
        + ' spellcheck="false" placeholder="ABCD 2345" value="' + escapeHtml(ui.lobbyCode) + '">'
        + '<div class="row"><button type="submit" class="btn primary"' + (joining ? ' disabled aria-busy="true"' : '') + '>'
        + (joining ? 'Joining&hellip;' : 'Join lobby') + '</button>'
        + '<button type="button" class="btn ghost" data-action="close-lobby-form">Cancel</button></div>'
        + '</form>';
    } else {
      const creating = ui.busy === 'create';
      html += '<div class="row"><button type="button" class="btn primary" data-action="create-lobby"'
        + (creating ? ' disabled aria-busy="true"' : '') + '>'
        + (creating ? 'Creating&hellip;' : 'Create a lobby') + '</button>'
        + '<button type="button" class="btn ghost" data-action="open-join-lobby">Enter a code</button></div>'
        + '<p class="hint">A code appears straight away &mdash; send it to the other phone.</p>';
    }

    if (ui.lobbyNote) html += '<p class="hint">' + escapeHtml(ui.lobbyNote) + '</p>';
    return html + '</section>';
  }

  function loadBoard() {
    const cached = sync.cachedBoard();
    if (cached) ui.board = cached;
    sync.fetchBoard().then(function (board) {
      ui.board = board;
      ui.boardLoadError = '';
      repaintBoardRoute();
    }, function (error) {
      ui.boardLoadError = (error && error.message) || 'The board could not be loaded.';
      repaintBoardRoute();
    });
  }

  // The board is rendered by several pages now; re-render whichever is showing.
  function repaintBoardRoute() {
    const route = currentRoute();
    if (route.name === 'box' && (!route.tab || route.tab === 'table' || route.tab === 'hall')) render();
    if (route.name === 'leaderboard' || route.name === 'players') render();
  }

  function boardGroup(title, list, note) {
    if (!list.length) return '';
    return '<div class="board-group"><h3>' + escapeHtml(title) + '</h3>'
      + (note ? '<p class="board-note">' + escapeHtml(note) + '</p>' : '')
      + '<ul class="board-list">' + list.map(boardRowHtml).join('') + '</ul></div>';
  }

  function boardRowHtml(row) {
    const top = row.place && row.place <= 3 ? ' top' : '';
    const place = row.place ? String(row.place) : '&ndash;';
    const record = row.games
      ? row.games + ' game' + (row.games === 1 ? '' : 's') + ' &middot; '
        + row.wins + ' W &middot; ' + row.losses + ' L'
      : 'No games yet';
    const pct = Leaderboard.winPercent(row);
    const remove = row.fromPool && row.games === 0
      ? '<button type="button" class="btn ghost board-remove" data-action="remove-player"'
        + ' data-key="' + escapeHtml(row.key) + '" data-name="' + escapeHtml(row.name) + '"'
        + ' aria-label="Remove ' + escapeHtml(row.name) + ' from the leaderboard">Remove</button>'
      : '';
    return '<li class="board-row' + top + '">'
      + '<span class="place">' + place + '</span>'
      + '<span class="disc" style="--pc:' + escapeHtml(row.color) + '" aria-hidden="true">'
      + escapeHtml(row.emoji || '') + '</span>'
      + '<span class="who"><span class="nm">' + escapeHtml(row.name) + '</span>'
      + '<span class="board-record">' + record + '</span></span>'
      + (pct === null ? remove : '<span class="board-pct">' + pct + '%</span>')
      + '</li>';
  }

  function boardRegisterHtml(gameId) {
    return '<form id="board-register" class="board-register" data-game="' + escapeHtml(gameId || '') + '">'
      + '<h3>Register a player</h3>'
      + '<label class="label" for="board-name">Name</label>'
      + '<input id="board-name" class="input" maxlength="20" autocomplete="off" required'
      + ' value="' + escapeHtml(ui.boardName) + '">'
      + '<p class="label" style="margin-top:0.9rem">Emoji</p>'
      + '<div class="emoji-grid" role="group" aria-label="Emoji">'
      + EMOJI.map(function (face) {
        return '<button type="button" class="emoji" data-action="pick-board-emoji"'
          + ' data-emoji="' + face + '" aria-pressed="'
          + (face === ui.boardEmoji ? 'true' : 'false') + '">' + face + '</button>';
      }).join('')
      + '</div>'
      + (ui.boardError ? '<p class="error">' + escapeHtml(ui.boardError) + '</p>' : '')
      + (ui.boardNotice ? '<p class="muted">' + escapeHtml(ui.boardNotice) + '</p>' : '')
      + '<div class="row"><button type="submit" class="btn primary"'
      + (ui.boardBusy ? ' disabled aria-busy="true"' : '') + '>'
      + (ui.boardBusy ? 'Registering&hellip;' : 'Register') + '</button></div>'
      + '</form>';
  }

  function registerBoardPlayer(name, gameId) {
    if (ui.boardBusy) return;
    const display = String(name || '').replace(/\s+/g, ' ').trim();
    ui.boardName = name;
    if (!display || display.length > 20) {
      ui.boardError = 'A name is 1-20 characters.';
      render();
      return;
    }
    ui.boardBusy = true;
    ui.boardError = '';
    ui.boardNotice = '';
    render();
    sync.register(display, ui.boardEmoji, { queue: false, game: gameId }).then(function () {
      ui.boardBusy = false;
      ui.boardName = '';
      ui.boardEmoji = EMOJI[0];
      ui.boardNotice = 'Registered. Finish a game to appear with a record.';
      render();
      loadBoard();
    }).catch(function (error) {
      ui.boardBusy = false;
      ui.boardError = error && error.code === 'already-exists'
        ? 'That name is already registered.'
        : ((error && error.message) || 'The player could not be registered.');
      render();
      focusById('board-name');
    });
  }


  function renderRules() {
    let html = '<header class="topbar"><div><h1 class="wordmark">Rules</h1>'
      + '<p class="tagline">How the scores work</p></div>'
      + '<nav class="topbar-links">' + refreshBtn()
      + '<a class="btn ghost" href="#/home">Back</a></nav></header>';

    html += '<section class="panel rules"><h2>How this app scores</h2>'
      + '<p>Each round, every player types the value of the cards still in their hand. The app adds those values up across the game.</p>'
      + '<p>By default the <strong>fewest points wins</strong> &mdash; the way we play. '
      + 'Switch to <strong>most points wins</strong> on the home screen for standard UNO/SOLO scoring.</p></section>';

    html += '<section class="panel rules"><h2>SOLO</h2>'
      + '<p class="source">AMIGO, 1993 &middot; Thomas Pauli &middot; 2&ndash;10 players</p>'
      + '<p>SOLO is a shedding game: be first to play every card from your hand. Each player starts with '
      + '<strong>8 cards</strong>. AMIGO released it the year after it lost the UNO licence to Mattel, '
      + 'so it is UNO&rsquo;s cousin rather than a copy.</p>'
      + '<h3>Special cards</h3><ul>'
      + '<li><strong>Skip</strong> &mdash; the next player misses a turn.</li>'
      + '<li><strong>Change Direction</strong> &mdash; reverse the order of play.</li>'
      + '<li><strong>Plus Two</strong> &mdash; the next player draws 2. Can be stacked.</li>'
      + '<li><strong>Wild</strong> &mdash; change the colour.</li>'
      + '<li><strong>Wild Plus Four</strong> &mdash; change colour and the next player draws 4. Can be stacked.</li>'
      + '<li><strong>Swap (Direct)</strong> &mdash; swap your whole hand with a player you choose.</li>'
      + '<li><strong>Swap (Rotation)</strong> &mdash; every hand rotates one seat in the current direction of play.</li>'
      + '</ul>'
      + '<h3>Calls</h3>'
      + '<p>Down to one card? Call &ldquo;solo&rdquo; or draw two as a penalty. If you hold a card identical '
      + 'to one just played, you may &ldquo;jump in&rdquo; out of turn.</p>'
      + '<h3>Card values</h3>'
      + '<table><thead><tr><th>Card left in hand</th><th>Points</th></tr></thead><tbody>'
      + '<tr><td>Number cards 1&ndash;9</td><td>face value</td></tr>'
      + '<tr><td>Change Direction</td><td>10</td></tr>'
      + '<tr><td>Skip</td><td>20</td></tr>'
      + '<tr><td>Draw Two, Swap with another player</td><td>30</td></tr>'
      + '<tr><td>Swap in turn, Choose a colour</td><td>40</td></tr>'
      + '<tr><td>Draw Four + Choose a colour</td><td>50</td></tr>'
      + '</tbody></table></section>';

    html += '<section class="panel rules"><h2>UNO</h2>'
      + '<p class="source">Mattel &middot; 2&ndash;10 players</p>'
      + '<p>Match the top card by colour or number. Each player starts with <strong>7 cards</strong>. '
      + 'The first to empty their hand wins the <strong>round</strong> and scores the value of every other '
      + 'player&rsquo;s remaining cards. Play continues until someone reaches <strong>500 points</strong>.</p>'
      + '<p>Because the round winner banks everyone else&rsquo;s leftovers, UNO is a '
      + '<strong>most-points-wins</strong> game &mdash; to score it here, choose &ldquo;Most points wins&rdquo; '
      + 'on the home screen and enter the round winner&rsquo;s points with zeros for the others.</p>'
      + '<h3>Card values</h3>'
      + '<table><thead><tr><th>Card left in hand</th><th>Points</th></tr></thead><tbody>'
      + '<tr><td>Number cards 0&ndash;9</td><td>face value</td></tr>'
      + '<tr><td>Skip, Reverse, Draw Two</td><td>20</td></tr>'
      + '<tr><td>Wild, Wild Draw Four</td><td>50</td></tr>'
      + '</tbody></table></section>';

    html += '<section class="panel rules"><h2>Sources</h2>'
      + '<p class="source">Summarised from Board Game Arena&rsquo;s SOLO game guide '
      + '(en.doc.boardgamearena.com/Gamehelpsolo) and Mattel&rsquo;s published UNO rules. '
      + 'If your box differs, follow the box.</p></section>';

    return html;
  }

  function formatDate(timestamp) {
    const at = Number(timestamp);
    return new Date(Number.isFinite(at) && at > 0 ? at : Date.now()).toLocaleDateString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short'
    });
  }

  function renderGame(gameId) {
    const game = gameFor(gameId);
    if (!game) { navigate('library'); return ''; }
    if (ui.roundGameId !== gameId) { ui.roundGameId = gameId; ui.roundDraft = {}; }
    const type = typeForGame(game) || {
      id: game.typeId, name: game.typeName, emoji: '🎲', colour: '#f0b429',
      pattern: 'pips', rules: game.rules
    };
    const rules = game.rules || type.rules;
    const limit = Ranking.limitFor(game);
    const reached = Ranking.limitReached(game);
    const totals = Ranking.totalsFor(game);
    const played = game.rounds.length > 0;
    const lower = rules.winner !== 'highest';
    const top = played ? Math.max.apply(null, totals) : null;

    let html = '<header class="topbar"><div><p class="label">Round ' + (game.rounds.length + 1)
      + '</p><h1 class="wordmark">' + escapeHtml(game.typeName || type.name) + '</h1>'
      + '<p class="tagline">' + escapeHtml(ruleLabel(rules)) + '</p></div>'
      + '<nav class="topbar-links">' + refreshBtn()
      + '<a class="btn ghost" href="#/box/' + escapeHtml(game.typeId || type.id) + '">Back</a></nav></header>';

    if (inLobby()) {
      const status = space.status();
      html += '<p class="live">&#9679; Live &middot; ' + codeChip(status.code) + ' &middot; '
        + status.online + ' here. Everyone with the code sees this game.</p>';
      if (status.problem) html += '<p class="error">' + escapeHtml(status.problem) + '</p>';
      else if (navigator.onLine === false) {
        html += '<p class="error">This phone is offline &mdash; changes stay here until the connection comes back.</p>';
      }
    }

    html += '<div class="score-rules">' + ruleChips({ rules: rules })
      + (limit !== null ? '<span class="score-limit">To ' + limit + ' · top ' + (top === null ? 0 : top) + '</span>' : '')
      + '</div>';
    if (reached) {
      html += '<p class="limit-banner" role="status">Score limit reached — end the game.</p>';
    }

    const leader = played ? (lower ? Math.min.apply(null, totals) : Math.max.apply(null, totals)) : null;

    html += '<div class="tiles">' + game.seats.map(function (seat, i) {
      const classes = played && totals[i] === leader ? 'tile leading' : 'tile';
      return '<article class="' + classes + '" style="--tile-color:' + escapeHtml(seat.color) + '">'
        + '<div class="tile-head"><span class="disc" aria-hidden="true">' + escapeHtml(seat.emoji)
        + '</span><span class="tile-name">' + escapeHtml(seat.name) + '</span></div>'
        + '<div class="tile-total">' + totals[i] + '</div>'
        + '<p class="tile-caption">total</p>'
        + '<input class="input tile-input" inputmode="numeric" pattern="[0-9-]*"'
        + ' data-seat="' + escapeHtml(seat.id) + '" aria-label="Points for ' + escapeHtml(seat.name)
        + ' this round" autocomplete="off" value="' + escapeHtml(ui.roundDraft[seat.id] || '') + '"'
        + (reached ? ' disabled' : '') + '></article>';
    }).join('') + '</div>';

    if (ui.addPanelOpen) html += addPanelHtml();
    if (ui.addError) html += '<p class="error">' + escapeHtml(ui.addError) + '</p>';

    html += '<button class="btn primary big" data-action="save-round"'
      + (reached ? ' disabled' : '') + '>Save round</button>'
      + '<div class="row">'
      + '<button class="btn ghost" data-action="undo-round"' + (game.rounds.length ? '' : ' disabled')
      + '>Undo last round</button>'
      + '<button class="btn ghost" data-action="open-add-mid"' + (reached ? ' disabled' : '') + '>+ Add player</button>'
      + '<button class="btn danger" data-action="end-game"' + (game.rounds.length ? '' : ' disabled')
      + '>End game</button>'
      + '</div>';
    return html;
  }

  function renderPodium(gameId, settled) {
    const target = gameId ? backend.getGame(gameId) : backend.finishedGames()[0];
    if (!target) { navigate('library'); return ''; }
    const type = target.typeId ? backend.getType(target.typeId) : null;
    const typeId = target.typeId || (type && type.id) || 'solo';
    const name = target.typeName || (type && type.name) || 'SOLO';
    const rules = target.rules || (type && type.rules) || { winner: 'lowest', end: { type: 'manual' } };
    const archived = type && type.archived;

    let html = '<header class="topbar"><div><h1 class="wordmark">Final scores</h1>'
      + '<p class="tagline">' + escapeHtml(name) + ' · ' + escapeHtml(formatDate(target.startedAt))
      + '</p></div>'
      + '<nav class="topbar-links">' + refreshBtn()
      + '<a class="btn ghost" href="#/box/' + escapeHtml(typeId) + '">Done</a></nav></header>';

    html += '<div class="podium-rules">' + ruleChips({ rules: rules }) + '</div>';

    const ranked = Ranking.rank(target, Ranking.directionFor(target, true));
    const highest = ranked.length ? Math.max.apply(null, ranked.map(function (r) { return r.total; })) : 0;

    html += '<div class="podium">' + ranked.map(function (entry) {
      const classes = ['bar-col'];
      if (entry.isWinner) classes.push('winner');
      if (entry.isLoser) classes.push('loser');
      if (settled) classes.push('grown');
      const height = Math.max(28, Math.round((entry.total / Math.max(1, highest)) * 220));
      return '<div class="' + classes.join(' ') + '" style="--tile-color:' + escapeHtml(entry.seat.color)
        + ';--bar-height:' + height + 'px">'
        + '<span class="bar-total" data-total="' + entry.total + '">' + (settled ? entry.total : 0) + '</span>'
        + '<div class="bar"><span class="crown">👑</span></div>'
        + '<span class="bar-name">' + escapeHtml(entry.seat.emoji) + ' ' + escapeHtml(entry.seat.name) + '</span>'
        + (entry.isWinner ? '<span class="badge win">Winner</span>' : '')
        + (entry.isLoser ? '<span class="badge lose">Loser</span>' : '')
        + '</div>';
    }).join('') + '</div>';

    if (ui.addError) html += '<p class="error">' + escapeHtml(ui.addError) + '</p>';

    html += '<div class="actions">';
    const active = backend.activeGames();
    if (active.length) {
      html += '<button class="btn primary big" data-action="resume-game" data-id="' + active[0].id
        + '">Resume game</button><p class="hint">A game is in progress.</p>';
    } else if (archived) {
      html += '<p class="hint">This game is archived; play again is unavailable.</p>';
    } else {
      html += '<button class="btn primary big" data-action="play-again">Play again</button>';
    }
    html += '<div class="row"><button class="btn ghost" data-action="new-players">Game page</button>'
      + '<a class="btn ghost" href="#/box/' + escapeHtml(typeId) + '/log">Log</a></div></div>';
    return html;
  }

  function saveRound() {
    const gameId = currentGameId();
    const before = Ranking.totalsFor(gameFor(gameId) || { seats: [], rounds: [] });
    const boxes = Array.prototype.slice.call(document.querySelectorAll('.tile-input'));
    try {
      backend.recordRound(gameId, boxes.map(function (box) { return box.value; }));
    } catch (error) {
      ui.addError = error.message;
      render();
      return;
    }
    ui.roundDraft = {};
    render();
    Array.prototype.slice.call(document.querySelectorAll('.tile-total')).forEach(function (element, i) {
      const from = Number.isFinite(before[i]) ? before[i] : 0;
      Reveal.countTo(element, from, Number(element.textContent) || 0, 600);
    });
    const first = document.querySelector('.tile-input');
    if (first) first.focus();
  }

  function addPanelHtml() {
    const isEdit = ui.addTarget === 'edit';
    const heading = isEdit ? 'Edit player'
      : (ui.addTarget === 'game' ? 'Add player to this game' : 'Add player');
    const submitLabel = isEdit ? 'Save changes'
      : (ui.addTarget === 'game' ? 'Add to game' : 'Add to roster');
    return '<section class="panel"><form id="add-player-form">'
      + '<h2 style="font-size:1.05rem;margin-bottom:0.75rem">' + heading + '</h2>'
      + '<label class="label" for="new-player-name">Name</label>'
      + '<input id="new-player-name" class="input" maxlength="20" autocomplete="off" required value="' + escapeHtml(ui.addName) + '">'
      + '<p class="label" style="margin-top:0.9rem">Emoji</p>'
      + '<div class="emoji-grid" role="group" aria-label="Emoji">'
      + EMOJI.map(function (face) {
        return '<button type="button" class="emoji" data-action="pick-emoji" data-emoji="' + face
          + '" aria-pressed="' + (face === ui.addEmoji ? 'true' : 'false') + '">' + face + '</button>';
      }).join('')
      + '</div>'
      + '<div class="row"><button type="submit" class="btn primary">' + submitLabel + '</button>'
      + '<button type="button" class="btn ghost" data-action="close-add">Cancel</button></div>'
      + '</form></section>';
  }

  function closeAddPanel() {
    ui.addPanelOpen = false;
    ui.addError = '';
    ui.addName = '';
    ui.addTarget = 'roster';
    ui.addEditId = null;
    render();
  }

  document.addEventListener('click', function (event) {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const action = trigger.getAttribute('data-action');
    ui.addError = '';
    if (action === 'open-add') {
      ui.addPanelOpen = true;
      ui.addTarget = currentRoute().name === 'players' ? 'players' : 'roster';
      ui.addEditId = null;
      ui.addName = '';
      ui.addEmoji = EMOJI[0];
      render();
      focusName();
    }
    else if (action === 'close-add') closeAddPanel();
    else if (action === 'edit-player') {
      const player = backend.getState().players.find(function (p) { return p.id === trigger.getAttribute('data-id'); });
      if (player) {
        ui.addPanelOpen = true; ui.addTarget = 'edit'; ui.addEditId = player.id;
        ui.addName = player.name; ui.addEmoji = player.emoji; render(); focusName();
      }
    }
    else if (action === 'pick-emoji') {
      const field = document.getElementById('new-player-name');
      if (field) ui.addName = field.value;
      ui.addEmoji = trigger.getAttribute('data-emoji');
      render();
      focusName();
    }
    else if (action === 'pick-board-emoji') {
      const field = document.getElementById('board-name');
      if (field) ui.boardName = field.value;
      ui.boardEmoji = trigger.getAttribute('data-emoji');
      render();
      focusById('board-name');
    }
    else if (action === 'toggle-seat') {
      const id = trigger.getAttribute('data-id');
      try {
        if (backend.getState().players.some(function (p) { return p.id === id; })) {
          backend.toggleSeat(id);
        } else {
          // A name from the shared pool: join the roster, then seat them.
          const created = backend.addPlayer(
            trigger.getAttribute('data-name'), trigger.getAttribute('data-emoji'));
          backend.toggleSeat(created.id);
        }
      } catch (error) { ui.addError = error.message; }
      render();
    }
    else if (action === 'toggle-manage') {
      ui.manageMode = !ui.manageMode;
      ui.pendingDelete = null;
      render();
    }
    else if (action === 'ask-delete') { ui.pendingDelete = trigger.getAttribute('data-id'); render(); }
    else if (action === 'cancel-delete') { ui.pendingDelete = null; render(); }
    else if (action === 'confirm-delete') {
      const id = trigger.getAttribute('data-id');
      const player = backend.getState().players.filter(function (p) { return p.id === id; })[0];
      try {
        backend.removePlayer(id);
        // Same permanence as the Players page Remove: old results must not
        // resurrect the name on the next merged roster render.
        if (player) entomb(player.name);
      }
      catch (error) { ui.addError = error.message; }
      ui.pendingDelete = null;
      render();
    }
    else if (action === 'resume-game') {
      navigate('play/' + trigger.getAttribute('data-id'));
    }
    else if (action === 'open-game') navigate('podium/' + trigger.getAttribute('data-id'));
    else if (action === 'start-game') {
      try { navigate('play/' + backend.startGame().id); }
      catch (error) { ui.addError = error.message; render(); }
    }
    else if (action === 'save-round') saveRound();
    else if (action === 'undo-round') {
      try { backend.undoRound(currentGameId()); } catch (error) { ui.addError = error.message; }
      render();
    }
    else if (action === 'open-add-mid') { ui.addPanelOpen = true; ui.addTarget = 'game'; ui.addEditId = null; ui.addName = ''; ui.addEmoji = EMOJI[0]; render(); focusName(); }
    else if (action === 'end-game') {
      try {
        const game = backend.finishGame(currentGameId());
        if (space) {
          publishFinished('lobby', space.getState().players, space.finishedGames());
        } else {
          publishFinished('solo', local.getState().players, [game]);
        }
        navigate('podium/' + game.id);
      } catch (error) { ui.addError = error.message; render(); }
    }
    else if (action === 'play-again') {
      try { navigate('play/' + backend.playAgain(currentRoute().id || null).id); }
      catch (error) {
        ui.addError = (error && error.message) || 'Play again failed.';
        render();
      }
    }
    else if (action === 'new-players') {
      const game = backend.getGame(currentRoute().id);
      navigate('box/' + ((game && game.typeId) ? game.typeId : (backend.getActiveType() ? backend.getActiveType().id : 'solo')));
    }
    else if (action === 'dismiss-banner') { ui.bannerDismissed = true; refreshBanner(); }
    else if (action === 'box-play') {
      const type = backend.getType(currentRoute().id);
      if (!type) return;
      const active = backend.activeGames().filter(function (game) {
        return game.typeId === type.id;
      })[0];
      if (active) {
        navigate('play/' + active.id);
      } else {
        try { navigate('play/' + backend.startGame().id); }
        catch (error) { ui.addError = error.message; render(); }
      }
    }
    else if (action === 'start-live') {
      const type = backend.getType(trigger.getAttribute('data-id'));
      if (!type) return;
      if (!canLeaveTable('a live table')) return;
      if (space) leaveLobby();
      createLobby(type.id);
    }
    else if (action === 'house-emoji') { const f = document.getElementById('house-name'); const d = houseDraft(backend.getType(currentRoute().id)); if (f) d.name = f.value; d.emoji = trigger.getAttribute('data-emoji'); render(); }
    else if (action === 'house-colour') { houseDraft(backend.getType(currentRoute().id)).colour = trigger.getAttribute('data-colour'); render(); }
    else if (action === 'house-pattern') { houseDraft(backend.getType(currentRoute().id)).pattern = trigger.getAttribute('data-pattern'); render(); }
    else if (action === 'save-house') saveHouseRules();
    else if (action === 'reset-type') {
      if (!window.confirm('Reset this game to its default name, cover and rules?')) return;
      try { backend.resetType(trigger.getAttribute('data-id')); ui.houseDraft = null; } catch (error) { ui.houseError = error.message; }
      render();
    }
    else if (action === 'archive-type') {
      if (!window.confirm('Archive this game? Its Hall and Log stay, but it cannot be played.')) return;
      try { backend.archiveType(trigger.getAttribute('data-id')); navigate('library'); }
      catch (error) { ui.houseError = error.message; render(); }
    }
    else if (action === 'create-lobby') createLobby();
    else if (action === 'copy-code') copyCode();
    else if (action === 'refresh-app') refreshApp();
    else if (action === 'open-join-lobby') {
      ui.lobbyForm = 'join'; ui.addError = ''; render(); focusById('lobby-code');
    }
    else if (action === 'close-lobby-form') { ui.lobbyForm = null; ui.addError = ''; render(); }
    else if (action === 'toggle-menu') { document.querySelector('.sidebar').classList.toggle('open'); }
else if (action === 'open-new-game') openNewGame();
    else if (action === 'open-box') openBox(trigger.getAttribute('data-id'));
    else if (action === 'toggle-archived') { ui.showArchived = !ui.showArchived; render(); }
    else if (action === 'restore-type') {
      if (space) return;
      try { backend.restoreType(trigger.getAttribute('data-id')); } catch (error) { ui.addError = error.message; }
      render();
    }
    else if (action === 'open-join') {
      if (!canLeaveTable('another table')) return;
      if (space) leaveLobby();
      ui.lobbyForm = 'join';
      ui.addError = '';
      render();
      focusById('lobby-code');
    }
    else if (action === 'new-game-preset') {
      const preset = (window.Library && window.Library.PRESETS ? window.Library.PRESETS : []).filter(function (one) { return one.id === trigger.getAttribute('data-preset'); })[0];
      if (preset) {
        const draft = newGameDraft();
        draft.winner = preset.rules.winner;
        draft.end = 'manual';
        render();
      }
    }
    else if (action === 'new-game-emoji') {
      const field = document.getElementById('game-name');
      const draft = newGameDraft();
      if (field) draft.name = field.value;
      draft.emoji = trigger.getAttribute('data-emoji');
      render();
      focusById('game-name');
    }
    else if (action === 'new-game-colour') { newGameDraft().colour = trigger.getAttribute('data-colour'); render(); }
    else if (action === 'new-game-pattern') { newGameDraft().pattern = trigger.getAttribute('data-pattern'); render(); }
    else if (action === 'rename-lobby') {
      ui.lobbyForm = 'rename'; ui.lobbyName = space.status().name;
      ui.addError = ''; render(); focusById('lobby-name');
    }
    else if (action === 'remove-person') {
      const key = trigger.getAttribute('data-key');
      const name = trigger.getAttribute('data-name');
      if (!name) return;
      if (!window.confirm('Remove ' + name + ' from your tables here?'
        + ' Their past results stay on the leaderboard.')) return;
      const match = local.getState().players.filter(function (p) {
        return Leaderboard.normalise(p.name) === Leaderboard.normalise(name);
      })[0];
      try {
        if (match) local.removePlayer(match.id);
        entomb(name);
        if (adapter && key) sync.remove(key).catch(function () {});
        ui.boardError = '';
        ui.boardNotice = name + ' removed from your tables here.';
      } catch (error) {
        ui.boardError = (error && error.message) || 'That player could not be removed.';
      }
      loadBoard();
      render();
    }
    else if (action === 'leave-lobby') leaveLobby();
    else if (action === 'remove-player') {
      const key = trigger.getAttribute('data-key');
      const name = trigger.getAttribute('data-name');
      if (!key) return;
      if (!window.confirm('Remove ' + name + ' from the leaderboard?'
        + ' Their name becomes available again.')) return;
      sync.remove(key).then(function () {
        ui.boardNotice = name + ' removed.';
        ui.boardError = '';
        render();
        loadBoard();
      }).catch(function (error) {
        ui.boardError = (error && error.message) || 'That player could not be removed.';
        render();
      });
    }
  });

  document.addEventListener('input', function (event) {
    if (event.target.id === 'new-player-name') ui.addName = event.target.value;
    else if (event.target.id === 'board-name') ui.boardName = event.target.value;
    else if (event.target.id === 'lobby-name') ui.lobbyName = event.target.value;
    else if (event.target.id === 'lobby-code') ui.lobbyCode = event.target.value;
    else if (event.target.id === 'game-name') { newGameDraft().name = event.target.value; }
    else if (event.target.id === 'game-limit') { newGameDraft().limit = event.target.value; }
    else if (event.target.getAttribute('data-seat')) {
      ui.roundDraft[event.target.getAttribute('data-seat')] = event.target.value;
    }
    else if (event.target.id === 'roster-search') {
      ui.rosterFilter = event.target.value;
      // Filter in place — no render(), so the caret (and mobile keyboard) stay put.
      const filter = Leaderboard.normalise(ui.rosterFilter || '');
      document.querySelectorAll('.roster .pcard').forEach(function (card) {
        const tag = card.querySelector('[data-name]');
        if (!tag) return; // keeps the Add-player card always visible
        card.hidden = Leaderboard.normalise(tag.getAttribute('data-name')).indexOf(filter) === -1;
      });
    }
  });

  document.addEventListener('change', function (event) {
    if (event.target.name === 'winner') { newGameDraft().winner = event.target.value; render(); }
    if (event.target.name === 'end') { newGameDraft().end = event.target.value; render(); }
    if (event.target.name === 'house-winner') { houseDraft(backend.getType(currentRoute().id)).winner = event.target.value; render(); }
    if (event.target.name === 'house-end') { houseDraft(backend.getType(currentRoute().id)).end = event.target.value; render(); }
  });
  document.addEventListener('input', function (event) {
    if (event.target.id === 'house-name') {
      const type = backend.getType(currentRoute().id);
      if (type) houseDraft(type).name = event.target.value;
    }
    else if (event.target.id === 'house-limit') {
      const type = backend.getType(currentRoute().id);
      if (type) houseDraft(type).limit = event.target.value;
    }
  });

  document.addEventListener('submit', function (event) {
    if (event.target.id === 'board-register') {
      event.preventDefault();
      const form = event.target;
      registerBoardPlayer(document.getElementById('board-name').value, form.getAttribute('data-game'));
      return;
    }
    if (event.target.id === 'join-lobby-form') {
      event.preventDefault();
      ui.lobbyCode = document.getElementById('lobby-code').value;
      joinLobby(ui.lobbyCode);
      return;
    }
    if (event.target.id === 'rename-lobby-form') {
      event.preventDefault();
      renameLobby(document.getElementById('lobby-name').value);
      return;
    }
    if (event.target.id === 'new-game-form') {
      event.preventDefault();
      const draft = newGameDraft();
      ui.newGameError = '';
      try {
        const type = backend.addType({
          name: draft.name,
          emoji: draft.emoji,
          colour: draft.colour,
          pattern: draft.pattern,
          rules: {
            winner: draft.winner,
            end: draft.end === 'limit'
              ? { type: 'limit', limit: Number(draft.limit) }
              : { type: 'manual' }
          }
        });
        ui.newGame = null;
        navigate('box/' + type.id);
      } catch (error) {
        ui.newGameError = error.message;
        render();
      }
      return;
    }
    if (event.target.id !== 'add-player-form') return;
    event.preventDefault();
    const name = document.getElementById('new-player-name').value;
    ui.addName = name;
    try {
      if (ui.addTarget === 'edit') backend.updatePlayer(ui.addEditId, name, ui.addEmoji);
      else if (ui.addTarget === 'game') backend.addPlayerToGame(currentGameId(), name, ui.addEmoji);
      else if (ui.addTarget === 'players') {
        // The Players page is the local roster's home: live tables must not
        // receive an accidental team member because a lobby happens to be open.
        local.addPlayer(name, ui.addEmoji);
        untomb(name);
        publishPlayer(name, ui.addEmoji);
      }
      else {
        backend.addPlayer(name, ui.addEmoji);
        untomb(name);
        publishPlayer(name, ui.addEmoji);
      }
      closeAddPanel();
    } catch (error) {
      ui.addError = error.message;
      render();
      focusName();
    }
  });

  window.addEventListener('hashchange', function () {
    ui.addPanelOpen = false;
    ui.addError = '';
    ui.addName = '';
    ui.addTarget = 'roster';
    ui.addEditId = null;
    ui.manageMode = false;
    ui.pendingDelete = null;
    ui.busy = null;
    ui.boardKey = null;
    ui.boardError = '';
    ui.boardNotice = '';
    ui.boardLoadError = '';
    ui.boardBusy = false;
    ui.boardName = '';
    ui.boardEmoji = EMOJI[0];
    ui.rosterFilter = '';
    render();
  });

  function focusById(id) {
    const field = document.getElementById(id);
    if (field) field.focus();
  }

  function focusName() {
    const field = document.getElementById('new-player-name');
    if (field) field.focus();
  }

  function renameLobby(name) {
    const clean = String(name || '').trim();
    const code = space.status().code;
    const saved = local.getState().lobby;
    ui.lobbyNote = clean ? 'Renamed to ' + clean + '.' : 'Name cleared.';
    adapter.renameSpace(code, clean).then(function () {
      local.setLobby({
        code: code,
        name: clean,
        joinedAt: saved && saved.joinedAt,
        typeId: saved && saved.typeId
      });
      ui.lobbyForm = null;
      render();
    }).catch(function (error) {
      ui.addError = (error && error.message) || 'The lobby could not be renamed.';
      render();
    });
  }

  window.addEventListener('online', function () {
    sync.flush().then(function () {
      const name = currentRoute().name;
      if (name === 'leaderboard' || name === 'players') render();
    });
    if (space) render();
  });
  window.addEventListener('offline', function () { if (space) render(); });

  backfillSolo();

  const remembered = local.getState().lobby;
  if (remembered && adapter && Space.validCode(Space.normalizeCode(remembered.code))) {
    const type = remembered.typeId ? local.getType(remembered.typeId) : null;
    enterLobby(Space.normalizeCode(remembered.code), remembered.name, type || local.getActiveType());
  } else {
    render();
  }
})();
