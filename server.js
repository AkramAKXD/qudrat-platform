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
const CUSTOM_MODELS_FILE = path.join(__dirname, 'custom_models.json');

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
if (!fs.existsSync(CUSTOM_MODELS_FILE)) {
    writeJsonFile(CUSTOM_MODELS_FILE, {});
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

// إضافة سؤال جديد (التحقق من أن النموذج قد تم إنشاؤه وتسميته مسبقاً)
app.post('/api/add-question', (req, res) => {
    const { section, type, model, score, question, options, correct_answer, image } = req.body;
    const modelNum = Number(model);
    
    // التحقق هل تم إنشاء هذا النموذج مسبقاً من خلال قائمة النماذج المخصصة
    const customModels = readJsonFile(CUSTOM_MODELS_FILE, {});
    let modelExists = false;

    if (type === 'qiyas_simulation') {
        if (customModels[`qiyas_simulation_${modelNum}`]) modelExists = true;
    } else {
        if (customModels[`${section}_${type}_${modelNum}`] || customModels[`${section}_practice_${modelNum}`] || customModels[`${section}_simulation_${modelNum}`]) {
            modelExists = true;
        }
    }

    if (!modelExists) {
        return res.json({ success: false, message: '⚠️ لا يمكنك إضافة سؤال لنموذج لم تقم بإنشائه وتسميته من قسم "إضافة نماذج للاختبار" أولاً!' });
    }

    const questions = readJsonFile(QUESTIONS_FILE);
    questions.push({ 
        id: questions.length > 0 ? questions[questions.length - 1].id + 1 : 1, 
        section: section || "quant", 
        type: type || 'practice', 
        model: modelNum, 
        score: Number(score) || 1,
        question, 
        options, 
        correct_answer, 
        image: image || null 
    });
    
    writeJsonFile(QUESTIONS_FILE, questions);
    res.json({ success: true, message: '🎯 تم حفظ السؤال بنجاح!' });
});

// تعديل وحفظ السؤال
app.post('/api/edit-question', (req, res) => {
    const { index, section, type, model, score, question, options, correct_answer, image } = req.body;
    const questions = readJsonFile(QUESTIONS_FILE);
    
    if (index !== undefined && index >= 0 && index < questions.length) {
        questions[index] = {
            id: questions[index].id, 
            section: section || "quant",
            type: type || 'practice',
            model: Number(model) || 1,
            score: Number(score) || 1,
            question,
            options,
            correct_answer,
            image: image || questions[index].image || null
        };
        
        writeJsonFile(QUESTIONS_FILE, questions);
        return res.json({ success: true, message: '✏️ تم تعديل وحفظ السؤال بنجاح!' });
    }
    res.json({ success: false, message: '❌ السؤال غير موجود!' });
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

// جلب النماذج المخصصة والمسميات
app.get('/api/custom-models', (req, res) => {
    const customModels = readJsonFile(CUSTOM_MODELS_FILE, {});
    res.json({ success: true, models: customModels });
});

// إضافة وتسمية نموذج جديد (عدد غير محدد / لا نهائي)
app.post('/api/add-custom-model', (req, res) => {
    const { category, modelNumber, customName } = req.body;
    if (!category || !modelNumber || !customName) {
        return res.json({ success: false, message: '⚠️ يرجى تعبئة جميع الحقول!' });
    }
    const customModels = readJsonFile(CUSTOM_MODELS_FILE, {});
    const key = `${category}_${modelNumber}`;
    customModels[key] = customName.trim();
    writeJsonFile(CUSTOM_MODELS_FILE, customModels);
    res.json({ success: true, message: '✅ تم حفظ تسمية النموذج بنجاح!' });
});

// مسار جلب المستخدمين الخاص بلوحة تحكم المشرف
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

// ==================== مسارات إدارة النماذج (للمشرف) ====================

// جلب حالة ونماذج الأقسام واختبارات قياس المحاكي للمشرف بناءً على النماذج التي أُنشئت
app.get('/api/admin/models-status', (req, res) => {
    try {
        const questions = readJsonFile(QUESTIONS_FILE);
        const modelsStatus = readJsonFile(MODELS_STATUS_FILE, {});
        const customModels = readJsonFile(CUSTOM_MODELS_FILE, {});

        const result = {
            quant: {},
            verbal: {},
            mock: {}
        };

        // بناء النماذج من النماذج المخصصة المسجلة فقط لضمان عرض النماذج التي أنشأها المستخدم فقط
        Object.keys(customModels).forEach(key => {
            // key format: quant_practice_1, quant_simulation_1, verbal_practice_1, verbal_simulation_1, qiyas_simulation_1
            const parts = key.split('_');
            const modelNum = Number(parts[parts.length - 1]);
            let secKey = '';
            
            if (key.startsWith('quant')) secKey = 'quant';
            else if (key.startsWith('verbal')) secKey = 'verbal';
            else if (key.startsWith('qiyas')) secKey = 'mock';

            if (secKey && !result[secKey][modelNum]) {
                result[secKey][modelNum] = {
                    modelNumber: modelNum,
                    questionCount: 0,
                    isActive: modelsStatus[`${secKey}_${modelNum}`]?.active ?? true
                };
            }
        });

        // حساب عدد الأسئلة لكل نموذج
        questions.forEach(q => {
            let sec = q.section === 'verbal' ? 'verbal' : 'quant';
            if (q.type === 'qiyas_simulation') {
                sec = 'mock';
            }
            const mNum = Number(q.model) || 1;
            
            if (!result[sec][mNum]) {
                result[sec][mNum] = {
                    modelNumber: mNum,
                    questionCount: 0,
                    isActive: modelsStatus[`${sec}_${mNum}`]?.active ?? true
                };
            }
            result[sec][mNum].questionCount++;
        });

        res.json({ success: true, models: result });
    } catch (error) {
        res.json({ success: false, message: '❌ حدث خطأ أثناء جلب النماذج' });
    }
});

// مسار تنشيط أو تعطيل النموذج (خاص بالمشرف)
app.post('/api/admin/toggle-model', (req, res) => {
    const { adminEmail, section, modelNumber } = req.body;
    const users = readJsonFile(USERS_FILE);

    const adminUser = users.find(u => u.email.toLowerCase() === (adminEmail || '').trim().toLowerCase() && u.role === 'admin');
    if (!adminUser) {
        return res.json({ success: false, message: '⛔ ليس لديك صلاحية لتغيير حالة النموذج!' });
    }

    if (!section || modelNumber === undefined) {
        return res.json({ success: false, message: '⚠️ بيانات النموذج غير مكتملة!' });
    }

    const modelsStatus = readJsonFile(MODELS_STATUS_FILE, {});
    const key = `${section}_${modelNumber}`;
    
    const currentActive = modelsStatus[key]?.active ?? true;
    modelsStatus[key] = { active: !currentActive };
    
    writeJsonFile(MODELS_STATUS_FILE, modelsStatus);
    
    res.json({ success: true, message: '✅ تم تحديث حالة النموذج بنجاح!' });
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بكفاءة على الرابط: http://localhost:${PORT}`);
});
