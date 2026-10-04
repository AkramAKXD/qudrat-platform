const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const USERS_FILE = path.join(__dirname, 'users.json');
const QUESTIONS_FILE = path.join(__dirname, 'questions.json');

function readJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify([]));
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) { return []; }
}

function writeJsonFile(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

if (!fs.existsSync(USERS_FILE)) writeJsonFile(USERS_FILE, [{ name: 'أكرم عبيد', email: 'bydakrm767@gmail.com', pass: 'Zain@123', role: 'admin' }]);
if (!fs.existsSync(QUESTIONS_FILE)) writeJsonFile(QUESTIONS_FILE, []);

app.post('/api/register', (req, res) => {
    const { name, email, pass } = req.body;
    const users = readJsonFile(USERS_FILE);
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        return res.json({ success: false, message: '⚠️ البريد مسجل مسبقاً!' });
    }
    users.push({ name: name.trim(), email: email.trim().toLowerCase(), pass, role: 'student' });
    writeJsonFile(USERS_FILE, users);
    res.json({ success: true, message: '🎉 تم إنشاء الحساب بنجاح!' });
});

app.post('/api/login', (req, res) => {
    const { email, pass } = req.body;
    const users = readJsonFile(USERS_FILE);
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.pass === pass);
    if (!user) return res.json({ success: false, message: '❌ خطأ في البريد أو كلمة المرور!' });
    res.json({ success: true, name: user.name, role: user.role, email: user.email });
});

app.post('/api/check-email', (req, res) => {
    const users = readJsonFile(USERS_FILE);
    if (users.find(u => u.email.toLowerCase() === req.body.email.toLowerCase())) {
        return res.json({ success: true });
    }
    res.json({ success: false, message: '❌ البريد غير موجود!' });
});

app.post('/api/reset-password', (req, res) => {
    const users = readJsonFile(USERS_FILE);
    const idx = users.findIndex(u => u.email.toLowerCase() === req.body.email.toLowerCase());
    if (idx !== -1) {
        users[idx].pass = req.body.newPass;
        writeJsonFile(USERS_FILE, users);
        return res.json({ success: true, message: '🎉 تم تحديث كلمة المرور بنجاح!' });
    }
    res.json({ success: false, message: '❌ حدث خطأ!' });
});

app.post('/api/add-question', (req, res) => {
    const { section, model, text, options, correct } = req.body;
    const questions = readJsonFile(QUESTIONS_FILE);
    questions.push({ section, model: model || 1, text, options, correct });
    writeJsonFile(QUESTIONS_FILE, questions);
    res.json({ success: true, message: '🎯 تم حفظ السؤال بنجاح!' });
});

app.get('/api/questions', (req, res) => res.json(readJsonFile(QUESTIONS_FILE)));
app.get('/api/users', (req, res) => res.json(readJsonFile(USERS_FILE).map(u => ({ name: u.name, email: u.email, role: u.role }))));

app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على الرابط: http://localhost:${PORT}`));
