// DOM描画とイベントハンドラの結線のみを担当する。vault操作や暗号化・同期のロジックは持たない。

const $ = (id) => document.getElementById(id);

export const el = {
  lockScreen: $('lock-screen'),
  lockModeLabel: $('lock-mode-label'),
  masterPasswordInput: $('master-password-input'),
  masterPasswordConfirm: $('master-password-confirm'),
  unlockBtn: $('unlock-btn'),
  lockError: $('lock-error'),

  appScreen: $('app-screen'),
  searchInput: $('search-input'),
  addEntryBtn: $('add-entry-btn'),
  importBtn: $('import-btn'),
  syncBtn: $('sync-btn'),
  syncStatus: $('sync-status'),
  lockBtn: $('lock-btn'),
  entryList: $('entry-list'),
  emptyMessage: $('empty-message'),

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
