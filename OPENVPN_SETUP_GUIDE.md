# OpenVPN Certificate System - Complete Guide

A simple guide to understand how OpenVPN certificates work and how to set up your own VPN app.

---

## Table of Contents

1. [How OpenVPN Works](#how-openvpn-works)
2. [The Key Players](#the-key-players)
3. [Setup Overview](#setup-overview)
4. [Step-by-Step Setup](#step-by-step-setup)
5. [API Endpoints](#api-endpoints)
6. [Android App Integration](#android-app-integration)
7. [.ovpn File Structure](#ovpn-file-structure)
8. [Common Questions](#common-questions)

---

## How OpenVPN Works

Think of it like a secure building:

```
+------------------+     +------------------+     +------------------+
|    CA (Boss)     |     |   VPN Server     |     |    Your App      |
|                  |     |   (Building)     |     |    (Employee)    |
|  Creates trust   |     |                  |     |                  |
|  system          |---->|  Has CA's seal   |     |  Gets ID card    |
|                  |     |  installed       |<----|  from CA         |
+------------------+     +------------------+     +------------------+
                                  |                       |
                                  |    ID card check      |
                                  |<----------------------|
                                  |                       |
                                  |    Access granted!    |
                                  |---------------------->|
```

**Simple Rule:** The VPN server and client certificates must come from the SAME CA.

---

## The Key Players

| Component | What It Is | Real World Analogy |
|-----------|------------|-------------------|
| **CA Certificate** (ca.crt) | The authority that issues certificates | HR Department's official seal |
| **CA Private Key** (ca.key) | Secret key to sign certificates | HR's stamp (keep secret!) |
| **Client Certificate** | User's identity proof | Employee ID card |
| **Client Private Key** | User's secret key | Personal signature |
| **Server Certificate** | Server's identity proof | Building's license |

---

## Setup Overview

```
+-------------------------------------------------------------------+
|                         YOUR SYSTEM                                |
|                                                                   |
|  +-------------------+    +-------------------+    +-------------+ |
|  |  OpenVPN Server   |    |  Backend API      |    | Android App | |
|  |  (EC2 Instance)   |    |  (Node.js)        |    |             | |
|  |                   |    |                   |    |             | |
|  |  Has:             |    |  Has:             |    |  Gets:      | |
|  |  - ca.crt         |    |  - ca.crt         |    |  - cert     | |
|  |  - ca.key         |    |  - ca.key         |    |  - key      | |
|  |  - server.crt     |    |                   |    |  - ca       | |
|  |  - server.key     |    |  Creates:         |    |             | |
|  |                   |    |  - client certs   |    |  Builds:    | |
|  |                   |    |  - client keys    |    |  - .ovpn    | |
|  +-------------------+    +-------------------+    +-------------+ |
|           ^                        |                     |         |
|           |                        |                     |         |
|           +------------------------+---------------------+         |
|                    Same CA = Everything works!                     |
+-------------------------------------------------------------------+
```

---

## Step-by-Step Setup

### Step 1: Set Up OpenVPN Server (EC2)

```bash
# On your EC2 instance
# This creates the CA and server certificates automatically

# Option A: Use a script (easiest)
wget https://git.io/vpn -O openvpn-install.sh
sudo bash openvpn-install.sh

# Option B: Manual setup with Easy-RSA
sudo apt install openvpn easy-rsa
```

After setup, you'll have these files:
```
/etc/openvpn/server/
├── ca.crt          <-- Copy this
├── ca.key          <-- Copy this (keep secret!)
├── server.crt
└── server.key
```

### Step 2: Copy CA Files to Backend

```bash
# Find your CA files
sudo find / -name "ca.crt" 2>/dev/null
sudo find / -name "ca.key" 2>/dev/null

# Copy to your backend project folder
sudo cp /etc/openvpn/server/ca.crt ~/your-backend/
sudo cp /etc/openvpn/server/ca.key ~/your-backend/
```

### Step 3: Set Up Backend API

```bash
# Create project
mkdir vpn-backend
cd vpn-backend
npm init -y

# Install dependencies
npm install express node-forge
```

### Step 4: Create API Server

Create `index.js`:

```javascript
const express = require('express');
const forge = require('node-forge');
const fs = require('fs');

const app = express();
app.use(express.json());

// Load CA credentials from your OpenVPN server
const caCertPem = fs.readFileSync('./ca.crt', 'utf8');
const caKeyPem = fs.readFileSync('./ca.key', 'utf8');
const caCert = forge.pki.certificateFromPem(caCertPem);
const caKey = forge.pki.privateKeyFromPem(caKeyPem);

// Generate client certificate
function generateClientCertificate(userId) {
  const clientKeys = forge.pki.rsa.generateKeyPair(2048);
  const clientCert = forge.pki.createCertificate();

  clientCert.publicKey = clientKeys.publicKey;
  clientCert.serialNumber = Date.now().toString();

  // Valid for 1 year
  clientCert.validity.notBefore = new Date();
  clientCert.validity.notAfter = new Date();
  clientCert.validity.notAfter.setFullYear(
    clientCert.validity.notBefore.getFullYear() + 1
  );

  clientCert.setSubject([{ name: 'commonName', value: userId }]);
  clientCert.setIssuer(caCert.subject.attributes);

  clientCert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', clientAuth: true },
  ]);

  // Sign with CA
  clientCert.sign(caKey, forge.md.sha256.create());

  return {
    certificate: forge.pki.certificateToPem(clientCert),
    privateKey: forge.pki.privateKeyToPem(clientKeys.privateKey),
  };
}

// API Endpoint
app.post('/certificate', (req, res) => {
  const { userId, deviceId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const { certificate, privateKey } = generateClientCertificate(userId);

  res.json({
    success: true,
    userId,
    certificate,
    privateKey,
    caCertificate: caCertPem,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  });
});

// Server list endpoint
app.get('/servers', (req, res) => {
  res.json({
    servers: [
      { id: 'us-1', name: 'USA - New York', ip: '45.32.100.50', port: 1194, protocol: 'udp' },
      { id: 'fi-1', name: 'Finland', ip: '95.216.50.100', port: 1194, protocol: 'udp' },
      { id: 'jp-1', name: 'Japan - Tokyo', ip: '103.45.67.89', port: 1194, protocol: 'udp' },
    ]
  });
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

### Step 5: Run and Test

```bash
# Start server
node index.js

# Test certificate endpoint
curl -X POST http://localhost:3000/certificate \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "deviceId": "android_abc"}'

# Test servers endpoint
curl http://localhost:3000/servers
```

---

## API Endpoints

### POST /certificate

**Purpose:** Get client certificate for a user (call once per user/device)

**Request:**
```json
{
  "userId": "user_123",
  "deviceId": "android_device_id"
}
```

**Response:**
```json
{
  "success": true,
  "userId": "user_123",
  "certificate": "-----BEGIN CERTIFICATE-----\n...",
  "privateKey": "-----BEGIN RSA PRIVATE KEY-----\n...",
  "caCertificate": "-----BEGIN CERTIFICATE-----\n...",
  "expiresAt": "2026-12-16T00:00:00.000Z"
}
```

### GET /servers

**Purpose:** Get list of available VPN servers

**Response:**
```json
{
  "servers": [
    {
      "id": "us-1",
      "name": "USA - New York",
      "ip": "45.32.100.50",
      "port": 1194,
      "protocol": "udp"
    }
  ]
}
```

---

## Android App Integration

### Flow

```
+------------------+     +------------------+     +------------------+
|  App Starts      |     |  User Selects    |     |  App Connects    |
|                  |     |  Server          |     |                  |
|  1. Check cache  |     |                  |     |  1. Build .ovpn  |
|  2. If no cert:  |---->|  Show server     |---->|  2. Start OpenVPN|
|     Call /cert   |     |  list from       |     |  3. Connected!   |
|  3. Save to cache|     |  /servers API    |     |                  |
+------------------+     +------------------+     +------------------+
```

### Android Code Example (Kotlin)

```kotlin
// 1. Data class for certificate
data class CertificateData(
    val certificate: String,
    val privateKey: String,
    val caCertificate: String,
    val expiresAt: String
)

// 2. Save certificate to SharedPreferences
fun saveCertificate(context: Context, data: CertificateData) {
    val prefs = context.getSharedPreferences("vpn_certs", Context.MODE_PRIVATE)
    prefs.edit().apply {
        putString("certificate", data.certificate)
        putString("privateKey", data.privateKey)
        putString("caCertificate", data.caCertificate)
        putString("expiresAt", data.expiresAt)
        apply()
    }
}

// 3. Build .ovpn config
fun buildOvpnConfig(serverIp: String, port: Int, certData: CertificateData): String {
    return """
        client
        dev tun
        proto udp
        remote $serverIp $port
        resolv-retry infinite
        nobind
        persist-key
        persist-tun
        remote-cert-tls server
        cipher AES-256-GCM
        verb 3

        <ca>
        ${certData.caCertificate}
        </ca>

        <cert>
        ${certData.certificate}
        </cert>

        <key>
        ${certData.privateKey}
        </key>
    """.trimIndent()
}

// 4. Usage
val config = buildOvpnConfig("45.32.100.50", 1194, savedCertData)
// Pass config to OpenVPN library
```

---

## .ovpn File Structure

```
client                              # This is a client config
dev tun                             # Use TUN device
proto udp                           # Use UDP protocol
remote 45.32.100.50 1194            # Server IP and port  <-- CHANGES PER SERVER
resolv-retry infinite               # Keep trying to resolve
nobind                              # Don't bind to local port
persist-key                         # Keep key across restarts
persist-tun                         # Keep tun across restarts
remote-cert-tls server              # Verify server certificate
cipher AES-256-GCM                  # Encryption cipher
verb 3                              # Verbosity level

<ca>                                # CA Certificate
-----BEGIN CERTIFICATE-----         # SAME FOR ALL SERVERS
... (ca certificate content) ...    #
-----END CERTIFICATE-----           #
</ca>                               #

<cert>                              # Client Certificate
-----BEGIN CERTIFICATE-----         # SAME FOR ALL SERVERS
... (client certificate) ...        # (unique per user)
-----END CERTIFICATE-----           #
</cert>                             #

<key>                               # Client Private Key
-----BEGIN RSA PRIVATE KEY-----     # SAME FOR ALL SERVERS
... (private key content) ...       # (unique per user)
-----END RSA PRIVATE KEY-----       #
</key>                              #
```

### What Changes When Switching Servers?

| Component | USA Server | Finland Server |
|-----------|------------|----------------|
| `remote` line | `remote 45.32.100.50 1194` | `remote 95.216.50.100 1194` |
| `<ca>` | Same | Same |
| `<cert>` | Same | Same |
| `<key>` | Same | Same |
| Everything else | Same | Same |

**Only the IP address changes!**

---

## Common Questions

### Q: Do I need a new certificate for each server?
**A:** No! One certificate works for ALL servers (as long as they use the same CA).

### Q: How often should I refresh the certificate?
**A:** Only when it expires (set to 1 year in our code) or when user logs out.

### Q: Can I use my certificate on someone else's VPN?
**A:** No! The VPN server must have the same CA installed.

### Q: What files do I need to copy from my OpenVPN server?
**A:** Only 2 files:
- `ca.crt` (CA certificate)
- `ca.key` (CA private key - keep this secret!)

### Q: Where are the CA files on my EC2 OpenVPN server?
**A:** Common locations:
```
/etc/openvpn/server/ca.crt
/etc/openvpn/server/ca.key
/etc/openvpn/easy-rsa/pki/ca.crt
/etc/openvpn/easy-rsa/pki/private/ca.key
```

Use this command to find them:
```bash
sudo find / -name "ca.crt" 2>/dev/null
sudo find / -name "ca.key" 2>/dev/null
```

---

## Quick Reference

### Complete Flow Diagram

```
+-----------------------------------------------------------------------+
|                                                                       |
|  [OpenVPN Server Setup]                                               |
|         |                                                             |
|         v                                                             |
|  +-------------+     +-------------+                                  |
|  |   ca.crt    |     |   ca.key    |  <-- Created during setup        |
|  +-------------+     +-------------+                                  |
|         |                   |                                         |
|         +--------+----------+                                         |
|                  |                                                    |
|                  v                                                    |
|         [Copy to Backend]                                             |
|                  |                                                    |
|                  v                                                    |
|  +-------------------------------+                                    |
|  |       Backend API             |                                    |
|  |                               |                                    |
|  |  POST /certificate            |                                    |
|  |  - Uses ca.crt + ca.key       |                                    |
|  |  - Creates client cert        |                                    |
|  |  - Returns cert + key         |                                    |
|  |                               |                                    |
|  |  GET /servers                 |                                    |
|  |  - Returns server list        |                                    |
|  +-------------------------------+                                    |
|                  |                                                    |
|                  v                                                    |
|  +-------------------------------+                                    |
|  |       Android App             |                                    |
|  |                               |                                    |
|  |  1. Call /certificate (once)  |                                    |
|  |  2. Save in local storage     |                                    |
|  |  3. Call /servers             |                                    |
|  |  4. User picks server         |                                    |
|  |  5. Build .ovpn config        |                                    |
|  |  6. Connect!                  |                                    |
|  +-------------------------------+                                    |
|                                                                       |
+-----------------------------------------------------------------------+
```

---

## Files in This Project

```
vpn-backend/
├── index.js              # Main API server
├── ca.crt                # CA certificate (from OpenVPN server)
├── ca.key                # CA private key (from OpenVPN server)
├── package.json          # Node.js dependencies
└── OPENVPN_SETUP_GUIDE.md  # This guide
```

---

## Need Help?

1. **Server not connecting?** Check if CA files match on server and backend
2. **Certificate rejected?** Make sure certificate is signed by correct CA
3. **Can't find CA files?** Use `sudo find / -name "ca.crt" 2>/dev/null`

---

*Document created for VPN App Development*
