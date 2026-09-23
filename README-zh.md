[English](README.md)

# opencode-alert

[OpenCode](https://opencode.ai) v2 TUI 通知插件 —— 为本窗口已打开的会话提供桌面通知与音效提醒，支持项目级配置。

## 功能特性

- 桌面通知（Windows Toast、macOS 通知中心、Linux notify-send）
- 音效提醒，支持自定义音频文件
- 按 TUI 窗口过滤会话，包含已打开的后台标签页
- 智能过滤：安静时段、通知节流
- 项目级配置，支持深度合并
- 零上下文污染（不注入任何工具或提示词）

## 技术栈

- **运行时**: TypeScript (strict ESM), Node.js ≥18
- **插件格式**: OpenCode v2 插件（`{ id, setup }` 默认导出，以 TS 源码直接加载——无构建步骤）
- **测试**: Vitest
- **代码检查**: Biome
- **桌面通知**: 操作系统 shell 命令（osascript / notify-send / PowerShell toast + AUMID）
- **声音**: 平台原生命令（afplay / ffplay / PowerShell）
- **配置**: JSONC + 深度合并 + JSON Schema 校验

## 安装

本文描述的 TUI 迁移仍为 **Unreleased（未发布）**。请使用包含本次改动的本地代码目录；已发布的 2.0.0 包不包含这次迁移。

### 配置 TUI

推荐在 `tui.json`（例如 `~/.config/opencode/tui.json`）的 `plugins` 中引用本地插件目录：

```json
{
  "plugins": ["file:///path/to/opencode-alert"]
}
```

Windows 路径可写为 `file:///D:/projects/opencode-alert`。更新代码后，重新加载插件或重启 TUI。

原有 `opencode.json` 插件引用可以保留：server 入口仅登记插件，让 TUI 发现其 TUI 功能，不订阅事件、不发送通知。避免通过多种安装方式重复添加同一个插件。

### 项目自动发现与入口

也可以将这份代码复制到 `.opencode/plugins/opencode-alert/`（`plugins` 为复数）。本地发现要求目标为插件目录，其中实际存在的 `tui.ts` 是 TUI 入口，`index.ts` 是不执行通知的 server 兼容入口。包导出提供 `./tui`、`.` 和 `./server`。

## 配置

创建 `~/.config/opencode/alert.jsonc`（全局）或 `.opencode/alert.jsonc`（项目级）：

```jsonc
{
  // 全局开关
  "enabled": true,

  // 桌面通知
  "desktop": {
    "enabled": true,
    "events": ["idle", "error", "permission"]
  },

  // 音效通知
  "sound": {
    "enabled": true,
    "events": {
      "idle": "ding.wav",
      "error": "alert.wav",
      "permission": "ping.wav"
    },
    "default": "ding.wav",
    "customDir": "~/.config/opencode/alert-sounds/"
  },

  // 智能过滤
  "filter": {
    "quietHours": {
      "enabled": false,
      "start": "22:00",
      "end": "08:00"
    },
    "minInterval": 5
  }
}
```

### 配置搜索顺序

1. 环境变量 `OPENCODE_ALERT_CONFIG` 指定的路径
2. `.opencode/alert.jsonc`（项目级）
3. `alert.jsonc`（项目根目录）
4. `~/.config/opencode/alert.jsonc`（全局）

项目级配置覆盖全局配置（深度合并）。TUI 根据事件所属会话的目录在本机加载配置；缺少会话元数据时，使用 TUI location 或默认 location。配置按目录缓存，插件重载后刷新，因此不同项目的已打开标签页可以使用各自的配置。

`suppressWhenFocused: true` 时，通过本 TUI renderer 的 `focus` / `blur` 事件跟踪焦点。在收到首个焦点事件前，状态未知，按尽力处理原则允许通知；插件不会通过其他终端进程推断本窗口焦点。

### 最简配置

```jsonc
{ "enabled": true }
```

## 事件类型

插件订阅 OpenCode v2 事件并映射为内部提醒类型：

| v2 事件 | 内部提醒 | 触发条件 | 使用的数据 |
|---------|---------|---------|-----------|
| `session.execution.succeeded` | `idle` —— 任务完成 | AI 回合结束 | `sessionID` |
| `session.execution.failed` | `error` —— 发生错误 | 执行出错 | `sessionID`、`error` |
| `session.execution.interrupted` | `cancel` —— 已取消 | 仅用户主动中断（`reason === "user"`） | `sessionID`、`reason` |
| `permission.asked` | `permission` —— 请求权限 | 权限请求 | `message`，或 `action` + `resources` |
| `form.created` | `question` —— 提问 | 表单提问 | `form.title`、`form.fields` |
| `session.tool.input.started` | ——（仅记录） | 工具调用开始，按调用 ID 记录工具名 | `id`、`name` |
| `session.tool.success` | `subagent` —— 子代理完成 | `task` 工具完成，按调用 ID 关联 | `id`、`content` |

仅本 TUI 窗口已打开的会话可以通知。启用标签页时包含所有已打开的根会话标签页，也包含后台标签页；禁用标签页时，仅当前会话页面及其子会话可以通知，首页和插件页面不接收会话提醒。子会话的权限请求、提问仍可通过已打开的父会话提醒；子会话完成事件仍不会触发父任务的完成提醒。

插件按 envelope 事件 ID 在 24 小时窗口内去重，通过 `~/.config/opencode/alert-events` 下的原子文件声明协调。共享目录可写时，不同模块实例或进程不会重复发送同一事件，去重不依赖 `filter.minInterval`；不同 ID 的新事件仍按配置过滤后通知。过期记录会在后续通知活动中清理。存储不可用时退回有容量上限的内存去重，尽力处理；没有 ID 的事件保留原有节流行为。

关闭 TUI 或卸载插件会取消待发通知。延时通知在实际发送前会重新检查标签页、当前路由、renderer 生命周期和焦点，关闭标签页或离开单会话页面后也不会继续弹出其待发提醒。已经由操作系统展示的通知不会撤回。Windows 与其他平台一样遵守 `desktop.enabled` 和 `desktop.events`，音效独立配置；Windows 注册和通知进程异步执行，避免阻塞 TUI。

## 与 TUI 内置通知的关系

OpenCode v2 的 TUI 自带通知能力（通过 `tui.json` 的 `attention` 配置项控制）。本插件运行在 TUI 中，为其已打开的会话发送系统桌面通知和音效；不拦截或替换 renderer 的 `triggerNotification`，TUI 关闭后不再提醒。

如果你主动开启了 TUI 内置通知或音效，它们可能与插件提醒叠加。希望由本插件负责这两个渠道时，可在 `tui.json` 中设置如下内容；本插件不会自动修改该配置。

```json
{ "attention": { "notifications": false, "sound": false } }
```

## 环境要求

- **OpenCode**: v2 及以上。v1 用户请继续使用 0.2.x —— 2.0.0 是面向 v2 插件 API 的破坏性大版本。

### 桌面通知

- **Windows**：无需额外安装（PowerShell toast，AUMID 自动注册）
- **macOS**：无需额外安装（使用通知中心）
- **Linux**：需要 `notify-send`（安装：`sudo apt install libnotify-bin`）

### 音效

- **macOS**：无需额外安装（使用 `afplay`）
- **Linux**：需要 `ffmpeg`（安装：`sudo apt install ffmpeg`）
- **Windows**：无需额外安装（使用 PowerShell SoundPlayer / MediaPlayer）

## 与现有插件对比

| 功能 | @chousyn/opencode-alert | opencode-notify | opencode-notificator |
|------|---------------|-----------------|---------------------|
| Windows 支持 | 支持 | 支持 | 不支持 |
| 自定义音效 | 全平台 | 仅 macOS | 全平台 |
| 项目级配置 | 支持 | 不支持 | 不支持 |
| 安静时段 | 支持 | 支持 | 不支持 |
| 开关控制 | 支持 | 不支持（需卸载） | 支持 |
| npm 发布 | 支持 | 不支持（仅 OCX） | 不支持（手动安装） |

## 开发

```bash
npm install
npm test
npm run lint
npx tsc --noEmit
```

从源码运行 OpenCode v2（如 `bun run packages/cli`）时需 bun >= 1.4——旧版 bun 因上游宿主的模块解析问题无法加载 `file://` 目录插件。

## 开发路线

详见 [ROADMAP.md](./ROADMAP.md)。

## 许可证

MIT
