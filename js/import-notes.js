// スマホのメモアプリなどに雑然と書き溜められたテキストから、サイト名/ID(メール)/パスワード/URLの
// 候補をヒューリスティックに抽出する。自動保存はせず、必ずレビューUIを経由させること。

const PATTERNS = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  url: /https?:\/\/[^\s]+/,
  labeledPassword: /^\s*(pass(word)?|pw|パスワード|パス)\s*[:：]\s*(.+)$/i,
  labeledId: /^\s*(id|user(name)?|アカウント|ユーザー名|ログイン(id)?)\s*[:：]\s*(.+)$/i,
  labeledSite: /^\s*(site|サイト|名前|サービス)\s*[:：]\s*(.+)$/i,
  separator: /^[-=＝―_*]{3,}$/,
};

function splitBlocks(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const blocks = [];
  let current = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '' || PATTERNS.separator.test(line)) {
      if (current.length) blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);
  return blocks;
}

function parseBlock(lines) {
  const candidate = { siteName: '', email: '', password: '', url: '', notes: '' };
  const leftoverLines = [];
  let matchedCount = 0;

  for (const line of lines) {
    let m;
    if ((m = line.match(PATTERNS.labeledPassword))) {
      candidate.password = m[3].trim(); matchedCount++; continue;
    }
    if ((m = line.match(PATTERNS.labeledId))) {
      if (!candidate.email) candidate.email = m[4].trim();
      matchedCount++; continue;
    }
    if ((m = line.match(PATTERNS.labeledSite))) {
      candidate.siteName = m[2].trim(); matchedCount++; continue;
    }
    if ((m = line.match(PATTERNS.url))) {
      candidate.url = m[0]; matchedCount++;
      const rest = line.replace(PATTERNS.url, '').trim();
      if (rest) leftoverLines.push(rest);
      continue;
    }
    if ((m = line.match(PATTERNS.email))) {
      if (!candidate.email) candidate.email = m[0];
      matchedCount++;
      const rest = line.replace(PATTERNS.email, '').trim();
      if (rest) leftoverLines.push(rest);
      continue;
    }
    leftoverLines.push(line);
  }

  // ラベルなしの残り行から、サイト名とパスワードを推測で割り当てる。
  if (!candidate.siteName && leftoverLines.length) {
    candidate.siteName = leftoverLines.shift();
  }
  if (!candidate.password) {
    const pwIdx = leftoverLines.findIndex((l) => /^[\w!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]{4,}$/.test(l) && !/\s/.test(l));
    if (pwIdx !== -1) {
      candidate.password = leftoverLines.splice(pwIdx, 1)[0];
      matchedCount++;
    }
  }
  candidate.notes = leftoverLines.join(' / ');

  const confidence = matchedCount >= 2 && candidate.password ? 'high' : (candidate.password || candidate.email) ? 'medium' : 'low';
  return { ...candidate, confidence, raw: lines.join('\n') };
}

export function parseNotesText(text) {
  return splitBlocks(text).map(parseBlock);
}
