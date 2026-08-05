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
    lightboxIndex: -1
  };

  /* ── DOM 缓存 ── */
  var els = {};

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

    bindEvents();
    fetchData();
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
    if (els.lightbox) {
      els.lightbox.addEventListener('click', function (e) {
        if (e.target === els.lightbox) closeLightbox();
      });
    }

    // 键盘: ← → Esc
    d.addEventListener('keydown', function (e) {
      if (!els.lightbox || !els.lightbox.classList.contains('open')) return;
      if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); navLightbox(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); navLightbox(1); }
    });
  }

  /* ── 拉取数据 ── */
  function fetchData() {
    MS.fetchJSON('data/gallery-manifest.json', 15000)
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
        MS.hideSplash(1200);

        // URL 参数 ?open=ID 自动打开灯箱
        var openId = '';
        try {
          var params = new URLSearchParams(w.location.search);
          openId = params.get('open') || '';
        } catch (e) {}
        if (openId) {
          // 切到全部分类确保能找到目标
          state.activeCategory = 'all';
          state.searchQuery = '';
          applyFilter();
          for (var i = 0; i < state.filtered.length; i++) {
            if (state.filtered[i].id === openId) {
              openLightbox(i);
              break;
            }
          }
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
    var thumb = 'assets/cg/' + it.thumb;
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
    var src = 'assets/cg/' + it.file;
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

    els.lbCaption.textContent = title;
    els.lbCounter.textContent = (idx + 1) + ' / ' + list.length;

    // 预加载相邻图片
    preload(idx - 1);
    preload(idx + 1);
  }

  function preload(idx) {
    var list = state.filtered;
    if (idx < 0 || idx >= list.length) return;
    var img = new Image();
    img.src = 'assets/cg/' + list[idx].file;
  }

  function navLightbox(dir) {
    var list = state.filtered;
    if (!list.length) return;
    state.lightboxIndex = (state.lightboxIndex + dir + list.length) % list.length;
    showLightboxImage(state.lightboxIndex);
  }

  function closeLightbox() {
    els.lightbox.classList.remove('open');
    els.lightbox.setAttribute('aria-hidden', 'true');
    d.body.style.overflow = '';
    state.lightboxIndex = -1;
    // 清空 src 避免残留
    els.lbImg.removeAttribute('src');
    els.lbImg.alt = '';
    els.lbCaption.textContent = '';
    els.lbCounter.textContent = '';
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
