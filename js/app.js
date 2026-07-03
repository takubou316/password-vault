import { deriveKey, kdfParams, encryptVault, decryptVault, DecryptionError } from './crypto.js';
import {
  createEmptyVault, listEntries, getEntry, addEntry, updateEntry, deleteEntry, findDuplicate, listCategories,
} from './vault-store.js';
import { saveBlob, loadBlob, saveDriveFileId, loadDriveFileId } from './local-cache.js';
import { importChromeCsv } from './import-csv.js';
import { parseNotesText } from './import-notes.js';
import * as drive from './drive-sync.js';
import * as ui from './ui.js';

let masterPasswordPlain = null; // メモリ上のみ。ストレージ/Driveには絶対に送らない。
let vaultKey = null;
let saltBase64 = null;
let vault = null;
let driveFileId = null;
let uploadTimer = null;

async function boot() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
  const existingBlob = await loadBlob();
  ui.setLockMode(existingBlob ? 'unlock' : 'setup');
  ui.showLockScreen();

  ui.el.unlockBtn.addEventListener('click', () => handleUnlock(existingBlob));
  ui.el.masterPasswordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleUnlock(existingBlob); });
  wireAppScreen();
}

async function handleUnlock(existingBlob) {
  const password = ui.el.masterPasswordInput.value;
  if (!password) { ui.setLockError('マスターパスワードを入力してください'); return; }

  if (!existingBlob) {
    const confirm = ui.el.masterPasswordConfirm.value;
    if (password !== confirm) { ui.setLockError('確認用パスワードが一致しません'); return; }
    const derived = await deriveKey(password);
    masterPasswordPlain = password;
    vaultKey = derived.key;
    saltBase64 = derived.saltBase64;
    vault = createEmptyVault();
    await persist();
    ui.showAppScreen();
    refreshList();
    return;
  }

  try {
    const derived = await deriveKey(password, existingBlob.kdf.salt);
    const decrypted = await decryptVault(derived.key, existingBlob.iv, existingBlob.ciphertext);
    masterPasswordPlain = password;
    vaultKey = derived.key;
    saltBase64 = existingBlob.kdf.salt;
    vault = decrypted;
    driveFileId = await loadDriveFileId();
    ui.showAppScreen();
    refreshList();
  } catch (err) {
    if (err instanceof DecryptionError) ui.setLockError(err.message);
    else ui.setLockError('解除に失敗しました');
  }
}

async function persist() {
  const { iv, ciphertext } = await encryptVault(vaultKey, vault);
  const blob = { kdf: kdfParams(saltBase64), iv, ciphertext, updatedAt: vault.updatedAt };
  await saveBlob(blob);
  scheduleUpload(blob);
}

function scheduleUpload(blob) {
  if (!drive.isSignedIn()) return;
  clearTimeout(uploadTimer);
  uploadTimer = setTimeout(async () => {
    ui.setSyncStatus('同期中...');
    try {
      const id = await drive.uploadVaultFile(driveFileId, blob).then((r) => r.id || driveFileId);
      if (!driveFileId && id) { driveFileId = id; await saveDriveFileId(id); }
      ui.setSyncStatus('同期済み ' + new Date().toLocaleTimeString('ja-JP'));
    } catch {
      ui.setSyncStatus('同期待ち（オフライン？）');
      drive.queueUpload(driveFileId, blob);
    }
  }, 3000);
}

function refreshList() {
  ui.updateCategoryList(listCategories(vault));
  ui.renderEntryList(listEntries(vault, ui.el.searchInput.value.trim()), openEntry);
}

function openEntry(id) {
  ui.openEntryForm(getEntry(vault, id));
}

function wireAppScreen() {
  ui.el.searchInput.addEventListener('input', refreshList);
  ui.el.addEntryBtn.addEventListener('click', () => ui.openEntryForm(null));
  ui.el.entryCancelBtn.addEventListener('click', () => ui.closeEntryForm());

  ui.el.togglePasswordVisibility.addEventListener('click', () => {
    ui.el.entryPassword.type = ui.el.entryPassword.type === 'password' ? 'text' : 'password';
  });
  ui.el.generatePasswordBtn.addEventListener('click', () => {
    ui.el.entryPassword.type = 'text';
    ui.el.entryPassword.value = ui.generatePassword();
  });

  ui.el.entrySaveBtn.addEventListener('click', async () => {
    const fields = ui.readEntryForm();
    if (!fields.siteName) { ui.setEntryError('サイト名を入力してください'); return; }
    const id = ui.el.entryModal.dataset.entryId;
    if (id) updateEntry(vault, id, fields);
    else addEntry(vault, fields);
    await persist();
    refreshList();
    ui.closeEntryForm();
  });

  ui.el.entryDeleteBtn.addEventListener('click', async () => {
    const id = ui.el.entryModal.dataset.entryId;
    if (!id) return;
    if (ui.el.entryDeleteBtn.dataset.armed !== 'true') {
      ui.el.entryDeleteBtn.dataset.armed = 'true';
      ui.el.entryDeleteBtn.textContent = 'もう一度押すと削除します';
      setTimeout(() => {
        ui.el.entryDeleteBtn.dataset.armed = 'false';
        ui.el.entryDeleteBtn.textContent = '削除';
      }, 4000);
      return;
    }
    ui.el.entryDeleteBtn.dataset.armed = 'false';
    ui.el.entryDeleteBtn.textContent = '削除';
    deleteEntry(vault, id);
    await persist();
    refreshList();
    ui.closeEntryForm();
    ui.showToast('削除しました');
  });

  ui.el.lockBtn.addEventListener('click', () => {
    masterPasswordPlain = null;
    vaultKey = null;
    vault = null;
    ui.setLockMode('unlock');
    ui.showLockScreen();
  });

  ui.el.syncBtn.addEventListener('click', syncWithDrive);
  wireImportModal();
}

async function syncWithDrive() {
  if (!drive.isConfigured()) {
    ui.setSyncStatus('未設定（CLIENT_IDを設定してください）');
    return;
  }
  ui.setSyncStatus('接続中...');
  try {
    await drive.initGoogleAuth();
    await drive.ensureAccessToken();
    if (!driveFileId) {
      driveFileId = await loadDriveFileId();
    }
    if (!driveFileId) {
      const found = await drive.findVaultFile();
      driveFileId = found?.id || null;
    }
    const localBlob = { kdf: kdfParams(saltBase64), ...(await encryptVault(vaultKey, vault)), updatedAt: vault.updatedAt };
    const result = await drive.resolveNewer(localBlob, driveFileId);

    if (result.source === 'drive') {
      const derived = await deriveKey(masterPasswordPlain, result.blob.kdf.salt);
      vault = await decryptVault(derived.key, result.blob.iv, result.blob.ciphertext);
      vaultKey = derived.key;
      saltBase64 = result.blob.kdf.salt;
      await saveBlob(result.blob);
      refreshList();
    } else if (result.source === 'local') {
      const uploadResult = await drive.uploadVaultFile(driveFileId, localBlob);
      if (!driveFileId && uploadResult.id) driveFileId = uploadResult.id;
    }
    if (driveFileId) await saveDriveFileId(driveFileId);
    ui.setSyncStatus('同期済み ' + new Date().toLocaleTimeString('ja-JP'));
  } catch (err) {
    ui.setSyncStatus('同期に失敗しました');
  }
}

function wireImportModal() {
  ui.el.importBtn.addEventListener('click', () => ui.openImportModal());
  ui.el.importCancelBtn.addEventListener('click', () => ui.closeImportModal());
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => ui.switchImportTab(btn.dataset.tab));
  });

  ui.el.csvFileInput.addEventListener('change', async () => {
    const file = ui.el.csvFileInput.files[0];
    if (!file) return;
    const text = await file.text();
    ui.renderImportReview(importChromeCsv(text).map((c) => ({ ...c, confidence: 'high' })));
  });

  ui.el.parseNotesBtn.addEventListener('click', () => {
    const text = ui.el.notesTextarea.value;
    ui.renderImportReview(parseNotesText(text));
  });

  ui.el.importConfirmBtn.addEventListener('click', async () => {
    const selections = ui.readReviewSelections();
    let added = 0, updated = 0;
    for (const s of selections) {
      if (!s.siteName && !s.email) continue;
      const dup = findDuplicate(vault, s.siteName, s.email);
      if (dup) { updateEntry(vault, dup.id, s); updated++; }
      else { addEntry(vault, s); added++; }
    }
    await persist();
    refreshList();
    ui.closeImportModal();
    ui.showToast(`インポート完了: 新規${added}件 / 更新${updated}件`);
  });
}

boot();
