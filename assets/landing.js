/* ═══════════════════════════════════════════════════════════════
   landing.js — 首页「审判之书」专属脚本
   依赖: shared.js + gsap-animations.js（MS / MS.motion）
   ──────────────────────────────────────────────────────────────
   开幕（帷幕 + SplitText 逐字 + DrawSVG 魔法阵绘制 + CustomEase）
   滚动叙事（3 层视差 + 书卷 pin 翻页 + 档案/站牌 batch）
   彩蛋（logo 射击 / 蝴蝶 / 键盘 / 镜像站 Ping —— 逻辑等价重构）
   玩法契约: 4 连击→渐进震动→枪声→红黑闪帧+血幕→闭眼黑幕→
             页面倾倒→1400ms 跳转 gallery 睁眼（时序不变）
   ═══════════════════════════════════════════════════════════════ */
(function (w, d) {
  'use strict';

  var MS = w.MS || {};
  var gsapOK = !!(w.gsap && MS.gsapReady);
  var WITCH = (MS.motion && MS.motion.WITCH_OUT) || 'power3.out';
  var VEIL = (MS.motion && MS.motion.VEIL_INOUT) || 'power4.inOut';

  // 关掉 lag smoothing: 帧停滞时暂停而非跳进,
  // 杜绝"播放结束后闪现"式追赶跳变
  if (gsapOK) gsap.ticker.lagSmoothing(0);

  // ═══ 主题切换（默认暗色, localStorage 覆盖, 扫光过渡）═══
  initThemeToggle();

  function initThemeToggle() {
    var btn = d.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var html = d.documentElement;
      var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      var veil = d.createElement('div');
      veil.className = 'theme-veil';
      d.body.appendChild(veil);
      if (!gsapOK) {
        html.setAttribute('data-theme', next);
        try { localStorage.setItem('theme', next); } catch (e) {}
        veil.remove();
        return;
      }
      gsap.fromTo(veil,
        { clipPath: 'inset(0 100% 0 0)', autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.22, ease: 'power2.in' }
      );
      gsap.to(veil, {
        clipPath: 'inset(0 0% 0 0)', duration: 0.22, ease: 'power2.inOut', delay: 0.15,
        onComplete: function () {
          html.setAttribute('data-theme', next);
          try { localStorage.setItem('theme', next); } catch (e) {}
          gsap.to(veil, {
            clipPath: 'inset(0 0 0 100%)', autoAlpha: 0, duration: 0.38, ease: 'power2.out', delay: 0.1,
            onComplete: function () { veil.remove(); }
          });
        }
      });
    });
  }

  // 预读 R2 网页素材配置（logo 彩蛋音效等立即可用）
  MS.loadR2Config();

  /* ── 无 JS/动效失败兜底: 强制拉开帷幕, 内容永远可见 ── */
  function forceOpen() {
    d.querySelectorAll('.preloader').forEach(function (c) {
      c.remove();
    });
    d.body.style.overflow = '';
    var hero = d.querySelector('.hero-stage');
    if (hero) hero.style.opacity = '1';
  }
  var forceTimer = setTimeout(forceOpen, 4200);

  /* ═══════════════════════════════════════════════════
     开幕入场序列（timeline 编排, 无 delay 链）
     ═══════════════════════════════════════════════════ */
  function playOpening(reduce) {
    if (reduce) { forceOpen(); return; }

    // 开幕段软 pin: 预加载期间锁定滚动
    d.body.style.overflow = 'hidden';
    var pre = d.querySelector('.preloader');

    var tl = gsap.timeline({ onComplete: function () {
      clearTimeout(forceTimer);
      d.body.style.overflow = '';
    } });

    // ═══ 1) 预加载器: 标记 → 字母序列「Manosaba Library」逐字 + 细线生长 ═══
    //         （无计数数字）; 加载结束黑色荧幕向下收
    if (pre) {
      var mark = pre.querySelector('.pl-mark');
      var fill = pre.querySelector('.pl-fill');
      var lettersEl = pre.querySelector('#pl-letters');

      tl.fromTo(mark, { autoAlpha: 0, scale: 0.5 }, { autoAlpha: 1, scale: 1, duration: 0.6, ease: 'back.out(1.7)' }, 0);

      if (lettersEl) {
        var txt = lettersEl.textContent;
        var h = '';
        for (var i = 0; i < txt.length; i++) {
          var ch = txt.charAt(i);
          h += ch === ' ' ? '<span class="sp">&nbsp;</span>' : '<span>' + ch + '</span>';
        }
        lettersEl.innerHTML = h;
        var spans = lettersEl.querySelectorAll('span');
        tl.fromTo(spans,
          { autoAlpha: 0, y: 14 },
          { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out', stagger: 0.045 }, 0.15);
      }

      if (fill) {
        tl.fromTo(fill, { scaleX: 0 }, { scaleX: 1, duration: 1.5, ease: 'power1.inOut' }, 0.15);
      }

      // 黑色荧幕向下收（揭示自顶部）
      tl.to(pre, {
        yPercent: 100, duration: 0.8, ease: VEIL,
        onComplete: function () { pre.remove(); }
      }, 1.8);
    }

    // ═══ 2) hero 分层入场（预加载器退场同时揭示）═══
    var logo = d.querySelector('.hero-logo');
    if (logo) {
      gsap.set(logo, { autoAlpha: 0, scale: 1.5 });
      tl.to(logo, { autoAlpha: 1, scale: 1, duration: 0.8, ease: 'back.out(1.7)' }, 1.55);
    }

    var title = d.querySelector('.hero-title');
    var sub = d.querySelector('.hero-sub');
    var titleChars = MS.motion ? MS.motion.splitWords(title, 'char') : [];
    var subWords = MS.motion ? MS.motion.splitWords(sub, 'word') : [];
    gsap.set('.hero-title, .hero-sub', { autoAlpha: 1, y: 0 });
    if (titleChars.length) {
      gsap.set(titleChars, { yPercent: 118 });
      tl.to(titleChars, { yPercent: 0, duration: 1.0, ease: WITCH, stagger: 0.055 }, 1.7);
    }
    if (subWords.length) {
      gsap.set(subWords, { yPercent: 118 });
      tl.to(subWords, { yPercent: 0, duration: 0.8, ease: WITCH, stagger: 0.05 }, 2.2);
    }

    var rule = d.querySelector('.hero-rule');
    if (rule) {
      gsap.set(rule, { scaleX: 0 });
      tl.to(rule, { scaleX: 1, duration: 0.7, ease: WITCH }, 2.35);
    }

    var magic = d.querySelector('.bg-layer .magic-circle');
    if (magic && MS.plugins && MS.plugins.DrawSVGPlugin) {
      var paths = magic.querySelectorAll('path, circle, line, polygon');
      tl.fromTo(paths,
        { drawSVG: '0% 0%' },
        { drawSVG: '0% 100%', duration: 2.2, ease: 'none', stagger: 0.03 }, 1.65);
    }

    var heroArt = d.querySelector('.hero-art');
    if (heroArt) {
      tl.fromTo(heroArt,
        { clipPath: 'inset(0 100% 0 0)', autoAlpha: 0 },
        { clipPath: 'inset(0 0% 0 0)', autoAlpha: 1, duration: 1.1, ease: VEIL }, 1.8);
    }
    // 双主角滑入: 艾玛从左入, 希罗从右入（暗色主次; 亮色由 CSS 反转位置）
    var emaFront = d.querySelector('.hero-art .ha-ema');
    var hiroFront = d.querySelector('.hero-art .ha-hiro');
    if (emaFront) tl.fromTo(emaFront, { x: -90 }, { x: 0, duration: 1.0, ease: WITCH }, 2.35);
    if (hiroFront) tl.fromTo(hiroFront, { x: 170 }, { x: 0, duration: 1.0, ease: WITCH }, 2.5);

    var hint = d.querySelector('.hero-scrollhint');
    if (hint) {
      tl.fromTo(hint, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'power3.out' }, 3.0);
    }
  }

  /* ═══════════════════════════════════════════════════
     滚动叙事（完整档: 视差 + 书卷 pin 翻页 + batch）
     ═══════════════════════════════════════════════════ */
  function playScroll() {
    var hero = d.querySelector('.hero-stage');

    // 视差层（配置化: 选择器 → 位移幅度; scrub 容器动画一律 ease:none）
    var layers = [
      { sel: '.bg-gradient', yPercent: 14 },
      { sel: '.bg-blood', yPercent: 8 }
    ];
    layers.forEach(function (layer) {
      gsap.to(layer.sel, {
        yPercent: layer.yPercent, ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 1 }
      });
    });

    // 魔法阵层: 自身带 CSS 无限动画（transform 被接管）, 包一层容器做视差
    var bgHost = d.querySelector('.bg-layer');
    var mc = bgHost && bgHost.querySelector('.magic-circle');
    var mci = bgHost && bgHost.querySelector('.magic-circle-inner');
    if (mc && mci) {
      var wrap = d.createElement('div');
      wrap.className = 'magic-parallax';
      wrap.setAttribute('aria-hidden', 'true');
      wrap.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
      bgHost.insertBefore(wrap, mc);
      wrap.appendChild(mc);
      wrap.appendChild(mci);
      gsap.to(wrap, {
        yPercent: 12, ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 1 }
      });
    }

    // 书卷揭示: 一次性「中缝 → 两侧」蒙版揭开（无 3D、无 pin、无逐层动画）
    var stage = d.querySelector('.book-stage');
    var mask = d.querySelector('.book .book-mask');
    if (stage && mask) {
      var halfL = mask.querySelector('.bm-half.left');
      var halfR = mask.querySelector('.bm-half.right');
      gsap.set(mask, { display: 'block' });
      gsap.set(halfL, { xPercent: 0 });
      gsap.set(halfR, { xPercent: 0 });

      var bookTl = gsap.timeline({
        scrollTrigger: {
          trigger: stage,
          start: 'top 72%',
          once: true,
          toggleActions: 'play none none none' // 只播一次, 不混用 scrub
        }
      });
      bookTl.to(halfL, { xPercent: -101, duration: 1.2, ease: WITCH }, 0)
            .to(halfR, { xPercent: 101, duration: 1.2, ease: WITCH }, 0)
            .set(mask, { autoAlpha: 0 }, 1.25);
    }

    // 档案卡 batch 入场
    MS.motion.batchReveal('.arc-cell', { start: 'top 85%', stagger: 0.09, duration: 0.75 });

    // 站牌行 batch 入场
    MS.motion.batchReveal('.mirror-row', { start: 'top 88%', stagger: 0.08, y: 26, duration: 0.6 });
  }

  /* ═══════════════════════════════════════════════════
     书卷 hover: 魔法阵平滑调速 + 页面微抬（quickTo）
     ═══════════════════════════════════════════════════ */
  function bindBookHover() {
    // 魔法阵平滑调速: rAF 仅在 hover 期间运行（离开后停帧, 零空闲开销）;
    // 速度惯性插值保证待机↔加速自然过渡, 无跳动
    d.querySelectorAll('.bk-half').forEach(function (page) {
      var stamp = page.querySelector('.bk-stamp svg');
      if (!stamp) return;
      var speed = 0.15, rot = 0, last = 0, rafId = 0, hover = false;

      function tick(now) {
        var dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        var target = hover ? 1.1 : 0.15;
        speed += (target - speed) * 0.08;
        rot += speed * dt;
        stamp.style.transform = 'rotate(' + (rot * 180 / Math.PI) + 'deg)';
        if (!hover && Math.abs(speed - 0.15) < 0.002) {
          rafId = 0; // 惯性归零后停帧
          return;
        }
        rafId = requestAnimationFrame(tick);
      }
      function start() {
        if (!rafId) {
          last = performance.now();
          rafId = requestAnimationFrame(tick);
        }
      }
      page.addEventListener('mouseenter', function () { hover = true; start(); });
      page.addEventListener('mouseleave', function () { hover = false; });
    });
  }

  // ═══ matchMedia 分档（完整档才有视差与 pin）═══
  if (gsapOK) {
    var mm = gsap.matchMedia();
    mm.add({
      isFull: '(min-width: 1025px) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
      isSimple: '(max-width: 1024px) and (prefers-reduced-motion: no-preference)',
      reduceMotion: '(prefers-reduced-motion: reduce)'
    }, function (ctx) {
      if (ctx.conditions.reduceMotion) {
        playOpening(true);
        return;
      }
      playOpening(false);
      bindBookHover();
      if (ctx.conditions.isFull) playScroll();
      else {
        // 简化档: 仅 batch 淡入（书卷/档案直接可见）
        MS.motion.batchReveal('.arc-cell', { start: 'top 90%', stagger: 0.08 });
        MS.motion.batchReveal('.mirror-row', { start: 'top 92%', stagger: 0.06 });
      }
    });
  } else {
    forceOpen();
    bindBookHover();
  }

  /* ═══════════════════════════════════════════════════
     Logo 射击彩蛋 —— 玩法逻辑等价重构 + A 方案处刑视觉
     4 连击→渐进震动→枪声→红黑闪帧+血幕→闭眼黑幕→
     页面倾倒→1400ms 跳转画廊睁眼
     ═══════════════════════════════════════════════════ */
  (function () {
    var logo = d.querySelector('.hero-logo');
    if (!logo) return;
    var count = 0;
    var audioCache = {};

    function playSfx(file) {
      var url = MS.webBase ? MS.webUrl('assets/audio/' + file) : 'assets/audio/' + file;
      if (!audioCache[file]) {
        audioCache[file] = new Audio(url);
        audioCache[file].preload = 'auto';
      }
      var a = audioCache[file];
      try { a.currentTime = 0; } catch (e) {}
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    }

    function shake(level) {
      if (gsapOK && MS.logoShakeGSAP) {
        MS.logoShakeGSAP(level, logo, d.querySelector('.hero-stage'));
        return;
      }
      // 无 GSAP 兜底: CSS keyframes（视觉等价, 行为不变）
      logo.classList.remove('shake-1', 'shake-2', 'shake-3', 'shake-4');
      void logo.offsetWidth; // 强制 reflow 重启动画
      logo.classList.add('shake-' + level);
      var stage = d.querySelector('.hero-stage');
      if (stage && level >= 3) {
        stage.classList.remove('page-shake-3', 'page-shake-4');
        void stage.offsetWidth;
        stage.classList.add('page-shake-' + level);
      }
    }

    function hitFlash() {
      var f = d.querySelector('.hit-flash');
      if (!f) {
        f = d.createElement('div');
        f.className = 'hit-flash';
        d.body.appendChild(f);
      }
      if (gsapOK) {
        gsap.timeline()
          .set(f, { autoAlpha: 0.9 })
          .to(f, { autoAlpha: 0, duration: 0.5, ease: 'power2.out' });
      }
    }

    function bleed() {
      var v = d.querySelector('.blood-veil');
      if (!v) {
        v = d.createElement('div');
        v.className = 'blood-veil';
        d.body.appendChild(v);
      }
      if (gsapOK) {
        gsap.to(v, { autoAlpha: 0.92, duration: 0.55, ease: 'power2.in' });
      }
    }

    // 前 3 级: 数据驱动（音效 + 渐进震动）; 第 4 级: 处刑特殊流程
    var CLICKS = [
      { sfx: 'sfx/Common/Sfx_Common_001 Notice1.ogg' },
      { sfx: 'sfx/Common/Sfx_Common_001 Notice1.ogg' },
      { sfx: 'sfx/Common/Sfx_Common_001 Notice1.ogg' }
    ];

    logo.addEventListener('click', function () {
      count++;
      if (count >= 1 && count <= 3) {
        playSfx(CLICKS[count - 1].sfx);
        shake(count);
      } else if (count === 4) {
        shake(4);
        playSfx('sfx/Scenario/Sfx_Scenario_038 Gun fire.ogg');
        count = -999; // 重置计数, 避免重复触发

        hitFlash();  // A 方案: 红黑闪帧
        bleed();     // A 方案: 血幕渗入

        // 0.45s: 闭眼黑幕 + 页面倾倒（坠落透过收窄眼缝可见）
        setTimeout(function () {
          var lidTop = d.createElement('div');
          lidTop.className = 'eye-lid top closing';
          var lidBot = d.createElement('div');
          lidBot.className = 'eye-lid bottom closing';
          d.body.appendChild(lidTop);
          d.body.appendChild(lidBot);
          d.body.classList.add('shot');
          if (gsapOK && MS.pageCollapseGSAP) {
            MS.pageCollapseGSAP(d.querySelector('.hero-stage'));
          } else {
            // 无 GSAP 兜底: CSS 倾倒（视觉等价）
            d.querySelector('.hero-stage').classList.add('collapsing');
          }
        }, 450);

        // 1.4s: 黑幕完全合拢后跳转画廊（睁眼）
        setTimeout(function () {
          location.href = 'gallery.html?open=Still_330_001&wakeup=1';
        }, 1400);
      }
    });
  })();

  /* ═══════════════════════════════════════════════════
     蝴蝶彩蛋: 点击变亮 + 语音 + kiang toast + 屏保弹跳
     ═══════════════════════════════════════════════════ */
  (function () {
    var eggFly = d.querySelector('.egg-fly');
    if (!eggFly) return;
    var EGG_VOICE_URL = 'https://r2.manosaba-library.com/Assets/%23WitchTrials/Audio/Voice/Act02_Chapter01/Act02_Chapter01_Trial08/0201Trial08_Ema022.ogg';
    var eggAudio = null;
    var eggBouncer = null;

    function playEggVoice() {
      try {
        if (!eggAudio) {
          eggAudio = new Audio(EGG_VOICE_URL);
          eggAudio.preload = 'auto';
        }
        eggAudio.currentTime = 0;
        var p = eggAudio.play();
        if (p && p.catch) p.catch(function () {});
      } catch (e) {}
    }

    function buildBouncer() {
      var img = d.createElement('img');
      img.className = 'egg-bounce';
      img.src = 'assets/egg-fubuki.jpg';
      img.alt = '';
      img.draggable = false;
      d.body.appendChild(img);

      var W = window.innerWidth;
      var H = window.innerHeight;
      var iw = img.offsetWidth;
      var ih = img.offsetHeight;
      var x = Math.max(0, (W - iw) / 2);
      var y = Math.max(0, (H - ih) / 2);

      var speed = 2.6;
      var angle = (Math.random() * 90 - 45) * Math.PI / 180;
      if (Math.random() < 0.5) angle += Math.PI / 2;
      var vx = Math.cos(angle) * speed;
      var vy = Math.sin(angle) * speed;
      if (Math.abs(vx) < speed * 0.3) vx = vx < 0 ? -speed * 0.3 : speed * 0.3;
      if (Math.abs(vy) < speed * 0.3) vy = vy < 0 ? -speed * 0.3 : speed * 0.3;

      function tick() {
        x += vx;
        y += vy;
        if (x <= 0) { x = 0; vx = Math.abs(vx); }
        else if (x + iw >= W) { x = W - iw; vx = -Math.abs(vx); }
        if (y <= 0) { y = 0; vy = Math.abs(vy); }
        else if (y + ih >= H) { y = H - ih; vy = -Math.abs(vy); }
        img.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        requestAnimationFrame(tick);
      }

      window.addEventListener('resize', function () {
        W = window.innerWidth;
        H = window.innerHeight;
        if (x + iw > W) x = W - iw;
        if (y + ih > H) y = H - ih;
        if (x < 0) x = 0;
        if (y < 0) y = 0;
      });

      img.addEventListener('click', function () {
        playEggVoice();
      });

      requestAnimationFrame(tick);
      return img;
    }

    function showEggToast() {
      var t = d.querySelector('.egg-toast');
      if (!t) {
        t = d.createElement('div');
        t.className = 'egg-toast';
        t.textContent = 'kiang';
        d.body.appendChild(t);
      }
      t.classList.add('show');
      clearTimeout(showEggToast._timer);
      showEggToast._timer = setTimeout(function () {
        t.classList.remove('show');
      }, 2400);
    }

    eggFly.addEventListener('click', function () {
      eggFly.classList.add('egg-lit');
      playEggVoice();
      showEggToast();
      if (!eggBouncer) eggBouncer = buildBouncer();
      else eggBouncer.style.display = 'block';
    });
  })();

  /* ═══════════════════════════════════════════════════
     键盘彩蛋: ← → ← → ← → 跳转 Bilibili
     ═══════════════════════════════════════════════════ */
  (function () {
    var SEQ = ['ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'];
    var pos = 0;
    var EGG_URL = 'https://www.bilibili.com/video/BV1rP3164Emu/';
    var lastKeyTime = 0;

    d.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
        pos = 0;
        return;
      }
      var now = Date.now();
      if (now - lastKeyTime > 2000) pos = 0;
      lastKeyTime = now;

      if (e.key === SEQ[pos]) {
        pos++;
        if (pos >= SEQ.length) {
          pos = 0;
          location.href = EGG_URL;
        }
      } else {
        pos = e.key === SEQ[0] ? 1 : 0;
      }
    });
  })();

  /* ═══════════════════════════════════════════════════
     镜像站牌 + Ping（行为与原版一致）
     ═══════════════════════════════════════════════════ */
  (function () {
    // 站点表唯一数据源 = HTML 的 .mirror-row（增站只改一处）
    var SITES = [];
    var rows = d.querySelectorAll('.mirror-row');
    rows.forEach(function (row) {
      SITES.push({
        name: row.dataset.host || '',
        url: row.dataset.url || '',
        row: row
      });
    });

    var host = location.hostname.toLowerCase();
    SITES.forEach(function (site) {
      if (host === site.name.toLowerCase() && site.row) {
        site.row.classList.add('current');
      }
    });

    rows.forEach(function (row) {
      row.addEventListener('click', function () {
        var url = row.dataset.url;
        if (url) window.open(url, '_blank', 'noopener');
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          row.click();
        }
      });
    });

    function pingSite(url, callback) {
      var img = new Image();
      var start = performance.now();
      var done = false;
      var timeout = setTimeout(function () {
        if (!done) { done = true; callback(-1); }
      }, 8000);
      img.onload = function () {
        if (!done) { done = true; clearTimeout(timeout); callback(Math.round(performance.now() - start)); }
      };
      img.onerror = function () {
        if (!done) { done = true; clearTimeout(timeout); callback(Math.round(performance.now() - start)); }
      };
      img.src = url + '/favicon.ico?' + Date.now();
    }

    function updatePingEl(el, ms) {
      el.classList.remove('testing', 'good', 'ok', 'bad');
      if (ms < 0) {
        el.textContent = '超时';
        el.classList.add('bad');
      } else if (ms < 200) {
        el.textContent = ms + 'ms';
        el.classList.add('good');
      } else if (ms < 600) {
        el.textContent = ms + 'ms';
        el.classList.add('ok');
      } else {
        el.textContent = ms + 'ms';
        el.classList.add('bad');
      }
    }

    var pingBtn = d.getElementById('mirror-ping');
    if (pingBtn) {
      function runPing() {
        if (pingBtn.disabled) return;
        pingBtn.disabled = true;
        pingBtn.textContent = '测速中';
        var remaining = SITES.length;
        SITES.forEach(function (site) {
          var el = site.row ? site.row.querySelector('.mr-ping') : null;
          if (el) {
            el.classList.remove('good', 'ok', 'bad');
            el.classList.add('testing');
            el.textContent = '...';
          }
          pingSite(site.url, function (ms) {
            if (el) updatePingEl(el, ms);
            remaining--;
            if (remaining <= 0) {
              pingBtn.disabled = false;
              pingBtn.textContent = '测速';
            }
          });
        });
      }
      pingBtn.addEventListener('click', runPing);
      // 页面加载后 2.5s 自动测速（等入场动画结束）
      setTimeout(runPing, 2500);
    }
  })();

  /* ── 数据跳转键盘可达性 ── */
  d.querySelectorAll('[data-go]').forEach(function (el) {
    if (el.classList.contains('hero-logo')) return;
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  });
})(window, document);
