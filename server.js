const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // تأكد أن ملف الhtml في مجلد public أو عدله حسب رغبتك

// ملفات تخزين البيانات الوهمية (يمكن استبدالها بقاعدة بيانات حقيقية)
const USERS_FILE = './users.json';
const QUESTIONS_FILE = './questions.json';

// دوال مساعدة لقراءة والكتابة
function readJSON(file) {
    if (!fs.existsSync(file)) return [];
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return [];
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// 1. مسارات المستخدمين والتحقق
app.post('/api/register', (req, res) => {
    const { name, email, pass } = req.body;
    let users = readJSON(USERS_FILE);
    if (users.find(u => u.email === email)) {
        return res.json({ success: false, message: 'البريد الإلكتروني مسجل مسبقاً!' });
    }
    const role = email === 'admin@qudrat.com' ? 'admin' : 'student';
    users.push({ name, email, pass, role });
    writeJSON(USERS_FILE, users);
    res.json({ success: true, message: 'تم إنشاء الحساب بنجاح! يمكنك تسجيل الدخول.' });
});

app.post('/api/login', (req, res) => {
    const { email, pass } = req.body;
    let users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email && u.pass === pass);
    if (user) {
        res.json({ success: true, role: user.role || 'student' });
    } else {
        res.json({ success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة!' });
    }
});

// مسار جلب الحسابات المسجلة للمشرف
app.get('/api/users', (req, res) => {
    let users = readJSON(USERS_FILE);
    // إخفاء كلمات المرور عند إرسالها للواجهة لأسباب أمنية
    const safeUsers = users.map(u => ({ name: u.name, email: u.email, role: u.role || 'student' }));
    res.json(safeUsers);
});

// مسار حذف المستخدمين للمشرف
app.post('/api/delete-user', (req, res) => {
    const { email } = req.body;
    let users = readJSON(USERS_FILE);
    const initialLength = users.length;
    users = users.filter(u => u.email !== email);
    
    if (users.length < initialLength) {
        writeJSON(USERS_FILE, users);
        res.json({ success: true, message: 'تم حذف الحساب بنجاح' });
    } else {
        res.json({ success: false, message: 'المستخدم غير موجود' });
    }
});

app.post('/api/reset-password', (req, res) => {
    const { email, newPass } = req.body;
    let users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email);
    if (user) {
        user.pass = newPass;
        writeJSON(USERS_FILE, users);
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'المستخدم غير موجود' });
    }
});

// 2. مسارات الأسئلة
app.get('/api/questions', (req, res) => {
    res.json(readJSON(QUESTIONS_FILE));
});

app.post('/api/add-question', (req, res) => {
    let questions = readJSON(QUESTIONS_FILE);
    questions.push(req.body);
    writeJSON(QUESTIONS_FILE, questions);
    res.json({ success: true, message: 'تم حفظ السؤال بنجاح!' });
});

app.post('/api/edit-question', (req, res) => {
    const { index, ...updatedData } = req.body;
    let questions = readJSON(QUESTIONS_FILE);
    if (questions[index]) {
        questions[index] = updatedData;
        writeJSON(QUESTIONS_FILE, questions);
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'السؤال غير موجود' });
    }
});

app.post('/api/delete-question', (req, res) => {
    const { index } = req.body;
    let questions = readJSON(QUESTIONS_FILE);
    if (index >= 0 && index < questions.length) {
        questions.splice(index, 1);
        writeJSON(QUESTIONS_FILE, questions);
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'السؤال غير موجود' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
