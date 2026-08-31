# 部署到 Render / Railway / Fly.io

这三个平台都能免费/低价跑这个 Flask 应用。仓库里已经准备好了各平台需要的配置文件：

| 文件 | 用途 |
| --- | --- |
| `Procfile` | Railway（及任何支持 Procfile 的平台）的启动命令 |
| `render.yaml` | Render 的一键 Blueprint 部署配置 |
| `Dockerfile` / `.dockerignore` | Fly.io（及任何支持 Docker 的平台）构建镜像用 |
| `fly.toml` | Fly.io 的应用配置（含持久化磁盘挂载） |

生产环境统一用 `gunicorn` 启动（`app.py` 里 Flask 自带的开发服务器只适合本机调试，不适合公网）。

**这几步必须由你在浏览器里操作**（授权 GitHub、创建账号、点部署按钮），我这边没有你的账号权限，做不了：

---

## 通用前置：先设好这两件事

1. **`SECRET_KEY`**：三个平台都建议手动设置一个环境变量 `SECRET_KEY`（随便一串够长的随机字符串），否则应用会自己生成并存到数据库里——如果数据库不是持久化的（见下面各平台的存储说明），每次重启用户都会被强制退出登录。
2. **部署上线后立刻**：打开网站 → 设置 → 「访问密码」→ 设一个密码。上线前没有密码保护，任何知道网址的人都能直接用你的日历。

---

## 方案对比：SQLite 数据持久化

这个应用用 SQLite 文件（`calendar.db`）存数据，**必须挂一块持久化磁盘/卷，否则每次重新部署数据全部清空**：

- **Render**：免费套餐**不支持**持久化磁盘（Persistent Disk 需要付费的 Starter 及以上套餐）。免费用只能接受数据不持久，或升级套餐。
- **Railway**：支持 Volume（数据卷），在项目里手动加一个 Volume 挂到 `/data`，免费额度内可用。
- **Fly.io**：`fly volumes create` 创建卷，免费额度通常够用（1 个小卷）；`fly.toml` 里已经配好挂载点 `/data`。

如果只是想让手机能连、偶尔用用，数据不持久也能接受的话可以先跳过这步，图省事。

---

## Render

1. 去 [render.com](https://render.com) 用 GitHub 账号登录，授权访问 `saveriopetrie-stack/calandar` 仓库
2. Dashboard → **New** → **Blueprint** → 选这个仓库 → Render 会读到 `calendar-app/render.yaml` 并自动填好构建/启动命令
3. 如果要持久化数据：把 Instance Type 从 Free 换成 Starter（这样 `render.yaml` 里的 `disk` 才会生效），或者先不管，看免费版够不够用
4. 部署完成后打开分配到的 `https://xxx.onrender.com` 网址 → 按上面「通用前置」设密码

## Railway

1. 去 [railway.app](https://railway.app) 用 GitHub 登录，**New Project → Deploy from GitHub repo** → 选这个仓库
2. 进服务设置：**Root Directory** 填 `calendar-app`（因为 Flask 代码在子目录里，不在仓库根目录）
3. Railway 会自动识别 `Procfile` 用 gunicorn 启动；在 **Variables** 里加：
   - `SECRET_KEY` = 一串随机字符串
   - `CALENDAR_DB` = `/data/calendar.db`（配合下一步的 Volume）
4. 如果要持久化数据：服务设置里 **Volumes → New Volume**，挂载到 `/data`
5. **Settings → Networking → Generate Domain** 拿到公网地址，打开后设密码

## Fly.io

需要先在自己电脑上装 `flyctl` CLI（[官方安装说明](https://fly.io/docs/flyctl/install/)），登录 `fly auth login`，然后：

```bash
cd calendar-app
fly launch --no-deploy      # 会检测到 Dockerfile，按提示起个唯一的 app 名字、选区域
fly volumes create calendar_data --size 1   # 创建 1GB 持久化卷（免费额度内）
fly secrets set SECRET_KEY=$(openssl rand -hex 32)
fly deploy
```

`fly launch` 生成/更新 `fly.toml` 时注意保留仓库里已经写好的 `[mounts]` 和 `[http_service]` 部分（挂载点要对上 `/data`）。部署完用 `fly open` 打开网站，设密码。

---

## 部署后自查清单

- [ ] 打开网址能看到日历页面（不是 500 错误）
- [ ] 设置 → 访问密码 → 已设置，退出登录后能看到登录页
- [ ] 新建一个事件/任务，刷新页面还在（确认数据库真的持久化了）
- [ ] （可选）设置 → DeepSeek API Key，测试语音/AI 解析
