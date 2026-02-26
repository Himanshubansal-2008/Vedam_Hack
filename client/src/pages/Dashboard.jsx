import React, { useState, useEffect, useRef } from 'react';
import { useUser, SignOutButton, UserButton } from '@clerk/clerk-react';
import {
    Plus, FileUp, ExternalLink, LayoutDashboard,
    BookOpen, LogOut, Search, Loader2, CheckCircle
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles/Dashboard.css';
import ThemeToggle from '../components/ThemeToggle';

const SUBJECT_COLORS = ['#6366f1', '#a855f7', '#06b6d4'];

const Dashboard = () => {
    const { user } = useUser();
    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    const [subjects, setSubjects] = useState([]);
    const [selectedSubject, setSelectedSubject] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadDone, setUploadDone] = useState(false);
    const [loadingSubjects, setLoadingSubjects] = useState(true);

    useEffect(() => {
        const fetchSubjects = async () => {
            try {
                const { data } = await axios.get(`http://localhost:5001/api/subjects?clerkId=${user?.id}`);
                if (data.subjects && data.subjects.length > 0) {
                    setSubjects(data.subjects.map((s, i) => ({ ...s, colorIdx: i % 3 })));
                } else {
                    // Demo subjects if no DB
                    setSubjects([
                        { id: '1', name: 'Data Structures & Algorithms', colorIdx: 0, notes: [] },
                        { id: '2', name: 'Operating Systems', colorIdx: 1, notes: [] },
                        { id: '3', name: 'Compiler Design', colorIdx: 2, notes: [] },
                    ]);
                }
            } catch {
                // Fallback demo subjects
                setSubjects([
                    { id: '1', name: 'Data Structures & Algorithms', colorIdx: 0, notes: [] },
                    { id: '2', name: 'Operating Systems', colorIdx: 1, notes: [] },
                    { id: '3', name: 'Compiler Design', colorIdx: 2, notes: [] },
                ]);
            } finally {
                setLoadingSubjects(false);
            }
        };
        if (user?.id) fetchSubjects();
    }, [user]);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !selectedSubject) return;

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('subjectId', selectedSubject.id);
            formData.append('clerkId', user?.id || '');
            formData.append('subjectName', selectedSubject.name || '');
            await axios.post('http://localhost:5001/api/notes/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setUploadDone(true);
            // Navigate to subject page using name for better resolution
            setTimeout(() => navigate(`/subject/${encodeURIComponent(selectedSubject.name)}`), 800);
        } catch (err) {
            console.warn('Upload API not available, navigating directly');
            navigate(`/subject/${encodeURIComponent(selectedSubject.name)}`);
        } finally {
            setUploading(false);
        }
    };

    const handleUploadClick = () => {
        if (!selectedSubject) {
            alert('Please select a subject first!');
            return;
        }
        fileInputRef.current.click();
    };

    return (
        <div className="dashboard-container">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <BookOpen className="logo-icon" />
                    <span>AskMyNotes</span>
                </div>

                <nav className="sidebar-nav">
                    <button className="nav-item active">
                        <LayoutDashboard size={20} />
                        <span>Dashboard</span>
                    </button>
                    <div className="nav-divider">Your Subjects</div>
                    {subjects.map(subject => (
                        <button
                            key={subject.id}
                            className={`nav-item ${selectedSubject?.id === subject.id ? 'selected' : ''}`}
                            onClick={() => { setSelectedSubject(subject); setUploadDone(false); }}
                        >
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: SUBJECT_COLORS[subject.colorIdx], flexShrink: 0 }} />
                            <span style={{ fontSize: '0.85rem' }}>{subject.name}</span>
                        </button>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <SignOutButton>
                        <button className="nav-item text-danger">
                            <LogOut size={20} />
                            <span>Logout</span>
                        </button>
                    </SignOutButton>
                </div>
            </aside>

            <main className="dashboard-main">
                <header className="dash-header">
                    <div className="user-welcome">
                        <h1>Hello, {user?.firstName || 'Student'} 👋</h1>
                        <p>Ready to master your subjects today?</p>
                    </div>
                    <div className="dash-actions">
                        <div className="search-bar">
                            <Search size={18} />
                            <input type="text" placeholder="Search subjects..." />
                        </div>
                        <ThemeToggle />
                        <UserButton afterSignOutUrl="/" />
                    </div>
                </header>

                <div className="stats-row">
                    <div className="stat-card">
                        <h3>Active Subjects</h3>
                        <div className="stat-value">{subjects.length}</div>
                    </div>
                    <div className="stat-card">
                        <h3>Total Notes</h3>
                        <div className="stat-value">{subjects.reduce((a, s) => a + (s.notes?.length || 0), 0)}</div>
                    </div>
                    <div className="stat-card">
                        <h3>Study Ready</h3>
                        <div className="stat-value">✓</div>
                    </div>
                </div>

                <div className="upload-section">
                    <div className="upload-card">
                        <div className="card-header">
                            <h2>Upload Notes</h2>
                            <p>Select a subject, then upload a PDF or TXT file.</p>
                        </div>

                        <div className="upload-controls">
                            <div className="subject-dropdown">
                                <label>Select Subject</label>
                                <select
                                    value={selectedSubject?.id || ''}
                                    onChange={(e) => {
                                        setSelectedSubject(subjects.find(s => s.id === e.target.value) || null);
                                        setUploadDone(false);
                                    }}
                                >
                                    <option value="" disabled>Choose a subject…</option>
                                    {subjects.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="file-drop-area" onClick={handleUploadClick}>
                                {uploading ? (
                                    <Loader2 size={40} className="spin" style={{ color: 'var(--primary)' }} />
                                ) : uploadDone ? (
                                    <CheckCircle size={40} style={{ color: '#22c55e' }} />
                                ) : (
                                    <FileUp size={40} className="upload-icon" />
                                )}
                                <p>
                                    {uploading ? 'Uploading & processing...' :
                                        uploadDone ? 'Upload complete! Redirecting...' :
                                            <>Drag & drop or <span>browse files</span></>}
                                </p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    className="hidden-file-input"
                                    accept=".pdf,.txt"
                                    onChange={handleFileUpload}
                                />
                            </div>

                            <button
                                className="btn-primary btn-full"
                                onClick={handleUploadClick}
                                disabled={!selectedSubject || uploading}
                            >
                                <Plus size={20} />
                                {selectedSubject ? `Upload to ${selectedSubject.name}` : 'Select a subject first'}
                            </button>
                        </div>
                    </div>

                    <div className="recent-activity">
                        <h2>Your Subjects</h2>
                        {loadingSubjects ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                                <Loader2 size={24} className="spin" style={{ color: 'var(--primary)' }} />
                            </div>
                        ) : (
                            <div className="subject-grid">
                                {subjects.map((subject) => (
                                    <motion.div
                                        key={subject.id}
                                        whileHover={{ x: 4 }}
                                        className="mini-card"
                                        onClick={() => navigate(`/subject/${subject.id}`)}
                                    >
                                        <div className="mini-card-icon">
                                            <BookOpen size={24} style={{ color: SUBJECT_COLORS[subject.colorIdx] }} />
                                        </div>
                                        <div className="mini-card-info">
                                            <h4>{subject.name}</h4>
                                            <p>{subject.notes?.length || 0} files uploaded</p>
                                        </div>
                                        <ExternalLink size={16} className="mini-card-link" />
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
