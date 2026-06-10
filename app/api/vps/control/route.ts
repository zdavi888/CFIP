import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, execSync } from 'child_process';
import https from 'https';

const XRAY_VERSION = '1.8.24';
const TARGET_DIR = path.join(process.cwd(), '获取CFIP');
const CFG_PATH = path.join(TARGET_DIR, 'config.json');
const PID_PATH = path.join(TARGET_DIR, 'vps-xray.pid');
const STATE_PATH = path.join(TARGET_DIR, 'vps-state.json');

// Ensure folder exists
if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
}

// Check if a process is active
function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

// Get clean running status
function getStatus() {
  let isRunning = false;
  let pid: number | null = null;
  let activeConfig: any = null;

  if (fs.existsSync(PID_PATH)) {
    try {
      const storedPid = parseInt(fs.readFileSync(PID_PATH, 'utf-8').trim());
      if (!isNaN(storedPid) && isPidRunning(storedPid)) {
        isRunning = true;
        pid = storedPid;
      } else {
        // cleanup stale pid file
        try { fs.unlinkSync(PID_PATH); } catch (_) {}
      }
    } catch (_) {}
  }

  if (fs.existsSync(STATE_PATH)) {
    try {
      activeConfig = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    } catch (_) {}
  }

  return { isRunning, pid, activeConfig };
}

// Stop current process
function stopXrayProcess(pid: number): boolean {
  try {
    console.log(`[DEBUG] Attempting to stop Xray process (PID: ${pid})...`);
    process.kill(pid, 'SIGINT'); // Safe kill
    
    // Wait slightly to verify it stopped
    for (let i = 0; i < 10; i++) {
      if (!isPidRunning(pid)) {
        console.log(`[DEBUG] Xray (PID: ${pid}) shut down successfully.`);
        try { fs.unlinkSync(PID_PATH); } catch (_) {}
        return true;
      }
      // wait 100ms
      execSync(`node -e "setTimeout(() => {}, 100)"`);
    }

    // Force kill if still alive
    console.log(`[DEBUG] Process didn't stop in time. Force killing...`);
    process.kill(pid, 'SIGKILL');
    try { fs.unlinkSync(PID_PATH); } catch (_) {}
    return true;
  } catch (err: any) {
    console.error(`[DEBUG] Error stopping Xray process:`, err.message);
    // Cleanup if it's dead anyway
    if (!isPidRunning(pid)) {
      try { fs.unlinkSync(PID_PATH); } catch (_) {}
      return true;
    }
    return false;
  }
}

// Helper: stream download
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadFile(res.headers.location!, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed, status code: ${res.statusCode}`));
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

// Helper: find binary recursively
function findBinaryRecursively(dir: string, fileName: string): string | null {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      let isDir = false;
      try {
        isDir = fs.lstatSync(fullPath).isDirectory();
      } catch (_) {}

      if (isDir) {
        if (file.toLowerCase().includes('xray')) {
          const found = findBinaryRecursively(fullPath, fileName);
          if (found) return found;
        }
      } else if (file.toLowerCase() === fileName.toLowerCase()) {
        return fullPath;
      }
    }
  } catch (_) {}
  return null;
}

// Ensure binary exists or download it on the fly
async function getOrDownloadXrayBinary(): Promise<string> {
  const platform = os.platform();
  const arch = os.arch();
  let binaryName = 'xray';
  let archiveName = '';

  if (platform === 'win32') {
    binaryName = 'xray.exe';
    archiveName = 'Xray-windows-64.zip';
  } else if (platform === 'darwin') {
    archiveName = arch === 'arm64' ? 'Xray-macos-arm64.zip' : 'Xray-macos-64.zip';
  } else if (platform === 'linux') {
    archiveName = arch === 'x64' ? 'Xray-linux-64.zip' : 'Xray-linux-32.zip';
  } else {
    throw new Error(`Unsupported OS platform: ${platform}`);
  }

  const binaryPath = path.join(TARGET_DIR, binaryName);
  const archivePath = path.join(TARGET_DIR, archiveName);

  if (fs.existsSync(binaryPath) && fs.statSync(binaryPath).size > 1000000) {
    return binaryPath;
  }

  // Download
  console.log(`[DEBUG] SOCKS5 core binary missing. Pulling compiler kit for ${platform}...`);
  const downloadUrl = `https://github.com/XTLS/Xray-core/releases/download/v${XRAY_VERSION}/${archiveName}`;
  const backupUrl = `https://mirror.ghproxy.com/https://github.com/XTLS/Xray-core/releases/download/v${XRAY_VERSION}/${archiveName}`;

  try {
    try {
      await downloadFile(downloadUrl, archivePath);
    } catch (_) {
      console.log(`[DEBUG] Fetching via proxy acceleration node backup...`);
      await downloadFile(backupUrl, archivePath);
    }

    // Extract
    if (platform === 'win32') {
      try {
        execSync(`tar -xf "${archivePath}" -C "${TARGET_DIR}"`, { stdio: 'ignore' });
      } catch (_) {
        execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${TARGET_DIR}' -Force"`, { stdio: 'ignore' });
      }
    } else {
      // Unix
      try {
        execSync(`unzip -o "${archivePath}" -d "${TARGET_DIR}"`, { stdio: 'ignore' });
      } catch (_) {
        execSync(`tar -xf "${archivePath}" -C "${TARGET_DIR}"`, { stdio: 'ignore' });
      }
    }

    const foundPath = findBinaryRecursively(TARGET_DIR, binaryName);
    if (foundPath) {
      if (path.resolve(foundPath) !== path.resolve(binaryPath)) {
        fs.copyFileSync(foundPath, binaryPath);
      }
      try {
        fs.chmodSync(binaryPath, '0755');
      } catch (_) {}
    } else {
      throw new Error('Not found extracted xray core');
    }

    // Cleanup archive
    try { fs.unlinkSync(archivePath); } catch (_) {}
  } catch (err: any) {
    console.error(`[DEBUG] Failed to download Xray-core automatically:`, err.message);
    throw new Error(`Xray core self-deploy failed: ${err.message}. Please place xray binary inside "获取CFIP" folder manually.`);
  }

  return binaryPath;
}

export async function GET() {
  const currentStatus = getStatus();
  return NextResponse.json({
    success: true,
    ...currentStatus
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, config } = body;

    const currentStatus = getStatus();

    if (action === 'stop') {
      if (currentStatus.isRunning && currentStatus.pid) {
        const stopped = stopXrayProcess(currentStatus.pid);
        if (!stopped) {
          return NextResponse.json({ success: false, error: 'Failed to stop existing proxy pool daemon' }, { status: 500 });
        }
      }
      // Update local state empty
      try { fs.unlinkSync(STATE_PATH); } catch (_) {}
      return NextResponse.json({ success: true, isRunning: false });
    }

    if (action === 'start' || action === 'restart') {
      // Stop existing if any
      if (currentStatus.isRunning && currentStatus.pid) {
        stopXrayProcess(currentStatus.pid);
      }

      if (!config || !config.nodes || config.nodes.length === 0) {
        return NextResponse.json({ success: false, error: 'No node endpoints provided for wireguard routing' }, { status: 400 });
      }

      // Check key requirements
      const { nodes, credentials, startPort, account } = config;

      // Ensure xray core binary
      const binaryPath = await getOrDownloadXrayBinary();

      // Build config.json
      const inbounds: any[] = [];
      const outbounds: any[] = [];
      const routeRules: any[] = [];

      nodes.forEach((node: any, index: number) => {
        const port = Number(startPort) + index;
        const inboundTag = `socks-in-${port}`;
        const outboundTag = `wg-out-${port}`;
        
        // Find credentials for this specific port
        const cred = credentials?.find((c: any) => Number(c.port) === port) || { user: '', pass: '' };
        const hasAuth = !!(cred.user && cred.pass);

        // Build inbound SOCKS5 configs
        inbounds.push({
          port: port,
          listen: "0.0.0.0", // Allow global connections from user's local PC to VPS!
          protocol: "socks",
          settings: {
            auth: hasAuth ? "password" : "noauth",
            accounts: hasAuth ? [{ user: cred.user, pass: cred.pass }] : undefined,
            udp: true,
            userLevel: 0
          },
          tag: inboundTag
        });

        // Build outbound Wireguard tunnels
        const reservedInts = (account.reserved || '0,0,0')
          .split(',')
          .map((s: string) => parseInt(s.trim()) || 0);

        outbounds.push({
          protocol: "wireguard",
          settings: {
            secretKey: account.privateKey,
            address: [account.address || "172.16.0.2/32"],
            peers: [
              {
                publicKey: account.publicKey,
                endpoint: `${node.ip}:${node.port}`,
                keepAlive: 15
              }
            ],
            reserved: [reservedInts[0] || 0, reservedInts[1] || 0, reservedInts[2] || 0],
            mtu: 1285
          },
          tag: outboundTag
        });

        // Add matching routing rules (port-to-interface isolation!)
        routeRules.push({
          type: "field",
          inboundTag: [inboundTag],
          outboundTag: outboundTag
        });
      });

      const xrayConfigJson = {
        log: {
          loglevel: "info"
        },
        inbounds: inbounds,
        outbounds: outbounds,
        routing: {
          domainStrategy: "AsIs",
          rules: routeRules
        }
      };

      // Write config
      fs.writeFileSync(CFG_PATH, JSON.stringify(xrayConfigJson, null, 2));

      // Launch process as detached daemon
      console.log(`[DEBUG] Spawning process in directory: ${TARGET_DIR} ...`);
      const child = spawn(binaryPath, ['-c', 'config.json'], {
        cwd: TARGET_DIR,
        detached: true,
        stdio: 'ignore'
      });

      const pid = child.pid;
      if (!pid) {
        throw new Error('Failed to start process - blank PID returned from launcher');
      }

      // Detach fully so process lives on Next.js server stop / rebuilds
      child.unref();

      // Write PID
      fs.writeFileSync(PID_PATH, pid.toString(), 'utf-8');

      // Write running state JSON
      const runState = {
        starteTime: new Date().toISOString(),
        startPort,
        nodeCount: nodes.length,
        nodes,
        credentials
      };
      fs.writeFileSync(STATE_PATH, JSON.stringify(runState, null, 2));

      console.log(`[DEBUG] Successfully launched background Xray pool daemon. PID: ${pid}`);

      return NextResponse.json({
        success: true,
        isRunning: true,
        pid,
        activeConfig: runState
      });
    }

    return NextResponse.json({ success: false, error: 'Unknown action specified' }, { status: 400 });

  } catch (err: any) {
    console.error(`[DEBUG] VPS Control API execution error:`, err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Server interval runtime fault'
    }, { status: 500 });
  }
}
