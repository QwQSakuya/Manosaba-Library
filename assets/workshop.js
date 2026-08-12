(function () {
  'use strict';
  if (!window.MS) return;
  MS.initTheme();

  var SCALE = 100; // Unity 单位 → 像素 (pixelsToUnits)
  var PREFER = {
    eyes: ['Eyes_Normal_Open01', 'Eyes_Normal_Open'],
    mouth: ['Mouth_Normal_Open', 'Mouth_Normal_Closed'],
    cheeks: ['Cheeks_Normal', 'Cheeks_Flushed']
  };

  var els = {
    chars: document.getElementById('ws-chars'),
    canvas: document.getElementById('ws-canvas'),
    controls: document.getElementById('ws-controls'),
    maskToggle: document.getElementById('ws-mask-toggle'),
    download: document.getElementById('ws-download')
  };
  var ctx = els.canvas.getContext('2d');

  var state = {
    chars: [],
    manifest: null,
    images: {},
    picks: {},
    maskHidden: true
  };

  function fmtName(name) {
    return name.replace(/_/g, ' ').replace(/ClippingMask/g, 'Mask').trim();
  }

  MS.fetchJSON('chara/index.json', 15000).then(function (chars) {
    state.chars = chars || [];
    renderChars();
    if (state.chars.length) selectChar(state.chars[0].name);
  }).catch(function () {
    els.chars.innerHTML = '<p class="ws-note">角色数据加载失败，请稍后重试。</p>';
  });

  function renderChars() {
    els.chars.innerHTML = '';
    state.chars.forEach(function (c) {
      var b = document.createElement('button');
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
    state.images = {};
    state.picks = {};
    els.controls.innerHTML = '<p class="ws-note">加载中…</p>';
    els.download.disabled = true;
    MS.fetchJSON('chara/' + name + '/manifest.json', 20000).then(function (m) {
      state.manifest = m;
      initPicks(m);
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

  function initPicks(m) {
    var g = groupParts(m);
    ['eyes', 'mouth', 'cheeks'].forEach(function (cat) {
      var list = g[cat] || [];
      state.picks[cat] = pickDefault(list, PREFER[cat] || []);
    });
  }

  function renderControls(m) {
    var g = groupParts(m);
    var html = '';
    var labels = { eyes: '眼睛', mouth: '嘴巴', cheeks: '脸颊' };
    ['eyes', 'mouth', 'cheeks'].forEach(function (cat) {
      var list = g[cat] || [];
      if (!list.length) return;
      html += '<div class="ws-field"><label>' + labels[cat] + '</label><select data-cat="' + cat + '">';
      list.forEach(function (p) {
        var sel = p.name === state.picks[cat] ? ' selected' : '';
        html += '<option value="' + MS.escapeHtml(p.name) + '"' + sel + '>' + MS.escapeHtml(fmtName(p.name)) + '</option>';
      });
      html += '</select></div>';
    });
    els.controls.innerHTML = html || '<p class="ws-note">该角色没有可切换的表情部件。</p>';
    Array.prototype.forEach.call(els.controls.querySelectorAll('select'), function (sel) {
      sel.addEventListener('change', function () {
        state.picks[sel.dataset.cat] = sel.value;
        compose();
      });
    });
    els.maskToggle.addEventListener('change', function () {
      state.maskHidden = els.maskToggle.checked;
      compose();
    });
  }

  function activeParts(m) {
    var g = groupParts(m);
    var out = [];
    (m.parts || []).forEach(function (p) {
      var cat = p.category || 'other';
      if (cat === 'mask' && state.maskHidden) return;
      if (cat === 'eyes' || cat === 'mouth' || cat === 'cheeks') {
        if (p.name !== state.picks[cat]) return;
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
        img.src = 'chara/' + state.manifest.character + '/' + p.file;
      });
    }));
  }

  function compose() {
    if (!state.manifest) return;
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
      var cw = Math.max(800, Math.ceil(maxX - minX) + 200);
      var ch = Math.max(1600, Math.ceil(maxY - minY) + 200);
      els.canvas.width = cw;
      els.canvas.height = ch;
      ctx.clearRect(0, 0, cw, ch);
      var cx = cw / 2, cy = ch / 2;
      parts.forEach(function (p) {
        var img = state.images[p.file];
        if (!img) return;
        var w = img.width, h = img.height;
        var px = p.pos.x * SCALE + cx, py = -p.pos.y * SCALE + cy;
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

  els.download.addEventListener('click', function () {
    if (!state.manifest) return;
    var name = state.manifest.character || 'chara';
    els.download.disabled = true;
    els.canvas.toBlob(function (blob) {
      if (!blob) { els.download.disabled = false; return; }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name + '-portrait.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
        a.remove();
        els.download.disabled = false;
      }, 300);
    }, 'image/png');
  });
})();
