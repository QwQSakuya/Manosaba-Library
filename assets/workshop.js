/* ═══════════════════════════════════════════════════
   workshop.js — 立绘工坊逻辑 (懒加载模式)
   依赖: shared.js (window.MS)
   由 gallery.js 在 Tab 激活时调用 MSWorkshop.init()
   ES5 兼容 (var / function, 无箭头函数/const/let)
   ═══════════════════════════════════════════════════ */
(function (w, d) {
  'use strict';
  if (!w.MS) return;

  var SCALE = 100; // Unity 单位 → 像素 (pixelsToUnits)
  var PREFER = {
    eyes: ['Eyes_Normal_Open01', 'Eyes_Normal_Open'],
    mouth: ['Mouth_Normal_Open', 'Mouth_Normal_Closed'],
    cheeks: ['Cheeks_Normal', 'Cheeks_Flushed']
  };
  /* 多版本槽位：同一槽位只显示一个变体（默认选 01） */
  var SLOTS = [
    ['HeadBase', '头部基底'],
    ['FacialLineDrawing', '头发线稿'],
    ['HairB', '头发B'],
    ['OptionB_Head', '头部配饰']
  ];

  var els = {};
  var ctx = null;

  var state = {
    base: '',
    cross: false,
    chars: [],
    manifest: null,
    images: {},
    picks: {},
    maskHidden: true
  };

  function fmtName(name) {
    return name.replace(/_/g, ' ').replace(/ClippingMask/g, 'Mask').trim();
  }

  /* ── 暴露 init 供 gallery.js 调用 ── */
  w.MSWorkshop = {
    init: function () {
      els.chars = d.getElementById('ws-chars');
      els.canvas = d.getElementById('ws-canvas');
      els.controls = d.getElementById('ws-controls');
      els.maskToggle = d.getElementById('ws-mask-toggle');
      els.download = d.getElementById('ws-download');
      els.charName = d.getElementById('ws-char-name');
      if (!els.canvas || !els.chars) return;
      ctx = els.canvas.getContext('2d');

      /* 下载按钮 */
      els.download.addEventListener('click', function () {
        if (!state.manifest) return;
        var name = state.manifest.character || 'chara';
        els.download.disabled = true;
        els.canvas.toBlob(function (blob) {
          if (!blob) { els.download.disabled = false; return; }
          var a = d.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = name + '-portrait.png';
          d.body.appendChild(a);
          a.click();
          setTimeout(function () {
            URL.revokeObjectURL(a.href);
            a.remove();
            els.download.disabled = false;
          }, 300);
        }, 'image/png');
      });

      boot();
    }
  };

  function boot() {
    MS.fetchJSON('chara/index.json', 8000).then(function (chars) {
      state.base = '';
      state.cross = false;
      done(chars);
    }).catch(function () {
      // GitHub 备份站没有本地 chara 数据，回退到 R2 优选线路读取
      state.base = 'https://fast.manosaba-library.com/web';
      state.cross = true;
      MS.fetchJSON(state.base + '/chara/index.json?v=2', 15000).then(done).catch(function () {
        els.chars.innerHTML = '<p class="ws-note">角色数据加载失败，请稍后重试。</p>';
      });
    });
  }

  function done(chars) {
    state.chars = chars || [];
    renderChars();
    if (state.chars.length) selectChar(state.chars[0].name);
  }

  function renderChars() {
    els.chars.innerHTML = '';
    state.chars.forEach(function (c) {
      var b = d.createElement('button');
      b.type = 'button';
      b.className = 'ws-char';
      b.innerHTML = '<span>' + MS.escapeHtml(c.label || c.labelEn || c.name) + '</span><small>' + MS.escapeHtml(c.labelEn || '') + '</small>';
      b.addEventListener('click', function () { selectChar(c.name); });
      els.chars.appendChild(b);
    });
  }

  function selectChar(name) {
    Array.prototype.forEach.call(els.chars.children, function (b) {
      b.classList.toggle('active', b.textContent.indexOf(name) !== -1);
    });
    /* 更新角色名显示 */
    var charData = state.chars.filter(function (c) { return c.name === name; })[0];
    if (els.charName && charData) {
      els.charName.textContent = charData.label || charData.labelEn || charData.name;
    }
    state.images = {};
    state.picks = {};
    state.frame = null;
    els.controls.innerHTML = '<p class="ws-note">加载中…</p>';
    els.download.disabled = true;
    MS.fetchJSON(state.base + '/chara/' + name + '/manifest.json?v=2', 20000).then(function (m) {
      state.manifest = m;
      if (m.mode === 'frames' && m.frames && m.frames.length) {
        state.frame = m.frames[0].file;
      }
      initPicks(m);
      initVisibility(m);
      renderControls(m);
      compose();
    }).catch(function () {
      els.controls.innerHTML = '<p class="ws-note">该角色数据加载失败。</p>';
    });
  }

  function groupParts(m) {
    var g = {};
    (m.parts || []).forEach(function (p) {
      var cat = p.category || 'other';
      (g[cat] = g[cat] || []).push(p);
    });
    return g;
  }

  function pickDefault(list, prefer) {
    for (var i = 0; i < prefer.length; i++) {
      var hit = list.filter(function (p) { return p.name.indexOf(prefer[i]) === 0 || p.name === prefer[i]; });
      if (hit.length) return hit[0].name;
    }
    return list[0] ? list[0].name : null;
  }

  function slotName(name, slot) {
    var re = new RegExp('^' + slot + '(\\d*)$');
    return re.test(name);
  }

  function countHeadBaseVariants(m) {
    var n = 0;
    (m.parts || []).forEach(function (p) { if (slotName(p.name, 'HeadBase')) n++; });
    return n;
  }

  function initSlots(m) {
    state.picks.slots = {};
    SLOTS.forEach(function (s) {
      var key = s[0];
      var list = (m.parts || []).filter(function (p) { return slotName(p.name, key); });
      if (list.length < 2) return;
      var pick = null;
      list.forEach(function (p) { if (!pick && /01$/.test(p.name)) pick = p.name; });
      if (!pick) pick = list[0].name;
      state.picks.slots[key] = pick;
    });
  }

  /* ── 默认脸庞：头部基底有多版本时眼睛/嘴巴/脸颊选 02 风格，否则 01 ── */
  function initPicks(m) {
    var g = groupParts(m);
    var headMulti = countHeadBaseVariants(m) >= 2;
    var prefer = headMulti ? {
      eyes: ['Eyes_Normal_Open02', 'Eyes_Normal_Open01'],
      mouth: ['Mouth_Normal_Open02', 'Mouth_Normal_Open01', 'Mouth_Normal_Open'],
      cheeks: ['Cheeks_Flushed02', 'Cheeks_Normal02', 'Cheeks_Flushed', 'Cheeks_Normal']
    } : PREFER;
    state.picks = {
      eyes: pickDefault(g.eyes || [], prefer.eyes),
      mouth: pickDefault(g.mouth || [], prefer.mouth),
      cheeks: pickDefault(g.cheeks || [], prefer.cheeks)
    };
    initSlots(m);
  }

  /* ── 默认全部可见（遮罩除外）；多版本槽位只显示选中的变体 ── */
  function initVisibility(m) {
    state.visible = {};
    (m.parts || []).forEach(function (p) {
      state.visible[p.file] = !(p.category === 'mask');
    });
    Object.keys(state.picks.slots || {}).forEach(function (key) {
      var pick = state.picks.slots[key];
      (m.parts || []).forEach(function (p) {
        if (slotName(p.name, key)) state.visible[p.file] = (p.name === pick);
      });
    });
  }

  function renderControls(m) {
    if (m.mode === 'frames') {
      els.maskToggle.parentElement.style.display = 'none';
      var html = '<div class="ws-field"><label>动作</label><select id="ws-frame">';
      (m.frames || []).forEach(function (f) {
        var sel = f.file === state.frame ? ' selected' : '';
        html += '<option value="' + MS.escapeHtml(f.file) + '"' + sel + '>' + MS.escapeHtml(f.name) + '</option>';
      });
      html += '</select></div>';
      els.controls.innerHTML = html;
      var selEl = d.getElementById('ws-frame');
      if (selEl) {
        selEl.addEventListener('change', function () {
          state.frame = selEl.value;
          compose();
        });
      }
      return;
    }
    els.maskToggle.parentElement.style.display = '';
    var g = groupParts(m);
    var html = '';
    var labels = { eyes: '眼睛', mouth: '嘴巴', cheeks: '脸颊' };
    ['eyes', 'mouth', 'cheeks'].forEach(function (cat) {
      var list = g[cat] || [];
      if (!list.length) return;
      html += '<div class="ws-field"><label>' + labels[cat] + '</label><select data-cat="' + cat + '">';
      html += '<option value="">无</option>';
      list.forEach(function (p) {
        var sel = p.name === state.picks[cat] ? ' selected' : '';
        html += '<option value="' + MS.escapeHtml(p.name) + '"' + sel + '>' + MS.escapeHtml(fmtName(p.name)) + '</option>';
      });
      html += '</select></div>';
    });

    /* 多版本槽位（头部基底 / 头发等）单选 */
    Object.keys(state.picks.slots || {}).forEach(function (key) {
      var label = key;
      SLOTS.forEach(function (s) { if (s[0] === key) label = s[1]; });
      var list = (m.parts || []).filter(function (p) { return slotName(p.name, key); });
      if (list.length < 2) return;
      html += '<div class="ws-field"><label>' + label + '</label><select data-slot="' + key + '">';
      html += '<option value="">无</option>';
      list.forEach(function (p) {
        var sel = p.name === state.picks.slots[key] ? ' selected' : '';
        html += '<option value="' + MS.escapeHtml(p.name) + '"' + sel + '>' + MS.escapeHtml(fmtName(p.name)) + '</option>';
      });
      html += '</select></div>';
    });

    var sections = [
      ['body', '身体'],
      ['limb', '手 · 脚'],
      ['effect', '特效'],
      ['facial', '脸饰'],
      ['option', '配饰'],
      ['other', '其他']
    ];
    sections.forEach(function (sec) {
      var cat = sec[0], label = sec[1];
      var list = g[cat] || [];
      if (!list.length) return;
      html += '<div class="ws-group"><h3>' + label + '</h3>';
      list.forEach(function (p) {
        var checked = state.visible[p.file] !== false ? ' checked' : '';
        html += '<label class="ws-part"><input type="checkbox" data-file="' + MS.escapeHtml(p.file) + '"' + checked + '><span>' + MS.escapeHtml(fmtName(p.name)) + '</span></label>';
      });
      html += '</div>';
    });

    if (!state.maskHidden && (g.mask || []).length) {
      html += '<div class="ws-group"><h3>遮罩</h3>';
      (g.mask || []).forEach(function (p) {
        var checked = state.visible[p.file] !== false ? ' checked' : '';
        html += '<label class="ws-part"><input type="checkbox" data-file="' + MS.escapeHtml(p.file) + '"' + checked + '><span>' + MS.escapeHtml(fmtName(p.name)) + '</span></label>';
      });
      html += '</div>';
    }

    els.controls.innerHTML = html || '<p class="ws-note">该角色没有可设置的部件。</p>';
    Array.prototype.forEach.call(els.controls.querySelectorAll('select'), function (sel) {
      sel.addEventListener('change', function () {
        state.picks[sel.dataset.cat] = sel.value || null;
        compose();
      });
    });
    Array.prototype.forEach.call(els.controls.querySelectorAll('select[data-slot]'), function (sel) {
      sel.addEventListener('change', function () {
        var key = sel.getAttribute('data-slot');
        state.picks.slots[key] = sel.value || null;
        (state.manifest.parts || []).forEach(function (p) {
          if (slotName(p.name, key)) state.visible[p.file] = (p.name === state.picks.slots[key]);
        });
        compose();
      });
    });
    Array.prototype.forEach.call(els.controls.querySelectorAll('input[type=checkbox][data-file]'), function (cb) {
      cb.addEventListener('change', function () {
        state.visible[cb.dataset.file] = cb.checked;
        compose();
      });
    });
    els.maskToggle.addEventListener('change', function () {
      state.maskHidden = els.maskToggle.checked;
      renderControls(state.manifest);
    });
  }

  function activeParts(m) {
    var g = groupParts(m);
    var out = [];
    (m.parts || []).forEach(function (p) {
      var cat = p.category || 'other';
      if (cat === 'mask' && state.maskHidden) return;
      if (cat === 'eyes' || cat === 'mouth' || cat === 'cheeks') {
        // 表情三件套由下拉决定，不受可见性勾选影响
        if (!state.picks[cat] || p.name !== state.picks[cat]) return;
      } else if (state.visible[p.file] === false) {
        return;
      }
      out.push(p);
    });
    return out.sort(function (a, b) { return a.order - b.order; });
  }

  function loadImages(parts) {
    return Promise.all(parts.map(function (p) {
      if (state.images[p.file]) return Promise.resolve();
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () { state.images[p.file] = img; resolve(); };
        img.onerror = function () { state.images[p.file] = null; resolve(); };
        if (state.cross) {
          img.crossOrigin = 'anonymous';
          img.src = state.base + '/chara/' + state.manifest.character + '/' + p.file + '?v=2';
        } else {
          img.src = state.base + '/chara/' + state.manifest.character + '/' + p.file;
        }
      });
    }));
  }

  function compose() {
    if (!state.manifest) return;
    if (state.manifest.mode === 'frames') return composeFrame();
    var parts = activeParts(state.manifest);
    loadImages(parts).then(function () {
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      parts.forEach(function (p) {
        var img = state.images[p.file];
        if (!img) return;
        var w = img.width, h = img.height;
        var px = p.pos.x * SCALE, py = -p.pos.y * SCALE;
        var pivotX = (p.pivot && p.pivot[0] != null) ? p.pivot[0] : 0.5;
        var pivotY = (p.pivot && p.pivot[1] != null) ? p.pivot[1] : 0.5;
        var left = px - pivotX * w, top = py - pivotY * h;
        minX = Math.min(minX, left); maxX = Math.max(maxX, left + w);
        minY = Math.min(minY, top); maxY = Math.max(maxY, top + h);
      });
      if (!isFinite(minX)) return;
      var PAD = 250;
      var cw = Math.max(800, Math.ceil(maxX - minX) + PAD * 2);
      var ch = Math.max(1600, Math.ceil(maxY - minY) + PAD * 2);
      els.canvas.width = cw;
      els.canvas.height = ch;
      ctx.clearRect(0, 0, cw, ch);
      var ox = PAD - minX, oy = PAD - minY;
      parts.forEach(function (p) {
        var img = state.images[p.file];
        if (!img) return;
        var w = img.width, h = img.height;
        var px = p.pos.x * SCALE + ox, py = -p.pos.y * SCALE + oy;
        var pivotX = (p.pivot && p.pivot[0] != null) ? p.pivot[0] : 0.5;
        var pivotY = (p.pivot && p.pivot[1] != null) ? p.pivot[1] : 0.5;
        var alpha = (p.color && p.color[3] != null) ? p.color[3] : 1;
        ctx.globalAlpha = alpha;
        ctx.drawImage(img, px - pivotX * w, py - pivotY * h, w, h);
      });
      ctx.globalAlpha = 1;
      els.download.disabled = false;
    });
  }

  function composeFrame() {
    var f = (state.manifest.frames || []).filter(function (x) { return x.file === state.frame; })[0];
    if (!f) return;
    var img = state.images['frame:' + f.file];
    if (img) {
      drawFrame(img);
      return;
    }
    img = new Image();
    img.onload = function () {
      state.images['frame:' + f.file] = img;
      drawFrame(img);
    };
    img.onerror = function () { state.images['frame:' + f.file] = null; };
    if (state.cross) {
      img.crossOrigin = 'anonymous';
      img.src = state.base + '/chara/' + state.manifest.character + '/' + f.file + '?v=2';
    } else {
      img.src = state.base + '/chara/' + state.manifest.character + '/' + f.file;
    }
  }

  function drawFrame(img) {
    if (!img) return;
    els.canvas.width = img.width;
    els.canvas.height = img.height;
    ctx.clearRect(0, 0, img.width, img.height);
    ctx.drawImage(img, 0, 0);
    els.download.disabled = false;
  }

})(window, document);
