import forge from 'node-forge'

export function parseCertPem(pem) {
  const cert = forge.pki.certificateFromPem(pem)
  const now = new Date()
  const daysLeft = Math.floor((cert.validity.notAfter - now) / 86400000)
  const getField = (attrs, name) => attrs.find(a => a.name === name || a.shortName === name)?.value || ''
  return {
    commonName: getField(cert.subject.attributes, 'commonName'),
    org: getField(cert.subject.attributes, 'organizationName'),
    ou: getField(cert.subject.attributes, 'organizationalUnitName'),
    country: getField(cert.subject.attributes, 'countryName'),
    state: getField(cert.subject.attributes, 'stateOrProvinceName'),
    locality: getField(cert.subject.attributes, 'localityName'),
    issuerCN: getField(cert.issuer.attributes, 'commonName'),
    issuerOrg: getField(cert.issuer.attributes, 'organizationName'),
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    daysLeft,
    serial: cert.serialNumber,
    version: cert.version + 1,
    sigAlgo: cert.siginfo?.algorithmOid ? getSigAlgoName(cert.siginfo.algorithmOid) : 'SHA256withRSA',
    keyType: getKeyType(cert.publicKey),
    fingerprint: getCertFingerprint(pem),
    sans: getSANs(cert),
    keyUsage: getKeyUsage(cert),
    isSelfSigned: getField(cert.subject.attributes,'commonName') === getField(cert.issuer.attributes,'commonName'),
    isWildcard: getField(cert.subject.attributes,'commonName')?.startsWith('*.') || false,
    isCA: isCA(cert),
  }
}

export function getSigAlgoName(oid) {
  const map = {
    '1.2.840.113549.1.1.11': 'SHA256withRSA',
    '1.2.840.113549.1.1.12': 'SHA384withRSA',
    '1.2.840.113549.1.1.13': 'SHA512withRSA',
    '1.2.840.113549.1.1.5': 'SHA1withRSA',
    '1.2.840.10045.4.3.2': 'SHA256withECDSA',
    '1.2.840.10045.4.3.3': 'SHA384withECDSA',
  }
  return map[oid] || oid
}

export function getKeyType(pubKey) {
  if (!pubKey) return 'Unknown'
  if (pubKey.n) return `RSA-${pubKey.n.bitLength()}`
  if (pubKey.curve) return `EC-${pubKey.curve}`
  return 'Unknown'
}

export function getCertFingerprint(pem) {
  try {
    const cert = forge.pki.certificateFromPem(pem)
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
    const md = forge.md.sha256.create()
    md.update(der)
    return md.digest().toHex().match(/../g).join(':').toUpperCase()
  } catch { return 'N/A' }
}

export function getSANs(cert) {
  try {
    const ext = cert.extensions?.find(e => e.name === 'subjectAltName')
    return ext?.altNames?.map(n => n.value) || []
  } catch { return [] }
}

export function getKeyUsage(cert) {
  try {
    const ku = cert.extensions?.find(e => e.name === 'keyUsage')
    const eku = cert.extensions?.find(e => e.name === 'extKeyUsage')
    const uses = []
    if (eku?.serverAuth) uses.push('Server Auth')
    if (eku?.clientAuth) uses.push('Client Auth')
    if (eku?.codeSigning) uses.push('Code Signing')
    if (eku?.emailProtection) uses.push('Email')
    if (ku?.keyCertSign) uses.push('CA')
    return uses.length ? uses : ['General']
  } catch { return ['Unknown'] }
}

export function isCA(cert) {
  try {
    const bc = cert.extensions?.find(e => e.name === 'basicConstraints')
    return bc?.cA === true
  } catch { return false }
}

export function scoreAndRisk(certInfos) {
  if (!certInfos || certInfos.length === 0) return { score: 0, risk: 'CRITICAL', findings: [] }
  const leaf = certInfos[0]
  let score = 100
  const findings = []

  if (leaf.daysLeft < 0) {
    score -= 60
    findings.push({ type: 'bad', title: 'Certificate expired', why: `Expired ${Math.abs(leaf.daysLeft)} days ago.`, impact: 'All TLS connections will fail. Services are broken.', fix: `Renew immediately:\nopenssl req -new -key server.key -out server.csr\n# Submit CSR to your CA` })
  } else if (leaf.daysLeft <= 7) {
    score -= 50
    findings.push({ type: 'bad', title: `Expires in ${leaf.daysLeft} days — CRITICAL`, why: 'Less than 7 days remaining.', impact: 'Imminent service failure.', fix: `Start renewal immediately:\nopenssl x509 -noout -enddate -in cert.pem` })
  } else if (leaf.daysLeft <= 30) {
    score -= 30
    findings.push({ type: 'warn', title: `Expires in ${leaf.daysLeft} days — HIGH`, why: 'Less than 30 days remaining.', impact: 'Certificate expires soon.', fix: `Schedule renewal this week:\nopenssl x509 -noout -enddate -in cert.pem` })
  } else if (leaf.daysLeft <= 90) {
    score -= 10
    findings.push({ type: 'warn', title: `Expires in ${leaf.daysLeft} days — MEDIUM`, why: 'Less than 90 days remaining.', impact: 'Plan renewal soon.', fix: `Monitor expiry:\nopenssl x509 -noout -dates -in cert.pem` })
  } else {
    findings.push({ type: 'ok', title: `Valid for ${leaf.daysLeft} days`, why: 'Certificate has adequate validity.', impact: 'No action needed.', fix: '' })
  }

  if (leaf.sigAlgo?.includes('SHA1') || leaf.sigAlgo?.includes('sha1')) {
    score -= 30
    findings.push({ type: 'bad', title: 'Weak signature algorithm: SHA-1', why: 'SHA-1 is cryptographically broken.', impact: 'Modern browsers reject SHA-1 certificates.', fix: 'Reissue with SHA-256:\nopenssl req -new -sha256 -key server.key -out server.csr' })
  } else {
    findings.push({ type: 'ok', title: `Strong signature: ${leaf.sigAlgo || 'SHA-256'}`, why: 'Using a modern, secure hash algorithm.', impact: '', fix: '' })
  }

  if (leaf.keyType?.startsWith('RSA-')) {
    const bits = parseInt(leaf.keyType.split('-')[1])
    if (bits < 2048) {
      score -= 40
      findings.push({ type: 'bad', title: `Weak key size: ${leaf.keyType}`, why: `RSA keys under 2048 bits are insecure.`, impact: 'Key can be factored. Certificate revoked by modern CAs.', fix: 'Generate a new 2048-bit or 4096-bit key:\nopenssl genrsa -out server.key 2048' })
    } else {
      findings.push({ type: 'ok', title: `Strong key: ${leaf.keyType}`, why: 'Key size meets current security standards.', impact: '', fix: '' })
    }
  }

  if (leaf.isSelfSigned) {
    score -= 20
    findings.push({ type: 'warn', title: 'Self-signed certificate', why: 'Certificate is not issued by a trusted CA.', impact: 'Browsers and Java apps will reject this certificate unless explicitly trusted.', fix: `Add to Java truststore:\nkeytool -importcert -alias myca -file cert.pem -keystore cacerts` })
  }

  if (leaf.isWildcard) {
    findings.push({ type: 'info', title: 'Wildcard certificate detected', why: `CN is ${leaf.commonName}. Wildcard covers all subdomains.`, impact: 'Larger blast radius if key is compromised. Consider using SAN certificates for production.', fix: '' })
  }

  if (leaf.sans?.length > 0) {
    findings.push({ type: 'ok', title: `${leaf.sans.length} Subject Alternative Name(s)`, why: `SANs: ${leaf.sans.slice(0, 3).join(', ')}${leaf.sans.length > 3 ? '...' : ''}`, impact: '', fix: '' })
  }

  const chainDepth = certInfos.length
  if (chainDepth >= 2) {
    findings.push({ type: 'ok', title: `Trust chain depth: ${chainDepth}`, why: 'Full chain present from leaf to root.', impact: '', fix: '' })
  } else {
    score -= 15
    findings.push({ type: 'warn', title: 'Incomplete chain — missing intermediate', why: 'Only the leaf certificate is present.', impact: 'PKIX path building failed errors in Java. Some clients will reject this.', fix: `Download and bundle intermediate:\ncat leaf.pem intermediate.pem > bundle.pem\n# Or fetch via AIA:\nopenssl x509 -text -in cert.pem | grep "CA Issuers"` })
  }

  score = Math.max(0, Math.min(100, score))
  const risk = score >= 90 ? 'SECURE' : score >= 80 ? 'LOW' : score >= 56 ? 'MEDIUM' : score >= 31 ? 'HIGH' : 'CRITICAL'
  return { score, risk, findings }
}

export function parsePemBundle(pem) {
  const regex = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g
  const matches = pem.match(regex) || []
  return matches.map(p => { try { return parseCertPem(p) } catch { return null } }).filter(Boolean)
}

export function certModulus(pem, type = 'cert') {
  try {
    if (type === 'cert') {
      const cert = forge.pki.certificateFromPem(pem)
      return cert.publicKey.n?.toString(16)
    } else {
      const key = forge.pki.privateKeyFromPem(pem)
      return key.n?.toString(16)
    }
  } catch { return null }
}

export async function generateCSR({ cn, o, ou, l, st, c, email, san, keySize, hash }) {
  const keys = await new Promise((resolve, reject) => {
    forge.pki.rsa.generateKeyPair({ bits: parseInt(keySize || 2048), e: 0x10001, workers: 2 }, (err, keypair) => {
      if (err) reject(err)
      else resolve(keypair)
    })
  })
  const csr = forge.pki.createCertificationRequest()
  csr.publicKey = keys.publicKey
  const attrs = [{ name: 'commonName', value: cn }]
  if (o) attrs.push({ name: 'organizationName', value: o })
  if (ou) attrs.push({ name: 'organizationalUnitName', value: ou })
  if (l) attrs.push({ name: 'localityName', value: l })
  if (st) attrs.push({ name: 'stateOrProvinceName', value: st })
  if (c) attrs.push({ name: 'countryName', value: c })
  if (email) attrs.push({ name: 'emailAddress', value: email })
  csr.setSubject(attrs)
  const sanList = (san || '').split(',').map(s => s.trim()).filter(Boolean)
  const allSans = [cn, ...sanList].filter(Boolean)
  if (allSans.length) {
    csr.setAttributes([{ name: 'extensionRequest', extensions: [{ name: 'subjectAltName', altNames: allSans.map(v => ({ type: 2, value: v })) }] }])
  }
  const mdMap = { SHA256: forge.md.sha256, SHA384: forge.md.sha384, SHA512: forge.md.sha512 }
  csr.sign(keys.privateKey, (mdMap[hash] || forge.md.sha256).create())
  return { csr: forge.pki.certificationRequestToPem(csr), key: forge.pki.privateKeyToPem(keys.privateKey) }
}

export function decodeCSR(pem) {
  const csr = forge.pki.certificationRequestFromPem(pem.trim())
  if (!csr.verify()) throw new Error('CSR signature invalid')
  const getField = (attrs, name) => attrs.find(a => a.name === name || a.shortName === name)?.value || ''
  const exts = (csr.getAttribute({ name: 'extensionRequest' }) || {}).extensions || []
  const sans = []
  exts.forEach(ext => { if (ext.name === 'subjectAltName') ext.altNames?.forEach(n => sans.push(n.value)) })
  return {
    cn: getField(csr.subject.attributes, 'commonName'),
    o: getField(csr.subject.attributes, 'organizationName'),
    ou: getField(csr.subject.attributes, 'organizationalUnitName'),
    l: getField(csr.subject.attributes, 'localityName'),
    st: getField(csr.subject.attributes, 'stateOrProvinceName'),
    c: getField(csr.subject.attributes, 'countryName'),
    email: getField(csr.subject.attributes, 'emailAddress'),
    sans,
    keyType: getKeyType(csr.publicKey),
    sigAlgo: 'SHA256withRSA',
  }
}

export function makePFX(certPem, keyPem, chainPem, password) {
  const certificate = forge.pki.certificateFromPem(certPem)
  const privateKey = forge.pki.privateKeyFromPem(keyPem)
  const certs = [certificate]
  if (chainPem?.trim()) {
    chainPem.trim().split(/(?=-----BEGIN CERTIFICATE-----)/).filter(Boolean).forEach(p => {
      try { certs.push(forge.pki.certificateFromPem(p)) } catch {}
    })
  }
  const p12 = forge.pkcs12.toPkcs12Asn1(privateKey, certs, password || '', { algorithm: '3des', friendlyName: certificate.subject.getField('CN')?.value || 'cert' })
  const der = forge.asn1.toDer(p12).getBytes()
  const bytes = new Uint8Array(der.length)
  for (let i = 0; i < der.length; i++) bytes[i] = der.charCodeAt(i)
  return bytes
}

export function makeDER(certPem) {
  const cert = forge.pki.certificateFromPem(certPem)
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  const bytes = new Uint8Array(der.length)
  for (let i = 0; i < der.length; i++) bytes[i] = der.charCodeAt(i)
  return bytes
}

export function pemToBase64(certPem) {
  return certPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\n|\r/g, '')
}

export function downloadBytes(bytes, name, mime = 'application/octet-stream') {
  const blob = new Blob([bytes], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

export function downloadText(text, name) {
  const a = document.createElement('a')
  a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text)
  a.download = name; a.click()
}

export async function dnsLookup(domain, type) {
  const typeMap = { CNAME: 5, TXT: 16, CAA: 257, A: 1, MX: 15, AAAA: 28 }
  const code = typeMap[type] || 1
  const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${code}`)
  const data = await res.json()
  return { status: data.Status, records: (data.Answer || []).map(r => ({ name: r.name, ttl: r.TTL, data: r.data, type: r.type })) }
}

export async function tlsScan(domain) {
  const clean = domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0]
  const port = domain.includes(':') ? domain.split(':').pop() : '443'
  const res = await dnsLookup(clean, 'A')
  if (res.status !== 0 || res.records.length === 0) throw new Error(`Could not resolve ${clean}`)
  const certRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(clean)}&type=1`)
  const certData = await certRes.json()
  if (certData.Status !== 0) throw new Error('DNS lookup failed')
  return { domain: clean, port, ip: certData.Answer?.[0]?.data || 'unknown' }
}

export function compareCerts(a, b) {
  if (!a || !b) return []
  const fields = [
    ['Common Name', a.commonName, b.commonName],
    ['Organisation', a.org, b.org],
    ['Org Unit', a.ou, b.ou],
    ['Issuer', a.issuerCN, b.issuerCN],
    ['Issuer Org', a.issuerOrg, b.issuerOrg],
    ['SANs', (a.sans||[]).join(', '), (b.sans||[]).join(', ')],
    ['Valid From', a.notBefore?.toLocaleDateString(), b.notBefore?.toLocaleDateString()],
    ['Valid To', a.notAfter?.toLocaleDateString(), b.notAfter?.toLocaleDateString()],
    ['Days Left', String(a.daysLeft), String(b.daysLeft)],
    ['Serial', a.serial, b.serial],
    ['Key Type', a.keyType, b.keyType],
    ['Signature Algorithm', a.sigAlgo, b.sigAlgo],
    ['Fingerprint (SHA-256)', a.fingerprint, b.fingerprint],
    ['X.509 Version', String(a.version), String(b.version)],
  ]
  return fields.map(([field, va, vb]) => ({ field, a: va||'—', b: vb||'—', changed: (va||'') !== (vb||'') }))
}
