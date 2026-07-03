# CLAUDE.md

このファイルはClaude Code（claude.ai/code）がこのリポジトリで作業する際のガイドです。

## アプリ概要

自分専用のパスワード管理PWA。ビルドステップなし・依存ライブラリなしのvanilla HTML/JS/CSS。
マスターパスワードから導出した鍵でvault全体をAES-GCM暗号化し、サーバーには常に暗号化済みデータしか渡さない（ゼロ知識設計）。

## ローカル起動

`serve.bat` を実行（`python -m http.server 8080`）し、`http://localhost:8080` を開く。

## 公開URL

https://takubou316.github.io/password-vault/ （GitHub Pages、リポジトリ: https://github.com/takubou316/password-vault ）

## アーキテクチャ

- `index.html` — アプリシェル（ロック画面/一覧/編集モーダル/インポートモーダルのDOM）
- `css/style.css` — スタイル一式
- `js/crypto.js` — PBKDF2(600,000回, SHA-256)による鍵導出とAES-GCM暗号化/復号。マスターパスワードと導出鍵はメモリ上のみに存在し、ストレージ/Driveへは一切送らない。
- `js/vault-store.js` — 復号済みvault配列に対するCRUD（暗号化・永続化のことは知らない）
- `js/local-cache.js` — 暗号化blobのIndexedDB保存/読込（オフライン時の唯一の永続化手段）
- `js/drive-sync.js` — Google Identity Services (Token Model) によるクライアントサイドのみのOAuthと、Google Drive `appDataFolder`（非表示領域）への暗号化blobの読み書き。バックエンドサーバーなし。
- `js/import-csv.js` — Chrome/Edgeのパスワードエクスポートcsvの自作パーサ
- `js/import-notes.js` — メモアプリの雑多なテキストからサイト名/ID/パスワード候補をヒューリスティック抽出（自動保存はせず必ずレビューUIを経由）
- `js/biometric.js` — WebAuthn(生体認証)による「便利性重視」の簡易ロック解除。仕組みと限界は下記セキュリティ上の注意を参照。
- `js/ui.js` — DOM描画・フォーム読み書き
- `js/app.js` — 起動処理・状態管理・各モジュールの結線（エントリポイント）
- `manifest.json` / `service-worker.js` — PWA化（ホーム画面追加、静的アセットのオフラインキャッシュ。Google API宛リクエストはキャッシュしない）

## Google Drive同期を有効にする手順（初回のみ、10〜15分）

1. https://console.cloud.google.com/ で新規プロジェクトを作成
2. 「APIとサービス」→「OAuth同意画面」を設定（外部/テストユーザーとして自分のGmailアドレスを追加）
3. 「認証情報」→「認証情報を作成」→「OAuthクライアントID」（種類: ウェブアプリケーション）
   - 承認済みのJavaScript生成元に `http://localhost:8080` と `https://takubou316.github.io` を追加
4. 発行された クライアントID（`xxxx.apps.googleusercontent.com`）を [js/drive-sync.js](js/drive-sync.js) 冒頭の `CLIENT_ID` 定数に貼り付ける
5. アプリのヘッダーにある「同期」ボタンを押すとGoogleサインインのポップアップが出る

`CLIENT_ID` が空のままの場合、同期機能は無効化されローカル保存のみで動作する。

## セキュリティ上の注意

- vaultの暗号化データ（IndexedDBの中身やDrive上のファイル）をリポジトリにコミットしないこと（`.gitignore`参照）。
- リポジトリを公開してもソースコードのみが見える設計だが、`CLIENT_ID` は公開情報として扱ってよい（OAuthクライアントシークレットは使用していない）。

### 生体認証によるロック解除について（重要な限界）

- この機能はWebAuthn（Face ID/指紋/Windows Hello等）を利用するが、**生体情報から暗号鍵を直接導出する方式（PRF/hmac-secret拡張）は使っていない**。対応端末がまだ少ないため。
- 実体は「マスターパスワードをAES-GCMで暗号化し、そのラップ鍵ごと端末のIndexedDBに保存」する方式。生体認証（`navigator.credentials.get()`）が成功したことをJSコードが確認できたら、保存しておいたラップ鍵で復号してマスターパスワードを取り出す、という流れ。
- つまり生体認証の成功は「復号処理を許可するゲート」として機能しているだけで、暗号学的に指紋や顔情報にバインドされているわけではない。端末のストレージ（IndexedDB）やブラウザプロファイルに直接アクセスできれば、理論上は生体認証を経由せずにマスターパスワードを取り出すことも可能。
- バックエンドサーバーを持たないため、WebAuthnのchallenge/attestation/assertionの暗号学的検証もできない。ローカルで生成したランダムchallengeを使い、`create()`/`get()`のPromiseが正常にresolveしたことのみを認証成功の判定材料としている。
- したがって本機能は端末を勝手に触られてすぐ覗き見られることへの抑止・利便性のためのものであり、端末紛失・盗難・マルウェア感染などの脅威に対する強固な防御ではない。より高いセキュリティが必要な場面では生体認証を無効化し、都度マスターパスワードを入力すること。
- 生体認証の設定・保存データは端末（ブラウザプロファイル）ごとに独立しており、Google Driveには一切同期されない（`js/local-cache.js`の`biometric`キーはDrive同期対象外）。
