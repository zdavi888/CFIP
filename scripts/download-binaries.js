const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const XRAY_VERSION = '1.8.24';
const ZIP_NAME = `Xray-windows-64.zip`;
const DOWNLOAD_URL = `https://mirror.ghproxy.com/https://github.com/XTLS/Xray-core/releases/download/v${XRAY_VERSION}/${ZIP_NAME}`;
const BACKUP_URL = `https://github.com/XTLS/Xray-core/releases/download/v${XRAY_VERSION}/${ZIP_NAME}`;

const targetDir = path.join(__dirname, '../获取CFIP');
const zipPath = path.join(targetDir, ZIP_NAME);
const finalExePath = path.join(targetDir, 'xray.exe');
const oldSingBoxPath = path.join(targetDir, 'sing-box.exe');

console.log('========================================================');
console.log('🚀 [Build-Time Packager] 正在为您预下载并打包内置 Windows Xray-core 核心...');
console.log('========================================================');

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// 清理旧的 sing-box 核心
if (fs.existsSync(oldSingBoxPath)) {
  try {
    fs.unlinkSync(oldSingBoxPath);
    console.log('[✔] 成功清理旧包中的 sing-box.exe');
  } catch (e) {}
}

// 辅助方法：流式下载文件
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`下载错误，状态码: ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function run() {
  if (fs.existsSync(finalExePath) && fs.statSync(finalExePath).size > 1000000) {
    console.log('[✔] 检查：Windows 64位核心 xray.exe 已存在，跳过下载。');
    return;
  }

  console.log(`📡 正在从节点加速源拉取 Windows Xray-core 核心包 v${XRAY_VERSION}...`);
  console.log(`👉 ${DOWNLOAD_URL}`);

  try {
    try {
      await download(DOWNLOAD_URL, zipPath);
    } catch (e) {
      console.log('⚠️ 加速镜像源获取超时，正在尝试自动切换到官方备用物理源...');
      await download(BACKUP_URL, zipPath);
    }

    console.log('[✔] Xray 压缩包下载成功。正在进行云端原生高速解包...');
    
    // Linux 环境下直接使用原生 unzip 命令
    try {
      execSync(`unzip -o "${zipPath}" -d "${targetDir}"`, { stdio: 'inherit' });
    } catch (err) {
      console.log('⚠️ 原生 unzip 报错，尝试提取子项...');
      execSync(`unzip -j -o "${zipPath}" "*/xray.exe" -d "${targetDir}"`, { stdio: 'inherit' });
    }

    // 搜索解压出的 xray.exe
    function searchExe(dir) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const full = path.join(dir, file);
        if (fs.statSync(full).isDirectory()) {
          const found = searchExe(full);
          if (found) return found;
        } else if (file.toLowerCase() === 'xray.exe') {
          return full;
        }
      }
      return null;
    }

    const foundExe = searchExe(targetDir);
    if (foundExe) {
      console.log(`[✔] 寻获核心可执行文件: ${foundExe}`);
      if (path.resolve(foundExe) !== path.resolve(finalExePath)) {
        fs.copyFileSync(foundExe, finalExePath);
      }
      console.log('[✔] 面向 Windows 的 Xray-core 核心一键就绪！');
    } else {
      throw new Error('未在解包目录中寻获 xray.exe！');
    }

    // 清理一切临时压缩包
    try {
      fs.unlinkSync(zipPath);
    } catch (_) {}

    console.log('========================================================');
    console.log('🎉 Xray-core 预打包成功！本地 Windows 用户下载 ZIP 压缩包后直接双击即可流畅运行！');
    console.log('========================================================\n');

  } catch (error) {
    console.error('❌ Cloud 打包失败:', error.message);
    console.log('建议离线保持运行，我们将采用本地自解压兜底保护。');
  }
}

run();
