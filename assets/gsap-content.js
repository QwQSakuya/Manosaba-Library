/* ═══════════════════════════════════════════════════════════════
   gsap-content.js — 内容页专用动效 · 重构版
   依赖：gsap.min.js + ScrollTrigger.min.js + gsap-animations.js
   被 gallery / records / evidence / audio / archive / credits 引用

   规范:
   - 入场统一 ScrollTrigger.batch（MS.motion.batchReveal, 不逐条建 trigger）
   - 大列表(数百张卡片)由页面 JS 调用 MS.animateCardStagger:
     单条 stagger tween 一次性播放(签名不变), 避免为每张卡建立 ScrollTrigger
   - 只动 transform / opacity; reduced-motion 直达终态
   ═══════════════════════════════════════════════════════════════ */
(function (w, d) {
  'use strict';
  if (!w.gsap || !w.MS || !MS.gsapReady) return;

  var EASE = 'power3.out';

  // ═══ matchMedia 守卫 ═══
  var mm = gsap.matchMedia();

  mm.add({
    normal: '(prefers-reduced-motion: no-preference)',
    reduceMotion: '(prefers-reduced-motion: reduce)'
  }, function (ctx) {
    if (ctx.conditions.reduceMotion) {
      // reduced-motion: 直达终态
      gsap.set('.gothic-frame, .item-card, .frame-card, .c-section-title, .c-header', {
        autoAlpha: 1, y: 0, scale: 1, clearProps: 'transform,opacity'
      });
      return;
    }

    initPageEntrance();
    initScrollReveal();
  });

  // ═══ 页头统一入场（翻开档案封面）═══
  function initPageEntrance() {
    var header = d.querySelector('.c-header');
    if (!header) return;
    gsap.fromTo(header,
      { y: -18, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.6, ease: EASE }
    );
  }

  // ═══ 滚动渐入: 哥特框 + 章节标题统一 batch ═══
  function initScrollReveal() {
    // 章节标题轻视差（scrub 跟随滚动, 容器动画 ease:"none"）
    gsap.utils.toArray('.c-section-title').forEach(function (t) {
      gsap.to(t, {
        y: -30,
        ease: 'none',
        scrollTrigger: {
          trigger: t,
          start: 'top 80%',
          end: 'bottom 20%',
          scrub: 1
        }
      });
    });

    // gothic-frame 渐入（batch, once）
    MS.motion.batchReveal('.gothic-frame', {
      start: 'top 85%',
      duration: 0.8,
      stagger: 0.1
    });
  }

  // ═══════════════════════════════════════════════════
  //  卡片 stagger 渐入（渲染后由页面 JS 调用, 签名不变）
  //  container, selector 参数与旧版完全一致
  //════════════════════════════════════════════════════
  MS.animateCardStagger = function (container, selector) {
    var items = gsap.utils.toArray(selector || '.item-card, .frame-card', container);
    // 防重复动画: 只处理尚未入场的元素（重新渲染产生的新元素会再次入场）
    items = items.filter(function (el) { return !el._msAnimated; });
    if (!items.length) return;
    items.forEach(function (el) { el._msAnimated = true; });

    // 大列表: 单条 stagger tween（每张卡不建 ScrollTrigger, 中低端硬件友好）
    // 动画期间禁用 CSS transform transition, 避免与 GSAP 逐帧互踩
    items.forEach(function (el) { el.style.transition = 'none'; });
    gsap.fromTo(items,
      { autoAlpha: 0, y: 24, scale: 0.97 },
      {
        autoAlpha: 1, y: 0, scale: 1,
        duration: 0.55, ease: EASE,
        stagger: { each: 0.02, from: 'start' },
        onComplete: function () {
          items.forEach(function (el) { el.style.transition = ''; });
          ScrollTrigger.refresh();
        }
      }
    );
  };
})(window, document);
