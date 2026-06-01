[English](README.md)

# opencode-alert

[OpenCode](https://opencode.ai) 跨平台通知插件 —— 桌面通知、音效提醒和 Webhook 通知，支持项目级配置。

## 功能特性

- 桌面通知（Windows Toast、macOS 通知中心、Linux notify-send）
- 音效提醒，支持自定义音频文件
- 智能过滤：安静时段、通知节流
- 项目级配置，支持深度合并
- 零上下文污染（不注入任何工具或提示词）

## 技术栈

- **运行时**: TypeScript (strict ESM), Node.js ≥18
- **构建**: tsup
- **测试**: Vitest
- **代码检查**: Biome
- **桌面通知**: node-notifier（可选依赖）+ 系统 shell 回退方案
- **声音**: 平台原生命令（afplay / ffplay / PowerShell）
- **配置**: JSONC + 深度合并 + JSON Schema 校验

## 安装

### npm（推荐）

在 OpenCode 配置文件（`~/.config/opencode/opencode.json`）中添加：

```json
{
  "plugin": ["@chousyn/opencode-alert"]
}
```

锁定版本：

```json
{
  "plugin": ["@chousyn/opencode-alert@0.2.2"]
}
```

### 本地开发

```json
{
  "plugin": ["file:///path/to/opencode-alert"]
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

| 事件 | 触发条件 | 默认通知内容 |
|------|---------|-------------|
| `idle` | AI 任务完成 | 会话标题 |
| `error` | 会话错误 | 错误信息 |
| `permission` | AI 请求权限 | 权限详情 |
| `question` | AI 提出问题 | 会话标题 |

## 平台要求

### 桌面通知

- **Windows**：无需额外安装（通过 node-notifier 使用 SnoreToast）
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
| Webhook | 计划中 | 不支持 | 不支持 |
| 项目级配置 | 计划中 | 不支持 | 不支持 |
| 安静时段 | 支持 | 支持 | 不支持 |
| 开关控制 | 支持 | 不支持（需卸载） | 支持 |
| npm 发布 | 支持 | 不支持（仅 OCX） | 不支持（手动安装） |

## 开发

```bash
npm install
npm run build
npm test
npm run lint
```

## 开发路线

详见 [ROADMAP.md](./ROADMAP.md)。

## 许可证

MIT
