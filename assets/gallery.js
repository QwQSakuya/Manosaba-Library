/* ═══════════════════════════════════════════════════
   gallery.js — CG画廊 页面逻辑
   依赖: shared.js (window.MS)
   ES5 兼容 (var / function, 无箭头函数/const/let)
   ═══════════════════════════════════════════════════ */
(function (w, d) {
  'use strict';

  var MS = w.MS;
  if (!MS) {
    /* shared.js 加载失败兜底：隐藏开屏并提示 */
    var _sp = d.getElementById('splash');
    if (_sp) _sp.classList.add('hide');
    var _eh = d.createElement('div');
    _eh.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:32px;font-family:Georgia,serif;color:#c9a0dc;background:#15121e;z-index:9999';
    _eh.textContent = '核心脚本加载失败，请刷新页面重试';
    d.body.appendChild(_eh);
    return;
  }

  /* ── 断图占位 SVG (URL 编码, 避免引号冲突) ── */
  var PLACEHOLDER =
    "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20100%20100'%3E" +
    "%3Crect%20x='12'%20y='20'%20width='76'%20height='60'%20rx='3'%20fill='none'%20stroke='%23888'%20stroke-width='2'/%3E" +
    "%3Ccircle%20cx='36'%20cy='40'%20r='6'%20fill='none'%20stroke='%23888'%20stroke-width='2'/%3E" +
    "%3Cpath%20d='M20,72%20L42,50%20L58,64%20L72,48%20L80,58'%20fill='none'%20stroke='%23888'%20stroke-width='2'%20stroke-linejoin='round'/%3E" +
    "%3C/svg%3E";

  /* ── 状态 ── */
  var state = {
    categories: [],      // [{id, label, count}]
    items: [],           // 全部条目
    filtered: [],        // 当前可见条目
    activeCategory: 'all',
    searchQuery: '',
    lightboxIndex: -1,
    r2Base: '',          // R2 原图基础地址 (data/r2-config.json)
    webBase: '',         // R2 网页压缩素材基础地址 (data/r2-config.json)
    downloadFmt: 'png',  // 原图下载格式: 'png' | 'tga'
    waterLevel: 0        // 诺亚注水彩蛋: 当前水位 0-100
  };

  /* ── DOM 缓存 ── */
  var els = {};
  var workshopLoaded = false;


  /* ═══════════════════════════════════════════════════
   诺亚注水彩蛋 — 最终方案 W2 + B1 + D5 (全 GSAP 驱动)
   1) 按住空格 → W2 压力翻涌: 无可见水柱, 底部整片 surge 上冲 + 白沫波浪
   2) 未满松开 → 水面惯性上冲后按水压感排空
   3) B1 细密气泡云: 每 35–90ms 持续释放一颗微气泡, 连续不断
   4) D5 先褪色再透明: 水面一碰到照片即开始, 水下副本先 desaturate 再淡出,
      色素像水彩一样向上扩散; 只溶解水面以下部分
   5) 注满 → 自动跳转 Still_460_011 + 诺亚水蓝风格
   ═══════════════════════════════════════════════════════ */
var WATER_FILL_MS = 5000;    // W2: 压力注满耗时
var WATER_DRAIN_MS = 3200;   // 满水位排空耗时
var WATER_START_LEVEL = 1;   // 水位一碰到画面就开始溶解
var NOAH_TARGET_ID = 'Still_460_011';
var water = {
  active: false, tween: null, final: false, dissolving: false,
  bubbleTimer: null, pigmentTimer: null, loops: [], pigments: []
};

function currentLightboxItem() {
  var idx = state.lightboxIndex;
  return (idx >= 0 && idx < state.filtered.length) ? state.filtered[idx] : null;
}

/* 周期波浪路径: 每 100 单位重复一次, 配合 300 宽 viewBox 可无缝循环 */
function wavePath(amp, base) {
  var p = 'M0,' + base;
  for (var x = 0; x < 300; x += 100) {
    p += ' Q' + (x + 25) + ',' + (base - amp) + ' ' + (x + 50) + ',' + base;
    p += ' T' + (x + 100) + ',' + base;
  }
  return p + ' V96 H0 Z';
}

function currentPhotoSrc() {
  return els.lbImg.getAttribute('src') || els.lbImg.src || '';
}

function ensureWaterOverlay() {
  if (els.water) return;

  /* 1) 把 #lb-img 包进 .lb-img-wrap */
  if (!els.lbWrap) {
    var wrap = d.createElement('div');
    wrap.className = 'lb-img-wrap';
    els.lbImg.parentNode.insertBefore(wrap, els.lbImg);
    wrap.appendChild(els.lbImg);
    els.lbWrap = wrap;
  }

  /* 2) D5 水下副本: 先褪色再透明的单一图层, 只被裁切到水面以下 */
  var bleed = d.createElement('div');
  bleed.className = 'nw-bleed';
  bleed.style.filter = 'saturate(1) brightness(1)';
  bleed.style.backgroundImage = 'url("' + currentPhotoSrc().replace(/"/g, '%22') + '")';
  els.lbWrap.appendChild(bleed);
  els.waterBleed = bleed;

  /* 3) 色素扩散层 (D5 的水彩感) */
  var pigment = d.createElement('div');
  pigment.className = 'nw-pigment';
  pigment.setAttribute('aria-hidden', 'true');
  els.lbWrap.appendChild(pigment);
  els.waterPigment = pigment;

  /* 4) W2 水体: 底部 surge 翻涌 + 焦散 + 微粒 + 三层白沫波浪 */
  var wEl = d.createElement('div');
  wEl.className = 'noah-water';
  wEl.setAttribute('aria-hidden', 'true');
  wEl.innerHTML =
    '<div class="nw-body"><i class="nw-caustics"></i><i class="nw-motes"></i><i class="nw-surge"></i></div>' +
    '<div class="nw-surface-wrap">' +
      '<svg class="nw-wave nw-wave-1" viewBox="0 0 300 96" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><path d="' + wavePath(10, 42) + '"/></svg>' +
      '<svg class="nw-wave nw-wave-2" viewBox="0 0 300 96" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><path d="' + wavePath(6, 48) + '"/></svg>' +
      '<svg class="nw-wave nw-wave-3" viewBox="0 0 300 96" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><path d="' + wavePath(4, 50) + '"/></svg>' +
    '</div>' +
    '<div class="nw-fizz"></div>';
  els.lightbox.appendChild(wEl);
  els.water = wEl;
  els.waterBody = wEl.querySelector('.nw-body');
  els.waterCaustics = wEl.querySelector('.nw-caustics');
  els.waterMotes = wEl.querySelector('.nw-motes');
  els.waterSurge = wEl.querySelector('.nw-surge');
  els.waterSurface = wEl.querySelector('.nw-surface-wrap');
  els.waterFizz = wEl.querySelector('.nw-fizz');

  /* 5) 无限循环动效 (全部 GSAP) */
  var reduce = false;
  try { reduce = !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
  if (!reduce) {
    var w1 = wEl.querySelector('.nw-wave-1');
    var w2 = wEl.querySelector('.nw-wave-2');
    var w3 = wEl.querySelector('.nw-wave-3');
    gsap.set([w1, w2, w3], { xPercent: 0 });
    water.loops.push(gsap.to(w1, { xPercent: -33.3334, duration: 4.2, ease: 'none', repeat: -1 }));
    water.loops.push(gsap.to(w2, { xPercent: -33.3334, duration: 6.8, ease: 'none', repeat: -1 }));
    water.loops.push(gsap.to(w3, { xPercent: -33.3334, duration: 9.4, ease: 'none', repeat: -1 }));
    water.loops.push(gsap.to(els.waterCaustics, {
      xPercent: 7, yPercent: -6, duration: 6.4, ease: 'sine.inOut', yoyo: true, repeat: -1
    }));
    water.loops.push(gsap.to(els.waterMotes, {
      xPercent: -10, yPercent: 8, duration: 9.2, ease: 'sine.inOut', yoyo: true, repeat: -1
    }));
    water.loops.push(gsap.to(els.waterSurface, {
      skewX: 3.2, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1
    }));
    water.loops.push(gsap.to(els.waterSurge, {
      scaleY: 1.45, opacity: 0.32, duration: 0.7, ease: 'sine.inOut', yoyo: true, repeat: -1
    }));
  }
}

function killWaterLoops() {
  water.loops.forEach(function (t) { t.kill(); });
  water.loops = [];
}

function clearPigments() {
  water.pigments.forEach(function (dot) {
    if (dot.parentNode) dot.parentNode.removeChild(dot);
  });
  water.pigments = [];
}

function removeWaterOverlay() {
  killWaterLoops();
  clearPigments();
  if (els.waterBleed && els.waterBleed.parentNode) {
    els.waterBleed.parentNode.removeChild(els.waterBleed);
  }
  els.waterBleed = null;
  if (els.waterPigment && els.waterPigment.parentNode) {
    els.waterPigment.parentNode.removeChild(els.waterPigment);
  }
  els.waterPigment = null;
  if (els.water && els.water.parentNode) {
    els.water.parentNode.removeChild(els.water);
  }
  els.water = null;
  els.waterBody = null;
  els.waterCaustics = null;
  els.waterMotes = null;
  els.waterSurge = null;
  els.waterSurface = null;
  els.waterFizz = null;
}

/* B1 细密气泡云: 每 35–90ms 持续释放一颗, 连续不断 */
function spawnBubble() {
  if (!els.waterFizz || !els.lbWrap) return;
  var wrapH = els.lightbox.clientHeight || w.innerHeight || 800;
  var b = d.createElement('span');
  b.className = 'nw-bubble';
  var size = 3.5 + Math.random() * 5;
  b.style.width = size.toFixed(1) + 'px';
  b.style.height = size.toFixed(1) + 'px';
  b.style.left = (2 + Math.random() * 96).toFixed(1) + '%';
  var lv = Math.max(0, Math.min(100, state.waterLevel));
  var surfaceFromBottom = lv / 100 * wrapH;
  var startBottom = Math.min(Math.max(2, surfaceFromBottom - 4 - Math.random() * 18), wrapH - 6);
  b.style.bottom = startBottom.toFixed(1) + 'px';
  els.waterFizz.appendChild(b);
  gsap.to(b, {
    y: -(28 + Math.random() * 54),
    x: (Math.random() - 0.5) * 40,
    opacity: 0,
    duration: 0.8 + Math.random() * 0.9,
    ease: 'power1.out',
    onComplete: function () { if (b.parentNode) b.parentNode.removeChild(b); }
  });
}

function bubbleTick() {
  if (water.final || !water.active || !els.water) { water.bubbleTimer = null; return; }
  spawnBubble();
  water.bubbleTimer = gsap.delayedCall(0.035 + Math.random() * 0.055, bubbleTick);
}

/* D5 色素: 从水下照片区域向上扩散, 像水彩被洗出来 */
function spawnPigment() {
  if (!els.waterPigment) return;
  var dot = d.createElement('i');
  dot.className = 'nw-pigment-dot';
  var size = 10 + Math.random() * 14;
  dot.style.width = size + 'px';
  dot.style.height = size + 'px';
  dot.style.left = (10 + Math.random() * 76).toFixed(1) + '%';
  var lv = Math.max(1, Math.min(100, state.waterLevel));
  dot.style.bottom = Math.max(2, lv * 0.22 + Math.random() * lv * 0.3).toFixed(1) + '%';
  els.waterPigment.appendChild(dot);
  water.pigments.push(dot);
  gsap.fromTo(dot, {
    y: 0, x: 0, opacity: 0
  }, {
    y: -(40 + Math.random() * 80),
    x: (Math.random() - 0.5) * 50,
    opacity: 0.5,
    duration: 1.4 + Math.random() * 1.1,
    ease: 'power1.out',
    onComplete: function () { if (dot.parentNode) dot.parentNode.removeChild(dot); }
  });
}

function pigmentTick() {
  if (water.final || !water.active || !water.dissolving || !els.water) {
    water.pigmentTimer = null; return;
  }
  spawnPigment();
  water.pigmentTimer = gsap.delayedCall(0.10 + Math.random() * 0.16, pigmentTick);
}

/* D5 溶解: 水位一到就开始, 先褪色再透明; 只发生在水面以下 */
function startDissolve() {
  if (water.dissolving) return;
  water.dissolving = true;
  if (els.waterSurface) {
    gsap.fromTo(els.waterSurface, { scaleY: 1.12 }, { scaleY: 1, duration: 0.8, ease: 'elastic.out(1, 0.35)', overwrite: true });
  }
  if (els.waterBleed) {
    if (els.waterBleed._tween) { els.waterBleed._tween.kill(); }
    var tl = gsap.timeline();
    els.waterBleed._tween = tl;
    tl.to(els.waterBleed, { filter: 'saturate(0) brightness(1.06)' , duration: 0.9, ease: 'power1.in' })
      .to(els.waterBleed, { filter: 'saturate(0) brightness(1.06)' , opacity: 0, duration: 1.7, ease: 'power2.inOut' });
  }
  pigmentTick();
}

function undissolve() {
  if (!water.dissolving) return;
  water.dissolving = false;
  if (els.waterBleed) {
    if (els.waterBleed._tween) { els.waterBleed._tween.kill(); els.waterBleed._tween = null; }
    gsap.to(els.waterBleed, { filter: 'saturate(1) brightness(1)', opacity: 1, duration: 3.2, ease: 'power1.inOut' });
  }
  if (water.pigmentTimer) { water.pigmentTimer.kill(); water.pigmentTimer = null; }
  clearPigments();
}

/* 每帧水位同步: 干区裁切 + 湿区裁切 (D5 透明溶解) */
function renderWater() {
  if (!els.waterBody) return;
  var lv = Math.max(0, Math.min(100, state.waterLevel));
  var waterLine = 100 - lv;
  els.waterBody.style.height = lv + '%';
  if (els.waterSurface) els.waterSurface.style.bottom = lv + '%';

  var pageH = els.lightbox.clientHeight || w.innerHeight || 800;
  var waterY = pageH * (100 - lv) / 100;
  var photoRect = els.lbImg ? els.lbImg.getBoundingClientRect() : null;

  if (els.lbImg && photoRect && photoRect.height > 0) {
    if (lv <= 0.4 || waterY >= photoRect.bottom) {
      gsap.set(els.lbImg, { clearProps: 'clipPath' });
    } else if (waterY <= photoRect.top) {
      gsap.set(els.lbImg, { clipPath: 'inset(0px 0px 100% 0px)' });
    } else {
      var dryCut = Math.max(0, photoRect.bottom - waterY);
      gsap.set(els.lbImg, { clipPath: 'inset(0px 0px ' + dryCut + 'px 0px)' });
    }
  }
  if (els.waterBleed && photoRect && photoRect.height > 0) {
    if (lv <= 0.4 || waterY >= photoRect.bottom) {
      gsap.set(els.waterBleed, { clipPath: 'inset(100% 0 0 0)' });
    } else if (waterY <= photoRect.top) {
      gsap.set(els.waterBleed, { clearProps: 'clipPath' });
    } else {
      var wetTop = Math.max(0, waterY - photoRect.top);
      gsap.set(els.waterBleed, { clipPath: 'inset(' + wetTop + 'px 0 0 0)' });
    }
  }
}

function fillWater() {
  if (water.tween) water.tween.kill();
  var remain = Math.max(0.12, (100 - state.waterLevel) / 100);
  water.tween = gsap.to(state, {
    waterLevel: 100,
    duration: remain * (WATER_FILL_MS / 1000),
    ease: 'power2.in',
    onUpdate: function () {
      renderWater();
      if (state.waterLevel >= WATER_START_LEVEL) startDissolve();
    },
    onComplete: waterFull
  });
}

function waterKeyDown() {
  if (!w.gsap) return;   // gsap 缺失时禁用彩蛋
  if (water.final) return;
  if (!water.active) {
    water.active = true;
    ensureWaterOverlay();
    renderWater();
    bubbleTick();
  }
  fillWater();
}

function waterKeyUp() {
  if (!water.active || water.final) return;
  if (state.waterLevel >= 99.5) return;   // 已注满, 交给 waterFull
  if (water.tween) water.tween.kill();
  if (water.dissolving) undissolve();
  /* 惯性上冲一小段 → 按水压感缓慢排空 */
  var tl = gsap.timeline({ onUpdate: renderWater });
  water.tween = tl;
  tl.to(state, {
    waterLevel: Math.min(100, state.waterLevel + 2.2),
    duration: 0.32, ease: 'power2.out'
  })
  .add(function () {
    if (state.waterLevel >= 99.5) waterFull();
  })
  .to(state, {
    waterLevel: 0,
    duration: function () { return Math.max(0.8, (state.waterLevel / 100) * (WATER_DRAIN_MS / 1000)); },
    ease: 'power2.out',
    onUpdate: renderWater,
    onComplete: function () {
      cleanupWater();
      removeWaterOverlay();
    }
  });
}

/* 注满: 满水保持 0.9s → 跳转 Still_460_011 + 切换诺亚水蓝风格 */
function waterFull() {
  if (water.final) return;
  if (water.tween) { water.tween.kill(); water.tween = null; }
  water.final = true;
  state.waterLevel = 100;
  renderWater();
  if (els.waterBody) {
    gsap.fromTo(els.waterBody, { scaleY: 1.022 }, { scaleY: 1, duration: 0.55, ease: 'power2.out', overwrite: true });
  }
  setTimeout(function () {
    /* 跳转前解除旧照片裁切, 让目标 CG 在满水后正常呈现 */
    if (els.lbImg) gsap.set(els.lbImg, { clearProps: 'clipPath' });
    if (els.waterBleed) gsap.set(els.waterBleed, { clearProps: 'clipPath', opacity: 0 });

    var targetIdx = -1;
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].id === NOAH_TARGET_ID) { targetIdx = i; break; }
    }
    if (targetIdx >= 0) {
      state.activeCategory = 'all';
      state.searchQuery = '';
      if (els.search) els.search.value = '';
      applyFilter();
      for (var j = 0; j < state.filtered.length; j++) {
        if (state.filtered[j].id === NOAH_TARGET_ID) { targetIdx = j; break; }
      }
      openLightbox(targetIdx);
    }
    /* 同步 URL, 刷新后仍停在这张 CG */
    try {
      w.history.replaceState(null, '', w.location.pathname + '?open=' + encodeURIComponent(NOAH_TARGET_ID));
    } catch (e2) {}
    /* 水层淡出 → 清理 (保持满水画面直到淡出结束) */
    if (els.water) {
      gsap.to(els.water, {
        opacity: 0, duration: 0.9, ease: 'power2.out',
        onComplete: function () {
          cleanupWater();
          removeWaterOverlay();
        }
      });
    } else {
      cleanupWater();
    }
    /* 启用诺亚水蓝风格 (点击亮暗色图标退出) */
    if (MS && MS.setNoahStyle) {
      MS.setNoahStyle(true);
      MS.showToast('已进入诺亚水蓝风格 — 点击右上角亮暗色图标退出');
    }
  }, 900);
}

function cleanupWater() {
  if (water.tween) { water.tween.kill(); water.tween = null; }
  if (water.bubbleTimer) { water.bubbleTimer.kill(); water.bubbleTimer = null; }
  if (water.pigmentTimer) { water.pigmentTimer.kill(); water.pigmentTimer = null; }
  if (els.waterBleed && els.waterBleed._tween) {
    els.waterBleed._tween.kill();
    els.waterBleed._tween = null;
  }
  clearPigments();
  water.active = false;
  water.dissolving = false;
  water.final = false;
  state.waterLevel = 0;
  if (els.lbImg) {
    gsap.set(els.lbImg, { clearProps: 'clipPath,filter,transform,opacity' });
  }
  if (els.waterBleed) {
    gsap.set(els.waterBleed, { clearProps: 'clipPath', filter: 'saturate(1) brightness(1)', opacity: 1 });
  }
  renderWater();
}

/* ── 初始化 ── */
  function init() {
    MS.restoreTheme();
    MS.injectBgLayer('bg-host');
    MS.initTheme();

    els.filters  = d.getElementById('gallery-filters');
    els.grid     = d.getElementById('gallery-grid');
    els.search   = d.getElementById('gallery-search');
    els.lightbox = d.getElementById('gallery-lightbox');
    els.lbImg    = d.getElementById('lb-img');
    els.lbCaption= d.getElementById('lb-caption');
    els.lbCounter= d.getElementById('lb-counter');
    els.lbClose  = MS.$('.lb-close', els.lightbox);
    els.lbPrev   = MS.$('.lb-prev', els.lightbox);
    els.lbNext   = MS.$('.lb-next', els.lightbox);
    els.lbDownload = d.getElementById('lb-download');
    els.lbDownloadRow = d.getElementById('lb-download-row');
    els.lbFmtBtns = els.lbDownloadRow ? MS.$$('.lb-fmt-btn', els.lbDownloadRow) : [];

    /* Tab 元素缓存 */
    els.tabs       = MS.$$('.gallery-tabs .tab');
    els.panelG     = d.getElementById('panel-gallery');
    els.panelW     = d.getElementById('panel-workshop');
    els.searchWrap = d.getElementById('gallery-search-wrap');

    // 提前解析 URL 参数: wakeup=1 时跳过光圈加载动画, 改用闭眼黑幕
    // (在 fetchData 之前执行, 确保加载动画完全不会出现)
    try {
      var params = new URLSearchParams(w.location.search);
      state._openId = params.get('open') || '';
      state._wakeup = params.get('wakeup') === '1';
    } catch (e) {}

    if (state._wakeup) {
      // 特殊情况: 不用加载动画。立即移除光圈开屏, 注入闭眼黑幕
      var sp = d.getElementById('splash');
      if (sp) sp.style.display = 'none';
      var lidTop = d.createElement('div');
      lidTop.className = 'eye-lid top';
      lidTop.style.height = '50vh';
      var lidBot = d.createElement('div');
      lidBot.className = 'eye-lid bottom';
      lidBot.style.height = '50vh';
      d.body.appendChild(lidTop);
      d.body.appendChild(lidBot);
      state._lids = { top: lidTop, bot: lidBot };
    }

    bindEvents();

    /* Tab 初始化: URL hash #workshop → 立绘工坊, 否则默认 CG画廊 */
    var initialTab = (w.location.hash === '#workshop') ? 'workshop' : 'gallery';
    switchTab(initialTab);

    fetchData();
  }

  /* ── Tab 切换 ── */
  function switchTab(name) {
    els.tabs.forEach(function (tab) {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === name);
    });
    if (els.panelG) els.panelG.classList.toggle('active', name === 'gallery');
    if (els.panelW) els.panelW.classList.toggle('active', name === 'workshop');

    /* 搜索栏仅在 CG画廊 Tab 显示 */
    if (els.searchWrap) {
      els.searchWrap.style.display = (name === 'gallery') ? '' : 'none';
    }

    /* 立绘工坊懒加载: 首次激活时调用 MSWorkshop.init() */
    if (name === 'workshop' && !workshopLoaded) {
      workshopLoaded = true;
      if (w.MSWorkshop && typeof w.MSWorkshop.init === 'function') {
        w.MSWorkshop.init();
      }
    }

    /* 更新 URL hash (不触发滚动) */
    if (name === 'workshop' && w.location.hash !== '#workshop') {
      w.history.replaceState(null, '', '#workshop');
    } else if (name === 'gallery' && w.location.hash === '#workshop') {
      w.history.replaceState(null, '', w.location.pathname + w.location.search);
    }
  }

  /* ── 事件绑定 ── */
  function bindEvents() {
    // 搜索 (防抖)
    if (els.search) {
      els.search.addEventListener('input', MS.debounce(function () {
        state.searchQuery = els.search.value.trim().toLowerCase();
        state.activeCategory = state.activeCategory; // 保留分类
        applyFilter();
      }, 200));
    }

    // 灯箱: 关闭 / 前后 / 点背景关闭
    if (els.lbClose) els.lbClose.addEventListener('click', closeLightbox);
    if (els.lbPrev)  els.lbPrev.addEventListener('click', function () { navLightbox(-1); });
    if (els.lbNext)  els.lbNext.addEventListener('click', function () { navLightbox(1); });
    if (els.lbFmtBtns.length) {
      els.lbFmtBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          state.downloadFmt = btn.getAttribute('data-fmt');
          var idx = state.lightboxIndex;
          if (idx >= 0 && idx < state.filtered.length) {
            updateDownloadHref(state.filtered[idx]);
          }
        });
      });
    }
    if (els.lightbox) {
      els.lightbox.addEventListener('click', function (e) {
        if (e.target === els.lightbox) closeLightbox();
      });
    }

    // 键盘: ← → Esc + 空格(诺亚注水彩蛋)
    d.addEventListener('keydown', function (e) {
      if (!els.lightbox || !els.lightbox.classList.contains('open')) return;
      if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); navLightbox(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); navLightbox(1); }
      else if (e.code === 'Space') {
        var it = currentLightboxItem();
        if (it && it.id === 'Profile_Noah') {
          e.preventDefault();
          if (e.repeat) return;   // 按住重复触发只认第一次
          waterKeyDown();
        }
      }
    });
    d.addEventListener('keyup', function (e) {
      if (e.code === 'Space') waterKeyUp();
    });

    // Tab 切换
    if (els.tabs.length) {
      els.tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          switchTab(tab.getAttribute('data-tab'));
        });
      });
    }

    // URL hash 变化时同步 Tab (如浏览器前进/后退)
    w.addEventListener('hashchange', function () {
      var tab = (w.location.hash === '#workshop') ? 'workshop' : 'gallery';
      switchTab(tab);
    });
  }

  /* ── 拉取数据 ── */
  function fetchData() {
    MS.fetchJSON('data/r2-config.json', 8000)
      .then(function (cfg) {
        state.r2Base = ((cfg && cfg.baseUrl) || '').replace(/\/+$/, '');
        state.webBase = ((cfg && cfg.webBaseUrl) || '').replace(/\/+$/, '');
        return MS.fetchJSON('data/gallery-manifest.json?v=20260815a', 15000);
      })
      .then(function (data) {
        state.categories = (data.categories || []).slice();
        state.items = data.items || [];

        // 统计每个分类数量
        var counts = {};
        state.items.forEach(function (it) {
          counts[it.category] = (counts[it.category] || 0) + 1;
        });
        state.categories.forEach(function (c) {
          c.count = counts[c.id] || 0;
        });

        renderChips();
        applyFilter();

        // URL 参数 ?open=ID 自动打开灯箱; wakeup=1 触发睁眼过渡
        var openId = state._openId || '';
        var wakeup = !!state._wakeup;

        // 按 ID 打开灯箱的共用逻辑
        function openById(id) {
          for (var i = 0; i < state.filtered.length; i++) {
            if (state.filtered[i].id === id) {
              openLightbox(i);
              break;
            }
          }
        }

        if (wakeup && state._lids) {
          // 彩蛋睁眼模式: 黑幕已在 init 阶段注入, 此处只负责开灯箱 + 睁眼
          var lidTop = state._lids.top;
          var lidBot = state._lids.bot;

          // 闭眼满 ~1s 后拉开眼睑; 拉开动画 (0.85s) 结束后移除黑幕
          function openEye() {
            setTimeout(function () {
              lidTop.classList.add('opening');
              lidBot.classList.add('opening');
            }, 1000);
            setTimeout(function () {
              if (lidTop.parentNode) lidTop.parentNode.removeChild(lidTop);
              if (lidBot.parentNode) lidBot.parentNode.removeChild(lidBot);
            }, 1950);
          }

          if (openId) {
            // 切到全部分类确保能找到目标
            state.activeCategory = 'all';
            state.searchQuery = '';
            applyFilter();
            // 立即打开灯箱, CG 在黑幕后加载
            setTimeout(function () { openById(openId); }, 30);
            // 等 CG 图片加载就绪后再睁眼, 保证「刚睁开眼就是那张 CG」
            var img = els.lbImg;
            function onImgLoad() {
              img.removeEventListener('load', onImgLoad);
              openEye();
            }
            setTimeout(function () {
              if (img.complete && img.naturalWidth) {
                openEye();
              } else {
                img.addEventListener('load', onImgLoad);
                // 兜底: 即便 load 事件遗漏, 2s 后也强制睁眼
                setTimeout(openEye, 2000);
              }
            }, 200);
          } else {
            // wakeup 但无 open: 直接睁眼显示画廊
            setTimeout(openEye, 800);
          }
        } else if (openId) {
          // 有 open 参数时立即隐藏 splash, 避免遮挡灯箱
          MS.hideSplash(0);
          // 切到全部分类确保能找到目标
          state.activeCategory = 'all';
          state.searchQuery = '';
          applyFilter();
          // 延迟一帧确保 DOM 渲染完成
          setTimeout(function () { openById(openId); }, 50);
        } else {
          MS.hideSplash(1200);
        }
      })
      .catch(function (err) {
        renderError(err);
        MS.hideSplash(800);
      });
  }

  /* ── 渲染分类筛选 chips ── */
  function renderChips() {
    var html = '';
    var total = state.items.length;
    html += chipHTML('all', '全部', total, state.activeCategory === 'all');
    state.categories.forEach(function (c) {
      html += chipHTML(c.id, c.label, c.count, state.activeCategory === c.id);
    });
    els.filters.innerHTML = html;

    MS.$$('.chip', els.filters).forEach(function (chip) {
      chip.addEventListener('click', function () {
        state.activeCategory = chip.getAttribute('data-cat');
        renderChips();
        applyFilter();
      });
    });
  }

  function chipHTML(id, label, count, active) {
    return '<button class="chip' + (active ? ' active' : '') + '" data-cat="' +
      MS.escapeHtml(id) + '" type="button">' +
      MS.escapeHtml(label) +
      '<span class="chip-count">' + count + '</span></button>';
  }

  /* 网页压缩素材地址: R2 优先, 本地相对路径兜底 */
  function webUrl(rel) {
    if (state.webBase) {
      return state.webBase + '/' + rel.split('/').map(encodeURIComponent).join('/');
    }
    return rel;
  }

  /* ── 过滤 ── */
  function applyFilter() {
    var cat = state.activeCategory;
    var q = state.searchQuery;
    state.filtered = state.items.filter(function (it) {
      if (cat !== 'all' && it.category !== cat) return false;
      if (q) {
        var title = (it.title || it.id || '').toLowerCase();
        if (title.indexOf(q) === -1) return false;
      }
      return true;
    });
    renderGrid();
  }

  /* ── 渲染缩略图网格 ── */
  function renderGrid() {
    var list = state.filtered;

    if (!list.length) {
      els.grid.innerHTML =
        '<div class="empty-state" style="grid-column:1/-1">' +
          '<div class="empty-icon">◇</div>' +
          '<div class="empty-text">无匹配的CG</div>' +
        '</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < list.length; i++) {
      html += cardHTML(list[i], i);
    }
    els.grid.innerHTML = html;

    // GSAP 卡片 stagger 渐入
    if (window.MS && MS.gsapReady && MS.animateCardStagger) {
      MS.animateCardStagger(els.grid, '.frame-card');
    }

    // 绑定断图占位 + 懒加载
    var imgs = MS.$$('.frame-matte img', els.grid);
    imgs.forEach(function (img) {
      img.addEventListener('load', function () {
        img.classList.add('loaded');
      });
      img.addEventListener('error', function () {
        if (img.getAttribute('data-failed') === '1') return;
        img.setAttribute('data-failed', '1');
        img.classList.add('loaded');
        img.src = PLACEHOLDER;
      });
    });
    MS.lazyLoad(imgs);

    // 绑定点击 → 打开灯箱
    MS.$$('.frame-card', els.grid).forEach(function (card) {
      card.addEventListener('click', function () {
        var idx = parseInt(card.getAttribute('data-idx'), 10);
        if (!isNaN(idx)) openLightbox(idx);
      });
    });
  }

  function cardHTML(it, idx) {
    var thumb = webUrl('assets/cg/' + it.thumb);
    var title = it.title || it.id || '';
    return '<div class="frame-card" data-idx="' + idx + '" tabindex="0" role="button" aria-label="查看 ' +
      MS.escapeHtml(title) + '">' +
      '<div class="frame-matte">' +
        '<img data-src="' + MS.escapeHtml(thumb) + '" alt="' + MS.escapeHtml(title) + '">' +
      '</div>' +
      '<div class="frame-title">' + MS.escapeHtml(title) + '</div>' +
    '</div>';
  }

  /* ── 灯箱 ── */
  function openLightbox(idx) {
    state.lightboxIndex = idx;
    els.lightbox.classList.add('open');
    els.lightbox.setAttribute('aria-hidden', 'false');
    d.body.style.overflow = 'hidden';
    showLightboxImage(idx);
  }

  function showLightboxImage(idx) {
    var list = state.filtered;
    if (idx < 0 || idx >= list.length) return;
    var it = list[idx];
    var src = webUrl('assets/cg/' + it.file);
    var title = it.title || it.id || '';

    // 淡出旧图
    els.lbImg.classList.remove('loaded');
    els.lbImg.style.opacity = '0';

    els.lbImg.onload = function () {
      els.lbImg.style.opacity = '1';
    };
    els.lbImg.onerror = function () {
      els.lbImg.onerror = null;
      els.lbImg.src = PLACEHOLDER;
      els.lbImg.style.opacity = '1';
    };
    els.lbImg.src = src;
    els.lbImg.alt = title;

    /* 水下溶解副本同步 (诺亚注水彩蛋用) */
    if (els.waterBleed) {
      els.waterBleed.style.backgroundImage = 'url("' + src.replace(/"/g, '%22') + '")';
    }

    els.lbCaption.textContent = title;
    els.lbCounter.textContent = (idx + 1) + ' / ' + list.length;

    // 原图下载 (R2 已配置且该条目有原图时显示; 支持 PNG / TGA 切换)
    if (els.lbDownloadRow) {
      if (state.r2Base && it.original) {
        els.lbDownloadRow.style.display = '';
        updateDownloadHref(it);
      } else {
        els.lbDownloadRow.style.display = 'none';
      }
    }

    // 预加载相邻图片
    preload(idx - 1);
    preload(idx + 1);
  }

  function preload(idx) {
    var list = state.filtered;
    if (idx < 0 || idx >= list.length) return;
    var img = new Image();
    img.src = webUrl('assets/cg/' + list[idx].file);
  }

  /* 原图下载地址: PNG 模式把 .tga 换成 .png, TGA 模式原样 */
  function updateDownloadHref(it) {
    var isTga = /\.tga$/i.test(it.original);
    var fmt = state.downloadFmt;
    if (fmt === 'tga' && !isTga) {
      fmt = 'png';
      state.downloadFmt = 'png';
    }
    els.lbFmtBtns.forEach(function (b) {
      var active = b.getAttribute('data-fmt') === fmt;
      b.classList.toggle('active', active);
      var dis = b.getAttribute('data-fmt') === 'tga' && !isTga;
      b.disabled = dis;
      b.classList.toggle('disabled', dis);
    });
    var rel = it.original.split('/').map(encodeURIComponent).join('/');
    if (fmt === 'png' && isTga) {
      rel = rel.replace(/\.tga$/i, '.png');
    }
    els.lbDownload.href = state.r2Base + '/' + rel;
  }

  function navLightbox(dir) {
    var list = state.filtered;
    if (!list.length) return;
    if (water.active) return;   // 注水进行中禁止切换
    state.lightboxIndex = (state.lightboxIndex + dir + list.length) % list.length;
    showLightboxImage(state.lightboxIndex);
  }

  function closeLightbox() {
    if (water.active) { cleanupWater(); removeWaterOverlay(); }
    els.lightbox.classList.remove('open');
    els.lightbox.setAttribute('aria-hidden', 'true');
    d.body.style.overflow = '';
    state.lightboxIndex = -1;
    // 清空 src 避免残留
    els.lbImg.removeAttribute('src');
    els.lbImg.alt = '';
    els.lbCaption.textContent = '';
    els.lbCounter.textContent = '';
    if (els.lbDownloadRow) els.lbDownloadRow.style.display = 'none';
    if (els.lbDownload) els.lbDownload.href = '#';
  }

  /* ── 错误状态 ── */
  function renderError(err) {
    els.filters.innerHTML = '';
    els.grid.innerHTML =
      '<div class="empty-state" style="grid-column:1/-1">' +
        '<div class="empty-icon">◇</div>' +
        '<div class="empty-text">CG数据加载失败</div>' +
        '<div style="margin-top:10px;font-size:12px;color:var(--fg3);font-family:\'Cormorant Garamond\',serif;font-style:italic">' +
          (err && err.message ? MS.escapeHtml(err.message) : '') +
        '</div>' +
      '</div>';
  }

  /* ── 启动 ── */
  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window, document);
