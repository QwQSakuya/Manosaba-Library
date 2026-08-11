/* ═══════════════════════════════════════════════════
   player-launcher.js — 全站浮动按钮 + 开窗 + 状态同步
   自包含, 不依赖 window.MS (act01/act02 不引 shared.js)
   ES5 兼容 (var / function, 无箭头/const/let/模板串)
   暴露 window.MSPlayer = { open, send, getState }
   ═══════════════════════════════════════════════════ */
(function (w, d) {
  'use strict';

  var MS = w.MS;
  function toast(msg) { if (MS && MS.showToast) MS.showToast(msg); }

  var POPUP_NAME = 'ms_player';
  var FEATURES = 'width=400,height=640,resizable=yes,scrollbars=yes,status=no,location=no,toolbar=no,menubar=no';
  var FAB_ICON =
    '<svg class="ms-fab-disc" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="1"/>' +
      '<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.6"/>' +
      '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="0.4" opacity="0.4"/>' +
      '<circle cx="12" cy="12" r="2.4" fill="currentColor"/>' +
    '</svg>';

  var ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  var popupWin = null;
  var bc = null;
  try { bc = new BroadcastChannel('ms_player'); } catch (e) {}

  var lastState = { playing: false, title: '', id: '', closed: false };
  var fab = null;
  var fallbackBar = null;
  var fallbackAudio = null;
  var fallbackList = [];
  var fallbackIndex = -1;
  var webBase = '';

  /* ═══ R2 网页素材地址 (配置加载失败时回退本地相对路径) ═══ */
  function loadR2Config() {
    fetch('data/r2-config.json').then(function (r) { return r.json(); }).then(function (cfg) {
      webBase = ((cfg && cfg.webBaseUrl) || '').replace(/\/+$/, '');
    }).catch(function () {});
  }
  function webUrl(rel) {
    if (webBase) {
      return webBase + '/' + rel.split('/').map(function (s) { return encodeURIComponent(s); }).join('/');
    }
    return rel;
  }

  /* ═══ 自注入 CSS ═══ */
  function injectCSS() {
    if (d.querySelector('link[href="assets/player.css"]')) return;
    var l = d.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'assets/player.css';
    d.head.appendChild(l);
  }

  /* ═══ FAB 注入 ═══ */
  function injectFab() {
    fab = d.createElement('button');
    fab.className = 'ms-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', '打开音乐播放器');
    fab.innerHTML = FAB_ICON;
    /* act 页加修饰类 (右下拥挤 → 右上) */
    if (d.body && d.body.dataset && d.body.dataset.act) fab.classList.add('on-act');
    if (/audio\.html/.test(w.location.pathname)) fab.classList.add('on-audio');
    fab.addEventListener('click', onClickFab);
    d.body.appendChild(fab);
  }

  /* ═══ 开 popup (必须由用户手势调用) ═══ */
  function open(bgmId) {
    if (popupWin && !popupWin.closed) {
      if (bgmId) send({ type: 'play-bgm', id: bgmId });
      try { popupWin.focus(); } catch (e) {}
      return popupWin;
    }
    var url = bgmId ? ('player.html?id=' + encodeURIComponent(bgmId)) : 'player.html';
    popupWin = w.open(url, POPUP_NAME, FEATURES);
    if (!popupWin) {
      /* 被拦截 (移动端常见) → 降级 */
      fallback(bgmId);
      return null;
    }
    return popupWin;
  }

  function send(msg) {
    if (bc) { try { bc.postMessage(msg); } catch (e) {} }
  }

  /* ═══ FAB 点击 ═══ */
  function onClickFab() {
    if (fallbackBar) {
      /* 已在降级模式 */
      toggleFallback();
      return;
    }
    if (popupWin && !popupWin.closed) {
      /* 已开: 切换播放/暂停并聚焦 */
      if (lastState.playing) send({ type: 'request', action: 'pause' });
      else send({ type: 'request', action: 'play' });
      try { popupWin.focus(); } catch (e) {}
    } else {
      open();
    }
  }

  /* ═══ 监听 popup 状态 ═══ */
  function onMsg(m) {
    if (!m) return;
    if (m.type === 'pong' && m.state) {
      handleState(m.state);
      return;
    }
    if (m.type === 'state' && m.state) {
      handleState(m.state);
      return;
    }
    if (m.type === 'progress') {
      /* FAB 不强需进度, 忽略 */
      return;
    }
  }

  function handleState(st) {
    if (!st) return;
    if (st.closed) {
      lastState = { playing: false, title: '', id: '', closed: true };
      popupWin = null;
    } else {
      lastState = {
        playing: !!st.playing,
        title: st.title || '',
        id: st.id || '',
        closed: false
      };
    }
    updateFab();
  }

  function updateFab() {
    if (!fab) return;
    if (lastState.playing) {
      fab.classList.add('is-playing');
      fab.setAttribute('aria-label', '正在播放：' + lastState.title + '，点击暂停');
      fab.title = lastState.title;
    } else {
      fab.classList.remove('is-playing');
      fab.setAttribute('aria-label', lastState.title ? ('已暂停：' + lastState.title + '，点击播放') : '打开音乐播放器');
      fab.title = lastState.title || '';
    }
  }

  if (bc) {
    bc.onmessage = function (e) { onMsg(e.data); };
  }
  w.addEventListener('storage', function (e) {
    if (e.key === 'ms_player_state' && e.newValue) {
      try { onMsg(JSON.parse(e.newValue)); } catch (err) {}
    }
  });

  /* 启动时问一次 popup 现状 (跨页刷新按钮态) */
  function handshake() {
    send({ type: 'ping' });
  }

  /* ═══ 移动端降级条 ═══ */
  function fallback(bgmId) {
    if (fallbackBar) {
      if (bgmId) fallbackPlayById(bgmId);
      return;
    }
    if (fab) fab.classList.add('has-fallback');
    fallbackBar = d.createElement('div');
    fallbackBar.className = 'ms-fallback-bar';
    fallbackBar.innerHTML =
      '<div class="msfb-disc" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/></svg>' +
      '</div>' +
      '<div class="msfb-info">' +
        '<div class="msfb-title" id="msfb-title">—</div>' +
        '<div class="msfb-meta" id="msfb-meta">—</div>' +
      '</div>' +
      '<div class="msfb-progress" id="msfb-progress"><div class="msfb-progress-fill" id="msfb-fill"></div></div>' +
      '<button class="msfb-btn" id="msfb-btn" type="button" aria-label="播放">' + ICON_PLAY + '</button>';
    d.body.appendChild(fallbackBar);
    fallbackAudio = d.createElement('audio');
    fallbackAudio.preload = 'auto';
    fallbackAudio.volume = 1;
    setupFallbackEvents();
    /* 显示降级条 */
    setTimeout(function () { fallbackBar.classList.add('show'); }, 10);
    /* 加载 manifest */
    loadFallbackManifest(bgmId);
    toast('弹窗被拦截，已启用页内播放器');
  }

  function loadFallbackManifest(bgmId) {
    /* 恢复上次位置 */
    var savedId = null, savedTime = 0;
    try {
      savedId = localStorage.getItem('ms_fb_id') || null;
      savedTime = parseFloat(localStorage.getItem('ms_fb_time') || '0') || 0;
    } catch (e) {}
    fetch('data/audio-manifest.json').then(function (r) { return r.json(); }).then(function (data) {
      fallbackList = (data && data.bgm) ? data.bgm : [];
      if (bgmId) {
        fallbackPlayById(bgmId);
      } else if (savedId) {
        fallbackPlayById(savedId, savedTime);
      }
    }).catch(function () {});
  }

  function fallbackPlayById(id, resumeTime) {
    for (var i = 0; i < fallbackList.length; i++) {
      if (fallbackList[i].id === id) { fallbackLoadIndex(i, true, resumeTime); return; }
    }
    if (fallbackList.length) fallbackLoadIndex(0, true, resumeTime);
  }

  function fallbackLoadIndex(i, autoplay, resumeTime) {
    if (i < 0 || i >= fallbackList.length) return;
    var it = fallbackList[i];
    if (!it.file) return;
    fallbackIndex = i;
    fallbackAudio.src = webUrl('assets/audio/' + it.file);
    var t = $('msfb-title'); if (t) t.textContent = it.label || it.id;
    var m = $('msfb-meta'); if (m) m.textContent = '音乐 · ' + (it.category || 'BGM');
    var f = $('msfb-fill'); if (f) f.style.width = '0%';
    try { localStorage.setItem('ms_fb_id', it.id); } catch (e) {}
    if (resumeTime && resumeTime > 0) {
      var applied = false;
      var onMeta = function () {
        try { fallbackAudio.currentTime = resumeTime; } catch (e) {}
        fallbackAudio.removeEventListener('loadedmetadata', onMeta);
        applied = true;
      };
      fallbackAudio.addEventListener('loadedmetadata', onMeta);
    }
    if (autoplay) {
      var p = fallbackAudio.play();
      if (p && typeof p.then === 'function') {
        p.then(function () { fallbackSetPlaying(true); }).catch(function () { fallbackSetPlaying(false); });
      } else { fallbackSetPlaying(true); }
    }
  }

  function fallbackSetPlaying(flag) {
    if (!fallbackBar) return;
    if (flag) fallbackBar.classList.add('playing');
    else fallbackBar.classList.remove('playing');
    var btn = $('msfb-btn');
    if (btn) {
      btn.innerHTML = flag ? ICON_PAUSE : ICON_PLAY;
      btn.setAttribute('aria-label', flag ? '暂停' : '播放');
    }
  }

  function toggleFallback() {
    if (!fallbackAudio || !fallbackAudio.src) {
      if (fallbackList.length) fallbackLoadIndex(0, true);
      return;
    }
    if (fallbackAudio.paused) {
      var p = fallbackAudio.play();
      if (p && typeof p.then === 'function') p.then(function () { fallbackSetPlaying(true); }).catch(function () {});
      else fallbackSetPlaying(true);
    } else {
      fallbackAudio.pause();
      fallbackSetPlaying(false);
    }
  }

  function setupFallbackEvents() {
    var btn = $('msfb-btn');
    if (btn) btn.addEventListener('click', toggleFallback);
    var prog = $('msfb-progress');
    if (prog) {
      prog.addEventListener('click', function (e) {
        if (!fallbackAudio.duration || isNaN(fallbackAudio.duration)) return;
        var rect = prog.getBoundingClientRect();
        var r = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
        if (r < 0) r = 0; if (r > 1) r = 1;
        try { fallbackAudio.currentTime = r * fallbackAudio.duration; } catch (err) {}
      });
    }
    fallbackAudio.addEventListener('timeupdate', function () {
      var cur = fallbackAudio.currentTime || 0;
      var dur = fallbackAudio.duration;
      if (!dur || isNaN(dur)) dur = 0;
      var pct = dur > 0 ? (cur / dur) * 100 : 0;
      var f = $('msfb-fill'); if (f) f.style.width = pct + '%';
      try { localStorage.setItem('ms_fb_time', String(cur)); } catch (e) {}
    });
    fallbackAudio.addEventListener('ended', function () {
      /* 降级条: 简单顺序播放下一首 */
      var n = fallbackIndex + 1;
      if (n < fallbackList.length) fallbackLoadIndex(n, true);
      else fallbackSetPlaying(false);
    });
    fallbackAudio.addEventListener('play', function () { fallbackSetPlaying(true); });
    fallbackAudio.addEventListener('pause', function () { if (fallbackAudio.ended) return; fallbackSetPlaying(false); });
  }

  function $(id) { return d.getElementById(id); }

  /* ═══ 暴露 API ═══ */
  w.MSPlayer = {
    open: open,
    send: send,
    getState: function () { return lastState; }
  };

  /* ═══ 启动 ═══ */
  function start() {
    loadR2Config();
    injectCSS();
    injectFab();
    handshake();
  }
  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window, document);
