# 在腾讯云上部署本仓库（轻量应用服务器 / CVM 通用说明）

我无法代你登录腾讯云控制台，下面是一份**按顺序可做**的清单；适合 **Ubuntu 22.04**（购买「轻量应用服务器」或 CVM 时选该镜像最省事）。

## 你需要先准备

1. **腾讯云账号**里购买一台服务器（建议：**轻量应用服务器**，套餐 2 核 4G 起，流量够用即可）。
2. 创建实例时：**镜像选 Ubuntu 22.04**，记下 **公网 IP**；在控制台 **重置密码**，用 **SSH** 登录（Mac 终端执行 `ssh ubuntu@你的公网IP`，用户名可能是 `ubuntu` 或 `root`，以镜像说明为准）。
3. 在 **防火墙 / 安全组** 里放行：**22**（SSH）、**80**（HTTP）、若上 HTTPS 再放行 **443**。

## 一、把代码放到服务器上

任选其一：

- **Git**：在服务器安装 git 后 `git clone` 你的仓库地址（需把代码推到 GitHub/Gitee 等）。
- **本地上传**：用 `scp -r DeepAgent ubuntu@公网IP:/opt/` 把整个项目拷到服务器 `/opt/DeepAgent`。

下文假设代码在 **`/opt/DeepAgent`**。

## 二、安装系统依赖

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx git
```

安装 Node.js 20（用于构建前端；若用其他方式安装 Node 亦可）：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

## 三、后端（FastAPI）

```bash
cd /opt/DeepAgent/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

复制环境变量并编辑：

```bash
cp .env.example .env
nano .env   # 或 vim
```

至少确认：

- **`DATABASE_URL`**：单机演示可继续用 SQLite（默认 `sqlite:///./petct_research.db`），数据库文件会在 **`/opt/DeepAgent/backend`** 下生成。
- **`CORS_ORIGINS`**：若你打算用 **https://你的域名** 访问，请写成（逗号分隔、无空格或按需）：
  - `CORS_ORIGINS=https://你的域名`
  - 若暂时用 `http://公网IP` 测试，可写：`CORS_ORIGINS=http://你的公网IP`（**不建议长期使用明文 HTTP 传病历**）。

手动试跑：

```bash
cd /opt/DeepAgent/backend
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

另开一个 SSH 窗口执行 `curl -sS http://127.0.0.1:8000/health` 应返回 `{"status":"ok"}`。确认无误后 Ctrl+C 停掉，改用 **systemd** 常驻（见仓库内 `deploy/lingxi-backend.service.example`，把路径改成你的 `/opt/DeepAgent/backend` 后复制到 `/etc/systemd/system/`）。

## 四、前端（构建静态文件）

```bash
cd /opt/DeepAgent/frontend
npm ci
npm run build
sudo mkdir -p /var/www/lingxi
sudo rm -rf /var/www/lingxi/dist
sudo cp -r dist /var/www/lingxi/
```

生产环境浏览器与网站 **同源**（同一域名 + Nginx 反代 `/api`），前端里的请求走相对路径 **`/api`**，**不需要**再跑 `npm run dev`。

## 五、Nginx 反代

将仓库中的 **`deploy/nginx.example.conf`** 复制到服务器，例如：

```bash
sudo cp /opt/DeepAgent/deploy/nginx.example.conf /etc/nginx/sites-available/lingxi
sudo nano /etc/nginx/sites-available/lingxi   # 修改 server_name、root 如有需要
sudo ln -sf /etc/nginx/sites-available/lingxi /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

浏览器访问 **`http://公网IP`**（或你的域名）应能打开工作台；若页面能开但接口失败，检查 **安全组是否放行 80**、**后端 systemd 是否在跑**、**Nginx 配置里 proxy_pass 端口是否为 8000**。

## 六、HTTPS（强烈建议对真实病历使用）

在腾讯云 **SSL 证书**（或「证书」控制台）申请免费证书，按文档把证书配置进 Nginx（监听 443、`ssl_certificate` / `ssl_certificate_key`），并把 **`CORS_ORIGINS`** 改成 `https://你的域名`。

## 七、数据存在哪里、安全提醒

- 默认 SQLite：**文件在运行后端的目录下** `petct_research.db`（相对 `WorkingDirectory`）。
- 病历属于敏感信息：**务必**做好服务器访问控制、强密码、HTTPS、仅内网或 VPN 访问等；本仓库为**科研演示原型**，不承担医疗软件合规责任。

## 常见问题

| 现象 | 处理 |
|------|------|
| 502 Bad Gateway | 后端未启动或端口不是 8000；`journalctl -u lingxi-backend -f` 看日志 |
| 页面空白、资源 404 | `root` 是否指向 `/var/www/lingxi/dist`，且 `index.html` 存在 |
| 接口跨域错误 | 检查 `.env` 里 **`CORS_ORIGINS`** 是否包含你浏览器地址栏的「协议+主机+端口」 |

更省心的托管方式（云托管 / 容器）需要你把需求写清楚（是否必须腾讯云内、预算、是否接受 Docker），可以再单独拆一版文档。
