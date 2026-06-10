#!/bin/bash
# 自动探测系统运行环境并启动 Cloudflare WARP 多路 本地 SOCKS5 代理转换器

# 解决终端可能的中文乱码问题
export LANG=zh_CN.UTF-8

# 定位当前脚本所在文件夹
cd "$(dirname "$0")"

echo "======================================================"
echo " 正在对您的 Linux/macOS/VPS 系统运行环境进行安全检查..."
echo "======================================================"

# 检查 Node.js 环境
if ! command -v node &> /dev/null; then
    echo "❌ [检测失败] 您的系统中尚未安装 Node.js 的执行环境！"
    echo ""
    echo "💡 极其简单的快速修复方案 (复制运行以下极简命令):"
    echo "  * macOS (Mac 电脑):"
    echo "    brew install node"
    echo ""
    echo "  * Ubuntu / Debian (VPS服务器):"
    echo "    sudo apt-get update && sudo apt-get install -y nodejs npm"
    echo ""
    echo "  * CentOS / RedHat / AliyunOS (VPS服务器):"
    echo "    sudo dnf install -y nodejs"
    echo ""
    exit 1
fi

echo "[✔] 环境检查：Node.js 安装完好，正在为您在本地/云端部署多路 SOCKS5 代理池..."
echo ""

# 启动 node 并转发所有参数
node start.js "$@"
