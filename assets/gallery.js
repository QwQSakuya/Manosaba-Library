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
    downloadFmt: 'png'   // 原图下载格式: 'png' | 'tga'
  };

  /* ── DOM 缓存 ── */
  var els = {};
  var workshopLoaded = false;

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

    // 键盘: ← → Esc
    d.addEventListener('keydown', function (e) {
      if (!els.lightbox || !els.lightbox.classList.contains('open')) return;
      if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); navLightbox(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); navLightbox(1); }
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
        return MS.fetchJSON('data/gallery-manifest.json', 15000);
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
