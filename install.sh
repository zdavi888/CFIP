#!/usr/bin/env bash

# ==============================================================================
#  Cloudflare WARP Anycast Socks5 远程控制台面板 - 一键自动部署脚本
#  系统要求: Ubuntu / Debian / CentOS / Debian / AlmaLinux / RockyLinux (x86_64/arm64)
# ==============================================================================

# 颜色控制字符
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}======================================================================${NC}"
echo -e "${GREEN}    🚀 Cloudflare WARP Anycast Socks5 远程管理面板 -- 自动化部署中... ${NC}"
echo -e "${BLUE}======================================================================${NC}"

# 1. 权限检验
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ 请使用 root 权限运行此脚本！(例如: sudo bash install.sh)${NC}"
  exit 1
fi

# 获取当前脚本所在物理路径
APP_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$APP_DIR" || exit 1

echo -e "📂 项目运行根路径: ${YELLOW}$APP_DIR${NC}"

# 2. 识别系统包管理器并安装基础依赖
echo -e "🔍 正在检索系统兼容性环境..."
if [ -f /etc/debian_version ]; then
    PM="apt"
    echo -e "👉 检测为 Debian/Ubuntu 系列系统，激活 apt-get 包管理器..."
    apt-get update -y
    apt-get install -y curl unzip tar procps build-essential
elif [ -f /etc/redhat-release ]; then
    PM="yum"
    echo -e "👉 检测为 RedHat/CentOS 系列系统，激活 yum 包管理器..."
    yum install -y curl unzip tar procps make gcc gcc-c++
else
    PM="apt"
    echo -e "${YELLOW}⚠️ 未能获取明确的 OS 标识，默认尝试使用 apt-get 安装组件...${NC}"
    apt-get update -y || true
    apt-get install -y curl unzip tar procps || true
fi

# 3. 检测并升级高质量 Node.js 运行支持
if ! command -v node &> /dev/null; then
    echo -e "⚙️ 检测到本地未配置 Node.js 环境，启动零摩擦自动安装流程 (使用 NodeSource LTS)..."
    if [ "$PM" = "apt" ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    else
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
        yum install -y nodejs
    fi
else
    NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    echo -e "✅ 检测到 Node.js 已经安装，版本号: ${GREEN}v$NODE_VER${NC}"
    if [ "$NODE_VER" -lt 18 ]; then
        echo -e "${YELLOW}⚠️ 当前 Node.js 版本低于 18，将尝试为您升阶核心环境...${NC}"
        if [ "$PM" = "apt" ]; then
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
            apt-get install -y nodejs
        else
            curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
            yum install -y nodejs
        fi
    fi
fi

# 再次验证 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js 核心拉取遇到了阻断，请手动安装 Node.js v18+ 再执行此脚本。${NC}"
    exit 1
fi

echo -e "📦 Node.js 版本: ${GREEN}$(node -v)${NC}"
echo -e "📦 NPM 版本: ${GREEN}$(npm -v)${NC}"

# 4. 完美进行包拉取与编译 (Build-Phase)
echo -e "⚙️ 正在执行 npm 依赖和开发编译组件集安装..."
# 显式解除可能存在的生产环境只读依赖限制，确保 typescript 等核心编译包被正确拉取
NODE_ENV=development npm install --include=dev --legacy-peer-deps
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ npm install 依赖安装失败，请检查网络或包树冲突！${NC}"
    exit 1
fi

echo -e "⚙️ 正在编译 Next.js 生产环境资源 (生成静态页面与强力服务端路由)..."
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ npm run build 编译失败！请检查上方报错日志并解决后再试。${NC}"
    exit 1
fi

# 5. 设置 native systemd 服务器后台挂载服务，确保进程自启与容错
SERVICE_FILE="/etc/systemd/system/warp-anycast.service"

# 获取当前系统 node 的绝对路径，并定位二进制真实入口，保障 Systemd 高可靠唤醒并避免 Wrapper 脚本执行阻断
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    NODE_PATH="/usr/bin/node"
fi

echo -e "💾 正在配置系统的 Systemd 服务自控模板 [warp-anycast.service]..."
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Cloudflare WARP Anycast Socks5 Remotely Web Console
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=$NODE_PATH $APP_DIR/node_modules/next/dist/bin/next start -p 59418
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# 6. 重轮后台服务，并强力激活开机自启
echo -e "⚙️ 载入系统后台控制卡盘..."
systemctl daemon-reload
systemctl enable warp-anycast
systemctl restart warp-anycast

# 检查服务最终状态
if systemctl is-active --quiet warp-anycast; then
    echo -e "${GREEN}======================================================================${NC}"
    echo -e "🎉 🎉 🎉  【部署完美成功！】 🎉 🎉 🎉"
    echo -e "👉 网页控制台进程已经在后台挂载服务运行中！"
    echo -e "👉 服务端口: ${YELLOW}59418${NC}"
    echo -e "👉 网页控制台访问地址: ${GREEN}http://[您的VPS公网IP]:59418${NC}"
    echo -e "👉 常用系统维护命令: "
    echo -e "   - 启动服务: ${BLUE}systemctl start warp-anycast${NC}"
    echo -e "   - 停止服务: ${BLUE}systemctl stop warp-anycast${NC}"
    echo -e "   - 查看服务状态: ${BLUE}systemctl status warp-anycast${NC}"
    echo -e "   - 查看后台日志: ${BLUE}journalctl -u warp-anycast -f --no-tail${NC}"
    echo -e "${GREEN}======================================================================${NC}"
else
    echo -e "${YELLOW}⚠️ 服务启动后未能即时返回 Active 状态，多见于端口受到安全策略或防火墙拦截。${NC}"
    echo -e "💡 提示：我们正在为您尝试前台直连重试启动（降级启动方式）..."
    # 尝试降级启动
    nohup npx next start -p 59418 > "$APP_DIR/webui-runner.log" 2>&1 &
    PID=$!
    sleep 3
    if ps -p $PID > /dev/null; then
        echo -e "${GREEN}🎉 自动降级至后台后台 nohup 线程启动就绪！${NC}"
        echo -e "👉 控制面板已成功暴露在: ${GREEN}http://[您的VPS公网IP]:59418${NC}"
    else
        echo -e "${RED}❌ 主机配置可能存在端口占用，请使用 \`netstat -nltp | grep 59418\` 查看冲突端口占用情况 ${NC}"
    fi
fi
