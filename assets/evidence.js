/* ═══════════════════════════════════════════════════
   evidence.js — 证物页逻辑 (ES5)
   依赖: shared.js (window.MS)
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

  /* ── 状态 ── */
  var allEvidence = [];
  var filters = { act: 'all', chapter: 'all', category: 'all' };
  var searchTerm = '';
  var chipEls = [];

  /* ── DOM ── */
  var grid = d.getElementById('evidence-grid');
  var filterbar = d.getElementById('evidence-filters');
  var drawer = d.getElementById('evidence-drawer');
  var backdrop = d.getElementById('drawer-backdrop');
  var drawerBody = d.getElementById('drawer-body');
  var closeBtn = d.getElementById('drawer-close');
  var searchInput = d.getElementById('evidence-search');

  /* ── 蜡封 SVG (卡片/抽屉共用) ── */
  function sealSvg(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 100 100" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="44" fill="hsl(348,62%,38%)"/>' +
      '<circle cx="50" cy="50" r="36" fill="none" stroke="hsla(0,0%,96%,0.25)" stroke-width="0.8"/>' +
      '<circle cx="50" cy="50" r="31" fill="none" stroke="hsla(0,0%,96%,0.2)" stroke-width="0.5" stroke-dasharray="1.6,2.6"/>' +
      '<g transform="translate(50,50)" fill="none" stroke="hsla(0,0%,96%,0.55)" stroke-width="1.4" stroke-linejoin="round">' +
      '<polygon points="0,-15 8.8,12.1 -14.2,-4.6 14.2,-4.6 -8.8,12.1"/></g></svg>';
  }

  /* ── 图片加载失败占位 (匕首剪影, currentColor 主题适配) ── */
  var PLACEHOLDER_SVG =
    '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M50,18 L50,70"/><path d="M34,40 L66,40"/><path d="M42,70 L50,80 L58,70"/></g></svg>';

  function attachImgFallback(img) {
    img.addEventListener('error', function () {
      if (img.getAttribute('data-fallback')) return;
      img.setAttribute('data-fallback', '1');
      var wrap = img.parentElement;
      if (!wrap) return;
      var ph = d.createElement('div');
      ph.className = 'img-placeholder';
      ph.innerHTML = PLACEHOLDER_SVG;
      img.style.display = 'none';
      wrap.appendChild(ph);
    });
  }

  /* ── 工具 ── */
  function romanAct(n) { return n === 1 ? 'Ⅰ' : n === 2 ? 'Ⅱ' : String(n); }
  function catalogCode(e) { return romanAct(e.act) + '·' + e.chapter + '·' + e.scene; }
  function esc(s) { return MS.escapeHtml(s == null ? '' : s); }

  function findById(id) {
    for (var i = 0; i < allEvidence.length; i++) {
      if (allEvidence[i].id === id) return allEvidence[i];
    }
    return null;
  }

  function distinctCategories() {
    var map = {};
    var i, k;
    for (i = 0; i < allEvidence.length; i++) {
      var cat = allEvidence[i].category;
      if (!cat) continue;
      map[cat] = (map[cat] || 0) + 1;
    }
    var arr = [];
    for (k in map) { if (map.hasOwnProperty(k)) arr.push({ name: k, count: map[k] }); }
    arr.sort(function (a, b) { return b.count - a.count || (a.name < b.name ? -1 : 1); });
    var out = [];
    for (i = 0; i < arr.length; i++) out.push(arr[i].name);
    return out;
  }

  /* ── 计数: 某维度取该值时, 在另两维筛选下的命中数 ── */
  function countFor(dim, value) {
    var n = 0;
    for (var i = 0; i < allEvidence.length; i++) {
      var e = allEvidence[i];
      if (dim !== 'act' && filters.act !== 'all' && String(e.act) !== filters.act) continue;
      if (dim !== 'chapter' && filters.chapter !== 'all' && String(e.chapter) !== filters.chapter) continue;
      if (dim !== 'category' && filters.category !== 'all' && e.category !== filters.category) continue;
      if (value === 'all') { n++; continue; }
      if (dim === 'act' && String(e.act) === value) n++;
      else if (dim === 'chapter' && String(e.chapter) === value) n++;
      else if (dim === 'category' && e.category === value) n++;
    }
    return n;
  }

  /* ── 筛选栏构建 ── */
  function chipHtml(dim, val, label) {
    return '<button class="chip" type="button" data-dim="' + dim + '" data-val="' + esc(val) + '">' +
      esc(label) + '<span class="chip-count">0</span></button>';
  }
  function groupHtml(dim, label, items) {
    var s = '<span class="filter-group"><span class="filter-label">' + label + '</span>';
    for (var i = 0; i < items.length; i++) {
      s += chipHtml(dim, items[i].val, items[i].label);
    }
    return s + '</span>';
  }
  function sepHtml() { return '<span class="filter-sep"></span>'; }

  function buildFilters() {
    var chList = [];
    for (var c = 1; c <= 6; c++) chList.push({ val: String(c), label: 'Ch' + c });
    var cats = distinctCategories();
    var catList = [{ val: 'all', label: '全部' }];
    for (var i = 0; i < cats.length; i++) catList.push({ val: cats[i], label: cats[i] });

    var html =
      groupHtml('act', '幕', [
        { val: 'all', label: '全部' },
        { val: '1', label: 'Act01' },
        { val: '2', label: 'Act02' }
      ]) + sepHtml() +
      groupHtml('chapter', '章', [{ val: 'all', label: '全部' }].concat(chList)) + sepHtml() +
      groupHtml('category', '类', catList);

    filterbar.innerHTML = html;
    chipEls = [];
    var chips = filterbar.querySelectorAll('.chip');
    for (var j = 0; j < chips.length; j++) {
      chipEls.push({
        el: chips[j],
        dim: chips[j].getAttribute('data-dim'),
        val: chips[j].getAttribute('data-val'),
        countEl: chips[j].querySelector('.chip-count')
      });
    }
    updateChips();
  }

  function updateChips() {
    for (var i = 0; i < chipEls.length; i++) {
      var c = chipEls[i];
      var cnt = countFor(c.dim, c.val);
      if (c.countEl) c.countEl.textContent = cnt;
      c.el.classList.toggle('active', filters[c.dim] === c.val);
      c.el.style.display = (c.val === 'all' || cnt > 0) ? '' : 'none';
    }
  }

  function bindFilters() {
    filterbar.addEventListener('click', function (ev) {
      var chip = ev.target;
      while (chip && chip !== filterbar && !chip.classList.contains('chip')) chip = chip.parentElement;
      if (!chip || !chip.classList || !chip.classList.contains('chip')) return;
      var dim = chip.getAttribute('data-dim');
      var val = chip.getAttribute('data-val');
      if (!dim) return;
      filters[dim] = val;
      updateChips();
      renderGrid();
    });
  }

  /* ── 搜索 ── */
  function bindSearch() {
    var handler = MS.debounce(function () {
      searchTerm = (searchInput.value || '').trim();
      renderGrid();
    }, 220);
    searchInput.addEventListener('input', handler);
  }

  /* ── 列表筛选 ── */
  function filteredList() {
    var q = searchTerm.toLowerCase();
    var out = [];
    for (var i = 0; i < allEvidence.length; i++) {
      var e = allEvidence[i];
      if (filters.act !== 'all' && String(e.act) !== filters.act) continue;
      if (filters.chapter !== 'all' && String(e.chapter) !== filters.chapter) continue;
      if (filters.category !== 'all' && e.category !== filters.category) continue;
      if (q) {
        var hay = (e.name + ' ' + e.nameZh + ' ' + e.id + ' ' + (e.category || '')).toLowerCase();
        if (hay.indexOf(q) === -1) continue;
      }
      out.push(e);
    }
    return out;
  }

  /* ── 卡片渲染 ── */
  function cardHtml(e) {
    var name = e.nameZh || e.name || e.id;
    return '<article class="item-card ev-card" data-id="' + esc(e.id) + '" tabindex="0" role="button" aria-label="' + esc(name) + '">' +
      '<div class="item-img-wrap">' +
        '<img data-src="' + MS.webUrl('assets/cg/evidence/' + e.sprite) + '" alt="' + esc(name) + '">' +
        sealSvg('card-seal') +
      '</div>' +
      '<div class="item-num"><span class="num-code">' + esc(catalogCode(e)) + '</span></div>' +
      '<div class="item-name">' + esc(name) + '</div>' +
      (e.category ? '<span class="item-cat">' + esc(e.category) + '</span>' : '') +
      '</article>';
  }

  function renderGrid() {
    var list = filteredList();
    if (!list.length) {
      grid.innerHTML = '<div class="empty-state">' +
        '<div class="empty-icon">✦</div>' +
        '<div class="empty-text">未找到符合条件的证物</div></div>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) html += cardHtml(list[i]);
    grid.innerHTML = html;

    var imgs = grid.querySelectorAll('img[data-src]');
    for (var j = 0; j < imgs.length; j++) attachImgFallback(imgs[j]);
    MS.lazyLoad(imgs);

    var cards = grid.querySelectorAll('.item-card');
    for (var k = 0; k < cards.length; k++) {
      (function (card) {
        card.addEventListener('click', function () { openDrawer(card.getAttribute('data-id')); });
        card.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openDrawer(card.getAttribute('data-id')); }
        });
      })(cards[k]);
    }

    /* 轻量错峰入场 */
    var entered = grid.querySelectorAll('.item-card');
    for (var m = 0; m < entered.length; m++) {
      (function (el, n) {
        setTimeout(function () { el.classList.add('entered'); }, Math.min(n * 18, 360));
      })(entered[m], m);
    }
  }

  /* ── 详情抽屉 ── */
  function metaTag(label, value) {
    return '<span class="meta-tag"><span class="mt-label">' + esc(label) + '</span>' + esc(value) + '</span>';
  }

  function drawerHtml(e) {
    var nameZh = e.nameZh || e.name || e.id;
    var nameEn = e.name || '';
    var related = e.relatedNodes || [];
    var relatedHtml = '';
    if (related.length) {
      for (var i = 0; i < related.length; i++) {
        var nodeId = related[i];
        var href = 'act0' + e.act + '.html#node-' + encodeURIComponent(nodeId);
        relatedHtml += '<a class="ev-related-node" href="' + href + '">' +
          '<span>' + esc(nodeId) + '</span>' +
          '<span class="rn-arrow">→</span></a>';
      }
    } else {
      relatedHtml = '<p class="ev-desc empty">暂无关联节点</p>';
    }

    var hasDesc = e.description && e.description.trim();
    var desc = hasDesc ? esc(e.description) : '暂无描述';

    return '<div class="ev-drawer-hero">' +
        '<span class="hero-num">' + esc(catalogCode(e)) + '</span>' +
        '<img src="' + MS.webUrl('assets/cg/evidence/' + e.sprite) + '" alt="' + esc(nameZh) + '">' +
        sealSvg('hero-seal') +
      '</div>' +
      '<div class="ev-drawer-content">' +
        '<div class="ev-name-block">' +
          '<span class="ev-name-zh">' + esc(nameZh) + '</span>' +
          (nameEn ? '<span class="ev-name-en">' + esc(nameEn) + '</span>' : '') +
        '</div>' +
        '<div class="ev-meta">' +
          metaTag('Act', e.act === 1 ? 'Act01' : 'Act02') +
          metaTag('Chapter', '第' + e.chapter + '章') +
          metaTag('Scene', '场景 ' + e.scene) +
          (e.category ? metaTag('Category', e.category) : '') +
        '</div>' +
        '<div class="ev-section">' +
          '<h4 class="ev-section-title">关联审判节点</h4>' +
          '<div class="ev-related-nodes">' + relatedHtml + '</div>' +
        '</div>' +
        '<div class="ev-section">' +
          '<h4 class="ev-section-title">描述</h4>' +
          '<p class="ev-desc' + (hasDesc ? '' : ' empty') + '">' + desc + '</p>' +
        '</div>' +
        '<div class="ev-id-line">ID · ' + esc(e.id) + '</div>' +
      '</div>';
  }

  function openDrawer(id) {
    var e = findById(id);
    if (!e) return;
    drawerBody.innerHTML = drawerHtml(e);
    var heroImg = drawerBody.querySelector('.ev-drawer-hero img');
    if (heroImg) attachImgFallback(heroImg);
    drawer.classList.add('open');
    backdrop.classList.add('show');
    drawer.setAttribute('aria-hidden', 'false');
    d.body.style.overflow = 'hidden';
    drawer.scrollTop = 0;
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    backdrop.classList.remove('show');
    drawer.setAttribute('aria-hidden', 'true');
    d.body.style.overflow = '';
  }

  function bindDrawer() {
    closeBtn.addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', closeDrawer);
    d.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
    });
  }

  /* ── 错误状态 ── */
  function showFetchError() {
    grid.innerHTML = '<div class="empty-state">' +
      '<div class="empty-icon">✦</div>' +
      '<div class="empty-text">证物数据加载失败</div></div>';
    filterbar.innerHTML = '';
    MS.showToast('证物数据加载失败');
  }

  /* ── 初始化 ── */
  function init() {
    MS.restoreTheme();
    MS.injectBgLayer('bg-host');
    MS.initTheme();
    bindDrawer();
    bindFilters();
    bindSearch();

    Promise.all([
      MS.fetchJSON('data/evidence.json', 15000),
      MS.loadR2Config(8000)
    ])
      .then(function (results) {
        allEvidence = (results[0] && results[0].evidence) || [];
        buildFilters();
        renderGrid();
        MS.hideSplash(1200);
      })
      .catch(function () {
        showFetchError();
        MS.hideSplash(1200);
      });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init);
  else init();

})(window, document);
