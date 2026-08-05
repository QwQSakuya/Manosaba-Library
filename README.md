# 大魔女图书馆

基于剧情数据的可视化文本查询器，以节点图谱展示场景流向、分支选择与对话内容。支持缩放、平移、搜索、路线过滤、详情面板、Trial 异议选项标注与意见箱反馈。

> 当前包含 **第一话（一周目，Act01_Chapter01-05）** 与 **第二话（二周目，Act02_Chapter01-06）** 全章数据，按周目拆分为独立页面，避免单页加载 400+ 节点造成卡顿。

## 在线访问 (GitHub Pages)

部署完成后访问：**<https://qwqsakuya.github.io/Manosaba-textfinder/>**

- 根 URL（`/`）→ 落地页：展示一周目 / 二周目两个入口卡片，点击进入对应周目页面
- `/act01.html` → 一周目节点图谱（Act01_Chapter01-05，约 206 节点）
- `/act02.html` → 二周目节点图谱（Act02_Chapter01-06，约 201 节点）

首次部署需在仓库 **Settings → Pages** 中将 **Source** 设为 `Deploy from a branch`，分支选 `main`，目录选 `/`（root）。

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
├── assets/
│   ├── style.css           # 公共样式（明暗主题 + 角色配色 + 视觉优化）
│   └── app.js              # 公共脚本（数据加载 + Canvas 引擎 + 详情面板）
├── data/
│   ├── act01.json          # 一周目剧情数据（Act01_Chapter01-05）
│   ├── act02.json          # 二周目剧情数据（Act02_Chapter01-06）
│   ├── annotations.act01.json  # 一周目 Trial 异议选项社区标注
│   └── annotations.act02.json  # 二周目 Trial 异议选项社区标注
├── phone.png / phone.webp  # 手机弹窗皮肤资源
├── nnk_box.webp            # 意见箱图标
├── .trae/tools/
│   └── build_story.py      # 从 .bytes 剧本生成 act01.json + act02.json 的脚本
├── README.md               # 本文件
└── .gitignore
```

## 周目分页说明

为解决单页加载 400+ 节点导致的卡顿问题，项目已拆分为三个独立页面：

- **落地页 `index.html`**：项目入口，含两张周目卡片（一周目偏冷色调呼应艾玛篇，二周目偏暖色调呼应希罗篇），魔女审判主题视觉装饰（蝴蝶轮廓、魔法阵几何线条、血迹溅射纹理等 SVG/CSS 元素），明暗主题切换
- **一周目页 `act01.html`**：仅加载 `data/act01.json`（约 3.8MB，206 节点），渲染 Act01_Chapter01-05 节点图谱；顶部含「← 首页」链接；Act01_Chapter05 末尾节点详情面板含「→ 进入二周目」跨周目导航链接
- **二周目页 `act02.html`**：仅加载 `data/act02.json`（约 2.8MB，201 节点），渲染 Act02_Chapter01-06 节点图谱；顶部含「← 一周目」+「← 首页」链接

三个页面共用 `assets/style.css` + `assets/app.js`，`app.js` 通过 `document.body.dataset.act` 判断当前周目并加载对应数据文件。主题切换通过 `localStorage` 在三页面间持久化共享。

## Trial 异议选项标注 (社区协作)

Trial 审判场景中存在多个异议选项，其中部分是**错误选项**（无法推进剧情，类似 Bad End 的岔开分支），但源文本未直接标注。本项目通过 `data/annotations.act01.json` + `data/annotations.act02.json` 让特定人员像 wiki 一样协作标注：

- 在详情面板中，Trial 节点会列出全部异议选项，显示状态徽章：`正确`（绿色）/ `错误`（红色）/ `待标注`（灰色）。
- 点击面板内的「✎ 编辑标注 (GitHub)」按钮，跳转到 GitHub 在线编辑对应周目的 annotations 文件。
- 标注格式：`"选项ID": { "isCorrect": true/false, "note": "说明" }`。`true`=正确推进，`false`=错误死路，不填=未知。
- 标注按周目分文件：choiceId 以 `0101`-`0105` 开头的归 `annotations.act01.json`，以 `0201`-`0206` 开头的归 `annotations.act02.json`，键名结构与原合并版 `annotations.json` 完全一致，向后兼容。

## 意见箱反馈

页面右下角有「意见箱」浮动按钮，点击会跳转到 GitHub Issues 提交页面，便于收集使用者反馈。

## 数据格式

`data/act01.json` / `data/act02.json` 结构：

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

## 交互说明

- **滚轮**：缩放；**拖拽空白**：平移画布
- **拖拽节点**：移动节点位置（松开后邻居自动避让）
- **双击空白**：回到概览
- **点击节点**：打开详情面板
- **搜索框**：按标题/角色/文本/摘要过滤
- **路线按钮**：按 normal / Bad04 / Bad05 过滤显示
- **ESC**：关闭详情面板
- **跨周目导航**：一周目末尾节点详情面板 →「→ 进入二周目」链接 → 二周目页面
