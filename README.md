# 大魔女图书馆 · Manosaba Library

《魔法少女的魔女审判》**玩家自发的非官方资料站**，基于解包文件整理，单纯为爱发电。

站点收录一周目 / 二周目全章剧情节点图谱、记录与规定、证物图鉴、CG 画廊、语音音乐与全素材库索引，并支持 Trial 异议选项的社区协作标注。

> 剧情数据、CG、音频等素材版权归原作方所有；本站自研页面代码、脚本与社区标注以 CC BY-NC-SA 4.0 发布。完整免责声明见 [credits.html](credits.html)。

## 在线访问

| 站点 | 地址 | 说明 |
| --- | --- | --- |
| 主站 | <https://manosaba-library.com> | Cloudflare R2 托管，推荐优先访问 |
| 国内副站 | <https://cn.manosaba-library.com> | 面向国内用户优化的入口 |
| GitHub 备用 | <https://github.manosaba-library.com> | 备用镜像（同 <https://qwqsakuya.github.io/Manosaba-Library/>） |

所有图片、语音与 BGM 统一从素材域名 `https://r2.manosaba-library.com` 加载，具体配置见 `data/r2-config.json`。

### 页面

| 路径 | 内容 |
| --- | --- |
| `/` | 落地页：周目入口 + 资料栏目 |
| `/act01.html` | 一周目节点图谱（Act01_Chapter01-05，205 节点） |
| `/act02.html` | 二周目节点图谱（Act02_Chapter01-06，201 节点） |
| `/records.html` | 记录·规定（世界观术语与监牢规定） |
| `/evidence.html` | 证物图鉴（按章节浏览 + 关联节点） |
| `/gallery.html` | CG 画廊（角度像 / 证物 / 事件插画 / 场景背景等） |
| `/audio.html` | 语音和音乐（按场景 / 角色筛选试听） |
| `/archive.html` | 全素材库索引（原始文件检索） |
| `/workshop.html` | 工坊（角色立绘自定义提取） |
| `/credits.html` | 制作名单与免责声明 |
| `/player.html` | 弹窗音乐播放器（由各页面唤起） |
| `/404.html` | 自定义 404 页 |

## 架构与素材存放

- 网页、脚本与数据清单保存在本仓库；**主站由 Cloudflare R2 提供**（对象前缀 `web/`），GitHub Pages 作为备用镜像。
- CG、音频、证物、立绘库等体积较大的素材**全部存放在 R2**；页面通过 `data/r2-config.json` 的 `webBaseUrl` 从 R2 域名加载。
- 仓库内的 `assets/cg`、`assets/audio`、`assets/evidence` 是同一批压缩素材的镜像，主要用于本地构建与版本备份；删除它们不影响线上站点。
- 部署脚本只上传、不删除：R2 上已有的对象不会因仓库改动而丢失。

## 本地预览

数据通过 `fetch` 加载，不能直接双击 HTML 打开（浏览器禁止 `file://` 下的请求）。在仓库根目录执行：

```bash
python -m http.server 8000
```

然后访问 <http://localhost:8000/>。

## 一键推送部署（维护者专用，脚本不随仓库发布）

维护脚本只存放在维护者本机（`deploy.bat` 与 `tools/` 不入库）。本地改完内容后双击 `deploy.bat`，或执行：

```powershell
.\tools\deploy.ps1 "更新说明"
```

脚本会自动完成：

1. 提交本地改动（未提供说明时自动生成时间戳）
2. `git pull --rebase origin main`，合并协作者的远程改动
3. 推送到 GitHub
4. 用 `tools/sync_r2.py` 把网页 / 素材 / 数据同步到 R2 主站

常用开关：

- `-SkipGit`：只同步 R2，不提交 / 推送 GitHub
- `-SkipR2`：只提交 / 推送 GitHub，不同步 R2
- `-Verify`：完成后自动检查主站是否正常

R2 凭证存放在仓库外的 `E:\project\.r2tool\r2-credentials.ps1`，**不会随仓库公开**。协作者无需运行此脚本，正常提交 PR / push 即可。

## 文件结构

```text
├── index.html                # 落地页
├── act01.html / act02.html   # 一周目 / 二周目节点图谱
├── records.html              # 记录·规定
├── evidence.html             # 证物图鉴
├── gallery.html              # CG 画廊
├── audio.html                # 语音和音乐
├── archive.html              # 全素材库索引
├── workshop.html             # 角色立绘工坊
├── credits.html              # 制作名单与免责声明
├── player.html               # 弹窗音乐播放器
├── 404.html / robots.txt     # 错误页 / 抓取规则
├── butterfly.png / phone.png / phone.webp / nnk_box.webp  # 装饰 / 弹窗皮肤 / 意见箱
├── assets/
│   ├── audio/                # 语音与 BGM（.ogg）
│   ├── cg/                   # 画廊压缩图（.webp，含分类子目录与 thumbs 缩略图）
│   ├── evidence/             # 证物图（.png）
│   ├── fonts/                # 本地字体（.woff2）
│   ├── lib/                  # 第三方 JS 库
│   └── *.css / *.js          # 页面公共样式与脚本
├── data/
│   ├── act01.json / act02.json            # 周目剧情节点数据
│   ├── annotations.act01.json / .act02.json  # Trial 异议选项社区标注
│   ├── records.json / records-candidates.json  # 记录·规定词条
│   ├── evidence.json                       # 证物清单
│   ├── gallery-manifest.json               # 画廊清单
│   ├── audio-manifest.json                 # 音频清单（语音 / BGM / SFX）
│   ├── voice-map*.json / voice-full.json   # 语音台词 → 文件全量映射
│   ├── bgm-full.json / media-full.json     # 全量媒体索引
│   ├── raw-index.json / chara-index.json   # 原始素材与立绘索引
│   └── r2-config.json                      # R2 素材域名配置
├── LICENSE
└── README.md
```

## 页面说明

- **节点图谱页**：Canvas 节点图，支持缩放、平移、搜索、路线过滤与详情面板；按周目拆分，避免单页加载 400+ 节点卡顿。
- **内容页**：records / evidence / gallery / audio 共用公共样式与逻辑，支持分类筛选与详情查看。
- **弹窗播放器**：各页面右下角播放按钮唤起 `player.html`，与页内音频互斥播放。
- **主题切换**：明暗主题通过 `localStorage` 全局持久化。

## Trial 异议选项标注（社区协作）

Trial 审判场景中存在错误选项（无法推进剧情，类似 Bad End），源文本未直接标注正确性。本项目通过 `data/annotations.act01.json` 与 `data/annotations.act02.json` 进行社区协作标注：

- 详情面板中 Trial 节点会列出全部异议选项，显示状态徽章：`正确`（绿）/ `错误`（红）/ `待标注`（灰）。
- 点击「✎ 编辑标注 (GitHub)」跳转到 GitHub 在线编辑对应周目的标注文件。
- 标注格式：`"选项ID": { "isCorrect": true/false, "note": "说明" }`，`true` = 正确推进，`false` = 错误死路，不填 = 未知。
- 标注按周目分文件：choiceId 以 `0101`-`0105` 开头归 `annotations.act01.json`，以 `0201`-`0206` 开头归 `annotations.act02.json`。
- 标注文件为 JSON 格式，修改时注意保持结构完整，合并前请人工核对。

## 用本仓库制作你自己的故事节点页

这个仓库不只是官方章节资料站，也面向想自建剧情节点 / 故事页的用户：fork 后即可得到整套可直接运行的节点图谱模板与工具链。

1. **fork 本仓库**。
2. **标注审判节点**：使用 [Manosaba Trial Tagger](https://github.com/QwQSakuya/Manosaba-Trial-Tagger) 标注选项正确性、证物 / 证人分支与嵌套子分支，并分配 Objection ID。
3. **导出标注**：在标注器中选择「导出 textfinder-merged」，得到 `annotations.actXX.json`。
4. **准备剧情数据**：按 `data/actXX.json` 的节点格式生成自己的剧情数据（维护者本机的剧本导入工具不随仓库发布）。
5. **放入数据与页面**：把标注 JSON 放进 `data/`，参照 `act01.html` 复制一个故事页（`document.body.dataset.act` 指向你的数据文件），并在 `index.html` 加入入口卡片。
6. **部署分享**：开启 fork 仓库的 GitHub Pages，把属于你的故事分享给其他共犯者。

> 提示：官方章节的解包素材（CG、音频、原始脚本）版权归原作方所有，请勿在自建页面中直接复用；你自己的 MOD 故事内容与标注由你自行负责。

## 数据格式

### 剧情数据（`data/act01.json` / `data/act02.json`）

```json
{
  "meta": { "title": "...", "version": "...", "generated": "...", "note": "..." },
  "nodes": [
    {
      "id": "0101Adv01",
      "title": "Adv01 ...",
      "level": 0,
      "x": 500,
      "y": 280,
      "route": "normal",
      "type": "adv",
      "parentId": "A1C1",
      "nextId": "0101Adv18",
      "isChoice": true,
      "summary": "...",
      "text": "...",
      "character": "Ema",
      "choices": [
        { "text": "逃往招待所", "leadsTo": "0101Bad04", "isBadEnd": true, "result": "Bad04" }
      ]
    }
  ]
}
```

路由过滤按钮会根据 `nodes` 中出现的 `route` 字段自动生成，无需修改 HTML。

### 其他数据文件

- `evidence.json`：证物清单（id / 名称 / 图 / 描述 / 关联节点）。
- `gallery-manifest.json`：CG 画廊分类与图片清单。
- `audio-manifest.json`：SFX / BGM / 语音清单，`voiceBaseUrl` 指向 R2 音频目录。
- `r2-config.json`：`baseUrl` 为素材原图基础地址，`webBaseUrl` 为网页压缩素材基础地址。

## 许可与版权

- 本仓库**自研的页面代码、脚本与社区标注**采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)（署名—非商业性使用—相同方式共享）许可。
- 《魔法少女的魔女审判》相关的**剧情数据、CG、音频等素材版权归 Re,AER LLC / Acacia 及中文发行方所有**，不在上述许可范围内。本站为粉丝整理的非官方资料站，完整免责声明与引用资源见 [credits.html](credits.html)。

## 意见箱反馈

页面右下角有「意见箱」浮动按钮，点击会跳转到 GitHub Issues，便于收集使用者反馈。
