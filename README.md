# 大魔女图书馆

基于剧情数据的可视化资料站，以节点图谱展示场景流向、分支选择与对话内容，并收录证物、CG 画廊、语音音乐与世界观记录。支持缩放、平移、搜索、路线过滤、详情面板、Trial 异议选项标注与意见箱反馈。

> 当前包含 **第一话（一周目，Act01_Chapter01-05）** 与 **第二话（二周目，Act02_Chapter01-06）** 全章数据，按周目拆分为独立页面，避免单页加载 400+ 节点造成卡顿。

## 在线访问 (GitHub Pages)

在线访问：**<https://manosaba-library.com/>**（已上线，可直接访问）

- 根 URL（`/`）→ 落地页：展示一周目 / 二周目入口卡片 + 资料栏目入口
- `/act01.html` → 一周目节点图谱（Act01_Chapter01-05，205 节点）
- `/act02.html` → 二周目节点图谱（Act02_Chapter01-06，201 节点）
- `/records.html` → 记录·规定（世界观术语与监牢规定词条）
- `/evidence.html` → 证物（按章节浏览证物图鉴与描述）
- `/gallery.html` → CG 画廊（角度像 / 证物 / 事件插画 / 场景背景等分类浏览）
- `/audio.html` → 语音和音乐（按场景 / 角色筛选语音，试听 BGM）
- `/player.html` → 弹窗音乐播放器（由各页面通过 `player-launcher.js` 唤起）
- `/archive.html` → 全素材库索引
- `/credits.html` → 制作名单与免责声明（含引用资源）
- `/404.html` → 自定义 404 页

仓库已启用 GitHub Pages（分支 `main`、目录 `/`）。如需自定义域名，可在 **Settings → Pages** 中配置。

## 本地预览

由于数据通过 `fetch` 加载，**不能直接双击 `index.html` 打开**（浏览器禁止 `file://` 下的 fetch）。需启动本地服务器：

```bash
# 在项目根目录执行
python -m http.server 8000
```

然后浏览器访问 <http://localhost:8000/>。

## 文件结构

```
├── index.html              # 落地页（入口选择 + 魔女审判主题视觉）
├── act01.html              # 一周目节点图谱页（data-act="act01"）
├── act02.html              # 二周目节点图谱页（data-act="act02"）
├── records.html            # 记录·规定页
├── evidence.html           # 证物页
├── gallery.html            # CG 画廊页
├── audio.html              # 语音和音乐页
├── player.html             # 弹窗音乐播放器
├── archive.html            # 全素材库索引页
├── credits.html            # 制作名单与免责声明（含引用资源）
├── 404.html                # 自定义 404 页
├── robots.txt              # 搜索引擎抓取规则
├── LICENSE                 # CC BY-NC-SA 4.0（游戏素材除外）
├── assets/
│   ├── shared.css          # 公共样式（变量 / 主题 / 开屏 / 页头页脚）
│   ├── shared.js           # 公共脚本（主题切换 / toast / 工具函数）
│   ├── style.css           # 节点图谱页样式（Canvas / 详情面板 / 角色配色）
│   ├── content.css         # 内容页样式（records / evidence / gallery / audio 共用）
│   ├── player.css          # 弹窗播放器样式
│   ├── app.js              # 节点图谱引擎（数据加载 + Canvas + 详情面板）
│   ├── records.js          # 记录·规定页逻辑
│   ├── evidence.js         # 证物页逻辑
│   ├── gallery.js          # CG 画廊页逻辑
│   ├── audio.js            # 语音和音乐页逻辑
│   ├── player.js           # 弹窗播放器逻辑
│   ├── player-launcher.js  # 弹窗播放器启动器（各页面通过它唤起 player.html）
│   ├── favicon.ico         # 网站图标（由主页小盒子图生成）
│   ├── og-card.jpg         # 社交分享卡片（1200×630）
│   ├── audio/              # 音频资源（BGM / SFX / 语音，.ogg）
│   └── cg/                 # CG 图片资源（.webp，按分类子目录）
│       ├── angle/          # 角度像
│       ├── character/      # 角色全身
│       ├── cutin/          # 切入插画
│       ├── evidence/       # 证物
│       ├── kari/           # 事件插画
│       ├── map/            # 楼层地图
│       ├── misc/           # 其他（UI / 背景 / 特效纹理）
│       └── pin/            # 角色立绘 pin
├── data/
│   ├── act01.json              # 一周目剧情数据（Act01_Chapter01-05，发布版已压缩）
│   ├── act02.json              # 二周目剧情数据（Act02_Chapter01-06，发布版已压缩）
│   ├── raw-index.json          # 全素材库原始文件索引
│   ├── annotations.act01.json  # 一周目 Trial 异议选项社区标注
│   ├── annotations.act02.json  # 二周目 Trial 异议选项社区标注
│   ├── records.json            # 记录·规定词条数据
│   ├── records-candidates.json # 记录候选（待整理入 records.json）
│   ├── evidence.json           # 证物数据（id / 名称 / 图 / 描述 / 关联节点）
│   ├── gallery-manifest.json   # CG 画廊清单（分类 + 图片列表）
│   ├── audio-manifest.json     # 音频清单（SFX / BGM / 语音 + voiceBaseUrl）
│   ├── voice-map.json          # 台词 label → 语音目录全量映射
│   ├── voice-map.act01.json    # 一周目语音映射（页面优先加载）
│   ├── voice-map.act02.json    # 二周目语音映射（页面优先加载）
│   └── r2-config.json          # R2 素材桶公网地址
├── tools/
│   ├── import_story.py         # 剧本导入：日常剧情 + Bad End → actXX.json
│   └── minify-data.mjs         # 发布前压缩剧情数据 + 拆分语音映射
├── .github/
│   ├── workflows/validate.yml  # 数据校验 CI（push / PR 自动运行）
│   └── scripts/validate-data.mjs
├── phone.png / phone.webp  # 手机弹窗皮肤资源
├── nnk_box.webp            # 意见箱图标
├── .trae/tools/            # 本地构建脚本（未入库）
│   ├── build_story.py          # 从 .bytes 剧本生成 act01.json + act02.json
│   ├── build_audio_manifest.py # 生成 audio-manifest.json
│   ├── build_evidence.py       # 生成 evidence.json
│   ├── build_gallery_manifest.py # 生成 gallery-manifest.json
│   ├── extract_records.py      # 生成 records.json + records-candidates.json
│   └── convert_tga.py          # TGA → WebP 图片转换
├── README.md               # 本文件
└── .gitignore
```

## 页面架构

### 节点图谱页（act01 / act02）

为解决单页加载 400+ 节点导致的卡顿问题，剧情图谱按周目拆分为两个独立页面：

- **一周目页 `act01.html`**：仅加载 `data/act01.json`（发布版约 3.6MB，205 节点），渲染 Act01_Chapter01-05 节点图谱；顶部含「← 首页」链接；Act01_Chapter05 末尾节点详情面板含「→ 进入二周目」跨周目导航链接
- **二周目页 `act02.html`**：仅加载 `data/act02.json`（发布版约 3.7MB，201 节点），渲染 Act02_Chapter01-06 节点图谱；顶部含「← 一周目」+「← 首页」链接

> 数据说明：两个图谱页的原始数据约 5MB，发布前经 `tools/minify-data.mjs` 压缩；页面请求使用增量校验（数据未变化时服务器返回 304，不重复下载）。首次加载仍需数秒，页面会给出提示。

两页共用 `assets/style.css` + `assets/app.js`，`app.js` 通过 `document.body.dataset.act` 判断当前周目并加载对应数据文件。

### 内容页（records / evidence / gallery / audio）

四个资料栏目页面共用 `assets/content.css`，各页有独立的 JS 逻辑文件，均依赖 `assets/shared.js` 提供的公共工具（主题切换、toast、HTML 转义等）：

- **记录·规定 `records.html`**：浏览世界观术语与监牢规定词条，支持分类筛选与关联词条跳转
- **证物 `evidence.html`**：按章节浏览证物图鉴，含名称、描述与关联剧情节点
- **CG 画廊 `gallery.html`**：按分类（角度像 / 证物 / 事件插画 / 场景背景 / 切入插画 / 角色全身 / 楼层地图等）浏览 CG，支持缩略图与原图查看
- **语音和音乐 `audio.html`**：按场景 / 角色筛选语音条目，试听 BGM，页内迷你播放器控制

### 弹窗播放器（player.html）

独立的音乐播放器窗口，由各页面通过 `player-launcher.js` 唤起。支持播放 / 暂停、进度控制，与页内音频互相暂停（页内播放时弹窗 BGM 自动暂停，反之亦然）。

### 主题切换

明暗主题通过 `localStorage` 在所有页面间持久化共享，`shared.js` 中的 `MS.initTheme()` 负责初始化切换控件。

## Trial 异议选项标注 (社区协作)

Trial 审判场景中存在多个异议选项，其中部分是**错误选项**（无法推进剧情，类似 Bad End 的岔开分支），但源文本未直接标注。本项目通过 `data/annotations.act01.json` + `data/annotations.act02.json` 让特定人员像 wiki 一样协作标注：

- 在详情面板中，Trial 节点会列出全部异议选项，显示状态徽章：`正确`（绿色）/ `错误`（红色）/ `待标注`（灰色）。
- 点击面板内的「✎ 编辑标注 (GitHub)」按钮，跳转到 GitHub 在线编辑对应周目的 annotations 文件。
- 标注格式：`"选项ID": { "isCorrect": true/false, "note": "说明" }`。`true`=正确推进，`false`=错误死路，不填=未知。
- 标注按周目分文件：choiceId 以 `0101`-`0105` 开头的归 `annotations.act01.json`，以 `0201`-`0206` 开头的归 `annotations.act02.json`，键名结构与原合并版 `annotations.json` 完全一致，向后兼容。
- 标注文件的提交会经过仓库 CI 自动校验（JSON 格式、节点 id 唯一、语音映射键一致性），格式错误无法合入。

## 用本仓库制作你自己的故事节点页

这个仓库不只是官方章节的资料站，也**面向想自己制作剧情节点 / 故事页的用户**开放：fork 之后你得到一整套可直接运行、可部署的节点图谱模板与工具链。

1. **fork 本仓库**。
2. **用 [Manosaba Trial Tagger](https://github.com/QwQSakuya/Manosaba-Trial-Tagger) 标注审判节点**：标注选项正确性（正确 / 错误 / 中立）、结果范围、证物 / 证人分支与嵌套子分支，并分配 Objection ID。
3. **导出标注**：在标注器中「导出 textfinder-merged」，得到 `annotations.actXX.json`。
4. **导入剧情数据**：用 `tools/import_story.py` 把剧本转换为 `data/actXX.json`（日常剧情 + Bad End；Trial 审判节点走标注器）：

   ```bash
   python tools/import_story.py <你的剧本目录> data/actXX.json
   node tools/minify-data.mjs
   ```

5. **放入数据与页面**：把标注 JSON 放进 `data/`，参照 `act01.html` 复制一个故事页（`document.body.dataset.act` 指向你的数据文件），并在 `index.html` 加入你的入口卡片。
6. **部署分享**：开启你 fork 仓库的 GitHub Pages，把属于你的故事分享给其他共犯者。

### 工具现状

- **日常剧情与 Bad End 通用导入工具**：已提供（`tools/import_story.py`）。
- **Trial 审判节点标注工具**：已提供（Manosaba Trial Tagger）。
- 更多自动化工具（如审判节点的自动标注）规划中。

> 提示：官方章节的解包素材（CG、音频、原始脚本）版权归原作方所有，请勿在自建页面中直接复用；你自己的 MOD 故事内容与标注由你自行负责。

### 剧本导入工具（日常剧情 + Bad End）

`tools/import_story.py` 把 Naninovel 剧本转换为节点数据，覆盖章节、日常剧情（Adv）、选择点与 Bad End（Bad）节点：

- 支持官方 `.bytes` 本地化剧本（`ActAA_ChapterCC_AdvNN.bytes` / `..._BadNN.bytes`），也支持带标注标记的 `.txt`。
- 文件名决定节点 id：`Act01_Chapter02_Adv03.bytes` → `0102Adv03`，`..._Bad01.bytes` → `0102Bad01`。
- `@choice` 按钮为 `ChoiceButtons/Adv/Bad` 时按章节顺序映射到 BadNN；`.txt` 里用 `<choice NN> <badend BadXX>` 可手动指定。
- Trial 文件会自动跳过并在终端提示，审判节点请用 Manosaba Trial Tagger 标注后把 `annotations.actXX.json` 放入 `data/`。
- 导入后记得运行 `node tools/minify-data.mjs` 压缩数据。

## 许可与版权

- 本仓库**自研的页面代码、脚本与社区标注**采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)（署名—非商业性使用—相同方式共享）许可。
- 《魔法少女的魔女审判》相关的**剧情数据、CG、音频等素材版权归 Re,AER LLC / Acacia 及中文发行方所有，不在上述许可范围内**。本站为粉丝整理的非官方资料站，完整免责声明与引用资源见 [credits.html](credits.html)。

## 意见箱反馈

页面右下角有「意见箱」浮动按钮，点击会跳转到 GitHub Issues 提交页面，便于收集使用者反馈。

## 数据格式

### 剧情数据 (`data/act01.json` / `data/act02.json`)

```json
{
  "meta": { "title": "...", "version": "...", "generated": "...", "note": "Act01_Chapter01-05（一周目）" },
  "nodes": [
    {
      "id": "0101Adv01",           // 唯一标识
      "title": "Adv01 ...",         // 节点显示标题
      "level": 0|1|2,               // 0=章节 1=场景 2=对话
      "x": 500, "y": 280,           // 画布坐标（实际由 computeLayout() 覆盖）
      "route": "normal",            // 路线 (normal/bad04/bad05/...)
      "type": "adv",                // adv/ti/tr/bd/chapter
      "parentId": "A1C1",           // 父节点 id
      "nextId": "0101Adv18",        // 顺序下一节点（跨周目衔接的 nextId 置空，由页面跳转代替）
      "isChoice": true,             // 是否为选择点
      "summary": "...",             // 摘要
      "text": "...",                // 完整文本
      "character": "Ema",           // 说话角色
      "choices": [                  // 选项列表
        { "text": "逃往招待所", "leadsTo": "0101Bad04", "isBadEnd": true, "result": "Bad04" }
      ],
      "media": {                    // 预留: 未来 CG/音乐/音效 (当前未渲染)
        "cg": null, "bgm": null, "sfx": null
      }
    }
  ]
}
```

路由过滤按钮会根据 `nodes` 中出现的 `route` 字段自动生成，无需修改 HTML。

### 证物数据 (`data/evidence.json`)

```json
{
  "evidence": [
    {
      "id": "Clue_010_001",
      "name": "Clue_010_001",       // 原始文件名
      "nameZh": "希罗的钢笔",        // 中文名
      "sprite": "Clue_010_001.webp", // 图文件名 (位于 assets/cg/evidence/)
      "category": "证物",
      "act": 0, "chapter": 0, "scene": 1,
      "w": 512, "h": 512,
      "relatedNodes": [],           // 关联剧情节点 id
      "description": "二阶堂希罗原本持有的钢笔。"
    }
  ]
}
```

### 记录数据 (`data/records.json`)

```json
{
  "lore": [
    {
      "id": "witchification",
      "title": "魔女化",
      "aliases": ["魔女変化", "Witchification"],
      "category": "魔女化",
      "characters": ["Ema", "Hiro", "Noah"],
      "paragraphs": ["..."],
      "relatedTerms": ["witch-factor"],
      "source": ["Act01 Ch02", "Act01 Ch04"]
    }
  ]
}
```

### 音频清单 (`data/audio-manifest.json`)

```json
{
  "sfx": [{ "id": "...", "file": "sfx/Common/....ogg", "label": "...", "category": "Common", "size": 56905 }],
  "bgm": [{ "id": "...", "file": "bgm/Songs/....ogg", "label": "...", "category": "..." }],
  "voice": [{ "id": "...", "externalUrl": "...", "character": "Ema", "characterName": "艾玛", "scene": "...", "duration": 3.2 }],
  "voiceBaseUrl": "https://..."
}
```

### 画廊清单 (`data/gallery-manifest.json`)

```json
{
  "categories": [{ "id": "angle", "label": "角度像" }, { "id": "evidence", "label": "证物" }, ...],
  "items": [{ "id": "...", "category": "angle", "file": "angle/Ema_Angle01.webp", "label": "..." }]
}
```

## 交互说明

### 节点图谱页

- **滚轮**：缩放；**拖拽空白**：平移画布
- **拖拽节点**：移动节点位置（松开后邻居自动避让）
- **双击空白**：回到概览
- **点击节点**：打开详情面板
- **搜索框**：按标题/角色/文本/摘要过滤
- **路线按钮**：按 normal / Bad04 / Bad05 过滤显示
- **ESC**：关闭详情面板
- **跨周目导航**：一周目末尾节点详情面板 →「→ 进入二周目」链接 → 二周目页面

### 内容页

- **记录·规定**：点击分类筛选词条，点击关联词条跳转
- **证物**：按章节筛选，点击证物查看详情与关联节点
- **CG 画廊**：按分类筛选，点击缩略图查看原图
- **语音和音乐**：按场景 / 角色筛选语音，点击播放；BGM 区独立试听

### 弹窗播放器

- 各页面右下角的播放按钮通过 `player-launcher.js` 唤起 `player.html` 弹窗
- 弹窗播放器与页内音频互斥：一方播放时另一方自动暂停
