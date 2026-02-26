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
    const { clerkId, subjects } = req.body;
    if (!subjects || subjects.length !== 3) {
        return res.status(400).json({ error: 'Exactly 3 subjects required' });
    }
    try {
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


app.post('/api/notes/upload', upload.single('file'), async (req, res) => {
    const { subjectId, clerkId, subjectName } = req.body;
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
            await prisma.user.upsert({
                where: { clerkId },
                update: {},
                create: { clerkId, email: `${clerkId}@clerk.user` },
            });

            const subject = await prisma.subject.upsert({
                where: { name_userId: { name: subjectName, userId: clerkId } },
                update: {},
                create: { name: subjectName, userId: clerkId },
            });
            realSubjectId = subject.id;
        }

        if (!realSubjectId) {
            return res.status(400).json({ error: 'subjectId or (clerkId + subjectName) required' });
        }

        const note = await prisma.note.create({
            data: { filename: file.originalname, content, subjectId: realSubjectId }
        });

        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        res.json({ note, subjectId: realSubjectId, message: 'File uploaded and processed' });
    } catch (error) {
        console.error(error);
        if (fs.existsSync(file?.path)) fs.unlinkSync(file.path);
        res.status(500).json({ error: 'Failed to process file: ' + error.message });
    }
});

app.get('/api/notes/content/:noteId', async (req, res) => {
    try {
        const note = await prisma.note.findUnique({
            where: { id: req.params.noteId }
        });
        if (!note) return res.status(404).json({ error: 'Note not found' });
        res.json({ filename: note.filename, content: note.content });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch note content' });
    }
});

async function getNotesForSubject(clerkId, subjectName) {
    await prisma.user.upsert({
        where: { clerkId },
        update: {},
        create: { clerkId, email: `${clerkId}@clerk.user` },
    });
    const subject = await prisma.subject.upsert({
        where: { name_userId: { name: subjectName, userId: clerkId } },
        update: {},
        create: { name: subjectName, userId: clerkId },
    });
    const notes = await prisma.note.findMany({ where: { subjectId: subject.id } });
    return { subject, notes };
}

app.get('/api/ai/history', async (req, res) => {
    const { clerkId, subjectName } = req.query;
    if (!clerkId || !subjectName) return res.status(400).json({ error: 'clerkId and subjectName required' });

    try {
        const { subject } = await getNotesForSubject(clerkId, subjectName);
        const history = await prisma.chatMessage.findMany({
            where: { subjectId: subject.id },
            orderBy: { createdAt: 'asc' },
            take: 50
        });
        res.json({ history });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

app.post('/api/ai/ask', async (req, res) => {
    const { question, clerkId, subjectName } = req.body;
    if (!question || !clerkId || !subjectName) {
        return res.status(400).json({ error: 'question, clerkId, and subjectName required' });
    }

    try {
        const { subject, notes } = await getNotesForSubject(clerkId, subjectName);
        if (notes.length === 0) {
            return res.json({ answer: `Not found in your notes for ${subjectName}. Please upload some notes first.` });
        }

        const context = notes.map(n => `[File: ${n.filename}]\n${n.content}`).join('\n\n---\n\n');
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const prompt = `You are a study assistant. Answer the student's question using ONLY the provided notes.
If the answer is not in the notes, respond with: "Not found in your notes for this subject."
Always cite the source file if possible.

NOTES:
${context.substring(0, 30000)}

QUESTION: ${question}

Provide: Answer, Confidence (High/Medium/Low), Source reference.`;

        const result = await model.generateContent(prompt);
        const answer = result.response.text();

        await prisma.chatMessage.createMany({
            data: [
                { role: 'user', content: question, subjectId: subject.id },
                { role: 'assistant', content: answer, subjectId: subject.id }
            ]
        });

        res.json({ answer });
    } catch (error) {
        console.error(error);
        const status = error.message?.includes('429') ? 429 : 500;
        res.status(status).json({ error: 'AI query failed: ' + error.message });
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
        const prompt = `Based on these study notes for "${subject.name}", generate a study task set.

NOTES:
${context.substring(0, 25000)}

Generate EXACTLY this JSON structure (no markdown, raw JSON only):
{
  "mcqs": [
    {"q": "question", "options": ["A","B","C","D"], "answer": 0, "explanation": "brief explanation"}
  ],
  "shortAnswers": [
    {"q": "question", "model": "model answer with citation"}
  ]
}

Rules:
- Generate exactly 5 MCQs and 3 short answers
- Base everything strictly on the provided notes
- MCQ answer field = index (0-3) of correct option
- Include source citations in short answer model answers`;

        const result = await model.generateContent(prompt);
        let text = result.response.text().trim();
        text = text.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
        const tasks = JSON.parse(text);
        res.json(tasks);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to generate study tasks: ' + error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});
