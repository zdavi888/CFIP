@echo off
chcp 65001 > nul
title Cloudflare WARP 一键本地多路 SOCKS5 代理转换器
cd /d "%~dp0"

echo ======================================================
echo 正在对您的系统运行环境进行安全检查...
echo ======================================================

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ [检测失败] 未找到 Node.js 运行环境！
    echo.
    echo 💡 极其简单的解决方法（只需一步）：
    echo 1. 请前往官方网站 https://nodejs.org/ 下载最新的 LTS 长期稳定版（并点击下一步一键完整傻瓜安装完毕）
    echo 2. 安装完成后，重新双击此「start.bat」运行即可！
    echo 3. 如果不知道怎么选，直接无脑点击下载：
    echo    https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi
    echo.
    pause
    exit
)

echo [✔] 环境检查：Node.js 安装完好，正在启动多路并发优选代理服务器...
echo.

node start.js

pause
