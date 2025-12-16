const express = require('express');
const forge = require('node-forge');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Load CA credentials
// Option 1: From environment variables (production)
// Option 2: From files (development)
const caCertPem = process.env.CA_CERT || fs.readFileSync('./ca.crt', 'utf8');
const caKeyPem = process.env.CA_KEY || fs.readFileSync('./ca.key', 'utf8');

const caCert = forge.pki.certificateFromPem(caCertPem);
const caKey = forge.pki.privateKeyFromPem(caKeyPem);

// Generate client certificate
function generateClientCertificate(username) {
  // 1. Generate client key pair
  console.log(`Generating key pair for ${username}...`);
  const clientKeys = forge.pki.rsa.generateKeyPair(2048);

  // 2. Create certificate
  const clientCert = forge.pki.createCertificate();
  clientCert.publicKey = clientKeys.publicKey;
  clientCert.serialNumber = Date.now().toString();

  // 3. Set validity (1 year)
  clientCert.validity.notBefore = new Date();
  clientCert.validity.notAfter = new Date();
  clientCert.validity.notAfter.setFullYear(
    clientCert.validity.notBefore.getFullYear() + 1
  );

  // 4. Set subject (client info)
  clientCert.setSubject([
    {
      name: 'commonName',
      value: username,
    },
  ]);

  // 5. Set issuer (CA info)
  clientCert.setIssuer(caCert.subject.attributes);

  // 6. Add extensions
  clientCert.setExtensions([
    {
      name: 'basicConstraints',
      cA: false,
    },
    {
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true,
    },
    {
      name: 'extKeyUsage',
      clientAuth: true,
    },
  ]);

  // 7. Sign with CA private key
  console.log('Signing certificate with CA...');
  clientCert.sign(caKey, forge.md.sha256.create());

  // 8. Convert to PEM format
  const certPem = forge.pki.certificateToPem(clientCert);
  const keyPem = forge.pki.privateKeyToPem(clientKeys.privateKey);

  return { certificate: certPem, privateKey: keyPem };
}

// Endpoint to generate and return OpenVPN client certificate and private key
app.get('/certificate', (req, res) => {
  try {
    const username = req.query.username || `client_${Date.now()}`;

    console.log(`Generating certificate for: ${username}`);
    const { certificate, privateKey } = generateClientCertificate(username);

    res.json({
      success: true,
      username: username,
      certificate: certificate,
      privateKey: privateKey,
      caCertificate: caCertPem,
    });
  } catch (error) {
    console.error('Error generating certificate:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate certificate',
      message: error.message,
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`OpenVPN Certificate Server running on port ${PORT}`);
  console.log(`Get certificate: http://localhost:${PORT}/certificate`);
  console.log(
    `With username: http://localhost:${PORT}/certificate?username=myuser`
  );
});
