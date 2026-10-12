const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ضع رابط MongoDB في متغير البيئة MONGO_URI
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

// سجل إجابات الطلاب
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
// تهيئة حساب المشرف
// ========================

// يفضّل إنشاء حساب المشرف يدويًا أو من خلال أداة آمنة.
// لا تضع كلمة مرور ثابتة داخل الكود.

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

        if (String(pass).length < 8) {
            return res.json({
                success: false,
                message: '⚠️ يجب أن تتكون كلمة المرور من 8 أحرف على الأقل'
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();

        if (await User.findOne({ email: normalizedEmail })) {
            return res.json({
                success: false,
                message: '⚠️ هذا البريد مسجل مسبقًا!'
            });
        }

        await User.create({
            name: String(name).trim(),
            email: normalizedEmail,
            pass,
            role: 'student'
        });

        res.json({
            success: true,
            message: '🎉 تم إنشاء الحساب بنجاح!'
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ في الخادم'
        });
    }
});

// ========================
// تسجيل الدخول
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

        const user = await User.findOne({
            email: String(email).trim().toLowerCase(),
            pass: String(pass)
        });

        if (!user) {
            return res.json({
                success: false,
                message: '❌ بيانات الدخول غير صحيحة!'
            });
        }

        res.json({
            success: true,
            name: user.name,
            role: user.role,
            email: user.email
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ في الخادم'
        });
    }
});

// ========================
// إعادة تعيين كلمة المرور
// ========================

app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, newPass } = req.body;

        if (!email || !newPass || String(newPass).length < 8) {
            return res.json({
                success: false,
                message: 'يرجى إدخال بريد صحيح وكلمة مرور من 8 أحرف على الأقل'
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

        user.pass = newPass;
        await user.save();

        res.json({
            success: true,
            message: '✅ تم تحديث كلمة المرور'
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
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
        res.status(500).json([]);
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

        const customModels = await CustomModel.find({});
        const customModelsMap = {};

        customModels.forEach(m => {
            customModelsMap[m.key] = m.name;
        });

        let modelExists = false;

        if (type === 'qiyas_simulation') {
            if (customModelsMap[`qiyas_simulation_${modelNum}`]) {
                modelExists = true;
            }
        } else {
            if (customModelsMap[`${section}_${type}_${modelNum}`]) {
                modelExists = true;
            }
        }

        if (!modelExists) {
            return res.json({
                success: false,
                message: '⚠️ النموذج غير مُنشأ مسبقًا!'
            });
        }

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
        res.status(500).json({
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

        if (
            index === undefined ||
            index < 0 ||
            index >= questions.length
        ) {
            return res.json({
                success: false,
                message: '❌ السؤال غير موجود!'
            });
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

        res.json({
            success: true,
            message: '✏️ تم تعديل السؤال بنجاح!'
        });
    } catch (error) {
        console.error('Edit question error:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ أثناء تعديل السؤال'
        });
    }
});

// ========================
// نقل سؤال إلى نموذج آخر
// ========================

app.post('/api/move-question', async (req, res) => {
    try {
        const { index, section, type, model } = req.body;
        const questions = await Question.find({});

        if (
            index === undefined ||
            index < 0 ||
            index >= questions.length
        ) {
            return res.json({
                success: false,
                message: '❌ السؤال غير موجود!'
            });
        }

        const targetQuestion = questions[index];

        targetQuestion.section = section;
        targetQuestion.type = type;
        targetQuestion.model = Number(model);

        await targetQuestion.save();

        res.json({
            success: true,
            message: '🚚 تم نقل السؤال بنجاح!'
        });
    } catch (error) {
        console.error('Move question error:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ أثناء النقل'
        });
    }
});

// ========================
// حذف سؤال
// ========================

app.post('/api/delete-question', async (req, res) => {
    try {
        const { index } = req.body;
        const questions = await Question.find({});

        if (
            index === undefined ||
            index < 0 ||
            index >= questions.length
        ) {
            return res.json({
                success: false,
                message: '❌ السؤال غير موجود!'
            });
        }

        await questions[index].deleteOne();

        res.json({
            success: true,
            message: '🗑️ تم حذف السؤال بنجاح!'
        });
    } catch (error) {
        console.error('Delete question error:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ أثناء الحذف'
        });
    }
});

// ========================
// جلب النماذج المخصصة
// ========================

app.get('/api/custom-models', async (req, res) => {
    try {
        const customModels = await CustomModel.find({});
        const modelsMap = {};

        customModels.forEach(m => {
            modelsMap[m.key] = m.name;
        });

        res.json({
            success: true,
            models: modelsMap
        });
    } catch (error) {
        console.error('Custom models error:', error);
        res.status(500).json({
            success: false,
            models: {}
        });
    }
});

// ========================
// إضافة نموذج مخصص
// ========================

app.post('/api/add-custom-model', async (req, res) => {
    try {
        const { category, modelNumber, customName } = req.body;

        if (!category || !modelNumber || !customName) {
            return res.json({
                success: false,
                message: 'يرجى تعبئة بيانات النموذج'
            });
        }

        const key = `${category}_${modelNumber}`;

        if (await CustomModel.findOne({ key })) {
            return res.json({
                success: false,
                message: '⚠️ هذا النموذج موجود مسبقًا!'
            });
        }

        await CustomModel.create({
            key,
            name: String(customName).trim()
        });

        res.json({
            success: true,
            message: '✅ تم حفظ النموذج بنجاح!'
        });
    } catch (error) {
        console.error('Add model error:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ أثناء الحفظ'
        });
    }
});

// ========================
// حذف نموذج
// ========================

app.post('/api/admin/delete-model', async (req, res) => {
    try {
        const { modelKey } = req.body;

        if (!modelKey) {
            return res.json({
                success: false,
                message: 'مفتاح النموذج مطلوب'
            });
        }

        const parts = modelKey.split('_');
        const targetNum = Number(parts.pop());
        const targetType = parts.pop();
        const targetSec = parts.join('_');

        await CustomModel.deleteOne({ key: modelKey });
        await ModelStatus.deleteOne({ uniqueKey: modelKey });

        await Question.deleteMany({
            section: targetSec,
            type: targetType,
            model: targetNum
        });

        res.json({
            success: true,
            message: '🗑️ تم الحذف بنجاح!'
        });
    } catch (error) {
        console.error('Delete model error:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ أثناء حذف النموذج'
        });
    }
});

// ========================
// تعديل أو نقل نموذج بالكامل
// ========================

app.post('/api/admin/edit-model-full', async (req, res) => {
    try {
        const {
            oldKey,
            newName,
            newCategory
        } = req.body;

        if (!oldKey || !newName || !newCategory) {
            return res.json({
                success: false,
                message: 'بيانات تعديل النموذج غير مكتملة'
            });
        }

        const parts = oldKey.split('_');
        const oldModelNum = Number(parts.pop());
        const oldType = parts.pop();
        const oldSec = parts.join('_');

        let updatedSection = oldSec;
        let updatedType = oldType;
        let targetSectionPrefix = `${oldSec}_${oldType}_`;

        if (newCategory.startsWith('qiyas')) {
            updatedSection = 'quant';
            updatedType = 'qiyas_simulation';
            targetSectionPrefix = 'qiyas_simulation_';
        } else {
            const categoryParts = newCategory.split('_');

            if (categoryParts.length >= 2) {
                updatedSection = categoryParts[0];
                updatedType = categoryParts.slice(1).join('_');
                targetSectionPrefix = `${updatedSection}_${updatedType}_`;
            }
        }

        const sameCategory =
            oldSec === updatedSection &&
            oldType === updatedType;

        let assignedModelNum = oldModelNum;

        if (!sameCategory) {
            const allModels = await CustomModel.find({});
            let maxNum = 0;

            allModels.forEach(m => {
                if (m.key.startsWith(targetSectionPrefix)) {
                    const num = Number(m.key.split('_').pop());

                    if (!Number.isNaN(num) && num > maxNum) {
                        maxNum = num;
                    }
                }
            });

            assignedModelNum = maxNum + 1;
        }

        await CustomModel.deleteOne({ key: oldKey });
        await ModelStatus.deleteOne({ uniqueKey: oldKey });

        const newKey = `${targetSectionPrefix}${assignedModelNum}`;

        await CustomModel.deleteOne({ key: newKey });

        await CustomModel.create({
            key: newKey,
            name: String(newName).trim()
        });

        await Question.updateMany(
            {
                section: oldSec,
                type: oldType,
                model: oldModelNum
            },
            {
                section: updatedSection,
                type: updatedType,
                model: assignedModelNum
            }
        );

        res.json({
            success: true,
            message: '✅ تم تعديل ونقل النموذج بنجاح!'
        });
    } catch (error) {
        console.error('Edit model error:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ أثناء تحديث النموذج'
        });
    }
});

// ========================
// إدارة المستخدمين
// ========================

app.post('/api/admin/users', async (req, res) => {
    try {
        const { email } = req.body;

        const admin = await User.findOne({
            email: String(email || '').trim().toLowerCase(),
            role: 'admin'
        });

        if (!admin) {
            return res.status(403).json({
                success: false,
                message: '⛔ ليس لديك صلاحية!'
            });
        }

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
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ في الخادم'
        });
    }
});

// ========================
// حذف مستخدم
// ========================

app.post('/api/admin/delete-user', async (req, res) => {
    try {
        const { adminEmail, userEmailToDelete } = req.body;

        const admin = await User.findOne({
            email: String(adminEmail || '').trim().toLowerCase(),
            role: 'admin'
        });

        if (!admin) {
            return res.status(403).json({
                success: false,
                message: '⛔ ليس لديك صلاحية!'
            });
        }

        if (
            String(adminEmail).trim().toLowerCase() ===
            String(userEmailToDelete).trim().toLowerCase()
        ) {
            return res.json({
                success: false,
                message: '⚠️ لا يمكنك حذف حسابك!'
            });
        }

        await User.deleteOne({
            email: String(userEmailToDelete).trim().toLowerCase()
        });

        res.json({
            success: true,
            message: '🗑️ تم الحذف بنجاح!'
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ'
        });
    }
});

// ========================
// حالة النماذج للمشرف
// ========================

app.get('/api/admin/models-status', async (req, res) => {
    try {
        const questions = await Question.find({});
        const statuses = await ModelStatus.find({});
        const customModels = await CustomModel.find({});

        const statusesMap = {};
        statuses.forEach(s => {
            statusesMap[s.uniqueKey] = s.active;
        });

        const result = {
            quant: {},
            verbal: {},
            mock: {}
        };

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

        questions.forEach(q => {
            let section = q.section === 'verbal' ? 'verbal' : 'quant';

            if (q.type === 'qiyas_simulation') {
                section = 'mock';
            }

            Object.values(result[section]).forEach(model => {
                if (
                    model.modelNumber === Number(q.model) &&
                    (
                        section === 'mock' ||
                        model.categoryType.includes(q.type)
                    )
                ) {
                    model.questionCount++;
                }
            });
        });

        res.json({
            success: true,
            models: result
        });
    } catch (error) {
        console.error('Models status error:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ'
        });
    }
});

// ========================
// تفعيل أو تعطيل نموذج
// ========================

app.post('/api/admin/toggle-model', async (req, res) => {
    try {
        const { adminEmail, uniqueKey } = req.body;

        const admin = await User.findOne({
            email: String(adminEmail || '').trim().toLowerCase(),
            role: 'admin'
        });

        if (!admin) {
            return res.status(403).json({
                success: false,
                message: '⛔ ليس لديك صلاحية!'
            });
        }

        let status = await ModelStatus.findOne({ uniqueKey });

        if (status) {
            status.active = !status.active;
            await status.save();
        } else {
            await ModelStatus.create({
                uniqueKey,
                active: false
            });
        }

        res.json({
            success: true,
            message: '✅ تم تحديث الحالة بنجاح!'
        });
    } catch (error) {
        console.error('Toggle model error:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ'
        });
    }
});

// ========================
// تسجيل إجابة الطالب
// ========================

app.post('/api/attempts', async (req, res) => {
    try {
        const {
            email,
            questionId,
            section,
            type,
            model,
            chosenAnswer,
            correct,
            score
        } = req.body;

        const normalizedEmail = String(email || '').trim().toLowerCase();

        if (!normalizedEmail || typeof correct !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'بيانات الإجابة غير مكتملة'
            });
        }

        const user = await User.findOne({
            email: normalizedEmail,
            role: 'student'
        });

        if (!user) {
            return res.status(403).json({
                success: false,
                message: 'الحساب غير موجود'
            });
        }

        await Attempt.create({
            email: normalizedEmail,
            questionId: Number(questionId),
            section: section || 'quant',
            type: type || 'practice',
            model: Number(model) || 1,
            chosenAnswer: String(chosenAnswer || ''),
            correct,
            score: Number(score) || 1
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Save attempt error:', error);
        res.status(500).json({
            success: false,
            message: 'تعذر حفظ الإجابة'
        });
    }
});

// ========================
// إحصائيات الطالب
// ========================

app.post('/api/student/stats', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();

        const user = await User.findOne({
            email,
            role: 'student'
        });

        if (!user) {
            return res.status(403).json({
                success: false,
                message: 'الحساب غير موجود'
            });
        }

        const rows = await Attempt.find({ email });

        const correctAnswers = rows.filter(x => x.correct).length;

        const averageScore = rows.length
            ? Math.round((correctAnswers / rows.length) * 100)
            : 0;

        const grouped = {};

        rows.forEach(row => {
            const key = row.section || 'quant';

            if (!grouped[key]) {
                grouped[key] = {
                    total: 0,
                    correct: 0
                };
            }

            grouped[key].total++;

            if (row.correct) {
                grouped[key].correct++;
            }
        });

        const weakPoints = Object.entries(grouped)
            .filter(([section, data]) => data.total >= 3)
            .map(([section, data]) => ({
                section,
                accuracy: Math.round((data.correct / data.total) * 100),
                total: data.total
            }))
            .filter(item => item.accuracy < 70)
            .sort((a, b) => a.accuracy - b.accuracy);

        const testsTaken = new Set(
            rows.map(row => `${row.section}:${row.type}:${row.model}`)
        ).size;

        res.json({
            success: true,
            correctAnswers,
            testsTaken,
            averageScore,
            weakPoints,
            answersRecorded: rows.length
        });
    } catch (error) {
        console.error('Student stats error:', error);
        res.status(500).json({
            success: false,
            message: 'تعذر تحميل الإحصائيات'
        });
    }
});

// ========================
// إحصائيات المشرف
// ========================

app.post('/api/admin/analytics', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();

        const admin = await User.findOne({
            email,
            role: 'admin'
        });

        if (!admin) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية'
            });
        }

        const [
            questionCount,
            modelCount,
            studentCount,
            attempts
        ] = await Promise.all([
            Question.countDocuments(),
            CustomModel.countDocuments(),
            User.countDocuments({ role: 'student' }),
            Attempt.find({})
        ]);

        const groups = {};

        attempts.forEach(attempt => {
            const key = `${attempt.section || 'quant'}:${attempt.type || 'practice'}:${attempt.model || 1}`;

            if (!groups[key]) {
                groups[key] = {
                    modelKey: key,
                    section: attempt.section || 'quant',
                    type: attempt.type || 'practice',
                    model: attempt.model || 1,
                    answers: 0,
                    correct: 0,
                    students: new Set()
                };
            }

            const group = groups[key];

            group.answers++;

            if (attempt.correct) {
                group.correct++;
            }

            group.students.add(attempt.email);
        });

        const popularModels = Object.values(groups)
            .map(group => ({
                modelKey: group.modelKey,
                section: group.section,
                type: group.type,
                model: group.model,
                answers: group.answers,
                correctAnswers: group.correct,
                students: group.students.size,
                averageScore: group.answers
                    ? Math.round((group.correct / group.answers) * 100)
                    : 0
            }))
            .sort((a, b) => b.correctAnswers - a.correctAnswers);

        const averageScore = attempts.length
            ? Math.round(
                (attempts.filter(attempt => attempt.correct).length /
                attempts.length) * 100
            )
            : 0;

        res.json({
            success: true,
            questionCount,
            modelCount,
            studentCount,
            averageScore,
            attemptsCount: attempts.length,
            popularModels
        });
    } catch (error) {
        console.error('Admin analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'تعذر تحميل إحصائيات المشرف'
        });
    }
});

// ========================
// تشغيل الخادم
// ========================

app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
});
