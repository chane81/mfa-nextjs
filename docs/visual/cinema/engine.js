/**
 * 시네마 엔진 — 레인·노드·시나리오 데이터를 받아 재생 가능한 무대를 만든다.
 *
 * ## 무엇을 하나
 * - 레인(가로줄)과 노드(상자)를 DOM 으로 깔고
 * - 노드의 **실제 좌표**를 읽어 연결선을 SVG 로 다시 그리며(레이아웃이 바뀌면 따라온다)
 * - 장면을 자동 재생하고(점은 getPointAtLength 로 직접 옮긴다)
 * - 노드에 호버·포커스하면 설명 상자를 겹치지 않는 자리에 띄운다.
 *
 * ## 쓰는 법
 * 페이지는 `#scenarios` · `#track` · `#stage`(그 안에 `#wires` · `#lanes` · `#tip`) ·
 * `#detail` · `#chapters` · 트랜스포트 버튼들을 HTML 로 깔아두고 이 함수를 부른다.
 *
 *   Cinema.mount({ lanes: LANES, nodes: NODES, scenarios: SCENARIOS });
 *
 * ## 데이터 모양
 * - lanes:     { id, name, sub, color }
 * - nodes:     { id, lane, t, s, info: { d, k: [[항목, 값]…], f } }
 * - scenarios: { id, n, t, d, accent, steps: [{ g, title, no, body, why, facts,
 *                src, on, flow, badge, fail, hold }] }
 *
 * 의존성 없음. `prefers-reduced-motion` 이면 자동 재생과 점 이동을 끄고 장면 전환만 남긴다.
 */
(function (global) {
  'use strict';

  function mount(data) {
    var LANES = data.lanes;
    var NODES = data.nodes;
    var SCENARIOS = data.scenarios;

    var REDUCED =
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ================================================================
     DOM 조립
     ================================================================ */
    var $ = function (s) {
      return document.querySelector(s);
    };

    var lanesEl = $('#lanes');
    var wires = $('#wires');
    var stage = $('#stage');
    var nodeEls = {};

    LANES.forEach(function (lane) {
      var el = document.createElement('div');
      el.className = 'lane';
      el.dataset.lane = lane.id;
      el.style.setProperty('--lane-color', lane.color);

      var name = document.createElement('div');
      name.className = 'lane-name';
      name.innerHTML = '<b>' + lane.name + '</b>' + lane.sub;

      var row = document.createElement('div');
      row.className = 'lane-row';

      NODES.filter(function (n) {
        return n.lane === lane.id;
      }).forEach(function (n) {
        var box = document.createElement('div');
        box.className = 'node';
        box.id = 'n-' + n.id;
        box.innerHTML =
          '<span class="tag"></span><div class="nt">' +
          n.t +
          '</div><div class="ns">' +
          n.s +
          '</div>';
        // 설명 상자는 마우스뿐 아니라 키보드로도 열린다
        box.tabIndex = 0;
        box.setAttribute('aria-describedby', 'tip');
        box.addEventListener('mouseenter', function () {
          showTip(n, box);
        });
        box.addEventListener('focus', function () {
          showTip(n, box);
        });
        box.addEventListener('mouseleave', hideTip);
        box.addEventListener('blur', hideTip);
        // 터치 기기에는 hover 가 없다 — 탭으로 토글한다
        box.addEventListener('click', function () {
          tipFor === n.id ? hideTip() : showTip(n, box);
        });

        row.appendChild(box);
        nodeEls[n.id] = box;
      });

      el.appendChild(name);
      el.appendChild(row);
      lanesEl.appendChild(el);
    });

    /* ================================================================
     상태
     ================================================================ */
    var scenario = SCENARIOS[0];
    var index = 0;
    var playing = false;
    var rate = 1;
    var STEP_MS = 5200;
    var stepStart = 0;
    var raf = null;
    var packets = []; // 현재 장면에서 움직이는 점들

    /* ================================================================
     노드 설명 상자 — 장면과 독립이다. 재생을 세우지 않고도 아무 상자나
     짚어볼 수 있어야 해서, 여는 동안만 재생을 멈췄다가 떠나면 되돌린다.
     ================================================================ */
    var tipEl = $('#tip');
    var tipFor = null;
    var tipResume = false;

    function showTip(n, box) {
      if (!n.info) return;
      var i = n.info;
      tipFor = n.id;

      var rows = (i.k || [])
        .map(function (kv) {
          return '<dt>' + kv[0] + '</dt><dd>' + kv[1] + '</dd>';
        })
        .join('');

      tipEl.innerHTML =
        '<div class="tip-t">' +
        n.t +
        '</div><div class="tip-d">' +
        i.d +
        '</div>' +
        (rows ? '<dl>' + rows + '</dl>' : '') +
        (i.f ? '<div class="tip-f">' + i.f + '</div>' : '');

      tipEl.hidden = false; // 먼저 보여야 크기를 잴 수 있다
      placeTip(box);
      tipEl.setAttribute('data-open', '1');

      if (playing) {
        tipResume = true;
        pause();
      }
    }

    /**
     * 설명 상자를 놓는다.
     *
     * 무대는 `overflow: hidden` 이라 밖으로 나가면 잘린다. 그렇다고 좌표만
     * 가두면 **상자를 덮어버린다** — 설명하려는 대상이 안 보이는 건 잘린 것보다
     * 나쁘다. 그래서 네 방향을 차례로 시험해 **무대 안에 들어가면서 노드를 안
     * 가리는** 첫 자리를 고른다. 위·아래는 가로만, 좌·우는 세로만 가둔다
     * (가리키는 축을 가두면 꼬리가 노드를 못 따라간다).
     */
    function placeTip(box) {
      var sb = stage.getBoundingClientRect();
      var b = box.getBoundingClientRect();
      var w = tipEl.offsetWidth;
      var h = tipEl.offsetHeight;
      var GAP = 12; // 꼬리(8px)가 들어갈 자리
      var PAD = 8;

      var nx = b.left - sb.left;
      var ny = b.top - sb.top;
      var cx = nx + b.width / 2;
      var cy = ny + b.height / 2;

      function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
      }

      var cands = [
        { dir: 'up', left: cx - w / 2, top: ny - h - GAP },
        { dir: 'down', left: cx - w / 2, top: ny + b.height + GAP },
        { dir: 'right', left: nx + b.width + GAP, top: cy - h / 2 },
        { dir: 'left', left: nx - w - GAP, top: cy - h / 2 },
      ];

      var pick = null;
      for (var i = 0; i < cands.length; i++) {
        var c = cands[i];
        if (c.dir === 'up' || c.dir === 'down') {
          c.left = clamp(c.left, PAD, sb.width - w - PAD);
        } else {
          c.top = clamp(c.top, PAD, sb.height - h - PAD);
        }
        if (
          c.top >= PAD &&
          c.top + h <= sb.height - PAD &&
          c.left >= PAD &&
          c.left + w <= sb.width - PAD
        ) {
          pick = c;
          break;
        }
      }

      // 네 방향 다 안 되면(무대보다 상자가 큰 경우) 공간이 넓은 쪽에 붙이고 가둔다
      if (!pick) {
        pick = ny > sb.height - (ny + b.height) ? cands[0] : cands[1];
        pick.top = clamp(pick.top, PAD, Math.max(PAD, sb.height - h - PAD));
      }

      tipEl.style.left = pick.left + 'px';
      tipEl.style.top = pick.top + 'px';
      tipEl.setAttribute('data-dir', pick.dir);

      // 꼬리는 상자 모서리를 넘지 않는 선에서 노드 중심을 가리킨다
      if (pick.dir === 'up' || pick.dir === 'down') {
        tipEl.style.setProperty(
          '--ax',
          clamp(cx - pick.left, 16, w - 16) + 'px',
        );
      } else {
        tipEl.style.setProperty(
          '--ay',
          clamp(cy - pick.top, 16, h - 16) + 'px',
        );
      }
    }

    function hideTip() {
      if (!tipFor) return;
      tipFor = null;
      tipEl.removeAttribute('data-open');
      tipEl.hidden = true;
      if (tipResume) {
        tipResume = false;
        play();
      }
    }

    /* ---------------------------------------------------- 시나리오 탭 */
    var scnWrap = $('#scenarios');
    SCENARIOS.forEach(function (s, i) {
      var b = document.createElement('button');
      b.className = 'scn';
      b.type = 'button';
      b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      b.style.setProperty('--accent', s.accent);
      b.innerHTML =
        '<span class="n">' +
        s.n +
        ' · 장면 ' +
        s.steps.length +
        '</span><span class="t">' +
        s.t +
        '</span><span class="d">' +
        s.d +
        '</span>';
      b.addEventListener('click', function () {
        selectScenario(i);
      });
      scnWrap.appendChild(b);
    });

    function selectScenario(i) {
      scenario = SCENARIOS[i];
      document.documentElement.style.setProperty('--accent', scenario.accent);
      Array.prototype.forEach.call(scnWrap.children, function (b, j) {
        b.setAttribute('aria-pressed', i === j ? 'true' : 'false');
      });
      buildTrack();
      buildChapters();
      goTo(0, true);
    }

    /* ------------------------------------------------------ 진행 눈금 */
    var trackEl = $('#track');
    function buildTrack() {
      trackEl.innerHTML = '';
      scenario.steps.forEach(function (st, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.title = i + 1 + '. ' + st.title;
        b.innerHTML = '<i></i>';
        b.addEventListener('click', function () {
          goTo(i, true);
        });
        trackEl.appendChild(b);
      });
    }

    /* ------------------------------------------------------ 장면 목록 */
    var chaptersEl = $('#chapters');
    function buildChapters() {
      chaptersEl.innerHTML = '';
      var ol = document.createElement('ol');
      var lastGroup = null;
      scenario.steps.forEach(function (st, i) {
        if (st.g !== lastGroup) {
          var g = document.createElement('div');
          g.className = 'grp';
          g.textContent = st.g;
          ol.appendChild(g);
          lastGroup = st.g;
        }
        var li = document.createElement('li');
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = st.title;
        b.addEventListener('click', function () {
          goTo(i, true);
        });
        li.appendChild(b);
        ol.appendChild(li);
      });
      chaptersEl.appendChild(ol);
    }

    /* ================================================================
     연결선 — 노드의 실제 좌표를 읽어 SVG 로 다시 그린다.
     레이아웃이 바뀌면(리사이즈 · 레인 접힘) 그대로 따라온다.
     ================================================================ */
    function anchors(fromEl, toEl) {
      var sb = stage.getBoundingClientRect();
      var a = fromEl.getBoundingClientRect();
      var b = toEl.getBoundingClientRect();

      var ax = a.left - sb.left + a.width / 2;
      var ay = a.top - sb.top + a.height / 2;
      var bx = b.left - sb.left + b.width / 2;
      var by = b.top - sb.top + b.height / 2;

      // 같은 줄이면 옆구리끼리, 다른 줄이면 위아래로 붙인다.
      // ⚠️ 방향은 **좌표를 옮기기 전에** 정한다 — ax 를 먼저 바꾸면
      // 다음 줄의 비교가 이미 옮겨진 값을 보고 반대 변을 고른다.
      var rightward = bx > ax;
      var downward = by > ay;

      if (Math.abs(ay - by) < a.height * 0.9) {
        ax = a.left - sb.left + (rightward ? a.width : 0);
        bx = b.left - sb.left + (rightward ? 0 : b.width);
      } else {
        ay = a.top - sb.top + (downward ? a.height : 0);
        by = b.top - sb.top + (downward ? 0 : b.height);
      }
      return { ax: ax, ay: ay, bx: bx, by: by };
    }

    function curve(p) {
      var dx = p.bx - p.ax;
      var dy = p.by - p.ay;
      if (Math.abs(dy) < 4) {
        return 'M' + p.ax + ',' + p.ay + 'L' + p.bx + ',' + p.by;
      }
      var c = Math.min(Math.abs(dy) * 0.6, 70);
      return (
        'M' +
        p.ax +
        ',' +
        p.ay +
        'C' +
        (p.ax + dx * 0.08) +
        ',' +
        (p.ay + (dy > 0 ? c : -c)) +
        ' ' +
        (p.bx - dx * 0.08) +
        ',' +
        (p.by - (dy > 0 ? c : -c)) +
        ' ' +
        p.bx +
        ',' +
        p.by
      );
    }

    function drawWires() {
      var st = scenario.steps[index];
      wires.innerHTML = '';
      packets = [];
      if (!st || !st.flow) return;

      var sb = stage.getBoundingClientRect();
      wires.setAttribute('viewBox', '0 0 ' + sb.width + ' ' + sb.height);

      st.flow.forEach(function (f) {
        var from = nodeEls[f[0]];
        var to = nodeEls[f[1]];
        if (!from || !to) return;
        var bad = f[2] === 'bad';
        var color = bad ? 'var(--alert)' : 'var(--accent, #1b4f8f)';

        var path = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'path',
        );
        path.setAttribute('d', curve(anchors(from, to)));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', '1.6');
        path.setAttribute('stroke-opacity', '0.5');
        path.setAttribute('stroke-dasharray', bad ? '5 4' : '');
        wires.appendChild(path);

        var dot = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'circle',
        );
        dot.setAttribute('r', '4.5');
        dot.setAttribute('fill', color);
        wires.appendChild(dot);

        packets.push({ path: path, dot: dot, len: path.getTotalLength() });
      });
      movePackets(0);
    }

    function movePackets(t) {
      packets.forEach(function (p, i) {
        // 점끼리 살짝 어긋나게 출발시켜 동시 이동이 한 덩어리로 안 보이게 한다
        var u = (t + i * 0.13) % 1;
        var pt = p.path.getPointAtLength(u * p.len);
        p.dot.setAttribute('cx', pt.x);
        p.dot.setAttribute('cy', pt.y);
        p.dot.setAttribute('opacity', u < 0.06 || u > 0.94 ? '0.15' : '0.95');
      });
    }

    /* ================================================================
     장면 적용
     ================================================================ */
    function render() {
      var st = scenario.steps[index];

      // 노드 상태 초기화 — 지나온 장면에 등장한 노드는 'seen' 으로 남긴다
      var seen = {};
      for (var i = 0; i < index; i++) {
        (scenario.steps[i].on || []).forEach(function (id) {
          seen[id] = true;
        });
      }

      Object.keys(nodeEls).forEach(function (id) {
        var el = nodeEls[id];
        el.className = 'node' + (seen[id] ? ' seen' : '');
        el.querySelector('.tag').textContent = '';
      });

      (st.on || []).forEach(function (id) {
        if (nodeEls[id]) nodeEls[id].classList.add('on');
      });
      (st.hold || []).forEach(function (id) {
        if (nodeEls[id]) nodeEls[id].classList.add('on', 'hold');
      });
      (st.fail || []).forEach(function (id) {
        if (nodeEls[id]) nodeEls[id].classList.add('on', 'fail');
      });
      if (st.badge) {
        Object.keys(st.badge).forEach(function (id) {
          var el = nodeEls[id];
          if (!el) return;
          el.querySelector('.tag').textContent = st.badge[id];
          el.classList.add('badge');
        });
      }

      // 해설
      $('#d-no').textContent =
        scenario.n + ' · 장면 ' + (index + 1) + '/' + scenario.steps.length;
      $('#d-title').textContent = st.title;
      $('#d-body').innerHTML = st.body;
      $('#d-why').innerHTML = st.why;

      var facts = $('#d-facts');
      facts.innerHTML = '';
      (st.facts || []).forEach(function (f) {
        var s = document.createElement('span');
        s.className = 'fact' + (scenario.id === 'tampered' ? ' hot' : '');
        s.textContent = f;
        facts.appendChild(s);
      });

      $('#d-src').innerHTML = '근거 · ' + srcLink(st.src);
      $('#clock').textContent =
        pad(index + 1) + ' / ' + pad(scenario.steps.length);

      // 눈금 · 목록
      Array.prototype.forEach.call(trackEl.children, function (b, i) {
        b.dataset.state = i < index ? 'done' : i === index ? 'now' : '';
        var bar = b.querySelector('i');
        if (bar) bar.style.width = i === index ? '0%' : '100%';
      });
      var btns = chaptersEl.querySelectorAll('button');
      Array.prototype.forEach.call(btns, function (b, i) {
        b.setAttribute('aria-current', i === index ? 'true' : 'false');
      });

      drawWires();
    }

    function pad(n) {
      return (n < 10 ? '0' : '') + n;
    }

    // `.md` 는 저장소 문서, 그 외는 코드 경로 — 둘 다 GitHub 으로 보낸다
    function srcLink(src) {
      if (!src) return '—';
      var base = 'https://github.com/chane81/mfa-nextjs/blob/main/';
      if (
        src.indexOf('docs/') === 0 ||
        src.indexOf('.') === 0 ||
        src.indexOf('scripts/') === 0 ||
        src.indexOf('apps/') === 0
      ) {
        return (
          '<a href="' +
          base +
          src.replace(/^\.\//, '') +
          '" target="_blank" rel="noopener"><code>' +
          src +
          '</code></a>'
        );
      }
      return '<code>' + src + '</code>';
    }

    /* ================================================================
     재생 루프
     ================================================================ */
    function goTo(i, pauseIt) {
      index = Math.max(0, Math.min(scenario.steps.length - 1, i));
      if (pauseIt) pause();
      stepStart = performance.now();
      render();
    }

    function tick(now) {
      var st = scenario.steps[index];
      var dur = STEP_MS / rate;
      var t = Math.min(1, (now - stepStart) / dur);

      if (!REDUCED) movePackets((now - stepStart) / (2600 / rate));

      var bar =
        trackEl.children[index] && trackEl.children[index].querySelector('i');
      if (bar) bar.style.width = t * 100 + '%';

      if (t >= 1) {
        if (index >= scenario.steps.length - 1) {
          pause();
          return;
        }
        goTo(index + 1);
        stepStart = now;
      }
      raf = requestAnimationFrame(tick);
    }

    function play() {
      if (playing) return;
      if (index >= scenario.steps.length - 1) goTo(0);
      playing = true;
      $('#play').textContent = '일시정지';
      stepStart = performance.now();
      raf = requestAnimationFrame(tick);
    }

    function pause() {
      playing = false;
      $('#play').textContent = '재생';
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    }

    /* ------------------------------------------------------------ 조작 */
    $('#play').addEventListener('click', function () {
      playing ? pause() : play();
    });
    $('#next').addEventListener('click', function () {
      goTo(index + 1, true);
    });
    $('#prev').addEventListener('click', function () {
      goTo(index - 1, true);
    });
    $('#restart').addEventListener('click', function () {
      goTo(0, true);
    });

    Array.prototype.forEach.call(
      document.querySelectorAll('.speed button'),
      function (b) {
        b.addEventListener('click', function () {
          rate = parseFloat(b.dataset.rate);
          Array.prototype.forEach.call(
            document.querySelectorAll('.speed button'),
            function (x) {
              x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
            },
          );
          stepStart = performance.now();
        });
      },
    );

    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === ' ') {
        e.preventDefault();
        playing ? pause() : play();
      } else if (e.key === 'ArrowRight') {
        goTo(index + 1, true);
      } else if (e.key === 'ArrowLeft') {
        goTo(index - 1, true);
      } else if (e.key === 'Escape') {
        hideTip();
      }
    });

    /* 테마 — OS 설정을 따르고 토글이 덮는다 */
    $('#theme').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var next = cur
        ? cur === 'dark'
          ? 'light'
          : 'dark'
        : dark
          ? 'light'
          : 'dark';
      document.documentElement.setAttribute('data-theme', next);
    });

    /* 레이아웃이 바뀌면 선을 다시 그린다 */
    var ro = window.ResizeObserver
      ? new ResizeObserver(function () {
          drawWires();
        })
      : null;
    if (ro) ro.observe(stage);
    window.addEventListener('resize', function () {
      // 설명 상자는 연 시점의 노드 좌표에 묶여 있다 — 폭이 바뀌면 닫는다
      hideTip();
      drawWires();
    });

    /* Pages 에서 열렸을 때 `.md` 상대 링크를 GitHub blob 으로 돌린다 —
     Pages 는 정적 업로드라 마크다운을 렌더링하지 않는다 */
    // 로컬에서 파일로 열었을 때만 상대 경로가 그대로 맞는다. 서빙된 페이지에는
    // 마크다운이 같이 올라가지 않으므로(Pages 는 `docs/visual/` 만 올린다) 치환이 필수다.
    if (location.protocol !== 'file:') {
      var BLOB = 'https://github.com/chane81/mfa-nextjs/blob/main/docs/';
      document.querySelectorAll('a[href$=".md"]').forEach(function (a) {
        var href = a.getAttribute('href');
        // HTML 은 `docs/visual/` 에 있고 문서는 그 위에 있다 — `../` 를 벗겨 blob 으로 보낸다
        if (href.slice(0, 3) !== '../') return;
        a.href = BLOB + href.slice(3);
        a.target = '_blank';
        a.rel = 'noopener';
      });
    }

    /* 시작 */
    selectScenario(0);
    if (!REDUCED) setTimeout(play, 700);
  }

  global.Cinema = { mount: mount };
})(window);
