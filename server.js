const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const MONGO_URI = process.env.MONGO_URI;

// لا تستخدم رابط اتصال ثابتًا داخل الكود؛ عرّف MONGO_URI في متغيرات البيئة.
mongoose.connection.on('connected', () => console.log('✅ MongoDB متصل'));
mongoose.connection.on('disconnected', () => console.error('⚠️ انقطع اتصال MongoDB'));
mongoose.connection.on('error', err => console.error('❌ MongoDB:', err.message));

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

const attemptSchema = new mongoose.Schema({
    email: { type: String, required: true, lowercase: true, index: true },
    questionId: mongoose.Schema.Types.Mixed,
    section: { type: String, default: 'quant' },
    type: { type: String, default: 'practice' },
    model: { type: Number, default: 1 },
    chosenAnswer: String,
    correct: { type: Boolean, default: false },
    score: { type: Number, default: 1 },
    createdAt: { type: Date, default: Date.now, index: true }
});
const Attempt = mongoose.models.Attempt || mongoose.model('Attempt', attemptSchema);

async function initAdmin() {
    try {
        const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
        const adminPassword = process.env.ADMIN_PASSWORD;
        if (!adminEmail || !adminPassword) {
            console.log('ℹ️ لم يتم إنشاء مشرف تلقائي: عرّف ADMIN_EMAIL و ADMIN_PASSWORD إذا احتجت ذلك.');
            return;
        }
        const existingAdmin = await User.findOne({ email: adminEmail });
        if (!existingAdmin) {
            await User.create({ name: process.env.ADMIN_NAME || 'مشرف قمة', email: adminEmail, pass: adminPassword, role: 'admin' });
            console.log('👑 تم إنشاء حساب المشرف من متغيرات البيئة.');
        }
    } catch (e) {
        console.error('Error initializing admin:', e);
    }
}
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, pass } = req.body;
        if (!name || !email || !pass) return res.json({ success: false, message: '⚠️ يرجى تعبئة جميع الحقول!' });
        const normalizedEmail = email.trim().toLowerCase();
        if (await User.findOne({ email: normalizedEmail })) return res.json({ success: false, message: '⚠️ هذا البريد مسجل مسبقاً!' });
        await User.create({ name: name.trim(), email: normalizedEmail, pass, role: 'student' });
        res.json({ success: true, message: '🎉 تم إنشاء الحساب بنجاح!' });
    } catch (error) {
        console.error('POST /api/register:', error);
        res.status(500).json({ success: false, message: '❌ حدث خطأ في الخادم' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, pass } = req.body;
        const user = await User.findOne({ email: email.trim().toLowerCase(), pass: pass });
        if (!user) return res.json({ success: false, message: '❌ بيانات الدخول خاطئة!' });
        res.json({ success: true, name: user.name, role: user.role, email: user.email });
    } catch (error) {
        console.error('POST /api/login:', error);
        res.status(500).json({ success: false, message: '❌ حدث خطأ في الخادم' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, newPass } = req.body;
        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (!user) return res.json({ success: false, message: '❌ البريد غير مسجل!' });
        user.pass = newPass;
        await user.save();
        res.json({ success: true, message: '✅ تم تحديث كلمة المرور بنجاح!' });
    } catch (error) {
        res.json({ success: false, message: '❌ حدث خطأ في الخادم' });
    }
});

app.get('/api/questions', async (req, res) => {
    try {
        res.json(await Question.find({}));
    } catch (error) {
        res.json([]);
    }
});

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

        if (!modelExists) return res.json({ success: false, message: '⚠️ النموذج غير مُنشأ مسبقاً!' });

        const count = await Question.countDocuments();
        await Question.create({
            id: count > 0 ? count + 1 : 1,
            section: section || "quant",
            type: type || 'practice',
            model: modelNum,
            score: Number(score) || 1,
            question, options, correct_answer, image: image || null
        });
        res.json({ success: true, message: '🎯 تم حفظ السؤال بنجاح!' });
    } catch (error) {
        res.json({ success: false, message: '❌ حدث خطأ أثناء حفظ السؤال' });
    }
});

app.post('/api/edit-question', async (req, res) => {
    try {
        const { index, section, type, model, score, question, options, correct_answer, image } = req.body;
        const questions = await Question.find({});
        if (index !== undefined && index >= 0 && index < questions.length) {
            const targetQuestion = questions[index];
            targetQuestion.section = section || "quant";
            targetQuestion.type = type || 'practice';
            targetQuestion.model = Number(model);
            targetQuestion.score = Number(score) || 1;
            targetQuestion.question = question;
            targetQuestion.options = options;
            targetQuestion.correct_answer = correct_answer;
            targetQuestion.image = image || null;
            await targetQuestion.save();
            return res.json({ success: true, message: '✏️ تم تعديل السؤال بنجاح!' });
        }
        res.json({ success: false, message: '❌ السؤال غير موجود!' });
    } catch (e) {
        res.json({ success: false, message: '❌ حدث خطأ أثناء تعديل السؤال' });
    }
});

app.post('/api/move-question', async (req, res) => {
    try {
        const { index, section, type, model } = req.body;
        const questions = await Question.find({});
        if (index !== undefined && index >= 0 && index < questions.length) {
            const targetQuestion = questions[index];
            targetQuestion.section = section;
            targetQuestion.type = type;
            targetQuestion.model = Number(model);
            await targetQuestion.save();
            return res.json({ success: true, message: '🚚 تم نقل السؤال بنجاح!' });
        }
        res.json({ success: false, message: '❌ السؤال غير موجود!' });
    } catch (e) {
        res.json({ success: false, message: '❌ حدث خطأ أثناء النقل' });
    }
});

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
        res.json({ success: false, message: '❌ حدث خطأ أثناء الحذف' });
    }
});

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

app.post('/api/add-custom-model', async (req, res) => {
    try {
        const { category, modelNumber, customName } = req.body;
        const key = `${category}_${modelNumber}`;
        if (await CustomModel.findOne({ key })) return res.json({ success: false, message: '⚠️ هذا النموذج موجود مسبقاً!' });
        await CustomModel.create({ key, name: customName.trim() });
        res.json({ success: true, message: '✅ تم حفظ النموذج بنجاح!' });
    } catch (e) {
        res.json({ success: false, message: '❌ حدث خطأ أثناء الحفظ' });
    }
});

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
        }
        res.json({ success: true, message: '🗑️ تم الحذف بنجاح!' });
    } catch (e) {
        res.json({ success: false, message: '❌ حدث خطأ أثناء الحذف' });
    }
});

// المسار المصحح تماماً للتعديل والنقل الكلي دون بقايا
app.post('/api/admin/edit-model-full', async (req, res) => {
    try {
        const { oldKey, modelNumber, newName, newCategory } = req.body;
        if (!oldKey || !newName || !newCategory) return res.json({ success: false, message: '⚠️ بيانات غير مكتملة!' });

        let oldSec = '', oldType = '', oldModelNum = Number(modelNumber);
        const oldParts = oldKey.split('_');
        oldModelNum = Number(oldParts.pop());
        oldType = oldParts.pop();
        oldSec = oldParts.join('_');

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

        let assignedModelNum = oldModelNum;
        const isSameCategoryType = (oldSec === updatedSection && oldType === updatedType);

        if (!isSameCategoryType) {
            const allCustomModels = await CustomModel.find({});
            let maxNum = 0;
            allCustomModels.forEach(m => {
                if (m.key.startsWith(targetSectionPrefix)) {
                    const numPart = Number(m.key.split('_').pop());
                    if (!isNaN(numPart) && numPart > maxNum) maxNum = numPart;
                }
            });
            assignedModelNum = maxNum + 1;
        }

        // 1. حذف المفتاح القديم كلياً من المكان القديم لئلا تبقى أي نسخة معلقة
        await CustomModel.deleteOne({ key: oldKey });
        await ModelStatus.deleteOne({ uniqueKey: oldKey });

        // 2. إنشاء المفتاح الجديد بالاسم المحدث في المكان الجديد
        const newKey = `${targetSectionPrefix}${assignedModelNum}`;
        await CustomModel.deleteOne({ key: newKey });
        await CustomModel.create({ key: newKey, name: newName.trim() });

        // 3. نقل وتحديث الأسئلة التابعة لهذا النموذج للوجهة الجديدة
        await Question.updateMany(
            { section: oldSec, type: oldType, model: oldModelNum },
            { section: updatedSection, type: updatedType, model: assignedModelNum }
        );

        res.json({ success: true, message: `✅ تم تعديل ونقل النموذج بنجاح تام!` });
    } catch (e) {
        res.json({ success: false, message: '❌ حدث خطأ أثناء التحديث' });
    }
});

app.post('/api/admin/users', async (req, res) => {
    try {
        const { email } = req.body;
        if (!await User.findOne({ email: (email || '').trim().toLowerCase(), role: 'admin' })) {
            return res.json({ success: false, message: '⛔ ليس لديك صلاحية!' });
        }
        const users = await User.find({});
        res.json({ success: true, users: users.map(u => ({ name: u.name, email: u.email, pass: u.pass, role: u.role === 'admin' ? 'مشرف (Admin)' : 'طالب (Student)' })) });
    } catch (e) {
        res.json({ success: false, message: '❌ حدث خطأ في الخادم' });
    }
});

app.post('/api/admin/delete-user', async (req, res) => {
    try {
        const { adminEmail, userEmailToDelete } = req.body;
        if (!await User.findOne({ email: (adminEmail || '').trim().toLowerCase(), role: 'admin' })) {
            return res.json({ success: false, message: '⛔ ليس لديك صلاحية!' });
        }
        if (adminEmail.trim().toLowerCase() === userEmailToDelete.trim().toLowerCase()) {
            return res.json({ success: false, message: '⚠️ لا يمكنك حذف حسابك!' });
        }
        await User.deleteOne({ email: userEmailToDelete.trim().toLowerCase() });
        res.json({ success: true, message: '🗑️ تم الحذف بنجاح!' });
    } catch (e) {
        res.json({ success: false, message: '❌ حدث خطأ' });
    }
});

app.get('/api/admin/models-status', async (req, res) => {
    try {
        const questions = await Question.find({});
        const statuses = await ModelStatus.find({});
        const modelsStatusMap = {};
        statuses.forEach(s => modelsStatusMap[s.uniqueKey] = s.active);

        const customModels = await CustomModel.find({});
        const customModelsMap = {};
        customModels.forEach(m => customModelsMap[m.key] = m.name);

        const result = { quant: {}, verbal: {}, mock: {} };

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
            if (q.type === 'qiyas_simulation') sec = 'mock';
            const mNum = Number(q.model) || 1;
            Object.keys(result[sec]).forEach(uKey => {
                const mData = result[sec][uKey];
                if (mData.modelNumber === mNum && (sec === 'mock' || mData.categoryType.includes(q.type))) {
                    mData.questionCount++;
                }
            });
        });

        res.json({ success: true, models: result });
    } catch (error) {
        res.json({ success: false, message: '❌ حدث خطأ' });
    }
});

app.post('/api/admin/toggle-model', async (req, res) => {
    try {
        const { adminEmail, section, uniqueKey } = req.body;
        if (!await User.findOne({ email: (adminEmail || '').trim().toLowerCase(), role: 'admin' })) {
            return res.json({ success: false, message: '⛔ ليس لديك صلاحية!' });
        }
        let modelStatus = await ModelStatus.findOne({ uniqueKey });
        if (modelStatus) {
            modelStatus.active = !modelStatus.active;
            await modelStatus.save();
        } else {
            await ModelStatus.create({ uniqueKey, active: false });
        }
        res.json({ success: true, message: '✅ تم تحديث الحالة بنجاح!' });
    } catch (e) {
        res.json({ success: false, message: '❌ حدث خطأ' });
    }
});

// تسجيل إجابة الطالب (تستخدمه واجهة لوحة قمة)
app.post('/api/attempts', async (req, res) => {
    try {
        const { email, questionId, section, type, model, chosenAnswer, correct, score } = req.body || {};
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!normalizedEmail) return res.status(400).json({ success: false, message: 'البريد مطلوب' });
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        await Attempt.create({ email: normalizedEmail, questionId, section, type, model: Number(model) || 1, chosenAnswer, correct: Boolean(correct), score: Number(score) || 1 });
        res.json({ success: true });
    } catch (e) {
        console.error('POST /api/attempts:', e);
        res.status(500).json({ success: false, message: 'تعذر تسجيل المحاولة' });
    }
});

app.post('/api/student/stats', async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ success: false, message: 'البريد مطلوب' });
        const attempts = await Attempt.find({ email }).lean();
        const correctAnswers = attempts.filter(a => a.correct).length;
        const averageScore = attempts.length ? Math.round(correctAnswers / attempts.length * 100) : 0;
        const bySection = {};
        attempts.forEach(a => {
            const key = a.section || 'quant';
            bySection[key] ||= { total: 0, correct: 0 };
            bySection[key].total++;
            if (a.correct) bySection[key].correct++;
        });
        const weakPoints = Object.entries(bySection).filter(([,v]) => v.total >= 3).map(([section,v]) => ({ section, accuracy: Math.round(v.correct / v.total * 100) })).filter(x => x.accuracy < 70).sort((a,b) => a.accuracy-b.accuracy);
        res.json({ success: true, correctAnswers, testsTaken: attempts.length, averageScore, weakPoints });
    } catch (e) {
        console.error('POST /api/student/stats:', e);
        res.status(500).json({ success: false, message: 'تعذر تحميل إحصائيات الطالب' });
    }
});

app.post('/api/admin/analytics', async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const admin = await User.findOne({ email, role: 'admin' });
        if (!admin) return res.status(403).json({ success: false, message: 'ليس لديك صلاحية' });
        const [questionCount, modelCount, studentCount, attempts] = await Promise.all([
            Question.countDocuments(), CustomModel.countDocuments(), User.countDocuments({ role: { $ne: 'admin' } }), Attempt.find({}).lean()
        ]);
        const averageScore = attempts.length ? Math.round(attempts.filter(a => a.correct).length / attempts.length * 100) : 0;
        const groups = new Map();
        attempts.forEach(a => {
            const section = a.type === 'qiyas_simulation' ? 'mock' : (a.section || 'quant');
            const key = `${section}|${Number(a.model) || 1}`;
            if (!groups.has(key)) groups.set(key, { section, model: Number(a.model) || 1, correctAnswers: 0, answers: 0, studentsSet: new Set() });
            const g = groups.get(key); g.answers++; if (a.correct) g.correctAnswers++; g.studentsSet.add(a.email);
        });
        const popularModels = [...groups.values()].map(g => ({ section: g.section, model: g.model, correctAnswers: g.correctAnswers, answers: g.answers, students: g.studentsSet.size, averageScore: Math.round(g.correctAnswers / g.answers * 100) })).sort((a,b) => b.correctAnswers-a.correctAnswers).slice(0, 10);
        res.json({ success: true, questionCount, modelCount, studentCount, averageScore, attemptsCount: attempts.length, popularModels });
    } catch (e) {
        console.error('POST /api/admin/analytics:', e);
        res.status(500).json({ success: false, message: 'تعذر تحميل التحليلات' });
    }
});

// ابدأ الاستماع فقط بعد نجاح اتصال قاعدة البيانات، لتجنب buffering timed out.
async function startServer() {
    if (!MONGO_URI) {
        console.error('❌ متغير البيئة MONGO_URI غير مضبوط. أضف رابط MongoDB إلى إعدادات البيئة.');
        process.exit(1);
    }
    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
        console.log('🚀 تم الاتصال بقاعدة بيانات MongoDB Atlas بنجاح!');
        await initAdmin();
        app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`));
    } catch (err) {
        console.error('❌ تعذر الاتصال بـ MongoDB؛ لم يتم تشغيل الخادم:', err.message);
        process.exit(1);
    }
}
startServer();
