#!/usr/bin/env python3
"""with_skill / without_skill 산출물을 assertion 으로 채점한다."""
import json, re, sys
from pathlib import Path

WS = Path(sys.argv[1])

def read(p):
    return p.read_text(encoding="utf8") if p.exists() else ""

def details_blocks(md):
    return re.findall(r"<details>(.*?)</details>", md, re.S)

def outside_details(md):
    return re.sub(r"<details>.*?</details>", "", md, flags=re.S)

def first_lines(md, n):
    return "\n".join(md.strip().split("\n")[:n])

def has_table(md):
    return len(re.findall(r"^\|.*\|\s*$", md, re.M)) >= 3

def fenced(md):
    return re.findall(r"```[\w]*\n(.*?)```", md, re.S)

# ── 공통 assertion ────────────────────────────────────────────────
def visible(md):
    """<details> 가 접힌 상태에서 리뷰어가 실제로 보는 것. summary 줄만 남긴다."""
    return re.sub(r"<details>.*?<summary>(.*?)</summary>.*?</details>",
                  r"\1", md, flags=re.S)

def common(md, max_lines, summary_within=35):
    n = len(visible(md).strip().split("\n"))
    total = len(md.strip().split("\n"))
    head = first_lines(md, 4)
    body = outside_details(md)
    blocks = details_blocks(md)
    # 접어야 할 신호어
    fold_words = ["기각", "고려했", "검토했", "되돌", "채택하지 않", "대안", "함정", "실패했"]
    secs = re.split(r"^## \d+\.", body, flags=re.M)[1:]
    nsec = len(secs)
    def prose(x):
        x = re.sub(r"```.*?```", "", x, flags=re.S)          # 코드블록 제외
        x = re.sub(r"^\|.*$", "", x, flags=re.M)             # 표 제외
        return len([l for l in x.strip().split("\n") if l.strip()])
    longest = max((prose(x) for x in secs), default=0)
    return [
        (f"첫 화면(details 접힘)이 {max_lines}줄 이하다 — 실제 {n}줄", n <= max_lines,
         f"보이는 {n}줄 / 전체 {total}줄"),
        ("첫 4줄 안에 '무엇을 바꾸는가'가 나온다", len(head.strip()) > 20 and not head.strip().startswith("#" * 3),
         head[:90].replace("\n", " / ")),
        (f"요약 표가 앞 {summary_within}줄 안에 있다", has_table(first_lines(md, summary_within)),
         "표 있음" if has_table(first_lines(md, summary_within)) else "없음"),
        ("<details> 로 접은 블록이 1개 이상", len(blocks) >= 1, f"{len(blocks)}개"),
        ("<summary> 가 '자세히' 같은 빈 라벨이 아니다",
         all(not re.search(r"<summary>\s*(자세히|더 보기|상세|Details?)\s*</summary>", b0)
             for b0 in re.findall(r"<summary>.*?</summary>", md, re.S)) if "<summary>" in md else False,
         re.findall(r"<summary>(.*?)</summary>", md, re.S)[:3]),
        (f"번호 섹션이 4개 이하다 (실제 {nsec})", nsec <= 4, f"{nsec}개"),
        (f"가장 긴 섹션의 산문이 5줄 이하다 (실제 {longest})", longest <= 5, f"최장 {longest}줄"),
        ("검증 결과가 코드블록·표 안에 있다",
         any(re.search(r"(통과|passed|✓|pnpm|pytest)", f) for f in fenced(md)) or has_table(md),
         f"fence {len(fenced(md))}개"),
        ("커밋 해시를 통째로 나열하지 않는다",
         len(re.findall(r"\b[0-9a-f]{7}\b", md)) <= 2,
         f"{len(re.findall(r'[0-9a-f]{7}', md))}개"),
    ]

def grade(name, run):
    d = WS / name / run / "outputs"
    md = read(d / "pr-body.md")
    if not md:
        return [("산출물 pr-body.md 가 있다", False, "없음")]
    out = []
    if "medium-feature-pr" in name:
        out = common(md, 50)
        out.append(("fail-open 결정이 어딘가에 남아 있다", "fail-open" in md or "통과시킨" in md, ""))
        out.append(("Lua 로 합친 이유(원자성)가 남아 있다",
                    any(w in md for w in ["원자", "Lua", "lua"]), ""))
    elif "rewrite-verbose-body" in name:
        out = common(md, 50)
        src = read(Path("/Users/charles/source/study/frontend/mfa/mfa-nextjs/.claude/skills/pr/evals/fixtures/02-verbose-body.md"))
        ratio = len(md) / max(len(src), 1)
        out.append((f"원문 대비 60% 이하로 줄었다 (실제 {ratio:.0%})", ratio <= 0.6, f"{len(md)}/{len(src)}자"))
        keep = {"DATA-1188": "후속 티켓", "SHA-256": "해시 방식", "롤백": "배포/롤백 순서"}
        for k, label in keep.items():
            out.append((f"핵심 사실 유지: {label} ({k})", k in md, ""))
    elif "large-diff-inline-comments" in name:
        out = common(md, 50)
        rj = read(d / "review.json")
        try:
            review = json.loads(rj)
            cs = review.get("comments", [])
        except Exception:
            cs = []
        paths = [c.get("path", "") for c in cs]
        mech = [p for p in paths if re.search(r"(OrderTable|OrderDetail|InvoiceRow|Statement|filters)\.", p)]
        out += [
            ("review.json 이 파싱된다", bool(cs), f"{len(cs)}개 코멘트"),
            (f"인라인 코멘트가 15개 이하다 (실제 {len(cs)})", 0 < len(cs) <= 15, str(len(cs))),
            ("판단이 들어간 DateRangePicker 에 코멘트가 있다",
             any("DateRangePicker" in p for p in paths), str(paths)),
            ("어댑터(lib/date) 에 코멘트가 있다",
             any("lib/date" in p for p in paths), ""),
            ("기계적 치환 파일에는 코멘트를 안 단다 (2개 이하)", len(mech) <= 2, f"{mech}"),
        ]
    return out

results = {}
import os
NAMES = sorted(d.name for d in WS.iterdir() if d.is_dir())
for name in NAMES:
    for run in ["with_skill", "without_skill", "old_skill"]:
        rows = grade(name, run)
        d = WS / name / run
        if d.exists() and rows and rows[0][0] != "산출물 pr-body.md 가 있다":
            (d / "grading.json").write_text(json.dumps(
                {"expectations": [{"text": t, "passed": bool(p), "evidence": str(e)} for t, p, e in rows]},
                ensure_ascii=False, indent=2), encoding="utf8")
        results[f"{name}/{run}"] = rows

w = tot_w = wo = tot_wo = 0
for k, rows in results.items():
    passed = sum(1 for _, p, _ in rows if p)
    print(f"\n{'='*70}\n{k}  —  {passed}/{len(rows)}")
    for t, p, e in rows:
        print(f"  {'PASS' if p else 'FAIL'}  {t}" + (f"   [{e}]" if not p and e else ""))
    if k.endswith("with_skill"): w += passed; tot_w += len(rows)
    elif rows: wo += passed; tot_wo += len(rows)
print(f"\n{'='*70}")
print(f"with_skill    {w}/{tot_w}  ({w/max(tot_w,1):.0%})")
print(f"without_skill {wo}/{tot_wo}  ({wo/max(tot_wo,1):.0%})")
