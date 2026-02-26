import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import './ThemeToggle.css';

const ThemeToggle = () => {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            className={`theme-toggle ${theme}`}
            onClick={toggleTheme}
            aria-label="Toggle Theme"
        >
            <div className="toggle-track">
                <div className="toggle-thumb">
                    {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                </div>
            </div>
        </button>
    );
};

export default ThemeToggle;
