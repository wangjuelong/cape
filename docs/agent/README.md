# CAPE Guest Agent 部署指南

本目录给出 CAPE Guest VM 内 agent 的完整部署方案。Agent 是运行在分析 VM
**内部**的 HTTP 服务器，由 host 主进程（`lib/cuckoo/core/guest.py:GuestManager`）
调用，负责：接收样本与 analyzer、启动样本进程、回传执行状态。

文件清单：

- `README.md`：本指南。
- `install_windows.ps1`：Windows 客户机一键部署脚本（PowerShell，需以管理员
  身份运行）。
- `install_linux.sh`：Linux 客户机部署脚本（含 systemd unit 方案，可替代仓
  库根 `extra/linux_agent.sh` 的 crontab 方案）。

## 适用范围

- 目标客户机：Windows 7/8/10/11、Ubuntu / Debian / CentOS、macOS（实验）。
- 目标 host：已经按 README 走通 `cape2.sh base` 流程的标准单机部署。
- 假设你已经创建好 VM、配好 host-only 网段、能在 VM 内正常上网下载依赖。

## 1. 角色与网络模型

```
+-- HOST -------------------------+         +-- GUEST VM -----------------+
|                                 |         |                             |
|  cape.service                   |  HTTP   |  agent.py / agent.pyw       |
|    └─ lib/cuckoo/core/guest.py  | ──────▶ |     http.server, port 8000  |
|       (HTTP 客户端)              |         |     需 Administrator/root   |
+---------------------------------+         +-----------------------------+
```

- **Agent 实现**：仓库根 `agent/agent.py`（Python 3，817 行，零外部依赖，
  `AGENT_VERSION = 0.20`）。同目录下的 `agent/go/` 是 Go 端口，README 标注
  *Do not use it yet*，本指南不涉及。
- **网络**：监听 `0.0.0.0:8000`（命令行可改 `python3 agent.py [host] [port]`）。
- **鉴权**：**无**。安全模型完全依赖以下两点——
  1. VM 仅在 host-only 网段，外部不可达；
  2. Agent 内置 **IP pinning**（`GET /pinning`）：第一次请求记下源 IP，之
     后所有请求都比对源 IP 不一致即拒绝，防止 VM-A 横向触达 VM-B 的 agent。
- **必须以管理员/root 运行**。Agent 自身的代码不会强制阻塞，但后续
  capemon 注入需要管理员权限，否则任务会卡在 `running` 直到超时。

## 2. 关键约束（先看，后续少踩坑）

| 约束 | Windows | Linux |
|---|---|---|
| Python 架构 | **必须 32 位 Python 3**（`agent.py:43` 检测 `sys.maxsize`，64 位直接 `sys.exit`） | 任意 64 位 Python ≥ 3.6 |
| 文件名 | **`agent.pyw`**（无窗口启动，`.py` 会弹黑窗干扰 `analyzer/windows/modules/auxiliary/human.py`） | `agent.py` |
| 自启方式 | **Task Scheduler，勾 Run with highest privileges** —— 不要用 startup 文件夹（Win10+ 不再以管理员身份启动） | crontab `@reboot` 或 systemd unit |
| 任务名 | 不得含 `cape` / `cuckoo` / `agent` / `sandbox` 等字串（反沙箱检测） | 同上 |
| 防火墙 | 允许 8000 端口入站；建议关闭 Defender 实时扫描；关闭 Windows Update 自动重启 | 关闭 ufw 或放行 8000；关闭 NTP / unattended-upgrades 减噪 |
| 快照时机 | **必须在 agent 已运行的状态下拍快照**——CAPE 每次从快照恢复，恢复出来 agent 必须在线 | 同 |

## 3. Windows 客户机部署

### 3.1 准备 Python

下载 **32 位** [Python 3 安装器](https://www.python.org/downloads/windows/)，
注意是 *Windows installer (32-bit)* 而不是 64-bit：

- 安装时勾选 **Add Python to PATH**。
- 完成后在 cmd 里跑 `python -c "import sys; print(sys.maxsize)"`，应输出
  `2147483647`。如果是 `9223372036854775807` 表示装错成 64 位了，必须卸载
  重装 32 位版本。

### 3.2 拷贝 agent

把仓库的 `agent/agent.py` 拷进 VM（共享文件夹 / HTTP 下载 / 挂 ISO 都可以），
**重命名为 `agent.pyw`**。建议放到 `C:\Tools\agent.pyw` 或类似中性路径——
不要含 `cape` / `cuckoo` 等关键字。

### 3.3 配置 Task Scheduler 自启（Windows 10+）

参考 `docs/book/src/installation/guest/agent.rst` 的图文步骤。命令行办法：

```powershell
# 以管理员身份运行 PowerShell
$action  = New-ScheduledTaskAction -Execute "C:\Windows\pyw.exe" -Argument "C:\Tools\agent.pyw"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$princ   = New-ScheduledTaskPrincipal -UserId "$env:UserName" -RunLevel Highest
$task    = New-ScheduledTask -Action $action -Trigger $trigger -Principal $princ
Register-ScheduledTask -TaskName "pizza" -InputObject $task    # 任务名随便起，避开沙箱关键字
```

或直接用本目录提供的 [`install_windows.ps1`](./install_windows.ps1)：

```powershell
# 以管理员身份运行
PowerShell.exe -ExecutionPolicy Bypass -File install_windows.ps1 `
    -AgentSrc "\\HOST\share\agent.py" `
    -InstallDir "C:\Tools" `
    -TaskName "pizza"
```

脚本会做：

1. 检查 Python 是否 32 位；
2. 拷贝并改名为 `agent.pyw`；
3. 创建 highest-privileges 的 logon-trigger Task；
4. 启动一次 task；
5. `Invoke-WebRequest` 探活 `http://127.0.0.1:8000/`。

### 3.4 关掉噪声源

仓库根 `installer/win10_disabler.ps1` 是社区维护的 Windows 客户机减噪脚本，
关 Windows Update / Defender 实时扫描 / Cortana / 自动维护等。建议跑一遍。
之外手工确认：

- **防火墙**：`netsh advfirewall set allprofiles state off` 或单独放行 8000
  入站。
- **UAC 弹窗**：把 UAC 拉到最低，避免 capemon 注入时被弹窗挡住。
- **桌面截图可见性**：取消桌面背景动画、屏保、自动锁屏，否则 auxiliary
  抓的 shots 全是黑屏。

### 3.5 验证

VM 内浏览器打开 `http://127.0.0.1:8000/` 或 cmd 里：

```cmd
curl http://127.0.0.1:8000/
```

应得：

```json
{"version": "0.20", "features": ["execpy","execute","pinning","logs",
"largefile","unicodepath","mutex","browser_extension"]}
```

从 host 上验证（VM 已起、网段已通）：

```bash
curl http://<VM_IP>:8000/
```

返回相同 JSON 即 host↔guest 通路 OK。

### 3.6 拍快照

- **virt-manager / KVM**：VM 关机前 `virsh snapshot-create-as <vm> <snap_name> --disk-only`，
  或用 GUI "Take snapshot"。
- **VirtualBox**：`VBoxManage snapshot <vm> take <snap_name>`。
- **VMware**：GUI "Take Snapshot"。

把 snapshot 名记下来，写到 host 的 `conf/<machinery>.conf`（如 `kvm.conf`）
对应 VM 的 `snapshot=` 字段。

## 4. Linux 客户机部署

Linux agent 部署比 Windows 简单，但 capemon 监控覆盖度不及 Windows，主要适
合静态/简单动态分析。

### 4.1 装 Python 与网络工具

```bash
sudo apt update
sudo apt install -y python3 python3-pip net-tools curl
sudo pip3 install pyinotify     # analyzer/linux 依赖
```

### 4.2 拷贝 agent + 注释 64 位检查

```bash
sudo mkdir -p /root/.cape
sudo cp /path/to/agent/agent.py /root/.cape/agent.py
# 注释掉 36-37 行的 32-bit Python 自检（Linux 用 64 位 Python）
sudo sed -i '36,37 s/^/# /' /root/.cape/agent.py
```

### 4.3 自启：systemd（推荐）或 crontab

#### 方案 A：systemd unit（推荐，比 crontab 更可控）

```bash
sudo tee /etc/systemd/system/cape-guest-agent.service >/dev/null <<'EOF'
[Unit]
Description=CAPE guest agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 /root/.cape/agent.py
Restart=on-failure
RestartSec=3
User=root
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now cape-guest-agent.service
systemctl status cape-guest-agent.service
```

#### 方案 B：crontab（仓库根 `extra/linux_agent.sh` 用的方式）

```bash
sudo crontab -l | { cat; echo "@reboot python3 /root/.cape/agent.py"; } | sudo crontab -
```

或直接跑本目录的 [`install_linux.sh`](./install_linux.sh)：

```bash
sudo ./install_linux.sh --agent-src /path/to/agent.py --use-systemd
```

参数：

- `--agent-src <path>`：本地 `agent.py` 来源路径（默认从 `kevoreilly/CAPEv2`
  GitHub master 拉）
- `--install-dir <dir>`：安装目录（默认 `/root/.cape`）
- `--use-systemd` / `--use-cron`：自启方式（默认 systemd）
- `--no-disable-firewall`：保留 ufw（默认会 `ufw disable`）
- `--no-disable-ntp`：保留 NTP（默认会 `timedatectl set-ntp off`）

### 4.4 减噪（可选但建议）

```bash
sudo ufw disable                                    # 关防火墙
sudo timedatectl set-ntp off                        # 关 NTP
sudo systemctl mask snapd.service                   # 关 snap
sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null <<EOF
APT::Periodic::Update-Package-Lists "0";
APT::Periodic::Download-Upgradeable-Packages "0";
APT::Periodic::AutocleanInterval "0";
APT::Periodic::Unattended-Upgrade "0";
EOF
```

### 4.5 验证

```bash
curl http://127.0.0.1:8000/
# {"version": "0.20", "features": [...]}
journalctl -u cape-guest-agent.service -n 50       # 仅 systemd 方案
```

### 4.6 拍快照

同 Windows 章节 3.6。

## 5. 部署后验证（host 侧端到端）

```bash
# 在 host 上：从 host 直接请求 VM 内 agent
curl -m 5 http://<VM_IP>:8000/

# 提交一个简单任务，看 host 是否能驱动起 agent
sudo -u cape /opt/CAPEv2/poetry run python /opt/CAPEv2/utils/submit.py \
    --machine <vm_label> --timeout 30 /tmp/calc.exe

# 跟踪日志
sudo journalctl -u cape.service -f
# 看 lib/cuckoo/core/guest.py 是否打印 "agent reachable" 之类信息
```

如果你已经按 [`docs/workflow/`](../workflow/) 配好了 HTTP API，也可以直接：

```bash
curl -F "file=@./calc.exe" -F "machine=<vm_label>" -F "timeout=30" \
     -H "Authorization: Token <TOKEN>" \
     "http://<HOST>:8000/apiv2/tasks/create/file/"
```

然后轮询 `/apiv2/tasks/status/<id>/`。第一个能跑到 `reported` 的任务即说明
agent 部署生效。

## 6. Agent 升级

CAPE host 升级（`git pull`）后偶尔会带 `agent/agent.py` 的更新，需要把新版
重新放进 VM 并重启 agent，再重拍一次快照。流程：

1. host 上：`git diff <old> -- agent/agent.py` 看变更，确认是否影响你的部署。
2. VM 启动到登录态，**不要**用快照恢复——要用一份"干净的"开机状态，避免
   旧 agent 的 IP pinning 残留。
3. 关掉旧 agent（Task Scheduler 停 task / `systemctl stop cape-guest-agent`）。
4. 覆盖 `agent.pyw` 或 `/root/.cape/agent.py`。
5. 启动新 agent，`curl :8000/` 确认 `version` 字段已是新版。
6. 关机 → **删掉旧快照** → 重拍快照。

> Go 版（`agent/go/`）README 提到了 `/update` endpoint 支持热升级，但 Python
> 版没有这个能力，必须重拍快照。

## 7. 端点速查

Host 不会直接调下面所有端点，只有部分 API 在分析过程中被使用。完整列表
（来自 `agent/agent.py` 中 `@app.route` 装饰器）：

### 探活与版本协商

| 路由 | 方法 | 用途 |
|---|---|---|
| `/` | GET | 返回 `{"version", "features"}`，host 用它做轮询健康检查与功能协商 |
| `/system` | GET | 返回 `Windows`/`Linux`/`Darwin` |
| `/environ` | GET | 返回 `os.environ`（host 解析 `%TEMP%`/`%SYSTEMDRIVE%`） |
| `/path` | GET | 路径信息 |
| `/pinning` | GET | **关键安全特性**：固化首次请求的源 IP；后续请求 IP 不一致直接 403 |

### 状态机

| 路由 | 方法 | 用途 |
|---|---|---|
| `/status` | GET | 当前状态 `init`/`running`/`complete`/`failed`/`exception` |
| `/status` | POST | VM 内 analyzer.py 主动写状态 |

### 文件操作

| 路由 | 方法 | 用途 |
|---|---|---|
| `/store` | POST | multipart 上传文件，host 用它推 analyzer.zip / 样本 / analysis.conf |
| `/retrieve` | POST | body `filepath=...`，回拉文件，可 `streaming=1` |
| `/extract` | POST | 解压 zip（带 ZipSlip 防护） |
| `/remove` | POST | 删文件或目录 |
| `/mkdir` | POST | 创建目录 |
| `/mktemp` | GET/POST | 创建临时文件 |
| `/mkdtemp` | GET/POST | 创建临时目录 |

### 进程执行

| 路由 | 方法 | 用途 |
|---|---|---|
| `/execute` | POST | 启动外部进程，可 async / shell / base64 编码命令行 |
| `/execpy` | POST | 启动 Python 脚本（host 用它启动 analyzer.py） |

### 日志

| 路由 | 方法 | 用途 |
|---|---|---|
| `/logs` | GET | agent 自身 stdout/stderr 缓冲区 |

### 互斥量（Windows 限定）

| 路由 | 方法 | 用途 |
|---|---|---|
| `/mutex` | POST | body `mutex_name=...`，agent 抢命名 mutex |
| `/mutex` | DELETE | 释放 mutex |

### 浏览器扩展（Windows 限定）

| 路由 | 方法 | 用途 |
|---|---|---|
| `/browser_extension` | POST | 推 Chrome 扩展到 VM 用户配置目录 |

### 生命周期

| 路由 | 方法 | 用途 |
|---|---|---|
| `/kill` | GET | 关停 agent（仅 Werkzeug dev 模式有效，正式部署用不到） |

## 8. 故障排查

| 症状 | 可能原因 | 排查 |
|---|---|---|
| host 日志反复 `wait_available timeout` | agent 没起 / 端口没监听 / 防火墙拦 | VM 内 `netstat -ano \| findstr :8000` 或 `ss -ntlp \| grep 8000` |
| agent 起来了但 host 仍连不上 | host-only 网段不通 / 网卡未插 | host 上 `ping <VM_IP>` |
| `curl :8000/` 返回 403 | 触发了 pinning（之前别的 IP 调过 `/pinning`） | 重启 agent 清状态 |
| 任务卡 `running` 直到 timeout | agent 不是管理员 → capemon 注入失败 | Task Scheduler 检查 *Run with highest privileges* |
| 截图全黑 | 没用户登录 / 屏保锁屏 | 自动登录 + 关屏保 + 关锁屏 |
| 黑窗一直在 | 用了 `agent.py` 而不是 `agent.pyw` | 改名 |
| Linux 上 `sys.exit("You should install python3 x86")` | 漏了第 36-37 行的注释 | `sed -i '36,37 s/^/# /' /root/.cape/agent.py` |
| 升级 agent 后版本号没变 | 旧 task 还在跑 / 缓存路径错 | Task Scheduler 停 task → 改文件 → 启 task；`curl :8000/` 看 `version` |

## 9. 相关资料

- 仓库根 `agent/agent.py`：唯一的 agent 源代码（817 行）。
- `agent/go/README.md`：Go 端口（暂不可用，仅供 future reference）。
- `extra/linux_agent.sh`：上游 Linux 安装脚本（crontab 方式）。
- `installer/win10_disabler.ps1`：Windows 客户机减噪脚本。
- `installer/choco.bat`：Windows 客户机批量装样本相关 runtime（VC redist /
  .NET / Office / Java / Adobe Reader 等）。
- `docs/book/src/installation/guest/agent.rst`：上游英文版 agent 安装文档（含
  Task Scheduler 截图）。
- `docs/book/src/installation/guest/linux.rst`：上游 Linux 客户机说明（含
  64 位 Python 注释步骤）。
- `lib/cuckoo/core/guest.py`：host 侧 GuestManager，调 agent 的"使用说明书"。
- `docs/workflow/`：仅用 HTTP API 跑端到端任务的指南，是 agent 部署完成后
  最快的验证方式。
