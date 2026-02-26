// Central API base URL — reads from env var in production, falls back to localhost in dev
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export default API_BASE;
