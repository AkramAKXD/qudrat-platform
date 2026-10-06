const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// مسارات ملفات البيانات
const USERS_FILE = path.join(__dirname, 'users.json');
const QUESTIONS_FILE = path.join(__dirname, 'public', 'questions.json');

function readJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify([]));
        }
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

function writeJsonFile(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// تهيئة حساب المشرف الأساسي إذا لم يكن موجوداً
if (!fs.existsSync(USERS_FILE)) writeJsonFile(USERS_FILE, [
    { name: 'أكرم عبيد', email: 'bydakrm767@gmail.com', pass: 'Zain@123', role: 'admin' }
]);
if (!fs.existsSync(QUESTIONS_FILE)) writeJsonFile(QUESTIONS_FILE, []);

// مسارات الـ API
app.post('/api/register', (req, res) => {
    const { name, email, pass } = req.body;
    const users = readJsonFile(USERS_FILE);
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        return res.json({ success: false, message: '⚠️ هذا البريد مسجل مسبقاً!' });
    }
    users.push({ name: name.trim(), email: email.trim().toLowerCase(), pass, role: 'student' });
    writeJsonFile(USERS_FILE, users);
    res.json({ success: true, message: '🎉 تم إنشاء الحساب بنجاح!' });
});

app.post('/api/login', (req, res) => {
    const { email, pass } = req.body;
    const users = readJsonFile(USERS_FILE);
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.pass === pass);
    if (!user) {
        return res.json({ success: false, message: '❌ بيانات الدخول خاطئة!' });
    }
    res.json({ success: true, name: user.name, role: user.role, email: user.email });
});

app.get('/api/questions', (req, res) => {
    const questions = readJsonFile(QUESTIONS_FILE);
    res.json(questions);
});

app.post('/api/add-question', (req, res) => {
    const { section, model, question, options, correct_answer, image } = req.body;
    const questions = readJsonFile(QUESTIONS_FILE);
    questions.push({ 
        id: questions.length + 1, 
        section: section || "كمي", 
        type: 'practice', 
        model: Number(model) || 1, 
        question, 
        options, 
        correct_answer, 
        image: image || null 
    });
    writeJsonFile(QUESTIONS_FILE, questions);
    res.json({ success: true, message: '🎯 تم حفظ السؤال بنجاح!' });
});

app.get('/api/users', (req, res) => {
    const users = readJsonFile(USERS_FILE);
    res.json(users.map(u => ({ name: u.name, email: u.email, role: u.role })));
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على الرابط: http://localhost:${PORT}`);
});
