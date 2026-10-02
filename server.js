const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// الاتصال بقاعدة البيانات السحابية
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas successfully!'))
  .catch((err) => console.error('MongoDB connection error:', err));

const USERS_FILE = path.join(__dirname, 'users.json');
const QUESTIONS_FILE = path.join(__dirname, 'questions.json');

function readJsonFile(filePath, defaultData = []) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf8');
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        return defaultData;
    }
}

function writeJsonFile(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// تهيئة المشرف الافتراضي
readJsonFile(USERS_FILE, [
    { name: 'أكرم عبيد', email: 'bydakrm767@gmail.com', pass: 'Zain@123', role: 'admin' }
]);

readJsonFile(QUESTIONS_FILE, []);

// API تسجيل الحسابات (مع التحقق من أن كلمة المرور بين 6 إلى 18 حرفاً)
app.post('/api/register', (req, res) => {
    const { name, email, pass } = req.body;
    
    if (!name || name.trim().length < 3) {
        return res.json({ success: false, message: '⚠ عذراً يا أكرم، اسم المستخدم يجب ألا يقل عن 3 أحرف!' });
    }
    if (!email || !email.includes('@')) {
        return res.json({ success: false, message: '⚠️ تنبيه: يجب إدخال بريد إلكتروني صحيح وصالح!' });
    }
    if (!pass || pass.length < 6 || pass.length > 18) {
        return res.json({ success: false, message: '⚠ كلمة المرور يجب أن تكون بين 6 إلى 18 حرفاً أو رقماً!' });
    }

    let users = readJsonFile(USERS_FILE, []);
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
        return res.json({ success: false, message: '⚠️ هذا البريد مسجل مسبقاً، جرب تسجيل الدخول أو استخدم بريداً آخر!' });
    }

    users.push({ name: name.trim(), email: email.trim(), pass, role: 'student' });
    writeJsonFile(USERS_FILE, users);
    res.json({ success: true, message: '🎉 كفو عليك! تم إنشاء حسابك بنجاح، انطلق نحو القمة!' });
});

// API تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { email, pass } = req.body;
    
    if (!email || !pass) {
        return res.json({ success: false, message: '⚠️ يرجى تعبئة كافة حقول البريد وكلمة المرور!' });
    }

    let users = readJsonFile(USERS_FILE, []);
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.pass === pass);
    
    if (!user) {
        return res.json({ success: false, message: '❌ بيانات الدخول خاطئة! تأكد من البريد وكلمة المرور وحاول مجدداً.' });
    }
    
    res.json({ success: true, message: '🚀 أهلاً بك مجدداً في قمة النجاح!', name: user.name, role: user.role });
});

// API التحقق من البريد لنسيت كلمة المرور
app.post('/api/check-email', (req, res) => {
    const { email } = req.body;
    let users = readJsonFile(USERS_FILE, []);
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) {
        return res.json({ success: false, message: '❌ البريد الإلكتروني غير مسجل في النظام!' });
    }
    res.json({ success: true, message: '✅ تم العثور على الحساب، يرجى إدخال كلمة المرور الجديدة.' });
});

// API تغيير كلمة المرور المنسية (مع التحقق من 6 إلى 18 حرفاً)
app.post('/api/reset-password', (req, res) => {
    const { email, newPass } = req.body;
    
    if (!newPass || newPass.length < 6 || newPass.length > 18) {
        return res.json({ success: false, message: '⚠️ كلمة المرور الجديدة يجب أن تكون بين 6 إلى 18 حرفاً أو رقماً.' });
    }

    let users = readJsonFile(USERS_FILE, []);
    const userIndex = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (userIndex === -1) {
        return res.json({ success: false, message: '❌ حدث خطأ ما، البريد غير موجود.' });
    }

    users[userIndex].pass = newPass;
    writeJsonFile(USERS_FILE, users);
    res.json({ success: true, message: '🎉 تم تحديث كلمة المرور بنجاح! يمكنك تسجيل الدخول الآن.' });
});

// API إضافة الأسئلة
app.post('/api/add-question', (req, res) => {
    const { section, text, options, correct } = req.body;
    let questions = readJsonFile(QUESTIONS_FILE, []);
    questions.push({ section, text, options, correct });
    writeJsonFile(QUESTIONS_FILE, questions);
    res.json({ success: true, message: '🎯 تم حفظ السؤال بنجاح في بنك الأسئلة!' });
});

app.get('/api/questions', (req, res) => res.json(readJsonFile(QUESTIONS_FILE, [])));
app.get('/api/users', (req, res) => res.json(readJsonFile(USERS_FILE, []).map(u => ({ name: u.name, email: u.email, role: u.role }))));

app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على الرابط: http://localhost:${PORT}`);
});
