const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات الوسيط (Middleware)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// مسارات ملفات البيانات
const USERS_FILE = path.join(__dirname, 'users.json');
const QUESTIONS_FILE = path.join(__dirname, 'questions.json');
const MODELS_STATUS_FILE = path.join(__dirname, 'models_status.json');

// دوال قراءة وكتابة ملفات JSON مع معالجة الأخطاء
function readJsonFile(filePath, defaultValue = []) {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
        }
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error.message);
        return defaultValue;
    }
}

function writeJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error(`Error writing ${filePath}:`, error.message);
    }
}

// تهيئة الملفات عند بدء التشغيل
if (!fs.existsSync(USERS_FILE)) {
    writeJsonFile(USERS_FILE, [
        { name: 'أكرم عبيد', email: 'bydakrm767@gmail.com', pass: 'Zain@123', role: 'admin' }
    ]);
}
if (!fs.existsSync(QUESTIONS_FILE)) {
    writeJsonFile(QUESTIONS_FILE, []);
}
if (!fs.existsSync(MODELS_STATUS_FILE)) {
    writeJsonFile(MODELS_STATUS_FILE, {});
}

// ==================== مسارات الـ API ====================

// تسجيل حساب جديد
app.post('/api/register', (req, res) => {
    const { name, email, pass } = req.body;
    if (!name || !email || !pass) {
        return res.json({ success: false, message: '⚠️ يرجى تعبئة جميع الحقول المطلوبة!' });
    }

    const users = readJsonFile(USERS_FILE);
    const normalizedEmail = email.trim().toLowerCase();

    if (users.find(u => u.email.toLowerCase() === normalizedEmail)) {
        return res.json({ success: false, message: '⚠️ هذا البريد مسجل مسبقاً!' });
    }

    users.push({ 
        name: name.trim(), 
        email: normalizedEmail, 
        pass, 
        role: 'student' 
    });
    
    writeJsonFile(USERS_FILE, users);
    res.json({ success: true, message: '🎉 تم إنشاء الحساب بنجاح!' });
});

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { email, pass } = req.body;
    if (!email || !pass) {
        return res.json({ success: false, message: '⚠️ يرجى إدخال البريد وكلمة المرور!' });
    }

    const users = readJsonFile(USERS_FILE);
    const user = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase() && u.pass === pass);
    
    if (!user) {
        return res.json({ success: false, message: '❌ بيانات الدخول خاطئة!' });
    }
    
    res.json({ 
        success: true, 
        name: user.name, 
        role: user.role, 
        email: user.email 
    });
});

// استعادة / تحديث كلمة المرور
app.post('/api/reset-password', (req, res) => {
    const { email, newPass } = req.body;
    if (!email || !newPass) {
        return res.json({ success: false, message: '⚠️ يرجى إدخال البريد وكلمة المرور الجديدة!' });
    }

    const users = readJsonFile(USERS_FILE);
    const userIndex = users.findIndex(u => u.email.toLowerCase() === email.trim().toLowerCase());
    
    if (userIndex === -1) {
        return res.json({ success: false, message: '❌ البريد الإلكتروني غير مسجل في النظام!' });
    }
    
    users[userIndex].pass = newPass;
    writeJsonFile(USERS_FILE, users);
    res.json({ success: true, message: '✅ تم تحديث كلمة المرور بنجاح!' });
});

// جلب جميع الأسئلة
app.get('/api/questions', (req, res) => {
    const questions = readJsonFile(QUESTIONS_FILE);
    res.json(questions);
});

// إضافة سؤال جديد
app.post('/api/add-question', (req, res) => {
    const { section, type, model, question, options, correct_answer, image } = req.body;
    const questions = readJsonFile(QUESTIONS_FILE);
    
    questions.push({ 
        id: questions.length > 0 ? questions[questions.length - 1].id + 1 : 1, 
        section: section || "quant", 
        type: type || 'practice', 
        model: Number(model) || 1, 
        question, 
        options, 
        correct_answer, 
        image: image || null 
    });
    
    writeJsonFile(QUESTIONS_FILE, questions);
    res.json({ success: true, message: '🎯 تم حفظ السؤال بنجاح!' });
});

// حذف سؤال بواسطة الـ Index
app.post('/api/delete-question', (req, res) => {
    const { index } = req.body;
    const questions = readJsonFile(QUESTIONS_FILE);
    
    if (index !== undefined && index >= 0 && index < questions.length) {
        questions.splice(index, 1);
        writeJsonFile(QUESTIONS_FILE, questions);
        return res.json({ success: true, message: '🗑️ تم حذف السؤال بنجاح!' });
    }
    res.json({ success: false, message: '❌ السؤال غير موجود!' });
});

// جلب قائمة المستخدمين العامة (بدون كلمات المرور)
app.get('/api/users', (req, res) => {
    const users = readJsonFile(USERS_FILE);
    res.json(users.map(u => ({ name: u.name, email: u.email, role: u.role })));
});

// مسار جلب المستخدمين الخاص بلوحة تحكم المشرف مع التحقق من الصلاحية
app.post('/api/admin/users', (req, res) => {
    const { email } = req.body;
    const users = readJsonFile(USERS_FILE);
    
    const adminUser = users.find(u => u.email.toLowerCase() === (email || '').trim().toLowerCase() && u.role === 'admin');
    
    if (!adminUser) {
        return res.json({ 
            success: false, 
            message: '⛔ ليس لديك صلاحية المشرف للوصول إلى هذه البيانات!' 
        });
    }
    
    res.json({ 
        success: true, 
        users: users.map(u => ({ 
            name: u.name, 
            email: u.email, 
            pass: u.pass, 
            role: u.role === 'admin' ? 'مشرف (Admin)' : 'طالب (Student)' 
        })) 
    });
});

// مسار حذف الحساب من قبل المشرف
app.post('/api/admin/delete-user', (req, res) => {
    const { adminEmail, userEmailToDelete } = req.body;
    const users = readJsonFile(USERS_FILE);

    const adminUser = users.find(u => u.email.toLowerCase() === (adminEmail || '').trim().toLowerCase() && u.role === 'admin');
    if (!adminUser) {
        return res.json({ success: false, message: '⛔ ليس لديك صلاحية إجراء الحذف!' });
    }

    if (adminEmail.trim().toLowerCase() === userEmailToDelete.trim().toLowerCase()) {
        return res.json({ success: false, message: '⚠️ لا يمكنك حذف حساب المشرف الخاص بك!' });
    }

    const initialLength = users.length;
    const filteredUsers = users.filter(u => u.email.toLowerCase() !== userEmailToDelete.trim().toLowerCase());

    if (filteredUsers.length < initialLength) {
        writeJsonFile(USERS_FILE, filteredUsers);
        return res.json({ success: true, message: '🗑️ تم حذف الحساب بنجاح من النظام!' });
    } else {
        return res.json({ success: false, message: '❌ لم يتم العثور على الحساب المراد حذفه.' });
    }
});

// ==================== مسارات إدارة النماذج (دعم كافة الاحتمالات لمنع الأخطاء) ====================

// دالة مشتركة لتوليد قائمة النماذج
function getModelsData() {
    const questions = readJsonFile(QUESTIONS_FILE);
    const modelsStatus = readJsonFile(MODELS_STATUS_FILE, {});

    const uniqueModelIds = [...new Set(questions.map(q => Number(q.model) || 1))];
    const finalModelIds = uniqueModelIds.length > 0 ? uniqueModelIds : [1, 2, 3, 4, 5];

    return finalModelIds.map(modelId => ({
        modelId: modelId,
        model: modelId,
        active: modelsStatus[modelId] !== undefined ? modelsStatus[modelId].active : true,
        questionsCount: questions.filter(q => (Number(q.model) || 1) === modelId).length
    }));
}

// تغطية كافة المسارات المحتملة التي قد تطلبها الواجهة الأمامية
app.get('/api/models', (req, res) => res.json(getModelsData()));
app.get('/api/get-models', (req, res) => res.json(getModelsData()));
app.get('/api/exam-models', (req, res) => res.json(getModelsData()));

// تنشيط أو تعطيل نموذج معين (مع تغطية المسارين الشائعين)
const handleToggleModel = (req, res) => {
    const { adminEmail, modelId, active } = req.body;
    const users = readJsonFile(USERS_FILE);

    const adminUser = users.find(u => u.email.toLowerCase() === (adminEmail || '').trim().toLowerCase() && u.role === 'admin');
    if (!adminUser) {
        return res.json({ success: false, message: '⛔ ليس لديك صلاحية لتغيير حالة النموذج!' });
    }

    if (modelId === undefined || modelId === null) {
        return res.json({ success: false, message: '⚠️ رقم النموذج مطلوب!' });
    }

    const modelsStatus = readJsonFile(MODELS_STATUS_FILE, {});
    modelsStatus[modelId] = { active: Boolean(active) };
    writeJsonFile(MODELS_STATUS_FILE, modelsStatus);
    
    const statusText = active ? 'تنشيط' : 'تعطيل';
    res.json({ success: true, message: `✅ تم ${statusText} النموذج رقم ${modelId} بنجاح!` });
};

app.post('/api/admin/toggle-model', handleToggleModel);
app.post('/api/toggle-model', handleToggleModel);

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بكفاءة على الرابط: http://localhost:${PORT}`);
});
