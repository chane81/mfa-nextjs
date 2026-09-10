#!/usr/bin/env python3
"""PR 본문 산출물을 마크다운으로 렌더해 나란히 비교하는 정적 HTML 을 만든다.

기본 eval 뷰어는 .md 를 raw 텍스트로 넣는다(pre.textContent). PR 본문은 표·details·
diff 하이라이트가 렌더돼야 판단이 되는 물건이라 그 상태로는 보기 어렵다.
"""
import json, re, sys
from pathlib import Path

WS = Path(sys.argv[1])
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else WS / "compare.html"
LABEL_NEW = sys.argv[3] if len(sys.argv) > 3 else "이번"
LABEL_OLD = sys.argv[4] if len(sys.argv) > 4 else "이전"

def visible_lines(md):
    return len(re.sub(r"<details>.*?<summary>(.*?)</summary>.*?</details>", r"\1",
                      md, flags=re.S).strip().split("\n"))

cases = []
for d in sorted(p for p in WS.iterdir() if p.is_dir()):
    entry = {"name": d.name, "runs": {}}
    meta = d / "eval_metadata.json"
    entry["prompt"] = json.loads(meta.read_text("utf8"))["prompt"] if meta.exists() else ""
    for cfg in ("with_skill", "old_skill", "without_skill"):
        body = d / cfg / "outputs" / "pr-body.md"
        if not body.exists():
            continue
        md = body.read_text("utf8")
        grading = d / cfg / "grading.json"
        g = json.loads(grading.read_text("utf8"))["expectations"] if grading.exists() else []
        review = d / cfg / "outputs" / "review.json"
        rc = None
        if review.exists():
            try:
                rc = json.loads(review.read_text("utf8")).get("comments", [])
            except Exception:
                rc = None
        entry["runs"][cfg] = {
            "md": md,
            "lines": visible_lines(md),
            "chars": len(md),
            "grades": g,
            "passed": sum(1 for x in g if x["passed"]),
            "total": len(g),
            "comments": [{"path": c.get("path", ""), "body": c.get("body", "")} for c in rc] if rc else None,
        }
    if entry["runs"]:
        cases.append(entry)

DATA = json.dumps({"cases": cases, "labelNew": LABEL_NEW, "labelOld": LABEL_OLD}, ensure_ascii=False)

HTML = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PR 본문 비교</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/14.1.3/marked.min.js"></script>
<style>
:root{--bg:#fff;--fg:#1f2328;--muted:#59636e;--line:#d1d9e0;--surface:#f6f8fa;--accent:#0969da;
      --ok:#1a7f37;--bad:#cf222e;--okbg:#dafbe1;--badbg:#ffebe9}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;--line:#3d444d;
      --surface:#151b23;--accent:#4493f8;--ok:#3fb950;--bad:#f85149;--okbg:#0f2417;--badbg:#2d1214}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
  font:14px/1.6 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Segoe UI",Roboto,sans-serif}
header{position:sticky;top:0;z-index:10;background:var(--bg);border-bottom:1px solid var(--line);
  padding:12px 20px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
h1{font-size:15px;margin:0;font-weight:600}
.tabs{display:flex;gap:6px;flex-wrap:wrap}
.tab{padding:5px 11px;border:1px solid var(--line);border-radius:999px;background:var(--surface);
  cursor:pointer;font-size:12.5px;color:var(--fg)}
.tab.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.prompt{padding:10px 20px;color:var(--muted);font-size:13px;border-bottom:1px solid var(--line)}
.prompt b{color:var(--fg)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:0}
@media (max-width:1000px){.cols{grid-template-columns:1fr}}
.col{border-right:1px solid var(--line);min-width:0}
.col:last-child{border-right:none}
.colhead{position:sticky;top:53px;background:var(--surface);border-bottom:1px solid var(--line);
  padding:8px 16px;font-size:12.5px;display:flex;justify-content:space-between;gap:10px;align-items:center}
.colhead .who{font-weight:600}
.stat{color:var(--muted);font-variant-numeric:tabular-nums}
.md{padding:18px 20px 40px;min-width:0;overflow-wrap:anywhere}
.md h1{font-size:20px;margin:22px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.md h2{font-size:16px;margin:22px 0 8px;padding-bottom:5px;border-bottom:1px solid var(--line)}
.md h3{font-size:14.5px;margin:18px 0 6px}
.md p{margin:9px 0}
.md table{border-collapse:collapse;margin:12px 0;display:block;overflow-x:auto;max-width:100%}
.md th,.md td{border:1px solid var(--line);padding:6px 11px;text-align:left;white-space:nowrap}
.md th{background:var(--surface);font-weight:600}
.md code{background:var(--surface);padding:.15em .4em;border-radius:5px;
  font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.md pre{background:var(--surface);padding:12px 14px;border-radius:6px;overflow-x:auto;
  border:1px solid var(--line)}
.md pre code{background:none;padding:0}
.md blockquote{margin:12px 0;padding:2px 14px;border-left:3px solid var(--line);color:var(--muted)}
.md details{border:1px solid var(--line);border-radius:6px;padding:8px 12px;margin:12px 0;
  background:var(--surface)}
.md summary{cursor:pointer;font-weight:600;font-size:13px}
.md details[open] summary{margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.md hr{border:none;border-top:1px solid var(--line);margin:20px 0}
.md ul,.md ol{padding-left:22px;margin:9px 0}
.dl-add{color:var(--ok);background:var(--okbg);display:block}
.dl-del{color:var(--bad);background:var(--badbg);display:block}
.grades{margin:0 20px 26px;border:1px solid var(--line);border-radius:6px;overflow:hidden}
.grades summary{padding:9px 13px;background:var(--surface);cursor:pointer;font-size:13px;font-weight:600}
.g{padding:6px 13px;border-top:1px solid var(--line);font-size:12.5px;display:flex;gap:9px}
.g .m{flex:0 0 auto;font-weight:700}
.g.p .m{color:var(--ok)} .g.f .m{color:var(--bad)}
.g .e{color:var(--muted);margin-left:auto;font-size:11.5px;text-align:right}
.cmts{margin:0 20px 26px;border:1px solid var(--line);border-radius:6px;overflow:hidden}
.cmts summary{padding:9px 13px;background:var(--surface);cursor:pointer;font-size:13px;font-weight:600}
.cmt{padding:9px 13px;border-top:1px solid var(--line);font-size:12.5px}
.cmt .p{font:12px ui-monospace,Menlo,monospace;color:var(--accent);margin-bottom:4px}
.toggle{margin-left:auto;font-size:12.5px;color:var(--muted)}
.toggle label{cursor:pointer;user-select:none}
</style></head><body>
<header>
  <h1>PR 본문 비교</h1>
  <div class="tabs" id="tabs"></div>
  <div class="toggle"><label><input type="checkbox" id="raw"> 원본 마크다운</label></div>
</header>
<div class="prompt" id="prompt"></div>
<div class="cols" id="cols"></div>
<script>
const D = __DATA__;
let cur = 0;
marked.setOptions({gfm:true, breaks:false});

function highlightDiff(html){
  // ```diff 블록 안의 +/- 줄에 색을 입힌다
  return html.replace(/<pre><code class="language-diff">([\\s\\S]*?)<\\/code><\\/pre>/g, (m, code) => {
    const lines = code.split("\\n").map(l => {
      if (l.startsWith("+")) return '<span class="dl-add">' + l + '</span>';
      if (l.startsWith("-")) return '<span class="dl-del">' + l + '</span>';
      return l;
    }).join("\\n");
    return '<pre><code class="language-diff">' + lines + '</code></pre>';
  });
}

function pane(cfg, run, label){
  if (!run) return '<div class="col"><div class="colhead"><span class="who">' + label +
    '</span></div><div class="md"><p style="color:var(--muted)">산출물 없음</p></div></div>';
  const rate = run.total ? (run.passed + "/" + run.total) : "";
  const raw = document.getElementById("raw").checked;
  const bodyHtml = raw
    ? '<pre style="white-space:pre-wrap">' + run.md.replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])) + '</pre>'
    : highlightDiff(marked.parse(run.md));
  const grades = run.grades.length ? '<details class="grades"><summary>채점 ' + rate +
    '</summary>' + run.grades.map(g =>
      '<div class="g ' + (g.passed ? "p" : "f") + '"><span class="m">' + (g.passed ? "PASS" : "FAIL") +
      '</span><span>' + g.text + '</span><span class="e">' + (g.evidence || "") + '</span></div>').join("") +
    '</details>' : "";
  const cmts = run.comments ? '<details class="cmts"><summary>인라인 코멘트 ' + run.comments.length +
    '개</summary>' + run.comments.map(c =>
      '<div class="cmt"><div class="p">' + c.path + '</div>' + marked.parse(c.body) + '</div>').join("") +
    '</details>' : "";
  return '<div class="col"><div class="colhead"><span class="who">' + label +
    '</span><span class="stat">첫 화면 ' + run.lines + '줄 · ' + run.chars + '자 · ' + rate +
    '</span></div><div class="md">' + bodyHtml + '</div>' + grades + cmts + '</div>';
}

function render(){
  const c = D.cases[cur];
  document.getElementById("prompt").innerHTML = '<b>프롬프트</b> — ' + c.prompt;
  const older = c.runs.old_skill || c.runs.without_skill;
  const olderLabel = c.runs.old_skill ? D.labelOld : "스킬 없음";
  document.getElementById("cols").innerHTML =
    pane("old", older, olderLabel) + pane("new", c.runs.with_skill, D.labelNew);
  [...document.querySelectorAll(".tab")].forEach((t,i) => t.classList.toggle("on", i === cur));
  window.scrollTo(0,0);
}
document.getElementById("tabs").innerHTML = D.cases.map((c,i) =>
  '<button class="tab" onclick="cur=' + i + ';render()">' + c.name.replace(/^eval-\\d+-/, "") + '</button>').join("");
document.getElementById("raw").addEventListener("change", render);
document.addEventListener("keydown", e => {
  if (e.key === "ArrowRight") { cur = (cur+1) % D.cases.length; render(); }
  if (e.key === "ArrowLeft")  { cur = (cur-1+D.cases.length) % D.cases.length; render(); }
});
render();
</script></body></html>"""

OUT.write_text(HTML.replace("__DATA__", DATA), encoding="utf8")
print(f"생성: {OUT}  ({len(cases)}개 케이스)")
