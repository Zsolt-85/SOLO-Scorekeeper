// The only file that touches the Firebase SDK.
//
// The SDK is not script-tagged into the page: it is imported on demand, the first
// time somebody actually uses a lobby, so solo play never downloads or needs it.
// That dynamic import also means lobby mode needs a real origin (the hosted site or
// a local http server); from file:// the browser refuses the cross-origin import and
// the app stays happily solo.

(function (global) {
  'use strict';

  const VERSION = '11.6.0';
  const CDN = 'https://www.gstatic.com/firebasejs/' + VERSION + '/';
  const CONFIG = global.FIREBASE_CONFIG || null;

  let sdkPromise = null;

  function configured() {
    return !!(CONFIG && CONFIG.apiKey && CONFIG.projectId && CONFIG.appId);
  }

  function load() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = Promise.all([
      import(CDN + 'firebase-app.js'),
      import(CDN + 'firebase-auth.js'),
      import(CDN + 'firebase-firestore.js')
    ]).then(function (parts) {
      const appApi = parts[0];
      const authApi = parts[1];
      const storeApi = parts[2];
      const app = appApi.getApps().length ? appApi.getApp() : appApi.initializeApp(CONFIG);
      return {
        authApi: authApi,
        storeApi: storeApi,
        auth: authApi.getAuth(app),
        db: storeApi.getFirestore(app)
      };
    });
    return sdkPromise;
  }

  function signedIn(sdk) {
    return sdk.authApi.signInAnonymously(sdk.auth).then(function () { return sdk; });
  }

  function docPath(code, path) {
    return 'spaces/' + code + (path ? '/' + path : '');
  }

  function collectionOf(sdk, code, ...segments) {
    return sdk.storeApi.collection(sdk.db, docPath(code, segments.join('/')));
  }

  function connect(options) {
    return load().then(signedIn).then(function (sdk) {
      const api = sdk.storeApi;
      const db = sdk.db;
      const code = options.code;
      const space = api.doc(db, docPath(code));
      const docs = { space: null, players: [], games: [], rounds: {}, meta: null, presence: [] };
      const stops = [];
      const roundStops = {};
      let closed = false;

      function emit() {
        if (!closed) options.onData(docs, sdk);
      }

      function fail(error) {
        if (!closed && options.onError) options.onError(error);
      }

      function rows(snapshot) {
        return snapshot.docs.map(function (row) {
          return Object.assign({ id: row.id }, row.data());
        });
      }

      stops.push(api.onSnapshot(space, function (snapshot) {
        docs.space = snapshot.exists() ? Object.assign({ id: snapshot.id }, snapshot.data()) : null;
        emit();
      }, fail));

      stops.push(api.onSnapshot(api.collection(space, 'players'), function (snapshot) {
        docs.players = rows(snapshot);
        emit();
      }, fail));

      stops.push(api.onSnapshot(api.collection(space, 'meta'), function (snapshot) {
        docs.meta = snapshot.empty ? null : Object.assign({ id: snapshot.docs[0].id }, snapshot.docs[0].data());
        emit();
      }, fail));

      stops.push(api.onSnapshot(api.collection(space, 'presence'), function (snapshot) {
        docs.presence = rows(snapshot);
        emit();
      }, fail));

      stops.push(api.onSnapshot(api.collection(space, 'games'), function (snapshot) {
        docs.games = rows(snapshot);
        snapshot.docs.forEach(function (row) {
          if (roundStops[row.id]) return;
          roundStops[row.id] = api.onSnapshot(
            api.collection(space, 'games', row.id, 'rounds'),
            function (rounds) {
              docs.rounds[row.id] = rows(rounds);
              emit();
            },
            fail
          );
        });
        emit();
      }, fail));

      return function disconnect() {
        closed = true;
        stops.forEach(function (stop) { stop(); });
        Object.keys(roundStops).forEach(function (id) { roundStops[id](); });
        options.onData = null;
      };
    });
  }

  function commit(code, ops) {
    return load().then(signedIn).then(function (sdk) {
      const api = sdk.storeApi;
      const batch = api.writeBatch(sdk.db);
      ops.forEach(function (op) {
        const ref = api.doc(sdk.db, docPath(code, op.path));
        if (op.type === 'delete') batch.delete(ref);
        else batch.set(ref, op.data);
      });
      return batch.commit();
    });
  }

  function createSpace(code, name) {
    return load().then(signedIn).then(function (sdk) {
      const api = sdk.storeApi;
      const ref = api.doc(sdk.db, docPath(code));
      // A transaction so two phones creating at the same instant cannot both
      // claim one code: the second one gets 'already-exists' and retries.
      return api.runTransaction(sdk.db, function (transaction) {
        return transaction.get(ref).then(function (snapshot) {
          if (snapshot.exists()) {
            const error = new Error('That code is already taken. Please try again.');
            error.code = 'already-exists';
            throw error;
          }
          transaction.set(ref, { name: name || '', createdAt: Date.now() });
        });
      });
    });
  }

  function renameSpace(code, name) {
    return load().then(signedIn).then(function (sdk) {
      const api = sdk.storeApi;
      return api.setDoc(api.doc(sdk.db, docPath(code)), { name: name || '' }, { merge: true });
    });
  }

  function spaceExists(code) {
    return load().then(signedIn).then(function (sdk) {
      const api = sdk.storeApi;
      return api.getDoc(api.doc(sdk.db, docPath(code))).then(function (snapshot) {
        return snapshot.exists();
      });
    });
  }

  function heartbeat(code, deviceId) {
    return load().then(signedIn).then(function (sdk) {
      const api = sdk.storeApi;
      return api.setDoc(api.doc(sdk.db, docPath(code, 'presence/' + deviceId)), { seen: Date.now() });
    });
  }

  function leave(code, deviceId) {
    return load().then(signedIn).then(function (sdk) {
      const api = sdk.storeApi;
      return api.deleteDoc(api.doc(sdk.db, docPath(code, 'presence/' + deviceId)));
    });
  }

  const Firebase = {
    VERSION: VERSION,
    configured: configured,
    connect: connect,
    commit: commit,
    createSpace: createSpace,
    renameSpace: renameSpace,
    spaceExists: spaceExists,
    heartbeat: heartbeat,
    leave: leave
  };

  global.Firebase = Firebase;
  if (typeof module !== 'undefined' && module.exports) module.exports = Firebase;
})(typeof window !== 'undefined' ? window : globalThis);
