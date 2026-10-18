(function () {
  'use strict';

  const store = Store.createStore(window.localStorage);
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
    addError: '', addName: '', bannerDismissed: false, manageMode: false, pendingDelete: null
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
    location.hash = '#/' + path;
  }

  function refreshBanner() {
    if (ui.bannerDismissed || !store.isDegraded()) {
      banner.hidden = true;
      banner.textContent = '';
      return;
    }
    const message = store.degradedReason() === 'blocked'
      ? 'This browser is blocking storage, so scores will be lost when you close the tab.'
      : 'Scores could not be saved to this browser and may not persist.';
    banner.innerHTML = '<span>' + escapeHtml(message) + '</span>'
      + '<button type="button" class="banner-dismiss" data-action="dismiss-banner" aria-label="Dismiss">Dismiss</button>';
    banner.hidden = false;
  }

  function render() {
    const route = currentRoute();
    if (route.name === 'podium') {
      const target = route.id ? store.getGame(route.id) : store.getState().games[0];
      if (!target) { navigate('home'); return; }
    }
    Object.keys(views).forEach(function (name) {
      views[name].hidden = name !== route.name;
    });
    if (route.name === 'home') views.home.innerHTML = renderHome();
    if (route.name === 'game') views.game.innerHTML = renderGame();
    if (route.name === 'podium') { views.podium.innerHTML = renderPodium(route.id); Reveal.playPodium(views.podium); }
    if (route.name === 'history') views.history.innerHTML = renderHistory();
    if (route.name === 'rules') views.rules.innerHTML = renderRules();
    refreshBanner();
  }

  function lowerWins() {
    return store.getSettings().lowerWins;
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

  function renderHome() {
    const state = store.getState();
    const seated = state.selection;
    let html = '';

    html += '<header class="topbar"><div><h1 class="wordmark">SOLO Scorekeeper</h1>'
      + '<p class="tagline">' + escapeHtml(tagline()) + '</p></div>'
      + '<nav class="topbar-links"><a class="btn ghost" href="#/rules">Rules</a>'
      + '<a class="btn ghost" href="#/history">History</a></nav></header>';

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

    if (state.currentGame) {
      const names = state.currentGame.seats.map(function (seat) { return seat.name; }).join(' · ');
      html += '<section class="panel"><p class="label">Game in progress</p>'
        + '<h2 style="font-size:1.05rem">' + state.currentGame.rounds.length + ' round'
        + (state.currentGame.rounds.length === 1 ? '' : 's') + ' played</h2>'
        + '<p class="muted">' + escapeHtml(names) + '</p>'
        + '<div class="row"><button class="btn primary" data-action="resume-game">Resume game</button></div>'
        + '</section>';
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

    if (!state.currentGame) {
      const ready = state.selection.length > 0;
      html += '<div class="footer"><button class="btn primary big" data-action="start-game"'
        + (ready ? '' : ' disabled') + '>Start game</button>';
      if (!ready) html += '<p class="hint">Tap the players who are playing tonight.</p>';
      html += '</div>';
    }
    return html;
  }

  function renderGame() {
    const game = store.getState().currentGame;
    if (!game) { navigate('home'); return ''; }
    const totals = Ranking.totalsFor(game);
    const played = game.rounds.length > 0;
    const leader = played
      ? (lowerWins() ? Math.min.apply(null, totals) : Math.max.apply(null, totals))
      : null;

    let html = '<header class="topbar"><div><p class="label">Round ' + (game.rounds.length + 1)
      + '</p><h1 class="wordmark">SOLO Scorekeeper</h1></div>'
      + '<a class="btn ghost" href="#/home">Leave</a></header>';

    html += '<div class="tiles">' + game.seats.map(function (seat, i) {
      const classes = played && totals[i] === leader ? 'tile leading' : 'tile';
      return '<article class="' + classes + '" style="--tile-color:' + escapeHtml(seat.color) + '">'
        + '<div class="tile-head"><span class="disc" aria-hidden="true">' + escapeHtml(seat.emoji)
        + '</span><span class="tile-name">' + escapeHtml(seat.name) + '</span></div>'
        + '<div class="tile-total">' + totals[i] + '</div>'
        + '<p class="tile-caption">total</p>'
        + '<input class="input tile-input" inputmode="numeric" pattern="[0-9-]*"'
        + ' data-seat="' + escapeHtml(seat.id) + '" aria-label="Points for ' + escapeHtml(seat.name)
        + ' this round" autocomplete="off"></article>';
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
    const state = store.getState();
    const game = state.games[0];
    const target = gameId ? store.getGame(gameId) : game;
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
    if (state.currentGame) {
      html += '<button class="btn primary big" data-action="resume-game">Resume game</button>'
        + '<p class="hint">A game is in progress.</p>';
    } else {
      html += '<button class="btn primary big" data-action="play-again">Play again</button>';
    }
    html += '<div class="row"><button class="btn ghost" data-action="new-players">New players</button>'
      + '<a class="btn ghost" href="#/history">History</a></div></div>';
    return html;
  }

  function renderHistory() {
    const games = store.getState().games;
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
    const before = Ranking.totalsFor(store.getState().currentGame || { seats: [], rounds: [] });
    const boxes = Array.prototype.slice.call(document.querySelectorAll('.tile-input'));
    try {
      store.recordRound(boxes.map(function (box) { return box.value; }));
    } catch (error) {
      ui.addError = error.message;
      render();
      return;
    }
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
      const player = store.getState().players.find(function (p) { return p.id === trigger.getAttribute('data-id'); });
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
    else if (action === 'toggle-seat') { store.toggleSeat(trigger.getAttribute('data-id')); render(); }
    else if (action === 'toggle-manage') {
      ui.manageMode = !ui.manageMode;
      ui.pendingDelete = null;
      render();
    }
    else if (action === 'ask-delete') { ui.pendingDelete = trigger.getAttribute('data-id'); render(); }
    else if (action === 'cancel-delete') { ui.pendingDelete = null; render(); }
    else if (action === 'confirm-delete') {
      try { store.removePlayer(trigger.getAttribute('data-id')); }
      catch (error) { ui.addError = error.message; }
      ui.pendingDelete = null;
      render();
    }
    else if (action === 'resume-game') navigate('game');
    else if (action === 'open-game') navigate('podium/' + trigger.getAttribute('data-id'));
    else if (action === 'start-game') {
      try { store.startGame(); navigate('game'); }
      catch (error) { ui.addError = error.message; render(); }
    }
    else if (action === 'save-round') saveRound();
    else if (action === 'undo-round') {
      try { store.undoRound(); } catch (error) { ui.addError = error.message; }
      render();
    }
    else if (action === 'open-add-mid') { ui.addPanelOpen = true; ui.addTarget = 'game'; ui.addEditId = null; ui.addName = ''; ui.addEmoji = EMOJI[0]; render(); focusName(); }
    else if (action === 'end-game') {
      try { store.finishGame(); navigate('podium'); }
      catch (error) { ui.addError = error.message; render(); }
    }
    else if (action === 'play-again') {
      try { store.playAgain(currentRoute().id || (store.getState().games[0] && store.getState().games[0].id)); navigate('game'); }
      catch (error) { ui.addError = error.message; render(); }
    }
    else if (action === 'new-players') navigate('home');
    else if (action === 'set-scoring') {
      store.setLowerWins(trigger.getAttribute('data-lower') === 'true');
      render();
    }
    else if (action === 'dismiss-banner') { ui.bannerDismissed = true; refreshBanner(); }
  });

  document.addEventListener('input', function (event) {
    if (event.target.id !== 'new-player-name') return;
    ui.addName = event.target.value;
  });

  document.addEventListener('submit', function (event) {
    if (event.target.id !== 'add-player-form') return;
    event.preventDefault();
    const name = document.getElementById('new-player-name').value;
    ui.addName = name;
    try {
      if (ui.addTarget === 'edit') store.updatePlayer(ui.addEditId, name, ui.addEmoji);
      else if (ui.addTarget === 'game') store.addPlayerToCurrentGame(name, ui.addEmoji);
      else store.addPlayer(name, ui.addEmoji);
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

  function focusName() {
    const field = document.getElementById('new-player-name');
    if (field) field.focus();
  }

  render();
})();
