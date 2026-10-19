(function () {
  'use strict';

  const local = Store.createStore(window.localStorage);
  const adapter = window.Firebase && window.Firebase.configured() ? window.Firebase : null;

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
    plus: { stroke: 2, paths: '<path d="M12 5v14"/><path d="M5 12h14"/>' }
  };

  const ui = {
    addPanelOpen: false, addEmoji: EMOJI[0], addTarget: 'roster', addEditId: null,
    addError: '', addName: '', bannerDismissed: false, manageMode: false, pendingDelete: null,
    lobbyForm: null, lobbyName: '', lobbyCode: '', lobbyNote: '',
    roundGameId: null, roundDraft: {}
  };

  const views = {
    home: document.getElementById('view-home'),
    game: document.getElementById('view-game'),
    podium: document.getElementById('view-podium'),
    history: document.getElementById('view-history'),
    rules: document.getElementById('view-rules')
  };
  const banner = document.getElementById('banner');

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
    const hash = (location.hash || '#/home').replace(/^#\/?/, '');
    const parts = hash.split('/');
    return { name: parts[0] || 'home', id: parts[1] || null };
  }

  function navigate(path) {
    const next = '#/' + path;
    // Re-rendering here matters: switching back to the route we are already on
    // (leaving a lobby, say) fires no hashchange of its own.
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
    if (route.name !== 'game') return null;
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

  function enterLobby(code, name) {
    if (space) space.leave();
    space = Space.create({
      adapter: adapter,
      code: code,
      name: name,
      deviceId: deviceId()
    });
    backend = space;
    space.subscribe(function () {
      if (space) render();
    });
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

  function createLobby(name) {
    const title = String(name || '').trim();
    ui.lobbyNote = '';
    freshCode().then(function (code) {
      return adapter.createSpace(code, title).then(function () {
        local.setLobby({ code: code, name: title, joinedAt: Date.now() });
        enterLobby(code, title);
      });
    }).catch(function (error) {
      ui.addError = (error && error.message) || 'The lobby could not be created.';
      render();
    });
  }

  function joinLobby(input) {
    const code = Space.normalizeCode(input);
    if (!Space.validCode(code)) {
      ui.addError = 'A lobby code is 8 characters, using letters and numbers.';
      render();
      return;
    }
    ui.addError = '';
    adapter.spaceExists(code).then(function (exists) {
      if (!exists) {
        ui.addError = 'No lobby found for that code.';
        render();
        return;
      }
      local.setLobby({ code: code, name: '', joinedAt: Date.now() });
      enterLobby(code, '');
    }).catch(function (error) {
      ui.addError = (error && error.message) || 'The lobby could not be reached.';
      render();
    });
  }

  function leaveLobby() {
    if (space) space.leave();
    space = null;
    backend = local;
    local.setLobby(null);
    ui.lobbyForm = null;
    ui.lobbyName = '';
    ui.lobbyCode = '';
    navigate('home');
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

  function render() {
    const route = currentRoute();
    if (route.name === 'game' && !gameFor(route.id)) {
      // Someone else may have ended this game: show them the result rather than
      // dropping them on the home screen mid-celebration.
      if (backend.getGame(route.id)) { navigate('podium/' + route.id); return; }
      navigate('home');
      return;
    }
    if (route.name === 'podium') {
      const target = route.id ? backend.getGame(route.id) : backend.finishedGames()[0];
      if (!target) { navigate('home'); return; }
    }
    Object.keys(views).forEach(function (name) {
      views[name].hidden = name !== route.name;
    });
    if (route.name === 'home') views.home.innerHTML = renderHome();
    if (route.name === 'game') views.game.innerHTML = renderGame(route.id);
    if (route.name === 'podium') { views.podium.innerHTML = renderPodium(route.id); Reveal.playPodium(views.podium); }
    if (route.name === 'history') views.history.innerHTML = renderHistory();
    if (route.name === 'rules') views.rules.innerHTML = renderRules();
    refreshBanner();
  }

  function lowerWins() {
    return backend.getSettings().lowerWins;
  }

  function tagline() {
    return lowerWins()
      ? 'House rules · fewest points wins'
      : 'Standard scoring · most points wins';
  }

  function cardHtml(player, seated) {
    const selected = seated.indexOf(player.id) !== -1;
    const name = escapeHtml(player.name);
    const body = '<span class="disc" aria-hidden="true">' + escapeHtml(player.emoji) + '</span>'
      + (selected ? '<span class="tick" aria-hidden="true">' + icon('check', 13) + '</span>' : '')
      + '<span class="nm">' + name + '</span>'
      + '<span class="st">' + (selected ? 'playing' : (ui.manageMode ? 'not playing' : 'tap to add')) + '</span>';
    const classes = 'pcard' + (selected ? ' on' : '');

    if (!ui.manageMode) {
      return '<article class="' + classes + '" style="--pc:' + escapeHtml(player.color) + '">'
        + '<button type="button" class="pcard-body" data-action="toggle-seat" data-id="' + player.id
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

  function soloHeader() {
    return '<header class="topbar"><div><h1 class="wordmark">SOLO Scorekeeper</h1>'
      + '<p class="tagline">' + escapeHtml(tagline()) + '</p></div>'
      + '<nav class="topbar-links"><a class="btn ghost" href="#/rules">Rules</a>'
      + '<a class="btn ghost" href="#/history">History</a></nav></header>';
  }

  function lobbyHeader() {
    const status = space.status();
    return '<header class="topbar"><div>'
      + '<h1 class="wordmark">' + escapeHtml(status.name || 'Shared scorekeeper') + '</h1>'
      + '<p class="tagline"><span class="code-chip">' + escapeHtml(chunkCode(status.code)) + '</span>'
      + '<span class="presence">' + status.online + ' here</span></p></div>'
      + '<nav class="topbar-links"><a class="btn ghost" href="#/rules">Rules</a>'
      + '<a class="btn ghost" href="#/history">History</a></nav></header>';
  }

  function playTogetherHtml() {
    if (space) {
      const status = space.status();
      const problem = status.problem
        ? '<p class="error">' + escapeHtml(status.problem) + '</p>' : '';
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
        html += '<p class="hint">Everyone with the code <strong>' + escapeHtml(chunkCode(status.code))
          + '</strong> sees and edits this scorekeeper. Scores save to the internet, not just this phone.</p>'
          + problem
          + '<div class="row"><button type="button" class="btn ghost" data-action="rename-lobby">Rename</button>'
          + '<button type="button" class="btn ghost" data-action="leave-lobby">Leave lobby</button></div>';
      }
      if (ui.lobbyNote) html += '<p class="hint">' + escapeHtml(ui.lobbyNote) + '</p>';
      return html + '</section>';
    }

    if (!adapter) {
      return '<section class="panel"><p class="label">Play together</p>'
        + '<p class="hint">Sharing is not set up on this copy of the app, so scores stay on this phone.</p>'
        + '</section>';
    }

    let html = '<section class="panel"><p class="label">Play together</p>'
      + '<p class="hint">Share one scorekeeper with another phone: the players, the games and the history.</p>';

    if (ui.lobbyForm === 'create') {
      html += '<form id="create-lobby-form">'
        + '<label class="label" for="lobby-name">Name this space (optional)</label>'
        + '<input id="lobby-name" class="input" maxlength="24" autocomplete="off" placeholder="Kitchen table" value="'
        + escapeHtml(ui.lobbyName) + '">'
        + '<div class="row"><button type="submit" class="btn primary">Create lobby</button>'
        + '<button type="button" class="btn ghost" data-action="close-lobby-form">Cancel</button></div>'
        + '</form>';
    } else if (ui.lobbyForm === 'join') {
      html += '<form id="join-lobby-form">'
        + '<label class="label" for="lobby-code">Lobby code</label>'
        + '<input id="lobby-code" class="input" maxlength="9" autocomplete="off" autocapitalize="characters"'
        + ' spellcheck="false" placeholder="ABCD 2345" value="' + escapeHtml(ui.lobbyCode) + '">'
        + '<div class="row"><button type="submit" class="btn primary">Join lobby</button>'
        + '<button type="button" class="btn ghost" data-action="close-lobby-form">Cancel</button></div>'
        + '</form>';
    } else {
      html += '<div class="row"><button type="button" class="btn primary" data-action="open-create-lobby">Create a lobby</button>'
        + '<button type="button" class="btn ghost" data-action="open-join-lobby">Enter a code</button></div>';
    }

    if (ui.lobbyNote) html += '<p class="hint">' + escapeHtml(ui.lobbyNote) + '</p>';
    return html + '</section>';
  }

  function renderHome() {
    const state = backend.getState();
    const seated = state.selection;
    let html = '';

    html += inLobby() ? lobbyHeader() : soloHeader();

    const lower = lowerWins();
    html += '<section class="panel"><p class="label">Scoring</p>'
      + '<div class="segmented" role="group" aria-label="Scoring direction">'
      + '<button type="button" data-action="set-scoring" data-lower="true" aria-pressed="'
      + (lower ? 'true' : 'false') + '">Fewest points wins</button>'
      + '<button type="button" data-action="set-scoring" data-lower="false" aria-pressed="'
      + (lower ? 'false' : 'true') + '">Most points wins</button></div>'
      + '<p class="hint">' + (lower
        ? 'House rules: the lowest total is crowned Winner.'
        : 'Standard UNO/SOLO: the highest total is crowned Winner.') + '</p></section>';

    const active = backend.activeGames();
    if (active.length > 0) {
      html += '<section class="section"><div class="section-head"><h2>Playing now</h2></div>'
        + '<ul class="games">' + active.map(function (game) {
          const names = game.seats.map(function (seat) { return seat.name; }).join(' · ');
          const rounds = game.rounds.length;
          return '<li><button class="game-row" data-action="resume-game" data-id="' + game.id + '">'
            + '<span class="label">Round ' + (rounds + 1) + '</span>'
            + '<span class="game-winner">' + escapeHtml(names) + '</span>'
            + '<span class="game-totals">' + rounds + ' round' + (rounds === 1 ? '' : 's') + ' played</span>'
            + '</button></li>';
        }).join('') + '</ul></section>';
    }

    html += '<section class="section"><div class="section-head"><h2>Players</h2>';
    if (state.players.length > 0) {
      html += '<button type="button" class="btn ghost" data-action="toggle-manage" aria-pressed="'
        + (ui.manageMode ? 'true' : 'false') + '">' + (ui.manageMode ? 'Done' : 'Edit players') + '</button>';
    }
    html += '</div>';
    if (state.players.length === 0) {
      html += '<p class="hint">No players yet &mdash; add the first one.</p>';
    }
    html += '<div class="roster">' + state.players.map(function (player) {
      return cardHtml(player, seated);
    }).join('') + '<button type="button" class="pcard add-card" data-action="open-add">'
      + '<span class="add-face" aria-hidden="true">' + icon('plus', 20) + '</span>'
      + '<span class="nm">Add player</span></button></div></section>';

    if (ui.addPanelOpen) html += addPanelHtml();
    if (ui.addError) html += '<p class="error">' + escapeHtml(ui.addError) + '</p>';

    html += playTogetherHtml();

    const ready = state.selection.length > 0;
    html += '<div class="footer"><button class="btn primary big" data-action="start-game"'
      + (ready ? '' : ' disabled') + '>Start game</button>';
    if (!ready) html += '<p class="hint">Tap the players who are playing tonight.</p>';
    html += '</div>';
    return html;
  }

  function renderGame(gameId) {
    const game = gameFor(gameId);
    if (!game) { navigate('home'); return ''; }
    // A paired lobby re-renders on every snapshot, so whatever is half-typed has
    // to be carried across renders or the other phone would wipe it.
    if (ui.roundGameId !== gameId) { ui.roundGameId = gameId; ui.roundDraft = {}; }
    const totals = Ranking.totalsFor(game);
    const played = game.rounds.length > 0;
    const leader = played
      ? (lowerWins() ? Math.min.apply(null, totals) : Math.max.apply(null, totals))
      : null;

    let html = '<header class="topbar"><div><p class="label">Round ' + (game.rounds.length + 1)
      + '</p><h1 class="wordmark">SOLO Scorekeeper</h1></div>'
      + '<a class="btn ghost" href="#/home">Leave</a></header>';

    if (inLobby()) {
      const status = space.status();
      html += '<p class="live">● Live &middot; ' + escapeHtml(chunkCode(status.code)) + ' &middot; '
        + status.online + ' here. Everyone with the code sees this game.</p>';
    }

    html += '<div class="tiles">' + game.seats.map(function (seat, i) {
      const classes = played && totals[i] === leader ? 'tile leading' : 'tile';
      return '<article class="' + classes + '" style="--tile-color:' + escapeHtml(seat.color) + '">'
        + '<div class="tile-head"><span class="disc" aria-hidden="true">' + escapeHtml(seat.emoji)
        + '</span><span class="tile-name">' + escapeHtml(seat.name) + '</span></div>'
        + '<div class="tile-total">' + totals[i] + '</div>'
        + '<p class="tile-caption">total</p>'
        + '<input class="input tile-input" inputmode="numeric" pattern="[0-9-]*"'
        + ' data-seat="' + escapeHtml(seat.id) + '" aria-label="Points for ' + escapeHtml(seat.name)
        + ' this round" autocomplete="off" value="' + escapeHtml(ui.roundDraft[seat.id] || '')
        + '"></article>';
    }).join('') + '</div>';

    if (ui.addPanelOpen) html += addPanelHtml();
    if (ui.addError) html += '<p class="error">' + escapeHtml(ui.addError) + '</p>';

    html += '<button class="btn primary big" data-action="save-round">Save round</button>'
      + '<div class="row">'
      + '<button class="btn ghost" data-action="undo-round"' + (game.rounds.length ? '' : ' disabled')
      + '>Undo last round</button>'
      + '<button class="btn ghost" data-action="open-add-mid">+ Add player</button>'
      + '<button class="btn danger" data-action="end-game"' + (game.rounds.length ? '' : ' disabled')
      + '>End game</button>'
      + '</div>';
    return html;
  }

  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short'
    });
  }

  function renderPodium(gameId) {
    const target = gameId ? backend.getGame(gameId) : backend.finishedGames()[0];
    if (!target) { navigate('home'); return ''; }
    const ranked = Ranking.rank(target, lowerWins());
    const highest = ranked.length ? Math.max.apply(null, ranked.map(function (r) { return r.total; })) : 0;

    let html = '<header class="topbar"><div><h1 class="wordmark">Final scores</h1>'
      + '<p class="tagline">' + escapeHtml(formatDate(target.startedAt)) + '</p></div>'
      + '<a class="btn ghost" href="#/home">Close</a></header>';

    html += '<div class="podium">' + ranked.map(function (entry) {
      const classes = ['bar-col'];
      if (entry.isWinner) classes.push('winner');
      if (entry.isLoser) classes.push('loser');
      const height = Math.max(28, Math.round((entry.total / Math.max(1, highest)) * 220));
      return '<div class="' + classes.join(' ') + '" style="--tile-color:' + escapeHtml(entry.seat.color)
        + ';--bar-height:' + height + 'px">'
        + '<span class="bar-total" data-total="' + entry.total + '">0</span>'
        + '<div class="bar"><span class="crown">👑</span></div>'
        + '<span class="bar-name">' + escapeHtml(entry.seat.emoji) + ' ' + escapeHtml(entry.seat.name) + '</span>'
        + (entry.isWinner ? '<span class="badge win">Winner</span>' : '')
        + (entry.isLoser ? '<span class="badge lose">Loser</span>' : '')
        + '</div>';
    }).join('') + '</div>';

    if (ui.addError) html += '<p class="error">' + escapeHtml(ui.addError) + '</p>';

    html += '<div class="actions">';
    const active = backend.activeGames();
    if (active.length > 0) {
      html += '<button class="btn primary big" data-action="resume-game" data-id="' + active[0].id
        + '">Resume game</button>'
        + '<p class="hint">A game is in progress.</p>';
    } else {
      html += '<button class="btn primary big" data-action="play-again">Play again</button>';
    }
    html += '<div class="row"><button class="btn ghost" data-action="new-players">New players</button>'
      + '<a class="btn ghost" href="#/history">History</a></div></div>';
    return html;
  }

  function renderHistory() {
    const games = backend.finishedGames();
    let html = '<header class="topbar"><div><h1 class="wordmark">History</h1>'
      + '<p class="tagline">' + games.length + ' game' + (games.length === 1 ? '' : 's') + ' played</p></div>'
      + '<a class="btn ghost" href="#/home">Back</a></header>';

    if (games.length === 0) {
      html += '<div class="empty-state"><p>No finished games yet.</p>'
        + '<p class="hint">Finish a game and it will show up here.</p></div>';
      return html;
    }

    html += '<ul class="games">' + games.map(function (game) {
      const ranked = Ranking.rank(game, lowerWins());
      const winner = ranked.filter(function (entry) { return entry.isWinner; })
        .map(function (entry) { return entry.seat.name + ' ' + entry.total; }).join(' & ');
      const others = ranked.map(function (entry) {
        return escapeHtml(entry.seat.name) + ' ' + entry.total;
      }).join(' · ');
      return '<li><button class="game-row" data-action="open-game" data-id="' + game.id + '">'
        + '<span class="label">' + escapeHtml(formatDate(game.startedAt)) + '</span>'
        + '<span class="game-winner">🏆 ' + escapeHtml(winner) + '</span>'
        + '<span class="game-totals">' + others + '</span></button></li>';
    }).join('') + '</ul>';
    return html;
  }

  function renderRules() {
    let html = '<header class="topbar"><div><h1 class="wordmark">Rules</h1>'
      + '<p class="tagline">How the scores work</p></div>'
      + '<a class="btn ghost" href="#/home">Back</a></header>';

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
    if (action === 'open-add') { ui.addPanelOpen = true; ui.addTarget = 'roster'; ui.addEditId = null; ui.addName = ''; ui.addEmoji = EMOJI[0]; render(); focusName(); }
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
    else if (action === 'toggle-seat') { backend.toggleSeat(trigger.getAttribute('data-id')); render(); }
    else if (action === 'toggle-manage') {
      ui.manageMode = !ui.manageMode;
      ui.pendingDelete = null;
      render();
    }
    else if (action === 'ask-delete') { ui.pendingDelete = trigger.getAttribute('data-id'); render(); }
    else if (action === 'cancel-delete') { ui.pendingDelete = null; render(); }
    else if (action === 'confirm-delete') {
      try { backend.removePlayer(trigger.getAttribute('data-id')); }
      catch (error) { ui.addError = error.message; }
      ui.pendingDelete = null;
      render();
    }
    else if (action === 'resume-game') {
      const id = trigger.getAttribute('data-id');
      navigate(id ? 'game/' + id : 'game');
    }
    else if (action === 'open-game') navigate('podium/' + trigger.getAttribute('data-id'));
    else if (action === 'start-game') {
      try { navigate('game/' + backend.startGame().id); }
      catch (error) { ui.addError = error.message; render(); }
    }
    else if (action === 'save-round') saveRound();
    else if (action === 'undo-round') {
      try { backend.undoRound(currentGameId()); } catch (error) { ui.addError = error.message; }
      render();
    }
    else if (action === 'open-add-mid') { ui.addPanelOpen = true; ui.addTarget = 'game'; ui.addEditId = null; ui.addName = ''; ui.addEmoji = EMOJI[0]; render(); focusName(); }
    else if (action === 'end-game') {
      try { navigate('podium/' + backend.finishGame(currentGameId()).id); }
      catch (error) { ui.addError = error.message; render(); }
    }
    else if (action === 'play-again') {
      try { navigate('game/' + backend.playAgain(currentRoute().id || null).id); }
      catch (error) { ui.addError = error.message; render(); }
    }
    else if (action === 'new-players') navigate('home');
    else if (action === 'set-scoring') {
      backend.setLowerWins(trigger.getAttribute('data-lower') === 'true');
      render();
    }
    else if (action === 'dismiss-banner') { ui.bannerDismissed = true; refreshBanner(); }
    else if (action === 'open-create-lobby') {
      ui.lobbyForm = 'create'; ui.addError = ''; render(); focusById('lobby-name');
    }
    else if (action === 'open-join-lobby') {
      ui.lobbyForm = 'join'; ui.addError = ''; render(); focusById('lobby-code');
    }
    else if (action === 'close-lobby-form') { ui.lobbyForm = null; ui.addError = ''; render(); }
    else if (action === 'rename-lobby') {
      ui.lobbyForm = 'rename'; ui.lobbyName = space.status().name;
      ui.addError = ''; render(); focusById('lobby-name');
    }
    else if (action === 'leave-lobby') leaveLobby();
  });

  document.addEventListener('input', function (event) {
    if (event.target.id === 'new-player-name') ui.addName = event.target.value;
    else if (event.target.id === 'lobby-name') ui.lobbyName = event.target.value;
    else if (event.target.id === 'lobby-code') ui.lobbyCode = event.target.value;
    else if (event.target.getAttribute('data-seat')) {
      ui.roundDraft[event.target.getAttribute('data-seat')] = event.target.value;
    }
  });

  document.addEventListener('submit', function (event) {
    if (event.target.id === 'create-lobby-form') {
      event.preventDefault();
      ui.lobbyName = document.getElementById('lobby-name').value;
      createLobby(ui.lobbyName);
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
    if (event.target.id !== 'add-player-form') return;
    event.preventDefault();
    const name = document.getElementById('new-player-name').value;
    ui.addName = name;
    try {
      if (ui.addTarget === 'edit') backend.updatePlayer(ui.addEditId, name, ui.addEmoji);
      else if (ui.addTarget === 'game') backend.addPlayerToGame(currentGameId(), name, ui.addEmoji);
      else backend.addPlayer(name, ui.addEmoji);
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
    ui.lobbyNote = clean ? 'Renamed to ' + clean + '.' : 'Name cleared.';
    adapter.renameSpace(space.status().code, clean).then(function () {
      ui.lobbyForm = null;
      render();
    }).catch(function (error) {
      ui.addError = (error && error.message) || 'The lobby could not be renamed.';
      render();
    });
  }

  window.addEventListener('online', function () { if (space) render(); });
  window.addEventListener('offline', function () { if (space) render(); });

  const remembered = local.getState().lobby;
  if (remembered && adapter && Space.validCode(Space.normalizeCode(remembered.code))) {
    enterLobby(Space.normalizeCode(remembered.code), remembered.name);
  } else {
    render();
  }
})();
