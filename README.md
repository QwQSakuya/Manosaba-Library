# 魔女审判文本查询器

基于剧情数据的可视化文本查询器，以节点图谱展示场景流向、分支选择与对话内容。支持缩放、平移、搜索、路线过滤、详情面板、Trial 异议选项标注与意见箱反馈。

> 当前包含 Act01_Chapter01 全章数据（61 个节点：3 个章节节点 + 36 个 Adv 场景 + 16 个 Trial 场景 + 8 个 Bad 结局 + 1 个 Trial00 序章）。

## 在线访问 (GitHub Pages)

部署完成后访问：**<https://qwqsakuya.github.io/Manosaba-textfinder/>**

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
├── index.html              # 应用入口 (CSS + JS 内联)
├── data/
│   ├── story.json          # 剧情数据 (节点图谱 + 文本 + Trial 选项)
│   └── annotations.json    # Trial 异议选项社区标注 (正确/错误/待标注)
├── .trae/tools/
│   └── build_story.py      # 从 .bytes 剧本生成 story.json 的脚本
├── README.md               # 本文件
└── .gitignore
```

## Trial 异议选项标注 (社区协作)

Trial 审判场景中存在多个异议选项，其中部分是**错误选项**（无法推进剧情，类似 Bad End 的岔开分支），但源文本未直接标注。本项目通过 `data/annotations.json` 让特定人员像 wiki 一样协作标注：

- 在详情面板中，Trial 节点会列出全部异议选项，显示状态徽章：`正确`（绿色）/ `错误`（红色）/ `待标注`（灰色）。
- 点击面板内的「✎ 编辑标注 (GitHub)」按钮，跳转到 GitHub 在线编辑 `annotations.json`。
- 标注格式：`"选项ID": { "isCorrect": true/false, "note": "说明" }`。`true`=正确推进，`false`=错误死路，不填=未知。

## 意见箱反馈

页面右下角有「意见箱」浮动按钮，点击会跳转到 GitHub Issues 提交页面，便于收集使用者反馈。

## 数据格式

`data/story.json` 结构：

```json
{
  "meta": { "title": "...", "version": "...", "generated": "..." },
  "nodes": [
    {
      "id": "0101Adv01",           // 唯一标识
      "title": "Adv01 ...",         // 节点显示标题
      "level": 0|1|2,               // 0=章节 1=场景 2=对话
      "x": 500, "y": 280,           // 画布坐标
      "route": "normal",            // 路线 (normal/bad04/bad05/...)
      "type": "adv",                // adv/ti/tr/bd/chapter
      "parentId": "A1C1",           // 父节点 id
      "nextId": "0101Adv18",        // 顺序下一节点
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
