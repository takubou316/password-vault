// Chrome/Edgeの「パスワードをエクスポート」CSV（name,url,username,password ヘッダー）を解析する。
// 引用符・カンマ・改行を含む値に対応した最小限のRFC4180風パーサ（外部ライブラリ不使用）。

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// name,url,username,password の列順を想定しつつ、ヘッダーの並びが違っても列名で拾う。
export function importChromeCsv(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {
    name: header.indexOf('name'),
    url: header.indexOf('url'),
    username: header.indexOf('username'),
    password: header.indexOf('password'),
  };
  return rows.slice(1)
    .filter((r) => r.length > 1 || r[0] !== '')
    .map((r) => ({
      siteName: idx.name >= 0 ? (r[idx.name] || '') : '',
      url: idx.url >= 0 ? (r[idx.url] || '') : '',
      email: idx.username >= 0 ? (r[idx.username] || '') : '',
      password: idx.password >= 0 ? (r[idx.password] || '') : '',
    }))
    .filter((e) => e.siteName || e.url || e.email || e.password);
}
