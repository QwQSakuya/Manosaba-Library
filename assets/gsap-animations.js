/* ═══════════════════════════════════════════════════════════════
   gsap-animations.js — 大魔女图书馆 GSAP 动效引擎
   全站共享：入场序列、背景呼吸、3D hover、页面转场、彩蛋升级
   依赖：gsap.min.js + ScrollTrigger.min.js（自托管 assets/lib/）
   ═══════════════════════════════════════════════════════════════ */
(function (w, d) {
  'use strict';
  if (!w.gsap) return; // GSAP 未加载则静默退出，CSS 降级

  gsap.registerPlugin(ScrollTrigger);

  var MS = w.MS || {};
  MS.gsapReady = true;
  w.MS = MS;

  // ═══ 缓动常量 ═══
  var EASE_SMOOTH_OUT = 'power3.out';
  var EASE_SMOOTH_INOUT = 'power4.inOut';
  var EASE_ELASTIC = 'elastic.out(1, 0.5)';
  var EASE_BACK = 'back.out(1.7)';

  // ═══ matchMedia 守卫 ═══
  var mm = gsap.matchMedia();

  mm.add({
    isDesktop: '(min-width: 721px) and (prefers-reduced-motion: no-preference)',
    isMobile: '(max-width: 720px) and (prefers-reduced-motion: no-preference)',
    reduceMotion: '(prefers-reduced-motion: reduce)'
  }, function (ctx) {
    var isDesktop = ctx.conditions.isDesktop;

    // reduced-motion: 所有元素直达终态，不播放动画
    if (ctx.conditions.reduceMotion) {
      gsap.set(
        '.logo,.landing-title,.landing-subtitle,.card,.future-section,' +
        '.future-divider,.landing-footer,.frame-card,.item-card,' +
        '.gothic-frame,.future-card,.landing-divider',
        { autoAlpha: 1, y: 0, scale: 1, x: 0, rotation: 0 }
      );
      return;
    }

    // ── 根据页面类型分发动效 ──
    var pt = detectPageType();
    if (pt === 'landing') {
      initLanding();
      initLandingScroll();
    }
    if (pt === 'graph') initGraph();
    // 内容页无专属落地/图谱动效，由 gsap-content.js 补充

    // 全站通用（魔法阵呼吸已由 CSS 处理，见 shared.css）
    initPageTransition();
    initCard3DHover(isDesktop);
    initIncomingReveal();
    initScrollProgress(); // 图谱页 Canvas 自定义滚动不启用（detectPageType 已分流）
  });

  // ═══ 页面类型检测 ═══
  function detectPageType() {
    var path = location.pathname.split('/').pop();
    if (path === '' || path === 'index.html') return 'landing';
    if (path.indexOf('act0') === 0) return 'graph';
    return 'content';
  }

  // ═══ 背景魔法阵呼吸脉冲（已迁移至 CSS，见 shared.css）═══

  // ═══ 落地页入场序列（压缩版；下方内容立即可见，仅首屏保留入场动画）═══
  function initLanding() {
    // 清除全部 CSS 入场动画，由 GSAP 接管（降级时 CSS animation 仍可工作）
    var allEnterEls = d.querySelectorAll(
      '.logo, .landing-title, .landing-subtitle, .landing-divider, ' +
      '.card, .future-divider, .future-section, .future-card, .landing-footer'
    );
    allEnterEls.forEach(function (el) { el.style.animation = 'none'; });

    // 下方内容（未来功能区/页脚）立即可见：不做入场隐藏, 保证一开始就能向下滚动看到
    var futureDivider = d.querySelector('.future-divider');
    if (futureDivider) {
      futureDivider.style.width = '260px'; // enter-divider 终态
    }
    d.querySelectorAll('.future-section, .future-card, .landing-footer')
      .forEach(function (el) { el.style.opacity = '1'; el.style.transform = 'none'; });

    // 首屏元素（logo/标题/副标题/分割线/周目卡片）做入场动画
    var landingEls = d.querySelectorAll(
      '.logo, .landing-title, .landing-subtitle, .landing-divider, .card'
    );
    // 临时禁用 transform transition，避免干扰 GSAP 逐帧动画（入场完成后恢复）
    landingEls.forEach(function (el) { el.style.transition = 'none'; });

    // 初始态（覆盖 CSS 的 opacity:0）
    gsap.set('.logo', { autoAlpha: 0, scale: 0.65 });
    gsap.set('.landing-title', { autoAlpha: 0, y: 18 });
    gsap.set('.landing-subtitle', { autoAlpha: 0, y: 12 });
    gsap.set('.landing-divider', { autoAlpha: 0, scaleX: 0, transformOrigin: 'center', width: 260 });
    gsap.set('.card', { autoAlpha: 0, y: 30 });

    var tl = gsap.timeline({ delay: 0.1, onComplete: function () {
      // 入场完成，恢复 CSS transition（hover 等交互效果）
      landingEls.forEach(function (el) { el.style.transition = ''; });
    } });

    // 入场动画自然播放完：不因滚动/触摸跳过，滚动期间动画照常进行
    // （下方内容已立即可见，滚动不受入场影响）

    tl.to('.logo', { autoAlpha: 1, scale: 1, duration: 0.6, ease: EASE_SMOOTH_OUT })
      .to('.landing-title', { autoAlpha: 1, y: 0, duration: 0.55, ease: EASE_SMOOTH_OUT }, '-=0.35')
      .to('.landing-subtitle', { autoAlpha: 1, y: 0, duration: 0.5, ease: EASE_SMOOTH_OUT }, '-=0.35')
      .to('.landing-divider', { autoAlpha: 1, scaleX: 1, duration: 0.5, ease: EASE_SMOOTH_INOUT }, '-=0.3')
      .to('.card', { autoAlpha: 1, y: 0, duration: 0.6, ease: EASE_SMOOTH_OUT, stagger: 0.15 }, '-=0.25');
    // 未来功能区/页脚已立即可见（不做入场动画）
  }

  // ═══ 卡片 3D 倾斜 hover ═══
  function initCard3DHover(isDesktop) {
    if (!isDesktop) return; // 移动端不启用

    gsap.utils.toArray('.card, .frame-card, .item-card, .future-card').forEach(function (card) {
      var qRY = gsap.quickTo(card, 'rotationY', { duration: 0.4, ease: 'power2.out' });
      var qRX = gsap.quickTo(card, 'rotationX', { duration: 0.4, ease: 'power2.out' });

      card.addEventListener('mouseenter', function () {
        card.style.transition = 'none'; // 避免 CSS transform transition 干扰 GSAP
      });

      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        var dx = (e.clientX - r.left - r.width / 2) / (r.width / 2);
        var dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
        qRY(dx * 8);
        qRX(-dy * 8);
      });

      card.addEventListener('mouseleave', function () {
        qRY(0);
        qRX(0);
        // 等 GSAP 回正后再恢复 CSS transition
        setTimeout(function () { card.style.transition = ''; }, 450);
      });
    });
  }

  // ═══ 落地页滚动叙事（ScrollTrigger：视差 + 渐入，让滚动有意义）═══
  function initLandingScroll() {
    var header = d.querySelector('.landing-header');
    var future = d.querySelector('.future-section');

    // 标题区滚动视差 + 淡出（向上滚时让位）
    // 注意: 不操作 .card / .landing-header 内部元素的 y, 避免与入场动画属性冲突
    if (header) {
      gsap.to(header, {
        y: -70, autoAlpha: 0.25,
        ease: 'none',
        scrollTrigger: {
          trigger: d.querySelector('.landing'),
          start: 'top top',
          end: '+=360',
          scrub: 1
        }
      });
    }

    // 周目卡片不做位移视差（与入场 y 动画冲突），改为 hover 已提供反馈
    // （入场动画完成前滚动 → 卡片仍按入场曲线播放, 滚动只移动视口）

    // 未来功能区滚动视差（入场已处理渐入，此处仅轻微上浮）
    if (future) {
      gsap.to(future, {
        y: -26, ease: 'none',
        scrollTrigger: {
          trigger: future,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1
        }
      });
    }
  }

  // ═══ 右侧自定义滚动进度条（可拖动/点按控制页面滚动）═══
  function initScrollProgress() {
    // 图谱页使用自有 Canvas 滚动交互，不注入
    if (detectPageType() === 'graph') return;
    // 制作名单为全屏翻页结构（无页面滚动），隐藏进度条
    if (d.querySelector('.ak-stage')) return;
    if (d.querySelector('.scroll-progress')) return;

    // 强制页面滚动容器可用（防止任何样式覆盖锁定滚动）
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

    // 点按轨道/拖动滑块 → 平滑滚动到对应位置
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
      if (dragging) {
        dragging = false;
        bar.classList.remove('sp-dragging');
      }
    });

    // 触摸支持
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
    // 首次渲染时校准
    update();
  }

  // ═══ 页面转场 ═══
  function initPageTransition() {
    d.addEventListener('click', function (e) {
      var goEl = e.target.closest('[data-go]');
      var link = e.target.closest('a[href]');

      // 拦截 [data-go] 跳转（排除 .logo 彩蛋）
      if (goEl && !goEl.classList.contains('logo')) {
        e.preventDefault();
        e.stopPropagation();
        runPageTransition(goEl.dataset.go + '.html');
        return;
      }

      // 拦截内部 .html 链接
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
      { clipPath: 'inset(0 0 0% 0)', duration: 0.5, ease: EASE_SMOOTH_INOUT }
    )
    .fromTo(sigil,
      { autoAlpha: 0, scale: 0.5, rotation: -180 },
      { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.5, ease: EASE_BACK },
      '-=0.2'
    )
    .to({}, { duration: 0.3 }) // 停顿展示印记
    .to(sigil, { autoAlpha: 0, scale: 1.3, duration: 0.3, ease: EASE_SMOOTH_OUT });
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
        ease: EASE_SMOOTH_INOUT,
        onComplete: function () { veil.remove(); }
      }
    );
  }

  // ═══ 图谱页轻量动效 ═══
  function initGraph() {
    // 详情面板 GSAP 滑入（替代 CSS .open class）
    MS.animateDetailPanel = function (open) {
      var p = d.getElementById('detail-panel');
      var o = d.getElementById('detail-overlay');
      if (!p) return;
      // 禁用 CSS transition，避免与 GSAP 逐帧动画冲突
      p.style.transition = 'none';
      o.style.transition = 'none';

      if (open) {
        gsap.set(p, { x: '100%' });
        gsap.to(p, { x: '0%', duration: 0.42, ease: EASE_SMOOTH_OUT });
        gsap.to(o, {
          autoAlpha: 1, duration: 0.35, ease: EASE_SMOOTH_OUT,
          onStart: function () { o.style.pointerEvents = 'auto'; }
        });
      } else {
        gsap.to(p, { x: '100%', duration: 0.38, ease: EASE_SMOOTH_INOUT });
        gsap.to(o, {
          autoAlpha: 0, duration: 0.3, ease: EASE_SMOOTH_INOUT,
          onComplete: function () { o.style.pointerEvents = 'none'; }
        });
      }
    };

    // 节点点击弹性微反馈
    MS.nodeClickFeedback = function (el) {
      var oldTransition = el.style.transition;
      el.style.transition = 'none'; // 避免 CSS transform transition 干扰
      gsap.fromTo(el,
        { scale: 0.92 },
        {
          scale: 1, duration: 0.5, ease: EASE_BACK,
          onComplete: function () {
            el.style.transition = oldTransition;
            gsap.set(el, { clearProps: 'scale' });
          }
        }
      );
    };
  }

  // ═══ 彩蛋升级 — Logo 震动（GSAP timeline 重编，最初版本）═══
  MS.logoShakeGSAP = function (level, logoEl, landingEl) {
    var configs = [
      { rot: 3, x: 2, scale: 1.0, dur: 0.4 },
      { rot: 8, x: 5, scale: 1.05, dur: 0.6 },
      { rot: 14, x: 8, scale: 1.1, dur: 0.8 },
      { rot: 18, x: 12, scale: 1.15, dur: 1.0 }
    ];
    var cfg = configs[level - 1] || configs[0];

    var tl = gsap.timeline();

    // 四段震荡：左→右→左小→右微→弹性回正
    tl.to(logoEl, {
      rotation: -cfg.rot, x: -cfg.x, scale: cfg.scale,
      duration: cfg.dur * 0.15, ease: 'power2.in'
    })
    .to(logoEl, {
      rotation: cfg.rot, x: cfg.x,
      duration: cfg.dur * 0.2, ease: 'power2.inOut'
    })
    .to(logoEl, {
      rotation: -cfg.rot * 0.7, x: -cfg.x * 0.7,
      duration: cfg.dur * 0.2, ease: 'power2.inOut'
    })
    .to(logoEl, {
      rotation: cfg.rot * 0.4, x: cfg.x * 0.3,
      duration: cfg.dur * 0.2, ease: 'power2.out'
    })
    .to(logoEl, {
      rotation: 0, x: 0, scale: 1,
      duration: cfg.dur * 0.25, ease: EASE_ELASTIC
    });

    // Level 3+: 页面 screen shake（逐段随机位移 + 旋转，第4次更剧烈且更快结束）
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
      tlShake.to(landingEl, { x: 0, y: 0, rotation: 0, duration: 0.3, ease: EASE_SMOOTH_OUT });
      tl.add(tlShake, 0);
    }

    return tl;
  };

  // ═══ 彩蛋 — 页面倾倒（GSAP 重写 + motion blur，最初版本）═══
  // 语义: 第 4 次点击, 枪声响起, 整个页面中弹倾倒坠落
  MS.pageCollapseGSAP = function (landingEl) {
    return gsap.timeline({ transformOrigin: 'bottom left' })
      // Phase 1: 中弹后仰（反作用力）
      .to(landingEl, {
        rotation: 3, y: -3, x: 4, skewX: -1.5,
        duration: 0.1, ease: 'power2.out'
      })
      // Phase 2: 开始倾倒（加速下坠）
      .to(landingEl, {
        rotation: -19, y: 55, x: -28, skewX: 6,
        filter: 'blur(1.4px)',
        duration: 0.4, ease: 'power2.in'
      })
      // Phase 3: 加速坠落（motion blur 增强）
      .to(landingEl, {
        rotation: -36, y: 175, x: -95, skewX: 11,
        filter: 'blur(3px)', autoAlpha: 0.62,
        duration: 0.35, ease: 'power3.in'
      })
      // Phase 4: 最终坠落离屏
      .to(landingEl, {
        rotation: -61, y: 560, x: -225, skewX: 18,
        filter: 'blur(8px)', autoAlpha: 0,
        duration: 0.45, ease: 'power3.in'
      });
  };
})(window, document);
