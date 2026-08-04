/* ═══════════════════════════════════════════════════
   shared.js — 跨页共享脚本
   暴露 window.MS 工具集:
     restoreTheme / initTheme / hideSplash
     injectBgLayer / fetchJSON / showToast
     lazyLoad / debounce / escapeHtml / $ / $$
   图谱页 (app.js) 不依赖此文件; 落地页+内容页引用.
   ═══════════════════════════════════════════════════ */
(function (w, d) {
  'use strict';

  var MS = {};

  /* ── 主题恢复 (兜底; 应在 <head> 内联提前执行防 FOUC) ── */
  MS.restoreTheme = function () {
    try {
      var saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') {
        d.documentElement.setAttribute('data-theme', saved);
      }
    } catch (e) { /* localStorage 不可用时静默 */ }
  };

  /* ── 主题切换按钮绑定 ── */
  MS.initTheme = function (toggleId) {
    var toggle = d.getElementById(toggleId || 'theme-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', function () {
      var html = d.documentElement;
      var current = html.getAttribute('data-theme');
      var next = current === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  };

  /* ── 隐藏开屏动画 ──
     minMs: 最短展示时长 (ms), 不足则延迟隐藏 */
  MS.hideSplash = function (minMs) {
    var splash = d.getElementById('splash');
    if (!splash) return;
    if (minMs && minMs > 0) {
      var elapsed = performance.now() - (MS._splashStart || 0);
      var delay = Math.max(0, minMs - elapsed);
      setTimeout(function () { splash.classList.add('hide'); }, delay);
    } else {
      splash.classList.add('hide');
    }
  };
  MS._splashStart = performance.now();

  /* ── 背景装饰层注入 ──
     host: 容器元素或 id 字符串. 若为空则创建 fixed .bg-layer 插入 body 首.
     装饰性内容标记 aria-hidden, JS 失败时页面仍可正常使用. */
  var BUTTERFLY_PATH =
    '<g fill="currentColor">' +
    '<path d="M60,50 C42,22 12,16 6,32 C0,48 16,58 32,56 C46,54 56,52 60,50 Z"/>' +
    '<path d="M60,50 C78,22 108,16 114,32 C120,48 104,58 88,56 C74,54 64,52 60,50 Z"/>' +
    '<path d="M60,50 C50,56 32,66 28,82 C25,92 38,90 48,80 C56,72 58,60 60,50 Z"/>' +
    '<path d="M60,50 C70,56 88,66 92,82 C95,92 82,90 72,80 C64,72 62,60 60,50 Z"/>' +
    '<ellipse cx="60" cy="50" rx="1.4" ry="18"/>' +
    '<path d="M59,33 Q54,24 49,21" fill="none" stroke="currentColor" stroke-width="0.8"/>' +
    '<path d="M61,33 Q66,24 71,21" fill="none" stroke="currentColor" stroke-width="0.8"/>' +
    '</g>';

  var MAGIC_CIRCLE_SVG =
    '<svg class="magic-circle" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">' +
    '<g fill="none" stroke="currentColor" stroke-linecap="round">' +
    '<circle cx="300" cy="300" r="292" stroke-width="0.8"/>' +
    '<circle cx="300" cy="300" r="278" stroke-width="0.4"/>' +
    '<circle cx="300" cy="300" r="250" stroke-width="0.6"/>' +
    '<circle cx="300" cy="300" r="200" stroke-width="0.5"/>' +
    '<circle cx="300" cy="300" r="150" stroke-width="0.6"/>' +
    '<circle cx="300" cy="300" r="100" stroke-width="0.5"/>' +
    '<circle cx="300" cy="300" r="52"  stroke-width="0.8"/>' +
    '<g stroke-width="0.35">' +
    '<line x1="300" y1="8"   x2="300" y2="592"/>' +
    '<line x1="8"   y1="300" x2="592" y2="300"/>' +
    '<line x1="92"  y1="92"  x2="508" y2="508"/>' +
    '<line x1="508" y1="92"  x2="92"  y2="508"/>' +
    '<line x1="160" y1="35"  x2="440" y2="565"/>' +
    '<line x1="440" y1="35"  x2="160" y2="565"/>' +
    '<line x1="35"  y1="160" x2="565" y2="440"/>' +
    '<line x1="565" y1="160" x2="35"  y2="440"/>' +
    '</g>' +
    '<polygon points="300,75 480,393 120,393" stroke-width="0.7"/>' +
    '<polygon points="300,525 120,207 480,207" stroke-width="0.7"/>' +
    '<polygon points="300,140 433,237 382,395 218,395 167,237" stroke-width="0.5"/>' +
    '<circle cx="300" cy="8"   r="2.5" fill="currentColor"/>' +
    '<circle cx="300" cy="592" r="2.5" fill="currentColor"/>' +
    '<circle cx="8"   cy="300" r="2.5" fill="currentColor"/>' +
    '<circle cx="592" cy="300" r="2.5" fill="currentColor"/>' +
    '</g></svg>';

  var MAGIC_CIRCLE_INNER_SVG =
    '<svg class="magic-circle-inner" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">' +
    '<g fill="none" stroke="currentColor" stroke-linecap="round">' +
    '<circle cx="200" cy="200" r="192" stroke-width="0.6"/>' +
    '<circle cx="200" cy="200" r="162" stroke-width="0.4"/>' +
    '<circle cx="200" cy="200" r="108" stroke-width="0.5"/>' +
    '<polygon points="200,38 340,282 60,282" stroke-width="0.6"/>' +
    '<polygon points="200,362 60,118 340,118" stroke-width="0.6"/>' +
    '</g></svg>';

  function butterflySvg(cls) {
    return '<svg class="butterfly ' + cls + '" viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">' + BUTTERFLY_PATH + '</svg>';
  }

  MS.injectBgLayer = function (host) {
    var el = typeof host === 'string' ? d.getElementById(host) : host;
    if (!el) {
      el = d.createElement('div');
      el.className = 'bg-layer';
      el.setAttribute('aria-hidden', 'true');
      d.body.insertBefore(el, d.body.firstChild);
    } else if (!el.classList.contains('bg-layer')) {
      el.classList.add('bg-layer');
    }
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="bg-gradient"></div>' +
      '<div class="bg-blood"></div>' +
      '<div class="bg-grain"></div>' +
      MAGIC_CIRCLE_SVG +
      MAGIC_CIRCLE_INNER_SVG +
      butterflySvg('butterfly-1') +
      butterflySvg('butterfly-2') +
      butterflySvg('butterfly-3') +
      butterflySvg('butterfly-4');
  };

  /* ── fetchJSON: 带 timeout 与错误信息的 JSON 加载 ── */
  MS.fetchJSON = function (url, timeoutMs) {
    var controller = null;
    var signal = undefined;
    if (w.AbortController) {
      controller = new AbortController();
      signal = controller.signal;
    }
    var timer = null;
    if (controller && timeoutMs) {
      timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    }
    return fetch(url, { signal: signal })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + url);
        return res.json();
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        if (err && err.name === 'AbortError') throw new Error('请求超时 — ' + url);
        throw err;
      });
  };

  /* ── showToast: 底部居中 toast 提示 ──
     自动创建 #toast-host 容器; 同一时间仅显示一条. */
  var _toastTimer = null;
  MS.showToast = function (msg, duration) {
    var host = d.getElementById('toast-host');
    if (!host) {
      host = d.createElement('div');
      host.id = 'toast-host';
      d.body.appendChild(host);
    }
    host.textContent = msg;
    host.classList.add('show');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () {
      host.classList.remove('show');
    }, duration || 2400);
  };

  /* ── lazyLoad: IntersectionObserver 懒加载 <img data-src> ──
     传入 img 元素数组或 NodeList; 不支持 IO 时直接加载. */
  MS.lazyLoad = function (elements) {
    var imgs = elements && elements.length ? Array.prototype.slice.call(elements) : [elements];
    if (!('IntersectionObserver' in w)) {
      imgs.forEach(function (img) {
        var src = img.getAttribute('data-src');
        if (src) img.src = src;
      });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          var src = img.getAttribute('data-src');
          if (src) { img.src = src; img.removeAttribute('data-src'); }
          io.unobserve(img);
        }
      });
    }, { rootMargin: '200px 0px', threshold: 0.01 });
    imgs.forEach(function (img) { if (img) io.observe(img); });
  };

  /* ── debounce ── */
  MS.debounce = function (fn, wait) {
    var timer = null;
    return function () {
      var ctx = this, args = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait || 200);
    };
  };

  /* ── escapeHtml ── */
  var _escEl = d.createElement('div');
  MS.escapeHtml = function (str) {
    if (str == null) return '';
    _escEl.textContent = String(str);
    return _escEl.innerHTML;
  };

  /* ── $ / $$ — querySelector 简写 ── */
  MS.$  = function (sel, parent) { return (parent || d).querySelector(sel); };
  MS.$$ = function (sel, parent) { return Array.prototype.slice.call((parent || d).querySelectorAll(sel)); };

  w.MS = MS;
})(window, document);
