(() => {
  'use strict';

  const M = window.MAP;
  const NS = 'http://www.w3.org/2000/svg';
  const TRAY_H = 280;             // 縦長画面: 地図の下の「ピース置き場」の高さ
  const TRAY_W = 400;             // 横長画面: 地図の右の「ピース置き場」の幅
  const ZOOM_STEPS = [2.5, 4];    // 拡大ボタンで切り替わる倍率(1が全体表示)
  const ZOOM_MAX = 6;             // ピンチで拡大できる上限
  const LOUPE_UNITS = 170;        // ルーペが映す範囲(地図の座標単位)
  const ANCHOR_ID = 13;           // 最初から置いてある基準(東京都)
  const MAX_KM = 500;             // これ以上ズレたら0点
  const REGION_COLORS = ['#5b8def', '#38a89d', '#f0a92b', '#e8743b', '#d9487d', '#8d6bd1', '#6fae3a', '#b8793a'];
  // 点数が高い順に並べる(上から見て、最初に点数が届いた称号になる)
  const RANKS = [
    [98, '伊能忠敬(本人)'], [90, '伊能忠敬の生まれ変わり'], [82, '伊能忠敬の一番弟子'],
    [75, '地図マスター'], [68, 'ナビいらず'], [60, '日本通'],
    [54, '修学旅行は寝てなかった人'], [47, '地理は嫌いじゃない人'], [40, '旅慣れた人'],
    [33, '地図アプリに頼りがちな人'], [25, 'ふわっと日本人'], [18, '県境がバグってる人'],
    [10, 'パラレルジャパン住人'], [5, '地図を逆さに持ってる人'], [0, '異世界の日本'],
  ];


  const $ = (s) => document.querySelector(s);
  const board = $('#board');

  const el = (name, attrs, parent) => {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const world = el('g', { id: 'world' }, board);
  const setPos = (g, tx, ty) => g.setAttribute('transform', `translate(${tx} ${ty})`);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const scoreOf = (km) => 100 * Math.pow(1 - Math.min(1, km / MAX_KM), 1.5);
  const rankOf = (score) => RANKS.find((r) => score >= r[0])[1];
  const fmtKm = (km) => (km < 10 ? Math.round(km) : Math.round(km / 10) * 10);

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // アクセス解析(GoatCounter)に、回数だけを送る。誰が遊んだかは送らない。読み込めなくても何も起きない
  const track = (path, title) => {
    try {
      if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path, title, event: true });
    } catch (_) { /* 解析が使えなくても遊べる */ }
  };

  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* 保存できなくても遊べる */ } },
  };

  function makePiece(p) {
    const g = el('g', {});
    el('path', { d: p.d, class: 'piece r' + p.region }, g);
    return g;
  }

  // ---------- 状態 ----------
  const S = { mode: 10, queue: [], idx: 0, placed: [], cur: null, phase: 'start', anim: 0, score: 0, worst: [] };
  let layers = null;
  let L = { vbw: M.w, vbh: M.h + TRAY_H, cx: M.w / 2, cy: M.h + TRAY_H / 2 }; // 盤面の大きさとピース置き場の中心

  // ---------- 画面切り替え ----------
  function showScreen(name) {
    $('#screen-start').hidden = name !== 'start';
    $('#screen-stage').hidden = name !== 'stage';
    S.phase = name === 'start' ? 'start' : S.phase;
    window.scrollTo(0, 0);
  }

  function renderBest() {
    const b10 = storage.get('nainichizu.best.10');
    const b47 = storage.get('nainichizu.best.47');
    $('#best').textContent = b10 || b47
      ? `自己ベスト  10県: ${b10 ? b10 + '点' : '--'} / 47県: ${b47 ? b47 + '点' : '--'}`
      : '';
  }

  // ---------- スタート画面の「ぐちゃぐちゃ日本」 ----------
  function buildHero() {
    const hero = $('#hero');
    hero.setAttribute('viewBox', `-70 -70 ${M.w + 140} ${M.h + 140}`);
    let seed = 7;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (const p of M.prefs) {
      const g = makePiece(p);
      setPos(g, (rnd() - 0.5) * 260, (rnd() - 0.5) * 260);
      hero.appendChild(g);
    }
  }

  // ---------- ゲーム盤 ----------
  function buildBoard() {
    world.replaceChildren();
    const gFrame = el('g', {}, world);
    const wide = L.vbw > M.w;
    const tray = wide
      ? { x: M.w, y: 0, width: TRAY_W, height: M.h }
      : { x: 0, y: M.h, width: M.w, height: TRAY_H };
    el('rect', { ...tray, class: 'tray' }, gFrame);
    const t = el('text', { x: tray.x + tray.width / 2, y: tray.y + tray.height - 14, class: 'tray-label' }, gFrame);
    t.textContent = 'ここから動かす';
    el('rect', { x: 1.5, y: 1.5, width: M.w - 3, height: M.h - 3, rx: 14, class: 'frame' }, gFrame);
    layers = {
      ghost: el('g', { class: 'fade' }, world),
      placed: el('g', {}, world),
      miss: el('g', { class: 'fade' }, world),
      cur: el('g', {}, world),
    };
    const anchor = M.prefs.find((p) => p.id === ANCHOR_ID);
    const ag = makePiece(anchor);
    ag.classList.add('anchor');
    layers.placed.appendChild(ag);
    const mark = el('g', { class: 'anchor-mark' }, layers.placed);
    el('circle', { cx: anchor.mx, cy: anchor.my, r: 20 }, mark);
    const label = el('text', { x: anchor.mx, y: anchor.my - 30 }, mark);
    label.textContent = '東京都(基準)';
  }

  function start(mode) {
    cancelAnimationFrame(S.anim);
    S.anim = 0;
    S.mode = mode;
    const rest = shuffle(M.prefs.filter((p) => p.id !== ANCHOR_ID));
    S.queue = mode === 10 ? rest.slice(0, 10) : rest;
    S.idx = 0;
    S.placed = [];
    S.cur = null;
    S.phase = 'play';
    track('start-' + mode, mode + '県チャレンジ開始');
    // 横長の画面(PCなど)では、ピース置き場を地図の右に置いて盤面を大きく使う
    const wide = window.innerWidth / window.innerHeight > 1.25;
    document.body.classList.toggle('wide', wide);
    L = wide
      ? { vbw: M.w + TRAY_W, vbh: M.h, cx: M.w + TRAY_W / 2, cy: M.h / 2 }
      : { vbw: M.w, vbh: M.h + TRAY_H, cx: M.w / 2, cy: M.h + TRAY_H / 2 };
    board.style.setProperty('--aspect', String(L.vbw / L.vbh));
    buildBoard();
    showScreen('stage');
    $('#hud-play').hidden = false;
    $('#hud-result').hidden = true;
    $('#panel-play').hidden = false;
    $('#panel-result').hidden = true;
    nextPiece();
  }

  function nextPiece() {
    if (S.idx >= S.queue.length) return finish();
    const p = S.queue[S.idx];
    const g = makePiece(p);
    g.classList.add('current');
    layers.cur.appendChild(g);
    S.cur = { p, g, tx: L.cx - p.cx, ty: L.cy - p.cy };
    setPos(g, S.cur.tx, S.cur.ty);
    // 次の県は、全体表示から始める
    pointers.clear();
    drag = null;
    pinch = null;
    ignoreUntilAllUp = false;
    zoom = 1;
    cancelAnimationFrame(viewAnim);
    applyView(fullView());
    updateZoomUi();
    $('#hud-name').textContent = p.name;
    $('#hud-progress').textContent = `${S.idx + 1} / ${S.queue.length}`;
  }

  function place() {
    if (S.phase !== 'play' || !S.cur) return;
    const { p, g, tx, ty } = S.cur;
    g.classList.remove('current');
    layers.placed.appendChild(g);
    const km = Math.hypot(tx, ty) * M.kmPerUnit;
    S.placed.push({ p, g, tx, ty, km, score: scoreOf(km) });
    S.cur = null;
    S.idx++;
    nextPiece();
  }

  // ---------- 表示範囲(拡大)とルーペ ----------
  const loupe = $('#loupe');
  const loupeView = $('#loupe-svg');
  const zoomBtn = $('#btn-zoom');
  let drag = null;
  let pinch = null;
  let ignoreUntilAllUp = false; // ピンチのあと、残った1本の指では県を動かさない
  const pointers = new Map();
  let zoom = 1;                 // 1が全体表示
  let view = { x: 0, y: 0, w: 0, h: 0 };
  let viewAnim = 0;
  let loupeCorner = 1;          // 0:左上 1:右上 2:左下 3:右下

  const fullView = () => ({ x: 0, y: 0, w: L.vbw, h: L.vbh });
  const viewAround = (z, cx, cy) => {
    const w = L.vbw / z;
    const h = L.vbh / z;
    return { x: clamp(cx - w / 2, 0, L.vbw - w), y: clamp(cy - h / 2, 0, L.vbh - h), w, h };
  };
  const applyView = (v) => {
    view = v;
    board.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  };
  const curCenter = () => ({ x: S.cur.p.mx + S.cur.tx, y: S.cur.p.my + S.cur.ty });
  const isZoomed = () => zoom > 1.15;

  function tweenView(to) {
    cancelAnimationFrame(viewAnim);
    const from = view;
    const t0 = performance.now();
    const step = (now) => {
      const e = ease(clamp((now - t0) / 180, 0, 1));
      applyView({
        x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e,
        w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e,
      });
      if (e < 1) viewAnim = requestAnimationFrame(step);
    };
    viewAnim = requestAnimationFrame(step);
  }

  // 拡大ボタン: 全体 → 2.5倍 → 4倍 → 全体
  function cycleZoom() {
    if (S.phase !== 'play' || !S.cur) return;
    zoom = !isZoomed() ? ZOOM_STEPS[0] : zoom < ZOOM_STEPS[1] - 0.2 ? ZOOM_STEPS[1] : 1;
    const c = curCenter();
    tweenView(zoom === 1 ? fullView() : viewAround(zoom, c.x, c.y));
    updateZoomUi();
  }

  function updateZoomUi() {
    board.classList.toggle('zoomed', isZoomed());
    zoomBtn.textContent = !isZoomed() ? '拡大' : zoom < ZOOM_STEPS[1] - 0.2 ? 'もっと拡大' : '全体表示';
    updateLoupe();
  }

  // 拡大中にピースが端へ寄ったら、表示範囲もついていく
  function followPiece() {
    if (!isZoomed()) return;
    const c = curCenter();
    const mx = view.w * 0.22;
    const my = view.h * 0.22;
    let { x, y } = view;
    if (c.x < x + mx) x = c.x - mx;
    else if (c.x > x + view.w - mx) x = c.x - view.w + mx;
    if (c.y < y + my) y = c.y - my;
    else if (c.y > y + view.h - my) y = c.y - view.h + my;
    cancelAnimationFrame(viewAnim);
    applyView({ ...view, x: clamp(x, 0, L.vbw - view.w), y: clamp(y, 0, L.vbh - view.h) });
  }

  // 全体表示のとき、動かしている県の周りを拡大して見せる(県と重ならない角に出す)
  function updateLoupe() {
    const ctr = S.cur && S.phase === 'play' ? curCenter() : null;
    const show = !!ctr && !isZoomed() && (!!drag || (ctr.x < M.w && ctr.y < M.h));
    loupe.hidden = !show;
    if (!show) return;
    loupeView.setAttribute('viewBox', `${ctr.x - LOUPE_UNITS / 2} ${ctr.y - LOUPE_UNITS / 2} ${LOUPE_UNITS} ${LOUPE_UNITS}`);
    const m = board.getScreenCTM();
    const wrap = board.parentElement.getBoundingClientRect();
    const br = board.getBoundingClientRect();
    const ox = br.left - wrap.left;
    const oy = br.top - wrap.top;
    const D = loupe.offsetWidth;
    const gap = 8;
    const px = m.a * ctr.x + m.e - wrap.left;
    const py = m.d * ctr.y + m.f - wrap.top;
    const spots = [
      [ox + gap + D / 2, oy + gap + D / 2], [ox + br.width - gap - D / 2, oy + gap + D / 2],
      [ox + gap + D / 2, oy + br.height - gap - D / 2], [ox + br.width - gap - D / 2, oy + br.height - gap - D / 2],
    ];
    const dist = (i) => Math.hypot(spots[i][0] - px, spots[i][1] - py);
    if (dist(loupeCorner) < D * 0.85) loupeCorner = [0, 1, 2, 3].reduce((a, b) => (dist(b) > dist(a) ? b : a));
    loupe.style.transform = `translate(${spots[loupeCorner][0] - D / 2}px, ${spots[loupeCorner][1] - D / 2}px)`;
  }

  // ---------- ドラッグ(1本指)とピンチ(2本指) ----------
  const moveCur = (tx, ty) => {
    const c = S.cur;
    c.tx = clamp(tx, -c.p.cx, L.vbw - c.p.cx);
    c.ty = clamp(ty, -c.p.cy, L.vbh - c.p.cy);
    setPos(c.g, c.tx, c.ty);
    followPiece();
    updateLoupe();
  };

  const twoPointers = () => {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  // 2本指の中点の下にある地図の点が、指に付いてくるように表示範囲を決める
  function startPinch() {
    cancelAnimationFrame(viewAnim);
    const t = twoPointers();
    const m = board.getScreenCTM();
    pinch = {
      d0: t.d, z0: zoom, a0: m.a,
      left: m.a * view.x + m.e, top: m.d * view.y + m.f,   // 表示範囲の左上が画面のどこにあるか
      px: (t.mx - m.e) / m.a, py: (t.my - m.f) / m.d,        // 中点の下にある地図の座標
    };
  }

  function updatePinch() {
    const t = twoPointers();
    zoom = clamp(pinch.z0 * (t.d / pinch.d0), 1, ZOOM_MAX);
    const a = pinch.a0 * (zoom / pinch.z0);
    const w = L.vbw / zoom;
    const h = L.vbh / zoom;
    applyView({
      x: clamp(pinch.px - (t.mx - pinch.left) / a, 0, L.vbw - w),
      y: clamp(pinch.py - (t.my - pinch.top) / a, 0, L.vbh - h),
      w, h,
    });
    updateZoomUi();
  }

  board.addEventListener('pointerdown', (e) => {
    if (S.phase !== 'play' || !S.cur) return;
    board.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      drag = null;
      ignoreUntilAllUp = true;
      startPinch();
      updateLoupe();
      return;
    }
    if (ignoreUntilAllUp) return;
    // 画面のピクセルの動きから座標を求める(拡大中に表示範囲が動いてもズレない)
    drag = { x: e.clientX, y: e.clientY, tx: S.cur.tx, ty: S.cur.ty, k: board.getScreenCTM().a };
    updateLoupe();
  });
  board.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) { updatePinch(); return; }
    if (!drag || !S.cur) return;
    moveCur(drag.tx + (e.clientX - drag.x) / drag.k, drag.ty + (e.clientY - drag.y) / drag.k);
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) ignoreUntilAllUp = false;
    drag = null;
    updateLoupe();
  };
  board.addEventListener('pointerup', endPointer);
  board.addEventListener('pointercancel', endPointer);
  zoomBtn.addEventListener('click', cycleZoom);

  document.addEventListener('keydown', (e) => {
    if (S.phase !== 'play' || !S.cur || $('#dlg-share').open) return;
    const step = e.shiftKey ? 24 : 6;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d) { e.preventDefault(); moveCur(S.cur.tx + d[0], S.cur.ty + d[1]); }
    else if (e.key === 'Enter' && document.activeElement === document.body) { e.preventDefault(); place(); }
  });

  // ---------- 結果 ----------
  function finish() {
    S.phase = 'result';
    track('finish-' + S.mode, S.mode + '県チャレンジ完走');
    const sum = S.placed.reduce((s, x) => s + x.score, 0);
    S.score = Math.round(sum / S.placed.length);
    S.worst = S.placed.slice().sort((a, b) => b.km - a.km).slice(0, 3);

    const placedIds = new Set(S.placed.map((x) => x.p.id));
    for (const p of M.prefs) {
      if (p.id === ANCHOR_ID || placedIds.has(p.id)) continue;
      el('path', { d: p.d, class: 'silhouette' }, layers.ghost);
    }
    for (const x of S.placed) el('path', { d: x.p.d, class: 'ghost' }, layers.ghost);
    for (const x of S.worst) {
      if (x.km < 30) continue;
      el('line', { x1: x.p.mx + x.tx, y1: x.p.my + x.ty, x2: x.p.mx, y2: x.p.my, class: 'miss' }, layers.miss);
      el('circle', { cx: x.p.mx, cy: x.p.my, r: 7, class: 'miss-dot' }, layers.miss);
    }

    // 結果画面では、置き場と東京都の目印を隠して地図を大きく見せる
    zoom = 1;
    cancelAnimationFrame(viewAnim);
    applyView(L.vbw > M.w ? fullView() : { x: 0, y: 0, w: M.w, h: M.h });
    loupe.hidden = true;
    world.querySelectorAll('.tray, .tray-label').forEach((n) => { n.style.display = 'none'; });
    layers.placed.querySelector('.anchor-mark').style.display = 'none';

    $('#hud-play').hidden = true;
    $('#hud-result').hidden = false;
    $('#result-mode').textContent = `${S.mode}県チャレンジ`;
    $('#result-rank').textContent = rankOf(S.score);
    $('#panel-play').hidden = true;
    $('#panel-result').hidden = false;
    $('#btn-answer').textContent = '答え合わせ';

    const worstBox = $('#score-worst');
    worstBox.replaceChildren();
    S.worst.forEach((x, i) => {
      const span = document.createElement('span');
      span.textContent = `${i === 0 ? '最大のズレ ' : ''}${x.p.name} ${fmtKm(x.km)}km`;
      worstBox.appendChild(span);
    });

    const key = `nainichizu.best.${S.mode}`;
    const prev = Number(storage.get(key));
    if (!prev || S.score > prev) storage.set(key, String(S.score));

    countUp($('#score-num'), S.score);
  }

  function countUp(node, to) {
    const t0 = performance.now();
    const step = (now) => {
      const k = clamp((now - t0) / 700, 0, 1);
      node.textContent = Math.round(to * ease(k));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function animateAnswer() {
    if (S.phase !== 'result') return;
    cancelAnimationFrame(S.anim);
    for (const x of S.placed) setPos(x.g, x.tx, x.ty);
    layers.miss.style.opacity = 0;
    const DUR = 1100;
    const STAG = Math.min(70, 1500 / S.placed.length);
    const t0 = performance.now();
    $('#btn-answer').textContent = 'もう一度見る';
    const frame = (now) => {
      let done = true;
      S.placed.forEach((x, i) => {
        const k = clamp((now - t0 - i * STAG) / DUR, 0, 1);
        const e = ease(k);
        setPos(x.g, x.tx * (1 - e), x.ty * (1 - e));
        if (k < 1) done = false;
      });
      S.anim = done ? 0 : requestAnimationFrame(frame);
    };
    S.anim = requestAnimationFrame(frame);
  }

  // ---------- シェア画像 ----------
  const gameUrl = () => location.origin + location.pathname;

  function shareText() {
    const w = S.worst[0];
    return `脳内日本地図 ${S.mode}県チャレンジ\n${S.score}点「${rankOf(S.score)}」\n最大のズレは${w.p.name}(${fmtKm(w.km)}km)\nあなたの脳内の日本は?\n#脳内日本地図`;
  }

  function roundRectPath(x, ox, oy, w, h, r) {
    x.beginPath();
    x.moveTo(ox + r, oy);
    x.arcTo(ox + w, oy, ox + w, oy + h, r);
    x.arcTo(ox + w, oy + h, ox, oy + h, r);
    x.arcTo(ox, oy + h, ox, oy, r);
    x.arcTo(ox, oy, ox + w, oy, r);
    x.closePath();
  }

  function renderCard() {
    const W = 1200, H = 630;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",Meiryo,sans-serif';

    x.fillStyle = '#f7f1e3';
    x.fillRect(0, 0, W, H);

    // 地図パネル
    const size = 570, ox = 30, oy = 30, inner = 14;
    roundRectPath(x, ox, oy, size, size, 22);
    x.fillStyle = '#fffdf6';
    x.fill();
    x.lineWidth = 3;
    x.strokeStyle = '#d9d0ba';
    x.stroke();

    x.save();
    roundRectPath(x, ox, oy, size, size, 22);
    x.clip();
    // 配置した県と正解位置が収まる範囲に寄せて、地図をできるだけ大きく見せる
    let bx0 = 0, by0 = 0, bx1 = M.w, by1 = M.h;
    const grow = (p, tx, ty) => {
      bx0 = Math.min(bx0, p.cx + tx - p.bw / 2); bx1 = Math.max(bx1, p.cx + tx + p.bw / 2);
      by0 = Math.min(by0, p.cy + ty - p.bh / 2); by1 = Math.max(by1, p.cy + ty + p.bh / 2);
    };
    for (const q of S.placed) grow(q.p, q.tx, q.ty);
    const room = size - inner * 2 - 20;
    const s = Math.min(room / (bx1 - bx0), room / (by1 - by0));
    const offX = ox + size / 2 - ((bx0 + bx1) / 2) * s;
    const offY = oy + size / 2 - ((by0 + by1) / 2) * s;
    const at = (tx, ty) => x.setTransform(s, 0, 0, s, offX + tx * s, offY + ty * s);
    const anchor = M.prefs.find((p) => p.id === ANCHOR_ID);
    const draw = (p, tx, ty, fill, alpha) => {
      at(tx, ty);
      const path = new Path2D(p.d);
      x.globalAlpha = alpha;
      x.fillStyle = fill;
      x.fill(path, 'evenodd');
      x.globalAlpha = 1;
      x.lineWidth = 2.4;
      x.lineJoin = 'round';
      x.strokeStyle = '#fff';
      x.stroke(path);
    };
    const placedIds = new Set(S.placed.map((q) => q.p.id));
    for (const p of M.prefs) if (p.id !== ANCHOR_ID && !placedIds.has(p.id)) draw(p, 0, 0, '#ebe4d0', 1);
    draw(anchor, 0, 0, '#8b93a5', 1);
    for (const p of S.placed) draw(p.p, p.tx, p.ty, REGION_COLORS[p.p.region], 0.9);
    // 正解の輪郭
    x.setLineDash([7, 6]);
    for (const p of S.placed) {
      at(0, 0);
      x.lineWidth = 2.2;
      x.strokeStyle = 'rgba(29,36,51,.5)';
      x.stroke(new Path2D(p.p.d));
    }
    x.setLineDash([]);
    // 大きくズレた県は、正解の位置まで線を引く
    for (const p of S.worst) {
      if (p.km < 30) continue;
      at(0, 0);
      x.lineWidth = 4 / s * 0.6;
      x.lineCap = 'round';
      x.strokeStyle = '#e8503a';
      x.beginPath();
      x.moveTo(p.p.mx + p.tx, p.p.my + p.ty);
      x.lineTo(p.p.mx, p.p.my);
      x.stroke();
      x.fillStyle = '#e8503a';
      x.beginPath();
      x.arc(p.p.mx, p.p.my, 9 / s * 0.6, 0, Math.PI * 2);
      x.fill();
    }
    x.restore();

    // テキスト
    const X0 = 650;
    x.textBaseline = 'alphabetic';
    x.fillStyle = '#1d2433';
    x.font = `800 60px ${FONT}`;
    x.fillText('脳内日本地図', X0, 112);
    x.fillStyle = '#5d6577';
    x.font = `600 28px ${FONT}`;
    x.fillText(`${S.mode}県チャレンジ`, X0, 156);

    x.fillStyle = '#e8503a';
    x.font = `800 170px ${FONT}`;
    x.fillText(String(S.score), X0, 330);
    const numW = x.measureText(String(S.score)).width;
    x.font = `800 52px ${FONT}`;
    x.fillText('点', X0 + numW + 8, 330);

    x.fillStyle = '#1d2433';
    const rankText = `「${rankOf(S.score)}」`;
    let rankPx = 44;
    x.font = `800 ${rankPx}px ${FONT}`;
    while (x.measureText(rankText).width > W - X0 - 30 && rankPx > 24) x.font = `800 ${--rankPx}px ${FONT}`;
    x.fillText(rankText, X0, 400);

    x.fillStyle = '#5d6577';
    x.font = `600 26px ${FONT}`;
    S.worst.slice(0, 3).forEach((w, i) => {
      x.fillText(`${i === 0 ? '最大のズレ ' : ''}${w.p.name} ${fmtKm(w.km)}km`, X0, 452 + i * 38);
    });

    x.fillStyle = '#1d2433';
    x.font = `700 24px ${FONT}`;
    x.fillText('あなたの脳内の日本は?', X0, 566);
    x.fillStyle = '#5d6577';
    x.font = `500 20px ${FONT}`;
    x.fillText(location.host + location.pathname, X0, 600);
    return c;
  }

  let cardUrl = '';
  let cardFile = null;

  function openShare() {
    track('share-open', 'シェア画面を開いた');
    const c = renderCard();
    c.toBlob((blob) => {
      if (cardUrl) URL.revokeObjectURL(cardUrl);
      cardUrl = URL.createObjectURL(blob);
      cardFile = new File([blob], 'nainichizu.png', { type: 'image/png' });
      $('#share-img').src = cardUrl;
      $('#btn-save').href = cardUrl;
      $('#btn-native').hidden = !(navigator.canShare && navigator.canShare({ files: [cardFile] }));
      $('#dlg-share').showModal();
    }, 'image/png');
  }

  async function nativeShare() {
    track('share-native', '画像つきで共有');
    try {
      await navigator.share({ files: [cardFile], text: shareText() + '\n' + gameUrl() });
    } catch (err) {
      if (err && err.name !== 'AbortError') console.warn(err);
    }
  }

  function shareToX() {
    track('share-x', 'Xに投稿(文章のみ)');
    const u = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText()) + '&url=' + encodeURIComponent(gameUrl());
    window.open(u, '_blank', 'noopener');
  }

  // ---------- イベント ----------
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => start(Number(b.dataset.mode))));
  $('#btn-place').addEventListener('click', place);
  $('#btn-answer').addEventListener('click', animateAnswer);
  $('#btn-share').addEventListener('click', openShare);
  $('#btn-retry').addEventListener('click', () => start(S.mode));
  $('#btn-home').addEventListener('click', () => { cancelAnimationFrame(S.anim); renderBest(); showScreen('start'); });
  $('#btn-native').addEventListener('click', nativeShare);
  $('#btn-x').addEventListener('click', shareToX);
  $('#btn-close').addEventListener('click', () => $('#dlg-share').close());

  buildHero();
  renderBest();

  // 自動テスト用(画面確認で使う)
  window.__game = { S, start, place };
})();
