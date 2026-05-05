import { Routes, Route } from 'react-router-dom'
import { useState } from 'react'
import { AuthProvider } from './hooks/useAuth'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Copilot from './components/Copilot'
import Home from './pages/Home'
import DecodeCSR from './pages/DecodeCSR'
import { CertMatcher, CertConversion, DNSChecker } from './pages/Tools'
import Compare from './pages/Compare'
import RenewWizard from './pages/Renew'
import Monitor from './pages/Monitor'
import { APIKeys, Docs } from './pages/APIAndDocs'

function NotFound() {
  return (
    <div className="content-wrap" style={{ textAlign: 'center', padding: '80px 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Page not found</div>
      <a href="/" className="btn btn-primary">← Back to Scanner</a>
    </div>
  )
}

export default function App() {
  const [scanContext, setScanContext] = useState(null)
  return (
    <AuthProvider>
      <div className="app-shell">
        <Navbar />
        <main className="page">
          <Routes>
            <Route path="/" element={<Home setScanContext={setScanContext} />} />
            <Route path="/decode" element={<DecodeCSR />} />
            <Route path="/match" element={<CertMatcher />} />
            <Route path="/convert" element={<CertConversion />} />
            <Route path="/dns" element={<DNSChecker />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/renew" element={<RenewWizard />} />
            <Route path="/monitor" element={<Monitor />} />
            <Route path="/api-keys" element={<APIKeys />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <Footer />
        <Copilot scanContext={scanContext} />
      </div>
    </AuthProvider>
  )
}
