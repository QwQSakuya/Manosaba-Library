/* ═══════════════════════════════════════════════════
   records.js — 记录·规定 页逻辑
   依赖: shared.js (window.MS)
   ES5 兼容 (无箭头函数 / 无 const / let)
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
  var data = null;
  var loreById = {};
  var ruleById = {};
  var state = {
    tab: 'lore',         // 'lore' | 'rules'
    selectedLore: null,
    selectedRule: null,
    query: ''
  };

  /* ── DOM 引用 ── */
  var navEl = d.getElementById('index-nav');
  var selectEl = d.getElementById('index-select');
  var searchEl = d.getElementById('index-search');
  var contentEl = d.getElementById('records-content');

  /* ═══ 工具 ═══ */

  function escapeAttr(s) {
    return MS.escapeHtml(s).replace(/"/g, '&quot;');
  }

  function groupByCategory(list) {
    var groups = {};
    var order = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var cat = e.category || '其他';
      if (!groups[cat]) { groups[cat] = []; order.push(cat); }
      groups[cat].push(e);
    }
    return { order: order, groups: groups };
  }

  /* 判断条目是否匹配搜索词 (标题 / 别名 / 段落 / 规定条目) */
  function matchEntry(entry, q) {
    if (!q) return true;
    var ql = q.toLowerCase();
    var i;
    if (entry.title && entry.title.toLowerCase().indexOf(ql) !== -1) return true;
    if (entry.aliases) {
      for (i = 0; i < entry.aliases.length; i++) {
        if (String(entry.aliases[i]).toLowerCase().indexOf(ql) !== -1) return true;
      }
    }
    if (entry.paragraphs) {
      for (i = 0; i < entry.paragraphs.length; i++) {
        if (String(entry.paragraphs[i]).toLowerCase().indexOf(ql) !== -1) return true;
      }
    }
    if (entry.sections) {
      for (i = 0; i < entry.sections.length; i++) {
        var sec = entry.sections[i];
        if (sec.title && sec.title.toLowerCase().indexOf(ql) !== -1) return true;
        if (sec.items) {
          for (var j = 0; j < sec.items.length; j++) {
            if (String(sec.items[j]).toLowerCase().indexOf(ql) !== -1) return true;
          }
        }
      }
    }
    return false;
  }

  /* 当前标签下过滤后的列表 */
  function filteredList() {
    var src = state.tab === 'lore' ? data.lore : data.rules;
    var out = [];
    for (var i = 0; i < src.length; i++) {
      if (matchEntry(src[i], state.query)) out.push(src[i]);
    }
    return out;
  }

  /* ═══ 索引渲染 ═══ */

  function renderIndex() {
    renderNavList();
    renderSelect();
  }

  function renderNavList() {
    var list = filteredList();
    var html = '';
    if (list.length === 0) {
      html = '<div class="index-empty">无匹配条目</div>';
      navEl.innerHTML = html;
      return;
    }
    if (state.tab === 'lore') {
      var g = groupByCategory(list);
      for (var c = 0; c < g.order.length; c++) {
        var cat = g.order[c];
        html += '<div class="index-group">';
        html += '<h4 class="index-group-title">' + MS.escapeHtml(cat) + '</h4>';
        html += '<ul class="index-list">';
        var items = g.groups[cat];
        for (var k = 0; k < items.length; k++) {
          var e = items[k];
          var cls = (e.id === state.selectedLore) ? 'index-item active' : 'index-item';
          html += '<li class="' + cls + '" data-id="' + escapeAttr(e.id) + '" tabindex="0" role="button">' +
                  MS.escapeHtml(e.title) + '</li>';
        }
        html += '</ul></div>';
      }
    } else {
      html += '<div class="index-group">';
      html += '<h4 class="index-group-title">规定</h4>';
      html += '<ul class="index-list">';
      for (var r = 0; r < list.length; r++) {
        var rule = list[r];
        var rcls = (rule.id === state.selectedRule) ? 'index-item active' : 'index-item';
        html += '<li class="' + rcls + '" data-id="' + escapeAttr(rule.id) + '" tabindex="0" role="button">' +
                '<span class="roman-num">' + MS.escapeHtml(rule.num) + '</span>' +
                MS.escapeHtml(rule.title) + '</li>';
      }
      html += '</ul></div>';
    }
    navEl.innerHTML = html;
  }

  function renderSelect() {
    var list = filteredList();
    var html = '';
    if (list.length === 0) {
      html = '<option value="">无匹配条目</option>';
      selectEl.innerHTML = html;
      return;
    }
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var label = state.tab === 'lore'
        ? item.title
        : (item.num + '  ' + item.title);
      var sel = '';
      if (state.tab === 'lore' && item.id === state.selectedLore) sel = ' selected';
      else if (state.tab === 'rules' && item.id === state.selectedRule) sel = ' selected';
      html += '<option value="' + escapeAttr(item.id) + '"' + sel + '>' +
              MS.escapeHtml(label) + '</option>';
    }
    selectEl.innerHTML = html;
  }

  /* ═══ 内容渲染 ═══ */

  function renderLore(entry) {
    var html = '';
    html += '<article class="entry-panel book-texture">';

    /* 头部: 标题 / 别名 / 关联角色 */
    html += '<header class="entry-header">';
    html += '<h2 class="entry-title">' + MS.escapeHtml(entry.title) + '</h2>';
    if (entry.aliases && entry.aliases.length) {
      html += '<div class="entry-aliases">';
      for (var i = 0; i < entry.aliases.length; i++) {
        html += '<span class="alias-tag">' + MS.escapeHtml(entry.aliases[i]) + '</span>';
      }
      html += '</div>';
    }
    if (entry.characters && entry.characters.length) {
      html += '<div class="entry-chars">';
      for (var j = 0; j < entry.characters.length; j++) {
        var ch = entry.characters[j];
        var dotStyle = 'background:var(--char-' + escapeAttr(ch) + ')';
        html += '<span class="char-line">' +
                '<span class="char-dot" style="' + dotStyle + '"></span>' +
                MS.escapeHtml(ch) + '</span>';
      }
      html += '</div>';
    }
    html += '</header>';

    /* 正文段落 */
    html += '<div class="entry-body">';
    if (entry.paragraphs) {
      for (var p = 0; p < entry.paragraphs.length; p++) {
        html += '<p class="entry-para">' + MS.escapeHtml(entry.paragraphs[p]) + '</p>';
      }
    }
    html += '</div>';

    /* 相关条目 */
    if (entry.relatedTerms && entry.relatedTerms.length) {
      html += '<div class="entry-related">';
      html += '<span class="related-label">相关条目</span>';
      for (var t = 0; t < entry.relatedTerms.length; t++) {
        var termId = entry.relatedTerms[t];
        var ref = loreById[termId];
        var label = ref ? ref.title : termId;
        var dis = ref ? '' : ' disabled';
        html += '<button type="button" class="related-chip' + dis + '" data-jump="' +
                escapeAttr(termId) + '">' + MS.escapeHtml(label) + '</button>';
      }
      html += '</div>';
    }

    /* 来源 */
    html += renderSource(entry.source);

    html += '</article>';
    return html;
  }

  function renderRule(rule) {
    var html = '';
    html += '<article class="entry-panel book-texture">';

    /* 头部: 编号 + 标题 */
    html += '<header class="entry-header">';
    html += '<div class="rule-num-line"><span class="rule-num roman-num">规定 ' +
            MS.escapeHtml(rule.num) + '</span></div>';
    html += '<h2 class="entry-title">' + MS.escapeHtml(rule.title) + '</h2>';
    html += '</header>';

    /* 章节与条目 */
    html += '<div class="entry-body">';
    if (rule.sections) {
      for (var i = 0; i < rule.sections.length; i++) {
        var sec = rule.sections[i];
        html += '<h3 class="c-section-title">' + MS.escapeHtml(sec.title) + '</h3>';
        html += '<ul class="rule-items">';
        if (sec.items) {
          for (var j = 0; j < sec.items.length; j++) {
            html += '<li class="hex-bullet">' + MS.escapeHtml(sec.items[j]) + '</li>';
          }
        }
        html += '</ul>';
      }
    }
    html += '</div>';

    /* 来源 */
    html += renderSource(rule.source);

    html += '</article>';
    return html;
  }

  function renderSource(source) {
    if (!source || !source.length) return '';
    var html = '<footer class="entry-source">';
    html += '<span class="source-label">出处</span>';
    for (var i = 0; i < source.length; i++) {
      html += '<span class="source-tag">' + MS.escapeHtml(source[i]) + '</span>';
    }
    html += '</footer>';
    return html;
  }

  function emptyState(msg) {
    return '<div class="empty-state">' +
           '<div class="empty-icon">◇</div>' +
           '<div class="empty-text">' + MS.escapeHtml(msg) + '</div>' +
           '</div>';
  }

  function renderContent() {
    var html = '';
    if (state.tab === 'lore') {
      var entry = state.selectedLore ? loreById[state.selectedLore] : null;
      html = entry ? renderLore(entry) : emptyState('请从左侧选择一条记录');
    } else {
      var rule = state.selectedRule ? ruleById[state.selectedRule] : null;
      html = rule ? renderRule(rule) : emptyState('请从左侧选择一条规定');
    }
    contentEl.innerHTML = html;
    bindRelatedChips();
    /* GSAP 内容渐入 */
    if (window.MS && MS.gsapReady && MS.animateCardStagger) {
      MS.animateCardStagger(contentEl, '.entry-panel');
    }
    /* 内容区滚回顶部 */
    contentEl.scrollTop = 0;
    try { w.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (err) { w.scrollTo(0, 0); }
  }

  /* ═══ 交互 ═══ */

  function applyFade(cb) {
    contentEl.style.opacity = '0';
    setTimeout(function () {
      cb();
      contentEl.style.opacity = '1';
    }, 240);
  }

  function updateTabActive(tab) {
    var tabs = d.querySelectorAll('.tabbar .tab');
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      if (t.getAttribute('data-tab') === tab) t.classList.add('active');
      else t.classList.remove('active');
    }
  }

  function selectTab(tab, afterCb) {
    if (tab === state.tab) { if (afterCb) afterCb(); return; }
    applyFade(function () {
      state.tab = tab;
      state.query = '';
      if (searchEl) searchEl.value = '';
      updateTabActive(tab);
      if (tab === 'lore' && !state.selectedLore && data.lore.length) {
        state.selectedLore = data.lore[0].id;
      }
      if (tab === 'rules' && !state.selectedRule && data.rules.length) {
        state.selectedRule = data.rules[0].id;
      }
      renderIndex();
      renderContent();
      if (afterCb) afterCb();
    });
  }

  function selectIndex(id) {
    if (!id) return;
    if (state.tab === 'lore') state.selectedLore = id;
    else state.selectedRule = id;
    /* 更新索引高亮 */
    var items = navEl.querySelectorAll('.index-item');
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.getAttribute('data-id') === id) it.classList.add('active');
      else it.classList.remove('active');
    }
    /* 同步下拉 */
    if (selectEl.value !== id) selectEl.value = id;
    renderContent();
  }

  function scrollIndexIntoView(id) {
    /* ID 均为简单 slug, 无需 CSS.escape; 手动遍历兼容性最佳 */
    var all = navEl.querySelectorAll('.index-item');
    var item = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].getAttribute('data-id') === id) { item = all[i]; break; }
    }
    if (item && item.scrollIntoView) {
      try { item.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      catch (err) { item.scrollIntoView(); }
    }
  }

  /* 相关条目跳转 (始终跳到记录条目) */
  function jumpToLore(id) {
    if (!loreById[id]) return;
    state.selectedLore = id;
    if (state.tab !== 'lore') {
      selectTab('lore', function () { scrollIndexIntoView(id); });
    } else {
      renderIndex();
      renderContent();
      scrollIndexIntoView(id);
    }
  }

  /* 绑定相关条目点击 */
  function bindRelatedChips() {
    var chips = contentEl.querySelectorAll('.related-chip');
    for (var i = 0; i < chips.length; i++) {
      (function (chip) {
        chip.addEventListener('click', function () {
          if (chip.classList.contains('disabled')) return;
          var termId = chip.getAttribute('data-jump');
          jumpToLore(termId);
        });
      })(chips[i]);
    }
  }

  /* ═══ 事件绑定 ═══ */

  function bindEvents() {
    /* 标签切换 */
    var tabs = d.querySelectorAll('.tabbar .tab');
    for (var i = 0; i < tabs.length; i++) {
      (function (tab) {
        tab.addEventListener('click', function () {
          selectTab(tab.getAttribute('data-tab'));
        });
      })(tabs[i]);
    }

    /* 索引点击 / 键盘 (事件委托) */
    navEl.addEventListener('click', function (e) {
      var item = closestItem(e.target);
      if (!item) return;
      selectIndex(item.getAttribute('data-id'));
    });
    navEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var item = closestItem(e.target);
      if (!item) return;
      e.preventDefault();
      selectIndex(item.getAttribute('data-id'));
    });

    /* 移动端下拉切换 */
    selectEl.addEventListener('change', function () {
      selectIndex(this.value);
    });

    /* 搜索 (防抖) */
    var onSearch = MS.debounce(function () {
      state.query = (searchEl.value || '').trim();
      renderIndex();
    }, 220);
    searchEl.addEventListener('input', onSearch);
  }

  function closestItem(el) {
    while (el && el !== navEl) {
      if (el.classList && el.classList.contains('index-item')) return el;
      el = el.parentNode;
    }
    return null;
  }

  /* ═══ 初始化 ═══ */

  function init() {
    MS.restoreTheme();
    MS.injectBgLayer('bg-host');
    MS.initTheme();
    bindEvents();

    MS.fetchJSON('data/records.json', 12000)
      .then(function (json) {
        data = json;
        if (!data || !data.lore || !data.rules) {
          throw new Error('数据格式异常');
        }
        /* 构建查找表 */
        for (var i = 0; i < data.lore.length; i++) {
          loreById[data.lore[i].id] = data.lore[i];
        }
        for (var j = 0; j < data.rules.length; j++) {
          ruleById[data.rules[j].id] = data.rules[j];
        }
        /* 默认选中首项 */
        if (data.lore.length) state.selectedLore = data.lore[0].id;
        if (data.rules.length) state.selectedRule = data.rules[0].id;

        renderIndex();
        renderContent();
        MS.hideSplash(1200);
      })
      .catch(function (err) {
        contentEl.innerHTML = emptyState('数据加载失败，请稍后重试');
        navEl.innerHTML = '<div class="index-empty">索引不可用</div>';
        selectEl.innerHTML = '<option value="">索引不可用</option>';
        MS.hideSplash(600);
        MS.showToast('数据加载失败');
      });
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window, document);
