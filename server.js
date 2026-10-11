const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات الوسيط (Middleware)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// رابط الاتصال بقاعدة بيانات MongoDB Atlas
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://bydakrm767_db_user:xjkZUKddqm12a6jU@cluster0.vneutrw.mongodb.net/?appName=Cluster0';

// الاتصال بقاعدة البيانات مع إعدادات الاستقرار
mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000
})
    .then(() => console.log('🚀 تم الاتصال بقاعدة بيانات MongoDB Atlas بنجاح!'))
    .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

// ==================== تعريف النماذج (Schemas) في قاعدة البيانات ====================
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    pass: { type: String, required: true },
    role: { type: String, default: 'student' }
});
const User = mongoose.model('User', userSchema);

const questionSchema = new mongoose.Schema({
    id: Number,
    section: String,
    type: String,
    model: Number,
    score: Number,
    question: String,
    options: [String],
    correct_answer: String,
    image: String
});
const Question = mongoose.model('Question', questionSchema);

const customModelSchema = new mongoose.Schema({
    key: { type: String, unique: true },
    name: String
});
const CustomModel = mongoose.model('CustomModel', customModelSchema);

const modelStatusSchema = new mongoose.Schema({
    uniqueKey: { type: String, unique: true },
    active: Boolean
});
const ModelStatus = mongoose.model('ModelStatus', modelStatusSchema);

// تهيئة حساب المشرف الافتراضي عند تشغيل السيرفر لأول مرة
async function initAdmin() {
    try {
        const adminEmail = 'bydakrm767@gmail.com';
        const existingAdmin = await User.findOne({ email: adminEmail });
        if (!existingAdmin) {
            await User.create({
                name: 'أكرم عبيد',
                email: adminEmail,
                pass: 'Zain@123',
                role: 'admin'
            });
            console.log('👑 تم إنشاء حساب المشرف الافتراضي بنجاح.');
        }
    } catch (e) {
        console.error('Error initializing admin:', e);
    }
}
initAdmin();

// ==================== مسارات الـ API ====================

// تسجيل حساب جديد
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, pass } = req.body;
        if (!name || !email || !pass) {
            return res.json({ success: false, message: '⚠️ يرجى تعبئة جميع الحقول المطلوبة!' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.json({ success: false, message: '⚠️ هذا البريد مسجل مسبقاً!' });
        }

        await User.create({
            name: name.trim(),
            email: normalizedEmail,
            pass,
            role: 'student'
        });

        res.json({ success: true, message: '🎉 تم إنشاء الحساب بنجاح!' });
    } catch (error) {
        console.error('❌ Register Error Details:', error);
        res.json({ success: false, message: '❌ حدث خطأ في الخادم' });
    }
});

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    try {
        const { email, pass } = req.body;
        if (!email || !pass) {
            return res.json({ success: false, message: '⚠️ يرجى إدخال البريد وكلمة المرور!' });
        }

        const user = await User.findOne({ 
            email: email.trim().toLowerCase(), 
            pass: pass 
        });

        if (!user) {
            return res.json({ success: false, message: '❌ بيانات الدخول خاطئة!' });
        }

        res.json({ 
            success: true, 
            name: user.name, 
            role: user.role, 
            email: user.email 
        });
    } catch (error) {
        console.error('❌ Login Error Details:', error);
        res.json({ success: false, message: '❌ حدث خطأ في الخادم' });
    }
});

// استعادة / تحديث كلمة المرور
app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, newPass } = req.body;
        if (!email || !newPass) {
            return res.json({ success: false, message: '⚠️ يرجى إدخال البريد وكلمة المرور الجديدة!' });
        }

        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (!user) {
            return res.json({ success: false, message: '❌ البريد الإلكتروني غير مسجل في النظام!' });
        }

        user.pass = newPass;
        await user.save();
        res.json({ success: true, message: '✅ تم تحديث كلمة المرور بنجاح!' });
    } catch (error) {
        console.error('❌ Reset Password Error Details:', error);
        res.json({ success: false, message: '❌ حدث خطأ في الخادم' });
    }
});

// جلب جميع الأسئلة
app.get('/api/questions', async (req, res) => {
    try {
        const questions = await Question.find({});
        res.json(questions);
    } catch (error) {
        res.json([]);
    }
});

// إضافة سؤال جديد
app.post('/api/add-question', async (req, res) => {
    try {
        const { section, type, model, score, question, options, correct_answer, image } = req.body;
        const modelNum = Number(model);

        const customModels = await CustomModel.find({});
        const customModelsMap = {};
        customModels.forEach(m => customModelsMap[m.key] = m.name);

        let modelExists = false;
        if (type === 'qiyas_simulation') {
            if (customModelsMap[`qiyas_simulation_${modelNum}`]) modelExists = true;
        } else {
            if (customModelsMap[`${section}_${type}_${modelNum}`]) modelExists = true;
        }

        if (!modelExists) {
            return res.json({ success: false, message: '⚠️ لا توجد نماذج في المكان المختار أو النموذج غير مُنشأ مسبقاً!' });
        }

        const count = await Question.countDocuments();
        await Question.create({
            id: count > 0 ? count + 1 : 1,
            section: section || "quant",
            type: type || 'practice',
            model: modelNum,
            score: Number(score) || 1,
            question,
            options,
            correct_answer,
            image: image || null
        });

        res.json({ success: true, message: '🎯 تم حفظ السؤال بنجاح!' });
    } catch (error) {
        console.error('❌ Add Question Error Details:', error);
        res.json({ success: false, message: '❌ حدث خطأ أثناء حفظ السؤال' });
    }
});

// تعديل وحفظ السؤال
app.post('/api/edit-question', async (req, res) => {
    try {
        const { index, section, type, model, score, question, options, correct_answer, image } = req.body;
        const questions = await Question.find({});
        
        if (index !== undefined && index >= 0 && index < questions.length) {
            const targetQuestion = questions[index];
            const customModels = await CustomModel.find({});
            const customModelsMap = {};
            customModels.forEach(m => customModelsMap[m.key] = m.name);

            let modelExists = false;
            const modelNum = Number(model);
            if (type === 'qiyas_simulation') {
                if (customModelsMap[`qiyas_simulation_${modelNum}`]) modelExists = true;
            } else {
                if (customModelsMap[`${section}_${type}_${modelNum}`]) modelExists = true;
            }

            if (!modelExists) {
                return res.json({ success: false, message: '⚠️ عذراً، لا توجد نماذج في المكان المختار لتوجيه السؤال إليها!' });
            }

            targetQuestion.section = section || "quant";
            targetQuestion.type = type || 'practice';
            targetQuestion.model = modelNum;
            targetQuestion.score = Number(score) || 1;
            targetQuestion.question = question;
            targetQuestion.options = options;
            targetQuestion.correct_answer = correct_answer;
            targetQuestion.image = image || null;

            await targetQuestion.save();
            return res.json({ success: true, message: '✏️ تم تعديل وحفظ السؤال بنجاح!' });
        }
        res.json({ success: false, message: '❌ السؤال غير موجود!' });
    } catch (e) {
        console.error('❌ Edit Question Error Details:', e);
        res.json({ success: false, message: '❌ حدث خطأ أثناء تعديل السؤال' });
    }
});

// نقل السؤال إلى نموذج آخر محدد
app.post('/api/move-question', async (req, res) => {
    try {
        const { index, section, type, model } = req.body;
        const questions = await Question.find({});

        if (index !== undefined && index >= 0 && index < questions.length) {
            const targetQuestion = questions[index];
            const customModels = await CustomModel.find({});
            const customModelsMap = {};
            customModels.forEach(m => customModelsMap[m.key] = m.name);

            let modelExists = false;
            const modelNum = Number(model);
            if (type === 'qiyas_simulation') {
                if (customModelsMap[`qiyas_simulation_${modelNum}`]) modelExists = true;
            } else {
                if (customModelsMap[`${section}_${type}_${modelNum}`]) modelExists = true;
            }

            if (!modelExists) {
                return res.json({ success: false, message: '⚠️ لا يوجد نموذج مضاف في المكان المختار لتتمكن من نقل السؤال إليه!' });
            }

            targetQuestion.section = section;
            targetQuestion.type = type;
            targetQuestion.model = modelNum;

            await targetQuestion.save();
            return res.json({ success: true, message: '🚚 تم نقل السؤال بنجاح إلى المكان المطلوب!' });
        }
        res.json({ success: false, message: '❌ السؤال غير موجود!' });
    } catch (e) {
        console.error('❌ Move Question Error Details:', e);
        res.json({ success: false, message: '❌ حدث خطأ أثناء النقل' });
    }
});

// حذف سؤال بواسطة الـ Index
app.post('/api/delete-question', async (req, res) => {
    try {
        const { index } = req.body;
        const questions = await Question.find({});
        
        if (index !== undefined && index >= 0 && index < questions.length) {
            await questions[index].deleteOne();
            return res.json({ success: true, message: '🗑️ تم حذف السؤال بنجاح!' });
        }
        res.json({ success: false, message: '❌ السؤال غير موجود!' });
    } catch (e) {
        console.error('❌ Delete Question Error Details:', e);
        res.json({ success: false, message: '❌ حدث خطأ أثناء الحذف' });
    }
});

// جلب النماذج المخصصة والمسميات
app.get('/api/custom-models', async (req, res) => {
    try {
        const customModels = await CustomModel.find({});
        const modelsMap = {};
        customModels.forEach(m => modelsMap[m.key] = m.name);
        res.json({ success: true, models: modelsMap });
    } catch (e) {
        res.json({ success: true, models: {} });
    }
});

// إضافة وتسمية نموذج جديد
app.post('/api/add-custom-model', async (req, res) => {
    try {
        const { category, modelNumber, customName } = req.body;
        if (!category || !modelNumber || !customName) {
            return res.json({ success: false, message: '⚠️ يرجى تعبئة جميع الحقول!' });
        }
        const key = `${category}_${modelNumber}`;

        const existing = await CustomModel.findOne({ key });
        if (existing) {
            return res.json({ success: false, message: '⚠️ هذا رقم النموذج موجود مسبقاً في هذا القسم والنوع!' });
        }

        await CustomModel.create({ key, name: customName.trim() });
        res.json({ success: true, message: '✅ تم حفظ تسمية النموذج بنجاح!' });
    } catch (e) {
        console.error('❌ Add Custom Model Error Details:', e);
        res.json({ success: false, message: '❌ حدث خطأ أثناء حفظ النموذج' });
    }
});

// حذف النموذج المحدد بدقة تامة باستخدام الـ Key الفريد
app.post('/api/admin/delete-model', async (req, res) => {
    try {
        const { modelKey, modelNumber } = req.body;
        if (modelKey) {
            const parts = modelKey.split('_');
            const targetNum = Number(parts.pop());
            const targetType = parts.pop();
            const targetSec = parts.join('_');
            
            await CustomModel.deleteOne({ key: modelKey });
            await ModelStatus.deleteOne({ uniqueKey: modelKey });
            await Question.deleteMany({ section: targetSec, type: targetType, model: targetNum });
        } else if (modelNumber) {
            await CustomModel.deleteMany({ key: new RegExp(`_${modelNumber}$`) });
            await Question.deleteMany({ model: Number(modelNumber) });
        }

        res.json({ success: true, message: '🗑️ تم حذف النموذج المحدد بنجاح دون التأثير على النماذج الأخرى!' });
    } catch (e) {
        console.error('❌ Delete Model Error Details:', e);
        res.json({ success: false, message: '❌ حدث خطأ أثناء الحذف' });
    }
});

// تعديل وتحديث نفس النموذج كلياً دون إنشاء نموذج جديد (تحديث النوع/القسم والاسم مع الحفاظ على الرقم ونقل الأسئلة بدقة)
app.post('/api/admin/edit-model-full', async (req, res) => {
    try {
        const { oldKey, modelNumber, newName, newCategory } = req.body;
        if (!oldKey || !newName || !newCategory) {
            return res.json({ success: false, message: '⚠️ بيانات غير مكتملة!' });
        }

        // تحليل معلومات النموذج القديم بدقة من الـ oldKey
        let oldSec = '', oldType = '', oldModelNum = Number(modelNumber);
        const oldParts = oldKey.split('_');
        oldModelNum = Number(oldParts.pop());
        oldType = oldParts.pop();
        oldSec = oldParts.join('_');

        // تحديد القسم والنوع الجديد وبادئة المفتاح الجديد
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

        // تحديد رقم النموذج الجديد: إذا كان النقل داخل نفس القسم ونفس النوع، نحتفظ بنفس الرقم، وإذا تغير القسم/النوع نأخذ الرقم التالي المتاح
        let assignedModelNum = oldModelNum;
        const isSameCategoryType = (oldSec === updatedSection && oldType === updatedType);

        if (!isSameCategoryType) {
            const allCustomModels = await CustomModel.find({});
            let maxNum = 0;
            allCustomModels.forEach(m => {
                if (m.key.startsWith(targetSectionPrefix)) {
                    const numPart = Number(m.key.split('_').pop());
                    if (!isNaN(numPart) && numPart > maxNum) {
                        maxNum = numPart;
                    }
                }
            });
            assignedModelNum = maxNum + 1;
        }

        // 1. حذف المفتاح القديم تماماً من جدول النماذج المخصصة والحالة لكي يختفي من المكان القديم تماماً
        await CustomModel.deleteOne({ key: oldKey });
        await ModelStatus.deleteOne({ uniqueKey: oldKey });

        // 2. إنشاء المفتاح الجديد بالاسم والرقم الصحيح في القسم المستهدف
        const newKey = `${targetSectionPrefix}${assignedModelNum}`;
        // للتأكد من عدم تكرار المفتاح إن وجد مسبقاً، نقوم بحذفه أولاً
        await CustomModel.deleteOne({ key: newKey });
        await CustomModel.create({ key: newKey, name: newName.trim() });

        // 3. تحديث ونقل الأسئلة الخاصة بهذا النموذج إلى القسم والنوع ورقم النموذج الجديد
        await Question.updateMany(
            { section: oldSec, type: oldType, model: oldModelNum },
            { section: updatedSection, type: updatedType, model: assignedModelNum }
        );

        res.json({ success: true, message: `✅ تم تحديث وتعديل النموذج بنجاح وتم نقله كلياً إلى المكان الجديد!` });
    } catch (e) {
        console.error('❌ Edit Model Full Error Details:', e);
        res.json({ success: false, message: '❌ حدث خطأ أثناء التحديث' });
    }
});

// مسار جلب المستخدمين الخاص بلوحة تحكم المشرف
app.post('/api/admin/users', async (req, res) => {
    try {
        const { email } = req.body;
        const adminUser = await User.findOne({ email: (email || '').trim().toLowerCase(), role: 'admin' });
        
        if (!adminUser) {
            return res.json({ 
                success: false, 
                message: '⛔ ليس لديك صلاحية المشرف للوصول إلى هذه البيانات!' 
            });
        }
        
        const users = await User.find({});
        res.json({ 
            success: true, 
            users: users.map(u => ({ 
                name: u.name, 
                email: u.email, 
                pass: u.pass, 
                role: u.role === 'admin' ? 'مشرف (Admin)' : 'طالب (Student)' 
            })) 
        });
    } catch (e) {
        console.error('❌ Admin Users Error Details:', e);
        res.json({ success: false, message: '❌ حدث خطأ في الخادم' });
    }
});

// مسار حذف الحساب من قبل المشرف
app.post('/api/admin/delete-user', async (req, res) => {
    try {
        const { adminEmail, userEmailToDelete } = req.body;
        const adminUser = await User.findOne({ email: (adminEmail || '').trim().toLowerCase(), role: 'admin' });
        
        if (!adminUser) {
            return res.json({ success: false, message: '⛔ ليس لديك صلاحية إجراء الحذف!' });
        }

        if (adminEmail.trim().toLowerCase() === userEmailToDelete.trim().toLowerCase()) {
            return res.json({ success: false, message: '⚠️ لا يمكنك حذف حساب المشرف الخاص بك!' });
        }

        const result = await User.deleteOne({ email: userEmailToDelete.trim().toLowerCase() });
        if (result.deletedCount > 0) {
            return res.json({ success: true, message: '🗑️ تم حذف الحساب بنجاح من النظام!' });
        } else {
            return res.json({ success: false, message: '❌ لم يتم العثور على الحساب المراد حذفه.' });
        }
    } catch (e) {
        console.error('❌ Delete User Error Details:', e);
        res.json({ success: false, message: '❌ حدث خطأ في الخادم' });
    }
});

// ==================== مسارات إدارة النماذج (للمشرف) ====================

app.get('/api/admin/models-status', async (req, res) => {
    try {
        const questions = await Question.find({});
        const statuses = await ModelStatus.find({});
        const modelsStatusMap = {};
        statuses.forEach(s => modelsStatusMap[s.uniqueKey] = s.active);

        const customModels = await CustomModel.find({});
        const customModelsMap = {};
        customModels.forEach(m => customModelsMap[m.key] = m.name);

        const result = {
            quant: {},
            verbal: {},
            mock: {}
        };

        Object.keys(customModelsMap).forEach(key => {
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
                    isActive: modelsStatusMap[uniqueModelKey] ?? true
                };
            }
        });

        questions.forEach(q => {
            let sec = q.section === 'verbal' ? 'verbal' : 'quant';
            if (q.type === 'qiyas_simulation') {
                sec = 'mock';
            }
            const mNum = Number(q.model) || 1;
            
            Object.keys(result[sec]).forEach(uKey => {
                const mData = result[sec][uKey];
                if (mData.modelNumber === mNum) {
                    if (sec === 'mock' || mData.categoryType.includes(q.type)) {
                        mData.questionCount++;
                    }
                }
            });
        });

        res.json({ success: true, models: result });
    } catch (error) {
        console.error('❌ Models Status Error Details:', error);
        res.json({ success: false, message: '❌ حدث خطأ أثناء جلب النماذج' });
    }
});

app.post('/api/admin/toggle-model', async (req, res) => {
    try {
        const { adminEmail, section, uniqueKey } = req.body;
        const adminUser = await User.findOne({ email: (adminEmail || '').trim().toLowerCase(), role: 'admin' });
        
        if (!adminUser) {
            return res.json({ success: false, message: '⛔ ليس لديك صلاحية لتغيير حالة النموذج!' });
        }

        if (!section || !uniqueKey) {
            return res.json({ success: false, message: '⚠️ بيانات النموذج غير مكتملة!' });
        }

        let modelStatus = await ModelStatus.findOne({ uniqueKey });
        const currentActive = modelStatus ? modelStatus.active : true;

        if (modelStatus) {
            modelStatus.active = !currentActive;
            await modelStatus.save();
        } else {
            await ModelStatus.create({ uniqueKey, active: false });
        }

        res.json({ success: true, message: '✅ تم تحديث حالة النموذج بنجاح!' });
    } catch (e) {
        console.error('❌ Toggle Model Error Details:', e);
        res.json({ success: false, message: '❌ حدث خطأ في الخادم' });
    }
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بكفاءة على الرابط: http://localhost:${PORT}`);
});
