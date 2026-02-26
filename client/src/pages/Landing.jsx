import React from 'react';
import { useAuth, SignInButton, SignUpButton, useUser } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';
import { BookOpen, Sparkles, Target, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import axios from 'axios';
import '../styles/Landing.css';
import ThemeToggle from '../components/ThemeToggle';

const Landing = () => {
    const { isSignedIn } = useAuth();
    const { user } = useUser();
    const [redirectTarget, setRedirectTarget] = useState(null);

    useEffect(() => {
        if (!isSignedIn || !user) return;
        // Check if user has set up subjects
        const checkUser = async () => {
            try {
                const { data } = await axios.post('http://localhost:5001/api/users/sync', {
                    clerkId: user.id,
                    email: user.primaryEmailAddress?.emailAddress,
                });
                setRedirectTarget(data.hasSubjects ? '/dashboard' : '/setup');
            } catch {
                // Default redirect if API not available
                setRedirectTarget('/dashboard');
            }
        };
        checkUser();
    }, [isSignedIn, user]);

    if (redirectTarget) return <Navigate to={redirectTarget} replace />;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>
            <nav className="navbar">
                <div className="logo">
                    <BookOpen className="logo-icon" />
                    <span>AskMyNotes</span>
                </div>
                <div className="nav-links">
                    <ThemeToggle />
                    <SignInButton mode="modal">
                        <button className="btn-secondary">Sign In</button>
                    </SignInButton>
                    <SignUpButton mode="modal">
                        <button className="btn-primary">Get Started</button>
                    </SignUpButton>
                </div>
            </nav>

            <main className="hero">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    className="hero-content"
                >
                    <div className="badge">
                        <Sparkles size={14} />
                        <span>Powered by Gemini AI</span>
                    </div>
                    <h1>Your AI-Powered <span className="gradient-text">Study Copilot</span></h1>
                    <p>
                        Upload your notes, ask questions, and generate practice tests — all
                        grounded strictly in <em>your</em> uploaded material. No hallucinations.
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <SignUpButton mode="modal">
                            <button className="btn-primary btn-large">
                                Start for Free <ArrowRight size={18} />
                            </button>
                        </SignUpButton>
                        <SignInButton mode="modal">
                            <button className="btn-secondary btn-large">Already have an account?</button>
                        </SignInButton>
                    </div>
                </motion.div>

                {/* Glowing orbs */}
                <div style={{
                    position: 'absolute', top: '20%', left: '10%',
                    width: 400, height: 400, borderRadius: '50%',
                    background: 'rgba(99,102,241,0.08)', filter: 'blur(80px)', pointerEvents: 'none'
                }} />
                <div style={{
                    position: 'absolute', bottom: '10%', right: '10%',
                    width: 300, height: 300, borderRadius: '50%',
                    background: 'rgba(168,85,247,0.08)', filter: 'blur(60px)', pointerEvents: 'none'
                }} />
            </main>

            <section className="features">
                {[
                    { icon: <Target size={28} />, title: '3-Subject Focus', desc: 'Organise exactly 3 subjects per term and keep your notes laser-focused.' },
                    { icon: <Sparkles size={28} />, title: 'Grounded Q&A', desc: 'Ask anything — answers cite your notes with High/Medium/Low confidence.' },
                    { icon: <BookOpen size={28} />, title: 'Study Mode', desc: 'Auto-generate 5 MCQs and 3 short-answer tasks from your uploaded files.' },
                ].map((f, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + i * 0.15 }}
                        className="feature-card"
                    >
                        <div className="feature-icon">{f.icon}</div>
                        <h3>{f.title}</h3>
                        <p>{f.desc}</p>
                    </motion.div>
                ))}
            </section>
        </div>
    );
};

export default Landing;
