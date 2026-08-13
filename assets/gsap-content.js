/* ═══════════════════════════════════════════════════════════════
   gsap-content.js — 内容页专用动效
   依赖：gsap.min.js + ScrollTrigger.min.js + gsap-animations.js
   被 gallery / records / evidence / audio / archive / credits 引用
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
      gsap.set('.gothic-frame, .item-card, .frame-card, .c-section-title', {
        autoAlpha: 1, y: 0, scale: 1
      });
      return;
    }

    initScrollReveal();
  });

  // ═══ 滚动渐入与视差 ═══
  function initScrollReveal() {
    // 章节标题视差（scrub 跟随滚动）
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

    // gothic-frame 渐入（一次性播放）
    gsap.utils.toArray('.gothic-frame').forEach(function (f) {
      gsap.fromTo(f,
        { autoAlpha: 0, y: 40 },
        {
          autoAlpha: 1, y: 0,
          duration: 0.8, ease: EASE,
          scrollTrigger: {
            trigger: f,
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    });
  }

  // ═══ 卡片 stagger 渐入（渲染后调用）═══
  MS.animateCardStagger = function (container, selector) {
    var items = gsap.utils.toArray(selector || '.item-card, .frame-card', container);
    if (!items.length) return;

    gsap.fromTo(items,
      { autoAlpha: 0, y: 24, scale: 0.96 },
      {
        autoAlpha: 1, y: 0, scale: 1,
        duration: 0.6, ease: EASE,
        stagger: { each: 0.04, from: 'start' },
        onComplete: function () {
          ScrollTrigger.refresh();
        }
      }
    );
  };
})(window, document);
