// Google Drive の appDataFolder（アプリ専用の非表示領域）に暗号化済みblobを保存/取得する。
// Google Identity Services (GIS) の Token Model を使ったクライアントサイドのみのOAuth。
// バックエンドサーバーは使わない。アクセストークンはメモリ上にのみ保持し、リロードで消える。
//
// 使う前に必ず下の CLIENT_ID を、Google Cloud Console で発行した自分のOAuthクライアントIDに
// 書き換えること（README/CLAUDE.md参照）。空のままだと同期機能は無効化される。

export const CLIENT_ID = ''; // ここに自分のOAuthクライアントID(.apps.googleusercontent.com)を設定する

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'vault.json';
const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;

export function isConfigured() {
  return !!CLIENT_ID;
}

function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Identity Servicesの読み込みに失敗しました'));
    document.head.appendChild(script);
  });
}

export async function initGoogleAuth() {
  if (!isConfigured()) throw new Error('Google Drive同期は未設定です（CLIENT_IDが空）');
  await loadGisScript();
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: () => {}, // requestAccessTokenのPromiseラッパー側で上書きする
  });
}

export function requestAccessToken() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) { reject(new Error('initGoogleAuth未実行')); return; }
    tokenClient.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000 - 60000;
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
  });
}

export async function ensureAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
  return requestAccessToken();
}

export function isSignedIn() {
  return !!accessToken;
}

async function driveFetch(url, options = {}) {
  const token = await ensureAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  return res;
}

export async function findVaultFile() {
  const url = `${API_BASE}/files?spaces=appDataFolder&q=${encodeURIComponent(`name='${FILE_NAME}'`)}&fields=files(id,modifiedTime)`;
  const res = await driveFetch(url);
  const data = await res.json();
  return data.files?.[0] || null;
}

export async function downloadVaultFile(fileId) {
  const res = await driveFetch(`${API_BASE}/files/${fileId}?alt=media`);
  return res.json();
}

export async function uploadVaultFile(fileId, blobJson) {
  const metadata = { name: FILE_NAME, parents: fileId ? undefined : ['appDataFolder'] };
  const boundary = 'vault_boundary_' + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(blobJson)}\r\n--${boundary}--`;

  const url = fileId
    ? `${UPLOAD_BASE}/files/${fileId}?uploadType=multipart`
    : `${UPLOAD_BASE}/files?uploadType=multipart`;
  const res = await driveFetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return res.json();
}

// ローカルとDriveのどちらが新しいか比較し、新しい方のblobを返す。
// 呼び出し側（app.js）がその結果をIndexedDBとDriveの両方に反映させる。
export async function resolveNewer(localBlob, fileId) {
  if (!fileId) return { source: 'local', blob: localBlob };
  const driveBlob = await downloadVaultFile(fileId);
  if (!localBlob) return { source: 'drive', blob: driveBlob };
  const localTime = new Date(localBlob.updatedAt).getTime();
  const driveTime = new Date(driveBlob.updatedAt).getTime();
  if (localTime === driveTime) return { source: 'same', blob: localBlob };
  return driveTime > localTime ? { source: 'drive', blob: driveBlob } : { source: 'local', blob: localBlob };
}

// オフライン時に溜まったアップロードをオンライン復帰時に再試行するための単純なキュー。
const pendingUploads = [];
let flushing = false;

export function queueUpload(fileId, blobJson) {
  pendingUploads.push({ fileId, blobJson });
  flushQueue();
}

export async function flushQueue() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    while (pendingUploads.length) {
      const { fileId, blobJson } = pendingUploads[0];
      const result = await uploadVaultFile(fileId, blobJson);
      pendingUploads.shift();
      if (!fileId && result.id) return result.id; // 新規作成時はfileIdを呼び出し側に伝える
    }
  } finally {
    flushing = false;
  }
  return null;
}

window.addEventListener('online', () => { flushQueue(); });
