/* ═══════════════════════════════════════════════════
   archive.js — 全素材库 页面逻辑
   依赖: shared.js (window.MS) + data/raw-index.json + data/r2-config.json
   ES5 兼容 (var / function)
   ═══════════════════════════════════════════════════ */
(function (w, d) {
  'use strict';

  var MS = w.MS;
  if (!MS) {
    var _sp = d.getElementById('splash');
    if (_sp) _sp.classList.add('hide');
    return;
  }

  var ICON_DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  var PAGE_SIZE = 200;

  var state = {
    baseUrl: '',
    files: [],
    filtered: [],
    type: 'all',
    query: '',
    page: 1
  };

  var els = {};

  function $(id) { return d.getElementById(id); }
  function esc(s) { return MS.escapeHtml(s); }

  function fmtSize(b) {
    if (b == null || isNaN(b) || b < 0) return '—';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
  }

  function classify(path) {
    var p = path.toLowerCase();
    if (p.indexOf('/audio/voice/') !== -1) return '语音';
    if (p.indexOf('/audio/bgm/') !== -1) return 'BGM';
    if (p.indexOf('/audio/sfx/') !== -1) return '音效';
    if (p.indexOf('.tga') !== -1 || p.indexOf('.png') !== -1 || p.indexOf('.webp') !== -1) return '图片';
    if (p.indexOf('.m4v') !== -1 || p.indexOf('.mp4') !== -1) return '视频';
    if (p.indexOf('.glb') !== -1 || p.indexOf('.fbx') !== -1) return '模型';
    if (p.indexOf('.otf') !== -1 || p.indexOf('.ttf') !== -1) return '字体';
    if (p.indexOf('.ogg') !== -1 || p.indexOf('.wav') !== -1 || p.indexOf('.mp3') !== -1) return '音频';
    return '数据/脚本';
  }

  function typeFilter(item) {
    if (state.type === 'all') return true;
    if (state.type === '图片') {
      return item.type === '图片';
    }
    return item.type === state.type;
  }

  function applyFilter() {
    var q = state.query.toLowerCase();
    state.filtered = [];
    for (var i = 0; i < state.files.length; i++) {
      var it = state.files[i];
      if (!typeFilter(it)) continue;
      if (q && it.path.toLowerCase().indexOf(q) === -1) continue;
      state.filtered.push(it);
    }
    state.page = 1;
    renderCount();
    renderTable();
    renderPager();
  }

  function renderCount() {
    var total = state.filtered.length;
    var files = state.files.length;
    var txt = '共 ' + total.toLocaleString() + ' 个文件';
    if (state.type !== 'all' || state.query) {
      txt += ' / 全部 ' + files.toLocaleString();
    }
    els.count.textContent = txt;
    els.meta.textContent = '全量原始素材 ' + files.toLocaleString() + ' 个文件 · 约 12.36 GB · 文件直接来自游戏原始数据';
  }

  function r2Url(path) {
    var segs = path.split('/');
    for (var i = 0; i < segs.length; i++) {
      segs[i] = encodeURIComponent(segs[i]);
    }
    return state.baseUrl + '/' + segs.join('/');
  }

  function renderTable() {
    var start = (state.page - 1) * PAGE_SIZE;
    var slice = state.filtered.slice(start, start + PAGE_SIZE);
    var html = '';
    if (!slice.length) {
      html = '<tr><td colspan="4"><div class="arc-note">没有匹配的文件</div></td></tr>';
    } else {
      for (var i = 0; i < slice.length; i++) {
        var it = slice[i];
        var href = r2Url(it.path);
        html +=
          '<tr>' +
            '<td class="arc-path" title="' + esc(it.path) + '">' + esc(it.path) + '</td>' +
            '<td><span class="arc-type">' + esc(it.type) + '</span></td>' +
            '<td class="arc-size">' + fmtSize(it.bytes) + '</td>' +
            '<td><a class="arc-dl" href="' + esc(href) + '" target="_blank" rel="noopener" download>' + ICON_DL + '下载</a></td>' +
          '</tr>';
      }
    }
    els.body.innerHTML = html;
    /* GSAP 表格行渐入 */
    if (window.MS && MS.gsapReady && MS.animateCardStagger) {
      MS.animateCardStagger(els.body, 'tr');
    }
  }

  function renderPager() {
    var pages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    els.pageInfo.textContent = '第 ' + state.page + ' / ' + pages + ' 页';
    els.prev.disabled = state.page <= 1;
    els.next.disabled = state.page >= pages;
  }

  function renderChips() {
    var types = ['all', '图片', '语音', 'BGM', '音效', '视频', '模型', '字体', '数据/脚本'];
    var labels = { all: '全部' };
    var html = '';
    for (var i = 0; i < types.length; i++) {
      var t = types[i];
      var count = 0;
      if (t === 'all') {
        count = state.files.length;
      } else {
        for (var j = 0; j < state.files.length; j++) {
          if (state.files[j].type === t) count++;
        }
      }
      var active = state.type === t ? ' active' : '';
      html += '<button class="chip' + active + '" type="button" data-type="' + esc(t) + '">' +
        esc(labels[t] || t) + '<span class="chip-count">' + count.toLocaleString() + '</span></button>';
    }
    els.filters.innerHTML = html;

    var chips = MS.$$('.chip', els.filters);
    for (var k = 0; k < chips.length; k++) {
      (function (chip) {
        chip.addEventListener('click', function () {
          state.type = chip.getAttribute('data-type');
          renderChips();
          applyFilter();
        });
      })(chips[k]);
    }
  }

  function init() {
    MS.restoreTheme();
    MS.injectBgLayer('bg-host');
    MS.initTheme();

    els.meta = $('archive-meta');
    els.filters = $('archive-filters');
    els.search = $('archive-search');
    els.searchInline = $('archive-search-inline');
    els.count = $('archive-count');
    els.body = $('archive-body');
    els.pageInfo = $('arc-page-info');
    els.prev = $('arc-prev');
    els.next = $('arc-next');

    els.prev.addEventListener('click', function () {
      if (state.page > 1) { state.page--; renderTable(); renderPager(); }
    });
    els.next.addEventListener('click', function () {
      var pages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
      if (state.page < pages) { state.page++; renderTable(); renderPager(); }
    });
    els.search.addEventListener('input', function () {
      state.query = els.search.value;
      applyFilter();
    });
    els.searchInline.addEventListener('input', function () {
      state.query = els.searchInline.value;
      els.search.value = els.searchInline.value;
      applyFilter();
    });

    MS.fetchJSON('data/r2-config.json', 8000)
      .then(function (cfg) {
        state.baseUrl = ((cfg && cfg.baseUrl) || '').replace(/\/+$/, '');
        return MS.fetchJSON('data/raw-index.json', 30000);
      })
      .then(function (data) {
        var files = (data && data.files) || [];
        for (var i = 0; i < files.length; i++) {
          files[i].type = classify(files[i].path);
        }
        state.files = files;
        if (!state.baseUrl) {
          els.meta.textContent = 'R2 地址未配置，文件暂不可下载';
        }
        renderChips();
        applyFilter();
        MS.hideSplash(1000);
      })
      .catch(function () {
        els.body.innerHTML = '<tr><td colspan="4"><div class="arc-note">素材索引加载失败</div></td></tr>';
        MS.hideSplash(800);
      });
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);
