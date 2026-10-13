const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const MONGO_URI = process.env.MONGO_URI;

// الاتصال بقاعدة البيانات
mongoose.connection.on('connected', () => console.log('✅ MongoDB متصل'));
mongoose.connection.on('disconnected', () => console.error('⚠️ انقطع اتصال MongoDB'));
mongoose.connection.on('error', err => console.error('❌ MongoDB:', err.message));

// ==================== نماذج قاعدة البيانات ====================

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

// ==================== إنشاء حساب المشرف ====================

async function initAdmin() {
    try {
        const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminEmail || !adminPassword) {
            console.log(
                'ℹ️ لم يتم إنشاء مشرف تلقائي: عرّف ADMIN_EMAIL و ADMIN_PASSWORD إذا احتجت ذلك.'
            );
            return;
        }

        const existingAdmin = await User.findOne({ email: adminEmail });

        if (!existingAdmin) {
            await User.create({
                name: process.env.ADMIN_NAME || 'مشرف قمة',
                email: adminEmail,
                pass: adminPassword,
                role: 'admin'
            });

            console.log('👑 تم إنشاء حساب المشرف من متغيرات البيئة.');
        }
    } catch (e) {
        console.error('Error initializing admin:', e);
    }
}

// ==================== تسجيل حساب جديد ====================

app.post('/api/register', async (req, res) => {
    try {
        const { name, email, pass } = req.body;

        if (!name || !email || !pass) {
            return res.json({
                success: false,
                message: '⚠️ يرجى تعبئة جميع الحقول!'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        if (await User.findOne({ email: normalizedEmail })) {
            return res.json({
                success: false,
                message: '⚠️ هذا البريد مسجل مسبقاً!'
            });
        }

        await User.create({
            name: name.trim(),
            email: normalizedEmail,
            pass,
            role: 'student'
        });

        res.json({
            success: true,
            message: '🎉 تم إنشاء الحساب بنجاح!'
        });
    } catch (error) {
        console.error('POST /api/register:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ في الخادم'
        });
    }
});

// ==================== تسجيل الدخول ====================

app.post('/api/login', async (req, res) => {
    try {
        const { email, pass } = req.body;

        const normalizedEmail = String(email || '').trim().toLowerCase();

        const user = await User.findOne({
            email: normalizedEmail,
            pass: pass
        });

        if (!user) {
            return res.json({
                success: false,
                message: '❌ بيانات الدخول خاطئة!'
            });
        }

        res.json({
            success: true,
            name: user.name,
            role: user.role,
            email: user.email
        });
    } catch (error) {
        console.error('POST /api/login:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ في الخادم'
        });
    }
});

// ==================== التحقق من البريد الإلكتروني ====================

app.post('/api/check-email', async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'يرجى إدخال البريد الإلكتروني.'
            });
        }

        const user = await User.findOne({ email }).select('_id');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: '❌ هذا البريد الإلكتروني غير مسجل لدينا.'
            });
        }

        return res.json({
            success: true,
            message: 'تم التحقق من البريد الإلكتروني.'
        });
    } catch (error) {
        console.error('POST /api/check-email:', error);
        return res.status(500).json({
            success: false,
            message: 'تعذر التحقق من البريد حالياً.'
        });
    }
});

// ==================== إعادة تعيين كلمة المرور ====================

app.post('/api/reset-password', async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const newPass = String(req.body?.newPass || '');

        if (!email || !newPass || newPass.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'يرجى إدخال البريد وكلمة مرور من 6 أحرف على الأقل.'
            });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: '❌ هذا البريد الإلكتروني غير مسجل لدينا.'
            });
        }

        user.pass = newPass;
        await user.save();

        res.json({
            success: true,
            message: '✅ تم تحديث كلمة المرور بنجاح!'
        });
    } catch (error) {
        console.error('POST /api/reset-password:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ في الخادم'
        });
    }
});

// ==================== جلب الأسئلة ====================

app.get('/api/questions', async (req, res) => {
    try {
        const questions = await Question.find({});
        res.json(questions);
    } catch (error) {
        console.error('GET /api/questions:', error);
        res.status(500).json([]);
    }
});

// ==================== إضافة سؤال ====================

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
                message: '⚠️ النموذج غير مُنشأ مسبقاً!'
            });
        }

        const count = await Question.countDocuments();

        await Question.create({
            id: count > 0 ? count + 1 : 1,
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
        console.error('POST /api/add-question:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ أثناء حفظ السؤال'
        });
    }
});

// ==================== تعديل سؤال ====================

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

        if (index !== undefined && index >= 0 && index < questions.length) {
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

            return res.json({
                success: true,
                message: '✏️ تم تعديل السؤال بنجاح!'
            });
        }

        res.json({
            success: false,
            message: '❌ السؤال غير موجود!'
        });
    } catch (error) {
        console.error('POST /api/edit-question:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ أثناء تعديل السؤال'
        });
    }
});

// ==================== نقل سؤال ====================

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

            return res.json({
                success: true,
                message: '🚚 تم نقل السؤال بنجاح!'
            });
        }

        res.json({
            success: false,
            message: '❌ السؤال غير موجود!'
        });
    } catch (error) {
        console.error('POST /api/move-question:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ أثناء النقل'
        });
    }
});

// ==================== حذف سؤال ====================

app.post('/api/delete-question', async (req, res) => {
    try {
        const { index } = req.body;
        const questions = await Question.find({});

        if (index !== undefined && index >= 0 && index < questions.length) {
            await questions[index].deleteOne();

            return res.json({
                success: true,
                message: '🗑️ تم حذف السؤال بنجاح!'
            });
        }

        res.json({
            success: false,
            message: '❌ السؤال غير موجود!'
        });
    } catch (error) {
        console.error('POST /api/delete-question:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ أثناء الحذف'
        });
    }
});

// ==================== جلب النماذج المخصصة ====================

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
        console.error('GET /api/custom-models:', error);
        res.status(500).json({
            success: false,
            models: {}
        });
    }
});

// ==================== إضافة نموذج مخصص ====================

app.post('/api/add-custom-model', async (req, res) => {
    try {
        const { category, modelNumber, customName } = req.body;

        if (!category || !modelNumber || !customName) {
            return res.json({
                success: false,
                message: '⚠️ يرجى إدخال بيانات النموذج كاملة!'
            });
        }

        const key = `${category}_${modelNumber}`;

        if (await CustomModel.findOne({ key })) {
            return res.json({
                success: false,
                message: '⚠️ هذا النموذج موجود مسبقاً!'
            });
        }

        await CustomModel.create({
            key,
            name: customName.trim()
        });

        res.json({
            success: true,
            message: '✅ تم حفظ النموذج بنجاح!'
        });
    } catch (error) {
        console.error('POST /api/add-custom-model:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ أثناء الحفظ'
        });
    }
});

// ==================== حذف نموذج ====================

app.post('/api/admin/delete-model', async (req, res) => {
    try {
        const { modelKey } = req.body;

        if (!modelKey) {
            return res.status(400).json({
                success: false,
                message: 'بيانات النموذج غير مكتملة.'
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
        console.error('POST /api/admin/delete-model:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ أثناء الحذف'
        });
    }
});

// ==================== تعديل ونقل نموذج كامل ====================

app.post('/api/admin/edit-model-full', async (req, res) => {
    try {
        const { oldKey, modelNumber, newName, newCategory } = req.body;

        if (!oldKey || !newName || !newCategory) {
            return res.json({
                success: false,
                message: '⚠️ بيانات غير مكتملة!'
            });
        }

        const oldParts = oldKey.split('_');
        const oldModelNum = Number(oldParts.pop());
        const oldType = oldParts.pop();
        const oldSec = oldParts.join('_');

        let targetSectionPrefix = '';
        let updatedSection = 'quant';
        let updatedType = 'practice';

        if (newCategory.startsWith('quant')) {
            updatedSection = 'quant';
            updatedType = newCategory.includes('simulation')
                ? 'simulation'
                : 'practice';

            targetSectionPrefix = newCategory.includes('simulation')
                ? 'quant_simulation_'
                : 'quant_practice_';
        } else if (newCategory.startsWith('verbal')) {
            updatedSection = 'verbal';
            updatedType = newCategory.includes('simulation')
                ? 'simulation'
                : 'practice';

            targetSectionPrefix = newCategory.includes('simulation')
                ? 'verbal_simulation_'
                : 'verbal_practice_';
        } else if (newCategory.startsWith('qiyas')) {
            updatedSection = 'quant';
            updatedType = 'qiyas_simulation';
            targetSectionPrefix = 'qiyas_simulation_';
        } else {
            return res.status(400).json({
                success: false,
                message: 'فئة النموذج غير صحيحة.'
            });
        }

        let assignedModelNum = oldModelNum;

        const isSameCategoryType =
            oldSec === updatedSection && oldType === updatedType;

        if (!isSameCategoryType) {
            const allCustomModels = await CustomModel.find({});
            let maxNum = 0;

            allCustomModels.forEach(item => {
                if (item.key.startsWith(targetSectionPrefix)) {
                    const numPart = Number(item.key.split('_').pop());

                    if (!Number.isNaN(numPart) && numPart > maxNum) {
                        maxNum = numPart;
                    }
                }
            });

            assignedModelNum = maxNum + 1;
        }

        // حذف مفتاح النموذج القديم
        await CustomModel.deleteOne({ key: oldKey });
        await ModelStatus.deleteOne({ uniqueKey: oldKey });

        // إنشاء النموذج الجديد
        const newKey = `${targetSectionPrefix}${assignedModelNum}`;

        await CustomModel.deleteOne({ key: newKey });

        await CustomModel.create({
            key: newKey,
            name: newName.trim()
        });

        // نقل الأسئلة التابعة للنموذج
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

        // إعادة ترقيم النماذج المتبقية في الفئة القديمة
        if (!isSameCategoryType) {
            const oldPrefix = oldType === 'qiyas_simulation'
                ? 'qiyas_simulation_'
                : `${oldSec}_${oldType}_`;

            const remaining = await CustomModel.find({
                key: { $regex: '^' + oldPrefix }
            }).lean();

            const parsed = remaining
                .map(item => ({
                    item,
                    number: Number(item.key.slice(oldPrefix.length))
                }))
                .filter(item =>
                    Number.isInteger(item.number) && item.number > 0
                )
                .sort((a, b) => a.number - b.number);

            // حذف المفاتيح مؤقتاً لتجنب تعارض الفهرس الفريد
            for (const entry of parsed) {
                await CustomModel.deleteOne({
                    key: entry.item.key
                });
            }

            for (let i = 0; i < parsed.length; i++) {
                const entry = parsed[i];
                const newNumber = i + 1;
                const newKeyForRemaining = `${oldPrefix}${newNumber}`;

                if (entry.number !== newNumber) {
                    await Question.updateMany(
                        {
                            section: oldSec,
                            type: oldType,
                            model: entry.number
                        },
                        {
                            $set: { model: newNumber }
                        }
                    );

                    const oldStatusKey = entry.item.key;
                    const status = await ModelStatus.findOne({
                        uniqueKey: oldStatusKey
                    });

                    if (status) {
                        await ModelStatus.deleteOne({
                            uniqueKey: oldStatusKey
                        });

                        await ModelStatus.updateOne(
                            { uniqueKey: newKeyForRemaining },
                            { $set: { active: status.active } },
                            { upsert: true }
                        );
                    }
                }

                await CustomModel.create({
                    key: newKeyForRemaining,
                    name: entry.item.name
                });
            }
        }

        res.json({
            success: true,
            message: '✅ تم تعديل ونقل النموذج بنجاح، وإعادة ترقيم النماذج المتبقية تلقائياً!'
        });
    } catch (error) {
        console.error('POST /api/admin/edit-model-full:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ أثناء التحديث'
        });
    }
});

// ==================== جلب المستخدمين للمشرف ====================

app.post('/api/admin/users', async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();

        const admin = await User.findOne({
            email,
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
            users: users.map(user => ({
                name: user.name,
                email: user.email,
                pass: user.pass,
                role: user.role === 'admin'
                    ? 'مشرف (Admin)'
                    : 'طالب (Student)'
            }))
        });
    } catch (error) {
        console.error('POST /api/admin/users:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ في الخادم'
        });
    }
});

// ==================== حذف مستخدم ====================

app.post('/api/admin/delete-user', async (req, res) => {
    try {
        const {
            adminEmail,
            userEmailToDelete
        } = req.body;

        const normalizedAdminEmail =
            String(adminEmail || '').trim().toLowerCase();

        const normalizedUserEmail =
            String(userEmailToDelete || '').trim().toLowerCase();

        const admin = await User.findOne({
            email: normalizedAdminEmail,
            role: 'admin'
        });

        if (!admin) {
            return res.status(403).json({
                success: false,
                message: '⛔ ليس لديك صلاحية!'
            });
        }

        if (!normalizedUserEmail) {
            return res.status(400).json({
                success: false,
                message: 'يرجى تحديد المستخدم.'
            });
        }

        if (normalizedAdminEmail === normalizedUserEmail) {
            return res.json({
                success: false,
                message: '⚠️ لا يمكنك حذف حسابك!'
            });
        }

        await User.deleteOne({
            email: normalizedUserEmail
        });

        res.json({
            success: true,
            message: '🗑️ تم الحذف بنجاح!'
        });
    } catch (error) {
        console.error('POST /api/admin/delete-user:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ'
        });
    }
});

// ==================== حالة النماذج ====================

app.get('/api/admin/models-status', async (req, res) => {
    try {
        const questions = await Question.find({});
        const statuses = await ModelStatus.find({});
        const modelsStatusMap = {};

        statuses.forEach(status => {
            modelsStatusMap[status.uniqueKey] = status.active;
        });

        const customModels = await CustomModel.find({});
        const customModelsMap = {};

        customModels.forEach(model => {
            customModelsMap[model.key] = model.name;
        });

        const result = {
            quant: {},
            verbal: {},
            mock: {}
        };

        Object.keys(customModelsMap).forEach(key => {
            const lastUnderscoreIdx = key.lastIndexOf('_');
            const catPart = key.substring(0, lastUnderscoreIdx);
            const modelNum = Number(
                key.substring(lastUnderscoreIdx + 1)
            );

            let sectionKey = '';

            if (catPart.startsWith('quant')) {
                sectionKey = 'quant';
            } else if (catPart.startsWith('verbal')) {
                sectionKey = 'verbal';
            } else if (catPart.startsWith('qiyas')) {
                sectionKey = 'mock';
            }

            const uniqueModelKey = `${catPart}_${modelNum}`;

            if (sectionKey && !result[sectionKey][uniqueModelKey]) {
                result[sectionKey][uniqueModelKey] = {
                    modelNumber: modelNum,
                    categoryType: catPart,
                    customKey: key,
                    questionCount: 0,
                    isActive: modelsStatusMap[uniqueModelKey] ?? true
                };
            }
        });

        questions.forEach(question => {
            let section = question.section === 'verbal'
                ? 'verbal'
                : 'quant';

            if (question.type === 'qiyas_simulation') {
                section = 'mock';
            }

            const modelNum = Number(question.model) || 1;

            Object.keys(result[section]).forEach(uniqueKey => {
                const modelData = result[section][uniqueKey];

                if (
                    modelData.modelNumber === modelNum &&
                    (
                        section === 'mock' ||
                        modelData.categoryType.includes(question.type)
                    )
                ) {
                    modelData.questionCount++;
                }
            });
        });

        res.json({
            success: true,
            models: result
        });
    } catch (error) {
        console.error('GET /api/admin/models-status:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ'
        });
    }
});

// ==================== تفعيل وتعطيل نموذج ====================

app.post('/api/admin/toggle-model', async (req, res) => {
    try {
        const {
            adminEmail,
            uniqueKey
        } = req.body;

        const normalizedEmail =
            String(adminEmail || '').trim().toLowerCase();

        const admin = await User.findOne({
            email: normalizedEmail,
            role: 'admin'
        });

        if (!admin) {
            return res.status(403).json({
                success: false,
                message: '⛔ ليس لديك صلاحية!'
            });
        }

        let modelStatus = await ModelStatus.findOne({ uniqueKey });

        if (modelStatus) {
            modelStatus.active = !modelStatus.active;
            await modelStatus.save();
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
        console.error('POST /api/admin/toggle-model:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ'
        });
    }
});

// ==================== تسجيل إجابة الطالب ====================

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
        } = req.body || {};

        const normalizedEmail =
            String(email || '').trim().toLowerCase();

        if (!normalizedEmail) {
            return res.status(400).json({
                success: false,
                message: 'البريد مطلوب'
            });
        }

        const user = await User.findOne({
            email: normalizedEmail
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        await Attempt.create({
            email: normalizedEmail,
            questionId,
            section,
            type,
            model: Number(model) || 1,
            chosenAnswer,
            correct: Boolean(correct),
            score: Number(score) || 1
        });

        res.json({ success: true });
    } catch (error) {
        console.error('POST /api/attempts:', error);
        res.status(500).json({
            success: false,
            message: 'تعذر تسجيل المحاولة'
        });
    }
});

// ==================== إحصائيات الطالب ====================

app.post('/api/student/stats', async (req, res) => {
    try {
        const email =
            String(req.body?.email || '').trim().toLowerCase();

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'البريد مطلوب'
            });
        }

        const attempts = await Attempt.find({ email }).lean();

        const correctAnswers =
            attempts.filter(attempt => attempt.correct).length;

        const averageScore = attempts.length
            ? Math.round(correctAnswers / attempts.length * 100)
            : 0;

        const bySection = {};

        attempts.forEach(attempt => {
            const section = attempt.section || 'quant';

            bySection[section] ||= {
                total: 0,
                correct: 0
            };

            bySection[section].total++;

            if (attempt.correct) {
                bySection[section].correct++;
            }
        });

        const weakPoints = Object.entries(bySection)
            .filter(([, value]) => value.total >= 3)
            .map(([section, value]) => ({
                section,
                accuracy: Math.round(
                    value.correct / value.total * 100
                )
            }))
            .filter(item => item.accuracy < 70)
            .sort((a, b) => a.accuracy - b.accuracy);

        res.json({
            success: true,
            correctAnswers,
            testsTaken: attempts.length,
            averageScore,
            weakPoints
        });
    } catch (error) {
        console.error('POST /api/student/stats:', error);
        res.status(500).json({
            success: false,
            message: 'تعذر تحميل إحصائيات الطالب'
        });
    }
});

// ==================== تحليلات المنصة للمشرف ====================

app.post('/api/admin/analytics', async (req, res) => {
    try {
        const email =
            String(req.body?.email || '').trim().toLowerCase();

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
            User.countDocuments({ role: { $ne: 'admin' } }),
            Attempt.find({}).lean()
        ]);

        const averageScore = attempts.length
            ? Math.round(
                attempts.filter(attempt => attempt.correct).length /
                attempts.length * 100
            )
            : 0;

        const groups = new Map();

        attempts.forEach(attempt => {
            const section = attempt.type === 'qiyas_simulation'
                ? 'mock'
                : (attempt.section || 'quant');

            const modelNum = Number(attempt.model) || 1;
            const key = `${section}|${modelNum}`;

            if (!groups.has(key)) {
                groups.set(key, {
                    section,
                    model: modelNum,
                    correctAnswers: 0,
                    answers: 0,
                    studentsSet: new Set()
                });
            }

            const group = groups.get(key);

            group.answers++;

            if (attempt.correct) {
                group.correctAnswers++;
            }

            group.studentsSet.add(attempt.email);
        });

        const popularModels = [...groups.values()]
            .map(group => ({
                section: group.section,
                model: group.model,
                correctAnswers: group.correctAnswers,
                answers: group.answers,
                students: group.studentsSet.size,
                averageScore: Math.round(
                    group.correctAnswers / group.answers * 100
                )
            }))
            .sort((a, b) => b.correctAnswers - a.correctAnswers)
            .slice(0, 10);

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
        console.error('POST /api/admin/analytics:', error);
        res.status(500).json({
            success: false,
            message: 'تعذر تحميل التحليلات'
        });
    }
});

// ==================== حذف الإحصائيات ====================
// يحذف المحاولات وإنجازات النماذج معًا، مع الحفاظ على الحسابات والأسئلة والنماذج.

app.post('/api/admin/delete-statistics', async (req, res) => {
    try {
        const email =
            String(req.body?.email || '').trim().toLowerCase();

        const scope = String(req.body?.scope || '');

        if (!['students', 'platform'].includes(scope)) {
            return res.status(400).json({
                success: false,
                message: 'نوع حذف الإحصائيات غير صالح.'
            });
        }

        const admin = await User.findOne({
            email,
            role: 'admin'
        }).select('_id');

        if (!admin) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.'
            });
        }

        // كلا الخيارين يحذف سجلات المحاولات كلها.
        // لذلك ستُصفّر إحصائيات الطلاب والأداء العام معاً.
        const attemptResult = await Attempt.deleteMany({});
        const completionResult = await CompletedModel.deleteMany({});

        return res.json({
            success: true,
            scope,
            deletedCount: (attemptResult.deletedCount || 0) + (completionResult.deletedCount || 0),
            deletedAttempts: attemptResult.deletedCount || 0,
            deletedCompletions: completionResult.deletedCount || 0,
            message: scope === 'students'
                ? 'تم تصفير إحصائيات جميع الطلاب بنجاح.'
                : 'تم تصفير إحصائيات الأداء في المنصة بنجاح.'
        });
    } catch (error) {
        console.error('POST /api/admin/delete-statistics:', error);

        return res.status(500).json({
            success: false,
            message: 'تعذر حذف الإحصائيات حالياً.'
        });
    }
});


// ==================== إعداد إنجاز الطلاب (محفوظ في MongoDB) ====================
const achievementConfigSchema = new mongoose.Schema({
    key: { type: String, unique: true, default: 'global' },
    requiredModels: { type: Number, min: 1, max: 500, default: 10 },
    updatedBy: String,
    updatedAt: { type: Date, default: Date.now }
});
const AchievementConfig = mongoose.models.AchievementConfig ||
    mongoose.model('AchievementConfig', achievementConfigSchema);

const completedModelSchema = new mongoose.Schema({
    email: { type: String, required: true, lowercase: true },
    modelKey: { type: String, required: true },
    section: String,
    type: String,
    model: Number,
    score: { type: Number, min: 0, max: 100, default: 0 },
    correctCount: { type: Number, min: 0, default: 0 },
    totalQuestions: { type: Number, min: 0, default: 0 },
    completedAt: { type: Date, default: Date.now }
});
completedModelSchema.index({ email: 1, modelKey: 1 }, { unique: true });
const CompletedModel = mongoose.models.CompletedModel ||
    mongoose.model('CompletedModel', completedModelSchema);

async function getAchievementRequired() {
    let config = await AchievementConfig.findOne({ key: 'global' }).lean();
    return config?.requiredModels || 10;
}

// يقرأ الطالب الهدف والإنجاز المسجل في قاعدة البيانات
app.post('/api/student/achievement', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ success: false, message: 'البريد مطلوب' });
        const user = await User.findOne({ email }).select('_id role');
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        const [requiredModels, completed] = await Promise.all([
            getAchievementRequired(),
            CompletedModel.find({ email }).select('modelKey section type model score correctCount totalQuestions completedAt').lean()
        ]);
        res.json({
            success: true,
            requiredModels,
            completedCount: completed.length,
            percent: Math.min(100, Math.round(completed.length / requiredModels * 100)),
            completedModels: completed
        });
    } catch (error) {
        console.error('POST /api/student/achievement:', error);
        res.status(500).json({ success: false, message: 'تعذر تحميل الإنجاز' });
    }
});

// يُستدعى عند إنهاء نموذج؛ المفتاح الفريد يمنع احتساب النموذج مرتين
app.post('/api/student/achievement/complete', async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const section = String(req.body?.section || '').trim();
        const type = String(req.body?.type || 'practice').trim();
        const model = Number(req.body?.model);
        const score = Math.max(0, Math.min(100, Math.round(Number(req.body?.score) || 0)));
        const correctCount = Math.max(0, Math.round(Number(req.body?.correctCount) || 0));
        const totalQuestions = Math.max(0, Math.round(Number(req.body?.totalQuestions) || 0));
        if (!email || !section || !Number.isInteger(model) || model < 1) {
            return res.status(400).json({ success: false, message: 'بيانات النموذج غير مكتملة' });
        }
        const user = await User.findOne({ email }).select('_id');
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        const modelKey = `${section}:${type}:${model}`;
        let alreadyCompleted = false;
        try {
            await CompletedModel.findOneAndUpdate(
                { email, modelKey },
                { $set: { email, modelKey, section, type, model, score, correctCount, totalQuestions, completedAt: new Date() } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        } catch (error) {
            if (error.code === 11000) alreadyCompleted = true;
            else throw error;
        }
        const [requiredModels, completedCount] = await Promise.all([
            getAchievementRequired(),
            CompletedModel.countDocuments({ email })
        ]);
        res.json({
            success: true, alreadyCompleted, requiredModels, completedCount,
            percent: Math.min(100, Math.round(completedCount / requiredModels * 100))
        });
    } catch (error) {
        console.error('POST /api/student/achievement/complete:', error);
        res.status(500).json({ success: false, message: 'تعذر حفظ إنجاز النموذج' });
    }
});

// إعداد الهدف للمشرف فقط
app.post('/api/admin/achievement-settings', async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const requiredModels = Number(req.body?.requiredModels);
        const admin = await User.findOne({ email, role: 'admin' }).select('_id email');
        if (!admin) return res.status(403).json({ success: false, message: 'ليس لديك صلاحية' });
        if (!Number.isInteger(requiredModels) || requiredModels < 1 || requiredModels > 500) {
            return res.status(400).json({ success: false, message: 'أدخل عددًا صحيحًا بين 1 و500' });
        }
        await AchievementConfig.updateOne(
            { key: 'global' },
            { $set: { requiredModels, updatedBy: email, updatedAt: new Date() } },
            { upsert: true }
        );
        res.json({ success: true, requiredModels, message: 'تم حفظ هدف الإنجاز لجميع الطلاب' });
    } catch (error) {
        console.error('POST /api/admin/achievement-settings:', error);
        res.status(500).json({ success: false, message: 'تعذر حفظ إعداد الإنجاز' });
    }
});

app.post('/api/admin/achievement-settings/get', async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const admin = await User.findOne({ email, role: 'admin' }).select('_id');
        if (!admin) return res.status(403).json({ success: false, message: 'ليس لديك صلاحية' });
        res.json({ success: true, requiredModels: await getAchievementRequired() });
    } catch (error) {
        console.error('POST /api/admin/achievement-settings/get:', error);
        res.status(500).json({ success: false, message: 'تعذر تحميل إعداد الإنجاز' });
    }
});


// ==================== تشغيل الخادم ====================

async function startServer() {
    if (!MONGO_URI) {
        console.error(
            '❌ متغير البيئة MONGO_URI غير مضبوط. أضف رابط MongoDB إلى إعدادات البيئة.'
        );
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 15000
        });

        console.log('🚀 تم الاتصال بقاعدة بيانات MongoDB Atlas بنجاح!');

        await initAdmin();

        app.listen(PORT, () => {
            console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
        });
    } catch (error) {
        console.error(
            '❌ تعذر الاتصال بـ MongoDB؛ لم يتم تشغيل الخادم:',
            error.message
        );

        process.exit(1);
    }
}

startServer();
