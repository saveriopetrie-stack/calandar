# 📅 日历 · Calendario

一个像 Google Calendar / 微软日历 的个人日历网站，额外支持 **语音 + AI 自动填写** 和 **每日任务打勾**。

- 网页端：浏览器直接使用（桌面 / 手机浏览器）
- 安卓端：WebView 打包 APK（见 `android/`）
- 后端：Python Flask + SQLite，数据存在服务器上
- AI：DeepSeek API（key 在网页「设置」里自己填，保存在服务器）

---

## ✨ 功能

| 功能 | 说明 |
| --- | --- |
| 📆 月历视图 | 月份切换、迷你日历、今天定位、点击日期查看当天日程 |
| ➕ 事件管理 | 新建 / 编辑 / 删除事件：标题、全天、起止时间、地点、备注、10 种颜色 |
| 🎤 语音输入 | 点麦克风说话（浏览器 Web Speech API，免密钥），自动转文字 |
| 🤖 AI 自动填写 | DeepSeek 理解自然语言，自动判断是「事件」还是「任务」，填好所有字段，你确认后保存 |
| ✅ 每日任务 | 每天自动出现的重复任务，每天单独打勾记录（可翻历史日期回看） |
| 📋 一次性任务 | 带截止日期的待办，逾期会标红提示 |
| 🌐 中英双语 | 顶部一键切换，随设置保存 |
| 🌗 明暗主题 | 跟随系统 / 浅色 / 深色 |
| 🔑 API key 自助配置 | 设置页填入 DeepSeek key，保存到服务器 |
| 🔒 访问密码保护 | 设置页一键开启，登录限流 + 安全响应头 + 密码哈希存储 |

**试试对语音说：**
- 「明天下午 3 点和张三开产品会议，地点在公司会议室」→ 自动创建事件
- 「本周五晚上 7 点去看电影」→ 自动创建事件
- 「每天早上 8 点跑步半小时」→ 自动创建每日任务

---

## 🚀 运行（网页端）

标准环境：

```bash
cd calendar-app
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

本机（无系统 pip/venv 的特殊环境）直接：

```bash
cd calendar-app && ./run.sh
```

浏览器打开 http://127.0.0.1:5000

### 配置 DeepSeek API key

1. 在 [platform.deepseek.com](https://platform.deepseek.com) 注册并创建 API key
2. 打开网页右上角 ⚙️ 设置
3. 粘贴 key → 保存
4. 之后语音 / 文字输入就会由 AI 自动解析填写

> key 保存在服务器本地 SQLite 中（`calendar.db`），仅本机使用。请勿把 key 提交到公开仓库。

---

## ☁️ 部署到公网

想让手机 / 别人也能访问，可以部署到 Render / Railway / Fly.io，仓库里已经准备好三个平台的配置文件（`render.yaml`、`Procfile`、`Dockerfile` + `fly.toml`）。具体步骤见 [`DEPLOY.md`](DEPLOY.md)。

> 部署到公网后**务必**先在设置里开启访问密码，否则任何知道网址的人都能直接用你的日历。

---

## 🔒 安全性

应用默认监听 `0.0.0.0`（方便手机 App 连接），这意味着同一局域网内的其他设备也能访问它。**在把服务器暴露到局域网 / 公网之前，请先设置访问密码：**

1. 打开网页 → 右上角「⋯」→ 设置
2. 拉到底部「访问密码」区域，填写新密码（至少 6 位）→ 保存密码
3. 之后打开本应用都需要先输入密码；可在同一处修改或「关闭密码保护」

若通过 `HOST=127.0.0.1` 只在本机使用，可以不设置密码。未设置密码且监听地址不是 `127.0.0.1` 时，启动日志会打印警告提醒。

其他内置的安全措施：

- 生产环境默认关闭 Flask `debug` 模式（避免暴露 Werkzeug 调试器/远程代码执行风险），如需调试可设置 `FLASK_DEBUG=1`
- 密码使用加盐哈希（`werkzeug.security`）存储，不落地明文
- 登录接口限流（5 分钟内最多 8 次尝试），AI 解析接口限流（5 分钟最多 20 次），防暴力破解与滥用
- 统一安全响应头：`Content-Security-Policy`、`X-Frame-Options`、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`
- 请求体大小上限 1MB，标题/备注/地点等字段做长度限制，事件颜色做白名单校验
- DeepSeek 接口地址（`deepseek_base_url`）校验为合法 `http(s)` URL，防止被用作服务端请求伪造（SSRF）跳板套取已保存的 API key
- 会话 Cookie 设置 `HttpOnly` + `SameSite=Lax`

> 这是为个人自用场景设计的轻量方案（内存态限流、单密码），不等同于多用户 / 企业级鉴权系统。若要在公网长期运行，建议额外套一层反向代理 + HTTPS。

---

## 📱 安卓端（WebView APK）

`android/` 是一个完整的 Android Studio 工程，把网页版包成 App。

1. 用 Android Studio 打开 `calendar-app/android/`
2. 修改 `MainActivity.java` 顶部的 `SERVER_URL`：
   - 电脑和手机连同一个 Wi-Fi
   - 电脑查局域网 IP（Linux: `ip addr`，Windows: `ipconfig`）
   - 服务器以 `0.0.0.0` 启动（默认就是）
   - 例如 `http://192.168.1.100:5000`
3. Build → Build APK，安装到手机

> 说明：WebView 的语音识别支持取决于手机系统 WebView 版本；若语音不可用，可用文字输入框代替。

---

## 🗄️ 数据模型（SQLite）

- `events` — 日历事件（标题、起止时间、地点、备注、颜色）
- `tasks` — 任务（`daily` 每日重复 / `one_time` 一次性，可选时间与截止日期）
- `task_completions` — 某任务在某天的完成记录（每天单独打勾）
- `settings` — DeepSeek key、语言、主题

数据库文件：`calendar-app/calendar.db`（可随时删除重建）。

---

## 🔌 API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/events?start=&end=` | 按日期范围查事件 |
| POST/PUT/DELETE | `/api/events[/id]` | 事件增改删 |
| GET/POST/PUT/DELETE | `/api/tasks[/id]` | 任务增改删 |
| GET | `/api/tasks/<id>/completions` | 任务的完成日期列表 |
| POST/DELETE | `/api/tasks/<id>/complete` | 勾选 / 取消某天完成 |
| GET/POST | `/api/settings` | 读取 / 保存设置（key、语言、主题） |
| POST | `/api/ai/parse` | 自然语言 → 结构化事件/任务 JSON |
| GET/POST | `/login` | 登录页 / 提交密码登录 |
| POST | `/logout` | 退出登录 |
| POST | `/api/security` | 设置 / 修改 / 关闭访问密码 |

---

## 🎨 设计说明

界面遵循 [emilkowalski/skills](https://github.com/emilkowalski/skills) 的设计工程规范：

- 自定义缓动曲线（`cubic-bezier(0.23,1,0.32,1)`），UI 动画 < 300ms
- 按钮按压反馈 `scale(0.97)`，弹窗从 `scale(0.96)` 进入（模态居中）
- 顶栏毛玻璃 `backdrop-filter: blur(20px) saturate(180%)`
- 大字标题负字距、正文零字距；支持 `prefers-reduced-motion`
- 明暗主题全部走 CSS 变量，颜色语义化
