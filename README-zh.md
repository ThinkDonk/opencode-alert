[English](README.md)

# opencode-alert

[OpenCode](https://opencode.ai) v2 跨平台通知插件 —— 桌面通知与音效提醒，支持项目级配置。

## 功能特性

- 桌面通知（Windows Toast、macOS 通知中心、Linux notify-send）
- 音效提醒，支持自定义音频文件
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

OpenCode v2 按 `pkg/server` → `pkg` 顺序解析插件入口。本包 `exports` 字段提供 `.` 和 `./server` 两个入口，指向同一份 TypeScript 源码。

### 复制到项目目录

将插件复制或克隆到项目的 `.opencode/plugin/` 目录（v2 要求插件目标为目录）：

```bash
git clone https://github.com/ThinkDonk/opencode-alert .opencode/plugin/opencode-alert
```

### npm 包或本地路径

在 OpenCode 配置文件（`~/.config/opencode/opencode.json`）的 `plugins` 数组中引用：

```json
{
  "plugins": ["@chousyn/opencode-alert"]
}
```

锁定版本：

```json
{
  "plugins": ["@chousyn/opencode-alert@2.0.0"]
}
```

或使用本地路径：

```json
{
  "plugins": ["file:///path/to/opencode-alert"]
}
```

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

项目级配置覆盖全局配置（深度合并）。

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

## 与 TUI 内置通知的关系

OpenCode v2 的 TUI 自带通知能力（通过 `tui.json` 的 `attention` 配置项控制）。本插件与其互补：插件运行在 server 进程，提供系统级桌面通知和音效，TUI 关闭或失去焦点时依然生效。

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

## 开发路线

详见 [ROADMAP.md](./ROADMAP.md)。

## 许可证

MIT
