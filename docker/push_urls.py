#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 sitemap.xml 里的 URL 主动推给百度和 IndexNow（Bing → ChatGPT/DuckDuckGo 的收录入口）。

新域名没有外链，等着爬虫自己发现基本等于不存在，所以每次上线后跑一次：

    BAIDU_PUSH_TOKEN=你的token python docker/push_urls.py

token 从哪来：
  · BAIDU_PUSH_TOKEN —— 百度站长平台 → 资源提交 → 主动推送 → 接口调用凭证
  · INDEXNOW_KEY     —— bing.com/webmaster 验证站点后 → IndexNow → 生成 API Key
                         （只设其中一个也行，脚本会明确报缺哪个，不会静默跳过）

    python docker/push_urls.py --dry-run   # 只打印要推什么、缺什么，不发任何请求

Google 没有推送接口（Indexing API 只服务招聘页/广播页，普通站用不上），
走 Search Console 提交 sitemap.xml 即可，脚本末尾会把这一步的入口打出来。
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
SITEMAP = os.path.normpath(os.path.join(HERE, "..", "sitemap.xml"))
SITE_ROOT = os.path.normpath(os.path.join(HERE, ".."))
TIMEOUT = 20
UA = "Mozilla/5.0 (compatible; life-trajectory-push/1.0)"

# Windows 控制台默认走 GBK，中文和符号会在 print 时直接抛 UnicodeEncodeError，
# 而且是在成功分支上抛——退码照样非零。统一按 UTF-8 输出。
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def read_urls():
    """从 sitemap.xml 取 <loc>，顺带用第一条确定 host（避免脚本里再写一遍域名对不上）。"""
    if not os.path.isfile(SITEMAP):
        sys.exit(f"找不到 {SITEMAP}，没有 URL 清单可推。")
    raw = open(SITEMAP, encoding="utf-8").read()
    # 标准库 ET 默认会展开实体，这份文件里不该有任何 DTD，出现就直接拒绝而不是兜着解析
    if re.search(r"<!DOCTYPE|<!ENTITY", raw, re.I):
        sys.exit("sitemap.xml 含 DTD/实体声明，拒绝解析。")
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    root = ET.fromstring(raw)
    urls = [(n.text or "").strip() for n in root.findall(".//sm:url/sm:loc", ns)]
    urls = [u for u in urls if u.startswith("http")]
    if not urls:
        sys.exit("sitemap.xml 里一条 <loc> 都没有，先补 URL 再推送。")
    host = re.match(r"https?://([^/]+)", urls[0]).group(1)
    return host, urls


def post(url, data, headers):
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.status, resp.read().decode("utf-8", "replace")


def push_baidu(host, urls, token, dry):
    api = f"http://data.zz.baidu.com/urls?site={host}&token={token}"
    body = "\n".join(urls).encode("utf-8")
    if dry:
        print(f"[dry-run] 百度 POST {api.replace(token, '***')}\n          {len(urls)} 条 URL")
        return True
    try:
        status, text = post(api, body, {"Content-Type": "text/plain", "User-Agent": UA})
    except urllib.error.HTTPError as e:
        print(f"[fail] 百度推送失败 HTTP {e.code}：{e.read().decode('utf-8', 'replace').strip()}")
        print("  常见原因：token 不对、域名未在百度站长平台验证、当日推送配额用尽。")
        return False
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"[fail] 百度推送请求不通：{e}")
        return False
    print(f"[ok] 百度推送 HTTP {status}：{text.strip()}")
    # 百度的成功响应是 {"success":N,"remain":M}，出错也回 200，所以必须看正文
    try:
        j = json.loads(text)
    except json.JSONDecodeError:
        print("  响应不是 JSON，按失败处理。")
        return False
    if not j.get("success"):
        print(f"  未受理任何 URL（error={j.get('message', j)}），按失败处理。")
        return False
    return True


def push_indexnow(host, urls, key, dry):
    # IndexNow 要求 key 文件可从站点根访问，先确保本地有这份，deploy.sh 会同步上去
    key_file = os.path.join(SITE_ROOT, f"{key}.txt")
    if dry:
        print(f"[dry-run] IndexNow POST https://api.indexnow.org/indexnow，key 文件应为 {key_file}")
        return True
    if not os.path.isfile(key_file):
        with open(key_file, "w", encoding="ascii", newline="\n") as f:
            f.write(key + "\n")
        print(f"  已生成 key 文件：{os.path.relpath(key_file, SITE_ROOT)}（需要随站点一起部署）")
    payload = json.dumps({"host": host, "key": key, "urlList": urls}).encode("utf-8")
    try:
        status, text = post("https://api.indexnow.org/indexnow", payload,
                            {"Content-Type": "application/json; charset=utf-8", "User-Agent": UA})
    except urllib.error.HTTPError as e:
        print(f"[fail] IndexNow 失败 HTTP {e.code}：{e.read().decode('utf-8', 'replace').strip()[:200]}")
        print("  403/422 多半是 key 文件还没上线：先 sudo bash docker/deploy.sh 把 "
              f"{key}.txt 同步到站点根，再重跑。")
        return False
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"[fail] IndexNow 请求不通：{e}")
        return False
    print(f"[ok] IndexNow HTTP {status}（200/202 为已受理）")
    return status in (200, 202, 204)


def main():
    dry = "--dry-run" in sys.argv
    host, urls = read_urls()
    print(f"站点 {host}，待推送 {len(urls)} 条 URL：")
    for u in urls:
        print(f"  - {u}")

    baidu_token = os.environ.get("BAIDU_PUSH_TOKEN", "").strip()
    indexnow_key = os.environ.get("INDEXNOW_KEY", "").strip()
    if not baidu_token and not indexnow_key:
        print("\n[fail] 两个凭证都没给，这次什么都推不出去。")
        print("  BAIDU_PUSH_TOKEN=<百度主动推送token> INDEXNOW_KEY=<Bing的IndexNow key> "
              f"python {os.path.relpath(__file__, SITE_ROOT)}")
        return 1

    results = []
    if baidu_token:
        results.append(("百度", push_baidu(host, urls, baidu_token, dry)))
    else:
        print("\n!! 未设 BAIDU_PUSH_TOKEN，跳过百度推送（不是失败，是没配）")
    if indexnow_key:
        results.append(("IndexNow", push_indexnow(host, urls, indexnow_key, dry)))
    else:
        print("!! 未设 INDEXNOW_KEY，跳过 Bing/ChatGPT 那条链路")

    print("\nGoogle 侧没有推送接口，去 Search Console 手工提交一次即可："
          "\n  1) 下载 google.com/webmasters 的验证文件，放到本仓库根目录"
          "\n  2) sudo bash docker/deploy.sh 把它同步上线"
          "\n  3) Search Console → 站点验证 → 提交 sitemap.xml")

    failed = [n for n, ok in results if not ok]
    if failed:
        print(f"\n[fail] 这些通道没推成功：{'、'.join(failed)}")
        return 1
    print("\n[ok] 已配置的通道全部受理")
    return 0


if __name__ == "__main__":
    sys.exit(main())
