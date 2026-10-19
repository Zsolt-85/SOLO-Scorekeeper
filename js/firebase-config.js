// Your Firebase web app configuration.
//
// This is not a secret: it ships inside the page for anyone to read, exactly like
// every other Firebase web app. The Firestore security rules (firestore.rules) are
// what actually guard the data, and they only allow access to a lobby you know the
// code for. If you ever want to narrow it further, restrict this API key to your own
// HTTP referrers in the Google Cloud console.

(function (global) {
  'use strict';

  global.FIREBASE_CONFIG = {
    apiKey: 'AIzaSyBsqO95QFSToDyh9zvF4aNjEU8T4s2-6L0',
    authDomain: 'solo-scorekeeper.firebaseapp.com',
    projectId: 'solo-scorekeeper',
    storageBucket: 'solo-scorekeeper.firebasestorage.app',
    messagingSenderId: '931893979727',
    appId: '1:931893979727:web:a3a057da73d38255c9d83a'
  };
})(typeof window !== 'undefined' ? window : globalThis);
