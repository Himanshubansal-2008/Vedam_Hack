import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { ClerkProvider, SignedIn, SignedOut } from '@clerk/clerk-react'
import Landing from './pages/Landing'
import SubjectSetup from './pages/SubjectSetup'
import Dashboard from './pages/Dashboard'
import SubjectPage from './pages/SubjectPage'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

function App() {
    if (!CLERK_PUBLISHABLE_KEY) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'white', background: '#020617', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
                <h1>⚠️ Configuration Required</h1>
                <p>Please add <code>VITE_CLERK_PUBLISHABLE_KEY</code> to <code>client/.env</code></p>
                <p style={{ color: '#94a3b8' }}>Get your key from <a href="https://dashboard.clerk.com" style={{ color: '#6366f1' }}>dashboard.clerk.com</a></p>
            </div>
        )
    }

    return (
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
            <Router>
                <Routes>
                    {}
                    <Route path="/" element={<Landing />} />

                    {}
                    <Route path="/setup" element={
                        <SignedIn>
                            <SubjectSetup />
                        </SignedIn>
                    } />
                    <Route path="/dashboard" element={
                        <SignedIn>
                            <Dashboard />
                        </SignedIn>
                    } />
                    <Route path="/subject/:subjectId" element={
                        <SignedIn>
                            <SubjectPage />
                        </SignedIn>
                    } />

                    {}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Router>
        </ClerkProvider>
    )
}

export default App
