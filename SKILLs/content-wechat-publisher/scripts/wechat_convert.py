#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Markdown -> 微信公众号内联样式 HTML 转换器（仅依赖 Python 标准库）。

移植自 wewrite 公众号排版方法，针对 IP 内容生产 Skill 包做了自包含化：
  - 全部样式以内联 style 写入（微信编辑器不支持 <style>/外部 CSS）
  - 主题以 JSON 的 rules 映射表达（规避 cssutils/PyYAML 依赖）
  - 列表 ul/ol 转为 <section> 结构（微信原生列表渲染不稳定）
  - 外链转上标脚注 + 文末参考链接（微信屏蔽外部链接）
  - CJK↔Latin 自动加间距、加粗中文标点外移
  - 注入 data-darkmode-* 属性适配微信暗黑模式
  - 文末追加 AIGC 声明（合规）
  - 粘贴加固：文本节点包 <span leaf="">、空装饰元素补 <br>

用法：
  python wechat_convert.py 文章.md --theme professional-clean --out 预览.html
  python wechat_convert.py 文章.md --theme sspai --wechat-out 草稿.html
  python wechat_convert.py 文章.md --img-base https://cdn.example.com/imgs --wechat-out 草稿.html
  python wechat_convert.py 文章.md --img-map 图床映射.json --wechat-out 草稿.html
  python wechat_convert.py 文章.md --embed --out 预览.html      # 本地图内嵌，复制粘贴即带图

输出：
  --out        完整预览文档（含 <body> 包裹，浏览器直接看，配合 --embed 可复制带图）
  --wechat-out 仅正文 HTML（body 内容，供草稿箱 API 推送 / 接自动化工位）
  --img-base   图床 URL 前缀，自动拼接图片文件名（微信只认 http(s) 图，本地路径需替换）
  --img-map    图床映射 JSON {本地src或文件名: 完整URL}，精确替换，优先级高于 --img-base
  --embed      把本地图片 base64 内嵌进输出（手动复制到公众号后台时图片随文本一起带走）
"""
import argparse
import base64
import html
import json
import os
import re
import sys
from html.parser import HTMLParser


# ---------------------------------------------------------------------------
# 主题加载
# ---------------------------------------------------------------------------

def _default_themes_dirs():
    """主题可能放在脚本同级 themes/ 或 skill 根 themes/，都找。"""
    base = os.path.dirname(os.path.abspath(__file__))
    return [os.path.join(base, "themes"), os.path.join(base, "..", "themes")]


def load_theme(name, themes_dir=None):
    """从 JSON 加载主题。themes_dir 缺省为脚本同级或 skill 根的 themes/ 目录。"""
    if themes_dir is None:
        dirs = _default_themes_dirs()
    else:
        dirs = [themes_dir]
    for d in dirs:
        path = os.path.join(d, f"{name}.json")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            data.setdefault("rules", {})
            data.setdefault("colors", {})
            data.setdefault("darkmode", {})
            return data
    # 回退：取第一个存在的目录里的首个主题
    avail = list_themes()
    if not avail:
        searched = "、".join(os.path.abspath(d) for d in dirs)
        raise FileNotFoundError(f"未找到任何主题文件（搜索：{searched}）")
    fb = "professional-clean" if "professional-clean" in avail else avail[0]
    for d in dirs:
        path = os.path.join(d, f"{fb}.json")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            data.setdefault("rules", {})
            data.setdefault("colors", {})
            data.setdefault("darkmode", {})
            return data
    raise FileNotFoundError(f"主题 {fb} 不存在")


def list_themes(themes_dir=None):
    if themes_dir is not None:
        dirs = [themes_dir]
    else:
        dirs = _default_themes_dirs()
    names = set()
    for d in dirs:
        if os.path.isdir(d):
            for f in os.listdir(d):
                if f.endswith(".json"):
                    names.add(f[: -len(".json")])
    return sorted(names)


# ---------------------------------------------------------------------------
# 预处理：容器块 :::xxx（在 Markdown 解析前先换成带主题色的 HTML）
# ---------------------------------------------------------------------------

_INLINE_CODE = re.compile(r"`([^`\n]+?)`")
_INLINE_BOLD = re.compile(r"\*\*(.+?)\*\*")
_INLINE_EM = re.compile(r"(?<!\*)\*([^*\n]+?)\*(?!\*)")


def _inline_md(text):
    text = _INLINE_CODE.sub(
        r'<code style="background: rgba(0,0,0,0.06); padding: 2px 5px; '
        r'border-radius: 3px; font-size: 0.9em">\1</code>', text)
    text = _INLINE_BOLD.sub(r"<strong>\1</strong>", text)
    text = _INLINE_EM.sub(r"<em>\1</em>", text)
    return text


def _preprocess_containers(md, colors):
    md = _process_dialogue(md, colors)
    md = _process_timeline(md, colors)
    md = _process_callout(md)
    md = _process_quote(md, colors)
    md = _process_pullquote(md, colors)
    md = _process_label(md, colors)
    md = _process_steps(md, colors)
    md = _process_highlight(md, colors)
    md = _process_summary(md, colors)
    return md


def _process_dialogue(md, colors):
    primary = colors.get("primary", "#2563eb")

    def rep(m):
        bubbles = []
        for line in m.group(1).strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            if line.startswith("> "):
                msg = line[2:].strip()
                bubbles.append(
                    f'<section style="display: flex; justify-content: flex-end; margin-bottom: 12px">'
                    f'<section style="background: {primary}; color: #ffffff; padding: 10px 14px; '
                    f'border-radius: 12px 12px 2px 12px; max-width: 80%; font-size: 15px; '
                    f'line-height: 1.6">{_inline_md(msg)}</section></section>')
            else:
                bubbles.append(
                    f'<section style="display: flex; justify-content: flex-start; margin-bottom: 12px">'
                    f'<section style="background: #f3f4f6; color: #333333; padding: 10px 14px; '
                    f'border-radius: 12px 12px 12px 2px; max-width: 80%; font-size: 15px; '
                    f'line-height: 1.6">{_inline_md(line)}</section></section>')
        return "\n".join(bubbles)

    return re.sub(r":::dialogue\n(.*?)\n:::", rep, md, flags=re.DOTALL)


def _process_timeline(md, colors):
    primary = colors.get("primary", "#2563eb")

    def rep(m):
        items = []
        for line in m.group(1).strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            items.append(
                '<section style="display: flex; margin-bottom: 16px">'
                '<section style="flex-shrink: 0; width: 12px; display: flex; flex-direction: column; align-items: center">'
                f'<section style="width: 10px; height: 10px; border-radius: 50%; background: {primary}; margin-top: 6px"></section>'
                '<section style="width: 2px; flex: 1; background: #e5e7eb; margin-top: 4px"></section>'
                "</section>"
                f'<section style="flex: 1; padding-left: 12px; padding-bottom: 8px; font-size: 15px; line-height: 1.7">{_inline_md(line)}</section>'
                "</section>")
        return "\n".join(items)

    return re.sub(r":::timeline\n(.*?)\n:::", rep, md, flags=re.DOTALL)


def _process_callout(md):
    cmap = {
        "tip": ("#059669", "#ecfdf5", "💡"),
        "warning": ("#d97706", "#fffbeb", "⚠️"),
        "info": ("#2563eb", "#eff6ff", "ℹ️"),
        "danger": ("#dc2626", "#fef2f2", "🚨"),
    }

    def rep(m):
        ctype = m.group(1).strip().lower()
        content = m.group(2).strip()
        color, bg, icon = cmap.get(ctype, cmap["info"])
        return (
            f'<section style="background: {bg}; border-left: 4px solid {color}; '
            f'padding: 14px 16px; border-radius: 4px; margin: 16px 0; font-size: 15px; line-height: 1.7">'
            f'<section style="font-weight: 700; color: {color}; margin-bottom: 6px">{icon} {ctype.upper()}</section>'
            f"{_inline_md(content)}</section>")

    return re.sub(r":::callout\s+(\w+)\n(.*?)\n:::", rep, md, flags=re.DOTALL)


def _process_quote(md, colors):
    primary = colors.get("primary", "#2563eb")

    def rep(m):
        content = m.group(1).strip()
        return (
            f'<section style="margin: 24px 0; padding: 20px 24px; border-left: 4px solid {primary}; '
            f'background: {colors.get("quote_bg", "#f8f9fa")}; border-radius: 0 8px 8px 0">'
            f'<section style="font-size: 18px; line-height: 1.8; color: #333333; font-style: italic">'
            f'"{_inline_md(content)}"</section></section>')

    return re.sub(r":::quote\n(.*?)\n:::", rep, md, flags=re.DOTALL)


def _process_pullquote(md, colors):
    primary = colors.get("primary", "#2563eb")

    def rep(m):
        content = _inline_md(m.group(1).strip().replace("\n", "<br>"))
        return (
            f'<section style="margin: 36px 0; padding: 0 24px; text-align: center">'
            f'<section style="font-size: 30px; line-height: 1; color: {primary}; font-weight: 700; margin-bottom: 10px">“</section>'
            f'<section style="font-size: 18px; font-weight: 600; line-height: 1.9; color: #333333">{content}</section>'
            f'<section style="width: 36px; height: 2px; background: {primary}; margin: 16px auto 0"><span leaf=""><br></span></section>'
            f"</section>")

    return re.sub(r":::pullquote\n(.*?)\n:::", rep, md, flags=re.DOTALL)


def _process_label(md, colors):
    primary = colors.get("primary", "#2563eb")

    def rep(m):
        variant = (m.group(1) or "").strip().lower()
        content = _inline_md(m.group(2).strip())
        if variant == "pill":
            return (
                f'<section style="margin: 28px 0 14px">'
                f'<span style="display: inline-block; background: {primary}; color: #ffffff; '
                f'font-size: 13px; font-weight: 700; padding: 4px 14px; border-radius: 999px; '
                f'letter-spacing: 1px">{content}</span></section>')
        return (
            f'<section style="display: flex; align-items: center; margin: 28px 0 14px">'
            f'<section style="flex-shrink: 0; width: 4px; height: 16px; background: {primary}; '
            f'border-radius: 2px; margin-right: 8px"><span leaf=""><br></span></section>'
            f'<section style="font-size: 16px; font-weight: 700; color: #1a1a1a">{content}</section>'
            f"</section>")

    return re.sub(r":::label[ \t]*(\w*)\n(.*?)\n:::", rep, md, flags=re.DOTALL)


def _process_steps(md, colors):
    primary = colors.get("primary", "#2563eb")

    def rep(m):
        items = []
        n = 0
        for line in m.group(1).strip().split("\n"):
            line = line.strip().lstrip("-").strip()
            if not line:
                continue
            n += 1
            items.append(
                f'<section style="display: flex; margin-bottom: 14px">'
                f'<section style="flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; '
                f'background: {primary}; color: #ffffff; font-size: 13px; font-weight: 700; '
                f'text-align: center; line-height: 22px; margin-right: 10px">{n}</section>'
                f'<section style="flex: 1; font-size: 15px; line-height: 1.7; padding-top: 1px">'
                f"{_inline_md(line)}</section></section>")
        return '<section style="margin: 20px 0">' + "\n".join(items) + "</section>"

    return re.sub(r":::steps\n(.*?)\n:::", rep, md, flags=re.DOTALL)


def _process_highlight(md, colors):
    secondary = colors.get("secondary", "#c4820e")
    bg = colors.get("highlight_bg", "#fef7e8")
    border = colors.get("highlight_border", "rgba(196,130,14,0.2)")

    def rep(m):
        content = m.group(1).strip()
        lines = content.split("\n", 1)
        title = lines[0].strip() if lines else ""
        body = lines[1].strip() if len(lines) > 1 else ""
        out = f'<section style="margin: 24px 0; padding: 20px 24px; background: {bg}; border: 1px solid {border}; border-radius: 6px;">'
        if title:
            out += f'<p style="margin: 0;"><strong style="color: {secondary};">{_inline_md(title)}</strong></p>'
        if body:
            out += f'<p style="margin: 8px 0 0 0;">{_inline_md(body)}</p>'
        out += "</section>"
        return out

    return re.sub(r":::highlight\n(.*?)\n:::", rep, md, flags=re.DOTALL)


def _process_summary(md, colors):
    primary = colors.get("primary", "#1a6b5a")
    bg = colors.get("summary_bg", "#e8f5f0")
    border = colors.get("summary_border", "rgba(26,107,90,0.15)")

    def rep(m):
        content = m.group(1).strip()
        lines = content.split("\n", 1)
        title = lines[0].strip() if lines else "总结"
        body = lines[1].strip() if len(lines) > 1 else ""
        out = f'<section style="margin: 24px 0; padding: 20px 24px; background: {bg}; border: 1px solid {border}; border-radius: 6px;">'
        out += f'<p style="margin: 0;"><strong style="color: {primary};">{_inline_md(title)}</strong></p>'
        if body:
            out += f'<p style="margin: 8px 0 0 0;">{_inline_md(body)}</p>'
        out += "</section>"
        return out

    return re.sub(r":::summary\n(.*?)\n:::", rep, md, flags=re.DOTALL)


# ---------------------------------------------------------------------------
# CJK 间距 / 加粗标点
# ---------------------------------------------------------------------------

def fix_cjk_spacing(text):
    cjk = r"[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]"
    latin = r"[A-Za-z0-9]"
    lines = text.split("\n")
    in_code = False
    out = []
    for line in lines:
        if line.strip().startswith("```"):
            in_code = not in_code
            out.append(line)
            continue
        if in_code:
            out.append(line)
            continue
        line = re.sub(f"({cjk})({latin})", r"\1 \2", line)
        line = re.sub(f"({latin})({cjk})", r"\1 \2", line)
        out.append(line)
    return "\n".join(out)


def fix_cjk_bold_punct(body):
    # <strong>内容，。</strong> -> <strong>内容</strong>，。
    return re.sub(r"(<strong>)(.*?)([，。！？；：、]+)(</strong>)", r"\1\2\4\3", body)


# ---------------------------------------------------------------------------
# 外链转脚注
# ---------------------------------------------------------------------------

def convert_links_to_footnotes(body, colors):
    footnotes = []
    primary = colors.get("primary", "#2563eb")

    def repl(m):
        attrs = m.group(1)
        inner = m.group(2)
        hm = re.search(r'href="([^"]*)"', attrs)
        href = hm.group(1) if hm else ""
        if not href or href.startswith("#"):
            return m.group(0)
        footnotes.append((inner, href))
        n = len(footnotes)
        return f'{inner}<sup><span style="color: {primary}; font-size: 12px">[{n}]</span></sup>'

    new = re.sub(r"<a\s+([^>]*?)>(.*?)</a>", repl, body, flags=re.DOTALL)
    return new, footnotes


def append_footnotes(body, footnotes):
    if not footnotes:
        return body
    out = ['<hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0 16px">']
    out.append('<p style="font-size: 13px; color: #999999; margin-bottom: 8px; font-weight: 700">参考链接</p>')
    for n, (text, href) in enumerate(footnotes, 1):
        out.append(f'<p style="font-size: 12px; color: #999999; margin: 2px 0; word-break: break-all">[{n}] {text}: {href}</p>')
    return body + "\n" + "\n".join(out)


# ---------------------------------------------------------------------------
# Markdown -> 语义化 HTML
# ---------------------------------------------------------------------------

def _inline(text, colors):
    """行内解析：代码 -> 粗体 -> 斜体 -> 图片 -> 链接。"""
    # 代码占位
    codes = []

    def stash_code(m):
        codes.append(m.group(1))
        return f"\x00CODE{len(codes) - 1}\x00"

    text = re.sub(r"`([^`\n]+?)`", stash_code, text)
    # 图片
    text = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)",
                  lambda m: f'<img alt="{m.group(1)}" src="{m.group(2)}">', text)
    # 链接
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)",
                  lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', text)
    # 粗体
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    # 斜体
    text = re.sub(r"(?<!\*)\*([^*\n]+?)\*(?!\*)", r"<em>\1</em>", text)
    # 还原代码
    def restore(m):
        idx = int(m.group(1))
        return f'<code style="background: {colors.get("code_bg", "#f1f5f9")}; color: {colors.get("code_color", "#d946ef")}; padding: 2px 6px; border-radius: 4px; font-size: 14px">{html.escape(codes[idx])}</code>'

    text = re.sub(r"\x00CODE(\d+)\x00", restore, text)
    return text


def md_to_html(md, colors):
    lines = md.split("\n")
    i = 0
    blocks = []

    def flush_paragraph(buf):
        if buf:
            para = " ".join(buf).strip()
            if para:
                blocks.append(f"<p>{_inline(para, colors)}</p>")

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # 代码块
        if stripped.startswith("```"):
            lang = stripped[3:].strip()
            i += 1
            code = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code.append(lines[i])
                i += 1
            i += 1  # 跳过结束 ```
            code_txt = html.escape("\n".join(code))
            data_lang = f' data-lang="{html.escape(lang)}"' if lang else ""
            blocks.append(f"<pre{data_lang}><code>{code_txt}</code></pre>")
            continue

        # 标题
        m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            level = len(m.group(1))
            blocks.append(f"<h{level}>{_inline(m.group(2), colors)}</h{level}>")
            i += 1
            continue

        # 分隔线
        if re.match(r"^(-{3,}|\*{3,})$", stripped):
            blocks.append("<hr>")
            i += 1
            continue

        # 引用
        if stripped.startswith(">"):
            quote = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote.append(re.sub(r"^>\s?", "", lines[i]))
                i += 1
            inner = md_to_html("\n".join(quote), colors)
            blocks.append(f"<blockquote>{inner}</blockquote>")
            continue

        # 表格
        if "|" in stripped and i + 1 < len(lines) and re.match(r"^\s*\|?[\s:|-]+\|?\s*$", lines[i + 1]):
            header = [c.strip() for c in stripped.strip().strip("|").split("|")]
            i += 2
            rows = []
            while i < len(lines) and "|" in lines[i].strip():
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                rows.append(cells)
                i += 1
            thead = "".join(f"<th>{_inline(c, colors)}</th>" for c in header)
            trs = []
            for r in rows:
                trs.append("<tr>" + "".join(f"<td>{_inline(c, colors)}</td>" for c in r) + "</tr>")
            blocks.append(f"<table><thead><tr>{thead}</tr></thead><tbody>{''.join(trs)}</tbody></table>")
            continue

        # 列表（- / * / 1.）
        if re.match(r"^([-*]|\d+\.)\s+", stripped):
            ordered = bool(re.match(r"^\d+\.\s+", stripped))
            items = []
            while i < len(lines) and re.match(r"^([-*]|\d+\.)\s+", lines[i].strip()):
                content = re.sub(r"^([-*]|\d+\.)\s+", "", lines[i].strip())
                items.append(_inline(content, colors))
                i += 1
            primary = colors.get("primary", "#2563eb")
            text_color = colors.get("text", "#333333")
            if ordered:
                secs = []
                for n, it in enumerate(items, 1):
                    secs.append(
                        f'<section style="display: flex; align-items: flex-start; margin-bottom: 8px; color: {text_color}">'
                        f'<span style="color: {primary}; margin-right: 8px; flex-shrink: 0; font-weight: 700; line-height: 1.8">{n}.</span>'
                        f'<span style="flex: 1">{it}</span></section>')
            else:
                secs = []
                for it in items:
                    secs.append(
                        f'<section style="display: flex; align-items: flex-start; margin-bottom: 8px; color: {text_color}">'
                        f'<span style="color: {primary}; margin-right: 8px; flex-shrink: 0; font-size: 18px; line-height: 1.6">•</span>'
                        f'<span style="flex: 1">{it}</span></section>')
            blocks.append("<section>" + "\n".join(secs) + "</section>")
            continue

        # 空行
        if not stripped:
            i += 1
            continue

        # 段落
        para_buf = [stripped]
        i += 1
        while i < len(lines) and lines[i].strip() and not lines[i].strip().startswith(("#", ">", "-", "*", "```")) and not re.match(r"^\d+\.\s+", lines[i].strip()) and "|" not in lines[i].strip():
            para_buf.append(lines[i].strip())
            i += 1
        flush_paragraph(para_buf)

    return "\n".join(blocks)


# ---------------------------------------------------------------------------
# 内联样式 / 暗黑模式 / 粘贴加固 重写器
# ---------------------------------------------------------------------------

class _StyleRewriter(HTMLParser):
    VOID = {"br", "img", "hr", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"}

    def __init__(self, theme):
        super().__init__(convert_charrefs=True)
        self.theme = theme
        self.rules = theme.get("rules", {})
        self.colors = theme.get("colors", {})
        self.dm = theme.get("darkmode", {}) or {}
        self.out = []
        self.stack = []

    @staticmethod
    def _parse(s):
        d = {}
        for item in s.split(";"):
            if ":" in item:
                k, v = item.split(":", 1)
                d[k.strip()] = v.strip()
        return d

    def _merged(self, tag):
        style = {}
        if tag in self.rules:
            style.update(self._parse(self.rules[tag]))
        if self.stack:
            key = f"{self.stack[-1]} {tag}"
            if key in self.rules:
                style.update(self._parse(self.rules[key]))
        return style

    def _dm_color(self, tag):
        dm = self.dm
        if tag in ("h1", "h2", "h3", "h4"):
            return dm.get("text", "#e0e0e0")
        if tag in ("pre", "code"):
            return dm.get("code_color", "#d4d4d4")
        if tag == "blockquote":
            return dm.get("text", "#c8c8c8")
        if tag == "strong":
            return dm.get("primary", "#6aadff")
        return dm.get("text", "#c8c8c8")

    def handle_starttag(self, tag, attrs):
        attr = dict(attrs)
        style = self._merged(tag)
        existing = attr.get("style", "")
        if existing:
            for k, v in self._parse(existing).items():
                style.setdefault(k, v)
        if style:
            attr["style"] = "; ".join(f"{k}: {v}" for k, v in style.items())
        if "color" in style:
            attr["data-darkmode-color"] = self._dm_color(tag)
            if tag not in ("pre", "code", "blockquote"):
                attr["data-darkmode-bgcolor"] = "transparent"
        astr = "".join(f' {k}="{v}"' for k, v in attr.items())
        self.out.append(f"<{tag}{astr}>")
        if tag not in self.VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if self.stack and self.stack[-1] == tag:
            self.stack.pop()
        self.out.append(f"</{tag}>")

    def handle_data(self, data):
        if not data.strip():
            self.out.append(data)
            return
        if self.stack and self.stack[-1] in ("pre", "code"):
            self.out.append(data)
            return
        self.out.append(f'<span leaf="">{data}</span>')


def apply_inline_styles(body, theme):
    r = _StyleRewriter(theme)
    r.feed(body)
    r.close()
    out = "".join(r.out)
    # 空装饰元素补占位，防微信剥样式
    out = re.sub(r"<(section|span)([^>]*)></\1>",
                 lambda m: f'<{m.group(1)}{m.group(2)}><span leaf=""><br></span></{m.group(1)}>', out)
    return out


# ---------------------------------------------------------------------------
# 摘要
# ---------------------------------------------------------------------------

def generate_digest(body, max_bytes=120):
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", body, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text.encode("utf-8")) <= max_bytes:
        return text
    ell = "..."
    target = max_bytes - len(ell.encode("utf-8"))
    return text.encode("utf-8")[:target].decode("utf-8", errors="ignore").rstrip() + ell


def extract_images(body):
    return re.findall(r'<img[^>]*src="([^"]*)"', body)


# ---------------------------------------------------------------------------
# 图床 URL 替换
# ---------------------------------------------------------------------------

def rewrite_images(body, img_base=None, img_map=None):
    """把本地/相对图片路径替换为图床可访问的 http(s) URL。

    - img_map：{本地src或文件名: 完整URL} 精确映射，优先级最高（真实图床最准）
    - img_base：URL 前缀，自动拼接图片文件名（如 --img-base https://cdn.example.com/imgs）
    - 已是 http(s) 的绝对地址则原样保留，不重复拼接
    两者都不提供时原样返回。
    """
    if not img_base and not img_map:
        return body
    img_map = img_map or {}

    def repl(m):
        full = m.group(0)
        attrs = m.group(1)
        sm = re.search(r'src="([^"]*)"', attrs)
        if not sm:
            return full
        src = sm.group(1)
        # 已是绝对 URL，跳过
        if re.match(r"https?://", src):
            return full
        # 精确映射优先（支持带 ./ 与纯文件名两种键）
        if src in img_map:
            new = img_map[src]
        else:
            base_name = os.path.basename(src)
            if base_name in img_map:
                new = img_map[base_name]
            elif img_base:
                new = img_base.rstrip("/") + "/" + base_name
            else:
                return full
        new_attrs = attrs.replace(f'src="{src}"', f'src="{new}"', 1)
        return f"<img {new_attrs}>"

    return re.sub(r"<img\s+([^>]*)>", repl, body)


# ---------------------------------------------------------------------------
# 本地图片 base64 内嵌（便于复制粘贴时图片随文本一起带走）
# ---------------------------------------------------------------------------

_MIME = {
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "gif": "image/gif", "webp": "image/webp", "bmp": "image/bmp",
    "svg": "image/svg+xml",
}


def embed_images(body, base_dir):
    """把本地相对/绝对图片路径内嵌为 base64 data URI。

    已是 http(s) 的路径（图床 / 微信图床）不处理。找不到文件的路径保留原样。
    base_dir 用于解析相对路径（通常是输入 Markdown 所在目录）。
    """
    def repl(m):
        full = m.group(0)
        attrs = m.group(1)
        sm = re.search(r'src="([^"]*)"', attrs)
        if not sm:
            return full
        src = sm.group(1)
        if re.match(r"https?://", src):
            return full
        path = src if os.path.isabs(src) else os.path.normpath(os.path.join(base_dir, src))
        if not os.path.isfile(path):
            return full
        ext = os.path.splitext(path)[1].lower().lstrip(".")
        mime = _MIME.get(ext, "application/octet-stream")
        try:
            with open(path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("ascii")
        except Exception:
            return full
        new_attrs = attrs.replace(f'src="{src}"', f'src="data:{mime};base64,{b64}"', 1)
        return f"<img {new_attrs}>"

    return re.sub(r"<img\s+([^>]*)>", repl, body)


# ---------------------------------------------------------------------------
# 主编排
# ---------------------------------------------------------------------------

def convert(md_text, theme, img_base=None, img_map=None):
    # 标题（H1）
    title = ""
    for line in md_text.split("\n"):
        s = line.strip()
        if s.startswith("# ") and not s.startswith("## "):
            title = s[2:].strip()
            break
    # 去掉 H1（微信有独立标题字段）
    md_lines = [l for l in md_text.split("\n")
                if not (l.strip().startswith("# ") and not l.strip().startswith("## "))]

    md = "\n".join(md_lines)
    md = _preprocess_containers(md, theme["colors"])
    md = fix_cjk_spacing(md)
    body = md_to_html(md, theme["colors"])
    body = fix_cjk_bold_punct(body)
    body, footnotes = convert_links_to_footnotes(body, theme["colors"])
    body = apply_inline_styles(body, theme)
    body = rewrite_images(body, img_base, img_map)
    body = append_footnotes(body, footnotes)
    # AIGC 声明
    aigc = theme.get("aigc_footer", theme["colors"].get("aigc_footer", True))
    if aigc:
        body += ('\n<p style="text-align: center; font-size: 13px; color: #9ca3af; '
                 'margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e7eb;">'
                 '本文由 AI 辅助创作，作者进行了实测验证和编辑修改。</p>')
    digest = generate_digest(body)
    images = extract_images(body)
    return body, title, digest, images


def preview_document(body, theme):
    colors = theme.get("colors", {})
    font_stack = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
    bg = colors.get("background", "#ffffff")
    text = colors.get("text", "#333333")
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>公众号预览</title>
<style>
  body {{ max-width: 720px; margin: 0 auto; padding: 20px; background: {bg}; color: {text}; font-family: {font_stack}; font-size: 16px; line-height: 1.8; word-wrap: break-word; }}
</style>
</head>
<body>
{body}
</body>
</html>"""


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv=None):
    ap = argparse.ArgumentParser(description="Markdown -> 微信公众号内联样式 HTML 转换器")
    ap.add_argument("input", help="输入 Markdown 文件路径")
    ap.add_argument("--theme", default="professional-clean", help="主题名（themes/ 下的 json，不含扩展名）")
    ap.add_argument("--themes-dir", default=None, help="主题目录（默认脚本同级 themes/）")
    ap.add_argument("--out", default=None, help="完整预览文档输出路径（浏览器查看）")
    ap.add_argument("--wechat-out", default=None, help="仅正文 HTML 输出路径（供草稿箱 API 推送）")
    ap.add_argument("--no-aigc", action="store_true", help="关闭文末 AIGC 声明")
    ap.add_argument("--img-base", default=None,
                    help="图床 URL 前缀：自动拼接图片文件名，如 https://cdn.example.com/imgs")
    ap.add_argument("--img-map", default=None,
                    help="图床映射 JSON 路径：{本地src或文件名: 完整URL}，精确替换（优先级高于 --img-base）")
    ap.add_argument("--embed", action="store_true",
                    help="把本地图片 base64 内嵌进输出：复制粘贴到公众号后台时图片随文本一起带走（手动发布首选）")
    args = ap.parse_args(argv)

    if not os.path.exists(args.input):
        print(f"错误：输入文件不存在：{args.input}", file=sys.stderr)
        return 2

    img_map = None
    if args.img_map:
        if not os.path.exists(args.img_map):
            print(f"错误：--img-map 文件不存在：{args.img_map}", file=sys.stderr)
            return 2
        with open(args.img_map, "r", encoding="utf-8") as f:
            img_map = json.load(f)
        if not isinstance(img_map, dict):
            print("错误：--img-map 必须是 {本地src或文件名: 完整URL} 的 JSON 对象", file=sys.stderr)
            return 2

    theme = load_theme(args.theme, args.themes_dir)
    if args.no_aigc:
        theme["aigc_footer"] = False

    md = open(args.input, "r", encoding="utf-8").read()
    body, title, digest, images = convert(md, theme, img_base=args.img_base, img_map=img_map)

    # 本地图片 base64 内嵌（手动发布复制粘贴用）
    if args.embed:
        base_dir = os.path.dirname(os.path.abspath(args.input))
        body = embed_images(body, base_dir)
        print(f"已内嵌本地图片 {len(images)} 张为 base64（复制粘贴即可带图）")

    if args.out:
        open(args.out, "w", encoding="utf-8").write(preview_document(body, theme))
        print(f"手动复制用预览 -> {args.out}")
    if args.wechat_out:
        open(args.wechat_out, "w", encoding="utf-8").write(body)
        print(f"接口发布用正文 -> {args.wechat_out}")

    if not args.out and not args.wechat_out:
        # 默认输出预览文档（与输入同目录，扩展名 .preview.html）
        default = os.path.splitext(args.input)[0] + ".preview.html"
        open(default, "w", encoding="utf-8").write(preview_document(body, theme))
        print(f"手动复制用预览 -> {default}")

    print(f"标题：{title}")
    print(f"摘要：{digest}")
    print(f"图片数：{len(images)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
