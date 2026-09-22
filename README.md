# ☀️ Morning Brief - AIニュース要約（完全無料PWAアプリ）

通勤中やスキマ時間の30秒で、最新の「**Azure**」「**テスラ**」「**AI**」公式＆主要ニュースを把握できるiPhone特化型の専用ニュースアプリです。

**完全0円（永年無料）** で運用でき、一度設定すれば**PCの電源を切っていても毎朝クラウド（GitHub Actions）が自動起動して要約を更新**します。

---

## 📱 主な機能・特徴

- **公式・一次情報重視**:
  - ☁️ **Azure**: Microsoft公式ブログ、最新クラウド動向
  - ⚡ **テスラ**: Electrek（公式発表・一次情報メディア）、最新EV/FSD動向
  - 🤖 **AI**: OpenAI公式、Google AI公式、主要生成AI速報
- **Gemini 3.8 Flash によるスマート要約**:
  - 英語の公式リリースも、流暢で読みやすい日本語の「3行要約 ＋ 注目ポイント」に翻訳・要約。
- **iPhone PWA（ホーム画面追加）対応**:
  - SafariのURLバーが消え、普通のネイティブアプリのようにフルスクリーンでサクサク動作。
  - オフラインキャッシュ対応（地下鉄など電波が不安定な場所でも閲覧可能）。
  - ダークモード自動連動 ＆ 既読チェック・お気に入り保存機能。

---

## 🛠️ システム構成（完全0円の仕組み）

```
【毎朝 JST 6:30 自動実行】
 1. GitHub Actions（クラウド無料サーバー）が自動起動（PC電源はOFFでOK）
 2. Azure・テスラ・AIの公式RSSを取得
 3. Google Gemini 3.8 Flash（無料枠）で3行要約＆要点生成
 4. GitHub Pages（無料ホスティング）を最新データに自動更新
     │
     ▼
【朝の通勤時間】
 iPhoneのホーム画面アイコンをタップするだけで最新要約が読める！
```

---

## 🚀 運用開始までの3ステップ（完全ガイド）

### ステップ1: Gemini APIキーを無料取得する（所要時間: 1分）

1. [Google AI Studio](https://aistudio.google.com/) にアクセスします。
2. Googleアカウントでログインし、**「Get API key」** をクリックします。
3. **「Create API key」** を押して発行されたAPIキーをコピーします。
   *(※クレジットカードの登録は一切不要です)*

---

### ステップ2: GitHubにこのフォルダを保存する（所要時間: 2分）

1. [GitHub](https://github.com/) にログインし、新規リポジトリ（Repository name: 例 `morning-brief`）を作成します。
   - 公開設定は **Public（公開）** または **Private（非公開）** どちらでもOKです。
   - *(PublicならGitHub Actionsも完全無制限で無料です)*
2. この「ニュースアプリ」フォルダ内のファイル一式をリポジトリにアップロード（コミット＆プッシュ）します。
   *(GitHub Desktopや、GitHubのブラウザ画面上からのドラッグ＆ドロップでもアップロード可能です)*

---

### ステップ3: GitHub側で2つだけ設定する（所要時間: 2分）

#### ① APIキーを登録する（Secrets設定）
1. 作成したGitHubリポジトリの **「Settings」** タブを開きます。
2. 左メニューの **「Secrets and variables」** → **「Actions」** をクリックします。
3. **「New repository secret」** ボタンを押し、以下を入力して保存します。
   - **Name**: `GEMINI_API_KEY`
   - **Secret**: ステップ1でコピーしたGeminiのAPIキー

#### ② GitHub Actionsの書き込み権限を許可する
1. 同じく **「Settings」** → 左メニュー **「Actions」** → **「General」** を開きます。
2. ページ下部の **「Workflow permissions」** にある **「Read and write permissions」** を選択して **「Save」** をクリックします。
   *(これにより、毎朝自動でニュースデータを保存できるようになります)*

#### ③ Webサイトとして公開する（GitHub Pages設定）
1. **「Settings」** → 左メニュー **「Pages」** を開きます。
2. **「Build and deployment」** の設定で以下を選択します。
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`（または `master`） / フォルダを **`/docs`** に変更して **「Save」**
3. 数分後、画面上部に公開URL（例: `https://あなたのユーザー名.github.io/morning-brief/`）が表示されます！

---

## 📲 iPhoneでのホーム画面追加方法

1. iPhoneの **Safari** で、発行されたGitHub PagesのURLを開きます。
2. 画面下部の中央にある **共有ボタン（四角から矢印が出たアイコン 📤）** をタップします。
3. メニューを少しスクロールして **「ホーム画面に追加」** をタップします。
4. 右上の **「追加」** を押すと、iPhoneのホーム画面にアプリアイコンが配置されます。

> **これ以降は、毎朝ホーム画面のアイコンをタップするだけで、PCを開かなくても自動で最新ニュースが読めます！**

---

## ⚙️ お好みのカスタマイズ

- **ニュース収集元を増やしたい・変更したい場合**:
  `src/feeds.json` を開いて、お好みのRSSフィードURLを追加・編集するだけです。
- **更新時間を変更したい場合**:
  `.github/workflows/update_news.yml` の `cron: '30 21 * * *'`（UTC 21:30 = 日本時間 6:30）の時間を変更できます。
- **手動で今すぐ更新したい場合**:
  GitHubの **「Actions」** タブ → **「Update Daily News Summary」** → **「Run workflow」** ボタンを押せば、いつでも即座に最新ニュースを更新できます。
