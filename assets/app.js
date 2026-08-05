// 从 localStorage 恢复主题设置，避免刷新闪白
// (try/catch: 某些隐私/沙箱环境 localStorage 抛错, 静默降级避免整脚本中断)
(function() {
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) { /* localStorage 不可用时静默 */ }
})();

// ══════════════════════════════════════════════════
//  大魔女图书馆 - 核心脚本
//══════════════════════════════════════════════════

// ── 数据 (启动时通过 fetch 从 ./data/<act>.json 加载) ──
let NODES = [];
let _nodeEls = [];                 // 缓存节点 DOM 元素列表，避免每帧 querySelectorAll
let _nodeMap = new Map();          // id → node 数据，O(1) 查找
let ANNOTATIONS = { trialChoices: {} };  // 社区标注 (从 ./data/annotations.<act>.json 加载)

// GitHub 仓库地址 (编辑标注 / 意见箱 跳转用)
const REPO_URL = 'https://github.com/QwQSakuya/Manosaba-textfinder';

// 路由 → 中文标签映射 (未知 route 原样显示)
const ROUTE_LABELS = { normal: '正常路线', bad04: 'Bad04', bad05: 'Bad05', 'objection-wrong': '异议错误' };

// 防重叠状态
let _layoutDirty = false;          // 本帧是否发生布局位移 (触发连线更新)
let _searchTimer = null;           // 搜索防抖定时器
let _prevId = new Map();           // nextId → nodeId 反向索引 (findPrevNode O(1))

// ══════════════════════════════════════════════════
//  自动布局 (混合: 结构骨架自动 + Lv2 本地行)
//  从图结构 (level/parentId/nextId/order) 派生坐标, 覆盖数据的 x/y
//══════════════════════════════════════════════════
const LAYOUT = {
  CHAPTER_X0: 500, CHAPTER_Y: 100, CHAPTER_GAP: 1800,
  SCENE_Y0: 280, SCENE_GAP: 200,
  BRANCH_OFFSET: 360,
  LV2_DY: 115, LV2_GAP: 260,
  COL_WRAP: 999, COL_GAP: 1700,
};

function computeLayout() {
  // 1) 章节行: level=0 按数组顺序横向排列
  const chapters = NODES.filter(n => n.level === 0);
  const chapterPos = new Map(); // id → {x, y}
  chapters.forEach((ch, i) => {
    const x = LAYOUT.CHAPTER_X0 + i * LAYOUT.CHAPTER_GAP;
    const y = LAYOUT.CHAPTER_Y;
    chapterPos.set(ch.id, { x, y });
    ch._lx = x; ch._ly = y;
  });

  // 2) 每章内 Lv1 主链 + 分支
  chapters.forEach(ch => {
    const cx = chapterPos.get(ch.id).x;
    // 直接子场景 (parentId = 章节)
    const directChildren = NODES.filter(n => n.level === 1 && n.parentId === ch.id);
    // 找链头: 无其他 Lv1 场景的 nextId 指向它
    const nextSet = new Set(NODES.filter(n => n.level === 1 && n.nextId).map(n => n.nextId));
    let heads = directChildren.filter(c => !nextSet.has(c.id));
    if (!heads.length && directChildren.length) heads = [directChildren[0]];

    // 沿 nextId 链式排列主链 (分栏折返: 每 COL_WRAP 个节点换列)
    const placed = new Set();
    heads.forEach(head => {
      let cur = head, idx = 0;
      while (cur && !placed.has(cur.id)) {
        const col = Math.floor(idx / LAYOUT.COL_WRAP);
        const row = idx % LAYOUT.COL_WRAP;
        cur._lx = cx + col * LAYOUT.COL_GAP;
        cur._ly = LAYOUT.SCENE_Y0 + row * LAYOUT.SCENE_GAP;
        placed.add(cur.id);
        cur = cur.nextId ? _nodeMap.get(cur.nextId) : null;
        idx++;
        if (idx > 200) break; // 防死循环
      }
    });

    // 3) Lv1 分支 (parentId 是 Lv1 而非章节): 定位到父场景下一行, 横向展开
    const branches = NODES.filter(n => n.level === 1 && n.parentId && _nodeMap.has(n.parentId) && _nodeMap.get(n.parentId).level === 1);
    // 按父场景分组
    const byParent = new Map();
    branches.forEach(b => {
      if (!byParent.has(b.parentId)) byParent.set(b.parentId, []);
      byParent.get(b.parentId).push(b);
    });
    byParent.forEach((list, parentId) => {
      const parent = _nodeMap.get(parentId);
      if (!parent || parent._lx === undefined) return;
      const by = parent._ly + LAYOUT.SCENE_GAP;
      list.forEach((b, i) => {
        // 左右交替扇开: 偶数索引左, 奇数索引右
        const side = (i % 2 === 0) ? -1 : 1;
        const off = side * (LAYOUT.BRANCH_OFFSET * (Math.floor(i / 2) + 1));
        b._lx = parent._lx + off;
        b._ly = by;
      });
    });
  });

  // 4) Lv2 对话: 父 Lv1 下方本地行, 横向居中
  const lv2ByParent = new Map();
  NODES.filter(n => n.level === 2).forEach(n => {
    if (!lv2ByParent.has(n.parentId)) lv2ByParent.set(n.parentId, []);
    lv2ByParent.get(n.parentId).push(n);
  });
  lv2ByParent.forEach((list, parentId) => {
    const parent = _nodeMap.get(parentId);
    if (!parent || parent._lx === undefined) {
      // 父未定位, 兜底放原点
      list.forEach(n => { n._lx = n.x || 0; n._ly = n.y || 0; });
      return;
    }
    const py = parent._ly + LAYOUT.LV2_DY;
    const n = list.length;
    list.forEach((d, i) => {
      d._lx = parent._lx + (i - (n - 1) / 2) * LAYOUT.LV2_GAP;
      d._ly = py;
    });
  });

  // 5) 写回 _origX/_origY (弹簧锚点) ; 数据 x/y 不再使用
  NODES.forEach(n => {
    if (n._lx === undefined) { n._lx = n.x || 0; n._ly = n.y || 0; }
    n._origX = n._lx;
    n._origY = n._ly;
  });

  // 构建反向索引 (nextId → nodeId) 供 findPrevNode O(1) 使用
  // 优先使用真实节点 (虚拟节点的 nextId 可能与 Trial 重复, 不应覆盖)
  _prevId.clear();
  NODES.forEach(n => { if (n.nextId && !n._isVirtual) _prevId.set(n.nextId, n.id); });
  NODES.forEach(n => { if (n.nextId && n._isVirtual && !_prevId.has(n.nextId)) _prevId.set(n.nextId, n.id); });
}

// ══════════════════════════════════════════════════
//  数据加载 + 初始化
//══════════════════════════════════════════════════
async function initData() {
  const actName = document.body.dataset.act || 'act01';
  try {
    const res = await fetch('./data/' + actName + '.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    NODES = data.nodes || [];
    _nodeMap = new Map(NODES.map(n => [n.id, n]));

    // 加载社区标注 (annotations.<act>.json), 失败时静默降级
    try {
      const annRes = await fetch('./data/annotations.' + actName + '.json');
      if (annRes.ok) ANNOTATIONS = await annRes.json();
    } catch (e) { /* 静默: 无标注文件时使用空默认值 */ }

    // Task 2+3: 构建虚拟异议结果节点 (在 computeLayout 之前, 使其参与布局)
    buildVirtualObjectionNodes();
    computeLayout();
    // Task 3: 重新定位正确选项虚拟节点 (位于 Trial 与 nextTrial 之间)
    _repositionVirtualNodes();
    buildRouteFilters();
    buildCanvas();
    buildChapterNav();  // 增强 2: 构建章节导航侧栏
    updateTransform();
    // 强制初始连线更新: 等 2 帧 RAF 让 _resolveOverlaps 首帧运行 + 节点尺寸就绪, 再全量刷新连线
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        _layoutDirty = true;
        updateAllConnectors();
      });
    });
    startFloatLoop();
    // 数据加载完成后淡出开屏动画 (最少展示 2.4s 保证动画完整 + 连线渲染稳定)
    const elapsed = performance.now() - _splashStart;
    const delay = Math.max(0, 2400 - elapsed);
    setTimeout(function() {
      // 等 2 帧 RAF 让 floatLoop 布局稳定 + 连线定位完成, 再隐藏 splash
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          const splash = document.getElementById('splash');
          if (splash) splash.classList.add('hide');
          handleHashDeepLink();  // BUG-1: #node-<id> 深链 → 居中并打开目标节点
          initOnboarding();  // 增强 5: 首次访问引导提示
        });
      });
    }, delay);
  } catch (err) {
    const splash = document.getElementById('splash');
    if (splash) splash.classList.add('hide');
    showLoadError(err);
  }
}

function showLoadError(err) {
  const box = document.getElementById('load-error');
  const msg = document.getElementById('load-error-msg');
  const actName = document.body.dataset.act || 'act01';
  msg.innerHTML = '无法加载 <code>./data/' + actName + '.json</code>。<br>'
    + '若通过 file:// 直接打开本页面，fetch 会被浏览器禁止。请使用本地服务器预览：<br><br>'
    + '<code>python -m http.server 8000</code><br>'
    + '然后访问 <code>http://localhost:8000/</code><br><br>'
    + '错误详情：' + (err && err.message ? err.message : err);
  box.classList.add('show');
}

// 根据数据动态生成路由过滤按钮 (扫描 NODES 的 route 字段去重)
function buildRouteFilters() {
  const routes = ['all', ...new Set(NODES.map(n => n.route).filter(Boolean))];
  const container = document.getElementById('route-filters');
  container.innerHTML = '';
  routes.forEach(r => {
    const btn = document.createElement('button');
    btn.className = 'route-btn' + (r === 'all' ? ' active' : '');
    btn.dataset.route = r;
    btn.textContent = r === 'all' ? '全部' : (ROUTE_LABELS[r] || r);
    btn.addEventListener('click', function() {
      document.querySelectorAll('.route-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      updateAllNodeVisibility();
    });
    container.appendChild(btn);
  });
}

// ══════════════════════════════════════════════════
//  Canvas Zoom/Pan 引擎
//══════════════════════════════════════════════════
const container = document.getElementById('canvas-container');
const canvas = document.getElementById('canvas');

let viewX = 500, viewY = 460;   // 摄像机在画布坐标系中的聚焦点 (初始居中于第一章场景)
let zoom = 1.0;                  // 连续缩放值 [0.4, 2.8]
const ZOOM_MIN = 0.4, ZOOM_MAX = 2.8;
let _connectors = [];             // 连接线引用表 [{el, _fEl, _tEl, fromId, toId}]

// ── 节点拖拽 + 惯性状态 ──
let _dragNode = null;             // { el, startX, startY, origOX, origOY, moved, node, lastX, lastY }
let _dragTrack = [];              // 每帧增量位移采样 [{dx, dy, t}, ...] 最近 5 帧 (B1: dx/dy 为相邻帧增量, 非累计)
let _inertiaList = [];            // [{ el, vx, vy }] 惯性减速中的节点

let _panMoved = false;            // B5: 画布平移是否发生位移 (用于抑制 dblclick)

// 控件引用
const zoomPct = document.getElementById('zoom-pct');
const zoomFill = document.getElementById('zoom-fill');
const zoomTag = document.getElementById('zoom-tag');
const qZoomBtns = document.querySelectorAll('#quick-zoom button');

function clamp(v,min,max){ return v<min?min:v>max?max:v; }
function lerp(a,b,t){ return a+(b-a)*t; }

function updateTransform() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  const tx = w/2 - viewX * zoom;
  const ty = h/2 - viewY * zoom;
  canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;

  // 更新缩放指示器
  const pct = Math.round((zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN) * 100);
  zoomPct.textContent = Math.round(zoom * 100) + '%';
  zoomFill.style.width = pct + '%';

  if (zoom < 0.40) zoomTag.textContent = '概览';
  else if (zoom < 1.10) zoomTag.textContent = '场景';
  else zoomTag.textContent = '对话';

  // 更新快捷按钮 active
  qZoomBtns.forEach(b => {
    const t = parseFloat(b.dataset.zoom);
    const tol = t > 1.0 ? 0.15 : 0.06;
    b.classList.toggle('active', Math.abs(zoom - t) < tol);
  });

  // 更新所有节点的可见度 (缩放变化后触发一次碰撞检测)
  _layoutDirty = true;
  updateAllNodeVisibility();
}

// ── 节点可见度计算 ──
// 核心逻辑：根据当前 zoom 值平滑计算每个节点的不透明度
// lv0: zoom 0.30-0.40 淡入 (0.40 时仅显示章节)
// lv1: zoom 0.40-0.45 淡入 (0.45 时场景完全显示)
// lv2: zoom 1.00-1.80 淡入 (对话级, 1.0x 开始淡入, 1.8x 完全可见)
// 使用 smoothstep 在两个区间之间过渡，确保节点不会突然消失
function getNodeOpacity(node) {
  const lv = node.level;

  let zMin, zMax;
  if (lv === 0) { zMin = 0.30; zMax = 0.40; }
  else if (lv === 1) { zMin = 0.40; zMax = 0.45; }
  else { zMin = 1.00; zMax = 1.80; } // Lv2 对话: 1.0x 开始淡入, 1.8x 完全可见

  // clamp 后的平滑曲线
  const t = clamp((zoom - zMin) / (zMax - zMin), 0, 1);
  // smoothstep 让过渡更自然
  const s = t * t * (3 - 2 * t);
  return s;
}

function updateAllNodeVisibility() {
  const searchText = document.getElementById('search-input').value.trim().toLowerCase();
  const activeRoute = document.querySelector('.route-btn.active')?.dataset.route || 'all';

  _nodeEls.forEach(el => {
    const nodeId = el.dataset.id;
    const node = _nodeMap.get(nodeId);
    if (!node) return;

    // 虚拟节点默认隐藏, 跳过常规可见度计算
    if (node._hidden) { el.style.display = 'none'; return; }
    // 显示中的虚拟节点: 完全可见, 不参与 zoom 淡入 (opacity 由动画 class 控制)
    if (node._isVirtual && !node._hidden) {
      el.style.opacity = 1;
      el.style.pointerEvents = 'auto';
      el._vis = true;
      return;
    }

    // 基础可见度
    let opacity = getNodeOpacity(node);
    // 路线过滤
    if (activeRoute !== 'all') {
      if (activeRoute === 'normal' && node.route !== 'normal') opacity = 0;
      else if (node.route !== activeRoute) opacity = 0;
    }
    // 搜索过滤：匹配 title, character, text
    if (searchText) {
      const matchTitle = (node.title||'').toLowerCase().includes(searchText);
      const matchChar = (node.character||'').toLowerCase().includes(searchText);
      const matchText = (node.text||'').toLowerCase().includes(searchText);
      const matchSum = (node.summary||'').toLowerCase().includes(searchText);
      if (!matchTitle && !matchChar && !matchText && !matchSum) {
        opacity = Math.min(opacity, 0.08); // 不匹配的节点极度淡化
      }
    }
    el.style.opacity = opacity; // B4: 移除冗余 Math.max(0, ...) (smoothstep 结果已 >= 0)
    el.style.pointerEvents = opacity > 0.15 ? 'auto' : 'none';
    el._vis = opacity > 0.01; // A2: 缓存可见标志, 避免浮动画每帧读 style
  });

  // 也更新连接线 (使用缓存的引用)
  _connectors.forEach(ref => {
    const fromOp = ref._fEl ? (parseFloat(ref._fEl.style.opacity)||0) : 0;
    const toOp = ref._tEl ? (parseFloat(ref._tEl.style.opacity)||0) : 0;
    ref.el.style.opacity = Math.max(0, Math.min(fromOp, toOp) * 0.8);
  });
}

// ── 鼠标滚轮缩放 ──
container.addEventListener('wheel', function(e) {
  e.preventDefault();

  const rect = container.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // 鼠标所在点在画布坐标系中的位置
  const canvasX = (mouseX - container.clientWidth/2) / zoom + viewX;
  const canvasY = (mouseY - container.clientHeight/2) / zoom + viewY;

  // 缩放因子
  const factor = e.deltaY < 0 ? 1.08 : 0.92;
  zoom = clamp(zoom * factor, ZOOM_MIN, ZOOM_MAX);

  // 保持鼠标下的画布点不动
  viewX = canvasX - (mouseX - container.clientWidth/2) / zoom;
  viewY = canvasY - (mouseY - container.clientHeight/2) / zoom;

  updateTransform();
}, { passive: false });

// ── 拖拽：节点拖动 vs 画布平移 ──
let isDragging = false, dragStartX, dragStartY, dragOrigViewX, dragOrigViewY;
let _canvasPanTrack = [];    // 画布平移速度追踪 [{dx,dy,t}, ...]
let _canvasInertia = null;  // 画布惯性 {vx, vy}

function _canvasCoords(e) {
  const rect = container.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  return {
    x: (mx - container.clientWidth/2) / zoom + viewX,
    y: (my - container.clientHeight/2) / zoom + viewY
  };
}

container.addEventListener('mousedown', function(e) {
  const nodeEl = e.target.closest('.node');
  if (nodeEl) {
    // 节点拖动
    e.stopPropagation(); e.preventDefault();
    const pos = _canvasCoords(e);
    _dragNode = {
      el: nodeEl,
      startX: pos.x, startY: pos.y,
      lastX: pos.x, lastY: pos.y,   // B1: 用于计算每帧增量位移
      origOX: parseFloat(nodeEl.dataset.ox) || 0,
      origOY: parseFloat(nodeEl.dataset.oy) || 0,
      moved: false,
      node: _nodeMap.get(nodeEl.dataset.id)
    };
    _dragTrack = [];
    nodeEl.style.transition = 'none';
    return;
  }
  // 画布平移
  isDragging = true;
  _panMoved = false; // B5: 重置平移位移标记
  dragStartX = e.clientX; dragStartY = e.clientY;
  dragOrigViewX = viewX; dragOrigViewY = viewY;
  container.classList.add('grabbing');
});

window.addEventListener('mousemove', function(e) {
  if (_dragNode) {
    const pos = _canvasCoords(e);
    const dx = pos.x - _dragNode.startX;   // 相对拖拽起点的累计位移 (用于定位节点)
    const dy = pos.y - _dragNode.startY;
    if (Math.abs(dx) + Math.abs(dy) > 2) _dragNode.moved = true;
    const nx = _dragNode.origOX + dx;
    const ny = _dragNode.origOY + dy;
    _dragNode.el.style.left = nx + 'px';
    _dragNode.el.style.top = ny + 'px';
    _dragNode.el.dataset.ox = nx;
    _dragNode.el.dataset.oy = ny;
    // B1: 记录每帧增量位移 (相对上一帧, 非累计), 用于精确求速度
    const dxFrame = pos.x - _dragNode.lastX;
    const dyFrame = pos.y - _dragNode.lastY;
    _dragTrack.push({ dx: dxFrame, dy: dyFrame, t: performance.now() });
    if (_dragTrack.length > 5) _dragTrack.shift();
    _dragNode.lastX = pos.x; _dragNode.lastY = pos.y;
    updateAllConnectors();
    return;
  }
  if (!isDragging) return;
  viewX = dragOrigViewX - (e.clientX - dragStartX) / zoom;
  viewY = dragOrigViewY - (e.clientY - dragStartY) / zoom;
  // 记录画布平移速度 (每帧位移+时间戳, 用于释放时计算惯性)
  _canvasPanTrack.push({ dx: e.movementX, dy: e.movementY, t: performance.now() });
  if (_canvasPanTrack.length > 5) _canvasPanTrack.shift();
  // B5: 累计平移位移, 超过阈值则标记 (抑制后续 dblclick)
  if (Math.abs(e.clientX - dragStartX) + Math.abs(e.clientY - dragStartY) > 5) _panMoved = true;
  updateTransform();
});

window.addEventListener('mouseup', function(e) {
  if (_dragNode) {
    _dragNode.el.style.transition = '';
    const dn = _dragNode;
    _dragNode = null;
    const nx = parseFloat(dn.el.dataset.ox) || 0;
    const ny = parseFloat(dn.el.dataset.oy) || 0;

    if (!dn.moved) {
      if (dn.node) openPhoneWithNode(dn.node);
    } else {
      // 更新锚点为拖拽终点（_resolveOverlaps 每帧基于此推开邻居, 消除重叠后自动弹回）
      dn.el._origX = nx; dn.el._origY = ny;
      if (dn.node) { dn.node.x = nx; dn.node.y = ny; }
      // B1: 计算惯性速度 — 加权平均每帧增量速度 (dx_frame / dt)
      if (_dragTrack.length >= 2) {
        let vx = 0, vy = 0, tw = 0;
        for (let i = 1; i < _dragTrack.length; i++) {
          const dt = (_dragTrack[i].t - _dragTrack[i-1].t) / 1000;
          if (dt > 0.001) {
            const w = i; // 越近的帧权重越大
            vx += (_dragTrack[i].dx / dt) * w;
            vy += (_dragTrack[i].dy / dt) * w;
            tw += w;
          }
        }
        if (tw > 0) { vx /= tw; vy /= tw; }
        _inertiaList.push({ el: dn.el, vx, vy });
      } else {
        // 无惯性: 由 updateFloats 的 _resolveOverlaps 在后续帧平滑推开邻居
        updateAllConnectors();
      }
    }
    _dragTrack = [];
    return;
  }
  if (isDragging) {
    // 计算画布惯性速度 (屏幕像素/秒)
    if (_canvasPanTrack.length >= 2) {
      let vx = 0, vy = 0, tw = 0;
      for (let i = 1; i < _canvasPanTrack.length; i++) {
        const dt = (_canvasPanTrack[i].t - _canvasPanTrack[i-1].t) / 1000;
        if (dt > 0.001) {
          const w = i;
          vx += (_canvasPanTrack[i].dx / dt) * w;
          vy += (_canvasPanTrack[i].dy / dt) * w;
          tw += w;
        }
      }
      if (tw > 0) { vx /= tw; vy /= tw; }
      _canvasInertia = { vx: -vx / zoom, vy: -vy / zoom };
      startFloatLoop();
    }
    _canvasPanTrack = [];
    isDragging = false;
    container.classList.remove('grabbing');
  }
});

// ── 触摸支持（移动端捏合 + 拖动） ──
let touchDist0 = 0, touchZoom0 = 0, touchViewX0 = 0, touchViewY0 = 0;
let touchMidX0 = 0, touchMidY0 = 0; // 初始双指中点
let _lastTouchX = null, _lastTouchY = null; // 触摸速度追踪

container.addEventListener('touchstart', function(e) {
  if (e.touches.length === 2) {
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    touchDist0 = Math.hypot(dx, dy);
    touchZoom0 = zoom;
    touchViewX0 = viewX; touchViewY0 = viewY;
    touchMidX0 = (e.touches[0].clientX + e.touches[1].clientX)/2;
    touchMidY0 = (e.touches[0].clientY + e.touches[1].clientY)/2;
  } else if (e.touches.length === 1) {
    isDragging = true;
    _panMoved = false;
    dragStartX = e.touches[0].clientX; dragStartY = e.touches[0].clientY;
    dragOrigViewX = viewX; dragOrigViewY = viewY;
  }
}, { passive: false });

container.addEventListener('touchmove', function(e) {
  if (e.touches.length === 2) {
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    const rect = container.getBoundingClientRect();
    const midX = (e.touches[0].clientX + e.touches[1].clientX)/2 - rect.left;
    const midY = (e.touches[0].clientY + e.touches[1].clientY)/2 - rect.top;
    if (touchDist0 > 0) {
      zoom = clamp(touchZoom0 * dist / touchDist0, ZOOM_MIN, ZOOM_MAX);
      // 缩放到双指中点
      const cx = (midX - container.clientWidth/2) / touchZoom0 + touchViewX0;
      const cy = (midY - container.clientHeight/2) / touchZoom0 + touchViewY0;
      viewX = cx - (midX - container.clientWidth/2) / zoom;
      viewY = cy - (midY - container.clientHeight/2) / zoom;
    }
    updateTransform();
  } else if (e.touches.length === 1 && isDragging) {
    const tx = e.touches[0].clientX, ty = e.touches[0].clientY;
    viewX = dragOrigViewX - (tx - dragStartX) / zoom;
    viewY = dragOrigViewY - (ty - dragStartY) / zoom;
    _canvasPanTrack.push({ dx: tx - (_lastTouchX||tx), dy: ty - (_lastTouchY||ty), t: performance.now() });
    if (_canvasPanTrack.length > 5) _canvasPanTrack.shift();
    _lastTouchX = tx; _lastTouchY = ty;
    if (Math.abs(tx - dragStartX) + Math.abs(ty - dragStartY) > 5) _panMoved = true;
    updateTransform();
  }
}, { passive: false });

container.addEventListener('touchend', function() {
  if (isDragging && _canvasPanTrack.length >= 2) {
    let vx = 0, vy = 0, tw = 0;
    for (let i = 1; i < _canvasPanTrack.length; i++) {
      const dt = (_canvasPanTrack[i].t - _canvasPanTrack[i-1].t) / 1000;
      if (dt > 0.001) {
        const w = i;
        vx += (_canvasPanTrack[i].dx / dt) * w;
        vy += (_canvasPanTrack[i].dy / dt) * w;
        tw += w;
      }
    }
    if (tw > 0) { vx /= tw; vy /= tw; }
    _canvasInertia = { vx: -vx / zoom, vy: -vy / zoom };
    startFloatLoop();
  }
  _canvasPanTrack = []; _lastTouchX = null; _lastTouchY = null;
  isDragging = false; touchDist0 = 0;
  container.classList.remove('grabbing');
});

// ── 快捷缩放按钮 (平滑动画) ──
qZoomBtns.forEach(btn => {
  btn.addEventListener('click', function() {
    const target = parseFloat(this.dataset.zoom);
    // 根据目标缩放级别重新居中
    let targetVX = viewX, targetVY = viewY;
    if (target <= 0.45) {
      // 概览: 居中于章节行 (A1C1 与 A1C2 中点)
      targetVX = (LAYOUT.CHAPTER_X0 + LAYOUT.CHAPTER_X0 + LAYOUT.CHAPTER_GAP) / 2;
      targetVY = LAYOUT.CHAPTER_Y;
    } else if (target <= 0.6) {
      // 场景: 居中于第一栏场景
      targetVX = LAYOUT.CHAPTER_X0;
      targetVY = LAYOUT.SCENE_Y0 + 200;
    }
    // 对话: 保持当前位置不重定位

    const startZoom = zoom, startVX = viewX, startVY = viewY;
    const startTime = performance.now();
    const duration = 500; // ms

    function animate(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      zoom = lerp(startZoom, target, eased);
      viewX = lerp(startVX, targetVX, eased);
      viewY = lerp(startVY, targetVY, eased);
      updateTransform();
      if (t < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  });
});

// ══════════════════════════════════════════════════
//  DOM 构建：生成节点和连接线
//══════════════════════════════════════════════════
function buildCanvas() {
  canvas.innerHTML = '';

  // ── Step 1: 先创建所有节点（后续连接线需要引用 DOM 元素）──
  NODES.forEach(node => {
    const el = document.createElement('div');
    el.className = 'node lv' + node.level;
    if (node.isChoice) el.classList.add('is-choice');
    if (node.route && node.route.startsWith('bad')) el.classList.add('is-bad');
    // Task 2+3: 虚拟异议结果节点样式
    if (node._isVirtual) {
      el.classList.add('is-virtual');
      if (node._isCorrect) el.classList.add('objection-correct');
      else el.classList.add('objection-wrong');
      // Task 9: 子选项虚拟节点层级标识 (用于 CSS 视觉区分)
      if (node._parentChoiceId) {
        el.classList.add('is-subchoice');
        // 计算子选项深度 (沿 parentChoice 链回溯层数)
        var __d = 1, __p = _nodeMap.get('virt_' + node._parentChoiceId);
        while (__p && __p._parentChoiceId) { __d++; __p = _nodeMap.get('virt_' + __p._parentChoiceId); }
        el.dataset.subDepth = String(__d);
      }
      // Task: 证人/证物分支节点样式
      if (node._branchKind === 'witness') el.classList.add('is-witness');
      if (node._branchKind === 'evidence') el.classList.add('is-evidence');
    }
    el.dataset.id = node.id;
    el.style.left = node._origX + 'px';
    el.style.top = node._origY + 'px';
    el.dataset.ox = node._origX;
    el.dataset.oy = node._origY;
    el.textContent = node.title;
    // 虚拟节点默认隐藏 (仅通过弹窗点击触发显示)
    if (node._hidden) { el.style.display = 'none'; el.classList.add('virt-hidden'); }

    // 角色气泡颜色 (Lv2): 边框 + 背景色晕染
    if (node.level === 2 && node.character) {
      el.classList.add('char-' + node.character);
      // Noah 使用 CSS 渐变三色边框, 跳过内联样式
      if (node.character !== 'Noah') {
        const c = `var(--char-${node.character}, var(--node-border))`;
        el.style.borderColor = c;
        el.style.setProperty('--char-color', c);
        el.style.backgroundColor = `color-mix(in srgb, ${c} 14%, var(--node-bg))`;
      }
    }

    // 错落延迟 (基于 id 生成)
    const staggerBase = parseInt(node.id.replace(/\D/g,'').slice(-3) || '0');
    el.style.transitionDelay = 'calc(' + (staggerBase % 20) * 0.008 + 's)';

    // 漂浮参数 (独立相位 + 缓慢速度)
    el._float = {
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
      speedX: 0.3 + Math.random() * 0.5,
      speedY: 0.35 + Math.random() * 0.45,
      amp: node.level === 0 ? 1.5 : node.level === 1 ? 2.0 : 2.5,
    };

    // 基准锚点 (由 computeLayout 计算, 用于防重叠弹簧回弹)
    el._origX = node._origX; el._origY = node._origY;

    canvas.appendChild(el);
  });

  // P1: 缓存节点元素列表 (后续 updateFloats / visibility / 碰撞 均使用此数组, 避免每帧 querySelectorAll)
  _nodeEls = Array.from(canvas.querySelectorAll('.node'));

  // 节点 DOM 索引: id → element
  const nodeMap = {};
  _nodeEls.forEach(el => { nodeMap[el.dataset.id] = el; });

  // ── Step 2: 创建连接线 (连线跟随节点 DOM 位置) ──
  _connectors = []; // 全局引用表，用于后续更新

  function addLine(fromId, toId, cls) {
    const fEl = nodeMap[fromId], tEl = nodeMap[toId];
    if (!fEl || !tEl) return;
    const line = document.createElement('div');
    line.className = 'connector ' + (cls || '');
    canvas.appendChild(line);
    const ref = { el: line, fromId, toId };
    _connectors.push(ref);
  }

  // 1) 顺序连接 (nextId): 章节横向链 + 场景纵向链
  NODES.forEach(n => {
    if (!n.nextId) return;
    const target = _nodeMap.get(n.nextId);
    // 两端均 level=0 → 章节横向时间轴链
    const cls = (n.level === 0 && target && target.level === 0) ? 'chapter-link' : 'seq';
    addLine(n.id, n.nextId, cls);
  });

  // 2) 选择点 → 分支结局 (choices.leadsTo)
  NODES.forEach(n => {
    if (!n.choices) return;
    n.choices.forEach(ch => {
      if (_nodeMap.has(ch.leadsTo)) addLine(n.id, ch.leadsTo, 'dashed');
    });
  });

  // Task 2+3: 虚拟异议结果节点连接线 — Trial → virtual (主选项) / parent virtual → virtual (子选项)
  NODES.forEach(n => {
    if (!n._isVirtual || !n.parentId) return;
    const cls = n._isCorrect ? 'objection-correct' : 'objection-wrong';
    // 子选项: 从父选项虚拟节点连接 (若父选项虚拟节点存在)
    if (n._parentChoiceId) {
      var parentVirtId = 'virt_' + n._parentChoiceId;
      if (_nodeMap.has(parentVirtId)) {
        // Task 9: 添加 is-subchoice-link 类以触发更细更淡的连接线样式
        var linkCls = cls + ' is-subchoice-link' + (n._branchKind ? ' is-' + n._branchKind + '-link' : '');
        addLine(parentVirtId, n.id, linkCls);
        return;
      }
      // 父选项虚拟节点不存在: 回退到 Trial (沿用下方主选项逻辑)
    }
    addLine(n.parentId, n.id, cls);
  });

  // 所有连接线初始定位 + 存储 DOM 引用
  _connectors.forEach(ref => {
    const fEl = nodeMap[ref.fromId];
    const tEl = nodeMap[ref.toId];
    if (!fEl || !tEl) return;
    ref._fEl = fEl;
    ref._tEl = tEl;
    _updateOneConnector(ref);
  });

  // 初始隐藏端点含隐藏虚拟节点的连接线 (避免开局出现悬空线)
  _connectors.forEach(ref => {
    const fNode = _nodeMap.get(ref.fromId);
    const tNode = _nodeMap.get(ref.toId);
    if ((fNode && fNode._hidden) || (tNode && tNode._hidden)) {
      ref.el.style.display = 'none';
    }
  });

  // 缓存节点尺寸 (AABB 防重叠用, 避免每帧 offsetWidth 布局读取)
  _nodeEls.forEach(el => { el._w = el.offsetWidth || 80; el._h = el.offsetHeight || 30; });
}

// ── 更新单条连接线 ──
// 默认: 源底部中央 → 目标顶部中央 (纵向链)
// chapter-link: 源右中 → 目标左中 (横向时间轴)
function _updateOneConnector(ref) {
  const fEl = ref._fEl, tEl = ref._tEl;
  if (!fEl || !tEl) return;
  const fl = parseFloat(fEl.style.left) || 0;
  const ft = parseFloat(fEl.style.top) || 0;
  const tl = parseFloat(tEl.style.left) || 0;
  const tt = parseFloat(tEl.style.top) || 0;
  const fw = fEl._w, fh = fEl._h;
  const tw = tEl._w, th = tEl._h;
  let fx, fy, tx, ty;
  if (ref.el.classList.contains('chapter-link')) {
    // 横向: 源右中 → 目标左中
    fx = fl + fw; fy = ft + fh / 2;
    tx = tl; ty = tt + th / 2;
  } else {
    // 纵向: 源底中 → 目标顶中
    fx = fl + fw / 2; fy = ft + fh;
    tx = tl + tw / 2; ty = tt;
  }
  const dx = tx - fx;
  const dy = ty - fy;
  const len = Math.hypot(dx, dy);
  ref.el.style.left = fx + 'px';
  ref.el.style.top = fy + 'px';
  ref.el.style.width = len + 'px';
  ref.el.style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
  ref.el.dataset.from = ref.fromId;
  ref.el.dataset.to = ref.toId;
}

// ══════════════════════════════════════════════════
//  防重叠系统 (AABB + 平滑 lerp)
//
// 坐标体系:
//   _origX/_origY  — 布局原点 (computeLayout 计算), 弹簧锚点
//   dataset.ox/oy  — 当前基准位, 被 resolver 平滑修改
//   style.left/top — 基准 + 漂浮 (sin/cos), 纯视觉
//
// 策略:
//   - 每帧用真实包围盒(AABB)检测重叠, 沿最小穿透轴推开
//   - lerp 趋近目标位置 (平滑滑行, 非跳动)
//   - 重叠消除后自动弹回 _origX/_origY (无漂移, 无需 B2 还原)
//   - 拖拽中节点跳过弹簧, 但仍作碰撞源推开邻居
//══════════════════════════════════════════════════

function _driftLimit(lv) { return [220, 170, 120][lv] || 150; }

// 每帧调用: AABB 检测 + lerp 趋近无重叠位置
function _resolveOverlaps(dt) {
  const vis = _nodeEls.filter(el => (parseFloat(el.style.opacity) || 0) > 0.15 && el._w);
  if (vis.length < 2) return;

  const PAD = 10;                                    // A4: 碰撞 padding (视觉呼吸空间)
  const dragging = !!_dragNode?.el;
  const k = clamp(dt * (dragging ? 14 : 8), 0, 1);   // A6: 拖拽时加速响应

  // 虚拟位置 (迭代间更新, 不写 DOM)
  const vx = new Map(), vy = new Map();
  for (const el of vis) {
    vx.set(el, parseFloat(el.dataset.ox) || 0);
    vy.set(el, parseFloat(el.dataset.oy) || 0);
  }

  // A3: 3 次迭代传播链式推力
  for (let iter = 0; iter < 3; iter++) {
    const pushX = new Map(), pushY = new Map();
    for (const el of vis) { pushX.set(el, 0); pushY.set(el, 0); }

    for (let i = 0; i < vis.length; i++) {
      for (let j = i + 1; j < vis.length; j++) {
        const a = vis[i], b = vis[j];
        const ax = vx.get(a), ay = vy.get(a);
        const bx = vx.get(b), by = vy.get(b);
        const aw = a._w + PAD, ah = a._h + PAD, bw = b._w + PAD, bh = b._h + PAD;
        const overlapX = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
        const overlapY = Math.min(ay + ah, by + bh) - Math.max(ay, by);
        if (overlapX > 0 && overlapY > 0) {
          const aDrag = (a === _dragNode?.el), bDrag = (b === _dragNode?.el);
          // A5: 加权推力 — 一方拖拽时另一方承担全部
          const sa = aDrag ? 0 : (bDrag ? 1 : 0.5);
          const sb = bDrag ? 0 : (aDrag ? 1 : 0.5);
          if (overlapX < overlapY) {
            const dir = (ax + aw / 2) < (bx + bw / 2) ? -1 : 1;
            pushX.set(a, pushX.get(a) + dir * overlapX * sa);
            pushX.set(b, pushX.get(b) - dir * overlapX * sb);
          } else {
            const dir = (ay + ah / 2) < (by + bh / 2) ? -1 : 1;
            pushY.set(a, pushY.get(a) + dir * overlapY * sa);
            pushY.set(b, pushY.get(b) - dir * overlapY * sb);
          }
        }
      }
    }
    // 应用推力到虚拟位置 (拖拽中节点不更新)
    for (const el of vis) {
      if (el === _dragNode?.el) continue;
      vx.set(el, vx.get(el) + pushX.get(el));
      vy.set(el, vy.get(el) + pushY.get(el));
    }
  }

  // lerp 趋近虚拟目标, 漂移上限钳位; 跳过拖拽中节点
  let maxMove = 0;
  vis.forEach(el => {
    if (el === _dragNode?.el) return;
    const ox = el._origX, oy = el._origY;
    let tx = vx.get(el), ty = vy.get(el);
    const lv = el._lv || 1;
    const limit = _driftLimit(lv);
    let dx = tx - ox, dy = ty - oy, d = Math.hypot(dx, dy);
    if (d > limit) { tx = ox + dx / d * limit; ty = oy + dy / d * limit; }
    const cx = parseFloat(el.dataset.ox) || 0, cy = parseFloat(el.dataset.oy) || 0;
    const nx = cx + (tx - cx) * k, ny = cy + (ty - cy) * k;
    const moved = Math.abs(nx - cx) + Math.abs(ny - cy);
    if (moved > maxMove) maxMove = moved;
    el.dataset.ox = nx;
    el.dataset.oy = ny;
    // A1: 基准位置直接写入 style (供连线读取), 漂浮偏移由 updateFloats 用 transform 叠加
    el.style.left = nx + 'px';
    el.style.top  = ny + 'px';
  });

  if (maxMove > 0.3) _layoutDirty = true; // 触发本帧连线更新
}

// ── 轻微漂浮动效 + 惯性滑行 ──
let _floatLoopStarted = false;
let _lastFloatTime = 0;

function updateFloats(now) {
  const dt = Math.min((now - _lastFloatTime) / 1000, 0.1);
  _lastFloatTime = now;

  // A3: 防重叠仅在交互时运行 (拖动/惯性/布局变化/缩放), 静止浏览跳过节省 CPU
  const wasDirty = _layoutDirty;
  _layoutDirty = false;
  const hasInteraction = !!_dragNode || _inertiaList.length > 0;
  if (hasInteraction || wasDirty) {
    _resolveOverlaps(dt);
  }

  // A1: 漂浮偏移用 transform (GPU compositing, 不触发 Layout), 基准位置在 _resolveOverlaps 中写入 left/top
  // A2: 跳过不可见节点 (不写 DOM)
  _nodeEls.forEach(el => {
    if (el === _dragNode?.el) return;
    if (!el._float) return;
    const f = el._float;
    f.phaseX += f.speedX * dt;
    f.phaseY += f.speedY * dt;
    if (!el._vis) return;
    const bx = parseFloat(el.dataset.ox) || 0;
    const by = parseFloat(el.dataset.oy) || 0;
    el.style.left = bx + 'px';
    el.style.top  = by + 'px';
    el.style.transform = `translate(${Math.sin(f.phaseX) * f.amp}px, ${Math.cos(f.phaseY) * f.amp}px)`;
  });

  // 惯性滑行: 衰减速度, 更新位置, 速度太低时移除
  for (let i = _inertiaList.length - 1; i >= 0; i--) {
    const item = _inertiaList[i];
    const decay = Math.pow(0.94, dt * 60); // 94%/帧 (60fps基准)
    item.vx *= decay;
    item.vy *= decay;
    const nx = (parseFloat(item.el.dataset.ox) || 0) + item.vx * dt;
    const ny = (parseFloat(item.el.dataset.oy) || 0) + item.vy * dt;
    item.el.style.left = nx + 'px';
    item.el.style.top = ny + 'px';
    item.el.style.transform = ''; // A1: 清除漂浮位移, 惯性期间基线+惯性移动
    item.el.dataset.ox = nx;
    item.el.dataset.oy = ny;
    if (Math.abs(item.vx) < 0.5 && Math.abs(item.vy) < 0.5) {
      // 惯性结束: 锚定到最终位置, 同步 NODES (后续 resolver 自动弹开邻居)
      item.el._origX = nx; item.el._origY = ny;
      const n = _nodeMap.get(item.el.dataset.id);
      if (n) { n.x = nx; n.y = ny; }
      _inertiaList.splice(i, 1);
      _layoutDirty = true;
    }
  }

  // 画布惯性滑行: 衰减速度, 更新 viewX/viewY
  if (_canvasInertia) {
    const decay = Math.pow(0.92, dt * 60);
    _canvasInertia.vx *= decay;
    _canvasInertia.vy *= decay;
    viewX += _canvasInertia.vx * dt;
    viewY += _canvasInertia.vy * dt;
    updateTransform();
    if (Math.abs(_canvasInertia.vx) < 1 && Math.abs(_canvasInertia.vy) < 1) {
      _canvasInertia = null;
    }
  }

  // 连线更新: 惯性中 或 本帧发生布局位移 时更新 (稳定时跳过保性能)
  if (_inertiaList.length > 0 || _canvasInertia || _layoutDirty) updateAllConnectors();

  requestAnimationFrame(updateFloats);
}

function startFloatLoop() {
  if (_floatLoopStarted) return;
  _floatLoopStarted = true;
  _lastFloatTime = performance.now();
  requestAnimationFrame(updateFloats);
}

// ── 更新所有连接线以跟随节点位移 ──
function updateAllConnectors() {
  _connectors.forEach(ref => _updateOneConnector(ref));
}

// ══════════════════════════════════════════════════
//  详情面板
//══════════════════════════════════════════════════
const detailPanel = document.getElementById('detail-panel');
const detailOverlay = document.getElementById('detail-overlay');
const panelTitle = document.getElementById('panel-title');
const panelBody = document.getElementById('panel-body');
const objectionPopup = document.getElementById('objection-popup');
let focusedNodeId = null;

// ── 递归隐藏虚拟节点的所有子孙虚拟节点 (切换节点时同步隐藏子选项) ──
// exceptIds: 不应隐藏的节点 id 集合 (可选, 用于跳过 exceptId 的子孙)
function hideVirtualNodeDescendants(parentVirtId, exceptIds) {
  exceptIds = exceptIds || new Set();
  var parentChoiceId = parentVirtId.replace(/^virt_/, '');
  NODES.forEach(function(v) {
    if (!v._isVirtual || v._parentChoiceId !== parentChoiceId) return;
    if (exceptIds.has(v.id)) return;  // 跳过不应隐藏的节点
    v._hidden = true;
    var el = document.querySelector('.node[data-id="' + v.id + '"]');
    if (el) {
      el.classList.add('virt-hidden');
      (function(elRef, nodeId) {
        setTimeout(function() {
          var n2 = _nodeMap.get(nodeId);
          if (n2 && n2._hidden) elRef.style.display = 'none';
        }, 300);
      })(el, v.id);
    }
    // 隐藏子虚拟节点的专属连接线
    _connectors.forEach(function(ref) {
      if (ref.toId === v.id || ref.fromId === v.id) ref.el.style.display = 'none';
    });
    // 递归隐藏更深层的子孙
    hideVirtualNodeDescendants(v.id, exceptIds);
  });
}

// 隐藏全部已显示的虚拟节点 (切换节点时清理), exceptId 跳过当前节点及其祖先链
function hideAllVisibleVirtualNodes(exceptId) {
  // 仅保留 exceptId 与其祖先链: 子孙节点在返回父节点时应一并隐藏
  var exceptIds = new Set();
  if (exceptId) {
    exceptIds.add(exceptId);
    // 向上收集祖先链 (沿 _parentChoiceId 回溯)
    var curNode = _nodeMap.get(exceptId);
    while (curNode && curNode._parentChoiceId) {
      var ancestorId = 'virt_' + curNode._parentChoiceId;
      exceptIds.add(ancestorId);
      curNode = _nodeMap.get(ancestorId);
    }
  }

  NODES.forEach(function(n) {
    if (n._isVirtual && !n._hidden && !exceptIds.has(n.id)) {
      n._hidden = true;
      var el = document.querySelector('.node[data-id="' + n.id + '"]');
      if (el) {
        el.classList.add('virt-hidden');
        // 等过渡结束后再 display:none
        (function(elRef, nodeId) {
          setTimeout(function() {
            // 仅在仍然隐藏时才 display:none (避免被重新显示时误隐藏)
            var n2 = _nodeMap.get(nodeId);
            if (n2 && n2._hidden) elRef.style.display = 'none';
          }, 300);
        })(el, n.id);
      }
      // 同步隐藏虚拟节点的专属连接线 (objection + seq)
      _connectors.forEach(function(ref) {
        if (ref.toId === n.id || ref.fromId === n.id) ref.el.style.display = 'none';
      });
      // 同步隐藏其子孙虚拟节点 (递归, 跳过 exceptIds)
      hideVirtualNodeDescendants(n.id, exceptIds);
    }
  });
  // 统一校正各 Trial 的正确路径连续线 (转移到当前最深可见正确节点)
  reconcileTrialContinuations();
}

// ── 正确路径连续线校正 ──
// 每个 Trial 只显示"当前可见正确链中最深节点 → nextTrial"的连续线;
// 没有可见正确节点时恢复 Trial → nextTrial 原始连续线
function reconcileTrialContinuations() {
  var trials = new Set();
  NODES.forEach(function(n) {
    if (n._isVirtual && n._isCorrect && n._trialNodeId) trials.add(n._trialNodeId);
  });

  function _chainDepth(n) {
    var d = 1;
    var p = n._parentChoiceId ? _nodeMap.get('virt_' + n._parentChoiceId) : null;
    while (p) { d++; p = p._parentChoiceId ? _nodeMap.get('virt_' + p._parentChoiceId) : null; }
    return d;
  }

  trials.forEach(function(trialId) {
    var trial = _nodeMap.get(trialId);
    if (!trial || !trial.nextId) return;
    var visible = NODES.filter(function(n) {
      return n._isVirtual && n._isCorrect && n._trialNodeId === trialId && !n._hidden;
    });
    var activeId = null;
    if (visible.length) {
      var best = null, bestDepth = -1;
      visible.forEach(function(n) {
        var d = _chainDepth(n);
        if (d > bestDepth) { bestDepth = d; best = n; }
      });
      activeId = best ? best.id : null;
    }
    _connectors.forEach(function(ref) {
      if (ref.toId !== trial.nextId) return;
      var fromNode = _nodeMap.get(ref.fromId);
      if (fromNode && fromNode._isVirtual && fromNode._isCorrect && fromNode._trialNodeId === trialId) {
        ref.el.style.display = (activeId && ref.fromId === activeId) ? '' : 'none';
      } else if (ref.fromId === trialId) {
        ref.el.style.display = activeId ? 'none' : '';
      }
    });
  });
}

function openDetail(node) {
  // 切换节点时隐藏全部已显示的虚拟节点 (跳过当前要打开的节点)
  hideAllVisibleVirtualNodes(node.id);
  focusedNodeId = node.id;
  panelTitle.textContent = node.title;
  let html = '';
  const isTrial = node.type === 'ti' || node.type === 'tr';

  // 元信息
  html += '<div class="panel-meta">';
  const typeLabels = { adv:'日常剧情', ti:'审判开幕', tr:'审判辩论', bd:'Bad End', chapter:'章节' };
  html += `<span class="panel-tag">${typeLabels[node.type] || node.type}</span>`;
  if (node.level !== undefined) html += `<span class="panel-tag">Lv${node.level}</span>`;
  if (node.character) html += `<span class="panel-tag">${node.character}</span>`;
  if (node.route && node.route !== 'normal') html += `<span class="panel-tag bad">${node.route.toUpperCase()}</span>`;
  html += '</div>';

  // 摘要
  if (node.summary) {
    html += `<p style="color:var(--fg2);font-size:13px;line-height:1.6;margin-bottom:14px;">${escapeHtml(node.summary)}</p>`;
  }

  // 完整文本 — 按角色颜色高亮每条台词
  // Lv2: 取父场景 dialogue; Lv1: 取自身 dialogue
  const dlgSource = (node.level === 2 && node.parentId)
    ? (_nodeMap.get(node.parentId) || {})
    : node;
  const dlgFull = dlgSource.dialogue;  // 供全文索引使用
  const dlgTitle = (node.level === 2 && node.parentId)
    ? dlgSource.title
    : node.title;
  const dlg = filterMainlineDialogue(dlgSource);  // 自动过滤选择结果文本
  if (dlg && dlg.length) {
    html += `<div class="panel-section"><div class="panel-section-title">场景全文本 · ${escapeHtml(dlgTitle || '')}</div>`;
    dlg.forEach(d => {
      const color = `var(--char-${d.speaker}, var(--node-border))`;
      html += `<div class="transcript-item" style="border-left-color:${color}">`;
      html += `<div class="ti-speaker" style="color:${color}">${escapeHtml(d.speaker)}</div>`;
      html += `<div class="ti-text">${renderDialogueText(d)}</div>`;
      html += `</div>`;
    });
    html += '</div>';
  } else if (node.text) {
    html += `<div class="panel-section"><div class="panel-section-title">文本内容</div>`;
    html += `<div style="white-space:pre-wrap;font-size:13px;line-height:1.8;padding:12px;background:var(--bg2);border-radius:6px;">${escapeHtml(node.text).replace(/&lt;br&gt;\n?/g, '\n')}</div>`;
    html += '</div>';
  }

  // 全文索引 (仅 Trial 节点) — 显示每条 dialogue 的 label, 供管理员填写 resultRange
  // Task 5: 使用未过滤的 dlgFull (管理员需看到全部 label)
  if (isTrial && dlgFull && dlgFull.length) {
    html += `<div class="panel-section"><div class="panel-section-title">全文索引（供管理员填写 resultRange）</div>`;
    dlgFull.forEach(d => {
      const color = `var(--char-${d.speaker}, var(--node-border))`;
      const preview = d.text.replace(/<[^>]*>/g, '').replace(/\n/g, ' ').slice(0, 60);
      html += `<div class="text-index-item">`;
      html += `<span class="ti-label">${escapeHtml(d.label || '')}</span>`;
      html += `<span class="ti-speaker" style="color:${color}">${escapeHtml(d.speaker)}</span>: ${escapeHtml(preview)}${d.text.length > 60 ? '…' : ''}`;
      html += `</div>`;
    });
    html += '</div>';
  }

  // 选择点 — 选项列表
  if (node.choices && node.choices.length) {
    html += `<div class="panel-section"><div class="panel-section-title">选项</div>`;
    node.choices.forEach(ch => {
      const badge = ch.isBadEnd ? `<span class="choice-badge">Bad End</span>` :
                    ch.result ? `<span class="choice-badge">${escapeHtml(ch.result)}</span>` : '';
      html += `<div class="choice-item" data-goto="${escapeHtml(ch.leadsTo)}">
        <span class="choice-text">${escapeHtml(ch.text)}</span>${badge}
      </div>`;
    });
    html += '</div>';
  }

  // 分支树 (仅 Trial 节点) — 按 parentChoice 缩进树状显示每个 trialChoice 的结果分支
  if (isTrial && node.trialChoices && node.trialChoices.length) {
    const annMap = ANNOTATIONS.trialChoices || {};
    // 收集所有有效 choice（跳过 Common_Return/Cancel）
    const allChoices = node.trialChoices.filter(ch => {
      if (ch.id && /Common_Return/i.test(ch.id)) return false;
      if (ch.buttonType === 'Cancel') return false;
      return true;
    });
    // 构建 choiceId → choice 映射
    const choiceById = {};
    allChoices.forEach(ch => { if (ch.id) choiceById[ch.id] = ch; });
    // 构建 parentChoice → children 映射
    const childrenMap = {};
    allChoices.forEach(ch => {
      const ann = annMap[ch.id];
      const parent = ann && ann.parentChoice;
      if (parent && choiceById[parent]) {
        if (!childrenMap[parent]) childrenMap[parent] = [];
        childrenMap[parent].push(ch);
      }
    });
    // 找出根 choice（无 parentChoice 或 parentChoice 指向不存在的 choice）
    const roots = allChoices.filter(ch => {
      const ann = annMap[ch.id];
      const parent = ann && ann.parentChoice;
      return !parent || !choiceById[parent];
    });
    // 递归渲染单个 choice 节点（每层缩进 +16px）
    const renderChoice = (ch, depth) => {
      const ann = annMap[ch.id];
      const status = ann ? ann.isCorrect : null;
      const resultRange = (ann && ann.resultRange) || ch.resultRange;
      let cls = 'unknown', resultText = '待标注';
      if (status === true) {
        cls = 'correct';
        resultText = '→ 主线继续';
      } else if (status === false) {
        cls = 'wrong';
        resultText = (ann && ann.isBadEnd)
          ? `${escapeHtml(ann.badEndId || 'Bad End')} · 错误选项`
          : '结果: ' + getResultSummary(node, resultRange);
      }
      const shortId = ch.id.replace(/^.*?_/, '');
      const badge = status === true ? `<span class="choice-badge" style="background:#3a8a3a;color:#fff">正确</span>` :
                    status === false ? (ann && ann.isBadEnd
                      ? `<span class="choice-badge" style="background:#a44;color:#fff">${escapeHtml(ann.badEndId || 'Bad End')}</span>`
                      : `<span class="choice-badge" style="background:#a44;color:#fff">错误</span>`) :
                    `<span class="choice-badge">待标注</span>`;
      const marginLeft = depth * 16;
      html += `<div class="branch-item ${cls}" style="margin-left:${marginLeft}px">`;
      html += `<div class="bi-title">${escapeHtml(shortId)}「${escapeHtml(ch.text)}」 ${badge}</div>`;
      html += `<div class="bi-result">${escapeHtml(resultText)}</div>`;
      html += `</div>`;
      // 递归渲染子 choice
      const children = childrenMap[ch.id] || [];
      children.forEach(child => renderChoice(child, depth + 1));
    };
    html += `<div class="panel-section"><div class="panel-section-title">分支树</div><div class="branch-tree">`;
    roots.forEach(ch => renderChoice(ch, 0));
    html += '</div></div>';
  }

  // 子节点列表
  const children = NODES.filter(n => n.parentId === node.id).slice(0, 10);
  if (children.length) {
    html += `<div class="panel-section"><div class="panel-section-title">子节点 (${children.length})</div>`;
    children.forEach(ch => {
      html += `<div class="choice-item" data-goto="${escapeHtml(ch.id)}">
        <span class="choice-text">${escapeHtml(ch.title)}</span>
        <span class="choice-badge">→</span>
      </div>`;
    });
    html += '</div>';
  }

  // 跨周目导航：act01 末尾节点（A1C5Trial，nextId 原指向 A2C1 已置空）显示"→ 进入二周目"
  const actName = document.body.dataset.act || 'act01';
  if (actName === 'act01' && node.id === 'A1C5Trial') {
    html += `<div class="panel-section"><div class="panel-section-title">跨周目</div>`;
    html += `<a class="choice-item nav-cross" href="act02.html" style="text-decoration:none;display:flex;align-items:center;justify-content:space-between;">
      <span class="choice-text">→ 进入二周目（Act02 · 希罗篇）</span>
      <span class="choice-badge" style="background:var(--char-Hiro,hsl(0,65%,55%));color:#fff;">→</span>
    </a>`;
    html += `</div>`;
  }

  panelBody.innerHTML = html;

  // 绑定跳转事件
  panelBody.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', function() {
      const targetId = this.dataset.goto;
      const target = _nodeMap.get(targetId);
      if (target) {
        focusNode(target);
        if (target.choices && target.choices.length) openPhoneWithNode(target);
      }
    });
  });

  // 绑定异议链接点击事件 — 弹出 choice 信息弹窗
  panelBody.querySelectorAll('.objection-link').forEach(el => {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      const choiceId = this.dataset.choiceId;
      showObjectionPopup(choiceId, this);
    });
  });

  // B6: 高亮当前节点 (class 切换, 替代内联 outline)
  _nodeEls.forEach(el => el.classList.remove('highlighted'));
  const activeEl = _nodeEls.find(el => el.dataset.id === node.id);
  if (activeEl) activeEl.classList.add('highlighted');

  detailPanel.classList.add('open');
  detailOverlay.classList.add('open');
}

function closeDetail() {
  // 虚拟节点: 关闭详情面板时恢复隐藏状态
  if (focusedNodeId) {
    const cur = _nodeMap.get(focusedNodeId);
    if (cur && cur._isVirtual === true) {
      cur._hidden = true;
      const el = document.querySelector('.node[data-id="' + focusedNodeId + '"]');
      if (el) {
        el.classList.add('virt-hidden');
        var elRef = el;
        var nodeId = focusedNodeId;
        setTimeout(function() {
          var n2 = _nodeMap.get(nodeId);
          if (n2 && n2._hidden) elRef.style.display = 'none';
        }, 300);
      }
      // 同步隐藏虚拟节点的专属连接线 (objection + seq)
      _connectors.forEach(function(ref) {
        if (ref.toId === focusedNodeId || ref.fromId === focusedNodeId) ref.el.style.display = 'none';
      });
      // 同步隐藏其子孙虚拟节点 (子选项/证人/证物分支)
      hideVirtualNodeDescendants(focusedNodeId);
      // 统一校正正确路径连续线 (恢复到 Trial → nextTrial 或转移到其他可见正确节点)
      reconcileTrialContinuations();
    }
  }
  focusedNodeId = null;
  detailPanel.classList.remove('open');
  detailOverlay.classList.remove('open');
  closeObjectionPopup(); // 关闭异议弹窗
  _nodeEls.forEach(el => el.classList.remove('highlighted')); // B6: class 切换清理
}

// ══════════════════════════════════════════════════
//  手机剧情查看器
//══════════════════════════════════════════════════
const phoneContainer = document.getElementById('phone-container');
const phoneScreen = document.getElementById('phone-screen');
const phoneTopbar = document.getElementById('phone-topbar');
const phoneImg = document.getElementById('phone-img');
let phoneState = 'peeking';   // 'peeking' | 'show'
let phonePinned = false;       // 是否锁定 (点击锁定 / 节点点击)
let lastPhoneHtml = '';        // 上次显示的内容

function showPhone(html, fromNode) {
  phoneScreen.innerHTML = html;
  phoneScreen.style.opacity = '0';
  lastPhoneHtml = html;
  if (fromNode) {
    phoneContainer.classList.add('node-pop');
    phonePinned = true;
  }
  phoneContainer.classList.add('show');
  phoneState = 'show';
  // 绑定异议链接点击事件
  phoneScreen.querySelectorAll('.objection-link').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      showObjectionPopup(this.dataset.choiceId, this);
    });
  });
  // 绑定选项跳转事件
  phoneScreen.querySelectorAll('[data-goto]').forEach(function(el) {
    el.addEventListener('click', function() {
      var targetId = this.dataset.goto;
      var target = _nodeMap.get(targetId);
      if (target) {
        focusNode(target);
        openPhoneWithNode(target);
      } else if (targetId === 'continue' && focusedNodeId) {
        var cur = _nodeMap.get(focusedNodeId);
        if (cur && cur.nextId) {
          var next = _nodeMap.get(cur.nextId);
          if (next) {
            focusNode(next);
            openPhoneWithNode(next);
          }
        }
      }
    });
  });
  // 绑定导航按钮事件 (上一个/下一个/返回选择)
  phoneScreen.querySelectorAll('[data-nav]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      var navId = this.dataset.nav;
      var target = _nodeMap.get(navId);
      if (target) {
        focusNode(target);
        openPhoneWithNode(target);
      }
    });
  });
  // 绑定子选项点击事件 (虚拟节点子选项 → 打开子选项虚拟节点)
  phoneScreen.querySelectorAll('[data-sub-choice]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      var subChoiceId = this.dataset.subChoice;
      // 分支节点直接携带完整虚拟节点 id; 普通子选项传 choiceId, 需补前缀
      var virtNodeId = subChoiceId.indexOf('virt_') === 0 ? subChoiceId : 'virt_' + subChoiceId;
      var virtNode = _nodeMap.get(virtNodeId);
      if (virtNode) {
        // 显示虚拟节点
        virtNode._hidden = false;
        var vel = document.querySelector('.node[data-id="' + virtNodeId + '"]');
        if (vel) {
          vel.style.display = '';
          requestAnimationFrame(function() { vel.classList.remove('virt-hidden'); });
        }
        // 显示专属连接线
        _connectors.forEach(function(ref) {
          if (ref.toId === virtNodeId || ref.fromId === virtNodeId) {
            ref.el.style.display = '';
          }
        });
        // 聚焦并打开手机视图
        focusNode(virtNode);
        openPhoneWithNode(virtNode);
        // 校正正确路径连续线 (转移到当前最深可见正确节点)
        reconcileTrialContinuations();
      }
    });
  });
  // 下一帧淡入内容
  requestAnimationFrame(function() {
    phoneScreen.style.opacity = '1';
  });
}

function hidePhone() {
  clearTimeout(_phoneLeaveTimer);
  phoneScreen.style.opacity = '0';
  var wasShow = phoneState === 'show';
  phoneContainer.classList.remove('show', 'node-pop');
  phoneState = 'peeking';
  phonePinned = false;
  closeObjectionPopup();
  _nodeEls.forEach(el => el.classList.remove('highlighted'));
  // 淡出动画结束后清空屏幕内容（保留 lastPhoneHtml 供悬浮恢复）
  if (wasShow) {
    setTimeout(function() {
      if (phoneState === 'peeking') phoneScreen.innerHTML = '';
    }, 350);
  }
}

// 鼠标悬浮 — 从 peeking 弹出 (显示上次内容)
let _phoneCoolOff = false;  // 缩回后短暂冷却，防止立刻又弹起
phoneContainer.addEventListener('mouseenter', function() {
  clearTimeout(_phoneLeaveTimer);
  if (_phoneCoolOff) return;  // 冷却中，无视悬停
  if (phoneState === 'peeking') {
    if (lastPhoneHtml) {
      phoneScreen.innerHTML = lastPhoneHtml;
      phoneScreen.style.opacity = '0';
      phoneScreen.querySelectorAll('.objection-link').forEach(function(el) {
        el.addEventListener('click', function(e) {
          e.stopPropagation();
          showObjectionPopup(this.dataset.choiceId, this);
        });
      });
      requestAnimationFrame(function() {
        phoneScreen.style.opacity = '1';
      });
    }
    phoneContainer.classList.add('show');
    phoneState = 'show';
    phonePinned = false;
  }
});

// 鼠标离开 — 未锁定则延迟缩回，缩回后冷却 500ms 无视悬停
let _phoneLeaveTimer = null;
phoneContainer.addEventListener('mouseleave', function() {
  if (phoneState === 'show' && !phonePinned) {
    _phoneLeaveTimer = setTimeout(function() {
      phoneContainer.classList.remove('show');
      phoneState = 'peeking';
      _phoneCoolOff = true;
      setTimeout(function() { _phoneCoolOff = false; }, 500);
    }, 300);
  }
});

// 点击手机 — 锁定 or 关闭
phoneContainer.addEventListener('click', function(e) {
  // 点击顶部 → 关闭
  if (e.target === phoneTopbar || e.target === phoneImg) {
    hidePhone();
    return;
  }
  // 点击屏幕内容区域 → 锁定
  if (phoneState === 'show' && !phonePinned) {
    phonePinned = true;
  }
});

// 节点点击 → 手机弹出显示剧情
function branchBadgeHtml(br) {
  if (br.isCorrect === true) return '<span class="choice-badge" style="background:#3a8a3a;color:#fff">正确</span>';
  if (br.isCorrect === false) {
    return br.isSpecial
      ? '<span class="choice-badge" style="background:#b8860b;color:#fff">特殊</span>'
      : '<span class="choice-badge" style="background:#a44;color:#fff">错误</span>';
  }
  return '<span class="choice-badge">待标注</span>';
}

function openPhoneWithNode(node) {
  // 切换节点时隐藏全部已显示的虚拟节点 (跳过当前要打开的节点)
  hideAllVisibleVirtualNodes(node.id);
  focusedNodeId = node.id;
  let html = '';

  // 元信息 (紧凑版)
  const typeLabels = { adv:'日常剧情', ti:'审判开幕', tr:'审判辩论', bd:'Bad End', chapter:'章节' };
  html += '<div class="ps-meta">';
  html += '<span class="panel-tag">' + (typeLabels[node.type] || node.type) + '</span>';
  if (node.character) html += '<span class="panel-tag">' + escapeHtml(node.character) + '</span>';
  if (node.route && node.route !== 'normal') html += '<span class="panel-tag bad">' + node.route.toUpperCase() + '</span>';
  html += '</div>';

  // 摘要
  if (node.summary) {
    html += '<div class="ps-summary">' + escapeHtml(node.summary) + '</div>';
  }

  // ── 导航：上一个 (非 Bad End) ──
  var isBad = node.type === 'bd';
  if (!isBad) {
    var prevNode = findPrevNode(node);
    if (prevNode) {
      html += '<div class="panel-section"><div class="panel-section-title">导航</div>';
      html += '<div class="choice-item" data-nav="' + escapeHtml(prevNode.id) + '"><span class="choice-text">▲ 上一个</span></div>';
      html += '</div>';
    }
  }

  // 对话文本 (复用 renderDialogueText, 含粉色异议链接)
  var dlgSource = (node.level === 2 && node.parentId)
    ? (_nodeMap.get(node.parentId) || {})
    : node;
  var dlg = filterMainlineDialogue(dlgSource);
  if (dlg && dlg.length) {
    html += '<div class="panel-section"><div class="panel-section-title">场景对话</div>';
    dlg.forEach(function(d) {
      var color = 'var(--char-' + d.speaker + ', var(--node-border))';
      html += '<div class="transcript-item" style="border-left-color:' + color + '">';
      html += '<div class="ti-speaker" style="color:' + color + '">' + escapeHtml(d.speaker) + '</div>';
      html += '<div class="ti-text">' + renderDialogueText(d) + '</div>';
      html += '</div>';
    });
    html += '</div>';
  } else if (node.text) {
    html += '<div class="panel-section"><div class="panel-section-title">文本内容</div>';
    html += '<div style="white-space:pre-wrap;font-size:14px;line-height:1.7;padding:10px;background:var(--bg2);border-radius:5px;">' + escapeHtml(node.text).replace(/&lt;br&gt;\n?/g, '\n') + '</div>';
    html += '</div>';
  }

  // 选项
  if (node.choices && node.choices.length) {
    html += '<div class="panel-section"><div class="panel-section-title">选项</div>';
    node.choices.forEach(function(ch) {
      var badge = ch.isBadEnd ? '<span class="choice-badge">Bad End</span>' :
                  ch.result ? '<span class="choice-badge">' + escapeHtml(ch.result) + '</span>' : '';
      html += '<div class="choice-item" data-goto="' + escapeHtml(ch.leadsTo) + '"><span class="choice-text">' + escapeHtml(ch.text) + '</span>' + badge + '</div>';
    });
    html += '</div>';
  }

  // 子选项 / 证人 / 证物 (仅非分支虚拟节点) — 分支节点只展示结果文本与导航
  var _hasSubChoices = false;
  if (node._isVirtual && node._choiceId && node._trialNodeId && !node._branchKind) {
    var _annMap = ANNOTATIONS.trialChoices || {};
    var _trialNode = _nodeMap.get(node._trialNodeId);
    if (_trialNode && _trialNode.trialChoices) {
      var _subChoices = [];
      _trialNode.trialChoices.forEach(function(ch) {
        if (ch.id && /Common_Return/i.test(ch.id)) return;
        if (ch.buttonType === 'Cancel') return;
        var _ann = _annMap[ch.id];
        if (_ann && _ann.parentChoice === node._choiceId) {
          _subChoices.push({ ch: ch, ann: _ann });
        }
      });
      if (_subChoices.length) {
        _hasSubChoices = true;
        html += '<div class="panel-section"><div class="panel-section-title">子选项</div>';
        _subChoices.forEach(function(item) {
          var sc = item.ch;
          var sAnn = item.ann;
          var sStatus = sAnn ? sAnn.isCorrect : null;
          var sBadge = sStatus === true ? '<span class="choice-badge" style="background:#3a8a3a;color:#fff">正确</span>' :
            sStatus === false ? (sAnn && sAnn.isBadEnd
              ? '<span class="choice-badge" style="background:#a44;color:#fff">' + escapeHtml(sAnn.badEndId || 'Bad End') + '</span>'
              : '<span class="choice-badge" style="background:#a44;color:#fff">错误</span>') :
            '<span class="choice-badge">待标注</span>';
          html += '<div class="choice-item sub-choice-item" data-sub-choice="' + escapeHtml(sc.id) + '"><span class="choice-text">' + escapeHtml(sc.text) + '</span>' + sBadge + '</div>';
        });
        html += '</div>';
      }
    }
    // 证人分支 (标注中的 witnessBranches)
    var _curAnn = _annMap[node._choiceId];
    if (_curAnn && _curAnn.witnessBranches && _curAnn.witnessBranches.length) {
      _hasSubChoices = true;
      html += '<div class="panel-section"><div class="panel-section-title">证人</div>';
      _curAnn.witnessBranches.forEach(function(br, bi) {
        var _brVirtId = 'virt_' + node._choiceId + '__wit_' + bi;
        var _witName = br.witness || ('证人' + (bi + 1));
        if (br.isSpecial === false && br.isCorrect === false) _witName = '非' + _witName;
        html += '<div class="choice-item sub-choice-item" data-sub-choice="' + escapeHtml(_brVirtId) + '"><span class="choice-text">' + escapeHtml(_witName) + '</span>' + branchBadgeHtml(br) + '</div>';
      });
      html += '</div>';
    }
    // 证物分支 (标注中的 evidenceBranches)
    if (_curAnn && _curAnn.evidenceBranches && _curAnn.evidenceBranches.length) {
      _hasSubChoices = true;
      html += '<div class="panel-section"><div class="panel-section-title">证物</div>';
      _curAnn.evidenceBranches.forEach(function(br, bi) {
        var _brVirtId = 'virt_' + node._choiceId + '__ev_' + bi;
        var _evName = br.evidence || ('证物' + (bi + 1));
        if (br.isSpecial === false && br.isCorrect === false) _evName = '非' + _evName;
        html += '<div class="choice-item sub-choice-item" data-sub-choice="' + escapeHtml(_brVirtId) + '"><span class="choice-text">' + escapeHtml(_evName) + '</span>' + branchBadgeHtml(br) + '</div>';
      });
      html += '</div>';
    }
  }

  // ── 导航：底部按钮 ──
  var hasChoices = (node.choices && node.choices.length > 0) || _hasSubChoices;
  if (isBad) {
    // Bad End → 返回选择节点: 子选项优先返回其父虚拟节点, 否则返回 Trial
    var parentNode = node._parentChoiceId ? _nodeMap.get('virt_' + node._parentChoiceId) : null;
    if (!parentNode) parentNode = _nodeMap.get(node.parentId);
    if (parentNode) {
      html += '<div class="panel-section"><div class="panel-section-title">导航</div>';
      html += '<div class="choice-item" data-nav="' + escapeHtml(parentNode.id) + '"><span class="choice-text">↩ 返回选择</span></div>';
      html += '</div>';
    }
  } else if (node._isVirtual && node._parentChoiceId) {
    // 子选项虚拟节点 → 返回父选项虚拟节点
    var parentNode = _nodeMap.get('virt_' + node._parentChoiceId);
    if (parentNode) {
      html += '<div class="panel-section"><div class="panel-section-title">导航</div>';
      html += '<div class="choice-item" data-nav="' + escapeHtml(parentNode.id) + '"><span class="choice-text">↩ 返回选择</span></div>';
      html += '</div>';
    }
  } else if (!hasChoices) {
    // 正常节点 → 下一个 (有选项时不需要, 选项自带跳转)
    if (node.nextId) {
      html += '<div class="panel-section"><div class="panel-section-title">导航</div>';
      html += '<div class="choice-item" data-nav="' + escapeHtml(node.nextId) + '"><span class="choice-text">▼ 下一个</span></div>';
      html += '</div>';
    }
  }

  // 跨周目导航：act01 末尾节点显示"→ 进入二周目"
  var _actName = document.body.dataset.act || 'act01';
  if (_actName === 'act01' && node.id === 'A1C5Trial') {
    html += '<div class="panel-section"><div class="panel-section-title">跨周目</div>';
    html += '<a class="choice-item" href="act02.html" style="text-decoration:none;display:flex;align-items:center;justify-content:space-between;">';
    html += '<span class="choice-text">→ 进入二周目</span>';
    html += '<span class="choice-badge" style="background:var(--char-Hiro,hsl(0,65%,55%));color:#fff;">→</span>';
    html += '</a></div>';
  }

  // 高亮节点
  _nodeEls.forEach(function(el) { el.classList.remove('highlighted'); });
  var activeEl = _nodeEls.find(function(el) { return el.dataset.id === node.id; });
  if (activeEl) activeEl.classList.add('highlighted');

  showPhone(html, true);
}

function findPrevNode(node) {
  return _nodeMap.get(_prevId.get(node.id)) || null;
}

function focusNode(node) {
  // 平滑移动摄像机到目标节点 (使用布局坐标 _lx/_ly)
  const targetX = node._lx !== undefined ? node._lx : (node.x || 0);
  const targetY = node._ly !== undefined ? node._ly : (node.y || 0);
  const targetZoom = clamp(zoom < 1.0 ? 1.0 : zoom, ZOOM_MIN, ZOOM_MAX);
  const startX = viewX, startY = viewY, startZoom = zoom;
  const startTime = performance.now();
  const duration = 500;

  function animate(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    viewX = lerp(startX, targetX, eased);
    viewY = lerp(startY, targetY, eased);
    zoom = lerp(startZoom, targetZoom, eased);
    updateTransform();
    if (t < 1) requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

// BUG-1: 支持 #node-<id> 深链 (来自证据页"关联审判节点"等外部链接)
// 解析 location.hash, 平滑居中到目标节点并打开其手机弹窗 (与点击节点行为一致)
function handleHashDeepLink() {
  var hash = location.hash || '';
  var m = hash.match(/^#node-(.+)$/);
  if (!m) return;
  var id = decodeURIComponent(m[1]);
  var node = _nodeMap.get(id);
  // 先清除 hash, 避免刷新时重复弹出 / 影响浏览器历史
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  if (!node) return;
  try {
    focusNode(node);          // 平滑居中摄像机
    openPhoneWithNode(node);  // 打开手机弹窗 (内部会高亮该节点)
  } catch (e) {
    console.error('[deepLink] ' + (e && e.message ? e.message : String(e)));
  }
}

document.getElementById('panel-close').addEventListener('click', closeDetail);
detailOverlay.addEventListener('click', closeDetail);

// 键盘 ESC 关闭详情面板和手机
window.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (phoneState === 'show') hidePhone();
    closeDetail();
  }
});

// 点击弹窗外部关闭异议弹窗
document.addEventListener('click', function(e) {
  if (!objectionPopup.classList.contains('show')) return;
  if (objectionPopup.contains(e.target)) return;
  if (e.target.closest('.objection-link')) return;
  closeObjectionPopup();
});

// ══════════════════════════════════════════════════
//  搜索与过滤
//══════════════════════════════════════════════════
document.getElementById('search-input').addEventListener('input', function() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(function() {
    updateAllNodeVisibility();
  }, 150);
});

// ══════════════════════════════════════════════════
//  主题切换
//══════════════════════════════════════════════════
document.getElementById('theme-toggle').addEventListener('click', function() {
  var html = document.documentElement;
  var current = html.getAttribute('data-theme');
  var next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (e) { /* 隐私/沙箱环境静默 */ }
});

// ══════════════════════════════════════════════════
//  窗口大小变化时重新渲染
//══════════════════════════════════════════════════
window.addEventListener('resize', function() {
  updateTransform();
});

// 双击空白处回到概览 (B5: 拖拽平移后不触发)
container.addEventListener('dblclick', function(e) {
  if (_panMoved) { _panMoved = false; return; } // 平移位移超阈值, 抑制双击
  if (e.target === container || e.target === canvas) {
    const startTime = performance.now();
    const startZoom = zoom, startX = viewX, startY = viewY;
    const duration = 600;
    function animate(now) {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      zoom = lerp(startZoom, 0.55, eased);
      viewX = lerp(startX, 500, eased);
      viewY = lerp(startY, 100, eased);
      updateTransform();
      if (t < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }
});

// ══════════════════════════════════════════════════
//  工具函数
//══════════════════════════════════════════════════
function escapeHtml(str) {
  // B8: 补充 " 和 ' 转义
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── 渲染对话文本: 替换 <link="Objection_...">text</link> 为粉色可点击 span ──
// 注意: escapeHtml 会把 < > " 全部转义, 故正则匹配 &lt;link=&quot;...&quot;&gt;...&lt;/link&gt;
function renderDialogueText(d) {
  let text = escapeHtml(d.text).replace(/&lt;br&gt;\n?/g, '\n');
  if (d.objectionLinks && d.objectionLinks.length) {
    const linkMap = {};
    d.objectionLinks.forEach(ol => { linkMap[ol.id] = ol.choiceId; });
    text = text.replace(/&lt;link=&quot;(Objection_\d+_\d+_\d+_\d+)&quot;&gt;(.*?)&lt;\/link&gt;/g, (m, id, linkText) => {
      const choiceId = linkMap[id];
      if (!choiceId) return linkText;
      return `<span class="objection-link" data-choice-id="${escapeHtml(choiceId)}">${linkText}</span>`;
    });
  }
  return text;
}

// ── 从 resultRange 范围内的 dialogue 提取前 40 字摘要 ──
function getResultSummary(node, range) {
  if (!range || !range.length) return '（未指定结果范围）';
  if (!node.dialogue || !node.dialogue.length) return '（无对话数据）';
  const [startLabel, endLabel] = range;
  const startIdx = node.dialogue.findIndex(d => d.label === startLabel);
  const endIdx = node.dialogue.findIndex(d => d.label === endLabel);
  if (startIdx === -1) return '（起始 label 未找到）';
  const end = endIdx === -1 ? startIdx : endIdx;
  const texts = node.dialogue.slice(startIdx, end + 1).map(d => d.text.replace(/<[^>]*>/g, '').replace(/\n/g, ' '));
  const summary = texts.join(' ').slice(0, 40);
  return summary + (summary.length >= 40 ? '…' : '');
}

// ── 过滤 Trial 节点的主线 dialogue: 排除所有 resultRange 内的对话 ──
function filterMainlineDialogue(node) {
  if (!node.dialogue || !node.dialogue.length) return [];
  var annMap = ANNOTATIONS.trialChoices || {};
  // 非 Trial 节点直接返回全部
  if (node.type !== 'ti' && node.type !== 'tr') return node.dialogue;
  if (!node.trialChoices || !node.trialChoices.length) return node.dialogue;

  // 收集所有 resultRange 内的 label (用 Set 去重)
  var excludedLabels = {};
  node.trialChoices.forEach(function(ch) {
    var ann = annMap[ch.id];
    if (!ann || !ann.resultRange || ann.resultRange.length !== 2) return;
    var startIdx = node.dialogue.findIndex(function(d) { return d.label === ann.resultRange[0]; });
    var endIdx = node.dialogue.findIndex(function(d) { return d.label === ann.resultRange[1]; });
    if (startIdx === -1) return;
    var end = endIdx === -1 ? startIdx : endIdx;
    for (var i = startIdx; i <= end; i++) {
      if (node.dialogue[i]) excludedLabels[node.dialogue[i].label] = true;
    }
    // 同时过滤 witnessBranches 的 resultRange
    if (ann.witnessBranches && ann.witnessBranches.length) {
      ann.witnessBranches.forEach(function(wb) {
        if (!wb.resultRange || wb.resultRange.length !== 2) return;
        var wbStart = node.dialogue.findIndex(function(d) { return d.label === wb.resultRange[0]; });
        var wbEnd = node.dialogue.findIndex(function(d) { return d.label === wb.resultRange[1]; });
        if (wbStart === -1) return;
        var wbLast = wbEnd === -1 ? wbStart : wbEnd;
        for (var j = wbStart; j <= wbLast; j++) {
          if (node.dialogue[j]) excludedLabels[node.dialogue[j].label] = true;
        }
      });
    }
    // 同时过滤 evidenceBranches 的 resultRange
    if (ann.evidenceBranches && ann.evidenceBranches.length) {
      ann.evidenceBranches.forEach(function(eb) {
        if (!eb.resultRange || eb.resultRange.length !== 2) return;
        var ebStart = node.dialogue.findIndex(function(d) { return d.label === eb.resultRange[0]; });
        var ebEnd = node.dialogue.findIndex(function(d) { return d.label === eb.resultRange[1]; });
        if (ebStart === -1) return;
        var ebLast = ebEnd === -1 ? ebStart : ebEnd;
        for (var j = ebStart; j <= ebLast; j++) {
          if (node.dialogue[j]) excludedLabels[node.dialogue[j].label] = true;
        }
      });
    }
  });

  // 过滤出不在任何 resultRange 内的 dialogue
  return node.dialogue.filter(function(d) {
    return !excludedLabels[d.label];
  });
}

// ── 从 resultRange 范围内的 dialogue 提取条目数组 ──
// 供 buildVirtualObjectionNodes 共用
function extractResultEntries(node, range) {
  if (!range || !range.length || !node.dialogue) return [];
  var startIdx = node.dialogue.findIndex(function(d) { return d.label === range[0]; });
  var endIdx = node.dialogue.findIndex(function(d) { return d.label === range[1]; });
  if (startIdx === -1) return [];
  var end = endIdx === -1 ? startIdx : endIdx;
  return node.dialogue.slice(startIdx, end + 1);
}

// ══════════════════════════════════════════════════
//  Task 2+3: 虚拟异议结果节点构建
//  扫描所有 Trial 节点的 trialChoices, 为含 resultRange 的选项
//  生成虚拟节点 (错误→Bad End 侧分支, 正确→中间浮现)
//══════════════════════════════════════════════════
function buildVirtualObjectionNodes() {
  var annMap = ANNOTATIONS.trialChoices || {};
  var virtualNodes = [];

  NODES.forEach(function(node) {
    if (!node.trialChoices || !node.trialChoices.length) return;
    // 仅处理 Trial 节点 (type 含 ti/tr)
    if (node.type !== 'ti' && node.type !== 'tr') return;
    if (!node.dialogue || !node.dialogue.length) return;

    node.trialChoices.forEach(function(ch) {
      // 跳过通用返回选项
      if (ch.id && /Common_Return/i.test(ch.id)) return;
      if (ch.buttonType === 'Cancel') return;

      var ann = annMap[ch.id];
      if (!ann || !ann.resultRange || ann.resultRange.length !== 2) return;
      if (ann.isCorrect !== true && ann.isCorrect !== false) return;

      var entries = extractResultEntries(node, ann.resultRange);
      if (!entries.length) return;

      var virtId = 'virt_' + ch.id;
      // 避免重复构建
      if (_nodeMap.has(virtId)) return;

      var isCorrect = ann.isCorrect === true;
      var isSubOption = !!ann.parentChoice;  // 子选项: annotations 中有 parentChoice 字段
      var resultText = entries.map(function(d) {
        return d.text.replace(/<[^>]*>/g, '').replace(/\n/g, ' ');
      }).join(' ');

      var virt = {
        id: virtId,
        title: ch.text.slice(0, 15) + (ch.text.length > 15 ? '…' : ''),
        level: 1,
        parentId: node.id,
        // 正确选项 (含子选项) 直接连到 nextTrial, 由 reconcileTrialContinuations 决定哪条线显示
        nextId: isCorrect ? node.nextId : null,
        route: isCorrect ? 'normal' : 'objection-wrong',
        type: isCorrect ? 'tr' : 'bd',
        character: 'Objection',
        summary: resultText.slice(0, 40) + (resultText.length > 40 ? '…' : ''),
        text: resultText,
        dialogue: entries,
        isChoice: false,
        choices: [],
        _isVirtual: true,
        _isCorrect: isCorrect,
        _choiceId: ch.id,
        _trialNodeId: node.id,
        _hidden: true,
        x: 0, y: 0
      };

      // 子选项: 记录父选项 choiceId (用于连接到父选项虚拟节点)
      if (isSubOption) {
        virt._parentChoiceId = ann.parentChoice;
      }

      // 错误选项携带 badEndId
      if (!isCorrect && ann.isBadEnd && ann.badEndId) {
        virt.badEndId = ann.badEndId;
      }

      virtualNodes.push(virt);

      // 证人与证物分支: 为 witnessBranches / evidenceBranches 生成虚拟节点
      var branchGroups = [
        { key: 'witnessBranches', kind: 'witness', idPart: 'wit' },
        { key: 'evidenceBranches', kind: 'evidence', idPart: 'ev' }
      ];
      branchGroups.forEach(function(bg) {
        var branches = ann[bg.key];
        if (!branches || !branches.length) return;
        branches.forEach(function(br, bi) {
          if (!br.resultRange || br.resultRange.length !== 2) return;
          var brEntries = extractResultEntries(node, br.resultRange);
          if (!brEntries.length) return;
          var brId = 'virt_' + ch.id + '__' + bg.idPart + '_' + bi;
          if (_nodeMap.has(brId)) return;
          var brCorrect = br.isCorrect === true;
          var brName = br[bg.kind] || '';
          // 通用错误分支 (非特殊且非正确) 显示"非"+名称
          if (br.isSpecial === false && brCorrect === false) brName = '非' + brName;
          var brTitle = (bg.kind === 'witness' ? '证人·' : '证物·') + brName;
          var brText = brEntries.map(function(d) {
            return d.text.replace(/<[^>]*>/g, '').replace(/\n/g, ' ');
          }).join(' ');
          virtualNodes.push({
            id: brId,
            title: brTitle.slice(0, 15) + (brTitle.length > 15 ? '…' : ''),
            level: 1,
            parentId: node.id,
            nextId: brCorrect ? node.nextId : null,
            route: brCorrect ? 'normal' : 'objection-wrong',
            type: brCorrect ? 'tr' : 'bd',
            character: 'Objection',
            summary: brText.slice(0, 40) + (brText.length > 40 ? '…' : ''),
            text: brText,
            dialogue: brEntries,
            isChoice: false,
            choices: [],
            _isVirtual: true,
            _isCorrect: brCorrect,
            _choiceId: ch.id,
            _trialNodeId: node.id,
            _parentChoiceId: ch.id,
            _branchKind: bg.kind,
            _branchLabel: brName,
            _isSpecial: !!br.isSpecial,
            _hidden: true,
            x: 0, y: 0
          });
        });
      });
    });
  });

  // 加入全局节点表 (参与 computeLayout 布局)
  virtualNodes.forEach(function(v) {
    NODES.push(v);
    _nodeMap.set(v.id, v);
  });
}

// ── Task 3: 重新定位正确选项虚拟节点 ──
// 正确选项节点位于 Trial 与 nextTrial 之间 (线性插值 + 水平偏移)
// 错误选项节点保持 computeLayout 的分支位置不变
function _repositionVirtualNodes() {
  // 第一遍: 定位主选项虚拟节点 (无 _parentChoiceId)
  NODES.forEach(function(v) {
    if (!v._isVirtual || v._parentChoiceId) return;  // 跳过子选项, 留待第二遍处理
    var trial = _nodeMap.get(v._trialNodeId);
    if (!trial || trial._lx === undefined) return;

    if (v._isCorrect && trial.nextId) {
      // 正确选项: Trial 与 nextTrial 之间 (右侧偏移减少至 120)
      var next = _nodeMap.get(trial.nextId);
      if (next && next._lx !== undefined) {
        v._lx = (trial._lx + next._lx) / 2 + 120;
        v._ly = (trial._ly + next._ly) / 2;
      } else {
        v._lx = trial._lx + 200;
        v._ly = trial._ly + LAYOUT.SCENE_GAP / 2;
      }
    } else {
      // 错误选项: 紧贴 Trial 右下角 (临时显示, 无需担心重叠)
      v._lx = trial._lx + 60;
      v._ly = trial._ly + 80;
    }

    v._origX = v._lx;
    v._origY = v._ly;

    // 设置虚拟节点的 prev 为 Trial 节点 (供 findPrevNode 使用)
    _prevId.set(v.id, trial.id);
  });

  // 第二遍: 递归定位子选项虚拟节点 (按深度排序, 先浅后深, 保证父选项已定位)
  var subOpts = NODES.filter(function(v) {
    return v._isVirtual && v._parentChoiceId;
  });
  // 计算子选项深度 (沿 parentChoice 链回溯层数)
  function _subDepth(v) {
    var d = 1;
    var p = _nodeMap.get('virt_' + v._parentChoiceId);
    while (p && p._parentChoiceId) { d++; p = _nodeMap.get('virt_' + p._parentChoiceId); }
    return d;
  }
  subOpts.sort(function(a, b) { return _subDepth(a) - _subDepth(b); });

  // 按父选项 choiceId 分组记录子选项索引 (用于纵向堆叠)
  var siblingIdx = {};
  subOpts.forEach(function(v) {
    var parentVirt = _nodeMap.get('virt_' + v._parentChoiceId);
    var trial = _nodeMap.get(v._trialNodeId);
    if (parentVirt && parentVirt._lx !== undefined) {
      // 子选项定位在父选项附近 (水平 +80, 纵向堆叠间距 60)
      var idx = siblingIdx[v._parentChoiceId] || 0;
      siblingIdx[v._parentChoiceId] = idx + 1;
      v._lx = parentVirt._lx + 80;
      v._ly = parentVirt._ly + (idx + 1) * 60;
      _prevId.set(v.id, parentVirt.id);
    } else if (trial && trial._lx !== undefined) {
      // 回退: 父选项虚拟节点不存在, 紧贴 Trial 右下角 (与错误主选项一致)
      v._lx = trial._lx + 60;
      v._ly = trial._ly + 80;
      _prevId.set(v.id, trial.id);
    } else {
      return;
    }
    v._origX = v._lx;
    v._origY = v._ly;
  });
}

// ── 异议弹窗: 显示 choice 信息 + 标注状态 ──
let _popupChoiceId = null;
let _popupAnchorEl = null;
function showObjectionPopup(choiceId, anchorEl) {
  _popupChoiceId = choiceId;
  _popupAnchorEl = anchorEl || null;
  // 在所有 Trial 节点中查找对应 choice (choiceId 跨节点唯一)
  let choice = null;
  for (const n of NODES) {
    if (n.trialChoices) {
      const found = n.trialChoices.find(c => c.id === choiceId);
      if (found) { choice = found; break; }
    }
  }
  if (!choice) { closeObjectionPopup(); return; }
  const ann = (ANNOTATIONS.trialChoices || {})[choiceId];
  const status = ann ? ann.isCorrect : null;
  const statusBadge = status === true ? '<span class="choice-badge" style="background:#3a8a3a;color:#fff">正确</span>' :
                      status === false ? (ann && ann.isBadEnd
                        ? `<span class="choice-badge" style="background:#a44;color:#fff">${escapeHtml(ann.badEndId || 'Bad End')}</span>`
                        : '<span class="choice-badge" style="background:#a44;color:#fff">错误</span>') :
                      '<span class="choice-badge">待标注</span>';
  const note = ann && ann.note ? `<div style="margin-top:6px;font-size:12px;color:var(--fg2)">备注: ${escapeHtml(ann.note)}</div>` : '';
  const objectionText = choice.objectionText ? `<div style="margin-top:6px;font-size:12px;color:var(--fg3)">异议点: ${escapeHtml(choice.objectionText)}</div>` : '';
  const typeLabel = choice.buttonType === 'Cancel' ? ' [返回]' : choice.buttonType === 'Objection' ? ' [异议]' : '';
  objectionPopup.innerHTML = `<div class="op-choice">${escapeHtml(choice.text)}${typeLabel} ${statusBadge}</div>${objectionText}${note}`;
  // 定位弹窗在点击元素附近
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 6;
    const popupWidth = 300;
    if (left + popupWidth > window.innerWidth - 12) left = window.innerWidth - popupWidth - 12;
    if (left < 12) left = 12;
    if (top + 120 > window.innerHeight - 12) top = rect.top - 120 - 6;
    if (top < 12) top = 12;
    objectionPopup.style.left = left + 'px';
    objectionPopup.style.top = top + 'px';
  }
  objectionPopup.classList.add('show');

  // 弹窗可点击跳转 — 仅绑定一次
  if (!objectionPopup._jumpBound) {
    objectionPopup._jumpBound = true;
    objectionPopup.addEventListener('click', function(e) {
      e.stopPropagation();
      const cid = _popupChoiceId;
      if (!cid) return;
      const virtNodeId = 'virt_' + cid;
      const virtNode = NODES.find(n => n.id === virtNodeId);
      if (virtNode) {
        // 显示虚拟节点
        virtNode._hidden = false;
        const el = document.querySelector('.node[data-id="' + virtNodeId + '"]');
        if (el) {
          el.style.display = '';
          // 下一帧移除 class, 触发 transition (scale 0.85→1 + opacity 0→1)
          requestAnimationFrame(function() {
            el.classList.remove('virt-hidden');
          });
        }
        // 隐藏父 Trial → nextTrial 顺序连接线（正确选项虚拟节点在两者之间）
        var trial = _nodeMap.get(virtNode._trialNodeId);
        if (trial && trial.nextId && virtNode._isCorrect) {
          _connectors.forEach(function(ref) {
            if (ref.fromId === trial.id && ref.toId === trial.nextId) {
              ref.el.style.display = 'none';
            }
          });
        }
        // 显示虚拟节点专属连接线 (objection-correct + 虚拟节点自身的 seq 线)
        _connectors.forEach(function(ref) {
          if (ref.toId === virtNodeId || ref.fromId === virtNodeId) {
            ref.el.style.display = '';
          }
        });
        // 聚焦摄像机
        focusNode(virtNode);
        // 打开详情面板 / 手机视图 (根据点击来源)
        const usePhone = _popupAnchorEl && phoneScreen.contains(_popupAnchorEl);
        if (usePhone) openPhoneWithNode(virtNode);
        else openDetail(virtNode);
        // 关闭弹窗
        closeObjectionPopup();
      } else {
        // 无结果节点 — 追加提示 (不跳转, 不关闭)
        if (!objectionPopup.querySelector('.op-no-result')) {
          const tip = document.createElement('div');
          tip.className = 'op-no-result';
          tip.style.cssText = 'color:#a44;margin-top:4px;font-size:11px;';
          tip.textContent = '无结果节点';
          objectionPopup.appendChild(tip);
        }
      }
    });
  }
}

function closeObjectionPopup() {
  objectionPopup.classList.remove('show');
}

// ══════════════════════════════════════════════════
//  增强 2: 章节快速导航侧栏
//══════════════════════════════════════════════════
var _chapterNav = document.getElementById('chapter-nav');
var _chapterNavList = document.getElementById('chapter-nav-list');
var _chapterNavToggle = document.getElementById('chapter-nav-toggle');

function buildChapterNav() {
  if (!_chapterNavList) return;
  var chapters = NODES.filter(function(n) { return n.level === 0; });
  var romans = ['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ','Ⅹ','Ⅺ','Ⅻ'];
  var html = '';
  chapters.forEach(function(ch, i) {
    var num = romans[i] || String(i + 1).padStart(2, '0');
    var chStr = 'Chapter ' + String(i + 1).padStart(2, '0');
    html += '<div class="cn-item" data-id="' + escapeHtml(ch.id) + '" style="animation-delay:' + (i * 0.045).toFixed(3) + 's">' +
      '<span class="cn-num">' + num + '</span>' +
      '<div class="cn-content">' +
        '<span class="cn-label">' + escapeHtml(ch.title) + '</span>' +
        '<span class="cn-meta">' + chStr + '</span>' +
      '</div>' +
      '<span class="cn-indicator"></span>' +
    '</div>';
  });
  _chapterNavList.innerHTML = html;
  // Bind clicks
  _chapterNavList.querySelectorAll('.cn-item').forEach(function(item) {
    item.addEventListener('click', function() {
      var id = this.dataset.id;
      var node = _nodeMap.get(id);
      if (node) {
        focusNode(node);
        openPhoneWithNode(node);
        _chapterNav.classList.remove('show');
        if (_chapterNavToggle) _chapterNavToggle.classList.remove('active');
      }
    });
  });
}

function updateChapterNavActive() {
  if (!_chapterNavList) return;
  // Find the chapter closest to current view center
  var centerX = viewX;
  var bestId = null, bestDist = Infinity;
  NODES.forEach(function(n) {
    if (n.level !== 0 || n._lx === undefined) return;
    var dist = Math.abs(n._lx - centerX);
    if (dist < bestDist) { bestDist = dist; bestId = n.id; }
  });
  _chapterNavList.querySelectorAll('.cn-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.id === bestId);
  });
}

if (_chapterNavToggle) {
  _chapterNavToggle.addEventListener('click', function() {
    _chapterNav.classList.toggle('show');
    var isShow = _chapterNav.classList.contains('show');
    _chapterNavToggle.classList.toggle('active', isShow);
    if (isShow) updateChapterNavActive();
  });
}
var _cnClose = _chapterNav ? _chapterNav.querySelector('.cn-close') : null;
if (_cnClose) {
  _cnClose.addEventListener('click', function() {
    _chapterNav.classList.remove('show');
    if (_chapterNavToggle) _chapterNavToggle.classList.remove('active');
  });
}

// ══════════════════════════════════════════════════
//  增强 3: 搜索结果面板
//══════════════════════════════════════════════════
var _searchResults = document.getElementById('search-results');
var _srList = document.getElementById('sr-list');
var _srCount = document.getElementById('sr-count');

function updateSearchResults() {
  if (!_searchResults || !_srList) return;
  var searchText = document.getElementById('search-input').value.trim().toLowerCase();
  if (!searchText) {
    _searchResults.classList.remove('show');
    return;
  }
  var matches = [];
  NODES.forEach(function(n) {
    if (n._isVirtual) return;
    var title = (n.title || '').toLowerCase();
    var character = (n.character || '').toLowerCase();
    var text = (n.text || '').toLowerCase();
    var summary = (n.summary || '').toLowerCase();
    if (title.indexOf(searchText) !== -1 || character.indexOf(searchText) !== -1 ||
        text.indexOf(searchText) !== -1 || summary.indexOf(searchText) !== -1) {
      matches.push(n);
    }
  });
  // Sort: Lv0 first, then Lv1, then Lv2; limit to 50
  matches.sort(function(a, b) { return (a.level || 0) - (b.level || 0); });
  matches = matches.slice(0, 50);

  _srCount.textContent = matches.length + ' 项';
  if (!matches.length) {
    _srList.innerHTML = '<div class="sr-empty">未找到匹配节点</div>';
  } else {
    var html = '';
    matches.forEach(function(n) {
      var color = n.character ? 'var(--char-' + n.character + ', var(--node-border))' : 'var(--node-border)';
      var path = '';
      if (n.level === 0) path = '章节';
      else if (n.level === 1) {
        var parent = n.parentId ? _nodeMap.get(n.parentId) : null;
        path = parent ? parent.title : '场景';
      } else {
        var p = n.parentId ? _nodeMap.get(n.parentId) : null;
        var pp = p && p.parentId ? _nodeMap.get(p.parentId) : null;
        path = [pp ? pp.title : '', p ? p.title : ''].filter(Boolean).join(' › ');
      }
      html += '<div class="sr-item" data-id="' + escapeHtml(n.id) + '">' +
        '<span class="sr-dot" style="background:' + color + '"></span>' +
        '<div class="sr-info"><div class="sr-title">' + escapeHtml(n.title) + '</div>' +
        '<div class="sr-path">' + escapeHtml(path) + '</div></div>' +
      '</div>';
    });
    _srList.innerHTML = html;
    _srList.querySelectorAll('.sr-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var id = this.dataset.id;
        var node = _nodeMap.get(id);
        if (node) {
          focusNode(node);
          openPhoneWithNode(node);
        }
      });
    });
  }
  _searchResults.classList.add('show');
}

// Hook into existing search handler
var _origSearchInput = document.getElementById('search-input');
if (_origSearchInput) {
  _origSearchInput.addEventListener('input', function() {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(function() {
      updateAllNodeVisibility();
      updateSearchResults();
    }, 150);
  });
}

// Close search results on outside click
document.addEventListener('click', function(e) {
  if (!_searchResults || !_searchResults.classList.contains('show')) return;
  if (_searchResults.contains(e.target)) return;
  if (e.target.id === 'search-input') return;
  if (e.target.closest('.search-wrap')) return;
  _searchResults.classList.remove('show');
});

// ══════════════════════════════════════════════════
//  增强 5: 首次访问引导提示
//══════════════════════════════════════════════════
var _onboarding = document.getElementById('onboarding');
var _onboardingOverlay = document.getElementById('onboarding-overlay');
var _obStep = 0;
var _obSteps = [
  { text: '拖拽空白处可平移画布，浏览不同章节', target: '#canvas-container', arrow: 'arrow-left' },
  { text: '滚轮缩放，或点击左下角快捷按钮切换概览/场景/对话视图', target: '#quick-zoom', arrow: 'arrow-bottom' },
  { text: '点击任意节点查看剧情详情，包括对话、选项和异议分支', target: '#canvas-container', arrow: 'arrow-left' }
];

var _obTransitioning = false;

function showOnboardingStep() {
  if (_obStep >= _obSteps.length) {
    hideOnboarding();
    try { localStorage.setItem('ob_done', '1'); } catch (e) {}
    return;
  }
  var step = _obSteps[_obStep];
  if (!_onboarding) return;

  var progress = ((_obStep + 1) / _obSteps.length) * 100;
  var inner = _onboarding.querySelector('.ob-inner');

  // 渲染新内容 (提取为函数, 首次和切换共用)
  function renderContent() {
    _onboarding.className = step.arrow || '';
    _onboarding.innerHTML =
      '<div class="ob-progress"><div class="ob-progress-bar" style="width:0%"></div></div>' +
      '<div class="ob-inner">' +
        '<div class="ob-step">引导 ' + (_obStep + 1) + ' / ' + _obSteps.length + '</div>' +
        '<div class="ob-text">' + step.text + '</div>' +
        '<div class="ob-actions">' +
          '<button class="ob-btn ob-skip">跳过</button>' +
          '<button class="ob-btn primary ob-next">' + (_obStep < _obSteps.length - 1 ? '下一步' : '完成') + '</button>' +
        '</div>' +
      '</div>';
    // Position near target
    positionOnboarding(step);
    _onboarding.classList.add('show');
    if (_onboardingOverlay) _onboardingOverlay.classList.add('show');
    // 进度条动画 (下一帧触发 transition)
    requestAnimationFrame(function() {
      var bar = _onboarding.querySelector('.ob-progress-bar');
      if (bar) bar.style.width = progress + '%';
    });
    // Bind buttons
    _onboarding.querySelector('.ob-next').addEventListener('click', function() {
      if (_obTransitioning) return;
      _obTransitioning = true;
      var curInner = _onboarding.querySelector('.ob-inner');
      if (curInner) curInner.classList.add('ob-leaving');
      setTimeout(function() {
        _obStep++;
        showOnboardingStep();
        _obTransitioning = false;
      }, 280);
    });
    _onboarding.querySelector('.ob-skip').addEventListener('click', function() {
      if (_obTransitioning) return;
      _obTransitioning = true;
      var curInner = _onboarding.querySelector('.ob-inner');
      if (curInner) curInner.classList.add('ob-leaving');
      setTimeout(function() {
        _obStep = _obSteps.length;
        showOnboardingStep();
        _obTransitioning = false;
      }, 280);
    });
  }

  // 首次显示: 直接渲染; 切换步骤: 先淡出旧内容再渲染
  if (inner && _onboarding.classList.contains('show')) {
    inner.classList.add('ob-leaving');
    setTimeout(renderContent, 280);
  } else {
    renderContent();
  }
}

function positionOnboarding(step) {
  var targetEl = document.querySelector(step.target);
  if (!targetEl) return;
  var rect = targetEl.getBoundingClientRect();
  var obW = 300, obH = 160;
  if (step.arrow === 'arrow-left') {
    var left = rect.left + rect.width + 20;
    var top = rect.top + rect.height / 2 - 40;
    if (left + obW > window.innerWidth - 20) {
      left = Math.max(20, rect.right - obW - 20);
    }
    if (top + obH > window.innerHeight - 20) top = window.innerHeight - obH - 20;
    if (top < 80) top = 80;
    _onboarding.style.left = left + 'px';
    _onboarding.style.top = top + 'px';
    _onboarding.style.right = 'auto';
    _onboarding.style.bottom = 'auto';
  } else {
    var left2 = rect.left + rect.width / 2 - 140;
    var top2 = rect.top - 100;
    if (left2 < 20) left2 = 20;
    if (left2 + obW > window.innerWidth - 20) left2 = window.innerWidth - obW - 20;
    if (top2 < 80) top2 = 80;
    _onboarding.style.left = left2 + 'px';
    _onboarding.style.top = top2 + 'px';
    _onboarding.style.right = 'auto';
    _onboarding.style.bottom = 'auto';
  }
}

function hideOnboarding() {
  if (_onboarding) { _onboarding.classList.remove('show'); _onboarding.innerHTML = ''; }
  if (_onboardingOverlay) _onboardingOverlay.classList.remove('show');
}

function initOnboarding() {
  if (!_onboarding) return;
  var done = false;
  try { done = localStorage.getItem('ob_done') === '1'; } catch (e) {}
  if (!done) {
    setTimeout(showOnboardingStep, 2500);
  }
}

// ══════════════════════════════════════════════════
//  启动
//══════════════════════════════════════════════════
const _splashStart = performance.now();
initData();
