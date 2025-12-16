const forge = require('node-forge');
const fs = require('fs');

console.log('🔐 Generating Demo CA Certificate and Key...\n');

// 1. Generate CA key pair
console.log('Step 1: Generating 2048-bit RSA key pair...');
const caKeys = forge.pki.rsa.generateKeyPair(2048);

// 2. Create CA certificate
console.log('Step 2: Creating CA certificate...');
const caCert = forge.pki.createCertificate();

caCert.publicKey = caKeys.publicKey;
caCert.serialNumber = '01';

// Valid for 10 years
caCert.validity.notBefore = new Date();
caCert.validity.notAfter = new Date();
caCert.validity.notAfter.setFullYear(caCert.validity.notBefore.getFullYear() + 10);

// CA Subject (you can change these)
const caAttrs = [
  { name: 'commonName', value: 'Demo VPN CA' },
  { name: 'countryName', value: 'IN' },
  { name: 'organizationName', value: 'Demo Organization' },
];

caCert.setSubject(caAttrs);
caCert.setIssuer(caAttrs); // Self-signed, so issuer = subject

// CA Extensions
caCert.setExtensions([
  {
    name: 'basicConstraints',
    cA: true,
    critical: true,
  },
  {
    name: 'keyUsage',
    keyCertSign: true,
    cRLSign: true,
    critical: true,
  },
  {
    name: 'subjectKeyIdentifier',
  },
]);

// 3. Self-sign the CA certificate
console.log('Step 3: Self-signing the CA certificate...');
caCert.sign(caKeys.privateKey, forge.md.sha256.create());

// 4. Convert to PEM format
const caCertPem = forge.pki.certificateToPem(caCert);
const caKeyPem = forge.pki.privateKeyToPem(caKeys.privateKey);

// 5. Save to files
console.log('Step 4: Saving files...\n');

fs.writeFileSync('demo-ca.crt', caCertPem);
fs.writeFileSync('demo-ca.key', caKeyPem);

console.log('✅ Files created:');
console.log('   📄 demo-ca.crt (CA Certificate)');
console.log('   🔑 demo-ca.key (CA Private Key)\n');

console.log('='.repeat(50));
console.log('CA CERTIFICATE (demo-ca.crt):');
console.log('='.repeat(50));
console.log(caCertPem);

console.log('='.repeat(50));
console.log('CA PRIVATE KEY (demo-ca.key):');
console.log('='.repeat(50));
console.log(caKeyPem);

console.log('\n📝 Next steps:');
console.log('1. Update index.js to use these files:');
console.log("   const caCertPem = fs.readFileSync('./demo-ca.crt', 'utf8');");
console.log("   const caKeyPem = fs.readFileSync('./demo-ca.key', 'utf8');");
console.log('2. Run: node index.js');
console.log('3. Test: curl http://localhost:3000/certificate');
