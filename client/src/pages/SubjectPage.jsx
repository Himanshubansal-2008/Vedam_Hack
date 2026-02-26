import React, { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useUser, UserButton } from '@clerk/clerk-react';
import {
    ArrowLeft, FileUp, Send, BookOpen, Sparkles,
    CheckCircle, AlertCircle, FileText, Loader2,
    BookMarked, ChevronRight, RotateCcw, PanelLeftClose,
    PanelRightClose, X, Maximize2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import '../styles/SubjectPage.css';
import ThemeToggle from '../components/ThemeToggle';

const SUBJECT_COLORS = {
    0: { bg: '#1e1b4b', accent: '#6366f1', light: 'rgba(99,102,241,0.15)' },
    1: { bg: '#1a1030', accent: '#a855f7', light: 'rgba(168,85,247,0.15)' },
    2: { bg: '#0d1f2d', accent: '#06b6d4', light: 'rgba(6,182,212,0.15)' },
};

const SubjectPage = () => {
    const { subjectId } = useParams();
    const { user } = useUser();

    const [subject, setSubject] = useState(null);
    const [notes, setNotes] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadDone, setUploadDone] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'study'
    const [studyTasks, setStudyTasks] = useState(null);
    const [generatingTasks, setGeneratingTasks] = useState(false);
    const [realSubjectId, setRealSubjectId] = useState(null); // DB UUID after first upload
    const [showFileSidebar, setShowFileSidebar] = useState(false);
    const [previewNote, setPreviewNote] = useState(null);
    const fileInputRef = useRef(null);
    const chatEndRef = useRef(null);

    // Load subject and history from API
    useEffect(() => {
        const fetchSubjectAndHistory = async () => {
            try {
                // Fetch subject details
                const { data: subData } = await axios.get(`http://localhost:5001/api/subjects?clerkId=${user?.id}`);
                const decodedId = decodeURIComponent(subjectId);
                const found = subData.subjects?.find(s => s.id === subjectId || s.name === decodedId);

                if (found) {
                    const idx = subData.subjects.indexOf(found);
                    setSubject({ ...found, colorIdx: idx % 3 });
                    setNotes(found.notes || []);

                    // Fetch chat history for this specific subject
                    const { data: histData } = await axios.get(`http://localhost:5001/api/ai/history?clerkId=${user?.id}&subjectName=${found.name}`);
                    if (histData.history) {
                        setMessages(histData.history.map(msg => ({
                            role: msg.role,
                            content: msg.content
                        })));
                    }
                } else {
                    // Fallback demo data logic (same as before)
                    const fallback = [
                        { id: '1', name: 'Data Structures & Algorithms', colorIdx: 0 },
                        { id: '2', name: 'Operating Systems', colorIdx: 1 },
                        { id: '3', name: 'Compiler Design', colorIdx: 2 },
                    ];
                    const f = fallback.find(s => s.id === subjectId);
                    if (f) {
                        setSubject(f);
                        // Try fetching history for demo subjects too
                        const { data: h } = await axios.get(`http://localhost:5001/api/ai/history?clerkId=${user?.id}&subjectName=${f.name}`);
                        if (h.history && h.history.length > 0) {
                            setMessages(h.history.map(m => ({ role: m.role, content: m.content })));
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to load subject/history:", err);
            }
        };
        if (user?.id) fetchSubjectAndHistory();
    }, [subjectId, user]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const accentColor = SUBJECT_COLORS[subject?.colorIdx ?? 0].accent;
    const lightColor = SUBJECT_COLORS[subject?.colorIdx ?? 0].light;

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            // Send clerkId + subjectName so backend can upsert user/subject
            formData.append('clerkId', user?.id || '');
            formData.append('subjectName', subject?.name || '');
            const { data } = await axios.post('http://localhost:5001/api/notes/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            // Store the real DB subjectId for AI calls
            if (data.subjectId) setRealSubjectId(data.subjectId);

            // Add full note object from backend to local state
            if (data.note) {
                setNotes(prev => [data.note, ...prev]);
            } else {
                setNotes(prev => [...prev, { name: file.name, size: file.size }]);
            }

            setMessages([{
                role: 'assistant',
                content: `📄 I've processed **${file.name}** for **${subject?.name}**. You can now ask me anything from this material!`,
            }]);
        } catch (err) {
            console.error('Upload error:', err?.response?.data || err.message);
            setNotes(prev => [...prev, { name: file.name, size: file.size }]);
            setMessages([{
                role: 'assistant',
                content: `⚠️ Upload failed: ${err?.response?.data?.error || 'Server unreachable'}. Make sure the server is running on port 5001.`,
            }]);
        } finally {
            setUploading(false);
            setUploadDone(true);
            e.target.value = '';
        }
    };

    const sendMessage = async () => {
        if (!input.trim() || loading) return;
        const userMsg = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const { data } = await axios.post('http://localhost:5001/api/ai/ask', {
                question: input,
                subjectId: realSubjectId || subjectId,
                clerkId: user?.id,
                subjectName: subject?.name,
            });
            setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
        } catch (err) {
            const msg = err?.response?.data?.error || 'Server unreachable — ensure the backend is running on port 5001.';
            setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${msg}` }]);
        } finally {
            setLoading(false);
        }
    };

    const generateStudyTasks = async () => {
        setGeneratingTasks(true);
        setActiveTab('study');
        try {
            const { data } = await axios.post('http://localhost:5001/api/ai/study-tasks', {
                subjectId: realSubjectId || subjectId,
                clerkId: user?.id,
                subjectName: subject?.name,
            });
            setStudyTasks(data);
        } catch {
            // Mock study tasks for demo
            setStudyTasks({
                mcqs: [
                    { q: 'What is the time complexity of binary search?', options: ['O(n)', 'O(log n)', 'O(n²)', 'O(1)'], answer: 1 },
                    { q: 'Which data structure uses LIFO ordering?', options: ['Queue', 'Stack', 'Heap', 'Graph'], answer: 1 },
                    { q: 'What does BFS stand for?', options: ['Binary First Search', 'Breadth First Search', 'Back First Search', 'Balanced First Search'], answer: 1 },
                    { q: 'Which sorting algorithm has the best average case?', options: ['Bubble Sort', 'Selection Sort', 'Merge Sort', 'Insertion Sort'], answer: 2 },
                    { q: 'What is a linked list?', options: ['Array-based structure', 'Node-pointer-based structure', 'Hash structure', 'Tree structure'], answer: 1 },
                ],
                shortAnswers: [
                    { q: 'Explain the difference between BFS and DFS.', model: 'BFS uses a queue and explores level-by-level, while DFS uses a stack (or recursion) and explores as deep as possible before backtracking.' },
                    { q: 'What is dynamic programming?', model: 'A technique that solves complex problems by breaking them into overlapping subproblems, storing results to avoid recomputation.' },
                    { q: 'Describe the concept of a hash collision and how it is handled.', model: 'A hash collision occurs when two keys hash to the same index. Common solutions are chaining (linked lists at each slot) and open addressing (probing for next open slot).' },
                ]
            });
        } finally {
            setGeneratingTasks(false);
        }
    };

    if (!subject) {
        return (
            <div className="loading-screen">
                <Loader2 className="spin" size={40} />
                <p>Loading subject...</p>
            </div>
        );
    }

    return (
        <div className="subject-page" style={{ '--accent': accentColor, '--light': lightColor }}>
            {/* Header */}
            <header className="subject-header">
                <div>
                    <Link to="/dashboard" className="back-btn">
                        <ArrowLeft size={18} /> Dashboard
                    </Link>
                </div>

                <div className="subject-title-row">
                    <BookMarked size={22} style={{ color: accentColor }} />
                    <h1>{subject.name}</h1>
                </div>

                <div className="subject-actions-row">
                    <ThemeToggle />
                    <UserButton afterSignOutUrl="/" />
                    <button
                        className="tab-btn"
                        style={{ border: showFileSidebar ? '1px solid var(--accent)' : '1px solid transparent' }}
                        onClick={() => setShowFileSidebar(!showFileSidebar)}
                    >
                        {showFileSidebar ? <PanelRightClose size={18} /> : <FileText size={18} />}
                        Files
                    </button>
                    <button
                        className="tab-btn"
                        style={activeTab === 'chat' ? { background: 'rgba(255,255,255,0.08)', color: 'white', borderColor: 'var(--glass-border)' } : {}}
                        onClick={() => setActiveTab('chat')}
                    >
                        Chat
                    </button>
                    <button
                        className="tab-btn"
                        style={activeTab === 'study' ? { background: 'rgba(255,255,255,0.08)', color: 'white', borderColor: 'var(--glass-border)' } : {}}
                        onClick={() => setActiveTab('study')}
                    >
                        Study Mode
                    </button>
                </div>
            </header>

            <div className="subject-body">
                {/* Left Sidebar: Chat History / Sessions */}
                <aside className="chat-history-sidebar">
                    <div className="sidebar-header-sm">
                        <RotateCcw size={14} />
                        <span>Chat History</span>
                    </div>

                    <div className="history-list">
                        <button className="history-item active">
                            <Sparkles size={16} />
                            <span>Current Session</span>
                        </button>
                        {/* Future: Add list of archived sessions here */}
                        <div className="history-empty-hint">
                            Archive coming soon...
                        </div>
                    </div>
                </aside>

                {/* Main Panel - Chat */}
                <main className="subject-main">
                    <AnimatePresence mode="wait">
                        {activeTab === 'chat' && (
                            <motion.div
                                key="chat"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="chat-panel"
                            >
                                <div className="messages">
                                    {messages.length === 0 && (
                                        <div className="chat-empty">
                                            <div style={{ background: 'rgba(99,102,241,0.05)', padding: '2rem', borderRadius: '30px', marginBottom: '2rem' }}>
                                                <BookOpen size={48} style={{ color: accentColor, opacity: 0.6 }} />
                                            </div>
                                            <h3>Your Study Copilot for {subject.name}</h3>
                                            <p>Upload your lecture notes, PDFs, or summaries, and I'll help you master the material.</p>
                                        </div>
                                    )}
                                    {messages.map((m, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`message ${m.role}`}
                                        >
                                            <div className="message-bubble">
                                                {m.content.split('**').map((part, idx) =>
                                                    idx % 2 === 1 ? <strong key={idx}>{part}</strong> : part
                                                )}
                                            </div>
                                        </motion.div>
                                    ))}
                                    {loading && (
                                        <div className="message assistant">
                                            <div className="message-bubble" style={{ opacity: 0.7, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <Loader2 size={16} className="spin" /> Checking your notes...
                                            </div>
                                        </div>
                                    )}
                                    <div ref={chatEndRef} />
                                </div>

                                <div className="chat-input-row">
                                    <div className="input-container">
                                        <input
                                            type="text"
                                            placeholder={`Message ${subject.name} Copilot...`}
                                            value={input}
                                            onChange={e => setInput(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && sendMessage()}
                                        />
                                        <button className="send-btn" onClick={sendMessage} disabled={loading || !input.trim()}>
                                            <Send size={18} />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'study' && (
                            <motion.div
                                key="study"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="study-panel"
                            >
                                <div className="study-content">
                                    {generatingTasks ? (
                                        <div className="generating" style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                            <Loader2 size={48} className="spin" style={{ color: accentColor }} />
                                            <h3 style={{ marginTop: '2rem' }}>Generating Study Set...</h3>
                                            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>I'm analyzing your notes to create tailored questions.</p>
                                        </div>
                                    ) : studyTasks ? (
                                        <>
                                            <div className="study-header-row">
                                                <h2>Study Material: {subject.name}</h2>
                                                <button className="btn-outline" onClick={generateStudyTasks}>
                                                    <RotateCcw size={16} /> Refresh
                                                </button>
                                            </div>

                                            <div className="study-sections">
                                                <section className="mcq-section">
                                                    <h3>Multiple Choice Practice</h3>
                                                    {studyTasks.mcqs.map((mcq, i) => (
                                                        <MCQCard key={i} index={i} mcq={mcq} accentColor={accentColor} />
                                                    ))}
                                                </section>

                                                <section className="sa-section">
                                                    <h3>Short Answer Review</h3>
                                                    {studyTasks.shortAnswers.map((sa, i) => (
                                                        <SACard key={i} sa={sa} accentColor={accentColor} />
                                                    ))}
                                                </section>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="chat-empty" style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                            <Sparkles size={48} style={{ color: accentColor, opacity: 0.4 }} />
                                            <h3>No Study Tasks Found</h3>
                                            <p>Upload notes and click Study Mode to generate practice questions.</p>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>

                {/* Right Sidebar: Files Toggleable */}
                <AnimatePresence>
                    {showFileSidebar && (
                        <motion.aside
                            initial={{ x: 300, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 300, opacity: 0 }}
                            className="files-drawer"
                        >
                            <div className="drawer-header">
                                <h3>Subject Files</h3>
                                <button className="close-drawer" onClick={() => setShowFileSidebar(false)}>
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="drawer-content">
                                {notes.length === 0 ? (
                                    <div className="empty-state">
                                        <FileText size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                        <p>No files uploaded yet</p>
                                    </div>
                                ) : (
                                    <div className="drawer-list">
                                        {notes.map((n, i) => (
                                            <div key={i} className="drawer-item" onClick={() => setPreviewNote(n)}>
                                                <div className="item-icon">
                                                    <FileText size={18} />
                                                </div>
                                                <div className="item-info">
                                                    <p className="item-name">{n.name || n.filename}</p>
                                                    <p className="item-meta">Click to preview content</p>
                                                </div>
                                                <Maximize2 size={14} className="hover-icon" />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button className="upload-bottom-btn" onClick={() => fileInputRef.current.click()}>
                                <FileUp size={18} /> Add New Note
                            </button>
                        </motion.aside>
                    )}
                </AnimatePresence>

                {/* PDF Preview Modal */}
                <AnimatePresence>
                    {previewNote && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="preview-overlay"
                            onClick={() => setPreviewNote(null)}
                        >
                            <motion.div
                                initial={{ scale: 0.9, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.9, y: 20 }}
                                className="preview-modal"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="preview-header">
                                    <div className="title-block">
                                        <FileText size={18} style={{ color: 'var(--accent)' }} />
                                        <h2 style={{ fontSize: '1.1rem' }}>{previewNote.name || previewNote.filename}</h2>
                                    </div>
                                    <button className="close-modal" onClick={() => setPreviewNote(null)}>
                                        <X size={20} />
                                    </button>
                                </div>
                                <div className="preview-body">
                                    {previewNote.content ? (
                                        <div className="content-text" style={{ fontSize: '0.9rem' }}>
                                            {previewNote.content}
                                        </div>
                                    ) : (
                                        <div className="loading-preview">
                                            <Loader2 size={24} className="spin" />
                                            <p style={{ fontSize: '0.8rem' }}>Loading content...</p>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

const MCQCard = ({ mcq, index, accentColor }) => {
    const [selected, setSelected] = useState(null);
    return (
        <div className="mcq-card">
            <p className="mcq-question"><strong>Q{index + 1}.</strong> {mcq.q}</p>
            <div className="mcq-options">
                {mcq.options.map((opt, i) => (
                    <button
                        key={i}
                        className={`mcq-option ${selected === i ? (i === mcq.answer ? 'correct' : 'wrong') : ''} ${selected !== null && i === mcq.answer ? 'correct' : ''}`}
                        onClick={() => setSelected(i)}
                        disabled={selected !== null}
                    >
                        <span className="opt-label">{String.fromCharCode(65 + i)}.</span> {opt}
                        {selected !== null && i === mcq.answer && <CheckCircle size={16} />}
                        {selected === i && i !== mcq.answer && <AlertCircle size={16} />}
                    </button>
                ))}
            </div>
        </div>
    );
};

const SACard = ({ sa, accentColor }) => {
    const [showAnswer, setShowAnswer] = useState(false);
    return (
        <div className="sa-card">
            <p className="sa-question">{sa.q}</p>
            {showAnswer ? (
                <div className="sa-answer">
                    <p>{sa.model}</p>
                </div>
            ) : (
                <button className="btn-outline" onClick={() => setShowAnswer(true)}>
                    <ChevronRight size={16} /> Show Model Answer
                </button>
            )}
        </div>
    );
};

export default SubjectPage;
