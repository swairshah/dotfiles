#!/usr/bin/env python3
"""monograph renderer: Markdown -> single self-contained HTML document.

Zero dependencies (Python 3.8+ stdlib). Typeset like a short technical
monograph: STIX Two Text body, Roboto Mono code, numbered sections with a
three-column contents block, booktabs tables, ruled listings with line
numbers and captions.

Usage:
    python3 render.py doc.md [out.html] [--open] [--pdf]
"""
import html
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


# --------------------------------------------------------------------------- util
def esc(s: str) -> str:
    return html.escape(s, quote=False)


def slug(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"[^\w\s-]", "", s.lower()).strip()
    return re.sub(r"[\s_]+", "-", s) or "section"


def parse_frontmatter(text: str):
    meta = {}
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            for line in text[3:end].strip().splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip().strip('"').strip("'")
            text = text[end + 4:]
    return meta, text.lstrip("\n")


# ------------------------------------------------------------------------- inline
SECTION_REF = re.compile(r"§\s*(\d+(?:\.\d+)*)")


def inline(text: str, refs=None) -> str:
    """Inline Markdown -> HTML. `refs` maps section numbers to anchors."""
    out = []
    i = 0
    # code spans first so nothing inside them is touched
    parts = re.split(r"(`+)(.+?)\1", text)
    # re.split with two groups yields [text, ticks, code, text, ticks, code, ...]
    chunks = []
    k = 0
    while k < len(parts):
        chunks.append(("t", parts[k]))
        if k + 2 < len(parts):
            chunks.append(("c", parts[k + 2]))
        k += 3
    for kind, s in chunks:
        if kind == "c":
            code = esc(s.strip()).replace("&lt;br&gt;", "<br>")
            out.append(f"<code>{code}</code>")
            continue
        s = esc(s).replace("&lt;br&gt;", "<br>")
        s = s.replace("---", "—").replace("--", "–")
        s = re.sub(r'(^|[\s(\[])"', "\\1“", s).replace('"', "”")
        s = re.sub(r"(^|[\s(\[])'", "\\1‘", s).replace("'", "’")
        s = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", r'<img alt="\1" src="\2">', s)
        s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
        s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", s)
        s = re.sub(r"(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w_])", r"<em>\1</em>", s)
        s = re.sub(r"\[\^(\w+)\]", r'<sup class="fn"><a href="#fn-\1" id="fnref-\1">\1</a></sup>', s)
        if refs is not None:
            def ref(m):
                n = m.group(1)
                if n in refs:
                    return f'<a class="secref" href="#{refs[n]}">§{n}</a>'
                return m.group(0)
            s = SECTION_REF.sub(ref, s)
        out.append(s)
    return "".join(out)


# ---------------------------------------------------------------------- highlight
KEYWORDS = {
    "js": "export import function return const let var if else for while do switch case break continue new "
          "class extends async await yield typeof instanceof in of this null undefined true false throw try "
          "catch finally default from as declare module interface type enum implements readonly private public "
          "protected static namespace keyof infer never unknown any void number string boolean",
    "py": "def class return import from as if elif else for while in not and or is None True False try except "
          "finally with lambda yield pass break continue raise global nonlocal async await del assert",
    "sh": "if then else fi for in do done while case esac function return export local echo exit",
    "go": "func package import return if else for range var const type struct interface map chan go defer "
          "select switch case default break continue nil true false",
    "rs": "fn let mut pub use mod struct enum impl trait for in if else match return where as const static "
          "self Self crate super loop while break continue move ref type unsafe async await dyn true false",
}
KEYWORDS.update(ts=KEYWORDS["js"], jsx=KEYWORDS["js"], tsx=KEYWORDS["js"], javascript=KEYWORDS["js"],
                typescript=KEYWORDS["js"], python=KEYWORDS["py"], bash=KEYWORDS["sh"], shell=KEYWORDS["sh"],
                zsh=KEYWORDS["sh"], golang=KEYWORDS["go"], rust=KEYWORDS["rs"])

TOKEN = re.compile(
    r"(?P<comment>//[^\n]*|#(?![{(])[^\n]*|/\*.*?\*/)"
    r"|(?P<string>\"(?:\\.|[^\"\\\n])*\"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)"
    r"|(?P<number>\b\d+(?:\.\d+)?\b)"
    r"|(?P<word>[A-Za-z_$][\w$]*)",
    re.S,
)


def highlight(code: str, lang: str) -> str:
    lang = (lang or "").lower()
    if lang in ("json",):
        return highlight_json(code)
    kws = set(KEYWORDS.get(lang, "").split())
    py_like = lang in ("py", "python", "sh", "bash", "shell", "zsh")
    out, pos = [], 0
    for m in TOKEN.finditer(code):
        out.append(esc(code[pos:m.start()]))
        pos = m.end()
        t = m.group(0)
        if m.group("comment"):
            if t.startswith("#") and not py_like:
                out.append(esc(t))
            else:
                out.append(f'<span class="c">{esc(t)}</span>')
        elif m.group("string"):
            out.append(f'<span class="s">{esc(t)}</span>')
        elif m.group("number"):
            out.append(f'<span class="n">{esc(t)}</span>')
        elif t in kws:
            out.append(f'<span class="k">{esc(t)}</span>')
        else:
            out.append(esc(t))
    out.append(esc(code[pos:]))
    return "".join(out)


def highlight_json(code: str) -> str:
    out, pos = [], 0
    for m in re.finditer(r'("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null|-?\d+(?:\.\d+)?)\b', code):
        out.append(esc(code[pos:m.start()]))
        pos = m.end()
        if m.group(1):
            cls = "j" if m.group(2) else "s"
            out.append(f'<span class="{cls}">{esc(m.group(1))}</span>{esc(m.group(2) or "")}')
        else:
            out.append(f'<span class="n">{esc(m.group(3))}</span>')
    out.append(esc(code[pos:]))
    return "".join(out)


# ----------------------------------------------------------------------- tokenize
def tokenize(md: str):
    lines = md.split("\n")
    toks, i = [], 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        m = re.match(r"^(```+|~~~+)\s*(\S*)\s*(.*)$", line)
        if m:
            fence, lang, info = m.groups()
            body = []
            i += 1
            while i < len(lines) and not lines[i].startswith(fence):
                body.append(lines[i])
                i += 1
            i += 1
            toks.append({"t": "code", "lang": lang, "info": info, "body": "\n".join(body)})
            continue
        m = re.match(r"^(#{1,6})\s+(.*?)\s*#*$", line)
        if m:
            toks.append({"t": "h", "level": len(m.group(1)), "text": m.group(2)})
            i += 1
            continue
        if re.match(r"^\s*(-{3,}|\*{3,}|_{3,})\s*$", line):
            toks.append({"t": "hr"})
            i += 1
            continue
        if line.lstrip().startswith("|"):
            rows = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                rows.append(lines[i])
                i += 1
            toks.append({"t": "table", "rows": rows})
            continue
        m = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)\s*$", line)
        if m:
            toks.append({"t": "figure", "caption": m.group(1), "src": m.group(2)})
            i += 1
            continue
        m = re.match(r"^\[\^(\w+)\]:\s*(.*)$", line)
        if m:
            toks.append({"t": "footnote", "id": m.group(1), "text": m.group(2)})
            i += 1
            continue
        if line.startswith(">"):
            body = []
            while i < len(lines) and lines[i].startswith(">"):
                body.append(re.sub(r"^>\s?", "", lines[i]))
                i += 1
            toks.append({"t": "quote", "body": "\n".join(body)})
            continue
        m = re.match(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$", line)
        if m:
            ordered = m.group(2)[0].isdigit()
            items = []
            while i < len(lines):
                m = re.match(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$", lines[i])
                if m:
                    items.append(m.group(3))
                    i += 1
                elif lines[i].startswith("  ") and items:
                    items[-1] += " " + lines[i].strip()
                    i += 1
                else:
                    break
            toks.append({"t": "list", "ordered": ordered, "items": items})
            continue
        # definition-style term: "Term\n: definition" -> handled as dl
        if i + 1 < len(lines) and lines[i + 1].startswith(": "):
            items = []
            while i + 1 < len(lines) and lines[i + 1].startswith(": "):
                term, d = lines[i], lines[i + 1][2:]
                i += 2
                while i < len(lines) and lines[i].startswith("  "):
                    d += " " + lines[i].strip()
                    i += 1
                items.append((term, d))
                j = i
                while j < len(lines) and not lines[j].strip():
                    j += 1
                if j + 1 < len(lines) and lines[j].strip() and lines[j + 1].startswith(": "):
                    i = j
                else:
                    break
            toks.append({"t": "dl", "items": items})
            continue
        # display math block $$
        if line.strip().startswith("$$"):
            body = [line.strip().strip("$")]
            if not line.strip().endswith("$$") or line.strip() == "$$":
                i += 1
                while i < len(lines) and "$$" not in lines[i]:
                    body.append(lines[i])
                    i += 1
                if i < len(lines):
                    body.append(lines[i].replace("$$", ""))
            i += 1
            toks.append({"t": "math", "body": "\n".join(b for b in body if b.strip())})
            continue
        para = []
        while i < len(lines) and lines[i].strip() and not re.match(
                r"^(#{1,6}\s|```|~~~|\||>|!\[|\[\^\w+\]:|\s*([-*+]|\d+[.)])\s|\$\$)", lines[i]):
            para.append(lines[i].strip())
            i += 1
        if para:
            toks.append({"t": "p", "text": " ".join(para)})
        else:
            i += 1
    return toks


# ------------------------------------------------------------------------- render
def number_headings(toks):
    """Assign 1 / 1.1 numbers to h2 / h3 (h1 is the title). Returns refs map."""
    refs, n1, n2 = {}, 0, 0
    for t in toks:
        if t["t"] != "h":
            continue
        if t["level"] == 2:
            n1 += 1
            n2 = 0
            t["num"] = f"{n1}"
        elif t["level"] == 3:
            n2 += 1
            t["num"] = f"{n1}.{n2}"
        else:
            t["num"] = ""
        t["id"] = slug(t["text"])
        if t["num"]:
            refs[t["num"]] = t["id"]
    return refs


def render_toc(toks):
    secs = [t for t in toks if t["t"] == "h" and t["level"] in (2, 3)]
    if len(secs) < 3:
        return ""
    groups, cur = [], None
    for t in secs:
        if t["level"] == 2:
            cur = {"h": t, "subs": []}
            groups.append(cur)
        elif cur:
            cur["subs"].append(t)
    out = ['<nav class="toc" aria-label="Contents">']
    for g in groups:
        h = g["h"]
        out.append(f'<div class="toc-group"><a class="toc-h" href="#{h["id"]}"><span class="num">{h["num"]}</span>{inline(h["text"])}</a>')
        for s in g["subs"]:
            out.append(f'<a class="toc-s" href="#{s["id"]}"><span class="num">{s["num"]}</span>{inline(s["text"])}</a>')
        out.append("</div>")
    out.append("</nav>")
    return "\n".join(out)


def render_table(rows, refs):
    cells = []
    for r in rows:
        r = r.strip()
        if r.startswith("|"):
            r = r[1:]
        if r.endswith("|"):
            r = r[:-1]
        cells.append([c.strip() for c in re.split(r"(?<!\\)\|", r)])
    if len(cells) >= 2 and all(re.match(r"^:?-{2,}:?$", c) for c in cells[1] if c):
        header, body, align_row = cells[0], cells[2:], cells[1]
    else:
        header, body, align_row = None, cells, []
    aligns = ["left"] * len(align_row)
    for k, a in enumerate(align_row):
        if a.startswith(":") and a.endswith(":"):
            aligns[k] = "center"
        elif a.endswith(":"):
            aligns[k] = "right"
    headerless = header is not None and all(not h for h in header)
    out = ['<table class="tab' + (" headerless" if headerless else "") + '">']
    if header and not headerless:
        out.append("<thead><tr>" + "".join(
            f'<th style="text-align:{aligns[k] if k < len(aligns) else "left"}">{inline(h, refs)}</th>'
            for k, h in enumerate(header)) + "</tr></thead>")
    out.append("<tbody>")
    for r in body:
        out.append("<tr>" + "".join(
            f'<td style="text-align:{aligns[k] if k < len(aligns) else "left"}">{inline(c, refs)}</td>'
            for k, c in enumerate(r)) + "</tr>")
    out.append("</tbody></table>")
    return "\n".join(out)


def render(toks, refs):
    out, listing_n, figure_n = [], 0, 0
    for t in toks:
        k = t["t"]
        if k == "h":
            if t["level"] == 1:
                continue  # title comes from frontmatter / first h1
            lvl = min(t["level"], 4)
            num = f'{t["num"]}.' if t["level"] == 2 else t["num"]
            numhtml = f'<span class="num">{num}</span> ' if num else ""
            out.append(f'<h{lvl} id="{t["id"]}">{numhtml}{inline(t["text"], refs)}</h{lvl}>')
        elif k == "p":
            out.append(f"<p>{inline(t['text'], refs)}</p>")
        elif k == "code":
            info = t["info"]
            caption = ""
            m = re.search(r'caption="([^"]*)"|caption=\'([^\']*)\'', info)
            if m:
                caption = m.group(1) or m.group(2)
            numbered = "nonum" not in info and (t["body"].count("\n") >= 3 or "numbered" in info or bool(caption))
            code_html = highlight(t["body"], t["lang"])
            if numbered:
                lines = code_html.split("\n")
                rows = "".join(f'<span class="ln"></span><span class="cl">{l or " "}</span>\n' for l in lines)
                pre = f'<pre class="numbered"><code class="lang-{esc(t["lang"])}">{rows}</code></pre>'
            else:
                pre = f'<pre><code class="lang-{esc(t["lang"])}">{code_html}</code></pre>'
            if caption:
                listing_n += 1
                out.append(f'<figure class="listing" id="listing-{listing_n}">{pre}'
                           f'<figcaption><span class="label">Listing {listing_n}:</span> {inline(caption, refs)}</figcaption></figure>')
            else:
                out.append(f'<figure class="listing">{pre}</figure>')
        elif k == "table":
            out.append(render_table(t["rows"], refs))
        elif k == "figure":
            figure_n += 1
            src = t["src"]
            out.append(f'<figure class="fig" id="figure-{figure_n}"><img src="{esc(src)}" alt="{esc(t["caption"])}">'
                       f'<figcaption><span class="label">Figure {figure_n}:</span> {inline(t["caption"], refs)}</figcaption></figure>')
        elif k == "list":
            tag = "ol" if t["ordered"] else "ul"
            out.append(f"<{tag}>" + "".join(f"<li>{inline(x, refs)}</li>" for x in t["items"]) + f"</{tag}>")
        elif k == "dl":
            out.append('<table class="tab headerless"><tbody>' + "".join(
                f'<tr><td class="term">{inline(a, refs)}</td><td>{inline(b, refs)}</td></tr>' for a, b in t["items"]
            ) + "</tbody></table>")
        elif k == "quote":
            inner = render(tokenize(t["body"]), refs)
            out.append(f"<blockquote>{inner}</blockquote>")
        elif k == "math":
            out.append(f'<div class="math">{esc(t["body"])}</div>')
        elif k == "hr":
            out.append("<hr>")
        elif k == "footnote":
            pass
    return "\n".join(out)


def render_footnotes(toks, refs):
    fns = [t for t in toks if t["t"] == "footnote"]
    if not fns:
        return ""
    items = "".join(f'<li id="fn-{f["id"]}">{inline(f["text"], refs)} <a class="backref" href="#fnref-{f["id"]}">↩</a></li>' for f in fns)
    return f'<section class="footnotes"><hr><ol>{items}</ol></section>'


# --------------------------------------------------------------------------- page
def build(md_text: str, base_dir: Path) -> str:
    meta, body = parse_frontmatter(md_text)
    toks = tokenize(body)
    title = meta.get("title")
    if not title:
        for t in toks:
            if t["t"] == "h" and t["level"] == 1:
                title = t["text"]
                break
    title = title or "Untitled"
    byline = " · ".join(x for x in (meta.get("author"), meta.get("date"), meta.get("org", meta.get("affiliation"))) if x)
    refs = number_headings(toks)
    toc = render_toc(toks) if meta.get("toc", "true").lower() != "false" else ""
    css = (HERE / "style.css").read_text(encoding="utf-8")
    fonts_link = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
                  '<link href="https://fonts.googleapis.com/css2?family=STIX+Two+Text:ital,wght@0,400;0,700;1,400;1,700'
                  '&family=Roboto+Mono:wght@400;600;700&family=Fira+Code&display=swap" rel="stylesheet">')
    if meta.get("fonts", "google").lower() in ("local", "none"):
        fonts_link = ""
    subtitle = f'<p class="subtitle">{inline(meta["subtitle"])}</p>' if meta.get("subtitle") else ""
    abstract = f'<p class="abstract">{inline(meta["abstract"], refs)}</p>' if meta.get("abstract") else ""
    source = md_text.replace("</script", "<\\/script")
    byline_html = f'<p class="byline">{esc(byline)}</p>' if byline else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
{fonts_link}
<style>
{css}
</style>
</head>
<body>
<main class="doc">
<header class="titleblock">
<h1 class="title">{inline(title)}</h1>
{subtitle}
{byline_html}
</header>
{toc}
{abstract}
{render(toks, refs)}
{render_footnotes(toks, refs)}
</main>
<script type="text/markdown" id="source-md">{source}</script>
</body>
</html>
"""


def to_pdf(html_path: Path, pdf_path: Path):
    chrome = next((c for c in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome",
                                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") if shutil.which(c) or os.path.exists(c)), None)
    if not chrome:
        print("monograph: no Chrome/Chromium found for --pdf; open the HTML and print to PDF instead.", file=sys.stderr)
        return
    subprocess.run([chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer", "--virtual-time-budget=10000",
                    f"--print-to-pdf={pdf_path}", html_path.resolve().as_uri()],
                   check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if pdf_path.exists():
        print(f"monograph: wrote {pdf_path}")


def main(argv):
    flags = {a for a in argv if a.startswith("--")}
    pos = [a for a in argv if not a.startswith("--")]
    if not pos or "--help" in flags:
        print(__doc__)
        return 1
    src = Path(pos[0])
    out = Path(pos[1]) if len(pos) > 1 else src.with_suffix(".html")
    md = src.read_text(encoding="utf-8")
    out.write_text(build(md, src.parent), encoding="utf-8")
    print(f"monograph: wrote {out}")
    if "--pdf" in flags:
        to_pdf(out, out.with_suffix(".pdf"))
    if "--open" in flags:
        opener = "open" if sys.platform == "darwin" else ("start" if os.name == "nt" else "xdg-open")
        subprocess.Popen([opener, str(out)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
