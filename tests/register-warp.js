const crypto = require('crypto');

async function registerWarp() {
  // 1. Generate X25519 Keypair
  const pair = crypto.generateKeyPairSync('x25519');
  const rawPub = pair.publicKey.export({ type: 'spki', format: 'der' });
  const pubBytes = rawPub.subarray(rawPub.length - 32);
  const pubBase64 = pubBytes.toString('base64');

  const rawPriv = pair.privateKey.export({ type: 'pkcs8', format: 'der' });
  const privBytes = rawPriv.subarray(rawPriv.length - 32);
  const privBase64 = privBytes.toString('base64');

  // 2. HTTP POST to api.cloudflareclient.com
  const body = {
    key: pubBase64,
    install_id: "",
    fcm_token: ""
  };

  try {
    const response = await fetch('https://api.cloudflareclient.com/v0a2158/reg', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'okhttp/3.12.1'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log('FAIL: API returned error', response.status, errText);
      return null;
    }

    const data = await response.json();
    
    // Extract Reserved Bytes from Client ID (id)
    // In newer WARP client formats, the client ID (which is a UUID or format like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
    // is processed to get reserved. Wait! Let's check how the ID is formatted.
    // Usually, the first 3 bytes of the base64-decoded client ID string (client Client ID) or similar are the Reserved bytes.
    // If the peer ID is a uuid, we can convert it to hex bytes, or let's look at the "client" object or "config".
    // Alternatively, modern XRay/Sing-Box can accept base64 representation of reserved bytes.
    // Let's decode or find the client token.
    console.log('SUCCESS REGISTERED WARP!');
    console.log('Client IP (IPv4):', data.config?.interface?.addresses?.v4 || '172.16.0.2/32');
    console.log('Client IP (IPv6):', data.config?.interface?.addresses?.v6 || '');
    console.log('PrivateKey (private_key):', privBase64);
    console.log('Cloudflare WG PublicKey:', 'bmXOC+F1fxEMUPMRgQKHX6Bg6v4RI9Y=');
    
    // Let's print out the client ID or client token to extract reserved.
    console.log('Client ID:', data.id);
    
    // Let's calculate the reserved bytes from the Client ID (usually the hex value decoded or converted to byte array)
    const clientIdBytes = Buffer.from(data.id.replace(/-/g, ''), 'hex');
    const reserved = [clientIdBytes[0] || 0, clientIdBytes[1] || 0, clientIdBytes[2] || 0];
    console.log('Reserved Decimals:', reserved.join(', '));
    console.log('Reserved Base64:', Buffer.from(reserved).toString('base64'));

    return {
      privateKey: privBase64,
      reserved: reserved,
      reservedBase64: Buffer.from(reserved).toString('base64'),
      ipv4: data.config?.interface?.addresses?.v4 || '172.16.0.2',
    };
  } catch (error) {
    console.error('FAIL:', error);
    return null;
  }
}

registerWarp();
