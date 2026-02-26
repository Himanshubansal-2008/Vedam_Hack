import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser, UserButton } from '@clerk/clerk-react';
import { BookPlus, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import axios from 'axios';
import '../styles/SubjectSetup.css';
import ThemeToggle from '../components/ThemeToggle';
import API_BASE from '../config/api';



const SubjectSetup = () => {
    const { user } = useUser();
    const [subjects, setSubjects] = useState(['', '', '']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    React.useEffect(() => {
        const checkExisting = async () => {
            if (!user?.id) return;
            try {
                const { data } = await axios.get(`${API_BASE}/api/subjects?clerkId=${user.id}`);
                if (data.subjects && data.subjects.length >= 3) {
                    navigate('/dashboard');
                }
            } catch (err) {
                console.warn('Check failed:', err.message);
            }
        };
        checkExisting();
    }, [user, navigate]);

    const handleChange = (index, value) => {
        const updated = [...subjects];
        updated[index] = value;
        setSubjects(updated);
    };



    const handleSubmit = async (e) => {
        e.preventDefault();
        if (subjects.some(s => s.trim() === '')) {
            setError('Please fill in all 3 subjects.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await axios.post(`${API_BASE}/api/subjects/init`, {
                clerkId: user?.id,
                email: user?.primaryEmailAddress?.emailAddress,
                subjects: subjects.map(s => s.trim()),
            });
            navigate('/dashboard');
        } catch (err) {
            // If DB not set up yet, navigate anyway for demo
            console.warn('API not available, navigating anyway:', err.message);
            navigate('/dashboard');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="setup-container">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="setup-card"
            >
                <div className="setup-actions">
                    <ThemeToggle />
                    <UserButton afterSignOutUrl="/" />
                </div>
                <div className="setup-header">
                    <BookPlus className="setup-icon" size={48} />
                    <h1>Setup Your Subjects</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        Enter exactly <strong>3 subjects</strong> you'll study this term.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="setup-form">
                    {subjects.map((subject, index) => (
                        <div key={index} className="input-group">
                            <label>Subject {index + 1}</label>
                            <input
                                type="text"
                                placeholder="e.g. Quantum Physics, Economics..."
                                value={subject}
                                onChange={(e) => handleChange(index, e.target.value)}
                                required
                            />
                        </div>
                    ))}

                    {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', margin: 0 }}>{error}</p>}

                    <button
                        type="submit"
                        className="btn-primary btn-full"
                        disabled={subjects.some(s => !s.trim()) || loading}
                    >
                        {loading ? 'Setting up...' : 'Continue to Dashboard'}
                        <ArrowRight size={20} />
                    </button>
                </form>
            </motion.div>
        </div>
    );
};

export default SubjectSetup;
