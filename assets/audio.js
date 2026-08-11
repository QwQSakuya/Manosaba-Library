/* ═══════════════════════════════════════════════════
   audio.js — 语音和音乐页逻辑
   依赖: shared.js (window.MS)
   ES5 兼容 (var / function, 无箭头函数/const/let/模板串)
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

  /* ── 图标 ── */
  var ICON_PLAY  = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
  var ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  /* ── 状态 ── */
  var state = {
    manifest: null,
    sceneFilter: '全部',
    charFilter: '全部',
    currentType: null,     /* 'sfx' | 'voice' */
    currentId: null,
    playing: false,
    currentItem: null,     /* 当前播放项（用于时长回退显示） */
    popupBgmId: null,      /* popup 正在播放的 BGM id */
    popupPlaying: false    /* popup 是否在播放 */
  };

  /* ── 元素引用 ── */
  var audio = null;
  var miniPlayer = null;
  var mpTitle = null, mpMeta = null, mpFill = null, mpTime = null;
  var mpBtn = null, mpPlayIcon = null, mpPauseIcon = null;
  var sfxGrid = null, bgmList = null, sceneFilters = null, charFilters = null, voiceList = null;

  /* ═══ 工具 ═══ */
  function $(id) { return d.getElementById(id); }

  function esc(s) { return MS.escapeHtml(s); }

  /* 角色颜色 CSS 变量 */
  function charColor(character) {
    return 'var(--char-' + character + ')';
  }

  /* M:SS 时间格式 */
  function formatTime(sec) {
    if (sec == null || isNaN(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* 解析音频源地址 */
  function resolveSrc(item) {
    if (!item) return '';
    if (item.externalUrl) {
      var base = state.manifest && state.manifest.voiceBaseUrl ? state.manifest.voiceBaseUrl : '';
      return base + item.externalUrl;
    }
    if (item.file) {
      return MS.webUrl('assets/audio/' + item.file);
    }
    return '';
  }

  /* ═══ Popup 播放器桥接 ═══ */
  /* MSPlayer 由 player-launcher.js 暴露; 不存在时降级直接开窗 */
  function MSPlayerOpen(id) {
    if (w.MSPlayer) { w.MSPlayer.open(id); return; }
    var url = id ? ('player.html?id=' + encodeURIComponent(id)) : 'player.html';
    w.open(url, 'ms_player', 'width=400,height=640,resizable=yes,scrollbars=yes');
  }
  function MSPlayerSend(msg) {
    if (w.MSPlayer) { w.MSPlayer.send(msg); return; }
    if (w._ppBc) { try { w._ppBc.postMessage(msg); } catch (e) {} }
  }

  /* ═══ 渲染：SFX ═══ */
  function renderSfx() {
    var sfx = (state.manifest && state.manifest.sfx) ? state.manifest.sfx : [];
    var html = '';
    if (!sfx.length) {
      html = '<div class="sfx-empty">暂无音效样本</div>';
    } else {
      for (var i = 0; i < sfx.length; i++) {
        var it = sfx[i];
        var id = esc(it.id);
        html +=
          '<button class="sfx-btn" type="button" data-sfx-id="' + id + '">' +
            '<span class="sfx-icon">' + ICON_PLAY + '</span>' +
            '<span class="sfx-label">' + esc(it.label || it.id) + '</span>' +
            '<span class="sfx-wave" aria-hidden="true">' +
              '<span></span><span></span><span></span><span></span><span></span><span></span>' +
            '</span>' +
          '</button>';
      }
    }
    sfxGrid.innerHTML = html;
  }

  /* ═══ 渲染：BGM ═══ */
  function renderBgm() {
    var bgm = (state.manifest && state.manifest.bgm) ? state.manifest.bgm : [];
    var html = '';
    if (!bgm.length) {
      html = '<div class="sfx-empty">暂无音乐样本</div>';
    } else {
      for (var i = 0; i < bgm.length; i++) {
        var it = bgm[i];
        var id = esc(it.id);
        var disabled = !it.file;
        var cls = 'bgm-card' + (disabled ? ' disabled' : '');
        var isActive = (state.popupBgmId === it.id);
        var showPause = isActive && state.popupPlaying;
        if (isActive) cls += ' playing';
        var cat = esc(it.category || '');
        var name = esc(it.label || it.id);
        var attr = disabled
          ? ' aria-disabled="true"'
          : ' tabindex="0" role="button" aria-label="播放 ' + name + '"';
        var dlBtn = it.file
          ? '<a class="bgm-dl" href="' + MS.webUrl('assets/audio/' + it.file) + '" download title="下载" aria-label="下载">' + ICON_DOWNLOAD + '</a>'
          : '';
        html +=
          '<div class="' + cls + '" data-bgm-id="' + id + '"' + attr + '>' +
            '<span class="bgm-cat">' + cat + '</span>' +
            '<span class="bgm-name">' + name + '</span>' +
            '<button class="bgm-play" type="button" aria-label="播放"' + (disabled ? ' disabled' : '') + '>' +
              (showPause ? ICON_PAUSE : ICON_PLAY) +
            '</button>' +
            dlBtn +
          '</div>';
      }
    }
    bgmList.innerHTML = html;
  }

  /* ═══ 渲染：筛选 chips ═══ */
  function buildCounts(field) {
    var voice = state.manifest.voice || [];
    var counts = {};
    for (var i = 0; i < voice.length; i++) {
      var key = voice[i][field];
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }

  function uniqueValues(field) {
    var voice = state.manifest.voice || [];
    var seen = {};
    var list = [];
    for (var i = 0; i < voice.length; i++) {
      var key = voice[i][field];
      if (!seen[key]) { seen[key] = true; list.push(key); }
    }
    return list;
  }

  function renderFilters() {
    /* 场景 */
    var total = (state.manifest.voice || []).length;
    var sceneCounts = buildCounts('scene');
    var scenes = uniqueValues('scene');
    var sh = '<span class="filter-label">Scene</span>';
    sh += chipHtml('scene', '全部', '全部', total, null, state.sceneFilter === '全部');
    for (var i = 0; i < scenes.length; i++) {
      sh += chipHtml('scene', scenes[i], scenes[i], sceneCounts[scenes[i]] || 0, null, state.sceneFilter === scenes[i]);
    }
    sceneFilters.innerHTML = sh;

    /* 角色 */
    var charCounts = buildCounts('character');
    var chars = uniqueValues('character');
    var ch = '<span class="filter-label">Character</span>';
    ch += chipHtml('char', '全部', '全部', total, null, state.charFilter === '全部');
    for (var j = 0; j < chars.length; j++) {
      var c = chars[j];
      /* 用 manifest 中的 characterName 做显示名 */
      var displayName = findCharName(c);
      ch += chipHtml('char', c, displayName, charCounts[c] || 0, c, state.charFilter === c);
    }
    charFilters.innerHTML = ch;
  }

  /* 查找角色中文名（取首条匹配） */
  function findCharName(character) {
    var voice = state.manifest.voice || [];
    for (var i = 0; i < voice.length; i++) {
      if (voice[i].character === character) return voice[i].characterName || character;
    }
    return character;
  }

  function chipHtml(group, value, label, count, character, active) {
    var dot = '';
    if (character) {
      dot = '<span class="char-dot" style="background:' + charColor(character) + '"></span>';
    }
    return '<button class="chip' + (active ? ' active' : '') + '" type="button" ' +
      'data-filter-group="' + group + '" data-filter-value="' + esc(value) + '">' +
      dot + esc(label) + '<span class="chip-count">' + count + '</span>' +
      '</button>';
  }

  /* ═══ 渲染：语音列表 ═══ */
  function renderVoiceList() {
    var voice = state.manifest.voice || [];
    var list = [];
    for (var i = 0; i < voice.length; i++) {
      var it = voice[i];
      if (state.sceneFilter !== '全部' && it.scene !== state.sceneFilter) continue;
      if (state.charFilter !== '全部' && it.character !== state.charFilter) continue;
      list.push(it);
    }

    if (!list.length) {
      voiceList.innerHTML =
        '<div class="empty-state audio-empty">' +
          '<div class="empty-icon">♪</div>' +
          '<div class="empty-text">无匹配语音</div>' +
        '</div>';
      return;
    }

    var html = '';
    for (var k = 0; k < list.length; k++) {
      var item = list[k];
      var color = charColor(item.character);
      var isActive = (state.currentType === 'voice' && state.currentId === item.id);
      var dur = (item.duration != null) ? (item.duration + 's') : '—';
      html +=
        '<div class="voice-card' + (isActive ? ' active' : '') + '" ' +
          'data-voice-id="' + esc(item.id) + '" tabindex="0" role="button" aria-label="播放 ' + esc(item.characterName || item.character) + ' 语音">' +
          '<div class="vc-bar" style="background:' + color + '"></div>' +
          '<div class="vc-body">' +
            '<div class="vc-name">' +
              '<span class="char-dot" style="background:' + color + '"></span>' +
              esc(item.characterName || item.character) +
            '</div>' +
            '<div class="vc-scene-line">' +
              '<span class="source-tag">' + esc(item.scene) + '</span>' +
            '</div>' +
          '</div>' +
          '<span class="vc-duration">' + esc(dur) + '</span>' +
          '<button class="vc-play" type="button" aria-label="播放">' +
            (isActive && state.playing ? ICON_PAUSE : ICON_PLAY) +
          '</button>' +
        '</div>';
    }
    voiceList.innerHTML = html;
  }

  /* ═══ 播放控制 ═══ */

  /* 清除上一项的视觉状态 */
  function clearCurrentUI() {
    if (state.currentType === 'sfx' && state.currentId) {
      var btn = sfxGrid.querySelector('.sfx-btn[data-sfx-id="' + cssEscape(state.currentId) + '"]');
      if (btn) btn.classList.remove('playing');
    }
    if (state.currentType === 'bgm' && state.currentId) {
      var card = bgmList.querySelector('.bgm-card[data-bgm-id="' + cssEscape(state.currentId) + '"]');
      if (card) {
        card.classList.remove('playing');
        var pb = card.querySelector('.bgm-play');
        if (pb) pb.innerHTML = ICON_PLAY;
      }
    }
    /* voice 卡片 active 状态在 renderVoiceList 重绘时更新；
       这里同步移除避免闪动 */
    var prev = voiceList.querySelector('.voice-card.active');
    if (prev) prev.classList.remove('active');
  }

  /* 极简 CSS 选择器转义（id 仅含字母数字下划线时可直接用） */
  function cssEscape(s) {
    return String(s).replace(/(["\\])/g, '\\$1');
  }

  function stopCurrent() {
    if (audio) {
      audio.pause();
      try { audio.currentTime = 0; } catch (e) {}
    }
  }

  /* 加载并播放 */
  function loadAndPlay(src, title, meta, item, type, id) {
    if (!src) {
      MS.showToast('音频加载失败');
      return;
    }
    /* 同一音频再次点击 → 切换播放/暂停 */
    if (state.currentId === id && state.currentType === type && audio.src) {
      if (audio.paused) {
        resumePlay();
      } else {
        pausePlay();
      }
      return;
    }

    /* 切换到新曲目 */
    stopCurrent();
    clearCurrentUI();

    state.currentType = type;
    state.currentId = id;
    state.currentItem = item;

    audio.src = src;
    showMiniPlayer(title, meta, item);

    var p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(function () {
        setPlaying(true);
        notifyPopupPause();
      }).catch(function () {
        /* 自动播放被阻止或加载失败 */
        setPlaying(false);
        /* 若是加载错误，error 事件会另行提示 */
      });
    } else {
      setPlaying(true);
      notifyPopupPause();
    }
  }

  /* 页内 SFX/voice 开始时, 通知 popup 暂停 BGM (互相暂停) */
  function notifyPopupPause() {
    MSPlayerSend({ type: 'page-audio-start' });
  }

  function resumePlay() {
    var p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(function () { setPlaying(true); }).catch(function () { setPlaying(false); });
    } else {
      setPlaying(true);
    }
  }

  function pausePlay() {
    audio.pause();
    setPlaying(false);
  }

  function setPlaying(flag) {
    state.playing = flag;
    if (flag) {
      miniPlayer.classList.add('playing');
    } else {
      miniPlayer.classList.remove('playing');
    }
    /* 切换按钮图标 */
    mpPlayIcon.style.display = flag ? 'none' : 'block';
    mpPauseIcon.style.display = flag ? 'block' : 'none';
    /* 同步 SFX 按钮 / voice 卡片图标 */
    syncItemIcons();
  }

  /* 同步当前项的小图标（播放/暂停） */
  function syncItemIcons() {
    if (state.currentType === 'sfx' && state.currentId) {
      var btn = sfxGrid.querySelector('.sfx-btn[data-sfx-id="' + cssEscape(state.currentId) + '"]');
      if (btn) {
        if (state.playing) btn.classList.add('playing');
        else btn.classList.remove('playing');
      }
    }
    if (state.currentType === 'bgm' && state.currentId) {
      var bcard = bgmList.querySelector('.bgm-card[data-bgm-id="' + cssEscape(state.currentId) + '"]');
      if (bcard) {
        var bplay = bcard.querySelector('.bgm-play');
        if (bplay) bplay.innerHTML = state.playing ? ICON_PAUSE : ICON_PLAY;
        if (state.playing) bcard.classList.add('playing');
        else bcard.classList.remove('playing');
      }
    }
    if (state.currentType === 'voice' && state.currentId) {
      var card = voiceList.querySelector('.voice-card[data-voice-id="' + cssEscape(state.currentId) + '"]');
      if (card) {
        var playBtn = card.querySelector('.vc-play');
        if (playBtn) playBtn.innerHTML = state.playing ? ICON_PAUSE : ICON_PLAY;
        if (state.playing) card.classList.add('active');
        else card.classList.remove('active');
      }
    }
  }

  /* ═══ Mini Player ═══ */
  function showMiniPlayer(title, meta, item) {
    mpTitle.textContent = title || '—';
    mpMeta.textContent = meta || '—';
    miniPlayer.classList.add('show');
    /* 初始进度/时间 */
    var total = (item && item.duration != null) ? item.duration : 0;
    mpFill.style.width = '0%';
    mpTime.textContent = '0:00 / ' + formatTime(total);
  }

  function updateProgress() {
    if (!audio || !state.currentItem) return;
    var cur = audio.currentTime;
    var dur = audio.duration;
    if (!dur || isNaN(dur)) {
      dur = (state.currentItem.duration != null) ? state.currentItem.duration : 0;
    }
    var pct = dur > 0 ? (cur / dur) * 100 : 0;
    if (pct > 100) pct = 100;
    mpFill.style.width = pct + '%';
    mpTime.textContent = formatTime(cur) + ' / ' + formatTime(dur);
  }

  function setupMiniPlayer() {
    /* 播放/暂停 */
    mpBtn.addEventListener('click', function () {
      if (!state.currentId) return;
      if (audio.paused) resumePlay();
      else pausePlay();
    });

    /* 进度条点击跳转 */
    var prog = $('mp-progress');
    prog.addEventListener('click', function (e) {
      if (!audio || !audio.duration || isNaN(audio.duration)) return;
      var rect = prog.getBoundingClientRect();
      var ratio;
      if (rect.width > 0) {
        ratio = (e.clientX - rect.left) / rect.width;
      } else {
        ratio = 0;
      }
      if (ratio < 0) ratio = 0;
      if (ratio > 1) ratio = 1;
      try { audio.currentTime = ratio * audio.duration; } catch (err) {}
      updateProgress();
    });

    /* 音频事件 */
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('durationchange', updateProgress);
    audio.addEventListener('ended', function () {
      setPlaying(false);
      try { audio.currentTime = 0; } catch (e) {}
      mpFill.style.width = '0%';
      updateProgress();
    });
    audio.addEventListener('error', function () {
      MS.showToast('音频加载失败');
      setPlaying(false);
    });
    audio.addEventListener('play', function () { setPlaying(true); });
    audio.addEventListener('pause', function () {
      /* ended 也会触发 pause，交由 ended 处理 */
      if (audio.ended) return;
      setPlaying(false);
    });
  }

  /* ═══ 事件绑定 ═══ */
  function bindEvents() {
    /* SFX 按钮 */
    sfxGrid.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.sfx-btn') : null;
      if (!btn) return;
      var id = btn.getAttribute('data-sfx-id');
      var sfx = state.manifest.sfx || [];
      var item = null;
      for (var i = 0; i < sfx.length; i++) {
        if (sfx[i].id === id) { item = sfx[i]; break; }
      }
      if (!item) return;
      var src = MS.webUrl('assets/audio/' + item.file);
      loadAndPlay(src, item.label || item.id, '音效 · Sound Effect', item, 'sfx', id);
    });

    /* BGM 卡片 → 发送到 popup 播放 */
    bgmList.addEventListener('click', function (e) {
      /* 下载按钮点击不触发播放 */
      if (e.target.closest && e.target.closest('.bgm-dl')) return;
      var card = e.target.closest ? e.target.closest('.bgm-card') : null;
      if (!card || card.classList.contains('disabled')) return;
      var id = card.getAttribute('data-bgm-id');
      /* 同曲且 popup 正在放 → 暂停; 否则发送到 popup */
      if (state.popupBgmId === id && state.popupPlaying) {
        MSPlayerSend({ type: 'request', action: 'pause' });
      } else {
        MSPlayerOpen(id);
      }
    });
    bgmList.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest ? e.target.closest('.bgm-card') : null;
      if (!card || card.classList.contains('disabled')) return;
      e.preventDefault();
      card.click();
    });

    /* 筛选 chips */
    function handleFilter(e) {
      var chip = e.target.closest ? e.target.closest('.chip') : null;
      if (!chip) return;
      var group = chip.getAttribute('data-filter-group');
      var value = chip.getAttribute('data-filter-value');
      if (group === 'scene') {
        state.sceneFilter = value;
      } else if (group === 'char') {
        state.charFilter = value;
      }
      renderFilters();
      renderVoiceList();
    }
    sceneFilters.addEventListener('click', handleFilter);
    charFilters.addEventListener('click', handleFilter);

    /* 语音卡片点击 */
    voiceList.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.voice-card') : null;
      if (!card) return;
      var id = card.getAttribute('data-voice-id');
      var voice = state.manifest.voice || [];
      var item = null;
      for (var i = 0; i < voice.length; i++) {
        if (voice[i].id === id) { item = voice[i]; break; }
      }
      if (!item) return;
      var src = resolveSrc(item);
      var title = item.characterName || item.character;
      var meta = item.scene;
      loadAndPlay(src, title, meta, item, 'voice', id);
    });

    /* 语音卡片键盘 */
    voiceList.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest ? e.target.closest('.voice-card') : null;
      if (!card) return;
      e.preventDefault();
      card.click();
    });
  }

  /* ═══ 错误状态 ═══ */
  function renderError() {
    sfxGrid.innerHTML = '';
    bgmList.innerHTML = '';
    sceneFilters.innerHTML = '';
    charFilters.innerHTML = '';
    voiceList.innerHTML =
      '<div class="empty-state audio-empty">' +
        '<div class="empty-icon">♪</div>' +
        '<div class="empty-text">数据加载失败</div>' +
      '</div>';
  }

  /* ═══ Popup 通道监听: 同步 BGM 卡片态 + 互相暂停 ═══ */
  function setupPlayerChannel() {
    var channel = null;
    try { channel = new BroadcastChannel('ms_player'); } catch (e) {}
    if (!channel) {
      /* 降级: storage 事件 */
      w.addEventListener('storage', function (e) {
        if (e.key === 'ms_player_state' && e.newValue) {
          try { handle(JSON.parse(e.newValue)); } catch (err) {}
        }
      });
      return;
    }
    w._ppBc = channel;
    channel.onmessage = function (e) { handle(e.data); };
    /* 启动问一次 popup 现状 */
    channel.postMessage({ type: 'ping' });

    function handle(m) {
      if (!m) return;
      if (m.type === 'state' || (m.type === 'pong' && m.state)) {
        var st = m.state || m;
        if (!st) return;
        var prevId = state.popupBgmId;
        var prevPlaying = state.popupPlaying;
        state.popupBgmId = st.id || null;
        state.popupPlaying = !!st.playing;
        /* popup 开始播放 BGM 时, 暂停页内 SFX/voice */
        if (state.popupPlaying && state.playing) {
          stopCurrent();
          setPlaying(false);
        }
        /* 状态变化时重绘 BGM 卡片 */
        if (prevId !== state.popupBgmId || prevPlaying !== state.popupPlaying) {
          renderBgm();
        }
      }
    }
  }

  /* ═══ 初始化 ═══ */
  function init() {
    MS.restoreTheme();
    MS.injectBgLayer('bg-host');
    MS.initTheme();

    /* 缓存元素 */
    audio = $('audio-player');
    miniPlayer = $('mini-player');
    mpTitle = $('mp-title');
    mpMeta = $('mp-meta');
    mpFill = $('mp-fill');
    mpTime = $('mp-time');
    mpBtn = $('mp-btn');
    mpPlayIcon = $('mp-play-icon');
    mpPauseIcon = $('mp-pause-icon');
    sfxGrid = $('sfx-grid');
    bgmList = $('bgm-list');
    sceneFilters = $('scene-filters');
    charFilters = $('char-filters');
    voiceList = $('voice-list');

    setupMiniPlayer();
    bindEvents();
    setupPlayerChannel();

    Promise.all([
      MS.fetchJSON('data/audio-manifest.json', 12000),
      MS.loadR2Config(8000)
    ])
      .then(function (results) {
        state.manifest = results[0] || {};
        if (!state.manifest.sfx) state.manifest.sfx = [];
        if (!state.manifest.bgm) state.manifest.bgm = [];
        if (!state.manifest.voice) state.manifest.voice = [];
        renderSfx();
        renderBgm();
        renderFilters();
        renderVoiceList();
        MS.hideSplash(1200);
      })
      .catch(function () {
        state.manifest = { sfx: [], bgm: [], voice: [], voiceBaseUrl: '' };
        renderError();
        MS.hideSplash(1200);
      });
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);
