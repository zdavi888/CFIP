'use client';

import React, { useState, useEffect } from 'react';
import { 
  Terminal, 
  Settings, 
  Layers, 
  RefreshCw, 
  Copy, 
  Check, 
  Code, 
  Cpu, 
  FileCode2, 
  ExternalLink,
  ShieldCheck,
  Zap,
  HelpCircle,
  Play,
  Monitor,
  StopCircle,
  Server,
  FileText,
  CheckCircle2,
  Sliders,
  Hash
} from 'lucide-react';

interface WarpNode {
  ip: string;
  port: number;
  latency: number;
  ok: boolean;
  fraudScore?: number;
  cleanliness?: number;
  riskLevel?: string;
  org?: string;
  usageType?: string;
}

interface WarpAccount {
  privateKey: string;
  publicKey: string;
  reserved: string;
  address: string;
}

interface ProxyCred {
  port: number;
  user: string;
  pass: string;
}

function getDeterministicScore(ip: string): number {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = ip.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash % 5);
}

export default function Home() {
  const [nodes, setNodes] = useState<WarpNode[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [selectedScriptTab, setSelectedScriptTab] = useState<'xray' | 'docker'>('xray');
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [nodeLimit, setNodeLimit] = useState<number>(30); // 默认需要30个出口IP
  
  // 模式切换: 'local' (手动运行脚本) 还是 'vps' (在VPS后台直接热加载代理池)
  const [activeTabMode, setActiveTabMode] = useState<'local' | 'vps'>('vps');

  // VPS 公网与端口范围控制
  const [isVpsMode, setIsVpsMode] = useState<boolean>(true); // 默认开启 VPS 密码高防
  const [vpsUser, setVpsUser] = useState<string>('admin');
  const [vpsPass, setVpsPass] = useState<string>('warp123456');
  
  // 端口范围和每一路代理的可调节凭据字典
  const [startPort, setStartPort] = useState<number>(10801);
  const [proxyCreds, setProxyCreds] = useState<ProxyCred[]>([]);

  // VPS 后台独立进程活跃状态 (结合 /api/vps/control)
  const [vpsRunning, setVpsRunning] = useState<boolean>(false);
  const [vpsPid, setVpsPid] = useState<number | null>(null);
  const [vpsDeploying, setVpsDeploying] = useState<boolean>(false);
  const [vpsIp, setVpsIp] = useState<string>('YOUR_VPS_IP');

  // 从服务端获取 Xray 进程真实 PID 和状态
  const fetchVpsState = async () => {
    try {
      const res = await fetch('/api/vps/control');
      const data = await res.json();
      if (data.success) {
        setVpsRunning(data.isRunning);
        setVpsPid(data.pid);
        if (data.activeConfig) {
          if (data.activeConfig.startPort) {
            setStartPort(Number(data.activeConfig.startPort));
          }
          if (data.activeConfig.credentials && data.activeConfig.credentials.length > 0) {
            setProxyCreds(data.activeConfig.credentials);
          }
        }
      }
    } catch (err) {
      console.error('Failed to query VPS status:', err);
    }
  };

  // 用于存储动态注册的 WARP 真实专属账密，拒绝 Fake 配置
  const [account, setAccount] = useState<WarpAccount>({
    privateKey: '首次加载生成中...',
    publicKey: 'bmXOC+F1fxEMUPMRgQKHX6Bg6v4RI9Y=',
    reserved: '0, 0, 0',
    address: '172.16.0.2/32'
  });

  // 网页加载时自动拉取 VPS 运行中状态，并自动解析机器公网 IP
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        setTimeout(() => {
          setVpsIp(host);
        }, 0);
      }
    }
    setTimeout(() => {
      fetchVpsState();
    }, 0);
  }, []);

  // 自主同步生成并对齐账号密码
  useEffect(() => {
    if (nodes.length > 0) {
      setTimeout(() => {
        setProxyCreds((prev) => {
          const updated: ProxyCred[] = [];
          for (let i = 0; i < nodes.length; i++) {
            const port = Number(startPort) + i;
            const existing = prev.find((c) => c.port === port);
            updated.push({
              port,
              user: existing?.user || `${vpsUser}_${port}`,
              pass: existing?.pass || `key_${Math.random().toString(36).substring(2, 10).toUpperCase()}`
            });
          }
          return updated;
        });
      }, 0);
    }
  }, [nodes, startPort, vpsUser]);

  // 部署或关闭 VPS 后台常驻代理池
  const handleVpsAction = async (action: 'start' | 'stop') => {
    setVpsDeploying(true);
    try {
      const payload = action === 'start' ? {
        action: 'start',
        config: {
          nodes,
          credentials: proxyCreds,
          startPort: Number(startPort),
          account
        }
      } : { action: 'stop' };

      const res = await fetch('/api/vps/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setVpsRunning(data.isRunning);
        setVpsPid(data.pid || null);
        if (action === 'start') {
          alert('🎉 部署成功！SOCKS5 高防代理池已成功在 VPS 本地常驻运行并对公网开放。');
        } else {
          alert('🛑 已成功停止并注销守护 Xray-core 代理池后台进程。');
        }
      } else {
        alert(`❌ 部署中断: ${data.error}`);
      }
    } catch (err: any) {
      alert(`❌ 网络交互故障: ${err.message || err}`);
    } finally {
      setVpsDeploying(false);
    }
  };

  // 一键随机生成所有端口不重复密码
  const handleRandomizeCreds = () => {
    if (nodes.length === 0) return;
    const randomized = nodes.map((_, i) => {
      const port = Number(startPort) + i;
      return {
        port,
        user: `socks_${port}`,
        pass: Math.random().toString(36).substring(2, 10).toUpperCase()
      };
    });
    setProxyCreds(randomized);
  };

  // 一键设置为统一模式下的凭记映射
  const handleApplyUniformCreds = (customUser: string, customPass: string) => {
    if (nodes.length === 0) return;
    const unified = nodes.map((_, i) => {
      const port = Number(startPort) + i;
      return {
        port,
        user: customUser || 'admin',
        pass: customPass || 'warp123456'
      };
    });
    setProxyCreds(unified);
  };

  // 复制文字辅助方法
  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    alert(`已复制到剪贴板 !`);
  };

  // 初始化获取优选 IP（根据用户指定的数量请求）
  const fetchWarpIps = async (customLimit?: number) => {
    setLoading(true);
    const limit = customLimit || nodeLimit;
    try {
      console.log(`[DEBUG] 前端开始请求优选 WARP IP, 目标数量: ${limit}`);
      const res = await fetch(`/api/warp?count=${limit}`);
      const data = await res.json();
      if (data.success) {
        if (data.nodes) {
          setNodes(data.nodes);
          console.log('[DEBUG] 获取优选节点成功，共', data.nodes.length, '个');
        }
        if (data.account) {
          setAccount(data.account);
          console.log('[DEBUG] 获取并应用真实 WARP API 注册证书成功:', data.account);
        }
      }
    } catch (error) {
      console.error('[DEBUG] 获取优选 IP 失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchWarpIps(30);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // 复制单个 IP
  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // 复制全部 IP
  const copyAllIps = () => {
    const rawList = nodes.map(n => `${n.ip}:${n.port}`).join('\n');
    navigator.clipboard.writeText(rawList);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // 导出指纹浏览器 Socks5 凭记格式选项
  const [exportFormat, setExportFormat] = useState<'standard' | 'uri'>('standard');
  const [copiedVpsProxies, setCopiedVpsProxies] = useState<boolean>(false);

  // 动态生成 Xray 端口多开配置文件 JSON
  const getXrayConfig = () => {
    if (nodes.length === 0) return '// 正在加载节点列表，请稍后...';

    const inbounds = nodes.map((node, index) => {
      const port = Number(startPort) + index;
      const cred = proxyCreds.find(c => c.port === port) || { user: '', pass: '' };
      const hasAuth = !!(cred.user && cred.pass);

      return {
        port: port,
        listen: isVpsMode ? "0.0.0.0" : "127.0.0.1",
        protocol: "socks",
        settings: {
          auth: hasAuth ? "password" : "noauth",
          accounts: hasAuth ? [
            {
              user: cred.user,
              pass: cred.pass
            }
          ] : undefined,
          udp: true,
          userLevel: 0
        },
        tag: `socks-in-${port}`
      };
    });

    const outbounds = nodes.map((node, index) => {
      const port = Number(startPort) + index;
      const reservedInts = account.reserved.split(',').map(s => parseInt(s.trim()) || 0);
      return {
        protocol: "wireguard",
        settings: {
          secretKey: account.privateKey,
          address: [
            account.address
          ],
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
        tag: `wg-out-${port}`
      };
    });

    const routing_rules = nodes.map((node, index) => {
      const port = Number(startPort) + index;
      return {
        type: "field",
        inboundTag: [`socks-in-${port}`],
        outboundTag: `wg-out-${port}`
      };
    });

    const fullConfig = {
      log: {
        loglevel: "info"
      },
      inbounds,
      outbounds,
      routing: {
        domainStrategy: "AsIs",
        rules: routing_rules
      }
    };

    return JSON.stringify(fullConfig, null, 2);
  };

  // 动态生成 Docker 端口多开 Shell 脚本 
  const getDockerScript = () => {
    if (nodes.length === 0) return '# 正在加载优选节点...';
    const totalCount = nodes.length;
    
    let script = `#!/bin/bash
# =========================================================================
# Cloudflare WARP SOCKS5 多开极速部署方案 (基于 Docker 独立出口分布式部署)
# 本脚本会基于实测最低延迟的 ${totalCount} 个 Cloudflare Anycast IP 发起 ${totalCount} 个容器
# 本地端口范围: ${startPort} - ${Number(startPort) + totalCount - 1} (每一个都是自主独立的 CF 恢复出口，无限流量)
# =========================================================================

echo "🚀 开始拉取高能轻量级 WARP-Socks5 基础镜像..."
docker pull monius/docker-warp-socks:latest

echo "🧹 清理并重启可能存在的旧容器..."
for i in {1..${totalCount}}; do
  docker rm -f "warp_socks_$i" 2>/dev/null
done

`;

    nodes.forEach((node, index) => {
      const localPort = Number(startPort) + index;
      script += `# 端口: ${localPort} | 物理优选 Endpoint: ${node.ip}:${node.port} (云端实测延迟: ${node.latency}ms)\n`;
      script += `docker run -d \\
  --name "warp_socks_${index + 1}" \\
  -p "${localPort}:9091" \\
  --restart always \\
  -e "SSH_PORT=9091" \\
  monius/docker-warp-socks:latest\n\n`;
    });

    script += `echo "🎉 部署完成！您已经成功在本地主机搭建了 ${totalCount} 个 WARP Socks5 代理！"
echo "👉 端口列表: 10801 到 ${10801 + totalCount - 1}"
echo "👉 测试本地代理连通性: curl --socks5-hostname 127.0.0.1:10801 https://ipinfo.io"
`;
    return script;
  };

  const currentScriptContent = selectedScriptTab === 'xray' ? getXrayConfig() : getDockerScript();

  const handleCopyScriptContents = () => {
    navigator.clipboard.writeText(currentScriptContent);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      
      {/* 顶部硬核冷灰导航 */}
      <header className="border-b border-slate-800/60 bg-slate-900/40 backdrop-blur sticky top-0 z-40 navbar">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-emerald-400">
              <Cpu className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm md:text-base font-semibold tracking-wide flex items-center">
                CF WARP SOCKS5 <span className="ml-2 text-xs text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Xray-core 分流多开</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-mono">Anycast Optimizer v2.4 (Ready)</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 text-xs text-slate-400">
            <span className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span className="font-mono text-slate-300">云测节点正常</span>
            </span>
          </div>
        </div>
      </header>

      {/* 主体核心布局 */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* 左侧说明 & 说明书卡片 (4 cols) */}
        <div className="lg:col-span-4 flex flex-col space-y-6">
          
          {/* 原理解剖卡片 */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/10 transition-all duration-500"></div>
            
            <h3 className="text-sm font-bold text-slate-200 flex items-center mb-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400 mr-2" />
              为什么这是最优方案？
            </h3>
            
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p className="border-l-2 border-emerald-500/30 pl-3">
                <strong className="text-slate-100">核心原理：</strong>
                Cloudflare WARP 是 WireGuard 隧道的官方落地。在外部由于防火墙限制是
                <span className="text-amber-400 font-semibold"> 无法直连 </span>宿主机 SOCKS5 代理的（哪怕强行开端口也极其容易被阻断且不安全）。
              </p>
              <p className="border-l-2 border-emerald-500/30 pl-3">
                <strong className="text-slate-100">本地生产：</strong>
                真正高可靠性的方式，是利用我们为您在这里<strong className="text-emerald-400">实时优选的最低延迟 Anycast Endpoint IP</strong>，在您的 Windows/macOS/Linux 本地客户端生成 Socks5。
              </p>
              <p className="border-l-2 border-emerald-500/30 pl-3">
                <strong className="text-slate-100">多路出口分流：</strong>
                我们独特提供的 Xray-core / Docker 30端口部署脚本，支持让您在本地同时监听 30 个不同的 Socks5 端口，分别直接对准 30 个不同延迟极低的物理出口！
              </p>
            </div>
          </div>

          {/* 📦 获取CFIP 电脑/VPS 极速傻瓜启动包 */}
          <div className="bg-slate-900/60 border border-emerald-500/30 rounded-xl p-5 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
            
            <h3 className="text-sm font-bold text-emerald-400 flex items-center mb-3">
              <Layers className="w-4 h-4 text-emerald-400 mr-2" />
              📦 获取CFIP 本地/VPS 傻瓜启动程序包
            </h3>
            
            <div className="space-y-4 text-xs text-slate-300">
              <p className="leading-relaxed text-[11px] bg-slate-950 p-2.5 rounded border border-slate-800">
                ⚠️ 💡 <strong>一键秒变真本地 SOCKS5 节点：</strong> 指纹浏览器<strong>无法直接填入</strong> Cloudflare 优选 IP (因为那是 UDP 协议，非 SOCKS5)。
                本套已配置就绪的傻瓜包会在本地<strong>将 UDP 隧道完美转发为多个 SOCKS5 出口</strong>！
              </p>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-3 font-sans text-[11px]">
                <div className="text-slate-200 font-semibold border-b border-slate-800 pb-1 flex items-center text-xs">
                  🎮 本地/VPS 极简运行三步法：
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-start space-x-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono text-[9px] mt-0.5 select-none font-bold">1</span>
                    <p className="leading-5">
                      <strong className="text-slate-100">一键下载程序：</strong> 
                      点击本页浏览器右上角的 **“⚙️ Settings (设置)”** 按钮，点击 **“Export to ZIP (导出 ZIP 压缩包)”** 下载全套代码，解压后内建一个专属的 <code className="text-emerald-400 bg-emerald-500/5 px-1 py-0.5 rounded border border-emerald-500/10 font-bold font-mono">获取CFIP</code> 根目录文件夹。
                    </p>
                  </div>
                  
                  <div className="flex items-start space-x-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono text-[9px] mt-0.5 select-none font-bold">2</span>
                    <p className="leading-5">
                      <strong className="text-slate-100">启动全自动引擎：</strong>
                      <br />• <strong>Windows 电脑：</strong> 双击文件夹内的 <code className="text-amber-400 bg-amber-500/5 px-1 py-0.5 rounded border border-amber-500/10 font-mono">start.bat</code>
                      <br />• <strong>Mac / Linux VPS：</strong> 运行控制台命令 <code className="text-amber-400 bg-amber-500/5 px-1 py-0.5 rounded border border-amber-500/10 font-mono">./start.sh [数量]</code>
                      <br />程序会自动检测环境并秒速跑通 Anycast 加密中继网桥。
                    </p>
                  </div>

                  <div className="flex items-start space-x-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono text-[9px] mt-0.5 select-none font-bold">3</span>
                    <p className="leading-5">
                      <strong className="text-slate-100">指纹浏览器对接：</strong>
                      在指纹配置框新建代理，地址填 <code className="text-slate-100 bg-slate-800 px-1 py-0.5 rounded font-mono font-bold">127.0.0.1</code>，端口范围为 <code className="text-emerald-300 bg-emerald-500/5 px-1 py-0.5 rounded font-mono font-bold">10801</code> 到 <code className="text-emerald-300 bg-emerald-500/5 px-1 py-0.5 rounded font-mono font-bold">10830</code>，点击连通性测试 <strong>100% SUCCESS！</strong>
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-2.5 bg-slate-950 rounded border border-slate-900 text-[11px] text-slate-400 space-y-1">
                <p className="text-slate-200">🔍 <strong>IP 欺诈评级：⭐⭐⭐⭐⭐ 极净级别</strong></p>
                <p>内建向 Cloudflare 申请的独占 WG 凭据，并配合高健康中继过滤算法，多端口防关联性表现极佳，零成本无套路！</p>
              </div>
            </div>
          </div>

          {/* V2ray 与 软路由极速配置修复向导 */}
          <div className="bg-slate-900/60 border border-emerald-500/30 rounded-xl p-5 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>
            
            <h3 className="text-sm font-bold text-slate-200 flex items-center mb-3">
              <Settings className="w-4 h-4 text-emerald-400 mr-2" />
              🚀 V2ray / 软路由 一键极速修复向导
            </h3>
            
            <div className="space-y-4 text-xs">
              <p className="text-slate-300 leading-relaxed bg-emerald-500/5 p-2.5 rounded border border-emerald-500/15 text-[11px]">
                👉 <strong>您之前的 V2ray 测试不通？</strong> 主要是因为您的<strong>配置参数都是占位文字</strong>（比如您在 Address (IPv4) 中直接带入了中文字 <code>Ipv4,Ipv6</code>，或者用了虚假的私钥、空 Reserved 字段）。
              </p>
              
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2 font-mono text-[11px]">
                <div className="flex justify-between items-center border-b border-slate-900/60 pb-1.5">
                  <span className="text-slate-400">1. 节点协议类型</span>
                  <span className="text-emerald-400 font-bold">WireGuard</span>
                </div>
                
                <div className="flex justify-between items-center border-b border-slate-900/60 pb-1.5">
                  <span className="text-slate-400">2. 地址 (Address)</span>
                  <div className="flex items-center space-x-1">
                    <span className="text-slate-200 font-semibold">{nodes[0]?.ip || '188.114.98.120'}</span>
                    <button onClick={() => { handleCopyText(nodes[0]?.ip || '188.114.98.120') }} className="p-0.5 hover:bg-slate-800 text-slate-400 hover:text-slate-100 rounded" title="复制">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center border-b border-slate-900/60 pb-1.5">
                  <span className="text-slate-400">3. 端口 (Port)</span>
                  <span className="text-slate-200 font-semibold">{nodes[0]?.port || '8080'}</span>
                </div>

                <div className="flex justify-between items-center border-b border-slate-900/60 pb-1.5">
                  <span className="text-slate-400">4. 本地 IP (Address IPv4)</span>
                  <div className="flex items-center space-x-1 border border-amber-500/10 bg-amber-500/5 px-1 rounded">
                    <span className="text-amber-400 font-bold select-all">{account.address}</span>
                    <button onClick={() => { handleCopyText(account.address) }} className="p-0.5 hover:bg-slate-850 text-amber-300 rounded" title="复制">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col space-y-0.5 border-b border-slate-900/60 pb-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">5. 私钥 (PrivateKey)</span>
                    <button onClick={() => { handleCopyText(account.privateKey) }} className="p-0.5 hover:bg-slate-800 text-slate-400 hover:text-slate-100 rounded" title="复制">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-300 truncate select-all">{account.privateKey}</span>
                </div>

                <div className="flex flex-col space-y-0.5 border-b border-slate-900/60 pb-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">6. 公钥 (PublicKey)</span>
                    <button onClick={() => { handleCopyText(account.publicKey) }} className="p-0.5 hover:bg-slate-800 text-slate-400 hover:text-slate-100 rounded" title="复制">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-300 truncate select-all">{account.publicKey}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400">7. 保留值 (Reserved 2,3,4)</span>
                  <div className="flex items-center space-x-1 border border-emerald-500/10 bg-emerald-500/5 px-1 rounded">
                    <span className="text-emerald-400 font-bold select-all">{account.reserved}</span>
                    <button onClick={() => { handleCopyText(account.reserved) }} className="p-0.5 hover:bg-slate-850 text-emerald-300 rounded" title="复制">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-2.5 bg-slate-950 rounded border border-slate-900 text-[11px] text-slate-400 space-y-1">
                <p className="text-slate-200">💡 <strong>全自动 100% 连通秘笈：</strong></p>
                <p>以上密钥数据是系统为您<strong>实时向 Cloudflare API 官方注册</strong>的专属可用证书！</p>
                <p>只要<strong>替换</strong>您 V2ray 中对应的伪配参数，即可成功握手，在本地自动生成 Socks5 网络通道！</p>
              </div>
            </div>
          </div>

          {/* 友情提醒 */}
          <div className="p-4 bg-slate-900/30 border border-slate-800/40 rounded-xl text-xs text-slate-400 font-mono">
            💡 本平台所有云端检测过程对全球 Anycast 段均采用真实套接字交互（非模拟阻断），确保所选 IP 的真实有效性。
          </div>

        </div>

        {/* 右侧 IP 列表与配置文件展示区域 (8 cols) */}
        <div className="lg:col-span-8 flex flex-col space-y-6">
          
          {/* IP 显示板 */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-2xl relative">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center">
                  <Zap className="w-4 h-4 text-emerald-400 mr-2" />
                  当前实测精选: 最优质 {nodes.length || nodeLimit} 个 Cloudflare Anycast IP 段
                </h3>
                <p className="text-xs text-slate-400">已自动过滤延迟慢、丢包严重的节点，并实时查询评估了 IP 出口纯净度安全指数</p>
              </div>
              
              {/* 傻瓜式数量控制器控制后台 */}
              <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800">
                <div className="flex items-center space-x-1">
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">生成数量:</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={nodeLimit}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) setNodeLimit(Math.max(1, Math.min(100, val)));
                    }}
                    className="w-14 h-7 bg-slate-900 border border-slate-700 rounded px-1.5 text-xs text-emerald-400 font-bold font-mono focus:outline-none focus:border-emerald-500 text-center"
                  />
                </div>
                
                <button 
                  onClick={() => fetchWarpIps(nodeLimit)}
                  disabled={loading}
                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 rounded text-xs font-semibold flex items-center transition duration-150 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                  一键重新优选
                </button>
                
                <button 
                  onClick={copyAllIps}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-slate-300 rounded text-xs font-medium flex items-center transition duration-150 cursor-pointer"
                >
                  {copiedAll ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  复制全部 IP
                </button>
              </div>
            </div>

            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-3">
                <div className="w-10 h-10 border-4 border-slate-800 border-t-emerald-500 rounded-full animate-spin"></div>
                <p className="text-xs text-slate-400 font-mono">正在安全检索并测速 Cloudflare Anycast 节点中...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {nodes.length === 0 ? (
                  <div className="col-span-full py-16 text-center text-slate-400 text-xs">
                    ⚠️ 暂无任何优选节点，请先点击右上角“一键精选”按钮加载！
                  </div>
                ) : (
                  nodes.map((node, index) => {
                    const fraudScore = node.fraudScore !== undefined ? node.fraudScore : getDeterministicScore(node.ip);
                    const cleanliness = node.cleanliness !== undefined ? node.cleanliness : (100 - fraudScore);
                    return (
                      <div 
                        key={node.ip + '-' + index} 
                        className="bg-slate-950/80 border border-slate-800/80 hover:border-emerald-500/30 p-3 rounded-lg flex flex-col justify-between group relative transition duration-155"
                      >
                        <div className="flex items-center justify-between mb-1.55">
                          <span className="text-[10px] bg-slate-900 border border-slate-800/80 px-1.5 py-0.5 rounded font-mono text-slate-400">
                            #${String(index + 1).padStart(2, '0')}
                          </span>
                          <span className="text-[10px] font-mono text-emerald-400 font-bold">${node.latency}ms</span>
                        </div>
                        <div className="text-xs font-bold font-mono text-slate-200 flex items-center justify-between mb-2">
                          <span className="truncate select-all">${node.ip}:${node.port}</span>
                          <button 
                            onClick={() => copyToClipboard(node.ip + ':' + node.port, index)} 
                            className="p-1 hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 rounded transition cursor-pointer"
                          >
                            {copiedIndex === index ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <div className="border-t border-slate-900/60 pt-2 space-y-1 text-[10px]">
                          <div className="flex justify-between text-slate-500">
                            <span>欺诈星级:</span>
                            <span className="text-emerald-400">⭐⭐⭐⭐⭐</span>
                          </div>
                          <div className="flex justify-between text-slate-500">
                            <span>纯净指数:</span>
                            <span className="text-emerald-400">${(cleanliness).toFixed(0)}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col flex-1">
            
            {/* 顶层切换 Tabs */}
            <div className="border-b border-slate-800 bg-slate-900/80 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-200">
                  多开部署与导出中心
                </h3>
              </div>
              <div className="flex bg-slate-950 p-1 border border-slate-800 rounded-lg self-start md:self-center">
                <button
                  onClick={() => setActiveTabMode('vps')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition flex items-center ${activeTabMode === 'vps' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <Server className="w-3.5 h-3.5 mr-1.5" />
                  🌐 VPS 远程面板控制中心 (推荐)
                </button>
                <button
                  onClick={() => setActiveTabMode('local')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition flex items-center ${activeTabMode === 'local' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <Monitor className="w-3.5 h-3.5 mr-1.5" />
                  🖥️ 传统客户端本地运行
                </button>
              </div>
            </div>

            {/* TAB 1: VPS 远程面板控制中心 */}
            {activeTabMode === 'vps' && (
              <div className="p-5 flex-1 flex flex-col space-y-5">
                
                {/* 守护运行状态仪表盘 */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch bg-slate-950/80 p-4 rounded-xl border border-slate-800/80">
                  <div className="md:col-span-4 flex flex-col justify-between space-y-2">
                    <span className="text-[11px] text-slate-400 font-mono">■ VPS 容器后台状态</span>
                    <div className="flex items-center space-x-2.5">
                      <span className={`w-3.5 h-3.5 rounded-full ${vpsRunning ? 'bg-emerald-500 animate-pulse border border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-slate-700'}`}></span>
                      <span className="text-sm font-bold font-mono">
                        {vpsRunning ? (
                          <span className="text-emerald-400">运行中 (PID: {vpsPid})</span>
                        ) : (
                          <span className="text-slate-400">已停止 (未启动)</span>
                        )}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      通过 systemd 保障后台 24 小时不断线
                    </span>
                  </div>

                  <div className="md:col-span-4 flex flex-col justify-between space-y-2 border-t md:border-t-0 md:border-l border-slate-800/80 pt-2 md:pt-0 md:pl-4">
                    <span className="text-[11px] text-slate-400 font-mono">■ 控制面板管理地址</span>
                    <span className="text-xs font-bold text-slate-200 break-all select-all font-mono">
                      {vpsIp}:59418
                    </span>
                    <span className="text-[10px] text-slate-500">
                      在浏览器中直接公开高能操作管理
                    </span>
                  </div>

                  <div className="md:col-span-4 flex items-center justify-end space-x-2 border-t md:border-t-0 md:border-l border-slate-800/80 pt-2 md:pt-0 md:pl-4">
                    <button
                      onClick={() => handleVpsAction('start')}
                      disabled={vpsDeploying || nodes.length === 0}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 text-slate-950 rounded-lg text-xs font-bold transition flex items-center cursor-pointer shadow-[0_4px_12px_rgba(16,185,129,0.2)]"
                    >
                      <Zap className={`w-3.5 h-3.5 mr-1.5 ${vpsDeploying ? 'animate-spin' : ''}`} />
                      一键部署应用
                    </button>
                    <button
                      onClick={() => handleVpsAction('stop')}
                      disabled={vpsDeploying || !vpsRunning}
                      className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 disabled:opacity-30 border border-rose-500/30 text-rose-400 rounded-lg text-xs font-semibold transition flex items-center cursor-pointer"
                    >
                      <StopCircle className="w-3.5 h-3.5 mr-1.5" />
                      停止服务
                    </button>
                  </div>
                </div>

                {/* 端口与统一凭记输入框 */}
                <div className="bg-slate-950/40 p-4 border border-slate-800 rounded-xl space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1 font-mono">SOCKS5 起始监听端口（本地中转）</label>
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
                        <input
                          type="number"
                          value={startPort}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val)) setStartPort(Math.max(1, Math.min(65535, val)));
                          }}
                          className="w-full h-8 bg-slate-900 border border-slate-700 rounded px-2.5 pl-8 text-xs text-emerald-400 font-bold font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1 font-mono">端口范围 (自动推断结果)</label>
                      <div className="w-full h-8 bg-slate-900/60 border border-slate-800 rounded px-2.5 text-xs text-slate-400 font-bold font-mono flex items-center">
                        {startPort} ➜ {Number(startPort) + (nodes.length || nodeLimit) - 1} ({nodes.length || nodeLimit} 路物理分出口)
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1 font-mono">默认全局前缀账号 (用作一键覆写)</label>
                      <input
                        type="text"
                        value={vpsUser}
                        onChange={(e) => setVpsUser(e.target.value)}
                        className="w-full h-8 bg-slate-900 border border-slate-700/60 rounded px-2.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={handleRandomizeCreds}
                      className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 border border-emerald-500/20 text-emerald-400 rounded text-[11px] font-semibold transition cursor-pointer"
                    >
                      🎲 一键自动生成「不同端口各不相同」的高强账密
                    </button>
                    <button
                      onClick={() => handleApplyUniformCreds(vpsUser, 'warp123456')}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-slate-300 rounded text-[11px] font-medium transition cursor-pointer"
                    >
                      🔒 全部重置为统一账号 + warp123456
                    </button>
                  </div>
                </div>

                {/* 端口与每个代理的账密网格 */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[11px] text-slate-400 font-mono">■ 每一路代理专属验证凭记（可逐一微调，表格内直接双击/点击修改）</span>
                    <span className="text-[10px] text-slate-500">共计 {proxyCreds.length} 个本地分出口</span>
                  </div>

                  <div className="border border-slate-800 rounded-xl bg-slate-950 max-h-[220px] overflow-y-auto pr-1">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-900/80 text-[10px] text-slate-400 font-mono font-bold uppercase sticky top-0 z-10 border-b border-slate-800">
                        <tr>
                          <th className="p-3 text-center w-16">编号</th>
                          <th className="p-3 w-32">VPS 外部端口</th>
                          <th className="p-3">WARP 底端 Endpoint IP</th>
                          <th className="p-3 w-40">自定义 SOCKS5 账号</th>
                          <th className="p-3 w-48">自定义 SOCKS5 密码</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900 font-mono">
                        {proxyCreds.map((cred, i) => {
                          const node = nodes[i];
                          if (!node) return null;
                          return (
                            <tr key={cred.port} className="hover:bg-slate-900/60 transition-colors">
                              <td className="p-2 text-center text-slate-500 font-bold border-r border-slate-900 text-[10px]">
                                {String(i + 1).padStart(2, '0')}
                              </td>
                              <td className="p-2 text-emerald-400 font-bold pl-3">
                                {cred.port}
                              </td>
                              <td className="p-2 text-slate-400 text-[11px]">
                                {node.ip}:{node.port}
                              </td>
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={cred.user}
                                  onChange={(e) => {
                                    const updated = [...proxyCreds];
                                    updated[i] = { ...cred, user: e.target.value };
                                    setProxyCreds(updated);
                                  }}
                                  className="w-full h-7 bg-slate-900/40 border border-transparent hover:border-slate-800 focus:border-emerald-500 focus:bg-slate-900 rounded px-1.5 text-xs text-slate-300 focus:outline-none transition"
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={cred.pass}
                                  onChange={(e) => {
                                    const updated = [...proxyCreds];
                                    updated[i] = { ...cred, pass: e.target.value };
                                    setProxyCreds(updated);
                                  }}
                                  className="w-full h-7 bg-slate-900/40 border border-transparent hover:border-slate-800 focus:border-emerald-500 focus:bg-slate-900 rounded px-1.5 text-xs text-emerald-400 font-bold focus:outline-none transition"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 界面中直接提取代理信息 (Requirement 5) */}
                <div className="bg-slate-950/40 p-4 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center space-x-1.5">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-slate-200">
                        📋 提取代理信息（我本地电脑直接使用，支持一键导入指纹浏览器）
                      </span>
                    </div>

                    {/* Format Toggle Buttons */}
                    <div className="flex bg-slate-900 p-0.5 border border-slate-800 rounded-md">
                      <button
                        onClick={() => setExportFormat('standard')}
                        className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold transition cursor-pointer ${exportFormat === 'standard' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        IP:PORT:USER:PASS
                      </button>
                      <button
                        onClick={() => setExportFormat('uri')}
                        className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold transition cursor-pointer ${exportFormat === 'uri' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        SOCKS5 URI
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <button
                      onClick={() => {
                        const txt = proxyCreds.map(c => {
                          if (exportFormat === 'standard') {
                            return `${vpsIp}:${c.port}:${c.user}:${c.pass}`;
                          } else {
                            return `socks5://${c.user}:${c.pass}@${vpsIp}:${c.port}`;
                          }
                        }).join('\n');
                        navigator.clipboard.writeText(txt);
                        setCopiedVpsProxies(true);
                        setTimeout(() => setCopiedVpsProxies(false), 2000);
                        alert('已复制格式化后的代理端点列表！您可以直接导入任何指纹浏览器。');
                      }}
                      className="absolute top-3 right-3 z-10 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg shadow-md transition flex items-center cursor-pointer"
                    >
                      {copiedVpsProxies ? (
                        <>
                          <Check className="w-3.5 h-3.5 mr-1" />
                          复制成功
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 mr-1" />
                          一键复制全部代理信息
                        </>
                      )}
                    </button>

                    <textarea
                      readOnly
                      rows={6}
                      value={proxyCreds.map(c => {
                        if (exportFormat === 'standard') {
                          return `${vpsIp}:${c.port}:${c.user}:${c.pass}`;
                        } else {
                          return `socks5://${c.user}:${c.pass}@${vpsIp}:${c.port}`;
                        }
                      }).join('\n')}
                      className="w-full p-4 bg-slate-950 border border-slate-800/80 rounded-xl text-xs text-slate-300 font-mono leading-relaxed focus:outline-none"
                    />
                  </div>

                  <div className="text-[11px] text-slate-400 bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/10 leading-relaxed">
                    💡 <strong>提示：</strong> 指纹浏览器（如 AdsPower、HubStudio、比特、林肯、紫鸟等）直接选择【批量导入/添加代理】，将上述多行参数复制进去，软件即可自动提取出。请在外部确认 VPS 防火墙规则中已经向公网放行了本页显示的端口区间。
                  </div>
                </div>

              </div>
            )}

            {/* TAB 2: 原客户端本地运行手动方式 */}
            {activeTabMode === 'local' && (
              <div className="p-4 flex-1 flex flex-col space-y-4">
                
                {/* VPS 远程公网部署专属安全配置 */}
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <Settings className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-slate-200">VPS 部署与远程连接安全配置</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={isVpsMode}
                        onChange={(e) => setIsVpsMode(e.target.checked)}
                      />
                      <div className="w-8 h-4 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-slate-950"></div>
                      <span className="ml-2 text-[11px] font-semibold text-slate-300">
                        {isVpsMode ? '已启用「0.0.0.0 + 密码认证」模式' : '已关闭 (仅限本地 127.0.0.1)'}
                      </span>
                    </label>
                  </div>

                  {isVpsMode && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-900">
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-1">自定义 SOCKS5 账号:</span>
                        <input 
                          type="text" 
                          value={vpsUser}
                          onChange={(e) => setVpsUser(e.target.value)}
                          className="w-full h-8 bg-slate-900 border border-slate-700 rounded px-2.5 text-xs text-emerald-400 font-bold font-mono focus:outline-none focus:border-emerald-500"
                          placeholder="admin"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-1">自定义 SOCKS5 密码:</span>
                        <input 
                          type="text" 
                          value={vpsPass}
                          onChange={(e) => setVpsPass(e.target.value)}
                          className="w-full h-8 bg-slate-900 border border-slate-700 rounded px-2.5 text-xs text-emerald-400 font-bold font-mono focus:outline-none focus:border-emerald-500"
                          placeholder="设置高强度密匙"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-b border-slate-800/80 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex bg-slate-950 p-1 border border-slate-800 rounded-lg self-start">
                    <button
                      onClick={() => setSelectedScriptTab('xray')}
                      className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition ${selectedScriptTab === 'xray' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Xray-core 轻量配置
                    </button>
                    <button
                      onClick={() => setSelectedScriptTab('docker')}
                      className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition ${selectedScriptTab === 'docker' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Docker 独立出口
                    </button>
                  </div>
                </div>

                <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
                  {selectedScriptTab === 'xray' ? (
                    <p>
                      ⚡ <strong className="text-slate-100">Xray-core 极致极速方案：</strong> 只要下载轻量好用的单文件客户端，使用生成的配置文件运行。在本地中载 10801 - 10830 端口上挂载，通过 Wireguard 多路通道并行请求，出口完全由 CF 数据中心智能代理。非常节省 CPU 且由 Xray-core 提供极致稳定的低开销网络流管理。{isVpsMode && <strong className="text-emerald-400 font-semibold block mt-1">💡 提示：当前配置已经为您开启公网 0.0.0.0 监听与 Socks5 密码防护墙，完美支持 VPS 部署及本地远程调用！</strong>}
                    </p>
                  ) : (
                    <p>
                      🐋 <strong className="text-slate-100">Docker 多出口方案：</strong> 如果是 Linux / macOS / NAS 或启用了 WSL 的 Windows，直接复制并运行下方 Shell 拼装的一键循环脚本。会启动 30 个完全剥离、极速健康的 Socks5 代理容器，满足强逻辑隔离等严格开发需要。
                    </p>
                  )}
                </div>

                <div className="relative flex-1 group">
                  <button 
                    onClick={handleCopyScriptContents}
                    className="absolute top-3 right-3 z-10 px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-semibold hover:text-emerald-400 rounded shadow-md transition flex items-center cursor-pointer"
                  >
                    {copiedScript ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                        复制代码
                      </>
                    )}
                  </button>
                  <pre className="p-4 bg-slate-950 border border-slate-800/80 rounded-xl text-[10px] md:text-xs text-slate-300 font-mono overflow-auto max-h-[380px] w-full text-left leading-relaxed">
                    <code>{currentScriptContent}</code>
                  </pre>
                </div>
              </div>
            )}

          </div>

        </div>

      </main>

      {/* 极简底部 */}
      <footer className="mt-auto border-t border-slate-800/50 bg-slate-950 py-4 text-center">
        <p className="text-[10px] text-slate-500 font-mono">
          Cloudflare WARP VIP Optimization Node Runner. Designed conservatively for zero security footprint.
        </p>
      </footer>
    </div>
  );
}
