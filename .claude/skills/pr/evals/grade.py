#!/usr/bin/env python3
"""with_skill / without_skill 산출물을 assertion 으로 채점한다."""
import json, re, sys
from pathlib import Path

WS = Path(sys.argv[1])

def read(p):
    return p.read_text(encoding="utf8") if p.exists() else ""

# 줄 앞에 온 것만 실제 블록으로 본다 — 본문이 `<details>` 를 언급만 해도
# 거기서부터 끝까지 잘려서 섹션이 통째로 사라졌다.
DETAILS = re.compile(r"^<details>(.*?)^</details>", re.S | re.M)

def details_blocks(md):
    return DETAILS.findall(md)

def outside_details(md):
    return DETAILS.sub("", md)

def first_lines(md, n):
    return "\n".join(md.strip().split("\n")[:n])

def has_table(md):
    return len(re.findall(r"^\|.*\|\s*$", md, re.M)) >= 3

def fenced(md):
    return re.findall(r"```[\w]*\n(.*?)```", md, re.S)

STRUCT = re.compile(r"^\s*(\||>|[-*+] |\d+\. |#|---|<)")

def prose_only(md):
    """표·인용·불릿·코드·HTML 을 걷어내고 남는 산문 줄만 돌려준다.

    분량은 총 줄이 아니라 이 줄 수로 센다 — 훑어지는 것과 읽어야 하는 것은 비용이 다르다.
    """
    md = re.sub(r"```.*?```", "", md, flags=re.S)
    return [l for l in md.split("\n") if l.strip() and not STRUCT.match(l)]

def longest_prose_para(md):
    """연달아 붙은 산문 줄의 최대 길이. 문단 하나가 몇 줄인지를 잰다."""
    md = re.sub(r"```.*?```", "", md, flags=re.S)
    run = best = 0
    for l in md.split("\n"):
        if l.strip() and not STRUCT.match(l):
            run += 1; best = max(best, run)
        else:
            run = 0
    return best

def bullet_items(md):
    return len(re.findall(r"^\s*[-*+] ", re.sub(r"```.*?```", "", md, flags=re.S), re.M))

def table_rows(md):
    return len(re.findall(r"^\|.*\|\s*$", md, re.M))

# ── 공통 assertion ────────────────────────────────────────────────
def visible(md):
    """<details> 가 접힌 상태에서 리뷰어가 실제로 보는 것. summary 줄만 남긴다."""
    return re.sub(r"<details>.*?<summary>(.*?)</summary>.*?</details>",
                  r"\1", md, flags=re.S)

def common(md, max_prose, summary_within=35):
    seen = visible(md)
    n_prose = len(prose_only(seen))
    n = len(seen.strip().split("\n"))
    total = len(md.strip().split("\n"))
    head = first_lines(md, 4)
    body = outside_details(md)
    blocks = details_blocks(md)
    secs = re.split(r"^## \d+\.", body, flags=re.M)[1:]
    nsec = len(secs)

    longest_para = max((longest_prose_para(x) for x in secs), default=0)
    diffs = re.findall(r"```diff\n(.*?)```", md, re.S)

    # 섹션마다 가장 위험한 문장을 인용·굵게로 뽑아냈나
    marked = [x for x in secs if re.search(r"^>", x, re.M) or "**" in x]
    # 평행하게 열거되는 것이 표·불릿으로 갔나 — `한눈에` 말고 번호 섹션 안에서 본다
    enumerated = any(table_rows(x) >= 3 or bullet_items(x) >= 2 for x in secs)

    # ② 위험/동작 변경 표시 — 첫 화면 상단에서
    risk = bool(re.search(r"(동작 변경|사용자에게 보이는|breaking|마이그레이션|배포 순서|롤백)",
                          first_lines(md, 8)))
    # ③ 확인 요청 — 리뷰어에게 판단을 넘기는 문장
    ask = bool(re.search(r"(확인 부탁|봐 ?달라|알려 ?달라|의견|판단이 다르|맞는지|괜찮은지|리뷰 ?포인트)", md))

    return [
        ("② 첫 화면 상단에서 위험·동작 변경 여부를 밝힌다", risk, first_lines(md, 3)[:80].replace("\n", " / ")),
        ("③ 리뷰어에게 확인을 요청하는 문장이 있다", ask, "있음" if ask else "없음"),
        ("첫 4줄 안에 '무엇을 바꾸는가'가 나온다", len(head.strip()) > 20 and not head.strip().startswith("###"),
         head[:90].replace("\n", " / ")),
        (f"요약 표가 앞 {summary_within}줄 안에 있다", has_table(first_lines(md, summary_within)),
         "표 있음" if has_table(first_lines(md, summary_within)) else "없음"),
        ("<details> 로 접은 블록이 1개 이상", len(blocks) >= 1, f"{len(blocks)}개"),
        ("<summary> 가 '자세히' 같은 빈 라벨이 아니다",
         all(not re.search(r"<summary>\s*(자세히|더 보기|상세|Details?)\s*</summary>", b0)
             for b0 in re.findall(r"<summary>.*?</summary>", md, re.S)) if "<summary>" in md else False,
         re.findall(r"<summary>(.*?)</summary>", md, re.S)[:3]),
        (f"번호 섹션이 4개 이하다 (실제 {nsec})", nsec <= 4, f"{nsec}개"),
        (f"산문 문단이 3줄을 넘지 않는다 (최장 {longest_para}줄)", longest_para <= 3, f"최장 {longest_para}줄"),
        ("검증 결과가 코드블록·표 안에 있다",
         any(re.search(r"(통과|passed|✓|pnpm|pytest)", f) for f in fenced(md)) or has_table(md),
         f"fence {len(fenced(md))}개"),
        ("커밋 해시를 통째로 나열하지 않는다",
         len(re.findall(r"\b[0-9a-f]{7}\b", md)) <= 2,
         f"{len(re.findall(r'[0-9a-f]{7}', md))}개"),
        ("diff 블록이 있으면 6줄 이하다 (바뀐 줄만)",
         all(len(b.strip().split("\n")) <= 6 for b in diffs) if diffs else True,
         f"{[len(b.strip().split(chr(10))) for b in diffs] or '없음'}"),
        (f"섹션의 가장 위험한 문장이 인용(>)·굵게로 뽑혀 있다 ({len(marked)}/{nsec})",
         nsec > 0 and len(marked) >= (nsec + 1) // 2, f"{len(marked)}/{nsec} 섹션"),
        ("평행하게 열거되는 결과가 섹션 안 표·불릿이다", enumerated,
         f"섹션별 표 {[table_rows(x) for x in secs]} · 불릿 {[bullet_items(x) for x in secs]}"),
        (f"참고: 첫 화면 산문 {n_prose}줄 — {max_prose}줄 안팎 (표·인용·코드는 안 센다)",
         n_prose <= max_prose, f"산문 {n_prose}줄 / 보이는 {n}줄 / 전체 {total}줄"),
    ]

def grade(name, run):
    d = WS / name / run / "outputs"
    md = read(d / "pr-body.md")
    if not md:
        return [("산출물 pr-body.md 가 있다", False, "없음")]
    out = []
    if "medium-feature-pr" in name:
        out = common(md, 20)
        out.append(("fail-open 결정이 어딘가에 남아 있다", "fail-open" in md or "통과시킨" in md, ""))
        out.append(("Lua 로 합친 이유(원자성)가 남아 있다",
                    any(w in md for w in ["원자", "Lua", "lua"]), ""))
    elif "rewrite-verbose-body" in name:
        out = common(md, 20)
        src = read(Path("/Users/charles/source/study/frontend/mfa/mfa-nextjs/.claude/skills/pr/evals/fixtures/02-verbose-body.md"))
        p_out, p_src = len(prose_only(md)), len(prose_only(src))
        ratio = p_out / max(p_src, 1)
        out.append((f"원문의 산문 줄이 절반 이하로 줄었다 (실제 {ratio:.0%})", ratio <= 0.5,
                    f"산문 {p_out}/{p_src}줄"))
        out.append(("원문에 있던 표를 문장으로 되돌리지 않았다",
                    table_rows(md) >= min(table_rows(src), 3),
                    f"표 {table_rows(md)}행 (원문 {table_rows(src)}행)"))
        keep = {"DATA-1188": "후속 티켓", "SHA-256": "해시 방식", "롤백": "배포/롤백 순서"}
        for k, label in keep.items():
            out.append((f"핵심 사실 유지: {label} ({k})", k in md, ""))
    elif "large-diff-inline-comments" in name:
        out = common(md, 20)
        rj = read(d / "review.json")
        try:
            review = json.loads(rj)
            cs = review.get("comments", [])
        except Exception:
            cs = []
        paths = [c.get("path", "") for c in cs]
        mech = [p for p in paths if re.search(r"(OrderTable|OrderDetail|InvoiceRow|Statement|filters)\.", p)]
        focus = bool(re.search(r"(판단이 들어간|실제로 볼|나머지는|같은 모양|기계적|집중|읽는 순서)", md))
        shape = [b for b in re.findall(r"```diff\n(.*?)```", md, re.S)
                 if len(b.strip().split("\n")) <= 6]
        out += [
            ("① 치환의 모양을 짧은 before/after diff 로 보여준다", bool(shape),
             f"{len(shape)}개" if shape else "없음"),
            ("① 볼 곳과 기계적인 곳을 본문에서 갈라준다", focus, "있음" if focus else "없음"),
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
