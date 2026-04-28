#!/usr/bin/env bash
#
# 在 Linux 客户机上一键部署 CAPE Guest Agent。
#
# 与仓库根的 extra/linux_agent.sh 相比的差异：
#   - 默认用 systemd unit 自启（更可控、有日志、自动 restart）；
#   - 支持 --use-cron 切回 crontab 方案；
#   - 支持 --no-disable-firewall / --no-disable-ntp 跳过减噪步骤；
#   - 支持本地 agent.py 而非强制 wget 上游 master。
#
# 用法：
#   sudo ./install_linux.sh [选项]
#
# 选项：
#   --agent-src <path>       本地 agent.py 路径；不传则从 kevoreilly/CAPEv2
#                            master 拉取
#   --install-dir <dir>      安装目录，默认 /root/.cape
#   --use-systemd            使用 systemd unit 自启（默认）
#   --use-cron               使用 crontab @reboot 自启
#   --no-disable-firewall    保留 ufw（默认会 ufw disable）
#   --no-disable-ntp         保留 NTP（默认会 timedatectl set-ntp off）
#   --no-disable-snapd       保留 snap（默认会 mask snapd.service）
#   -h, --help               显示帮助

set -euo pipefail

# ------------------------------ 默认参数 -----------------------------------

AGENT_SRC=""
INSTALL_DIR="/root/.cape"
AUTOSTART="systemd"   # systemd | cron
DISABLE_FIREWALL=1
DISABLE_NTP=1
DISABLE_SNAPD=1
UPSTREAM_URL="https://raw.githubusercontent.com/kevoreilly/CAPEv2/master/agent/agent.py"

# ------------------------------ 解析参数 -----------------------------------

usage() {
    sed -n '3,/^set -e/p' "$0" | sed -e 's/^# \{0,1\}//' | head -n -1
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --agent-src)            AGENT_SRC="$2"; shift 2 ;;
        --install-dir)          INSTALL_DIR="$2"; shift 2 ;;
        --use-systemd)          AUTOSTART="systemd"; shift ;;
        --use-cron)             AUTOSTART="cron"; shift ;;
        --no-disable-firewall)  DISABLE_FIREWALL=0; shift ;;
        --no-disable-ntp)       DISABLE_NTP=0; shift ;;
        --no-disable-snapd)     DISABLE_SNAPD=0; shift ;;
        -h|--help)              usage ;;
        *) echo "未知参数: $1" >&2; exit 64 ;;
    esac
done

# ------------------------------ 前置检查 -----------------------------------

if [[ $EUID -ne 0 ]]; then
    echo "本脚本必须 root 运行（或前面加 sudo）。" >&2
    exit 77
fi

if ! command -v python3 >/dev/null; then
    echo "未发现 python3，先 apt install python3 python3-pip。" >&2
    exit 1
fi

# ------------------------------ 1) 装依赖 ----------------------------------

if command -v apt >/dev/null; then
    apt update
    apt install -y build-essential curl net-tools python3-pip
elif command -v dnf >/dev/null; then
    dnf install -y python3 python3-pip net-tools curl
elif command -v yum >/dev/null; then
    yum install -y python3 python3-pip net-tools curl
fi

pip3 install --quiet pyinotify || pip3 install --quiet pyinotify --break-system-packages || true

# ------------------------------ 2) 拷贝 agent ------------------------------

mkdir -p "$INSTALL_DIR"
DEST="$INSTALL_DIR/agent.py"

if [[ -n "$AGENT_SRC" ]]; then
    echo "[..] 从本地复制：$AGENT_SRC -> $DEST"
    cp "$AGENT_SRC" "$DEST"
else
    echo "[..] 从上游拉取：$UPSTREAM_URL -> $DEST"
    curl -fsSL "$UPSTREAM_URL" -o "$DEST"
fi

# 注释掉 36-37 行的 32-bit Python 自检（Linux 用 64 位 Python）
# 仅当那两行还没被注释时才修改，幂等
if grep -nE '^if sys.version_info.*3, 6.*:' "$DEST" | head -1 | grep -q .; then
    sed -i '36,37 s/^\([^#]\)/# \1/' "$DEST"
    echo "[ok] 已注释 36-37 行的 32-bit Python 自检"
fi

chmod 644 "$DEST"

# ------------------------------ 3) 自启 ------------------------------------

case "$AUTOSTART" in
    systemd)
        UNIT=/etc/systemd/system/cape-guest-agent.service
        cat > "$UNIT" <<EOF
[Unit]
Description=CAPE guest agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 $DEST
Restart=on-failure
RestartSec=3
User=root
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
        systemctl daemon-reload
        systemctl enable --now cape-guest-agent.service
        echo "[ok] 已注册并启动 systemd unit: cape-guest-agent.service"
        ;;
    cron)
        # 幂等：已存在同 entry 就不再追加
        if ! crontab -l 2>/dev/null | grep -qF "@reboot python3 $DEST"; then
            ( crontab -l 2>/dev/null; echo "@reboot python3 $DEST" ) | crontab -
            echo "[ok] 已添加 crontab @reboot 条目"
        else
            echo "[..] crontab 已包含相同条目，跳过"
        fi
        # 当场拉起一次，避免要重启才能验证
        nohup python3 "$DEST" >/dev/null 2>&1 &
        echo "[ok] 已后台启动一次 agent（重启后由 cron 自动起）"
        ;;
esac

# ------------------------------ 4) 减噪 ------------------------------------

if [[ $DISABLE_FIREWALL -eq 1 ]] && command -v ufw >/dev/null; then
    ufw disable || true
    echo "[ok] 已关闭 ufw"
fi

if [[ $DISABLE_NTP -eq 1 ]] && command -v timedatectl >/dev/null; then
    timedatectl set-ntp off || true
    echo "[ok] 已关闭 NTP"
fi

if [[ $DISABLE_SNAPD -eq 1 ]] && systemctl list-unit-files snapd.service >/dev/null 2>&1; then
    systemctl stop snapd.service 2>/dev/null || true
    systemctl mask snapd.service 2>/dev/null || true
    echo "[ok] 已 mask snapd.service"
fi

cat > /etc/apt/apt.conf.d/20auto-upgrades <<EOF 2>/dev/null || true
APT::Periodic::Update-Package-Lists "0";
APT::Periodic::Download-Upgradeable-Packages "0";
APT::Periodic::AutocleanInterval "0";
APT::Periodic::Unattended-Upgrade "0";
EOF

# ------------------------------ 5) 验证 ------------------------------------

echo ""
echo "[..] 探活 http://127.0.0.1:8000/"
ok=0
for i in {1..10}; do
    if out=$(curl -fsS -m 2 http://127.0.0.1:8000/); then
        echo "[ok] agent 存活: $out"
        ok=1
        break
    fi
    sleep 1
done
if [[ $ok -ne 1 ]]; then
    echo "[!!] 10 秒内 agent 未响应。检查日志：" >&2
    if [[ "$AUTOSTART" == "systemd" ]]; then
        echo "      journalctl -u cape-guest-agent.service -n 50" >&2
    else
        echo "      ps -ef | grep agent.py" >&2
    fi
    exit 1
fi

cat <<EOF

下一步：
  1. 在 host 上 curl http://<VM_IP>:8000/ 验证 host↔guest 通路
  2. 关机前确保 agent 仍在跑，然后拍快照
  3. 把 snapshot 名写到 host 的 conf/<machinery>.conf 对应 VM 的 snapshot= 字段
EOF
