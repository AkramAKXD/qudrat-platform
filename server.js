const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// مسارات ملفات البيانات المحلية
const USERS_FILE = path.join(__dirname, 'users.json');
const QUESTIONS_FILE = path.join(__dirname, 'questions.json');

// دوال قراءة وكتابة الملفات
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

// تهيئة الملفات عند التشغيل (حساب المشرف الأساسي)
if (!fs.existsSync(USERS_FILE)) writeJsonFile(USERS_FILE, [
    { name: 'أكرم عبيد', email: 'bydakrm767@gmail.com', pass: 'Zain@123', role: 'admin' }
]);
if (!fs.existsSync(QUESTIONS_FILE)) writeJsonFile(QUESTIONS_FILE, []);

// API تسجيل الحسابات
app.post('/api/register', (req, res) => {
    const { name, email, pass } = req.body;
    
    if (!name || name.trim().length < 3) {
        return res.json({ success: false, message: '⚠ عذراً يا أكرم، اسم المستخدم يجب ألا يقل عن 3 أحرف!' });
    }
    if (!email || !email.includes('@')) {
        return res.json({ success: false, message: '⚠️️ تنبيه: يجب إدخال بريد إلكتروني صحيح وصالح!' });
    }
    if (!pass || pass.length < 6 || pass.length > 18) {
        return res.json({ success: false, message: '⚠ كلمة المرور يجب أن تكون بين 6 إلى 18 حرفاً أو رقماً!' });
    }

    const users = readJsonFile(USERS_FILE);
    const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (existingUser) {
        return res.json({ success: false, message: '⚠️ هذا البريد مسجل مسبقاً، جرب تسجيل الدخول أو استخدم بريداً آخر!' });
    }

    users.push({ name: name.trim(), email: email.trim().toLowerCase(), pass, role: 'student' });
    writeJsonFile(USERS_FILE, users);

    res.json({ success: true, message: '🎉 كفو عليك! تم إنشاء حسابك بنجاح، انطلق نحو القمة!' });
});

// API تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { email, pass } = req.body;
    
    if (!email || !pass) {
        return res.json({ success: false, message: '⚠️ يرجى تعبئة كافة حقول البريد وكلمة المرور!' });
    }

    const users = readJsonFile(USERS_FILE);
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.pass === pass);
    
    if (!user) {
        return res.json({ success: false, message: '❌ بيانات الدخول خاطئة! تأكد من البريد وكلمة المرور وحاول مجدداً.' });
    }
    
    res.json({ success: true, message: '🚀 أهلاً بك مجدداً في قمة النجاح!', name: user.name, role: user.role, email: user.email });
});

// API التحقق من البريد لنسيت كلمة المرور
app.post('/api/check-email', (req, res) => {
    const { email } = req.body;
    const users = readJsonFile(USERS_FILE);
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) {
        return res.json({ success: false, message: '❌ البريد الإلكتروني غير مسجل في النظام!' });
    }
    res.json({ success: true, message: '✅ تم العثور على الحساب، يرجى إدخال كلمة المرور الجديدة.' });
});

// API تغيير كلمة المرور المنسية
app.post('/api/reset-password', (req, res) => {
    const { email, newPass } = req.body;
    
    if (!newPass || newPass.length < 6 || newPass.length > 18) {
        return res.json({ success: false, message: '⚠️ كلمة المرور الجديدة يجب أن تكون بين 6 إلى 18 حرفاً أو رقماً.' });
    }

    const users = readJsonFile(USERS_FILE);
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
    const questions = readJsonFile(QUESTIONS_FILE);
    questions.push({ section, text, options, correct });
    writeJsonFile(QUESTIONS_FILE, questions);
    res.json({ success: true, message: '🎯 تم حفظ السؤال بنجاح في بنك الأسئلة!' });
});

// API جلب الأسئلة
app.get('/api/questions', (req, res) => {
    const questions = readJsonFile(QUESTIONS_FILE);
    res.json(questions);
});

// API جلب المستخدمين المتوافق مع الواجهة (GET)
app.get('/api/users', (req, res) => {
    const users = readJsonFile(USERS_FILE);
    const safeUsers = users.map(u => ({ name: u.name, email: u.email, role: u.role }));
    res.json(safeUsers);
});

// API جلب المستخدمين القديم (محمي كـ POST)
app.post('/api/admin/users', (req, res) => {
    const { email } = req.body;
    if (email && email.toLowerCase() === 'bydakrm767@gmail.com') {
        const users = readJsonFile(USERS_FILE);
        return res.json({ success: true, users: users });
    }
    res.json({ success: false, message: '⛔ ليس لديك صلاحية للوصول لهذه البيانات!' });
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على الرابط: http://localhost:${PORT}`);
});
