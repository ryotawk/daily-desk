"""NHKニュースのRSSから見出しを取得し、表示ページ用の news.json を作る。
使い方: python3 scripts/fetch_news.py site/news.json [--allow-empty]
"""
import json, sys, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

FEEDS = [  # 主要ニュース。上から順に試す
    "https://www.nhk.or.jp/rss/news/cat0.xml",
    "https://www3.nhk.or.jp/rss/news/cat0.xml",
]
MAX_ITEMS = 6

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "boox-daily-desk (personal display)"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()

def parse(xml_bytes):
    root = ET.fromstring(xml_bytes)
    items = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        if not title:
            continue
        pub = it.findtext("pubDate")
        iso = None
        if pub:
            try:
                iso = parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat()
            except Exception:
                pass
        items.append({"title": title, "published": iso})
        if len(items) >= MAX_ITEMS:
            break
    return items

def main():
    out, allow_empty = sys.argv[1], "--allow-empty" in sys.argv
    errors = []
    for url in FEEDS:
        try:
            items = parse(fetch(url))
            if items:
                data = {"ok": True, "source": "NHKニュース", "fetchedAt": datetime.now(timezone.utc).isoformat(), "items": items}
                with open(out, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False)
                print(f"{len(items)}件取得: {url}")
                return
            errors.append(f"{url}: 見出し0件")
        except Exception as e:
            errors.append(f"{url}: {e}")
    print("\n".join(errors), file=sys.stderr)
    if allow_empty:  # コード更新時は、ニュースが取れなくてもページ自体は公開する
        with open(out, "w", encoding="utf-8") as f:
            json.dump({"ok": False, "source": "NHKニュース", "fetchedAt": None, "items": []}, f)
        return
    sys.exit(1)  # 定期実行時は失敗扱い → 公開済みのページ（前回の見出し）がそのまま残る

if __name__ == "__main__":
    main()
