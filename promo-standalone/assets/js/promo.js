/* ═══════════════════════════════════════════════
   大魔女图书馆 · 独立宣传动画页逻辑
   promo-standalone/assets/js/promo.js
   依赖: GSAP + window.PROMO_DATA（demo-data.js）
   ═══════════════════════════════════════════════ */
(function (w, d) {
  'use strict';

  if (!w.gsap || !w.PROMO_DATA) return;

  if (w.ScrollTrigger) gsap.registerPlugin(w.ScrollTrigger);
  if (w.CustomEase) gsap.registerPlugin(w.CustomEase);
  if (w.SplitText) gsap.registerPlugin(w.SplitText);
  if (w.DrawSVGPlugin) gsap.registerPlugin(w.DrawSVGPlugin);

  var DATA = w.PROMO_DATA;
  var REDUCE = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DURATION = 40;

  var $ = function (sel) { return d.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(d.querySelectorAll(sel)); };

  var loading = $('#loading');
  var stage = $('#stage');
  var progressFill = $('#progress-fill');
  var sceneLabel = $('#scene-label');
  var cursor = $('#cursor');
  var btnPlay = $('#btn-play');
  var btnRestart = $('#btn-restart');
  var btnSkip = $('#btn-skip');

  var scenes = {
    open: $('#sc-open'),
    assets: $('#sc-assets'),
    workshop: $('#sc-workshop'),
    extend: $('#sc-extend'),
    graph: $('#sc-graph'),
    end: $('#sc-end')
  };

  /* ═══════ 立绘工坊合成 ═══════ */
  var wsCanvas = $('#ws-canvas');
  var wsCtx = wsCanvas ? wsCanvas.getContext('2d') : null;
  var wsNameEl = $('#ws-caption-name');
  var wsPartsEl = $('#ws-caption-parts');
  var charButtons = $$('#ws-chars .ws-char');
  var imageCache = {};
  var currentChar = 'ema';
  var picks = {
    ema: { head: 'HeadBase01', face: 'FacialLineDrawing01', eyes: 'Eyes01_Normal_Open01', mouth: 'Mouth01_Normal_Closed', cheeks: 'Cheeks01_Normal', extras: ['ArmR01', 'ArmL01'] },
    hiro: { head: 'HeadBase01', face: null, eyes: 'Eyes01_Normal_Open', mouth: 'Mouth01_Normal_Closed', cheeks: 'Cheeks01_Normal', extras: ['OptionB_Head01', 'Arms01', 'Blending01'] }
  };
  var partByName = {};
  Object.keys(DATA.portraits || {}).forEach(function (name) {
    partByName[name] = {};
    (DATA.portraits[name].parts || []).forEach(function (p) { partByName[name][p.name] = p; });
  });

  function portraitBase(charName) {
    return 'assets/chara/' + charName + '/';
  }
  function partPath(charName, name) {
    var p = partByName[charName][name];
    return p ? portraitBase(charName) + p.file : '';
  }
  function findPart(charName, prefix) {
    var keys = Object.keys(partByName[charName] || {});
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf(prefix) === 0) return keys[i];
    }
    return null;
  }

  function activeParts(charName) {
    var p = picks[charName];
    var list = [];
    function add(name) {
      if (!name) return;
      var part = partByName[charName][name];
      if (part) list.push(part);
    }
    add('Body');
    add(p.head);
    add(p.face);
    add(p.cheeks);
    add(p.eyes);
    add(p.mouth);
    (p.extras || []).forEach(add);
    return list.sort(function (a, b) { return a.order - b.order; });
  }

  function loadImage(src) {
    return new Promise(function (resolve) {
      if (imageCache[src]) return resolve(imageCache[src]);
      var img = new Image();
      img.onload = function () { imageCache[src] = img; resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function composePortrait(charName) {
    if (!wsCtx || !partByName[charName]) return Promise.resolve();
    var parts = activeParts(charName);
    var jobs = parts.map(function (p) { return loadImage(portraitBase(charName) + p.file); });
    return Promise.all(jobs).then(function () {
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      parts.forEach(function (p) {
        var img = imageCache[portraitBase(charName) + p.file];
        if (!img) return;
        var px = p.pos.x * 100, py = -p.pos.y * 100;
        var pivotX = (p.pivot && p.pivot[0] != null) ? p.pivot[0] : 0.5;
        var pivotY = (p.pivot && p.pivot[1] != null) ? p.pivot[1] : 0.5;
        var left = px - pivotX * img.width, top = py - pivotY * img.height;
        minX = Math.min(minX, left); maxX = Math.max(maxX, left + img.width);
        minY = Math.min(minY, top); maxY = Math.max(maxY, top + img.height);
      });
      if (!isFinite(minX)) return;
      var PAD = 140;
      var cw = Math.ceil(maxX - minX) + PAD * 2;
      var ch = Math.ceil(maxY - minY) + PAD * 2;
      wsCanvas.width = Math.max(400, cw);
      wsCanvas.height = Math.max(680, ch);
      wsCtx.clearRect(0, 0, wsCanvas.width, wsCanvas.height);
      var ox = PAD - minX, oy = PAD - minY;
      parts.forEach(function (p) {
        var img = imageCache[portraitBase(charName) + p.file];
        if (!img) return;
        var px = p.pos.x * 100 + ox, py = -p.pos.y * 100 + oy;
        var pivotX = (p.pivot && p.pivot[0] != null) ? p.pivot[0] : 0.5;
        var pivotY = (p.pivot && p.pivot[1] != null) ? p.pivot[1] : 0.5;
        var alpha = (p.color && p.color[3] != null) ? p.color[3] : 1;
        wsCtx.globalAlpha = alpha;
        wsCtx.drawImage(img, px - pivotX * img.width, py - pivotY * img.height, img.width, img.height);
      });
      wsCtx.globalAlpha = 1;
      var labels = [picks[charName].eyes, picks[charName].mouth, picks[charName].head];
      if (wsPartsEl) wsPartsEl.textContent = labels.join(' / ');
      if (wsNameEl) wsNameEl.textContent = charName === 'ema' ? '艾玛 · Ema' : '希罗 · Hiro';
    });
  }

  function selectChar(charName) {
    currentChar = charName;
    charButtons.forEach(function (b) {
      b.classList.toggle('active', b.dataset.char === charName);
    });
    return composePortrait(charName);
  }

  function resolvePart(charName, field, value) {
    var head = picks[charName].head || 'HeadBase01';
    var series = head.indexOf('02') >= 0 ? '02' : '01';
    var table = {
      ema: {
        head: { '01': 'HeadBase01', '02': 'HeadBase02' },
        eyes: { '01': { normal: 'Eyes01_Normal_Open01', angry: 'Eyes01_Angry_Open01' }, '02': { normal: 'Eyes02_Normal_Lifeless', angry: 'Eyes02_Determined_Open' } },
        mouth: { '01': { closed: 'Mouth01_Normal_Closed', open: 'Mouth01_Normal_Open', surprised: 'Mouth01_Surprised_Open' }, '02': { closed: 'Mouth02_Neutral_Closed', open: 'Mouth02_Surprised_Open', surprised: 'Mouth02_Surprised_Open' } },
        cheeks: { '01': { normal: 'Cheeks01_Normal', flushed: 'Cheeks01_Flushed' }, '02': { normal: 'Cheeks02_Normal', flushed: 'Cheeks02_Flushed' } }
      },
      hiro: {
        head: { '01': 'HeadBase01', '02': 'HeadBase02' },
        eyes: { '01': { normal: 'Eyes01_Normal_Open', serious: 'Eyes01_Serious_Open01' }, '02': { normal: 'Eyes02_Normal_Open', serious: 'Eyes02_Serious_Open01' } },
        mouth: { '01': { closed: 'Mouth01_Normal_Closed', open: 'Mouth01_Determined_Open01' }, '02': { closed: 'Mouth02_Normal_Closed', open: 'Mouth02_Determined_Open01' } },
        cheeks: { '01': { normal: 'Cheeks01_Normal', flushed: 'Cheeks01_Flushed' }, '02': { normal: 'Cheeks02_Normal', flushed: 'Cheeks02_Flushed' } }
      }
    };
    var t = table[charName] && table[charName][field];
    if (!t) return value;
    if (field === 'head') return t[value] || value;
    return (t[series] && t[series][value]) || value;
  }

  function setPick(field, value) {
    picks[currentChar][field] = resolvePart(currentChar, field, value);
    $$('#ws-fields [data-field="' + field + '"] .ws-option').forEach(function (o) {
      o.classList.toggle('active', o.dataset.value === value);
    });
    composePortrait(currentChar);
  }

  /* 预加载两个角色的默认 + 演示变体 */
  function preloadPortraits() {
    var files = [];
    var variants = {
      ema: ['Body', 'HeadBase01', 'HeadBase02', 'FacialLineDrawing01', 'FacialLineDrawing02', 'Cheeks01_Normal', 'Cheeks01_Flushed', 'Cheeks02_Normal', 'Cheeks02_Flushed', 'Eyes01_Normal_Open01', 'Eyes01_Angry_Open01', 'Eyes01_Smile_Closed01', 'Eyes02_Normal_Lifeless', 'Mouth01_Normal_Closed', 'Mouth01_Normal_Open', 'Mouth01_Surprised_Open', 'ArmR01', 'ArmL01'],
      hiro: ['Body', 'HeadBase01', 'HeadBase02', 'OptionB_Head01', 'Cheeks01_Normal', 'Cheeks01_Flushed', 'Eyes01_Normal_Open', 'Eyes01_Serious_Open01', 'Mouth01_Normal_Closed', 'Mouth01_Determined_Open01', 'Arms01', 'Blending01']
    };
    Object.keys(variants).forEach(function (charName) {
      variants[charName].forEach(function (name) {
        var path = partPath(charName, name);
        if (path) files.push(path);
      });
    });
    return Promise.all(files.map(loadImage));
  }

  /* ═══════ 图谱 ═══════ */
  var graphSvg = $('#graph-svg');
  function buildGraph() {
    if (!graphSvg || !DATA.nodes) return;
    var nodes = DATA.nodes;
    var byAct = {};
    nodes.forEach(function (n) { (byAct[n.act] = byAct[n.act] || []).push(n); });
    var col = { act01: 130, act02: 660 };
    var yStep = 0;
    var pos = {};

    Object.keys(byAct).forEach(function (act) {
      var list = byAct[act];
      var startY = 110;
      yStep = Math.min(78, 430 / Math.max(1, list.length));
      list.forEach(function (n, i) {
        pos[n.id] = { x: col[act] + (i % 2) * 46, y: startY + i * yStep };
      });
    });

    var ns = 'http://www.w3.org/2000/svg';
    var edges = [];
    Object.keys(byAct).forEach(function (act) {
      var list = byAct[act];
      for (var i = 0; i < list.length - 1; i++) {
        edges.push({ from: pos[list[i].id], to: pos[list[i + 1].id] });
      }
    });

    edges.forEach(function (e, i) {
      var path = d.createElementNS(ns, 'path');
      var mid = (e.from.y + e.to.y) / 2;
      path.setAttribute('d', 'M ' + e.from.x + ' ' + e.from.y + ' C ' + (e.from.x + 70) + ' ' + mid + ' ' + (e.to.x - 70) + ' ' + mid + ' ' + e.to.x + ' ' + e.to.y);
      path.setAttribute('class', 'g-edge');
      path.setAttribute('pathLength', '1');
      path.setAttribute('stroke-dasharray', '1');
      path.setAttribute('stroke-dashoffset', '1');
      graphSvg.appendChild(path);
    });

    nodes.forEach(function (n, i) {
      var g = d.createElementNS(ns, 'g');
      var p = pos[n.id];
      g.setAttribute('class', 'g-node hit');
      g.setAttribute('transform', 'translate(' + p.x + ',' + p.y + ')');
      g.setAttribute('data-id', n.id);
      g.setAttribute('opacity', '0');
      var circle = d.createElementNS(ns, 'circle');
      circle.setAttribute('r', n.isChoice ? 17 : 13);
      circle.setAttribute('fill', '#14141d');
      circle.setAttribute('stroke', n.act === 'act01' ? '#e36a8f' : '#e05a5a');
      var text = d.createElementNS(ns, 'text');
      text.setAttribute('x', '24');
      text.setAttribute('y', '4');
      text.textContent = (n.title || n.id).slice(0, 16);
      var title = d.createElementNS(ns, 'title');
      title.textContent = n.title || n.id;
      g.appendChild(circle);
      g.appendChild(text);
      g.appendChild(title);
      graphSvg.appendChild(g);
    });

    return { edges: graphSvg.querySelectorAll('.g-edge'), nodes: graphSvg.querySelectorAll('.g-node') };
  }
  var graphEls = buildGraph();

    /* ═══════ macOS 双窗口：证物页 + 画廊页 ═══════ */
  var BG_SLIDES = ['Background_001_001.webp', 'Background_001_002.webp', 'Background_002_001.webp', 'Background_003_001.webp', 'Background_004_001.webp', 'Background_005_001.webp'];
  function buildWindows() {
    var evContent = $('#mac-evidence-content');
    var gaContent = $('#mac-gallery-content');
    var items = (DATA.evidence && DATA.evidence.items) || [];
    if (evContent) {
      evContent.innerHTML = '<div class="scroll-track" id="ev-track">' +
        items.slice(0, 12).map(function (e) {
          return '<div class="evidence-row"><img src="assets/img/windows/' + e.sprite + '" alt=""><div class="er-text"><b>' + e.nameZh + '</b><small>' + e.id + ' · 关联剧情节点</small></div></div>';
        }).join('') + '</div>';
    }
    if (gaContent) {
      gaContent.innerHTML = '<div class="scroll-track gallery-grid" id="ga-track">' +
        BG_SLIDES.map(function (f) {
          return '<figure><img src="assets/img/windows/' + f + '" alt=""><figcaption>' + f.replace('.webp', '') + '</figcaption></figure>';
        }).join('') + '</div>';
    }
    var evTrack = $('#ev-track');
    var gaTrack = $('#ga-track');
    var out = {
      evTrack: evTrack, gaTrack: gaTrack,
      evThumb: $('#evidence-scrollbar'), gaThumb: $('#gallery-scrollbar'),
      evRows: evTrack ? evTrack.querySelectorAll('.evidence-row') : [],
      gaTiles: gaTrack ? gaTrack.querySelectorAll('figure') : []
    };
    if (out.evRows.length) {
      Array.prototype.forEach.call(out.evRows, function (row) {
        var img = row.querySelector('img');
        if (img) img.onerror = function () { this.style.display = 'none'; };
      });
    }
    if (out.gaTiles.length) {
      Array.prototype.forEach.call(out.gaTiles, function (fig) {
        var img = fig.querySelector('img');
        if (img) img.onerror = function () { this.style.display = 'none'; };
      });
    }
    return out;
  }
  var macEls = buildWindows();

  function dualScroll(dy, thumbDy, dur, ease) {
    if (macEls.evTrack && macEls.gaTrack) {
      gsap.to([macEls.evTrack, macEls.gaTrack], { y: '+=' + dy, duration: dur, ease: ease || 'power2.out' });
      gsap.to([macEls.evThumb, macEls.gaThumb], { y: '+=' + thumbDy, duration: dur, ease: ease || 'power2.out' });
    }
  }

/* ═══════ 主时间轴 ═══════ */
  var master = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' }, onUpdate: updateProgress });
  var isPlaying = false;

  function setSceneVisible(scene, visible) {
    if (!scene) return;
    scene.style.visibility = visible ? 'visible' : 'hidden';
  }

  function cameraShot(scene, at, o) {
    if (!scene) return;
    o = o || {};
    master.fromTo(scene, {
      x: o.x || 0,
      y: o.y || 0,
      rotationX: o.rotationX || 0,
      rotationY: o.rotationY || 0,
      scale: o.scale || 1,
      transformPerspective: o.perspective || 1000,
      transformOrigin: '50% 55%'
    }, {
      x: o.x2 || 0,
      y: o.y2 || 0,
      rotationX: o.rotationX2 || 0,
      rotationY: o.rotationY2 || 0,
      scale: o.scale2 || 1,
      duration: o.duration || 1.4,
      ease: o.ease || 'power2.out'
    }, at);
    if (o.drift) {
      master.to(scene, {
        x: o.driftX || 0,
        y: o.driftY || 0,
        rotationY: o.driftRY || 0,
        rotationX: o.driftRX || 0,
        scale: o.driftScale || 1,
        duration: o.driftDuration || 3,
        ease: 'sine.inOut'
      }, at + (o.driftAt || o.duration));
    }
  }

  function addScene(sel, start, end, cam) {
    var scene = scenes[sel];
    if (!scene) return;
    gsap.set(scene, { autoAlpha: 0 });
    master.set(scene, { visibility: 'visible', autoAlpha: 0 }, start);
    master.to(scene, { autoAlpha: 1, duration: 0.55, ease: 'power2.out' }, start);
    cameraShot(scene, start, cam);
    if (end != null) {
      master.to(scene, { autoAlpha: 0, duration: 0.5, ease: 'power2.in' }, end - 0.5);
      master.set(scene, { visibility: 'hidden' }, end);
    }
  }

  function buildTimeline() {
      var t;

      /* S1 开场 0–4：静态，不推近 */
      addScene('open', 0, 4);
      var logo = $('.open-logo');
      var titleLines = $$('.open-title .line');
      var sub = $('.open-sub');
      var rule = $('.open-rule');
      gsap.set(logo, { autoAlpha: 0, scale: 1.25 });
      gsap.set(titleLines, { autoAlpha: 0, y: 28 });
      gsap.set(sub, { autoAlpha: 0, letterSpacing: '0.1em' });
      gsap.set(rule, { scaleX: 0 });
      master.to(logo, { autoAlpha: 1, scale: 1, duration: 0.7, ease: 'back.out(1.6)' }, 0.1);
      master.to(titleLines, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.13 }, 0.6);
      master.to(sub, { autoAlpha: 1, letterSpacing: '0.38em', duration: 0.9 }, 1.3);
      master.to(rule, { scaleX: 1, duration: 0.6 }, 1.8);
      moveCursorTo($('.open-logo'), 2.2, 0.4);
      followPointer(scenes.open, $('.asset-card.hot'), 3.1, 0.8);

      /* S2 素材总览 4–8：静态卡片入场 + 转场前镜头指向指针方向 */
      addScene('assets', 4, 8, { rotationY: -1.5, scale: 1.015, duration: 1.0 });
      var head = $('#sc-assets .scene-head');
      var cards = $$('#asset-grid .asset-card');
      gsap.set(head, { autoAlpha: 0, y: 20 });
      gsap.set(cards, { autoAlpha: 0, y: 30 });
      master.to(head, { autoAlpha: 1, y: 0, duration: 0.6 }, 4.1);
      master.to(cards, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.09 }, 4.3);
      moveCursorTo($('.asset-card.hot'), 5.3, 0.35);
      master.to($('.asset-card.hot'), { scale: 1.03, duration: 0.35, yoyo: true, repeat: 1 }, 5.9);
      followPointer(scenes.assets, $('.ws-panel'), 7.1, 0.8);

      /* S3/S4 立绘工坊 8–17：整体提速，镜头跟随左侧操作 */
      addScene('workshop', 8, 17, { rotationY: 2.5, scale: 1.04, x: 24, duration: 0.9 });
      var panel = $('.ws-panel');
      var frame = $('.ws-frame');
      var fields = $$('#ws-fields .ws-field');
      var dl = $('#ws-download');
      gsap.set(panel, { autoAlpha: 0, x: -34 });
      gsap.set(frame, { autoAlpha: 0, scale: 0.94, y: 16 });
      gsap.set(fields, { autoAlpha: 0, y: 12 });
      master.to(panel, { autoAlpha: 1, x: 0, duration: 0.55 }, 8.1);
      master.to(frame, { autoAlpha: 1, scale: 1, y: 0, duration: 0.6 }, 8.25);
      master.to(fields, { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.06 }, 8.5);
      master.fromTo($('.ws-scan'), { autoAlpha: 0 }, { autoAlpha: 0.7, duration: 0.3, repeat: 1, yoyo: true }, 8.7);

      /* 快速操作 + 左侧聚焦（艾玛保持 head 01） */
      t = 9.0; clickOption('eyes', 'angry', t); focusLeftPanel(t, 0.75);
      t = 9.7; clickOption('mouth', 'open', t); focusLeftPanel(t, 0.6);
      t = 10.4; clickOption('cheeks', 'flushed', t); focusLeftPanel(t, 0.6);
      t = 11.1; clickOption('mouth', 'surprised', t); focusLeftPanel(t, 0.6);
      t = 11.8; clickOption('eyes', 'normal', t); focusLeftPanel(t, 0.6);
      t = 12.4; clickOption('cheeks', 'normal', t); focusLeftPanel(t, 0.6);
      t = 13.0; focusNeutral(t, 0.7); moveCursorTo(dl, t, 0.35);
      master.call(function () { dl.classList.add('pressed'); }, null, 13.5);
      master.call(function () { dl.classList.remove('pressed'); flashDownload(); }, null, 13.8);
      master.call(function () { exportPortraitFly(); }, null, 14.0);

      /* 切到希罗，操作继续提速 */
      master.call(function () { selectChar('hiro'); }, null, 14.8);
      moveCursorTo($('.ws-char[data-char="hiro"]'), 14.6, 0.3);
      t = 15.4; clickOption('eyes', 'serious', t); focusLeftPanel(t, 0.6);
      t = 15.9; clickOption('mouth', 'open', t); focusLeftPanel(t, 0.5);
      master.call(function () { $('.ws-frame').classList.add('flash'); }, null, 16.3);
      master.to($('.ws-frame'), { scale: 1.025, duration: 0.3, yoyo: true, repeat: 1 }, 16.3);
      followPointer(scenes.workshop, $('.gallery-win'), 16.3, 0.7);

      /* S5 证物 + 画廊 macOS 双窗口 17–23：两边同时滚动 */
      addScene('extend', 17, 23, { rotationX: 1.5, scale: 0.97, duration: 0.9 });
      var exHead = $('#sc-extend .scene-head');
      var winL = $('.evidence-win');
      var winR = $('.gallery-win');
      gsap.set(exHead, { autoAlpha: 0, y: 18 });
      gsap.set(winL, { autoAlpha: 0, scale: 0.94, y: 20, transformPerspective: 1000 });
      gsap.set(winR, { autoAlpha: 0, scale: 0.94, y: 20, transformPerspective: 1000 });
      gsap.set(macEls.evRows, { autoAlpha: 0, y: 16 });
      gsap.set(macEls.gaTiles, { autoAlpha: 0, y: 16 });
      master.to(exHead, { autoAlpha: 1, y: 0, duration: 0.5 }, 17.1);
      master.to(winL, { autoAlpha: 1, scale: 1, y: 0, duration: 0.6 }, 17.2);
      master.to(winR, { autoAlpha: 1, scale: 1, y: 0, duration: 0.6 }, 17.35);
      master.to(macEls.evRows, { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.04 }, 17.6);
      master.to(macEls.gaTiles, { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.06 }, 17.8);
      moveCursorTo($('.gallery-win'), 18.2, 0.4);
      master.call(function () { dualScroll(-110, 70, 0.7, 'power2.out'); }, null, 18.6);
      master.call(function () { dualScroll(-190, 130, 1.25, 'power2.out'); }, null, 20.0);
      moveCursorTo($('.evidence-win'), 20.3, 0.4);
      followPointer(scenes.extend, $('.search-box'), 22.1, 0.8);

      /* S6 图谱检索 23–36：先输入 → 向下拉开 → 展示命中节点 */
      addScene('graph', 23, 36);
      var gHead = $('#sc-graph .graph-head');
      var gWrap = $('.graph-wrap');
      var searchBox = $('.search-box');
      var searchText = $('#search-text');
      gsap.set(gHead, { autoAlpha: 0, y: 16 });
      gsap.set(gWrap, { autoAlpha: 0 });
      searchText.textContent = '';
      master.to(gHead, { autoAlpha: 1, y: 0, duration: 0.5 }, 23.1);
      master.set(scenes.graph, { transformOrigin: '50% 24%', scale: 1.16, x: 0, y: 0, transformPerspective: 1100 }, 23.1);
      master.call(function () { typeText(searchText, '魔女化', 260); }, null, 23.6);
      moveCursorTo(searchBox, 24.0, 0.5);
      master.to(scenes.graph, { transformOrigin: '50% 58%', scale: 0.99, y: 74, duration: 1.7, ease: 'power2.inOut' }, 25.4);
      master.to(gWrap, { autoAlpha: 1, duration: 0.7 }, 25.9);
      if (graphEls) {
        master.to(graphEls.edges, { strokeDashoffset: 0, duration: 0.7, stagger: 0.08, ease: 'power1.inOut' }, 26.4);
        master.to(graphEls.nodes, { opacity: 1, duration: 0.45, stagger: 0.05 }, 26.6);
        master.fromTo(graphEls.nodes, { scale: 0.94 }, { scale: 1, duration: 0.5, stagger: 0.05 }, 26.6);
        master.call(function () {
          $$('#graph-svg .g-node').forEach(function (n, i) {
            if (i === 3 || i === 7 || i === 11) n.classList.add('pulse');
          });
        }, null, 28.2);
        master.to('#graph-svg', { scale: 1.11, x: -32, y: -10, rotationY: 2, duration: 5.2, ease: 'sine.inOut' }, 29.2);
        master.to(scenes.graph, { x: -20, scale: 1.02, duration: 4.2, ease: 'sine.inOut' }, 29.6);
        master.call(function () {
          $$('#graph-svg .g-node').forEach(function (n) { n.classList.remove('pulse'); });
        }, null, 34.0);
        master.to('#graph-svg', { x: 0, y: 0, scale: 1, rotationY: 0, duration: 1.4, ease: 'power2.inOut' }, 34.2);
      }

      /* S7 结尾 36–40：静态收束 */
      addScene('end', 36, null);
      var endMark = $('.end-mark');
      var endSlogan = $('.end-slogan');
      var endUrl = $('.end-url');
      var endCta = $('#end-cta');
      gsap.set(endMark, { autoAlpha: 0, scale: 1.3 });
      gsap.set(endSlogan, { autoAlpha: 0, y: 24 });
      gsap.set(endUrl, { autoAlpha: 0 });
      gsap.set(endCta, { autoAlpha: 0, y: 14 });
      master.to(endMark, { autoAlpha: 1, scale: 1, duration: 0.7, ease: 'back.out(1.6)' }, 36.2);
      master.to(endSlogan, { autoAlpha: 1, y: 0, duration: 0.8 }, 36.8);
      master.to(endUrl, { autoAlpha: 1, duration: 0.5 }, 37.5);
      master.to(endCta, { autoAlpha: 1, y: 0, duration: 0.5 }, 38.0);

      master.eventCallback('onComplete', function () {
        isPlaying = false;
        btnPlay.textContent = '▶';
      });
    }

/* ═══════ 辅助函数 ═══════ */
      function focusLeftPanel(at, dur) {
      master.call(function () {
        gsap.to(scenes.workshop, { x: -34, scale: 1.06, rotationY: 0, transformOrigin: '32% 50%', duration: dur || 0.6, ease: 'power2.inOut' });
      }, null, at - 0.2);
    }
    function focusNeutral(at, dur) {
      master.call(function () {
        gsap.to(scenes.workshop, { x: 0, scale: 1.0, rotationY: 1, transformOrigin: '50% 50%', duration: dur || 0.6, ease: 'power2.inOut' });
      }, null, at - 0.1);
    }
    function followPointer(scene, targetEl, at, dur) {
      master.call(function () {
        if (!scene || !targetEl) return;
        var r = targetEl.getBoundingClientRect();
        var dx = (r.left + r.width / 2) - window.innerWidth / 2;
        var dy = (r.top + r.height / 2) - window.innerHeight / 2;
        var px = Math.max(-46, Math.min(46, dx * 0.22));
        var py = Math.max(-32, Math.min(32, dy * 0.22));
        gsap.to(scene, { x: '+=' + px, y: '+=' + py, scale: 1.05, duration: dur || 0.8, ease: 'power2.inOut' });
      }, null, at);
    }

function moveCursorTo(el, at, dur) {
    master.call(function () {
      if (!el) return;
      var r = el.getBoundingClientRect();
      gsap.to(cursor, {
        autoAlpha: 1,
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        duration: dur || 0.5,
        ease: 'power2.inOut'
      });
    }, null, at);
    master.to(cursor, { autoAlpha: 1, duration: 0.01 }, at);
  }

  function clickOption(field, value, at) {
    var el = $('#ws-fields [data-field="' + field + '"] .ws-option[data-value="' + value + '"]');
    master.call(function () {
      if (!el) return;
      var r = el.getBoundingClientRect();
      gsap.to(cursor, { autoAlpha: 1, x: r.left + r.width / 2, y: r.top + r.height / 2, duration: 0.4, ease: 'power2.inOut' });
    }, null, at - 0.5);
    master.call(function () {
      if (el) el.classList.add('hit');
    }, null, at);
    master.call(function () {
      setPick(field, value);
      if (el) {
        setTimeout(function () { el.classList.remove('hit'); }, 360);
      }
    }, null, at + 0.18);
  }

  function typeText(el, text, speed) {
    if (!el) return;
    el.textContent = '';
    var i = 0;
    var timer = setInterval(function () {
      el.textContent = text.slice(0, ++i);
      if (i >= text.length) clearInterval(timer);
    }, speed || 260);
  }

  function flashDownload() {
    var dl = $('#ws-download');
    if (!dl) return;
    var rect = dl.getBoundingClientRect();
    var flash = d.createElement('div');
    flash.className = 'download-flash';
    flash.style.cssText = 'position:fixed;left:' + rect.left + 'px;top:' + rect.top + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;border-radius:4px;pointer-events:none;z-index:55;background:rgba(255,255,255,0.14)';
    d.body.appendChild(flash);
    gsap.fromTo(flash, { autoAlpha: 0.8 }, { autoAlpha: 0, duration: 0.55, onComplete: function () { flash.remove(); } });
  }

      function exportPortraitFly() {
      if (!wsCanvas) return;
      var src;
      try { src = wsCanvas.toDataURL('image/png'); } catch (e) { return; }
      var frame = $('.ws-frame');
      var fr = frame.getBoundingClientRect();
      var chip = d.createElement('div');
      chip.className = 'export-chip';
      var img = new Image();
      img.onload = function () {
        img.alt = '导出立绘预览';
        chip.innerHTML = '';
        chip.appendChild(img);
        var text = d.createElement('div');
        text.innerHTML = '<div class="ec-name">' + (currentChar === 'ema' ? '艾玛' : '希罗') + '-portrait.png</div>' +
          '<div class="ec-meta">' + wsCanvas.width + ' × ' + wsCanvas.height + ' · PNG</div>';
        chip.appendChild(text);
        d.body.appendChild(chip);
        var startX = fr.left + fr.width * 0.5;
        var startY = fr.top + fr.height * 0.5;
        var endX = Math.max(24, fr.right - 150);
        var endY = Math.min(window.innerHeight - 110, fr.top + 16);
        chip.style.left = startX + 'px';
        chip.style.top = startY + 'px';
        gsap.fromTo(chip, { autoAlpha: 0, x: 0, y: 0, scale: 0.5, rotation: -4 },
          { autoAlpha: 1, x: endX - startX, y: endY - startY, scale: 1, rotation: 0, duration: 0.8, ease: 'power3.inOut' });
        gsap.to(chip, { autoAlpha: 0, delay: 1.1, duration: 0.5, onComplete: function () { chip.remove(); } });
      };
      img.src = src;
    }

    function updateProgress() {
      var t = Math.min(master.time(), DURATION);
      progressFill.style.transform = 'scaleX(' + (t / DURATION) + ')';
      var label = '序章';
      if (t >= 36) label = 'Slogan';
      else if (t >= 23) label = '图谱检索';
      else if (t >= 17) label = '证物 · 画廊';
      else if (t >= 8) label = '立绘工坊';
      else if (t >= 4) label = '素材总览';
      sceneLabel.textContent = label;
    }

/* ═══════ 控制 ═══════ */
  function play() {
    if (master.progress() >= 1) {
      resetDemoState();
      selectChar('ema');
      master.restart();
    }
    master.play();
    isPlaying = true;
    btnPlay.textContent = '❚❚';
  }
  function pause() {
    master.pause();
    isPlaying = false;
    btnPlay.textContent = '▶';
  }
  function resetDemoState() {
    picks.ema = { head: 'HeadBase01', face: 'FacialLineDrawing01', eyes: 'Eyes01_Normal_Open01', mouth: 'Mouth01_Normal_Closed', cheeks: 'Cheeks01_Normal', extras: ['ArmR01', 'ArmL01'] };
    picks.hiro = { head: 'HeadBase01', face: null, eyes: 'Eyes01_Normal_Open', mouth: 'Mouth01_Normal_Closed', cheeks: 'Cheeks01_Normal', extras: ['OptionB_Head01', 'Arms01', 'Blending01'] };
    $$('#ws-fields .ws-option').forEach(function (o) {
      o.classList.toggle('active', o.dataset.value === 'normal' || o.dataset.value === 'closed' || o.dataset.value === '01');
    });
  }

  btnPlay.addEventListener('click', function () { isPlaying ? pause() : play(); });
  btnRestart.addEventListener('click', function () {
    resetDemoState();
    selectChar('ema');
    master.restart();
    isPlaying = true;
    btnPlay.textContent = '❚❚';
  });
  btnSkip.addEventListener('click', function () { master.progress(1); pause(); });
  d.addEventListener('keydown', function (e) {
    if (e.code === 'Space') { e.preventDefault(); isPlaying ? pause() : play(); }
    if (e.key === 'r' || e.key === 'R') { resetDemoState(); selectChar('ema'); master.restart(); isPlaying = true; btnPlay.textContent = '❚❚'; }
  });

  /* ═══════ 启动 ═══════ */
  function boot() {
    buildTimeline();
    updateProgress();
    if (REDUCE) {
      master.progress(1);
      pause();
      $('#reduced-note').hidden = false;
      scenes.open.style.visibility = 'visible';
      scenes.open.style.opacity = '1';
      if (loading) loading.style.opacity = '0';
      setTimeout(function () { if (loading) loading.style.display = 'none'; }, 600);
      return;
    }
    preloadPortraits()
      .then(function () { return composePortrait('ema'); })
      .catch(function () {})
      .then(function () {
        if (loading) {
          loading.style.opacity = '0';
          setTimeout(function () { if (loading) loading.style.display = 'none'; }, 500);
        }
        play();
      });
  }

  boot();
})(window, document);
