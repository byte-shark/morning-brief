"""
ニュース収集 & Gemini AI要約スクリプト
毎朝の最新ニュース（Azure、テスラ、AI）を取得し、Geminiを使って日本語の「3行要約」と「ポイント解説」を生成します。
"""

import os
import sys
import json
import time
import re
import datetime
from typing import List, Dict, Any, Optional
import feedparser
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# .envファイルの読み込み
load_dotenv()

# 設定
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
# ご希望に応じて上位モデル（例: gemini-3.8-flash, gemini-2.5-flash）を指定可能
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
MAX_ARTICLES_PER_CATEGORY = int(os.getenv("MAX_ARTICLES_PER_CATEGORY", "5"))

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
FEEDS_FILE = os.path.join(SCRIPT_DIR, "feeds.json")
OUTPUT_FILE = os.path.join(PROJECT_ROOT, "docs", "data", "news.json")

# HTTPヘッダー（一部RSSフィードがボットをブロックするのを防止）
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}


def clean_html(raw_html: str) -> str:
    """HTMLタグを除去して純粋なテキストを取り出す"""
    if not raw_html:
        return ""
    soup = BeautifulSoup(raw_html, "html.parser")
    text = soup.get_text(separator=" ", strip=True)
    # 連続する空白や改行を整理
    text = re.sub(r"\s+", " ", text)
    return text[:1500]  # 要約に必要な冒頭1500文字程度


def fetch_feed_articles(feed_info: Dict[str, Any], max_items: int = 5) -> List[Dict[str, Any]]:
    """単一のRSSフィードから最新記事を取得"""
    feed_url = feed_info["url"]
    feed_name = feed_info["name"]
    is_official = feed_info.get("is_official", False)
    
    print(f"  -> フィード取得中: {feed_name} ({feed_url})")
    
    try:
        resp = requests.get(feed_url, headers=DEFAULT_HEADERS, timeout=15)
        resp.raise_for_status()
        parsed = feedparser.parse(resp.content)
    except Exception as e:
        print(f"     [警告] フィード取得失敗: {feed_url} - {e}")
        return []

    articles = []
    for entry in parsed.entries[:max_items]:
        title = entry.get("title", "").strip()
        link = entry.get("link", "").strip()
        if not title or not link:
            continue

        # 本文（summary または description または content）
        content = ""
        if "summary" in entry:
            content = entry.summary
        elif "description" in entry:
            content = entry.description
        elif "content" in entry and len(entry.content) > 0:
            content = entry.content[0].get("value", "")

        cleaned_content = clean_html(content)

        # 日時パース
        published_dt = None
        if "published_parsed" in entry and entry.published_parsed:
            published_dt = datetime.datetime(*entry.published_parsed[:6], tzinfo=datetime.timezone.utc)
        elif "updated_parsed" in entry and entry.updated_parsed:
            published_dt = datetime.datetime(*entry.updated_parsed[:6], tzinfo=datetime.timezone.utc)
        else:
            published_dt = datetime.datetime.now(datetime.timezone.utc)

        # 日本時間 (JST: UTC+9) に変換
        jst = datetime.timezone(datetime.timedelta(hours=9))
        published_jst = published_dt.astimezone(jst)

        articles.append({
            "title": title,
            "link": link,
            "source": feed_name,
            "is_official": is_official,
            "content": cleaned_content,
            "published_at": published_jst.strftime("%Y-%m-%d %H:%M"),
            "published_timestamp": int(published_dt.timestamp())
        })

    return articles


def call_gemini_api(prompt: str, model: str, api_key: str) -> Optional[str]:
    """Gemini REST APIを呼び出してテキストを生成"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 1024,
            "responseMimeType": "application/json"
        }
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        if response.status_code != 200:
            print(f"     [Gemini APIエラー {response.status_code}] {response.text}")
            return None
        data = response.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return text
    except Exception as e:
        print(f"     [Gemini 呼び出し例外] {e}")
        return None


def summarize_article(article: Dict[str, Any], model: str, api_key: str) -> Dict[str, Any]:
    """記事のタイトルと本文から、スマホ向け3行要約と要点を生成"""
    if not api_key:
        # APIキーがない場合のフォールバック（テスト・モック用）
        importance = 4 if article.get("is_official") else 3
        return {
            "headline": article["title"][:40] + ("..." if len(article["title"]) > 40 else ""),
            "three_line_summary": [
                f"【概要】{article['title']}",
                article["content"][:60] + "..." if article["content"] else "本文の詳細は元記事をご確認ください。",
                f"情報提供元: {article['source']}"
            ],
            "key_points": ["最新の公式・主要発表", "詳細は元記事リンクから確認可能"],
            "category_badge": "注目",
            "importance": importance
        }

    prompt = f"""
あなたは忙しいビジネスパーソン・エンジニア向けニュースアプリの専属エディターです。
通勤中やスキマ時間のスマホで30秒で理解できるよう、以下のニュース記事を日本語でわかりやすく要約してください。
英語の記事である場合は、必ず自然で洗練された日本語に翻訳・要約してください。

【元記事情報】
タイトル: {article['title']}
情報元: {article['source']} (公式: {'はい' if article['is_official'] else 'いいえ'})
本文抜粋: {article['content'][:1200]}

【出力フォーマット】
以下のキーを持つ厳密なJSONオブジェクトのみを出力してください。
{{
  "headline": "30文字以内の端的な見出し（読者の目を惹くキャッチーな1行）",
  "three_line_summary": [
    "1行目: 何が起きたか・何が発表されたか（事実）",
    "2行目: 具体的な特徴・メリット・変更点（詳細）",
    "3行目: 今後の影響や注目すべき理由（結論/展望）"
  ],
  "key_points": [
    "重要なポイント1",
    "重要なポイント2",
    "重要なポイント3"
  ],
  "category_badge": "新機能 / アップデート / 業績 / 重要 / トレンド など適した2〜4文字のタグ",
  "importance": 1から5の整数（5: 業界激震の超重要ニュース, 4: 主要アップデート・公式発表, 3: 通常の重要ニュース, 2: 小規模更新, 1: 補足）
}}
"""

    response_text = call_gemini_api(prompt, model, api_key)
    if response_text:
        try:
            parsed_json = json.loads(response_text)
            return parsed_json
        except Exception as e:
            print(f"     [JSON解析失敗] 生テキスト: {response_text[:100]}... エラー: {e}")

    # 解析失敗時のフォールバック
    return {
        "headline": article["title"][:40],
        "three_line_summary": [
            article["title"],
            article["content"][:80] + "..." if article["content"] else "詳細は元記事をご覧ください。",
            f"ソース: {article['source']}"
        ],
        "key_points": ["要約の自動生成に失敗したため簡易表示しています"],
        "category_badge": "速報"
    }


def main():
    print("=" * 60)
    print(" 📰 ニュース自動収集 & Gemini要約バッチ開始")
    print(f" 実行日時 (UTC): {datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}")
    print(f" 使用モデル: {GEMINI_MODEL}")
    print("=" * 60)

    if not os.path.exists(FEEDS_FILE):
        print(f"[エラー] フィード設定ファイルが見つかりません: {FEEDS_FILE}")
        sys.exit(1)

    with open(FEEDS_FILE, "r", encoding="utf-8") as f:
        feeds_config = json.load(f)

    if not GEMINI_API_KEY:
        print("[注意] GEMINI_API_KEYが設定されていません。モック要約モードで動作します。")

    jst = datetime.timezone(datetime.timedelta(hours=9))
    now_jst = datetime.datetime.now(jst)
    
    output_data = {
        "updated_at": now_jst.strftime("%Y年%m月%d日 %H:%M"),
        "updated_at_iso": now_jst.isoformat(),
        "model_used": GEMINI_MODEL if GEMINI_API_KEY else "mock-mode",
        "categories": []
    }

    total_articles = 0

    for cat in feeds_config.get("categories", []):
        cat_id = cat["id"]
        cat_name = cat["name"]
        cat_icon = cat.get("icon", "📌")
        cat_desc = cat.get("description", "")
        print(f"\n📂 カテゴリ処理中: [{cat_name}] ({cat_id})")

        all_cat_articles = []
        for feed in cat.get("feeds", []):
            articles = fetch_feed_articles(feed, max_items=MAX_ARTICLES_PER_CATEGORY)
            all_cat_articles.extend(articles)

        # 重複排除（同じURLまたはほぼ同じタイトル）
        seen_urls = set()
        seen_titles = set()
        unique_articles = []
        for art in all_cat_articles:
            norm_title = re.sub(r"\s+", "", art["title"].lower())
            if art["link"] in seen_urls or norm_title in seen_titles:
                continue
            seen_urls.add(art["link"])
            seen_titles.add(norm_title)
            unique_articles.append(art)

        # 日時が新しい順にソート
        unique_articles.sort(key=lambda x: x["published_timestamp"], reverse=True)
        selected_articles = unique_articles[:MAX_ARTICLES_PER_CATEGORY]

        print(f"  合計 {len(selected_articles)} 件の記事を要約します...")
        summarized_items = []

        for idx, art in enumerate(selected_articles, 1):
            print(f"  [{idx}/{len(selected_articles)}] 要約中: {art['title'][:40]}...")
            summary_info = summarize_article(art, GEMINI_MODEL, GEMINI_API_KEY)
            try:
                importance_val = int(summary_info.get("importance", 3))
                importance_val = min(5, max(1, importance_val))
            except (ValueError, TypeError):
                importance_val = 4 if art["is_official"] else 3

            item = {
                "id": f"{cat_id}_{int(time.time())}_{idx}",
                "title": art["title"],
                "link": art["link"],
                "source": art["source"],
                "is_official": art["is_official"],
                "published_at": art["published_at"],
                "headline": summary_info.get("headline", art["title"]),
                "summary": summary_info.get("three_line_summary", []),
                "key_points": summary_info.get("key_points", []),
                "badge": summary_info.get("category_badge", "ニュース"),
                "importance": importance_val
            }
            summarized_items.append(item)
            # Gemini 無料枠のレートリミット（15 RPM）に配慮して少しウェイト
            if GEMINI_API_KEY and idx < len(selected_articles):
                time.sleep(2)

        total_articles += len(summarized_items)
        output_data["categories"].append({
            "id": cat_id,
            "name": cat_name,
            "icon": cat_icon,
            "description": cat_desc,
            "articles": summarized_items
        })

    output_data["total_count"] = total_articles

    # 出力先ディレクトリ作成
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 60)
    print(f" ✅ 処理完了! 合計 {total_articles} 件の記事を要約しました。")
    print(f" 出力先: {OUTPUT_FILE}")
    print("=" * 60)


if __name__ == "__main__":
    main()
