#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
微信公众号草稿箱推送（仅依赖 Python 标准库 urllib）。

流程：
  1. 用 appid + secret 换 access_token（带 5 分钟缓冲缓存）
  2. 上传封面图拿到 thumb_media_id（微信草稿必须有封面）
  3. 把正文 HTML 推入草稿箱 draft/add

凭据来源（不写死在包里）：
  - 环境变量 WECHAT_APPID / WECHAT_SECRET
  - 或 --config 指向一个本地 JSON：{"appid": "...", "secret": "..."}
    （该文件放在工作区自己目录，不要放进 skills/ 或分享包）

用法：
  python wechat_publish.py --html 草稿.html --title "标题" --digest "摘要" \
      --cover 封面.png --config ~/wechat_cred.json

注意：
  - 内文图片需用 uploadimg 换成微信图床 url；本脚本只负责封面上传与草稿创建，
    内文图请在排版阶段用图床或后台手动上传（见 wechat-constraints.md）。
  - 失败不自动重试，保留本地 HTML 供手动复制粘贴。
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request

API = "https://api.weixin.qq.com/cgi-bin"
TIMEOUT = 30
_TOKEN_CACHE = {}


def _post(url, payload, as_json=True):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST",
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        resp.charset = "utf-8"
        return json.loads(resp.read().decode("utf-8"))


def _get(url, params):
    full = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(full, method="GET")
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        resp.charset = "utf-8"
        return json.loads(resp.read().decode("utf-8"))


def _upload_media(url, file_path, field="media"):
    import mimetypes
    ct = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
    boundary = "----wechatboundary7Q8x"
    with open(file_path, "rb") as f:
        raw = f.read()
    body = (
        f"--{boundary}\r\n".encode()
        + f'Content-Disposition: form-data; name="{field}"; filename="{os.path.basename(file_path)}"\r\n'.encode()
        + f"Content-Type: {ct}\r\n\r\n".encode()
        + raw
        + f"\r\n--{boundary}--\r\n".encode()
    )
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        resp.charset = "utf-8"
        return json.loads(resp.read().decode("utf-8"))


def get_access_token(appid, secret, force=False):
    now = time.time()
    if not force and appid in _TOKEN_CACHE:
        cached = _TOKEN_CACHE[appid]
        if now < cached["expires_at"]:
            return cached["access_token"]
    data = _get(f"{API}/token",
                {"grant_type": "client_credential", "appid": appid, "secret": secret})
    if "access_token" not in data:
        raise ValueError(f"获取 access_token 失败：{data}")
    _TOKEN_CACHE[appid] = {
        "access_token": data["access_token"],
        "expires_at": now + data.get("expires_in", 7200) - 300,
    }
    return data["access_token"]


def upload_thumb(access_token, image_path):
    data = _upload_media(f"{API}/material/add_material?access_token={access_token}&type=image",
                          image_path)
    if "media_id" not in data:
        raise ValueError(f"上传封面失败：{data}")
    return data["media_id"]


def create_draft(access_token, title, html, digest, thumb_media_id, author=""):
    if not thumb_media_id:
        raise ValueError("创建草稿必须有封面（thumb_media_id）")
    article = {
        "title": title,
        "author": author,
        "digest": digest,
        "content": html,
        "show_cover_pic": 0,
        "thumb_media_id": thumb_media_id,
    }
    data = _post(f"{API}/draft/add?access_token={access_token}", {"articles": [article]})
    if data.get("errcode", 0) != 0:
        raise ValueError(f"创建草稿失败：errcode={data.get('errcode')} errmsg={data.get('errmsg')}")
    if "media_id" not in data:
        raise ValueError(f"创建草稿响应缺少 media_id：{data}")
    return data["media_id"]


def load_creds(args):
    appid = os.environ.get("WECHAT_APPID")
    secret = os.environ.get("WECHAT_SECRET")
    if (not appid or not secret) and args.config and os.path.exists(args.config):
        cfg = json.load(open(args.config, "r", encoding="utf-8"))
        appid = appid or cfg.get("appid")
        secret = secret or cfg.get("secret")
    if not appid or not secret:
        raise SystemExit(
            "未找到公众号凭据。请设置环境变量 WECHAT_APPID/WECHAT_SECRET，"
            "或用 --config 指向本地 JSON（不要放进分享包）。")
    return appid, secret


def main():
    ap = argparse.ArgumentParser(description="微信公众号草稿箱推送")
    ap.add_argument("--html", required=True, help="正文 HTML（wechat_convert.py --wechat-out 的输出）")
    ap.add_argument("--title", required=True, help="文章标题（<=64 字）")
    ap.add_argument("--digest", default="", help="摘要（<=120 字节，省略则自动截取）")
    ap.add_argument("--cover", required=True, help="封面图路径（jpg/png，微信草稿必填）")
    ap.add_argument("--author", default="", help="作者署名")
    ap.add_argument("--config", default=None, help="本地凭据 JSON 路径")
    args = ap.parse_args()

    body = open(args.html, "r", encoding="utf-8").read()
    if not args.digest:
        # 简易截取纯文本摘要
        import re, html as _html
        txt = re.sub(r"<[^>]+>", "", body)
        txt = _html.unescape(txt).strip()
        args.digest = (txt[:100] + "...") if len(txt) > 100 else txt

    appid, secret = load_creds(args)
    token = get_access_token(appid, secret)
    print("access_token 已获取")
    thumb = upload_thumb(token, args.cover)
    print(f"封面已上传 media_id={thumb}")
    media_id = create_draft(token, args.title, body, args.digest, thumb, args.author)
    print(f"草稿已创建 media_id={media_id}")
    print("提示：草稿已进公众号后台「草稿箱」，请登录 mp.weixin.qq.com 核对后发布。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
