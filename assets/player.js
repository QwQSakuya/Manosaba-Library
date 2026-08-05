/* ═══════════════════════════════════════════════════
   player.js — 弹出播放器页逻辑
   依赖: shared.js (window.MS, 可选; 有兜底)
   ES5 兼容 (var / function, 无箭头/const/let/模板串)
   功能: 切歌/自动切歌/循环(顺序·列表·单曲)/暂停/进度条拖动/音量
         Media Session API / BroadcastChannel 跨窗口同步
   ═══════════════════════════════════════════════════ */
(function (w, d) {
  'use strict';

  var MS = w.MS;

  /* ── 兜底工具 (shared.js 缺失时) ── */
  function esc(s) {
    if (s == null) return '';
    if (MS && MS.escapeHtml) return MS.escapeHtml(s);
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fetchJSON(url, timeoutMs) {
    if (MS && MS.fetchJSON) return MS.fetchJSON(url, timeoutMs);
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function toast(msg) { if (MS && MS.showToast) MS.showToast(msg); }

  /* ── 图标 ── */
  var ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  /* ── 状态 ── */
  var state = {
    manifest: null,
    list: [],        /* manifest.bgm 引用 */
    index: -1,       /* 当前曲下标 */
    mode: 'order',   /* 'order' | 'list' | 'single' */
    playing: false,
    volume: 1,
    dragging: false
  };

  /* ── 元素 ── */
  var audio = null;
  var elTitle, elMeta, elProgress, elFill, elThumb, elCur, elDur;
  var elPlay, elPlayIcon, elPauseIcon, elPrev, elNext, elMode;
  var elVol, elList, elBody;

  /* ═══ 工具 ═══ */
  function $(id) { return d.getElementById(id); }

  function formatTime(sec) {
    if (sec == null || isNaN(sec) || sec < 0 || !isFinite(sec)) sec = 0;
    sec = Math.floor(sec);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ES5 安全的 URL 查询解析 (不用 URLSearchParams) */
  function getParam(name) {
    var q = w.location.search;
    if (!q || q.length < 2) return '';
    q = q.substring(1);
    var pairs = q.split('&');
    for (var i = 0; i < pairs.length; i++) {
      var idx = pairs[i].indexOf('=');
      var k = idx < 0 ? pairs[i] : pairs[i].substring(0, idx);
      var v = idx < 0 ? '' : pairs[i].substring(idx + 1);
      k = decodeURIComponent(k.replace(/\+/g, ' '));
      v = decodeURIComponent(v.replace(/\+/g, ' '));
      if (k === name) return v;
    }
    return '';
  }

  function resolveSrc(item) {
    if (!item || !item.file) return '';
    return 'assets/audio/' + item.file;
  }

  /* ═══ BroadcastChannel 广播 + localStorage 降级 ═══ */
  var bc = null;
  try { bc = new BroadcastChannel('ms_player'); } catch (e) {}

  function broadcast(msg) {
    msg.src = 'popup';
    if (bc) { try { bc.postMessage(msg); } catch (e) {} }
    /* 降级: 写 localStorage 触发其它窗口 storage 事件 */
    try { localStorage.setItem('ms_player_state', JSON.stringify(msg)); } catch (e) {}
  }

  function snapshot() {
    var it = state.list[state.index];
    return {
      id: it ? it.id : '',
      title: it ? (it.label || it.id) : '',
      meta: it ? ('音乐 · ' + (it.category || 'BGM')) : '',
      playing: state.playing,
      mode: state.mode,
      index: state.index
    };
  }

  function broadcastState() { broadcast({ type: 'state', state: snapshot() }); }

  /* 进度广播节流 (1s) */
  var lastProgTs = 0;
  function broadcastProgress() {
    var now = Date.now();
    if (now - lastProgTs < 950) return;
    lastProgTs = now;
    broadcast({
      type: 'progress',
      cur: audio.currentTime || 0,
      dur: (audio.duration && !isNaN(audio.duration)) ? audio.duration : 0
    });
  }

  /* 接收来自主站的消息 */
  function onMessage(m) {
    if (!m || m.src === 'popup') return;
    switch (m.type) {
      case 'request':
        if (m.action === 'play') resume();
        else if (m.action === 'pause') pause();
        else if (m.action === 'next') next();
        else if (m.action === 'prev') prev();
        else if (m.action === 'mode') cycleMode();
        else if (m.action === 'seek') { if (audio.duration && !isNaN(audio.duration)) { try { audio.currentTime = m.value; } catch (e) {} } }
        else if (m.action === 'volume') { audio.volume = m.value; state.volume = m.value; elVol.value = m.value; }
        break;
      case 'play-bgm':
        playById(m.id);
        break;
      case 'page-audio-start':
        /* 主站页内 SFX/voice 开始 → 暂停 BGM */
        if (state.playing) pause();
        break;
      case 'ping':
        broadcast({ type: 'pong', state: snapshot() });
        break;
    }
  }
  if (bc) {
    bc.onmessage = function (e) { onMessage(e.data); };
  }
  w.addEventListener('storage', function (e) {
    if (e.key === 'ms_player_state' && e.newValue) {
      try { onMessage(JSON.parse(e.newValue)); } catch (err) {}
    }
  });

  /* ═══ 渲染列表 ═══ */
  function renderList() {
    if (!state.list.length) {
      elList.innerHTML = '<div class="pp-empty">暂无音乐</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < state.list.length; i++) {
      var it = state.list[i];
      var isActive = (i === state.index);
      var disabled = !it.file;
      var num = (i + 1 < 10 ? '0' : '') + (i + 1);
      html +=
        '<div class="pp-item' + (isActive ? ' active' : '') + (disabled ? ' disabled' : '') + '" ' +
          'data-pp-index="' + i + '"' + (disabled ? ' aria-disabled="true"' : ' tabindex="0" role="button"') + '>' +
          '<span class="pp-item-num">' + num + '</span>' +
          '<span class="pp-item-cat">' + esc(it.category || '') + '</span>' +
          '<span class="pp-item-name">' + esc(it.label || it.id) + '</span>' +
          '<span class="pp-item-icon">' + (isActive && state.playing ? ICON_PAUSE : ICON_PLAY) + '</span>' +
        '</div>';
    }
    elList.innerHTML = html;
  }

  /* ═══ 播放控制 ═══ */
  function loadIndex(i, autoplay) {
    if (i < 0 || i >= state.list.length) return;
    var it = state.list[i];
    if (!it.file) {
      toast('该曲目暂无音频文件');
      return;
    }
    state.index = i;
    audio.src = resolveSrc(it);
    elTitle.textContent = it.label || it.id;
    elMeta.textContent = '音乐 · ' + (it.category || 'BGM');
    elFill.style.width = '0%';
    elCur.textContent = '0:00';
    elDur.textContent = '0:00';
    renderList();
    updateMediaSession();
    if (autoplay) {
      var p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(function () { setPlaying(true); }).catch(function () { setPlaying(false); });
      } else {
        setPlaying(true);
      }
    }
    broadcastState();
  }

  function playById(id) {
    for (var i = 0; i < state.list.length; i++) {
      if (state.list[i].id === id) { loadIndex(i, true); return; }
    }
    /* 未找到则播第一首 */
    if (state.list.length) loadIndex(0, true);
  }

  function resume() {
    if (state.index < 0) { if (state.list.length) loadIndex(0, true); return; }
    var p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(function () { setPlaying(true); }).catch(function () { setPlaying(false); });
    } else { setPlaying(true); }
  }

  function pause() {
    audio.pause();
    setPlaying(false);
  }

  function next() {
    if (!state.list.length) return;
    var n = state.index + 1;
    if (n >= state.list.length) n = 0;
    /* 跳过无文件的曲目 */
    var guard = 0;
    while (!state.list[n].file && guard < state.list.length) { n = (n + 1) % state.list.length; guard++; }
    loadIndex(n, true);
  }

  function prev() {
    if (!state.list.length) return;
    /* 播放超过 3 秒则回到当前曲开头 */
    if (audio.currentTime > 3) {
      try { audio.currentTime = 0; } catch (e) {}
      return;
    }
    var p = state.index - 1;
    if (p < 0) p = state.list.length - 1;
    var guard = 0;
    while (!state.list[p].file && guard < state.list.length) { p = (p - 1 + state.list.length) % state.list.length; guard++; }
    loadIndex(p, true);
  }

  function setPlaying(flag) {
    state.playing = flag;
    if (flag) elBody.classList.add('playing');
    else elBody.classList.remove('playing');
    elPlayIcon.style.display = flag ? 'none' : 'block';
    elPauseIcon.style.display = flag ? 'block' : 'none';
    elPlay.setAttribute('aria-label', flag ? '暂停' : '播放');
    /* 同步列表项图标 */
    var items = elList.querySelectorAll('.pp-item');
    for (var i = 0; i < items.length; i++) {
      var icon = items[i].querySelector('.pp-item-icon');
      if (icon) icon.innerHTML = (i === state.index && flag) ? ICON_PAUSE : ICON_PLAY;
    }
    broadcastState();
  }

  /* ═══ 循环模式状态机 ═══ */
  var MODE_ORDER = ['order', 'list', 'single'];
  var MODE_LABEL = { order: '顺序播放', list: '列表循环', single: '单曲循环' };

  function setMode(mode) {
    state.mode = mode;
    elMode.setAttribute('data-mode', mode);
    elMode.setAttribute('aria-label', '循环模式：' + MODE_LABEL[mode]);
    /* 切换图标 */
    $('pp-mode-order').style.display = mode === 'order' ? 'block' : 'none';
    $('pp-mode-list').style.display = mode === 'list' ? 'block' : 'none';
    $('pp-mode-single').style.display = mode === 'single' ? 'block' : 'none';
    /* 高亮 */
    if (mode === 'order') elMode.classList.remove('is-active');
    else elMode.classList.add('is-active');
    /* 单曲循环映射到 audio.loop */
    audio.loop = (mode === 'single');
    broadcastState();
  }

  function cycleMode() {
    var idx = MODE_ORDER.indexOf(state.mode);
    setMode(MODE_ORDER[(idx + 1) % MODE_ORDER.length]);
    toast(MODE_LABEL[state.mode]);
  }

  /* ═══ 进度更新 ═══ */
  function updateProgress() {
    if (state.dragging) return;
    var cur = audio.currentTime || 0;
    var dur = audio.duration;
    if (!dur || isNaN(dur)) dur = 0;
    var pct = dur > 0 ? (cur / dur) * 100 : 0;
    if (pct > 100) pct = 100;
    elFill.style.width = pct + '%';
    elThumb.style.left = pct + '%';
    elCur.textContent = formatTime(cur);
    elDur.textContent = formatTime(dur);
    elProgress.setAttribute('aria-valuenow', Math.round(pct));
    broadcastProgress();
  }

  /* ═══ 进度条拖动 seek ═══ */
  function ratioFromEvent(e) {
    var rect = elProgress.getBoundingClientRect();
    var x;
    if (e.touches && e.touches.length) x = e.touches[0].clientX;
    else if (e.changedTouches && e.changedTouches.length) x = e.changedTouches[0].clientX;
    else x = e.clientX;
    var r = rect.width > 0 ? (x - rect.left) / rect.width : 0;
    return r < 0 ? 0 : (r > 1 ? 1 : r);
  }

  function updateFillRatio(r) {
    elFill.style.width = (r * 100) + '%';
    elThumb.style.left = (r * 100) + '%';
    var dur = audio.duration;
    if (dur && !isNaN(dur)) {
      elCur.textContent = formatTime(r * dur);
    }
  }

  function setupProgressDrag() {
    /* pointer 事件 (现代浏览器) */
    if (w.PointerEvent) {
      elProgress.addEventListener('pointerdown', function (e) {
        state.dragging = true;
        elBody.classList.add('dragging');
        updateFillRatio(ratioFromEvent(e));
        try { elProgress.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault();
      });
      elProgress.addEventListener('pointermove', function (e) {
        if (!state.dragging) return;
        updateFillRatio(ratioFromEvent(e));
      });
      var endPointer = function (e) {
        if (!state.dragging) return;
        state.dragging = false;
        elBody.classList.remove('dragging');
        var r = ratioFromEvent(e);
        if (audio.duration && !isNaN(audio.duration)) {
          try { audio.currentTime = r * audio.duration; } catch (err) {}
        }
        updateProgress();
      };
      elProgress.addEventListener('pointerup', endPointer);
      elProgress.addEventListener('pointercancel', endPointer);
      return;
    }
    /* 降级: 鼠标 + 触摸 */
    var moveHandler = null, upHandler = null;
    elProgress.addEventListener('mousedown', function (e) {
      state.dragging = true;
      elBody.classList.add('dragging');
      updateFillRatio(ratioFromEvent(e));
      moveHandler = function (ev) { if (state.dragging) updateFillRatio(ratioFromEvent(ev)); };
      upHandler = function (ev) {
        state.dragging = false;
        elBody.classList.remove('dragging');
        var r = ratioFromEvent(ev);
        if (audio.duration && !isNaN(audio.duration)) { try { audio.currentTime = r * audio.duration; } catch (err) {} }
        updateProgress();
        d.removeEventListener('mousemove', moveHandler);
        d.removeEventListener('mouseup', upHandler);
      };
      d.addEventListener('mousemove', moveHandler);
      d.addEventListener('mouseup', upHandler);
      e.preventDefault();
    });
    elProgress.addEventListener('touchstart', function (e) {
      state.dragging = true;
      elBody.classList.add('dragging');
      updateFillRatio(ratioFromEvent(e));
      e.preventDefault();
    }, { passive: false });
    elProgress.addEventListener('touchmove', function (e) {
      if (state.dragging) { updateFillRatio(ratioFromEvent(e)); e.preventDefault(); }
    }, { passive: false });
    elProgress.addEventListener('touchend', function (e) {
      if (!state.dragging) return;
      state.dragging = false;
      elBody.classList.remove('dragging');
      var r = ratioFromEvent(e);
      if (audio.duration && !isNaN(audio.duration)) { try { audio.currentTime = r * audio.duration; } catch (err) {} }
      updateProgress();
    });
  }

  /* ═══ Media Session API ═══ */
  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    var it = state.list[state.index];
    if (!it) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: it.label || it.id,
        artist: '大魔女图书馆',
        album: it.category || 'BGM',
        artwork: [
          { src: 'nnk_box.webp', sizes: '256x256', type: 'image/webp' }
        ]
      });
    } catch (e) {}
  }

  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    function setAction(name, fn) {
      try { navigator.mediaSession.setActionHandler(name, fn); } catch (e) {}
    }
    setAction('play', function () { resume(); });
    setAction('pause', function () { pause(); });
    setAction('previoustrack', function () { prev(); });
    setAction('nexttrack', function () { next(); });
    setAction('seekto', function (d) { if (d && d.seekTime != null) { try { audio.currentTime = d.seekTime; } catch (e) {} } });
  }

  /* ═══ 事件绑定 ═══ */
  function setupEvents() {
    elPlay.addEventListener('click', function () {
      if (state.index < 0) { if (state.list.length) loadIndex(0, true); return; }
      if (audio.paused) resume(); else pause();
    });
    elPrev.addEventListener('click', prev);
    elNext.addEventListener('click', next);
    elMode.addEventListener('click', cycleMode);

    elVol.addEventListener('input', function () {
      audio.volume = parseFloat(elVol.value);
      state.volume = audio.volume;
    });

    /* 列表项点击 */
    elList.addEventListener('click', function (e) {
      var item = e.target.closest ? e.target.closest('.pp-item') : null;
      if (!item || item.classList.contains('disabled')) return;
      var i = parseInt(item.getAttribute('data-pp-index'), 10);
      if (isNaN(i)) return;
      if (i === state.index) {
        if (audio.paused) resume(); else pause();
      } else {
        loadIndex(i, true);
      }
    });
    elList.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var item = e.target.closest ? e.target.closest('.pp-item') : null;
      if (!item) return;
      e.preventDefault();
      item.click();
    });

    /* 进度条拖动 */
    setupProgressDrag();

    /* 音频事件 */
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('durationchange', updateProgress);
    audio.addEventListener('loadedmetadata', updateProgress);
    audio.addEventListener('ended', function () {
      if (state.mode === 'single') {
        /* audio.loop=true 会自动重放, 但兜底 */
        try { audio.currentTime = 0; } catch (e) {}
        resume();
        return;
      }
      var n = state.index + 1;
      if (n < state.list.length) {
        loadIndex(n, true);
      } else {
        /* 末尾 */
        if (state.mode === 'list') {
          loadIndex(0, true);
        } else {
          /* order: 停止 */
          setPlaying(false);
          try { audio.currentTime = 0; } catch (e) {}
          elFill.style.width = '0%';
          elThumb.style.left = '0%';
          elCur.textContent = '0:00';
          renderList();
        }
      }
    });
    audio.addEventListener('error', function () {
      toast('音频加载失败（该格式可能不受当前浏览器支持）');
      setPlaying(false);
    });
    audio.addEventListener('play', function () { setPlaying(true); });
    audio.addEventListener('pause', function () { if (audio.ended) return; setPlaying(false); });

    /* popup 关闭前广播 closed */
    w.addEventListener('beforeunload', function () {
      broadcast({ type: 'state', state: { playing: false, closed: true } });
    });
  }

  /* ═══ 初始化 ═══ */
  function init() {
    /* 缓存元素 */
    audio = $('pp-audio');
    elBody = d.body;
    elTitle = $('pp-title');
    elMeta = $('pp-meta');
    elProgress = $('pp-progress');
    elFill = $('pp-fill');
    elThumb = $('pp-thumb');
    elCur = $('pp-cur');
    elDur = $('pp-dur');
    elPlay = $('pp-play');
    elPlayIcon = $('pp-play-icon');
    elPauseIcon = $('pp-pause-icon');
    elPrev = $('pp-prev');
    elNext = $('pp-next');
    elMode = $('pp-mode');
    elVol = $('pp-volume');
    elList = $('pp-list');

    audio.volume = state.volume;
    setupEvents();
    setupMediaSession();
    setMode('order');

    fetchJSON('data/audio-manifest.json', 12000)
      .then(function (data) {
        state.manifest = data || {};
        state.list = state.manifest.bgm || [];
        renderList();
        /* URL 查询直达: ?id=xxx */
        var qid = getParam('id');
        if (qid) {
          playById(qid);
        } else {
          broadcastState();
        }
      })
      .catch(function () {
        state.list = [];
        elList.innerHTML = '<div class="pp-empty">数据加载失败</div>';
        broadcastState();
      });
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);
