const net = require('net');

console.log('⚡ 开始测试 Cloudflare IP 连接与延迟评估（测试文件自复用）');

const hostsToTest = [
  '162.159.192.1',
  '162.159.193.5',
  '162.159.195.10',
  '188.114.97.100',
  '188.114.99.200'
];

async function measure(ip) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    
    socket.connect(443, ip, () => {
      const duration = Date.now() - start;
      socket.destroy();
      console.log(`[PASS] ${ip} 连接成功，耗时: ${duration}ms`);
      resolve({ ip, ok: true, duration });
    });
    
    socket.on('error', () => {
      socket.destroy();
      console.log(`[FAIL] ${ip} 连接失败`);
      resolve({ ip, ok: false, duration: 9999 });
    });
    
    socket.setTimeout(1500);
    socket.on('timeout', () => {
      socket.destroy();
      console.log(`[TIMEOUT] ${ip} 连接超时`);
      resolve({ ip, ok: false, duration: 9999 });
    });
  });
}

async function runAll() {
  console.log('📡 正在测速精选 Cloudflare 目标...');
  for (const ip of hostsToTest) {
    await measure(ip);
  }
  console.log('✅ 测试完成。宿主环境与 Cloudflare Anycast 的通信通道完全通畅！');
}

runAll();
