// 「便利性重視」の生体認証(Face ID/指紋/Windows Hello等)によるロック解除。
//
// 重要な限界: WebAuthnの通常のアサーションには毎回ランダム性が含まれ再現性がないため、
// そこから安定した復号鍵を導出することはできない（PRF/hmac-secret拡張は対応端末が少ないため不採用）。
// 実体は「マスターパスワードをAES-GCMでラップ保存し、生体認証成功後にJSコードが復号して取り出す」方式。
// つまりWebAuthnの成功は「復号処理を許可するゲート」として機能するだけで、暗号学的に生体情報へ
// バインドされているわけではない。端末のストレージに直接アクセスされれば理論上は突破できる。
//
// バックエンドサーバーを持たないため、challenge/attestation/assertionの署名検証は行わない。
// create()/get()のPromiseが正常にresolveしたことのみを認証成功の判定材料とする。

import { bufToBase64, base64ToBuf, encryptString, decryptString } from './crypto.js';

const RP_NAME = 'Password Vault';
const TIMEOUT_MS = 60000;

// APIの存在だけでなく、実際に使える生体認証ハードウェア（Face ID/指紋/Windows Hello等）が
// あるかどうかまで確認する。これをしないと、PCなどハードウェアが無い環境でも「有効にする」ボタンが
// 出てしまい、押しても登録に失敗するだけになる。
export async function isSupported() {
  if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) return false;
  if (!window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// ブラウザ/OSがWebAuthnのtimeoutオプションを守らず無期限に固まるケースがあるため、
// アプリ側でも独自にタイムアウトさせ、ボタンが永久に固まったままにならないようにする。
function withTimeout(promise, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), TIMEOUT_MS)),
  ]);
}

// masterPasswordPlain: メモリ上にある平文マスターパスワード。戻り値はlocal-cache.saveBiometricUnlock()にそのまま渡せる。
export async function enroll(masterPasswordPlain) {
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const credential = await withTimeout(navigator.credentials.create({
    publicKey: {
      rp: { name: RP_NAME },
      user: { id: userId, name: 'vault-user', displayName: 'Password Vault' },
      challenge,
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: TIMEOUT_MS,
    },
  }), '生体認証の登録がタイムアウトしました');
  if (!credential) throw new Error('生体認証の登録に失敗しました');

  const wrapKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const { iv, ciphertext } = await encryptString(wrapKey, masterPasswordPlain);
  const rawWrapKey = await crypto.subtle.exportKey('raw', wrapKey);

  return {
    credentialId: bufToBase64(credential.rawId),
    wrapKeyBase64: bufToBase64(rawWrapKey),
    iv,
    ciphertext,
    createdAt: new Date().toISOString(),
  };
}

// 生体認証ゲートを通過できればマスターパスワード平文を返す。キャンセル/失敗時は例外を投げる。
export async function unlock(record) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  await withTimeout(navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ id: base64ToBuf(record.credentialId), type: 'public-key' }],
      userVerification: 'required',
      timeout: TIMEOUT_MS,
    },
  }), '生体認証がタイムアウトしました');

  const wrapKey = await crypto.subtle.importKey('raw', base64ToBuf(record.wrapKeyBase64), { name: 'AES-GCM' }, false, ['decrypt']);
  return decryptString(wrapKey, record.iv, record.ciphertext);
}
