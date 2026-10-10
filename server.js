const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات الوسيط (Middleware)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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

// إضافة سؤال جديد
app.post('/api/add-question', (req, res) => {
    const { section, type, model, score, question, options, correct_answer, image } = req.body;
    const modelNum = Number(model);
    
    const customModels = readJsonFile(CUSTOM_MODELS_FILE, {});
    let modelExists = false;

    if (type === 'qiyas_simulation') {
        if (customModels[`qiyas_simulation_${modelNum}`]) modelExists = true;
    } else {
        if (customModels[`${section}_${type}_${modelNum}`]) {
            modelExists = true;
        }
    }

    if (!modelExists) {
        return res.json({ success: false, message: '⚠️ لا توجد نماذج في المكان المختار أو النموذج غير مُنشأ مسبقاً!' });
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
        const customModels = readJsonFile(CUSTOM_MODELS_FILE, {});
        let modelExists = false;
        const modelNum = Number(model);

        if (type === 'qiyas_simulation') {
            if (customModels[`qiyas_simulation_${modelNum}`]) modelExists = true;
        } else {
            if (customModels[`${section}_${type}_${modelNum}`]) {
                modelExists = true;
            }
        }

        if (!modelExists) {
            return res.json({ success: false, message: '⚠️ عذراً، لا توجد نماذج في المكان المختار لتوجيه السؤال إليها!' });
        }

        questions[index] = {
            id: questions[index].id, 
            section: section || "quant",
            type: type || 'practice',
            model: modelNum,
            score: Number(score) || 1,
            question,
            options,
            correct_answer,
            image: image || null
        };
        
        writeJsonFile(QUESTIONS_FILE, questions);
        return res.json({ success: true, message: '✏️ تم تعديل وحفظ السؤال بنجاح!' });
    }
    res.json({ success: false, message: '❌ السؤال غير موجود!' });
});

// نقل السؤال إلى نموذج آخر محدد
app.post('/api/move-question', (req, res) => {
    const { index, section, type, model } = req.body;
    const questions = readJsonFile(QUESTIONS_FILE);

    if (index !== undefined && index >= 0 && index < questions.length) {
        const customModels = readJsonFile(CUSTOM_MODELS_FILE, {});
        let modelExists = false;
        const modelNum = Number(model);

        if (type === 'qiyas_simulation') {
            if (customModels[`qiyas_simulation_${modelNum}`]) modelExists = true;
        } else {
            if (customModels[`${section}_${type}_${modelNum}`]) {
                modelExists = true;
            }
        }

        if (!modelExists) {
            return res.json({ success: false, message: '⚠️ لا يوجد نموذج مضاف في المكان المختار لتتمكن من نقل السؤال إليه!' });
        }

        questions[index].section = section;
        questions[index].type = type;
        questions[index].model = modelNum;

        writeJsonFile(QUESTIONS_FILE, questions);
        return res.json({ success: true, message: '🚚 تم نقل السؤال بنجاح إلى المكان المطلوب!' });
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

// إضافة وتسمية نموذج جديد
app.post('/api/add-custom-model', (req, res) => {
    const { category, modelNumber, customName } = req.body;
    if (!category || !modelNumber || !customName) {
        return res.json({ success: false, message: '⚠️ يرجى تعبئة جميع الحقول!' });
    }
    const customModels = readJsonFile(CUSTOM_MODELS_FILE, {});
    const key = `${category}_${modelNumber}`;

    if (customModels[key]) {
        return res.json({ success: false, message: '⚠️ هذا رقم النموذج موجود مسبقاً في هذا القسم والنوع!' });
    }

    customModels[key] = customName.trim();
    writeJsonFile(CUSTOM_MODELS_FILE, customModels);
    res.json({ success: true, message: '✅ تم حفظ تسمية النموذج بنجاح!' });
});

// حذف النموذج بشكل كامل مع إزالة الأسئلة المرتبطة به
app.post('/api/admin/delete-model', (req, res) => {
    const { modelKey, modelNumber } = req.body;
    const customModels = readJsonFile(CUSTOM_MODELS_FILE, {});

    if (modelKey && customModels[modelKey]) {
        delete customModels[modelKey];
    } else {
        Object.keys(customModels).forEach(k => {
            if (k.endsWith(`_${modelNumber}`)) {
                delete customModels[k];
            }
        });
    }
    writeJsonFile(CUSTOM_MODELS_FILE, customModels);

    let questions = readJsonFile(QUESTIONS_FILE);
    questions = questions.filter(q => Number(q.model) !== Number(modelNumber));
    writeJsonFile(QUESTIONS_FILE, questions);

    res.json({ success: true, message: '🗑️ تم حذف النموذج بنجاح من النظام!' });
});

// تعديل وتغيير نوع ونموذج الاختبار بالكامل (مع الترقيم التسلسلي التلقائي الذكي عند النقل لمنع التداخل وحذف النماذج الأخرى)
app.post('/api/admin/edit-model-full', (req, res) => {
    const { oldKey, modelNumber, newName, newCategory } = req.body;
    if (!oldKey || !newName || !newCategory) {
        return res.json({ success: false, message: '⚠️ بيانات غير مكتملة!' });
    }

    const customModels = readJsonFile(CUSTOM_MODELS_FILE, {});
    
    let targetSectionPrefix = '';
    let updatedSection = 'quant';
    let updatedType = 'practice';

    if (newCategory.startsWith('quant')) {
        updatedSection = 'quant';
        updatedType = newCategory.includes('simulation') ? 'simulation' : 'practice';
        targetSectionPrefix = newCategory.includes('simulation') ? 'quant_simulation_' : 'quant_practice_';
    } else if (newCategory.startsWith('verbal')) {
        updatedSection = 'verbal';
        updatedType = newCategory.includes('simulation') ? 'simulation' : 'practice';
        targetSectionPrefix = newCategory.includes('simulation') ? 'verbal_simulation_' : 'verbal_practice_';
    } else if (newCategory.startsWith('qiyas')) {
        updatedSection = 'quant';
        updatedType = 'qiyas_simulation';
        targetSectionPrefix = 'qiyas_simulation_';
    }

    const isSameCategory = oldKey.startsWith(newCategory + '_');
    let assignedModelNum = Number(modelNumber);

    if (!isSameCategory) {
        // حساب أعلى رقم نموذج موجود في القسم المستهدف لمنح رقم تالي تلقائي جديد تماماً دون مساس بالنماذج الموجودة
        let maxNum = 0;
        Object.keys(customModels).forEach(k => {
            if (k.startsWith(targetSectionPrefix)) {
                const numPart = Number(k.split('_').pop());
                if (!isNaN(numPart) && numPart > maxNum) {
                    maxNum = numPart;
                }
            }
        });
        assignedModelNum = maxNum + 1;
    }

    // حذف المفتاح القديم فقط وعدم المساس بأي نموذج آخر في القسم المستهدف
    if (customModels[oldKey]) {
        delete customModels[oldKey];
    }

    // حفظ النموذج بالرقم والمفتاح الجديد في القسم المستهدف
    const newKey = `${targetSectionPrefix}${assignedModelNum}`;
    customModels[newKey] = newName.trim();
    writeJsonFile(CUSTOM_MODELS_FILE, customModels);

    let oldSec = 'quant', oldType = 'practice', oldModelNum = Number(modelNumber);
    const parts = oldKey.split('_');
    if (oldKey.startsWith('qiyas_simulation_')) {
        oldSec = 'quant';
        oldType = 'qiyas_simulation';
        oldModelNum = Number(parts[parts.length - 1]);
    } else {
        oldSec = parts[0];
        oldType = parts[1];
        oldModelNum = Number(parts[parts.length - 1]);
    }

    // تحديث الأسئلة التابعة لهذا النموذج للقسم ورقم النموذج الجديد بدقة
    const questions = readJsonFile(QUESTIONS_FILE);
    questions.forEach(q => {
        const isMatch = (q.section === oldSec && q.type === oldType && Number(q.model) === oldModelNum) ||
                        (oldType === 'qiyas_simulation' && q.type === 'qiyas_simulation' && Number(q.model) === oldModelNum);
        if (isMatch) {
            q.section = updatedSection;
            q.type = updatedType;
            q.model = assignedModelNum;
        }
    });
    writeJsonFile(QUESTIONS_FILE, questions);

    res.json({ success: true, message: `✅ تم نقل وتحديث النموذج بنجاح وإعطاؤه الرقم التسلسلي الجديد (${assignedModelNum}) تلقائياً دون أي تداخل أو حذف للنماذج الأخرى!` });
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

        Object.keys(customModels).forEach(key => {
            const lastUnderscoreIdx = key.lastIndexOf('_');
            const catPart = key.substring(0, lastUnderscoreIdx);
            const modelNum = Number(key.substring(lastUnderscoreIdx + 1));

            let secKey = '';
            if (catPart.startsWith('quant')) secKey = 'quant';
            else if (catPart.startsWith('verbal')) secKey = 'verbal';
            else if (catPart.startsWith('qiyas')) secKey = 'mock';

            const uniqueModelKey = `${catPart}_${modelNum}`;

            if (secKey && !result[secKey][uniqueModelKey]) {
                result[secKey][uniqueModelKey] = {
                    modelNumber: modelNum,
                    categoryType: catPart,
                    customKey: key,
                    questionCount: 0,
                    isActive: modelsStatus[uniqueModelKey]?.active ?? true
                };
            }
        });

        questions.forEach(q => {
            let sec = q.section === 'verbal' ? 'verbal' : 'quant';
            if (q.type === 'qiyas_simulation') {
                sec = 'mock';
            }
            const mNum = Number(q.model) || 1;
            
            let matchedKey = '';
            Object.keys(result[sec]).forEach(uKey => {
                const mData = result[sec][uKey];
                if (mData.modelNumber === mNum) {
                    if (sec === 'mock' || mData.categoryType.includes(q.type)) {
                        matchedKey = uKey;
                    }
                }
            });

            if (!matchedKey) {
                matchedKey = `${sec}_practice_${mNum}`;
                if (!result[sec][matchedKey]) {
                    result[sec][matchedKey] = {
                        modelNumber: mNum,
                        categoryType: `${sec}_practice`,
                        customKey: matchedKey,
                        questionCount: 0,
                        isActive: modelsStatus[matchedKey]?.active ?? true
                    };
                }
            }

            result[sec][matchedKey].questionCount++;
        });

        res.json({ success: true, models: result });
    } catch (error) {
        res.json({ success: false, message: '❌ حدث خطأ أثناء جلب النماذج' });
    }
});

app.post('/api/admin/toggle-model', (req, res) => {
    const { adminEmail, section, uniqueKey } = req.body;
    const users = readJsonFile(USERS_FILE);

    const adminUser = users.find(u => u.email.toLowerCase() === (adminEmail || '').trim().toLowerCase() && u.role === 'admin');
    if (!adminUser) {
        return res.json({ success: false, message: '⛔ ليس لديك صلاحية لتغيير حالة النموذج!' });
    }

    if (!section || !uniqueKey) {
        return res.json({ success: false, message: '⚠️ بيانات النموذج غير مكتملة!' });
    }

    const modelsStatus = readJsonFile(MODELS_STATUS_FILE, {});
    const currentActive = modelsStatus[uniqueKey]?.active ?? true;
    modelsStatus[uniqueKey] = { active: !currentActive };
    
    writeJsonFile(MODELS_STATUS_FILE, modelsStatus);
    res.json({ success: true, message: '✅ تم تحديث حالة النموذج بنجاح!' });
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بكفاءة على الرابط: http://localhost:${PORT}`);
});
