// マスターパスワード -> AES-GCM鍵導出、およびvault全体の暗号化/復号のみを担当する。
// マスターパスワードや導出鍵はこのモジュールの外に平文で漏らさない。

const PBKDF2_ITERATIONS = 600000;
const HASH = 'SHA-256';
const SALT_BYTES = 16;
const IV_BYTES = 12;

export class DecryptionError extends Error {
  constructor() {
    super('マスターパスワードが違います');
  }
}

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// saltBase64を渡すと既存saltで鍵を再導出（ログイン時）、渡さなければ新規salt生成（初回設定時）
export async function deriveKey(masterPassword, saltBase64) {
  const salt = saltBase64 ? new Uint8Array(base64ToBuf(saltBase64)) : crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: HASH },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return { key, saltBase64: bufToBase64(salt) };
}

export function kdfParams(saltBase64) {
  return { algorithm: 'PBKDF2', hash: HASH, iterations: PBKDF2_ITERATIONS, salt: saltBase64 };
}

export async function encryptVault(key, vaultObject) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(vaultObject));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { iv: bufToBase64(iv), ciphertext: bufToBase64(ciphertext) };
}

export async function decryptVault(key, ivBase64, ciphertextBase64) {
  try {
    const iv = new Uint8Array(base64ToBuf(ivBase64));
    const ciphertext = base64ToBuf(ciphertextBase64);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new DecryptionError();
  }
}
