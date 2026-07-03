// 静的アセットのみをオフラインキャッシュする。Google Drive APIへのリクエストは
// 素通し（キャッシュしない）にし、常に最新の同期状態を扱えるようにする。

const CACHE_NAME = 'vault-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/ui.js',
  './js/crypto.js',
  './js/vault-store.js',
  './js/local-cache.js',
  './js/drive-sync.js',
  './js/import-csv.js',
  './js/import-notes.js',
  './js/biometric.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin.includes('googleapis.com') || url.origin.includes('google.com')) {
    return; // Drive API / GISへのリクエストはキャッシュせずネットワークへ素通し
  }
  if (event.request.method !== 'GET') return;

  // ネットワーク優先: オンライン時は常に最新のコードを取得し、取れた分だけキャッシュを更新する。
  // オフライン時のみキャッシュにフォールバックする（cache-firstだと編集後も古いコードが残り続けるため）。
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
