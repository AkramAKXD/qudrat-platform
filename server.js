const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// رابط MongoDB
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ يرجى ضبط متغير البيئة MONGO_URI');
} else {
    mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
        .then(() => console.log('🚀 تم الاتصال بقاعدة بيانات MongoDB Atlas بنجاح!'))
        .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));
}

// ========================
// مخططات قاعدة البيانات
// ========================

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
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
    questionId: Number,
    section: String,
    type: String,
    model: Number,
    chosenAnswer: String,
    correct: Boolean,
    score: Number,
    answeredAt: { type: Date, default: Date.now }
});

const Attempt = mongoose.model('Attempt', attemptSchema);

// ========================
// تسجيل حساب جديد
// ========================

app.post('/api/register', async (req, res) => {
    try {
        const { name, email, pass } = req.body;

        if (!name || !email || !pass) {
            return res.json({
                success: false,
                message: '⚠️ يرجى تعبئة جميع الحقول!'
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();

        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.json({
                success: false,
                message: '⚠️ هذا البريد مسجل مسبقًا!'
            });
        }

        await User.create({
            name: String(name).trim(),
            email: normalizedEmail,
            pass: String(pass),
            role: 'student'
        });

        res.json({
            success: true,
            message: '🎉 تم إنشاء الحساب بنجاح!'
        });
    } catch (error) {
        console.error('Register error details:', error);
        res.json({
            success: false,
            message: '❌ حدث خطأ أثناء التسجيل، تأكد من اتصال القاعدة'
        });
    }
});

// ========================
// تسجيل الدخول (مع حماية تامة من الانهيار)
// ========================

app.post('/api/login', async (req, res) => {
    try {
        const { email, pass } = req.body;

        if (!email || !pass) {
            return res.json({
                success: false,
                message: 'يرجى إدخال البريد وكلمة المرور'
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return res.json({
                success: false,
                message: '❌ البريد الإلكتروني غير مسجل!'
            });
        }

        if (user.pass !== String(pass)) {
            return res.json({
                success: false,
                message: '❌ كلمة المرور غير صحيحة!'
            });
        }

        res.json({
            success: true,
            name: user.name,
            role: user.role || 'student',
            email: user.email
        });
    } catch (error) {
        console.error('Login error details:', error);
        res.json({
            success: false,
            message: '❌ حدث خطأ في الخادم أثناء تسجيل الدخول'
        });
    }
});

// ========================
// إعادة تعيين كلمة المرور
// ========================

app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, newPass } = req.body;

        if (!email || !newPass) {
            return res.json({
                success: false,
                message: 'يرجى إدخال البريد وكلمة المرور الجديدة'
            });
        }

        const user = await User.findOne({
            email: String(email).trim().toLowerCase()
        });

        if (!user) {
            return res.json({
                success: false,
                message: '❌ البريد غير مسجل!'
            });
        }

        user.pass = String(newPass);
        await user.save();

        res.json({
            success: true,
            message: '✅ تم تحديث كلمة المرور بنجاح'
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.json({
            success: false,
            message: '❌ حدث خطأ في الخادم'
        });
    }
});

// ========================
// جلب الأسئلة
// ========================

app.get('/api/questions', async (req, res) => {
    try {
        const questions = await Question.find({});
        res.json(questions);
    } catch (error) {
        console.error('Questions error:', error);
        res.json([]);
    }
});

// ========================
// إضافة سؤال
// ========================

app.post('/api/add-question', async (req, res) => {
    try {
        const {
            section,
            type,
            model,
            score,
            question,
            options,
            correct_answer,
            image
        } = req.body;

        const modelNum = Number(model);
        const count = await Question.countDocuments();

        await Question.create({
            id: count + 1,
            section: section || 'quant',
            type: type || 'practice',
            model: modelNum,
            score: Number(score) || 1,
            question,
            options,
            correct_answer,
            image: image || null
        });

        res.json({
            success: true,
            message: '🎯 تم حفظ السؤال بنجاح!'
        });
    } catch (error) {
        console.error('Add question error:', error);
        res.json({
            success: false,
            message: '❌ حدث خطأ أثناء حفظ السؤال'
        });
    }
});

// ========================
// تعديل سؤال
// ========================

app.post('/api/edit-question', async (req, res) => {
    try {
        const {
            index,
            section,
            type,
            model,
            score,
            question,
            options,
            correct_answer,
            image
        } = req.body;

        const questions = await Question.find({});
        if (index === undefined || index < 0 || index >= questions.length) {
            return res.json({ success: false, message: '❌ السؤال غير موجود!' });
        }

        const targetQuestion = questions[index];
        targetQuestion.section = section || 'quant';
        targetQuestion.type = type || 'practice';
        targetQuestion.model = Number(model);
        targetQuestion.score = Number(score) || 1;
        targetQuestion.question = question;
        targetQuestion.options = options;
        targetQuestion.correct_answer = correct_answer;
        targetQuestion.image = image || null;

        await targetQuestion.save();
        res.json({ success: true, message: '✏️ تم تعديل السؤال بنجاح!' });
    } catch (error) {
        console.error('Edit question error:', error);
        res.json({ success: false, message: '❌ حدث خطأ أثناء التعديل' });
    }
});

// ========================
// نقل سؤال
// ========================

app.post('/api/move-question', async (req, res) => {
    try {
        const { index, section, type, model } = req.body;
        const questions = await Question.find({});
        if (index === undefined || index < 0 || index >= questions.length) {
            return res.json({ success: false, message: '❌ السؤال غير موجود!' });
        }

        const targetQuestion = questions[index];
        targetQuestion.section = section;
        targetQuestion.type = type;
        targetQuestion.model = Number(model);

        await targetQuestion.save();
        res.json({ success: true, message: '🚚 تم نقل السؤال بنجاح!' });
    } catch (error) {
        console.error('Move question error:', error);
        res.json({ success: false, message: '❌ حدث خطأ أثناء النقل' });
    }
});

// ========================
// حذف سؤال
// ========================

app.post('/api/delete-question', async (req, res) => {
    try {
        const { index } = req.body;
        const questions = await Question.find({});
        if (index === undefined || index < 0 || index >= questions.length) {
            return res.json({ success: false, message: '❌ السؤال غير موجود!' });
        }

        await questions[index].deleteOne();
        res.json({ success: true, message: '🗑️ تم حذف السؤال بنجاح!' });
    } catch (error) {
        console.error('Delete question error:', error);
        res.json({ success: false, message: '❌ حدث خطأ أثناء الحذف' });
    }
});

// ========================
// النماذج المخصصة
// ========================

app.get('/api/custom-models', async (req, res) => {
    try {
        const customModels = await CustomModel.find({});
        const modelsMap = {};
        customModels.forEach(m => {
            modelsMap[m.key] = m.name;
        });
        res.json({ success: true, models: modelsMap });
    } catch (error) {
        console.error('Custom models error:', error);
        res.json({ success: false, models: {} });
    }
});

app.post('/api/add-custom-model', async (req, res) => {
    try {
        const { category, modelNumber, customName } = req.body;
        if (!category || !modelNumber || !customName) {
            return res.json({ success: false, message: 'يرجى تعبئة بيانات النموذج' });
        }

        const key = `${category}_${modelNumber}`;
        const existing = await CustomModel.findOne({ key });
        if (existing) {
            existing.name = String(customName).trim();
            await existing.save();
        } else {
            await CustomModel.create({ key, name: String(customName).trim() });
        }

        res.json({ success: true, message: '✅ تم حفظ النموذج بنجاح!' });
    } catch (error) {
        console.error('Add model error:', error);
        res.json({ success: false, message: '❌ حدث خطأ أثناء الحفظ' });
    }
});

app.post('/api/admin/delete-model', async (req, res) => {
    try {
        const { modelKey, modelNumber } = req.body;
        await CustomModel.deleteOne({ key: modelKey });
        await ModelStatus.deleteOne({ uniqueKey: modelKey });
        res.json({ success: true, message: '🗑️ تم الحذف بنجاح!' });
    } catch (error) {
        console.error('Delete model error:', error);
        res.json({ success: false, message: '❌ حدث خطأ' });
    }
});

app.post('/api/admin/edit-model-full', async (req, res) => {
    try {
        const { oldKey, modelNumber, newName, newCategory } = req.body;
        const newKey = `${newCategory}_${modelNumber}`;
        
        await CustomModel.deleteOne({ key: oldKey });
        let existing = await CustomModel.findOne({ key: newKey });
        if (existing) {
            existing.name = String(newName).trim();
            await existing.save();
        } else {
            await CustomModel.create({ key: newKey, name: String(newName).trim() });
        }

        res.json({ success: true, message: '✅ تم التعديل بنجاح!' });
    } catch (error) {
        console.error('Edit model error:', error);
        res.json({ success: false, message: '❌ حدث خطأ' });
    }
});

// ========================
// المستخدمون والإحصائيات
// ========================

app.post('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find({});
        res.json({
            success: true,
            users: users.map(u => ({
                name: u.name,
                email: u.email,
                role: u.role === 'admin' ? 'مشرف (Admin)' : 'طالب (Student)'
            }))
        });
    } catch (error) {
        console.error('Admin users error:', error);
        res.json({ success: false, users: [] });
    }
});

app.post('/api/admin/delete-user', async (req, res) => {
    try {
        const { userEmailToDelete } = req.body;
        await User.deleteOne({ email: String(userEmailToDelete).trim().toLowerCase() });
        res.json({ success: true, message: '🗑️ تم الحذف بنجاح!' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.json({ success: false, message: '❌ حدث خطأ' });
    }
});

app.get('/api/admin/models-status', async (req, res) => {
    try {
        const customModels = await CustomModel.find({});
        const statuses = await ModelStatus.find({});
        const statusesMap = {};
        statuses.forEach(s => { statusesMap[s.uniqueKey] = s.active; });

        const result = { quant: {}, verbal: {}, mock: {} };

        customModels.forEach(m => {
            const lastIndex = m.key.lastIndexOf('_');
            const category = m.key.substring(0, lastIndex);
            const modelNumber = Number(m.key.substring(lastIndex + 1));

            let sectionKey = '';
            if (category.startsWith('quant')) sectionKey = 'quant';
            else if (category.startsWith('verbal')) sectionKey = 'verbal';
            else if (category.startsWith('qiyas')) sectionKey = 'mock';

            if (!sectionKey) return;

            result[sectionKey][m.key] = {
                modelNumber,
                categoryType: category,
                customKey: m.key,
                questionCount: 0,
                isActive: statusesMap[m.key] ?? true
            };
        });

        res.json({ success: true, models: result });
    } catch (error) {
        console.error('Models status error:', error);
        res.json({ success: false, models: { quant: {}, verbal: {}, mock: {} } });
    }
});

app.post('/api/admin/toggle-model', async (req, res) => {
    try {
        const { uniqueKey } = req.body;
        let status = await ModelStatus.findOne({ uniqueKey });
        if (status) {
            status.active = !status.active;
            await status.save();
        } else {
            await ModelStatus.create({ uniqueKey, active: false });
        }
        res.json({ success: true, message: '✅ تم التحديث!' });
    } catch (error) {
        res.json({ success: false, message: '❌ خطأ' });
    }
});

app.post('/api/attempts', async (req, res) => {
    try {
        await Attempt.create(req.body);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});

app.post('/api/student/stats', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const rows = await Attempt.find({ email });
        const correctAnswers = rows.filter(x => x.correct).length;
        const averageScore = rows.length ? Math.round((correctAnswers / rows.length) * 100) : 0;
        
        res.json({
            success: true,
            correctAnswers,
            testsTaken: new Set(rows.map(r => `${r.section}:${r.type}:${r.model}`)).size,
            averageScore,
            weakPoints: [],
            answersRecorded: rows.length
        });
    } catch (error) {
        res.json({ success: false });
    }
});

app.post('/api/admin/analytics', async (req, res) => {
    try {
        const [questionCount, modelCount, studentCount, attempts] = await Promise.all([
            Question.countDocuments(),
            CustomModel.countDocuments(),
            User.countDocuments({ role: 'student' }),
            Attempt.find({})
        ]);

        res.json({
            success: true,
            questionCount,
            modelCount,
            studentCount,
            averageScore: 85,
            attemptsCount: attempts.length,
            popularModels: []
        });
    } catch (error) {
        res.json({ success: false });
    }
});

// ========================
// تشغيل الخادم
// ========================

app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
});
