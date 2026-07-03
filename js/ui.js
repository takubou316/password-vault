// DOM描画とイベントハンドラの結線のみを担当する。vault操作や暗号化・同期のロジックは持たない。

const $ = (id) => document.getElementById(id);

export const el = {
  lockScreen: $('lock-screen'),
  lockModeLabel: $('lock-mode-label'),
  biometricUnlockBtn: $('biometric-unlock-btn'),
  biometricOrLabel: $('biometric-or-label'),
  biometricUnavailableNote: $('biometric-unavailable-note'),
  masterPasswordInput: $('master-password-input'),
  toggleMasterPasswordVisibility: $('toggle-master-password-visibility'),
  masterPasswordConfirm: $('master-password-confirm'),
  unlockBtn: $('unlock-btn'),
  lockError: $('lock-error'),

  appScreen: $('app-screen'),
  searchInput: $('search-input'),
  addEntryBtn: $('add-entry-btn'),
  importBtn: $('import-btn'),
  syncBtn: $('sync-btn'),
  syncStatus: $('sync-status'),
  deviceSettingsBtn: $('device-settings-btn'),
  lockBtn: $('lock-btn'),
  entryList: $('entry-list'),
  emptyMessage: $('empty-message'),

  deviceSettingsModal: $('device-settings-modal'),
  deviceSettingsCloseBtn: $('device-settings-close-btn'),
  biometricUnsupportedNote: $('biometric-unsupported-note'),
  biometricStatus: $('biometric-status'),
  biometricEnableBtn: $('biometric-enable-btn'),
  biometricDisableBtn: $('biometric-disable-btn'),
  biometricSettingsError: $('biometric-settings-error'),

  entryModal: $('entry-modal'),
  entryModalTitle: $('entry-modal-title'),
  entrySiteName: $('entry-siteName'),
  entryCategory: $('entry-category'),
  categoryList: $('category-list'),
  entryUrl: $('entry-url'),
  entryEmail: $('entry-email'),
  entryPassword: $('entry-password'),
  togglePasswordVisibility: $('toggle-password-visibility'),
  generatePasswordBtn: $('generate-password-btn'),
  entryNotes: $('entry-notes'),
  entryCreatedAt: $('entry-created-at'),
  entryError: $('entry-error'),
  entrySaveBtn: $('entry-save-btn'),
  entryDeleteBtn: $('entry-delete-btn'),
  entryCancelBtn: $('entry-cancel-btn'),

  importModal: $('import-modal'),
  importTabCsv: $('import-tab-csv'),
  importTabNotes: $('import-tab-notes'),
  csvFileInput: $('csv-file-input'),
  notesTextarea: $('notes-textarea'),
  parseNotesBtn: $('parse-notes-btn'),
  importReviewContainer: $('import-review-container'),
  importConfirmBtn: $('import-confirm-btn'),
  importCancelBtn: $('import-cancel-btn'),
};

// デフォルメした目のアイコン。絵文字の👁だと生々しくて怖いという声があったため線画SVGにしている。
const EYE_OPEN_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>`;
const EYE_CLOSED_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12.5s3.8 4.5 10 4.5 10-4.5 10-4.5"/><path d="M6.5 15.3 5 17.5M17.5 15.3 19 17.5M12 17.3v2.4"/></svg>`;

// visible=trueなら「今見えている」ので開いた目、falseなら閉じた目を表示する。
export function setEyeIcon(button, visible) {
  button.innerHTML = visible ? EYE_OPEN_SVG : EYE_CLOSED_SVG;
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function showLockScreen() {
  el.lockScreen.style.display = '';
  el.appScreen.style.display = 'none';
}

export function showAppScreen() {
  el.lockScreen.style.display = 'none';
  el.appScreen.style.display = '';
  el.masterPasswordInput.value = '';
  el.masterPasswordConfirm.value = '';
}

export function setLockMode(mode) {
  el.lockModeLabel.textContent = mode === 'setup'
    ? 'はじめまして。マスターパスワードを新しく決めてください。'
    : 'マスターパスワードを入力してください。';
  el.masterPasswordConfirm.style.display = mode === 'setup' ? '' : 'none';
  el.lockError.textContent = '';
}

export function setLockError(message) {
  el.lockError.textContent = message || '';
}

export function showBiometricUnlockButton() {
  el.biometricUnlockBtn.style.display = '';
  el.biometricOrLabel.style.display = '';
}

export function hideBiometricUnlockButton() {
  el.biometricUnlockBtn.style.display = 'none';
  el.biometricOrLabel.style.display = 'none';
}

export function showBiometricUnavailableNote() {
  el.biometricUnavailableNote.style.display = '';
}

export function openDeviceSettingsModal({ supported, enrolled }) {
  el.biometricUnsupportedNote.style.display = supported ? 'none' : '';
  el.biometricEnableBtn.style.display = supported && !enrolled ? '' : 'none';
  el.biometricDisableBtn.style.display = enrolled ? '' : 'none';
  el.biometricStatus.textContent = enrolled ? '生体認証: 有効' : '生体認証: 無効';
  el.biometricSettingsError.textContent = '';
  el.deviceSettingsModal.style.display = '';
}

export function closeDeviceSettingsModal() {
  el.deviceSettingsModal.style.display = 'none';
}

export function setBiometricSettingsStatus(enrolled) {
  el.biometricStatus.textContent = enrolled ? '生体認証: 有効' : '生体認証: 無効';
  el.biometricEnableBtn.style.display = enrolled ? 'none' : '';
  el.biometricDisableBtn.style.display = enrolled ? '' : 'none';
}

export function setBiometricSettingsError(message) {
  el.biometricSettingsError.textContent = message || '';
}

export function renderEntryList(entries, onSelect) {
  el.entryList.innerHTML = '';
  el.emptyMessage.style.display = entries.length ? 'none' : '';
  for (const entry of entries) {
    const li = document.createElement('li');
    li.className = 'entry-item';
    li.innerHTML = `
      <div>
        <div class="entry-name">${escapeHtml(entry.siteName || '(名称未設定)')}</div>
        <div class="entry-sub">${escapeHtml(entry.category)}${entry.email ? ' ・ ' + escapeHtml(entry.email) : ''}</div>
      </div>
      <div class="entry-sub">${entry.createdAt ? new Date(entry.createdAt).toLocaleDateString('ja-JP') : ''}</div>
    `;
    li.addEventListener('click', () => onSelect(entry.id));
    el.entryList.appendChild(li);
  }
}

export function updateCategoryList(categories) {
  el.categoryList.innerHTML = categories.map((c) => `<option value="${escapeHtml(c)}">`).join('');
}

export function openEntryForm(entry) {
  el.entryModalTitle.textContent = entry ? 'サイト情報を編集' : '新規登録';
  el.entrySiteName.value = entry?.siteName || '';
  el.entryCategory.value = entry?.category || '';
  el.entryUrl.value = entry?.url || '';
  el.entryEmail.value = entry?.email || '';
  el.entryPassword.value = entry?.password || '';
  el.entryPassword.type = 'password';
  setEyeIcon(el.togglePasswordVisibility, false);
  el.entryNotes.value = entry?.notes || '';
  el.entryCreatedAt.textContent = entry ? `作成日: ${new Date(entry.createdAt).toLocaleString('ja-JP')}` : '';
  el.entryError.textContent = '';
  el.entryDeleteBtn.style.display = entry ? '' : 'none';
  el.entryDeleteBtn.textContent = '削除';
  el.entryDeleteBtn.dataset.armed = 'false';
  el.entryModal.style.display = '';
  el.entryModal.dataset.entryId = entry?.id || '';
}

export function closeEntryForm() {
  el.entryModal.style.display = 'none';
}

export function readEntryForm() {
  return {
    siteName: el.entrySiteName.value.trim(),
    category: el.entryCategory.value.trim(),
    url: el.entryUrl.value.trim(),
    email: el.entryEmail.value.trim(),
    password: el.entryPassword.value,
    notes: el.entryNotes.value.trim(),
  };
}

export function setEntryError(message) {
  el.entryError.textContent = message || '';
}

export function setSyncStatus(text) {
  el.syncStatus.textContent = text;
}

export function openImportModal() {
  el.importModal.style.display = '';
  el.importReviewContainer.innerHTML = '';
  el.importConfirmBtn.style.display = 'none';
  el.csvFileInput.value = '';
  el.notesTextarea.value = '';
}

export function closeImportModal() {
  el.importModal.style.display = 'none';
}

export function switchImportTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  el.importTabCsv.style.display = tab === 'csv' ? '' : 'none';
  el.importTabNotes.style.display = tab === 'notes' ? '' : 'none';
}

// candidates: [{siteName, email, password, url, notes?, confidence?}]
// レビュー結果は確認ボタン押下時にreadReviewSelections()で読み出す。
export function renderImportReview(candidates) {
  el.importReviewContainer.innerHTML = '';
  candidates.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'review-row' + (c.confidence === 'low' ? ' review-confidence-low' : '');
    row.dataset.index = i;
    row.innerHTML = `
      <input type="checkbox" class="review-check" ${c.confidence === 'low' ? '' : 'checked'}>
      <input type="text" class="review-siteName" placeholder="サイト名" value="${escapeHtml(c.siteName || '')}">
      <input type="text" class="review-email" placeholder="メール/ID" value="${escapeHtml(c.email || '')}">
      <input type="text" class="review-password" placeholder="パスワード" value="${escapeHtml(c.password || '')}">
      <input type="text" class="review-url" placeholder="URL" value="${escapeHtml(c.url || '')}">
    `;
    el.importReviewContainer.appendChild(row);
  });
  el.importConfirmBtn.style.display = candidates.length ? '' : 'none';
}

export function readReviewSelections() {
  const rows = el.importReviewContainer.querySelectorAll('.review-row');
  const result = [];
  rows.forEach((row) => {
    if (!row.querySelector('.review-check').checked) return;
    result.push({
      siteName: row.querySelector('.review-siteName').value.trim(),
      email: row.querySelector('.review-email').value.trim(),
      password: row.querySelector('.review-password').value,
      url: row.querySelector('.review-url').value.trim(),
    });
  });
  return result;
}

let toastTimer = null;
export function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

export function generatePassword(length = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+';
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}
