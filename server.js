const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 1. الاتصال بقاعدة البيانات السحابية
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas successfully!'))
  .catch((err) => console.error('MongoDB connection error:', err));

// 2. تعريف مخططات البيانات (Schemas) لقاعدة البيانات
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    pass: { type: String, required: true },
    role: { type: String, default: 'student' }
});

const questionSchema = new mongoose.Schema({
    section: String,
    text: String,
    options: [String],
    correct: Number
});

const User = mongoose.model('User', userSchema);
const Question = mongoose.model('Question', questionSchema);

// دالة تهيئة المشرف الافتراضي عند أول تشغيل
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
            console.log('Default admin created successfully!');
        }
    } catch (err) {
        console.error('Error initializing admin:', err);
    }
}
initAdmin();

// API تسجيل الحسابات
app.post('/api/register', async (req, res) => {
    try {
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

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.json({ success: false, message: '⚠️ هذا البريد مسجل مسبقاً، جرب تسجيل الدخول أو استخدم بريداً آخر!' });
        }

        await User.create({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            pass,
            role: 'student'
        });

        res.json({ success: true, message: '🎉 كفو عليك! تم إنشاء حسابك بنجاح، انطلق نحو القمة!' });
    } catch (error) {
        res.json({ success: false, message: '❌ حدث خطأ في الخادم، حاول مجدداً.' });
    }
});

// API تسجيل الدخول
app.post('/api/login', async (req, res) => {
    try {
        const { email, pass } = req.body;
        
        if (!email || !pass) {
            return res.json({ success: false, message: '⚠️ يرجى تعبئة كافة حقول البريد وكلمة المرور!' });
        }

        const user = await User.findOne({ email: email.toLowerCase(), pass });
        if (!user) {
            return res.json({ success: false, message: '❌ بيانات الدخول خاطئة! تأكد من البريد وكلمة المرور وحاول مجدداً.' });
        }
        
        res.json({ success: true, message: '🚀 أهلاً بك مجدداً في قمة النجاح!', name: user.name, role: user.role });
    } catch (error) {
        res.json({ success: false, message: '❌ حدث خطأ في الخادم.' });
    }
});

// API التحقق من البريد لنسيت كلمة المرور
app.post('/api/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            return res.json({ success: false, message: '❌ البريد الإلكتروني غير مسجل في النظام!' });
        }
        res.json({ success: true, message: '✅ تم العثور على الحساب، يرجى إدخال كلمة المرور الجديدة.' });
    } catch (error) {
        res.json({ success: false, message: '❌ حدث خطأ في الخادم.' });
    }
});

// API تغيير كلمة المرور المنسية
app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, newPass } = req.body;
        
        if (!newPass || newPass.length < 6 || newPass.length > 18) {
            return res.json({ success: false, message: '⚠️ كلمة المرور الجديدة يجب أن تكون بين 6 إلى 18 حرفاً أو رقماً.' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.json({ success: false, message: '❌ حدث خطأ ما، البريد غير موجود.' });
        }

        user.pass = newPass;
        await user.save();
        res.json({ success: true, message: '🎉 تم تحديث كلمة المرور بنجاح! يمكنك تسجيل الدخول الآن.' });
    } catch (error) {
        res.json({ success: false, message: '❌ حدث خطأ في الخادم.' });
    }
});

// API إضافة الأسئلة
app.post('/api/add-question', async (req, res) => {
    try {
        const { section, text, options, correct } = req.body;
        await Question.create({ section, text, options, correct });
        res.json({ success: true, message: '🎯 تم حفظ السؤال بنجاح في بنك الأسئلة!' });
    } catch (error) {
        res.json({ success: false, message: '❌ حدث خطأ أثناء حفظ السؤال.' });
    }
});

// API جلب الأسئلة
app.get('/api/questions', async (req, res) => {
    try {
        const questions = await Question.find({});
        res.json(questions);
    } catch (error) {
        res.json([]);
    }
});

// API جلب المستخدمين (إظهار الأسماء والإيميلات والأدوار فقط)
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({}, { name: 1, email: 1, role: 1, _id: 0 });
        res.json(users);
    } catch (error) {
        res.json([]);
    }
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على الرابط: http://localhost:${PORT}`);
});
