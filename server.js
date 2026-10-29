const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); res.setHeader('X-Frame-Options', 'DENY'); next(); });
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

// ==================== رموز استعادة كلمة المرور (مؤقتة ومحدودة) ====================
const resetCodes = new Map();       // email -> { codeHash, expiresAt, attempts, lastSentAt }
const resetSessions = new Map();    // tokenHash -> { email, expiresAt }
const resetRequestLimits = new Map();
const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_SESSION_TTL_MS = 10 * 60 * 1000;
const RESET_RESEND_COOLDOWN_MS = 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;

function hashResetValue(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// كلمات المرور الجديدة تُخزّن باستخدام scrypt. تُرقّى كلمات المرور القديمة تلقائياً عند أول دخول ناجح.
const SESSION_COOKIE = 'qumma_session';
const SESSION_TTL = 8 * 60 * 60;
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex');
        crypto.scrypt(String(password), salt, 64, (err, key) => {
            if (err) return reject(err);
            resolve(`scrypt$${salt}$${key.toString('hex')}`);
        });
    });
}
async function verifyPassword(password, stored) {
    const value = String(stored || '');
    if (!value.startsWith('scrypt$')) return { valid: value === String(password), legacy: value === String(password) };
    const parts = value.split('$');
    if (parts.length !== 3) return { valid: false, legacy: false };
    try {
        const expected = Buffer.from(parts[2], 'hex');
        const actual = await new Promise((resolve, reject) => crypto.scrypt(String(password), parts[1], expected.length, (err, key) => err ? reject(err) : resolve(key)));
        return { valid: expected.length === actual.length && crypto.timingSafeEqual(expected, actual), legacy: false };
    } catch { return { valid: false, legacy: false }; }
}
function makeSessionToken(payload) {
    if (!SESSION_SECRET) return '';
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
    return `${body}.${sig}`;
}
function readSessionToken(token) {
    if (!SESSION_SECRET || !token || typeof token !== 'string') return null;
    const parts = token.split('.'); if (parts.length !== 2) return null;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(parts[0]).digest();
    let actual; try { actual = Buffer.from(parts[1], 'base64url'); } catch { return null; }
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    try { const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); if (!data.email || !data.exp || data.exp <= Math.floor(Date.now()/1000)) return null; return data; } catch { return null; }
}
function setSessionCookie(res, token) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}${secure}`);
}
function getSessionFromRequest(req) { return readSessionToken(getRequestCookie(req, SESSION_COOKIE)); }
async function requireUser(req, res, next) {
    try { const session = getSessionFromRequest(req); if (!session) return res.status(401).json({success:false,message:'يرجى تسجيل الدخول من جديد.'});
        const user = await User.findOne({email:String(session.email).toLowerCase()}).select('name email role');
        if (!user) return res.status(401).json({success:false,message:'الحساب غير متاح.'});
        req.authUser = user; if (req.body && typeof req.body === 'object') req.body.email = user.email; next();
    } catch (e) { return res.status(500).json({success:false,message:'تعذر التحقق من الجلسة.'}); }
}
async function requireAdmin(req, res, next) {
    try { const session = getSessionFromRequest(req); if (!session) return res.status(401).json({success:false,message:'يلزم تسجيل الدخول بحساب المشرف.'});
        const admin = await User.findOne({email:String(session.email).toLowerCase(),role:'admin'}).select('name email role');
        if (!admin) return res.status(403).json({success:false,message:'ليس لديك صلاحية المشرف.'});
        req.authUser = admin; if (req.body && typeof req.body === 'object') { req.body.email = admin.email; req.body.adminEmail = admin.email; } next();
    } catch (e) { return res.status(500).json({success:false,message:'تعذر التحقق من الصلاحيات.'}); }
}
function cleanExpiredResetData() {
    const now = Date.now();
    for (const [email, item] of resetCodes) {
        if (item.expiresAt <= now) resetCodes.delete(email);
    }
    for (const [tokenHash, item] of resetSessions) {
        if (item.expiresAt <= now) resetSessions.delete(tokenHash);
    }
    for (const [key, item] of resetRequestLimits) {
        if (item.expiresAt <= now) resetRequestLimits.delete(key);
    }
}
function getMailer() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) return null;
    const port = Number(process.env.SMTP_PORT || 587);
    return nodemailer.createTransport({
        host,
        port,
        secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
        auth: { user, pass }
    });
}


const questionSchema = new mongoose.Schema({
    id: Number,
    section: String,
    type: String,
    model: Number,
    examSection: { type: Number, min: 1, max: 10, default: 1 },
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

const modelTimerSchema = new mongoose.Schema({ key: { type: String, unique: true, index: true }, minutes: { type: Number, default: 0 } }, { timestamps: true });
const ModelTimer = mongoose.models.ModelTimer || mongoose.model('ModelTimer', modelTimerSchema);

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
                pass: await hashPassword(adminPassword),
                role: 'admin'
            });

            console.log('👑 تم إنشاء حساب المشرف من متغيرات البيئة.');
        }
    } catch (e) {
        console.error('Error initializing admin:', e);
    }
}


// ==================== دخول مستقل لرابط لوحة المشرف فقط ====================
// لا يغيّر هذا القسم تسجيل دخول الطلاب أو المشرف داخل الموقع ولا يحمي بقية واجهات API.
const ADMIN_PAGE_COOKIE = 'qumma_admin_page_session';
const ADMIN_PAGE_TTL = 8 * 60 * 60;
const ADMIN_PAGE_SECRET = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || '';

function makeAdminPageToken(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', ADMIN_PAGE_SECRET).update(body).digest('base64url');
    return `${body}.${signature}`;
}
function readAdminPageToken(token) {
    if (!ADMIN_PAGE_SECRET || !token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const expected = crypto.createHmac('sha256', ADMIN_PAGE_SECRET).update(parts[0]).digest();
    let actual;
    try { actual = Buffer.from(parts[1], 'base64url'); } catch { return null; }
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    try {
        const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        if (!payload.email || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch { return null; }
}
function getRequestCookie(req, name) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index >= 0 && part.slice(0, index).trim() === name) {
            try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return ''; }
        }
    }
    return '';
}
function setAdminPageCookie(res, token) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${ADMIN_PAGE_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_PAGE_TTL}${secure}`);
}
function clearAdminPageCookie(res) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${ADMIN_PAGE_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

app.post('/api/admin/login', async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const pass = String(req.body?.pass || '');
        if (!email || !pass) return res.status(400).json({ success: false, message: 'أدخل البريد الإلكتروني وكلمة المرور.' });
        if (!ADMIN_PAGE_SECRET) return res.status(500).json({ success: false, message: 'أضف ADMIN_SESSION_SECRET في إعدادات Render.' });
        const admin = await User.findOne({ email, role: 'admin' }).select('name email pass');
        if (!admin || !(await verifyPassword(pass, admin.pass)).valid) return res.status(401).json({ success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
        const passwordCheck = await verifyPassword(pass, admin.pass); if (passwordCheck.legacy) { admin.pass = await hashPassword(pass); await admin.save(); }
        const sessionToken = makeSessionToken({ email: admin.email, role: 'admin', exp: Math.floor(Date.now() / 1000) + SESSION_TTL }); if (sessionToken) setSessionCookie(res, sessionToken);
        const token = makeAdminPageToken({ email: admin.email, exp: Math.floor(Date.now() / 1000) + ADMIN_PAGE_TTL });
        setAdminPageCookie(res, token);
        res.set('Cache-Control', 'no-store');
        return res.json({ success: true, name: admin.name, email: admin.email });
    } catch (error) {
        console.error('POST /api/admin/login:', error);
        return res.status(500).json({ success: false, message: 'تعذر تسجيل الدخول حالياً.' });
    }
});

app.get('/api/admin/session', async (req, res) => {
    try {
        const session = readAdminPageToken(getRequestCookie(req, ADMIN_PAGE_COOKIE));
        if (!session) return res.status(401).json({ success: false, message: 'يرجى تسجيل الدخول.' });
        const admin = await User.findOne({ email: session.email, role: 'admin' }).select('name email');
        if (!admin) {
            clearAdminPageCookie(res);
            return res.status(401).json({ success: false, message: 'حساب المشرف غير متاح.' });
        }
        res.set('Cache-Control', 'no-store');
        return res.json({ success: true, name: admin.name, email: admin.email });
    } catch (error) {
        console.error('GET /api/admin/session:', error);
        return res.status(500).json({ success: false, message: 'تعذر التحقق من الجلسة.' });
    }
});

app.post('/api/admin/logout', (req, res) => {
    clearAdminPageCookie(res);
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', [`${ADMIN_PAGE_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`, `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`]);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true });
});

// نقطة خاصة بصفحة admin.html فقط؛ تبقى واجهات إدارة الموقع القديمة كما هي.
app.post('/api/admin/private-users', async (req, res) => {
    try {
        const session = readAdminPageToken(getRequestCookie(req, ADMIN_PAGE_COOKIE));
        if (!session) return res.status(401).json({ success: false, message: 'يرجى تسجيل الدخول بحساب المشرف.' });
        const admin = await User.findOne({ email: session.email, role: 'admin' }).select('name email');
        if (!admin) return res.status(401).json({ success: false, message: 'حساب المشرف غير متاح.' });
        const users = await User.find({}).select('name email role').lean();
        res.set('Cache-Control', 'no-store');
        return res.json({
            success: true,
            adminName: admin.name,
            users: users.map(user => ({
                name: user.name,
                email: user.email,
                role: user.role === 'admin' ? 'مشرف (Admin)' : 'طالب (Student)'
            }))
        });
    } catch (error) {
        console.error('POST /api/admin/private-users:', error);
        return res.status(500).json({ success: false, message: 'حدث خطأ في الخادم.' });
    }
});

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
            pass: await hashPassword(pass),
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

        const user = await User.findOne({ email: normalizedEmail });
        const passwordCheck = user ? await verifyPassword(pass, user.pass) : { valid: false, legacy: false };
        if (!user || !passwordCheck.valid) {
            return res.json({
                success: false,
                message: '❌ بيانات الدخول خاطئة!'
            });
        }

        if (passwordCheck.legacy) { user.pass = await hashPassword(pass); await user.save(); }
        const sessionToken = makeSessionToken({ email: user.email, role: user.role, exp: Math.floor(Date.now() / 1000) + SESSION_TTL });
        if (sessionToken) setSessionCookie(res, sessionToken);
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, name: user.name, role: user.role, email: user.email });
    } catch (error) {
        console.error('POST /api/login:', error);
        res.status(500).json({
            success: false,
            message: '❌ حدث خطأ في الخادم'
        });
    }
});

// ==================== استعادة كلمة المرور بالبريد ورمز مؤقت ====================

// إرسال رمز الاستعادة. الاستجابة موحدة حتى لا نكشف إن كان البريد مسجلاً.
app.post('/api/forgot-password/request', async (req, res) => {
    cleanExpiredResetData();
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, message: 'أدخل بريدًا إلكترونيًا صحيحًا.' });
        }

        const now = Date.now();
        const limitKey = `${ip}:${email}`;
        const limit = resetRequestLimits.get(limitKey);
        if (limit && limit.count >= 5 && limit.expiresAt > now) {
            return res.status(429).json({ success: false, message: 'تم تجاوز عدد المحاولات. حاول لاحقًا.' });
        }
        if (limit && limit.expiresAt > now) limit.count += 1;
        else resetRequestLimits.set(limitKey, { count: 1, expiresAt: now + 15 * 60 * 1000 });

        const previous = resetCodes.get(email);
        if (previous && now - previous.lastSentAt < RESET_RESEND_COOLDOWN_MS) {
            return res.status(429).json({ success: false, message: 'انتظر دقيقة قبل طلب رمز جديد.' });
        }

        const user = await User.findOne({ email }).select('_id email');
        if (!user) {
            return res.json({ success: true, message: 'إذا كان البريد مسجلًا لدينا، فستصلك رسالة تحتوي على رمز الاستعادة.' });
        }

        const appsScriptUrl = String(process.env.GOOGLE_APPS_SCRIPT_URL || '').trim();
        const resetApiSecret = String(process.env.RESET_API_SECRET || '');
        if (!appsScriptUrl || !resetApiSecret) {
            console.error('Password reset email is not configured: missing GOOGLE_APPS_SCRIPT_URL or RESET_API_SECRET.');
            return res.status(503).json({ success: false, message: 'خدمة البريد غير مهيأة حاليًا. يرجى المحاولة لاحقًا.' });
        }

        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');

        // Apps Script يتولى إرسال البريد فقط؛ الخادم يحتفظ بالرمز المشفّر ويتحقق منه.
        const mailResponse = await fetch(appsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret: resetApiSecret, email, code }),
            signal: AbortSignal.timeout(20000)
        });

        let mailResult;
        try {
            mailResult = await mailResponse.json();
        } catch {
            throw new Error(`Password email service returned a non-JSON response (HTTP ${mailResponse.status}).`);
        }

        if (!mailResponse.ok || mailResult?.success !== true) {
            // لا نطبع محتوى الطلب أو المفتاح السري في السجلات.
            console.error('Password email service failed:', mailResult?.error || `HTTP ${mailResponse.status}`);
            return res.status(502).json({ success: false, message: 'تعذر إرسال الرمز حاليًا. حاول لاحقًا.' });
        }

        const codeHash = hashResetValue(`${email}:${code}`);
        resetCodes.set(email, {
            codeHash,
            expiresAt: now + RESET_CODE_TTL_MS,
            attempts: 0,
            lastSentAt: now
        });

        return res.json({ success: true, message: 'إذا كان البريد مسجلًا لدينا، فستصلك رسالة تحتوي على رمز الاستعادة.' });
    } catch (error) {
        console.error('POST /api/forgot-password/request:', error.message);
        return res.status(500).json({ success: false, message: 'تعذر إرسال الرمز حاليًا. حاول لاحقًا.' });
    }
});

// التحقق من الرمز وإصدار جلسة استعادة عشوائية مرتبطة بالبريد وصالحة مرة واحدة.
app.post('/api/forgot-password/verify', async (req, res) => {
    cleanExpiredResetData();
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const code = String(req.body?.code || '').trim();
        const item = resetCodes.get(email);
        if (!item || item.expiresAt <= Date.now()) {
            resetCodes.delete(email);
            return res.status(400).json({ success: false, message: 'الرمز غير صالح أو انتهت صلاحيته. اطلب رمزًا جديدًا.' });
        }
        item.attempts += 1;
        if (item.attempts > RESET_MAX_ATTEMPTS) {
            resetCodes.delete(email);
            return res.status(429).json({ success: false, message: 'تجاوزت عدد المحاولات. اطلب رمزًا جديدًا.' });
        }
        if (!/^\d{6}$/.test(code) || hashResetValue(`${email}:${code}`) !== item.codeHash) {
            if (item.attempts >= RESET_MAX_ATTEMPTS) resetCodes.delete(email);
            return res.status(400).json({ success: false, message: 'رمز التحقق غير صحيح.' });
        }

        resetCodes.delete(email); // الرمز صالح لاستخدام واحد فقط
        const resetToken = crypto.randomBytes(32).toString('hex');
        resetSessions.set(hashResetValue(resetToken), {
            email,
            expiresAt: Date.now() + RESET_SESSION_TTL_MS
        });
        return res.json({
            success: true,
            resetToken,
            message: 'تم التحقق من الرمز. يمكنك الآن تعيين كلمة مرور جديدة.'
        });
    } catch (error) {
        console.error('POST /api/forgot-password/verify:', error.message);
        return res.status(500).json({ success: false, message: 'تعذر التحقق من الرمز حاليًا.' });
    }
});

// لا يمكن تغيير كلمة المرور إلا برمز جلسة ناتج عن تحقق ناجح، وتُستهلك الجلسة بعد الاستخدام.
app.post('/api/reset-password', async (req, res) => {
    cleanExpiredResetData();
    try {
        const newPass = String(req.body?.newPass || '');
        const resetToken = String(req.body?.resetToken || '');
        if (newPass.length < 6 || newPass.length > 128) {
            return res.status(400).json({ success: false, message: 'يجب أن تكون كلمة المرور بين 6 و128 حرفًا.' });
        }
        if (!/^[a-f0-9]{64}$/i.test(resetToken)) {
            return res.status(401).json({ success: false, message: 'جلسة الاستعادة غير صالحة. ابدأ العملية من جديد.' });
        }

        const tokenHash = hashResetValue(resetToken);
        const session = resetSessions.get(tokenHash);
        if (!session || session.expiresAt <= Date.now()) {
            resetSessions.delete(tokenHash);
            return res.status(401).json({ success: false, message: 'انتهت جلسة الاستعادة. اطلب رمزًا جديدًا.' });
        }

        const user = await User.findOne({ email: session.email });
        if (!user) {
            resetSessions.delete(tokenHash);
            return res.status(400).json({ success: false, message: 'تعذر استعادة الحساب. ابدأ العملية من جديد.' });
        }

        user.pass = await hashPassword(newPass);
        await user.save();
        resetSessions.delete(tokenHash);
        return res.json({ success: true, message: 'تم تحديث كلمة المرور بنجاح.' });
    } catch (error) {
        console.error('POST /api/reset-password:', error.message);
        return res.status(500).json({ success: false, message: 'حدث خطأ في الخادم.' });
    }
});

// ==================== جلب الأسئلة ====================

app.get('/api/questions', requireUser, async (req, res) => {
    try {
        // lean() يقلل استهلاك الذاكرة والوقت عند تحميل بنك الأسئلة الكبير.
        const questions = await Question.find({}).lean();
        res.set('Cache-Control', 'no-store');
        res.json(questions);
    } catch (error) {
        console.error('GET /api/questions:', error);
        res.status(500).json([]);
    }
});

// ==================== إضافة سؤال ====================

app.post('/api/add-question', requireAdmin, async (req, res) => {
    try {
        const {
            section,
            type,
            model,
            examSection,
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
            examSection: ['simulation','qiyas_simulation'].includes(type) ? Math.min(10, Math.max(1, Number(examSection) || 1)) : 1,
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

app.post('/api/edit-question', requireAdmin, async (req, res) => {
    try {
        const {
            index,
            section,
            type,
            model,
            examSection,
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
            targetQuestion.examSection = ['simulation','qiyas_simulation'].includes(type) ? Math.min(10, Math.max(1, Number(examSection) || 1)) : 1;
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

app.post('/api/move-question', requireAdmin, async (req, res) => {
    try {
        const { index, ids, section, type, model } = req.body;
        if (Array.isArray(ids) && ids.length) {
            const validIds = ids.filter(id => mongoose.isValidObjectId(id));
            if (!validIds.length) return res.status(400).json({ success:false, message:'لم يتم تحديد أسئلة صالحة.' });
            const result = await Question.updateMany({ _id: { $in: validIds } }, { $set: { section, type, model: Number(model) } });
            return res.json({ success:true, modifiedCount: result.modifiedCount, message:'تم نقل الأسئلة المحددة بنجاح.' });
        }
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

// تعديل قسم مجموعة أسئلة محددة (لمحاكي الكمي واللفظي فقط)
app.post('/api/admin/bulk-question-section', requireAdmin, async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(id => mongoose.isValidObjectId(id)) : [];
        const examSection = Number(req.body?.examSection);
        if (!ids.length) return res.status(400).json({ success:false, message:'حدد سؤالاً واحداً على الأقل.' });
        if (!Number.isInteger(examSection) || examSection < 1 || examSection > 10) return res.status(400).json({ success:false, message:'القسم يجب أن يكون من 1 إلى 10.' });
        const result = await Question.updateMany({ _id: { $in: ids }, $or: [{ section: { $in: ['quant','verbal'] }, type: 'simulation' }, { type: 'qiyas_simulation' }] }, { $set: { examSection } });
        return res.json({ success:true, modifiedCount:result.modifiedCount, message:'تم تعديل القسم للأسئلة المحددة.' });
    } catch (error) { console.error('bulk-question-section:', error); return res.status(500).json({ success:false, message:'حدث خطأ أثناء تعديل القسم.' }); }
});

// ==================== حذف سؤال ====================

app.post('/api/delete-question', requireAdmin, async (req, res) => {
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

app.post('/api/add-custom-model', requireAdmin, async (req, res) => {
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

app.post('/api/admin/delete-model', requireAdmin, async (req, res) => {
    try {
        const { modelKey } = req.body || {};
        if (!modelKey) return res.status(400).json({ success: false, message: 'بيانات النموذج غير مكتملة.' });

        const parts = String(modelKey).split('_');
        const targetNum = Number(parts.pop());
        const categoryPrefix = parts.join('_');
        if (!Number.isInteger(targetNum) || targetNum < 1 || !categoryPrefix) {
            return res.status(400).json({ success: false, message: 'مفتاح النموذج غير صالح.' });
        }

        const isMock = categoryPrefix === 'qiyas_simulation';
        const type = isMock ? 'qiyas_simulation' : categoryPrefix.substring(categoryPrefix.indexOf('_') + 1);
        const section = isMock ? null : categoryPrefix.split('_')[0];
        const prefix = `${categoryPrefix}_`;
        const modelFilter = isMock
            ? { type: 'qiyas_simulation', model: targetNum }
            : { section, type, model: targetNum };

        // حذف بيانات النموذج المحذوف حتى لا تنتقل درجته إلى نموذج جديد يستخدم الرقم نفسه.
        await Promise.all([
            CustomModel.deleteOne({ key: modelKey }),
            ModelStatus.deleteOne({ uniqueKey: modelKey }),
            ModelTimer.deleteOne({ key: modelKey }),
            Question.deleteMany(modelFilter),
            Attempt.deleteMany(modelFilter),
            // امسح إنجازات هذا النموذج لكل الطلاب باستخدام مفتاح الإنجاز الفعلي
            // (يختلف عن مفتاح الحذف مثل quant_practice_1).
            CompletedModel.deleteMany({
                modelKey: isMock
                    ? `mock:qiyas_simulation:${targetNum}`
                    : `${section}:${type === 'practice' ? 'training' : type === 'simulation' ? 'exam' : type}:${targetNum}`
            })
        ]);

        // إعادة ترقيم النماذج التالية فقط داخل الفئة نفسها، مع تحديث كل المراجع المرتبطة بها.
        const remaining = await CustomModel.find({ key: { $regex: '^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } }).lean();
        const entries = remaining.map(item => ({ item, number: Number(item.key.slice(prefix.length)) }))
            .filter(x => Number.isInteger(x.number) && x.number > targetNum)
            .sort((a, b) => a.number - b.number);

        const relatedData = new Map();
        for (const { item } of entries) {
            const [status, timer] = await Promise.all([
                ModelStatus.findOne({ uniqueKey: item.key }).lean(),
                ModelTimer.findOne({ key: item.key }).lean()
            ]);
            relatedData.set(item.key, { status, timer });
            await CustomModel.deleteOne({ key: item.key });
            await ModelStatus.deleteOne({ uniqueKey: item.key });
            await ModelTimer.deleteOne({ key: item.key });
        }

        for (const { item, number } of entries) {
            const newNumber = number - 1;
            const newKey = `${prefix}${newNumber}`;
            const oldNumberFilter = isMock
                ? { type: 'qiyas_simulation', model: number }
                : { section, type, model: number };
            const newNumberUpdate = { $set: { model: newNumber } };
            await Question.updateMany(oldNumberFilter, newNumberUpdate);
            await Attempt.updateMany(oldNumberFilter, newNumberUpdate);
            await CompletedModel.updateMany({ modelKey: item.key }, { $set: { modelKey: newKey, model: newNumber } });
            await CustomModel.create({ key: newKey, name: item.name });

            const saved = relatedData.get(item.key) || {};
            if (saved.status) await ModelStatus.updateOne({ uniqueKey: newKey }, { $set: { active: saved.status.active } }, { upsert: true });
            if (saved.timer) await ModelTimer.updateOne({ key: newKey }, { $set: { minutes: saved.timer.minutes } }, { upsert: true });
        }

        res.set('Cache-Control', 'no-store');
        return res.json({ success: true, message: 'تم حذف النموذج وإعادة ترقيم النماذج المتبقية.' });
    } catch (error) {
        console.error('POST /api/admin/delete-model:', error);
        return res.status(500).json({ success: false, message: '❌ حدث خطأ أثناء الحذف' });
    }
});

// ==================== تعديل ونقل نموذج كامل ====================

app.post('/api/admin/edit-model-full', requireAdmin, async (req, res) => {
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
        // نماذج محاكي قياس مفتاحها qiyas_simulation_N لكن أسئلتها محفوظة بنوع qiyas_simulation،
        // وليس بالقسم qiyas والنوع simulation؛ لذلك نبحث عنها بالنوع ورقم النموذج فقط.
        const oldIsQiyas = oldSec === 'qiyas' && oldType === 'simulation';
        const oldQuestionFilter = (number) => oldIsQiyas
            ? { type: 'qiyas_simulation', model: Number(number) }
            : { section: oldSec, type: oldType, model: Number(number) };

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
            oldQuestionFilter(oldModelNum),
            {
                $set: {
                    section: updatedSection,
                    type: updatedType,
                    model: assignedModelNum
                }
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
                        oldQuestionFilter(entry.number),
                        { $set: { model: newNumber } }
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

app.post('/api/admin/users', requireAdmin, async (req, res) => {
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

app.post('/api/admin/delete-user', requireAdmin, async (req, res) => {
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

app.post('/api/admin/model-timer/get', requireAdmin, async (req, res) => {
  try { const key=String(req.body?.key||'').trim(); if(!key) return res.status(400).json({success:false,message:'مفتاح النموذج مطلوب'}); const row=await ModelTimer.findOne({key}); res.set('Cache-Control','no-store'); res.json({success:true,minutes:row?.minutes||0}); }
  catch(e){ console.error('model timer get',e); res.status(500).json({success:false,message:'تعذر تحميل وقت النموذج'}); }
});
app.post('/api/admin/model-timer', requireAdmin, async (req, res) => {
  try { const key=String(req.body?.key||'').trim(); const minutes=Math.max(0,Math.min(600,Math.round(Number(req.body?.minutes)||0))); if(!key) return res.status(400).json({success:false,message:'مفتاح النموذج مطلوب'}); await ModelTimer.updateOne({key},{$set:{minutes}},{upsert:true}); res.json({success:true,key,minutes}); }
  catch(e){ console.error('model timer save',e); res.status(500).json({success:false,message:'تعذر حفظ وقت النموذج'}); }
});

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

app.post('/api/admin/toggle-model', requireAdmin, async (req, res) => {
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

app.post('/api/attempts', requireUser, async (req, res) => {
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

        // لا نثق بنتيجة الصح/الخطأ أو الدرجة المرسلة من المتصفح؛ نتحقق منها من بنك الأسئلة.
        const question = await Question.findOne({ id: questionId }).select('correct_answer score section type model');
        if (!question) return res.status(404).json({ success: false, message: 'السؤال غير موجود.' });
        const isCorrect = String(chosenAnswer ?? '') === String(question.correct_answer ?? '');
        await Attempt.create({
            email: normalizedEmail,
            questionId,
            section: section || question.section || 'quant',
            type: type || question.type || 'practice',
            model: Number(model) || Number(question.model) || 1,
            chosenAnswer: String(chosenAnswer ?? ''),
            correct: isCorrect,
            score: Number(question.score) || 1
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

app.post('/api/student/stats', requireUser, async (req, res) => {
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

app.post('/api/admin/analytics', requireAdmin, async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const admin = await User.findOne({ email, role: 'admin' }).select('_id').lean();
        if (!admin) {
            return res.status(403).json({ success: false, message: 'ليس لديك صلاحية' });
        }

        // اجعل قاعدة البيانات تحسب الإحصاءات بدل تحميل كل المحاولات إلى ذاكرة Node.js.
        const [questionCount, modelCount, studentCount, totals, groupedAttempts] = await Promise.all([
            Question.countDocuments(),
            CustomModel.countDocuments(),
            User.countDocuments({ role: { $ne: 'admin' } }),
            Attempt.aggregate([
                { $group: { _id: null, attemptsCount: { $sum: 1 }, correctCount: { $sum: { $cond: [{ $eq: ['$correct', true] }, 1, 0] } } } }
            ]),
            Attempt.aggregate([
                { $group: {
                    _id: {
                        section: { $cond: [{ $eq: ['$type', 'qiyas_simulation'] }, 'mock', { $ifNull: ['$section', 'quant'] }] },
                        model: { $ifNull: ['$model', 1] }
                    },
                    correctAnswers: { $sum: { $cond: [{ $eq: ['$correct', true] }, 1, 0] } },
                    answers: { $sum: 1 },
                    studentsSet: { $addToSet: '$email' }
                } },
                { $project: {
                    _id: 0, section: '$_id.section', model: '$_id.model', correctAnswers: 1, answers: 1,
                    students: { $size: '$studentsSet' },
                    averageScore: { $cond: [{ $gt: ['$answers', 0] }, { $round: [{ $multiply: [{ $divide: ['$correctAnswers', '$answers'] }, 100] }, 0] }, 0] }
                } },
                { $sort: { correctAnswers: -1 } },
                { $limit: 10 }
            ])
        ]);

        const total = totals[0] || { attemptsCount: 0, correctCount: 0 };
        res.set('Cache-Control', 'no-store');
        res.json({
            success: true,
            questionCount,
            modelCount,
            studentCount,
            averageScore: total.attemptsCount ? Math.round(total.correctCount / total.attemptsCount * 100) : 0,
            attemptsCount: total.attemptsCount,
            popularModels: groupedAttempts
        });
    } catch (error) {
        console.error('POST /api/admin/analytics:', error);
        res.status(500).json({ success: false, message: 'تعذر تحميل التحليلات' });
    }
});

// ==================== درجات الطلاب ومراجعة الإجابات ====================

function normalizeAttemptSection(attempt) {
    return attempt.type === 'qiyas_simulation' ? 'mock' : (attempt.section || 'quant');
}
function latestUniqueAttempts(attempts) {
    const latest = new Map();
    for (const attempt of attempts) {
        const key = `${attempt.email || ''}|${attempt.section || ''}|${attempt.type || ''}|${Number(attempt.model) || 1}|${String(attempt.questionId ?? `missing-${attempt._id}`)}`;
        const previous = latest.get(key);
        if (!previous || new Date(attempt.createdAt) >= new Date(previous.createdAt)) latest.set(key, attempt);
    }
    return [...latest.values()];
}
function buildReviewItems(attempts, questions) {
    const questionMap = new Map();
    for (const q of questions) questionMap.set(String(q.id), q);
    return attempts.map(a => {
        const q = questionMap.get(String(a.questionId));
        return {
            questionId: a.questionId,
            question: q?.question || 'تعذر العثور على نص السؤال؛ ربما حُذف السؤال من المنصة.',
            options: Array.isArray(q?.options) ? q.options : [],
            image: q?.image || '',
            chosenAnswer: a.chosenAnswer || '',
            correctAnswer: q?.correct_answer || '',
            correct: Boolean(a.correct),
            score: Number(a.score) || 1,
            createdAt: a.createdAt
        };
    });
}
function attemptModelFilter(section, type, model) {
    const filter = { type: String(type || 'practice'), model: Number(model) || 1 };
    if (section === 'mock' || type === 'qiyas_simulation') filter.type = 'qiyas_simulation';
    else filter.section = section === 'verbal' ? 'verbal' : 'quant';
    return filter;
}

app.post('/api/student/reviews', requireUser, async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ success: false, message: 'البريد مطلوب' });
        const user = await User.findOne({ email }).select('_id');
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        const attempts = latestUniqueAttempts(await Attempt.find({ email }).sort({ createdAt: 1 }).lean());
        const groups = new Map();
        for (const a of attempts) {
            const section = normalizeAttemptSection(a), type = a.type || 'practice', model = Number(a.model) || 1;
            const key = `${section}|${type}|${model}`;
            if (!groups.has(key)) groups.set(key, { section, type, model, attempts: [], lastAttempt: a.createdAt });
            const g = groups.get(key); g.attempts.push(a);
            if (new Date(a.createdAt) > new Date(g.lastAttempt)) g.lastAttempt = a.createdAt;
        }
        const reviews = [...groups.values()].map(g => {
            const correct = g.attempts.filter(a => a.correct).length;
            return { section: g.section, type: g.type, model: g.model, answered: g.attempts.length, correct,
                score: g.attempts.length ? Math.round(correct / g.attempts.length * 100) : 0, lastAttempt: g.lastAttempt };
        }).sort((a,b) => new Date(b.lastAttempt) - new Date(a.lastAttempt));
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, reviews });
    } catch (error) {
        console.error('POST /api/student/reviews:', error);
        res.status(500).json({ success: false, message: 'تعذر تحميل الاختبارات السابقة' });
    }
});

app.post('/api/student/review-detail', requireUser, async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const { section, type, model } = req.body || {};
        if (!email || !type || !Number.isFinite(Number(model))) return res.status(400).json({ success: false, message: 'بيانات المراجعة غير مكتملة' });
        const user = await User.findOne({ email }).select('_id');
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        const filter = { email, ...attemptModelFilter(section, type, model) };
        const attempts = latestUniqueAttempts(await Attempt.find(filter).sort({ createdAt: 1 }).lean());
        const ids = attempts.map(a => a.questionId).filter(id => id !== undefined && id !== null);
        const questions = await Question.find({ id: { $in: ids } }).lean();
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, items: buildReviewItems(attempts, questions) });
    } catch (error) {
        console.error('POST /api/student/review-detail:', error);
        res.status(500).json({ success: false, message: 'تعذر تحميل تفاصيل الإجابات' });
    }
});

app.post('/api/admin/grades', requireAdmin, async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const admin = await User.findOne({ email, role: 'admin' }).select('_id');
        if (!admin) return res.status(403).json({ success: false, message: 'ليس لديك صلاحية' });
        const allAttempts = await Attempt.find({}).sort({ createdAt: 1 }).lean();
        const attempts = latestUniqueAttempts(allAttempts);
        const users = await User.find({ role: { $ne: 'admin' } }).select('name email').lean();
        const userMap = new Map(users.map(u => [u.email, u]));
        const groups = new Map();
        for (const a of attempts) {
            const section = normalizeAttemptSection(a), type = a.type || 'practice', model = Number(a.model) || 1;
            const key = `${a.email}|${section}|${type}|${model}`;
            if (!groups.has(key)) groups.set(key, { email: a.email, section, type, model, attempts: [], lastAttempt: a.createdAt });
            const g = groups.get(key); g.attempts.push(a);
            if (new Date(a.createdAt) > new Date(g.lastAttempt)) g.lastAttempt = a.createdAt;
        }
        const grades = [...groups.values()].map(g => {
            const correct = g.attempts.filter(a => a.correct).length;
            return { name: userMap.get(g.email)?.name || 'طالب غير معروف', email: g.email, section: g.section, type: g.type, model: g.model,
                answered: g.attempts.length, correct, score: g.attempts.length ? Math.round(correct / g.attempts.length * 100) : 0, lastAttempt: g.lastAttempt };
        }).sort((a,b) => new Date(b.lastAttempt) - new Date(a.lastAttempt));
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, grades });
    } catch (error) {
        console.error('POST /api/admin/grades:', error);
        res.status(500).json({ success: false, message: 'تعذر تحميل درجات الطلاب' });
    }
});

app.post('/api/admin/grade-review', requireAdmin, async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const studentEmail = String(req.body?.studentEmail || '').trim().toLowerCase();
        const { section, type, model } = req.body || {};
        const admin = await User.findOne({ email, role: 'admin' }).select('_id');
        if (!admin) return res.status(403).json({ success: false, message: 'ليس لديك صلاحية' });
        if (!studentEmail || !type || !Number.isFinite(Number(model))) return res.status(400).json({ success: false, message: 'بيانات المراجعة غير مكتملة' });
        const student = await User.findOne({ email: studentEmail, role: { $ne: 'admin' } }).select('name email');
        if (!student) return res.status(404).json({ success: false, message: 'الطالب غير موجود' });
        const filter = { email: studentEmail, ...attemptModelFilter(section, type, model) };
        const attempts = latestUniqueAttempts(await Attempt.find(filter).sort({ createdAt: 1 }).lean());
        const ids = attempts.map(a => a.questionId).filter(id => id !== undefined && id !== null);
        const questions = await Question.find({ id: { $in: ids } }).lean();
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, studentName: student.name, items: buildReviewItems(attempts, questions) });
    } catch (error) {
        console.error('POST /api/admin/grade-review:', error);
        res.status(500).json({ success: false, message: 'تعذر تحميل مراجعة الطالب' });
    }
});

// ==================== حذف الإحصائيات ====================
// يحذف المحاولات وإنجازات النماذج معًا، مع الحفاظ على الحسابات والأسئلة والنماذج.

app.post('/api/admin/delete-statistics', requireAdmin, async (req, res) => {
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
app.post('/api/student/achievement', requireUser, async (req, res) => {
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
app.post('/api/student/achievement/complete', requireUser, async (req, res) => {
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
app.post('/api/admin/achievement-settings', requireAdmin, async (req, res) => {
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

app.post('/api/admin/achievement-settings/get', requireAdmin, async (req, res) => {
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
