// 復号済みvaultオブジェクト（メモリ上のJSオブジェクト）に対するCRUDのみ。
// 暗号化・永続化・同期のことは一切知らない。

const VAULT_VERSION = 1;

export function createEmptyVault() {
  return { version: VAULT_VERSION, updatedAt: new Date().toISOString(), entries: [] };
}

export function listEntries(vault, query) {
  const entries = vault.entries;
  if (!query) return entries;
  const q = query.toLowerCase();
  return entries.filter((e) =>
    [e.siteName, e.category, e.url, e.email, e.notes].some((v) => (v || '').toLowerCase().includes(q))
  );
}

export function getEntry(vault, id) {
  return vault.entries.find((e) => e.id === id) || null;
}

export function addEntry(vault, fields) {
  const now = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(),
    siteName: fields.siteName || '',
    category: fields.category || '',
    url: fields.url || '',
    email: fields.email || '',
    password: fields.password || '',
    notes: fields.notes || '',
    createdAt: fields.createdAt || now,
    updatedAt: now,
  };
  vault.entries.push(entry);
  vault.updatedAt = now;
  return entry;
}

export function updateEntry(vault, id, fields) {
  const entry = getEntry(vault, id);
  if (!entry) return null;
  Object.assign(entry, fields, { updatedAt: new Date().toISOString() });
  vault.updatedAt = entry.updatedAt;
  return entry;
}

export function deleteEntry(vault, id) {
  const idx = vault.entries.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  vault.entries.splice(idx, 1);
  vault.updatedAt = new Date().toISOString();
  return true;
}

export function findDuplicate(vault, siteName, email) {
  return vault.entries.find(
    (e) => e.siteName.toLowerCase() === (siteName || '').toLowerCase() && e.email.toLowerCase() === (email || '').toLowerCase()
  ) || null;
}

export function listCategories(vault) {
  return [...new Set(vault.entries.map((e) => e.category).filter(Boolean))].sort();
}
