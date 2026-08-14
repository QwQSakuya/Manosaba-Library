/* ═══════════════════════════════════════════════════════════════
   gsap-animations.js — 大魔女图书馆 GSAP 动效引擎 · 「华美的暗黑」重构版
   依赖: assets/lib/ 下 gsap 3.13.0 + ScrollTrigger + EasePack +
         CustomEase + SplitText + DrawSVGPlugin（全部自托管）
   ────────────────────────────────────────────────────────────────
   插件注册: 按需可用性降级（缺哪个都不阻断页面）
   自定义缓动: witchOut（天鹅绒出）/ veilInOut（帷幕开合）
   对外 API 与彩蛋签名保持不变（index/landing.js/app.js 依赖）:
     MS.gsapReady / MS.motion.* /
     MS.logoShakeGSAP(level,logo,landing) / MS.pageCollapseGSAP(landing) /
     MS.animateDetailPanel(open) / MS.nodeClickFeedback(el) /
     initScrollProgress / 页面转场拦截 / initIncomingReveal
   性能: 只动 transform/opacity/clip-path; 禁 width/height/top/left;
         ScrollTrigger 只挂顶层; scrub 与 toggleActions 不混用
   ═══════════════════════════════════════════════════════════════ */
(function (w, d) {
  'use strict';
  if (!w.gsap) return;

  gsap.registerPlugin(ScrollTrigger);
  // 可选插件（存在即注册; 单个缺失不影响其余功能; 按需加载, 不加载未使用插件）
  if (w.CustomEase) gsap.registerPlugin(w.CustomEase);
  if (w.SplitText) gsap.registerPlugin(w.SplitText);
  if (w.DrawSVGPlugin) gsap.registerPlugin(w.DrawSVGPlugin);

  var MS = w.MS || {};
  MS.gsapReady = true;
  MS.plugins = {
    CustomEase: !!(w.CustomEase),
    SplitText: !!(w.SplitText),
    DrawSVGPlugin: !!(w.DrawSVGPlugin)
  };
  w.MS = MS;

  // ═══ 全局默认 ═══
  gsap.defaults({ ease: 'power3.out', duration: 0.7 });

  // ═══ CustomEase 自定义缓动（获奖质感关键）═══
  var WITCH_OUT = 'power3.out', VEIL_INOUT = 'power4.inOut';
  if (w.CustomEase) {
    try {
      WITCH_OUT = CustomEase.create('witchOut', 'M0,0 C0.08,0.02 0.16,0.24 0.28,0.46 C0.4,0.68 0.56,0.86 0.74,0.96 C0.88,1 1,1 1,1');
      VEIL_INOUT = CustomEase.create('veilInOut', 'M0,0 C0.68,0 0.22,0.42 0.24,0.66 C0.26,0.9 0.64,1 1,1');
    } catch (e) { /* 自定义缓动创建失败则回退内置 */ }
  }
  MS.motion = MS.motion || {};
  MS.motion.WITCH_OUT = WITCH_OUT;
  MS.motion.VEIL_INOUT = VEIL_INOUT;

  // ═══ MS.motion 工具集 ═══
  /* splitWords(el, mode): SplitText 插件优先（自带 overflow:clip 遮罩）,
     插件缺失时回退自研分词器; 文本内容不变 */
  MS.motion.splitWords = function (el, mode) {
    if (!el || el._msSplit) return el.querySelectorAll('.mw-in, .char, .word') || [];
    var text = el.textContent || '';
    if (text.length <= 1) { el._msSplit = true; return []; }
    el._msSplit = true;

    if (w.SplitText) {
      try {
        var st = new SplitText(el, {
          type: mode === 'char' ? 'chars' : 'words',
          mask: mode === 'char' ? 'chars' : 'words'
        });
        return mode === 'char' ? st.chars : st.words;
      } catch (e) { /* 插件异常则走自研兜底 */ }
    }

    var units;
    if (mode === 'char') {
      units = Array.prototype.map.call(text, function (ch) { return ch; });
    } else {
      units = text.split(/(\s+)/).filter(function (s) { return s.length > 0; });
    }
    if (units.length <= 1) return [];
    el.setAttribute('aria-label', text);
    var wrap = d.createElement('span');
    wrap.className = 'mw-wrap';
    wrap.setAttribute('aria-hidden', 'true');
    units.forEach(function (u) {
      var mw = d.createElement('span');
      mw.className = 'mw';
      var inner = d.createElement('span');
      inner.className = 'mw-in';
      inner.textContent = u;
      mw.appendChild(inner);
      wrap.appendChild(mw);
    });
    el.textContent = '';
    el.appendChild(wrap);
    return el.querySelectorAll('.mw-in');
  };

  /* countUp(el, to, dur): 数字滚动, 终值=原文数字 */
  MS.motion.countUp = function (el, to, dur) {
    if (!el || isNaN(to)) return null;
    var obj = { v: 0 };
    return gsap.to(obj, {
      v: to, duration: dur || 1.2, ease: 'power2.out',
      onUpdate: function () { el.textContent = Math.round(obj.v); },
      onComplete: function () { el.textContent = String(to); }
    });
  };

  /* batchReveal(targets, opts): ScrollTrigger.batch 统一入场 */
  MS.motion.batchReveal = function (targets, opts) {
    opts = opts || {};
    var els = gsap.utils.toArray(targets);
    if (!els.length) return;
    // 动画期间禁用 CSS transform 过渡, 避免与 GSAP 逐帧互踩
    els.forEach(function (el) { el.style.transition = 'none'; });
    ScrollTrigger.batch(els, {
      start: opts.start || 'top 85%',
      once: true,
      onEnter: function (batch) {
        gsap.to(batch, {
          autoAlpha: 1, y: 0,
          duration: opts.duration || 0.7,
          ease: opts.ease || WITCH_OUT,
          stagger: opts.stagger != null ? opts.stagger : 0.1,
          overwrite: true,
          onComplete: function () {
            batch.forEach(function (el) { el.style.transition = ''; });
            gsap.set(batch, { clearProps: 'transform' }); // 恢复 CSS hover 变换
          }
        });
      }
    });
    gsap.set(els, { autoAlpha: 0, y: opts.y != null ? opts.y : 40 });
  };

  // ═══ matchMedia 守卫（图谱/内容页; 落地页动效由 landing.js 接管）═══
  var mm = gsap.matchMedia();

  mm.add({
    isFull: '(min-width: 1025px) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    isSimple: '(max-width: 1024px) and (prefers-reduced-motion: no-preference)',
    reduceMotion: '(prefers-reduced-motion: reduce)'
  }, function (ctx) {
    var pt = detectPageType();

    if (ctx.conditions.reduceMotion) {
      gsap.set(
        '.c-header,.gothic-frame',
        { autoAlpha: 1, y: 0, x: 0, scale: 1, rotation: 0, clearProps: 'transform,opacity' }
      );
      return;
    }

    if (pt === 'graph') initGraph();

    initPageTransition();
    initIncomingReveal();
    if (pt === 'content' && ctx.conditions.isFull) initCard3DHover();
    if (pt !== 'graph') initScrollProgress();
    bindRefreshHooks();
  });

  // ═══ 页面类型检测 ═══
  function detectPageType() {
    var path = location.pathname.split('/').pop();
    if (path === '' || path === 'index.html') return 'landing';
    if (path.indexOf('act0') === 0) return 'graph';
    return 'content';
  }

  // ═══ 字体/图片就绪后刷新 ═══
  function bindRefreshHooks() {
    if (d.fonts && d.fonts.ready) {
      d.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    }
    var imgs = d.querySelectorAll('.logo, .bk-art img');
    for (var i = 0; i < imgs.length; i++) {
      (function (img) {
        if (!img.complete) img.addEventListener('load', function () { ScrollTrigger.refresh(); });
      })(imgs[i]);
    }
  }

  // ═══ 卡片 3D tilt（内容页, 完整档）═══
  function initCard3DHover() {
    gsap.utils.toArray('.frame-card, .item-card').forEach(function (card) {
      var qRY = gsap.quickTo(card, 'rotationY', { duration: 0.5, ease: 'power2.out' });
      var qRX = gsap.quickTo(card, 'rotationX', { duration: 0.5, ease: 'power2.out' });
      var qY = gsap.quickTo(card, 'y', { duration: 0.45, ease: 'power2.out' });
      card.addEventListener('mouseenter', function () {
        card.style.transition = 'none';
        qY(-8);
      });
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        var dx = (e.clientX - r.left - r.width / 2) / (r.width / 2);
        var dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
        qRY(dx * 6);
        qRX(-dy * 6);
      });
      card.addEventListener('mouseleave', function () {
        qRY(0); qRX(0); qY(0);
        setTimeout(function () { card.style.transition = ''; }, 520);
      });
    });
  }

  // ═══ 右侧滚动进度条（行为不变, 视觉由 CSS）═══
  function initScrollProgress() {
    if (detectPageType() === 'graph') return;
    if (d.querySelector('.ak-stage')) return;
    if (d.querySelector('.scroll-progress')) return;
    d.body.style.overflow = 'auto';

    var bar = d.createElement('div');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML =
      '<div class="sp-track"></div>' +
      '<div class="sp-fill"></div>' +
      '<div class="sp-thumb"></div>' +
      '<div class="sp-pct">0%</div>';
    d.body.appendChild(bar);

    var fill = bar.querySelector('.sp-fill');
    var thumb = bar.querySelector('.sp-thumb');
    var pct = bar.querySelector('.sp-pct');

    function maxScroll() {
      return (d.documentElement.scrollHeight - window.innerHeight) || 1;
    }
    function update() {
      var p = Math.min(1, Math.max(0, window.scrollY / maxScroll()));
      fill.style.transform = 'translateX(-50%) scaleY(' + p + ')';
      thumb.style.top = (p * 100) + '%';
      pct.style.top = (p * 100) + '%';
      pct.textContent = Math.round(p * 100) + '%';
    }
    function seekTo(clientY) {
      var rect = bar.getBoundingClientRect();
      var p = (clientY - rect.top) / rect.height;
      p = Math.min(1, Math.max(0, p));
      window.scrollTo({ top: p * maxScroll(), behavior: 'smooth' });
    }
    var dragging = false;
    bar.addEventListener('mousedown', function (e) {
      dragging = true;
      bar.classList.add('sp-dragging');
      seekTo(e.clientY);
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (dragging) seekTo(e.clientY);
    });
    window.addEventListener('mouseup', function () {
      if (dragging) { dragging = false; bar.classList.remove('sp-dragging'); }
    });
    bar.addEventListener('touchstart', function (e) {
      dragging = true;
      bar.classList.add('sp-dragging');
      seekTo(e.touches[0].clientY);
      e.preventDefault();
    }, { passive: false });
    bar.addEventListener('touchmove', function (e) {
      if (dragging && e.touches[0]) seekTo(e.touches[0].clientY);
    }, { passive: false });
    bar.addEventListener('touchend', function () {
      dragging = false;
      bar.classList.remove('sp-dragging');
    });

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  // ═══ 页面转场（帷幕落下）═══
  function initPageTransition() {
    d.addEventListener('click', function (e) {
      var goEl = e.target.closest('[data-go]');
      var link = e.target.closest('a[href]');
      if (goEl && !goEl.classList.contains('logo')) {
        e.preventDefault();
        e.stopPropagation();
        runPageTransition(goEl.dataset.go + '.html');
        return;
      }
      if (link) {
        var href = link.getAttribute('href');
        if (!href || href.indexOf('.html') === -1) return;
        if (link.target === '_blank' || e.metaKey || e.ctrlKey) return;
        if (href.indexOf('http') === 0 && href.indexOf(location.origin) !== 0) return;
        e.preventDefault();
        runPageTransition(href);
      }
    });
  }

  function runPageTransition(url) {
    var ov = d.createElement('div');
    ov.className = 'page-transition';
    ov.innerHTML =
      '<div class="pt-veil"></div>' +
      '<svg class="pt-sigil" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
        '<g fill="none" stroke="currentColor" stroke-width="1.5">' +
          '<circle cx="50" cy="50" r="40"/>' +
          '<polygon points="50,15 82,72 18,72"/>' +
          '<polygon points="50,85 18,28 82,28"/>' +
        '</g>' +
      '</svg>';
    d.body.appendChild(ov);

    var veil = ov.querySelector('.pt-veil');
    var sigil = ov.querySelector('.pt-sigil');

    gsap.timeline({
      onComplete: function () {
        sessionStorage.setItem('pt-incoming', '1');
        location.href = url;
      }
    })
    .set(ov, { pointerEvents: 'auto' })
    .fromTo(veil,
      { clipPath: 'inset(0 0 100% 0)' },
      { clipPath: 'inset(0 0 0% 0)', duration: 0.5, ease: VEIL_INOUT }
    )
    .fromTo(sigil,
      { autoAlpha: 0, scale: 0.5, rotation: -180 },
      { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(1.7)' },
      '-=0.2'
    )
    .to({}, { duration: 0.3 })
    .to(sigil, { autoAlpha: 0, scale: 1.3, duration: 0.3, ease: 'power3.out' });
  }

  function initIncomingReveal() {
    if (sessionStorage.getItem('pt-incoming') !== '1') return;
    sessionStorage.removeItem('pt-incoming');
    var veil = d.createElement('div');
    veil.className = 'pt-reveal';
    d.body.appendChild(veil);
    gsap.fromTo(veil,
      { clipPath: 'inset(0 0 0% 0)' },
      {
        clipPath: 'inset(100% 0 0% 0)',
        duration: 0.5,
        ease: VEIL_INOUT,
        onComplete: function () { veil.remove(); }
      }
    );
  }

  // ═══════════════════════════════════════════════════
  //  图谱页（act01/act02）编排 — 引擎约束不变
  //════════════════════════════════════════════════════
  function initGraph() {
    MS.animateDetailPanel = function (open) {
      var p = d.getElementById('detail-panel');
      var o = d.getElementById('detail-overlay');
      if (!p) return;
      p.style.transition = 'none';
      o.style.transition = 'none';
      if (open) {
        gsap.set(p, { x: '100%' });
        gsap.to(p, { x: '0%', duration: 0.42, ease: 'power3.out' });
        gsap.to(o, {
          autoAlpha: 1, duration: 0.35, ease: 'power3.out',
          onStart: function () { o.style.pointerEvents = 'auto'; }
        });
      } else {
        gsap.to(p, { x: '100%', duration: 0.38, ease: 'power4.inOut' });
        gsap.to(o, {
          autoAlpha: 0, duration: 0.3, ease: 'power4.inOut',
          onComplete: function () { o.style.pointerEvents = 'none'; }
        });
      }
    };

    MS.nodeClickFeedback = function (el) {
      var oldTransition = el.style.transition;
      el.style.transition = 'none';
      gsap.fromTo(el,
        { scale: 0.92 },
        {
          scale: 1, duration: 0.5, ease: 'back.out(1.7)',
          onComplete: function () {
            el.style.transition = oldTransition;
            gsap.set(el, { clearProps: 'scale' });
          }
        }
      );
    };

    var canvasEl = d.getElementById('canvas');
    var splash = d.getElementById('splash');
    if (canvasEl) gsap.set(canvasEl, { autoAlpha: 0 });

    function playIn() {
      if (!canvasEl) return;
      var tl = gsap.timeline();
      tl.fromTo(canvasEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.9, ease: WITCH_OUT })
        .fromTo('header', { y: -24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: 'power3.out' }, '-=0.55')
        .fromTo('#quick-zoom, #zoom-indicator', { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.08 }, '-=0.35');
    }

    if (splash) {
      if (splash.classList.contains('hide')) {
        playIn();
      } else if (w.MutationObserver) {
        var mo = new MutationObserver(function () {
          if (splash.classList.contains('hide')) {
            mo.disconnect();
            playIn();
          }
        });
        mo.observe(splash, { attributes: true, attributeFilter: ['class'] });
      } else {
        playIn();
      }
    } else {
      playIn();
    }
  }

  // ═══════════════════════════════════════════════════
  //  彩蛋 — Logo 震动（签名不变）
  //════════════════════════════════════════════════════
  MS.logoShakeGSAP = function (level, logoEl, landingEl) {
    var configs = [
      { rot: 3, x: 2, scale: 1.0, dur: 0.4 },
      { rot: 8, x: 5, scale: 1.05, dur: 0.6 },
      { rot: 14, x: 8, scale: 1.1, dur: 0.8 },
      { rot: 18, x: 12, scale: 1.15, dur: 1.0 }
    ];
    var cfg = configs[level - 1] || configs[0];

    var tl = gsap.timeline();
    tl.to(logoEl, { rotation: -cfg.rot, x: -cfg.x, scale: cfg.scale, duration: cfg.dur * 0.15, ease: 'power2.in' })
      .to(logoEl, { rotation: cfg.rot, x: cfg.x, duration: cfg.dur * 0.2, ease: 'power2.inOut' })
      .to(logoEl, { rotation: -cfg.rot * 0.7, x: -cfg.x * 0.7, duration: cfg.dur * 0.2, ease: 'power2.inOut' })
      .to(logoEl, { rotation: cfg.rot * 0.4, x: cfg.x * 0.3, duration: cfg.dur * 0.2, ease: 'power2.out' })
      .to(logoEl, { rotation: 0, x: 0, scale: 1, duration: cfg.dur * 0.25, ease: 'elastic.out(1, 0.5)' });

    if (level >= 3 && landingEl) {
      var mag = level === 3 ? 8 : 16;
      var shakeDur = level === 3 ? 0.05 : 0.03;
      var shakes = level === 3 ? 12 : 14;
      var rotMag = level === 3 ? 2 : 3;
      var tlShake = gsap.timeline();
      for (var i = 0; i < shakes; i++) {
        tlShake.to(landingEl, {
          x: gsap.utils.random(-mag, mag),
          y: gsap.utils.random(-mag, mag),
          rotation: gsap.utils.random(-rotMag, rotMag),
          duration: shakeDur,
          ease: 'none'
        });
      }
      tlShake.to(landingEl, { x: 0, y: 0, rotation: 0, duration: 0.3, ease: 'power3.out' });
      tl.add(tlShake, 0);
    }

    return tl;
  };

  // ═══════════════════════════════════════════════════
  //  彩蛋 — 页面倾倒（中弹坠落, 签名不变）
  //════════════════════════════════════════════════════
  MS.pageCollapseGSAP = function (landingEl) {
    return gsap.timeline({ transformOrigin: 'bottom left' })
      .to(landingEl, { rotation: 3, y: -3, x: 4, skewX: -1.5, duration: 0.1, ease: 'power2.out' })
      .to(landingEl, { rotation: -19, y: 55, x: -28, skewX: 6, filter: 'blur(1.4px)', duration: 0.4, ease: 'power2.in' })
      .to(landingEl, { rotation: -36, y: 175, x: -95, skewX: 11, filter: 'blur(3px)', autoAlpha: 0.62, duration: 0.35, ease: 'power3.in' })
      .to(landingEl, { rotation: -61, y: 560, x: -225, skewX: 18, filter: 'blur(8px)', autoAlpha: 0, duration: 0.45, ease: 'power3.in' });
  };
})(window, document);
