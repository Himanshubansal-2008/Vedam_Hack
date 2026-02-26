import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/', (req, res) => res.json({ message: "AskMyNotes API is running", version: "1.0.0" }));
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => res.status(204).end());

app.post('/api/users/sync', async (req, res) => {
    const { clerkId, email } = req.body;
    try {
        const user = await prisma.user.upsert({
            where: { clerkId },
            update: { email },
            create: { clerkId, email },
        });
        const subjects = await prisma.subject.findMany({ where: { userId: clerkId } });
        res.json({ user, hasSubjects: subjects.length >= 3 });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to sync user' });
    }
});

app.post('/api/subjects/init', async (req, res) => {
    const { clerkId, email, subjects } = req.body;
    if (!subjects || subjects.length !== 3) {
        return res.status(400).json({ error: 'Exactly 3 subjects required' });
    }
    try {
        // Ensure user exists first
        if (email) {
            await prisma.user.upsert({
                where: { clerkId },
                update: { email },
                create: { clerkId, email },
            });
        }

        const existing = await prisma.subject.count({ where: { userId: clerkId } });
        if (existing > 0) {
            return res.status(400).json({ error: 'Subjects already initialized for this user' });
        }

        const created = await Promise.all(
            subjects.map(name =>
                prisma.subject.create({ data: { name, userId: clerkId } })
            )
        );
        res.json({ subjects: created });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create subjects' });
    }
});

app.get('/api/subjects', async (req, res) => {
    const { clerkId } = req.query;
    try {
        const subjects = await prisma.subject.findMany({
            where: { userId: clerkId },
            include: { notes: true }
        });
        res.json({ subjects });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch subjects' });
    }
});

// --- Helper Functions ---
async function getNotesForSubject(clerkId, subjectName) {
    console.log(`[DB Lookup] Searching for subject: "${subjectName}" for user: ${clerkId}`);
    const subject = await prisma.subject.findUnique({
        where: { name_userId: { name: subjectName, userId: clerkId } },
        include: { notes: true }
    });
    if (!subject) {
        console.error(`[DB Error] Subject not found: "${subjectName}" for user: ${clerkId}`);
        throw new Error('Subject not found');
    }
    return { subject, notes: subject.notes };
}

// --- Session Management ---

app.post('/api/sessions', async (req, res) => {
    const { clerkId, subjectName, title } = req.body;
    try {
        const { subject } = await getNotesForSubject(clerkId, subjectName);
        const session = await prisma.chatSession.create({
            data: {
                subjectId: subject.id,
                title: title || 'New Chat'
            }
        });
        res.json({ session });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

app.get('/api/sessions', async (req, res) => {
    const { clerkId, subjectName } = req.query;
    try {
        const { subject } = await getNotesForSubject(clerkId, subjectName);
        const sessions = await prisma.chatSession.findMany({
            where: { subjectId: subject.id },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ sessions });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

app.post('/api/notes/upload', upload.single('file'), async (req, res) => {
    const { subjectId, clerkId, subjectName, sessionId } = req.body;
    console.log(`[Upload] Body:`, { subjectId, clerkId, subjectName, sessionId });
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'File required' });

    try {
        let content = '';
        if (file.mimetype === 'application/pdf') {
            const buffer = fs.readFileSync(file.path);
            const parsed = await pdfParse(buffer);
            content = parsed.text;
        } else {
            content = fs.readFileSync(file.path, 'utf-8');
        }

        let realSubjectId = subjectId;

        if (clerkId && subjectName) {
            const { subject } = await getNotesForSubject(clerkId, subjectName);
            realSubjectId = subject.id;
        }

        let targetSessionId = sessionId;
        if (!targetSessionId && realSubjectId) {
            try {
                const newSession = await prisma.chatSession.create({
                    data: {
                        subjectId: realSubjectId,
                        title: `New Chat: ${file.originalname}`
                    }
                });
                targetSessionId = newSession.id;
            } catch (sessErr) {
                console.error("Failed to create auto-session on upload:", sessErr);
            }
        }

        const note = await prisma.note.create({
            data: {
                filename: file.originalname,
                content,
                subjectId: realSubjectId,
                sessionId: targetSessionId || null
            }
        });

        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        res.json({ note, subjectId: realSubjectId, sessionId: targetSessionId, message: 'File uploaded and processed' });
    } catch (error) {
        console.error(error);
        if (fs.existsSync(file?.path)) fs.unlinkSync(file.path);
        res.status(500).json({ error: 'Failed to process file: ' + error.message });
    }
});

app.get('/api/ai/history', async (req, res) => {
    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    try {
        const history = await prisma.chatMessage.findMany({
            where: { sessionId },
            orderBy: { createdAt: 'asc' },
            take: 100
        });
        res.json({ history });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

app.post('/api/ai/ask', async (req, res) => {
    const { question, sessionId, clerkId, subjectName } = req.body;
    if (!question || !sessionId) {
        return res.status(400).json({ error: 'question and sessionId required' });
    }

    try {
        // Fetch session to get subject context
        const session = await prisma.chatSession.findUnique({
            where: { id: sessionId },
            include: { subject: true }
        });
        if (!session) return res.status(404).json({ error: 'Session not found' });

        // Notes for this session
        const notes = await prisma.note.findMany({
            where: { sessionId }
        });

        if (notes.length === 0) {
            return res.json({ answer: `No notes found in this chat session. Please upload some files to this chat first.` });
        }

        const history = await prisma.chatMessage.findMany({
            where: { sessionId },
            orderBy: { createdAt: 'desc' },
            take: 10
        });
        const historyContext = history.reverse().map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

        const context = notes.map(n => `[File: ${n.filename}]\n${n.content}`).join('\n\n---\n\n');
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const prompt = `You are a supportive, teacher-like study assistant named "Study Copilot". 
Your goal is to explain concepts clearly and conversationally.
Answer the student's question using ONLY the provided notes for this specific chat session.
If the answer is not in the notes, respond with: "Not found in the notes for this chat. Would you like to upload more material?"

CONSTRAINTS:
1. Ground answers in the provided notes.
2. Use a helpful, encouraging tone.
3. Reference the source file name.
4. If it's a follow-up question, use the recent history to stay in context.

RECENT HISTORY:
${historyContext}

NOTES:
${context.substring(0, 30000)}

QUESTION: ${question}

Provide your response in a conversational way. 
Include: The Answer (with citations), Confidence: [High/Medium/Low]`;

        const result = await model.generateContent(prompt);
        const answer = result.response.text();

        await prisma.chatMessage.createMany({
            data: [
                { role: 'user', content: question, sessionId: session.id },
                { role: 'assistant', content: answer, sessionId: session.id }
            ]
        });

        // Optionally update session title if it's the first message
        if (history.length === 0) {
            await prisma.chatSession.update({
                where: { id: session.id },
                data: { title: question.substring(0, 30) + (question.length > 30 ? '...' : '') }
            });
        }

        res.json({ answer });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'AI query failed: ' + error.message });
    }
});

app.post('/api/ai/study-tasks', async (req, res) => {
    const { clerkId, subjectName } = req.body;
    if (!clerkId || !subjectName) {
        return res.status(400).json({ error: 'clerkId and subjectName required' });
    }

    try {
        const { subject, notes } = await getNotesForSubject(clerkId, subjectName);
        if (notes.length === 0) {
            return res.status(400).json({ error: 'No notes found. Upload files first.' });
        }

        const context = notes.map(n => `[File: ${n.filename}]\n${n.content}`).join('\n\n---\n\n');
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const prompt = `You are a strict academic examiner. Based ONLY on the provided study notes for the subject "${subject.name}", generate a study task set.
        
CRITICAL RULES:
1. Do NOT use outside knowledge. If the notes are about "${subject.name}", do NOT generate questions about other topics.
2. If the notes are insufficient to generate 5 MCQs, generate as many as possible (min 1).
3. Base MCQs on specific facts, definitions, or concepts found in the notes.

NOTES:
${context.substring(0, 25000)}

Generate EXACTLY this JSON structure (no markdown, raw JSON only):
{
  "mcqs": [
    {"q": "question text", "options": ["A","B","C","D"], "answer": 0, "explanation": "why this is the answer based on the notes"}
  ],
  "shortAnswers": [
    {"q": "conceptual question", "model": "detailed model answer citing the source file"}
  ]
}

Rules:
- Generate up to 5 MCQs and 3 short answers.
- MCQ answer field = index (0-3) of correct option.
- Include source citations in short answer model answers.`;

        const result = await model.generateContent(prompt);
        let text = result.response.text().trim();
        text = text.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
        const tasks = JSON.parse(text);

        // Persist the generated study set
        await prisma.studySet.create({
            data: {
                subjectId: subject.id,
                data: tasks
            }
        });

        res.json(tasks);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to generate study tasks: ' + error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});
