const express = require('express');
const session = require('express-session');
const fs = require('fs');
const {promises: fsp} = fs;
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const moment = require('moment-timezone');
require('dotenv').config();

const app = express();

const defaultDomains = new Set([
    'racescan.racing',
    'www.racescan.racing',
    'localhost',
    '127.0.0.1',
    '99.166.72.87'
]);

if (process.env.CORS_ALLOWED_HOSTS) {
    process.env.CORS_ALLOWED_HOSTS.split(',')
        .map((host) => host.trim())
        .filter(Boolean)
        .forEach((host) => defaultDomains.add(host));
}

const config = {
    port: Number(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendDir: path.resolve(__dirname, '../frontend'),
    corsHosts: defaultDomains,
    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY || '',
        priceDayPass: process.env.STRIPE_PRICE_DAY_PASS || '',
        priceUnlimited: process.env.STRIPE_PRICE_UNLIMITED || ''
    },
    twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
        verifySid: process.env.TWILIO_VERIFY_SID || ''
    }
};

config.isProduction = config.nodeEnv === 'production';
config.staticDir = path.join(config.frontendDir, 'static');
config.partialsDir = path.join(config.staticDir, 'partials');
config.slideshowDir = path.join(config.staticDir, 'images', 'slideshow_images');

const requiredEnv = ['DB_USER', 'DB_PASS', 'DB_NAME', 'EMAIL_USER', 'EMAIL_PASS', 'STRIPE_SECRET_KEY'];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);
if (missingEnv.length) {
    console.warn(`⚠️ Missing environment variables: ${missingEnv.join(', ')}`);
}

if (!config.stripe.priceDayPass || !config.stripe.priceUnlimited) {
    console.warn('⚠️ Stripe price IDs are missing; checkout may be limited.');
}

const stripe = config.stripe.secretKey
    ? require('stripe')(config.stripe.secretKey)
    : null;

if (!stripe) {
    console.warn('⚠️ Stripe secret key is missing; payment routes are disabled.');
}

const twilioClient = (config.twilio.accountSid && config.twilio.authToken && config.twilio.verifySid)
    ? twilio(config.twilio.accountSid, config.twilio.authToken)
    : null;

if (!twilioClient) {
    console.warn('⚠️ Twilio Verify not configured; SMS verification routes will be disabled.');
}

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 25,
    queueLimit: 0,
    dateStrings: true
});

console.log('✅ MySQL connection pool configured');

pool.getConnection()
    .then((conn) => conn.ping().then(() => {
        console.log('✅ MySQL ping successful');
        conn.release();
    }))
    .catch((err) => console.error('❌ MySQL ping failed:', err));

pool.on('error', (err) => {
    console.error('❌ MySQL pool error:', err);
});

pool.on('connection', (connection) => {
    connection.query("SET time_zone = 'UTC'", (error) => {
        if (error) {
            console.warn('⚠️ Unable to enforce UTC timezone on connection:', error.message);
        }
    });
});

(async () => {
    try {
        await ensureColumn('users', 'phone_number', 'VARCHAR(32) NULL');
        await ensureColumn('users', 'phone_verified', 'TINYINT(1) DEFAULT 0');
        const idx = await query(
            `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'uq_users_phone'`
        );
        if (idx[0]?.cnt === 0) {
            await execute('ALTER TABLE users ADD UNIQUE INDEX uq_users_phone (phone_number)');
        }
    } catch (err) {
        console.warn('⚠️ Unable to ensure phone columns exist:', err.message);
    }
})();

const mailTransport = (process.env.EMAIL_USER && process.env.EMAIL_PASS)
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    })
    : null;

const asyncHandler = (handler) => (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
};

const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({success: false, message: 'Not authenticated'});
    }
    return next();
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizePhone = (phone) => {
    if (!phone) return '';
    let p = String(phone).trim();
    if (!p.startsWith('+')) {
        const digits = p.replace(/\D/g, '');
        if (digits.length === 10) {
            p = `+1${digits}`;
        } else if (digits.length > 0) {
            p = `+${digits}`;
        }
    }
    return p;
};

const safeJsonParse = (value, fallback = []) => {
    if (!value) {
        return fallback;
    }
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch (error) {
        console.warn('⚠️ Failed to parse JSON payload:', error.message);
        return fallback;
    }
};

async function sendVerificationEmail(email, code) {
    if (!mailTransport) {
        console.warn('⚠️ Email transport not configured; skipping verification email.');
        return;
    }

    await mailTransport.sendMail({
        from: `"RaceScan" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your RaceScan Verification Code',
        html: `
            <h2>Welcome to RaceScan!</h2>
            <p>Your verification code is:</p>
            <h1 style="background: #ff4d4d; color: white; padding: 10px 20px; display: inline-block;">${code}</h1>
            <p>Enter this code on the website to verify your account.</p>
            <p>If you did not request this, please ignore this email.</p>
        `
    });
    console.log(`📩 Verification email sent to ${email}`);
}

async function execute(query, params = []) {
    const [rows] = await pool.execute(query, params);
    return rows;
}

async function query(query, params = []) {
    const [rows] = await pool.query(query, params);
    return rows;
}

async function ensureColumn(table, column, definition) {
    const rows = await query(
        `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    if (rows[0]?.cnt === 0) {
        console.log(`ℹ️ Adding column ${column} to ${table}`);
        await execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}

// Middleware
app.set('trust proxy', 1);
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(express.json({limit: '1mb'}));
app.use(express.urlencoded({extended: true}));
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true);
        }

        try {
            const {hostname} = new URL(origin);
            if (config.corsHosts.has(hostname)) {
                return callback(null, true);
            }
        } catch (error) {
            console.warn(`⚠️ Unable to parse origin "${origin}":`, error.message);
        }

        console.warn(`🔒 Blocked CORS request from ${origin}`);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(session({
    secret: process.env.SESSION_SECRET || 'supersecretkey',
    resave: false,
    saveUninitialized: false,
    cookie: {
        path: '/',
        secure: config.isProduction,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

const authLimiter = rateLimit({
    windowMs: 2 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method !== 'POST',
    skipSuccessfulRequests: true
});

app.use(['/signup', '/login', '/verify-code', '/resend-code', '/api/reset-password-request', '/api/reset-password-confirm'], authLimiter);

app.use((req, res, next) => {
    console.log(`🔎 [${req.method}] ${req.originalUrl}`);
    next();
});

// HTTPS redirect in production
app.use((req, res, next) => {
    if (config.isProduction && !req.secure) {
        return res.redirect(`https://${req.headers.host}${req.originalUrl}`);
    }
    return next();
});

// Static assets
app.use('/', express.static(config.frontendDir));
app.use('/static', express.static(config.staticDir));

app.get('/navbar.html', (req, res) => {
    res.sendFile(path.join(config.partialsDir, 'navbar.html'));
});

app.get('/navbar_authed.html', (req, res) => {
    res.sendFile(path.join(config.partialsDir, 'navbar_authed.html'));
});

app.get('/api/health', asyncHandler(async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.ping();
        res.json({status: 'ok', uptime: process.uptime()});
    } finally {
        conn.release();
    }
}));

app.post('/api/select-day-pass-event', requireAuth, asyncHandler(async (req, res) => {
    const {selectedEvents} = req.body;

    if (!Array.isArray(selectedEvents) || !selectedEvents.length) {
        return res.status(400).json({success: false, message: 'No events selected'});
    }

    const sanitized = selectedEvents
        .map((event) => ({
            eventId: event?.eventId,
            name: String(event?.name || '').trim(),
            date: String(event?.date || '').trim()
        }))
        .filter((event) => event.eventId && event.name && event.date);

    if (!sanitized.length) {
        return res.status(400).json({success: false, message: 'Invalid event payload'});
    }

    const insertValues = sanitized.map((event) => [
        req.session.userId,
        event.eventId,
        event.name,
        event.date
    ]);

    await query(
        'INSERT INTO day_passes (user_id, event_id, event_name, event_date) VALUES ?',
        [insertValues]
    );

    res.json({success: true, inserted: sanitized.length});
}));

app.post('/signup', asyncHandler(async (req, res) => {
    console.log('🔹 Signup route hit');
    const {firstName, lastName, email, password, phone, channel} = req.body;

    if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({success: false, message: 'All fields are required'});
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return res.status(400).json({success: false, message: 'Phone number is required for SMS verification'});
    }

    const existingUser = await execute(
        'SELECT id FROM users WHERE email = ?',
        [normalizedEmail]
    );

    if (existingUser.length) {
        return res.status(409).json({
            success: false,
            message: 'User already exists. <a href="/auth/login.html" class="login-link">Click here to log in</a>',
            userExists: true
        });
    }

    if (normalizedPhone) {
        const phoneExists = await execute('SELECT id FROM users WHERE phone_number = ?', [normalizedPhone]);
        if (phoneExists.length) {
            return res.status(409).json({
                success: false,
                message: 'Phone number already in use. Please use a different phone or log in.',
                userExists: true
            });
        }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    const [insertResult] = await pool.execute(`
        INSERT INTO users (first_name, last_name, email, password_hash, subscribed, tier, email_verified, verification_code, phone_number, phone_verified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [firstName.trim(), lastName.trim(), normalizedEmail, hashedPassword, 0, null, 0, verificationCode, normalizedPhone || null, 0]);

    const userId = insertResult.insertId;

    req.session.userId = userId;
    req.session.email = normalizedEmail;
    req.session.firstName = firstName.trim();
    req.session.emailVerified = false;
    req.session.phoneVerified = false;
    req.session.verificationCode = verificationCode;
    req.session.subscribed = false;
    req.session.tier = null;
    req.session.phone_number = normalizedPhone || null;

    await req.session.save();

    console.log(`✅ Created user ${normalizedEmail} with ID ${userId}`);

    const wantsSms = String(channel || '').toLowerCase() === 'sms';

    if (wantsSms) {
        if (!twilioClient || !config.twilio.verifySid) {
            return res.status(503).json({success: false, message: 'SMS verification not configured'});
        }
        try {
            await twilioClient.verify.v2.services(config.twilio.verifySid).verifications.create({
                to: normalizedPhone,
                channel: 'sms'
            });
        } catch (err) {
            console.error('❌ Failed to send SMS verification:', err.message);
            return res.status(500).json({success: false, message: 'Unable to send SMS verification'});
        }
    } else {
        try {
            await sendVerificationEmail(normalizedEmail, verificationCode);
        } catch (error) {
            console.error('❌ Failed to send verification email:', error);
            return res.status(500).json({success: false, message: 'Unable to send verification email'});
        }
    }

    res.json({
        success: true,
        message: wantsSms ? 'Signup successful! Check your SMS for a code.' : 'Signup successful! Check your email for verification.',
        redirect: '/auth/verify-email.html',
        channel: wantsSms ? 'sms' : 'email'
    });
}));

app.get('/verify-email', asyncHandler(async (req, res) => {
    console.log('🔹 Email verification link hit');
    const code = String(req.query.code || '').trim();

    if (!code) {
        console.log('🔴 No verification code provided');
        return res.redirect('/auth/verification-failed.html');
    }

    const users = await execute(
        'SELECT id, first_name FROM users WHERE verification_code = ?',
        [code]
    );

    if (!users.length) {
        console.log('🔴 Invalid or expired verification code');
        return res.redirect('/auth/verification-failed.html');
    }

    const user = users[0];

    await execute(
        'UPDATE users SET email_verified = 1, verification_code = NULL WHERE id = ?',
        [user.id]
    );

    req.session.userId = user.id;
    req.session.firstName = user.first_name;
    req.session.emailVerified = true;

    await req.session.save();

    console.log(`✅ Email verified for ${user.first_name}`);
    return res.redirect('/auth/account.html');
}));

app.post('/login', asyncHandler(async (req, res) => {
    console.log('🔹 Login route hit');
    const {email, password} = req.body; // email can be phone or email

    if (!email || !password) {
        return res.status(400).json({success: false, message: 'Email/phone and password are required'});
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(email);

    const users = await execute(
        'SELECT * FROM users WHERE email = ? OR phone_number = ?',
        [normalizedEmail, normalizedPhone]
    );

    if (!users.length) {
        return res.status(404).json({success: false, message: 'User does not exist'});
    }

    const user = users[0];

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
        return res.status(401).json({success: false, message: 'Invalid password'});
    }

    if (!user.email_verified && !user.phone_verified) {
        return res.status(403).json({
            success: false,
            message: 'Your account is not verified. Please verify via email or SMS.'
        });
    }

    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.firstName = user.first_name;
    req.session.emailVerified = !!user.email_verified;
    req.session.phoneVerified = !!user.phone_verified;
    req.session.subscribed = !!user.subscribed;
    req.session.tier = user.tier;

    await req.session.save();

    res.json({success: true, message: `Welcome, ${user.first_name}!`, redirect: '/index.html'});
}));

app.post('/verify-code', asyncHandler(async (req, res) => {
    console.log('🔹 Received verification request');
    const code = String(req.body.code || '').trim();

    if (!code) {
        return res.status(400).json({success: false, message: 'Please enter a verification code.'});
    }

    const users = await execute(
        'SELECT id, first_name, email_verified FROM users WHERE verification_code = ?',
        [code]
    );

    if (!users.length) {
        return res.status(400).json({success: false, message: 'Invalid or expired verification code.'});
    }

    const user = users[0];

    if (user.email_verified) {
        return res.json({
            success: false,
            message: 'Email already verified. Please <a href="/auth/login.html" style="color: #007bff; font-weight: bold;">log in</a>.'
        });
    }

    await execute(
        'UPDATE users SET email_verified = 1, verification_code = NULL WHERE id = ?',
        [user.id]
    );

    req.session.userId = user.id;
    req.session.firstName = user.first_name;
    req.session.emailVerified = true;

    await req.session.save();

    res.json({success: true, message: '✅ Email verified successfully! Redirecting...'});
}));

app.post('/api/sms/send-code', requireAuth, asyncHandler(async (req, res) => {
    if (!twilioClient || !config.twilio.verifySid) {
        return res.status(503).json({success: false, message: 'SMS verification not configured'});
    }
    const phone = normalizePhone(req.body.phone || req.session.phone_number || '');
    if (!phone) {
        return res.status(400).json({success: false, message: 'Phone number is required'});
    }
    const existing = await execute('SELECT id FROM users WHERE phone_number = ? AND id != ?', [phone, req.session.userId]);
    if (existing.length) {
        return res.status(409).json({success: false, message: 'Phone number already in use by another account'});
    }
    await twilioClient.verify.v2.services(config.twilio.verifySid).verifications.create({
        to: phone,
        channel: 'sms'
    });
    await execute('UPDATE users SET phone_number = ?, phone_verified = 0 WHERE id = ?', [phone, req.session.userId]);
    req.session.phoneVerified = false;
    await req.session.save();
    res.json({success: true, message: 'Verification code sent via SMS'});
}));

app.post('/api/sms/check-code', requireAuth, asyncHandler(async (req, res) => {
    if (!twilioClient || !config.twilio.verifySid) {
        return res.status(503).json({success: false, message: 'SMS verification not configured'});
    }
    const phone = normalizePhone(req.body.phone || req.session.phone_number || '');
    const code = String(req.body.code || '').trim();
    if (!phone || !code) {
        return res.status(400).json({success: false, message: 'Phone and code are required'});
    }
    const check = await twilioClient.verify.v2.services(config.twilio.verifySid).verificationChecks.create({
        to: phone,
        code
    });
    if (check.status !== 'approved') {
        return res.status(400).json({success: false, message: 'Invalid or expired code'});
    }
    await execute('UPDATE users SET phone_number = ?, phone_verified = 1 WHERE id = ?', [phone, req.session.userId]);
    req.session.phoneVerified = true;
    await req.session.save();
    res.json({success: true, message: 'Phone verified'});
}));

app.post('/api/reset-password-confirm', asyncHandler(async (req, res) => {
    const {token, newPassword} = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({success: false, message: 'Token and new password are required'});
    }

    const users = await execute(
        'SELECT id FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()',
        [token]
    );

    if (!users.length) {
        return res.status(400).json({success: false, message: 'Invalid or expired token'});
    }

    const userId = users[0].id;
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await execute(
        'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
        [hashedPassword, userId]
    );

    console.log(`✅ Password updated for user ID ${userId}`);
    res.json({success: true, message: 'Password reset successful'});
}));

app.post('/api/reset-password-request', asyncHandler(async (req, res) => {
    const {email} = req.body;
    if (!email) {
        return res.status(400).json({success: false, message: 'Email is required'});
    }

    const normalizedEmail = normalizeEmail(email);

    const users = await execute(
        'SELECT id FROM users WHERE email = ?',
        [normalizedEmail]
    );

    if (!users.length) {
        return res.status(404).json({success: false, message: 'No account found with that email'});
    }

    if (!mailTransport) {
        return res.status(500).json({success: false, message: 'Email service unavailable'});
    }

    const userId = users[0].id;
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = moment().add(1, 'hour').format('YYYY-MM-DD HH:mm:ss');

    await execute(
        'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
        [resetToken, tokenExpiry, userId]
    );

    const resetLink = `https://racescan.racing/auth/reset-password-confirm.html?token=${resetToken}`;

    await mailTransport.sendMail({
        from: `"RaceScan" <${process.env.EMAIL_USER}>`,
        to: normalizedEmail,
        subject: 'RaceScan Password Reset',
        html: `
            <p>You requested a password reset.</p>
            <p>Click <a href="${resetLink}">here</a> to reset your password. This link expires in 1 hour.</p>
            <p>If you did not request this, please ignore this email.</p>
        `
    });

    console.log(`📩 Reset link sent to ${normalizedEmail}`);
    res.json({success: true});
}));

app.post('/resend-code', asyncHandler(async (req, res) => {
    console.log('🔹 Resend Verification Code request received');
    const {email} = req.body;

    if (!email) {
        return res.status(400).json({success: false, message: '❌ Email is required.'});
    }

    const normalizedEmail = normalizeEmail(email);

    const users = await execute(
        'SELECT id FROM users WHERE email = ?',
        [normalizedEmail]
    );

    if (!users.length) {
        return res.status(404).json({success: false, message: '❌ Email not found. Please sign up first.'});
    }

    const userId = users[0].id;
    const newVerificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    await execute(
        'UPDATE users SET verification_code = ? WHERE id = ?',
        [newVerificationCode, userId]
    );

    try {
        await sendVerificationEmail(normalizedEmail, newVerificationCode);
    } catch (error) {
        console.error('❌ Error resending verification code:', error);
        return res.status(500).json({success: false, message: '❌ Server error. Try again later.'});
    }

    res.json({success: true, message: '✅ New verification code sent to your email!'});
}));

const slideshowCache = {
    files: [],
    timestamp: 0
};

app.get('/api/tracks', asyncHandler(async (req, res) => {
    const cacheDuration = 60 * 1000;
    const now = Date.now();

    if (slideshowCache.files.length && now - slideshowCache.timestamp < cacheDuration) {
        return res.json(slideshowCache.files);
    }

    let files = [];
    try {
        files = await fsp.readdir(config.slideshowDir);
    } catch (error) {
        console.error('❌ Error reading slideshow_images directory:', error);
        return res.status(500).json([]);
    }

    const imageFiles = files
        .filter((file) => /\.(jpg|jpeg|png|gif)$/i.test(file))
        .map((file) => `/static/images/slideshow_images/${file}`);

    slideshowCache.files = imageFiles;
    slideshowCache.timestamp = now;

    res.json(imageFiles);
}));

app.post('/api/create-checkout-session', requireAuth, asyncHandler(async (req, res) => {
    console.log('📢 Creating Stripe Checkout session...');

    const {plan, count = 1, selectedEvents = []} = req.body;
    const email = req.session.email;

    if (!email) {
        return res.status(400).json({success: false, message: 'No email found in session'});
    }

    if (!stripe) {
        return res.status(503).json({success: false, message: 'Payment service is currently unavailable.'});
    }

    const normalizedSelectedEvents = Array.isArray(selectedEvents)
        ? selectedEvents.slice(0, 20)
        : [];

    let priceId;
    let mode;

    if (plan === 'day-pass') {
        priceId = config.stripe.priceDayPass;
        mode = 'payment';
    } else if (plan === 'unlimited') {
        priceId = config.stripe.priceUnlimited;
        mode = 'subscription';
    }

    if (!priceId || !mode) {
        return res.status(400).json({success: false, message: 'Invalid plan selection'});
    }

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: email,
        line_items: [{price: priceId, quantity: count}],
        mode,
        metadata: {
            plan,
            user_email: email,
            user_id: req.session.userId,
            count: String(count),
            selected_events: JSON.stringify(normalizedSelectedEvents)
        },
        success_url: 'https://racescan.racing/api/handle-stripe-success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://racescan.racing/events/subscribe.html'
    });

    console.log('✅ Stripe session created. Redirecting to:', session.url);
    res.json({url: session.url});
}));

app.get('/api/user-day-passes', requireAuth, asyncHandler(async (req, res) => {
    const rows = await execute(
        'SELECT event_id, event_name, event_date FROM day_passes WHERE user_id = ?',
        [req.session.userId]
    );

    res.json({
        success: true,
        passes: rows,
        raceIds: rows.map((row) => row.event_id)
    });
}));

app.get('/api/handle-stripe-success', requireAuth, asyncHandler(async (req, res) => {
    console.log('📢 Handling Stripe Success Redirect...');

    if (!stripe) {
        return res.redirect('/events/subscribe.html?error=payments_unavailable');
    }

    const sessionId = String(req.query.session_id || '').trim();
    if (!sessionId) {
        return res.redirect('/events/subscribe.html?error=missing_session_id');
    }

    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
    if (!checkoutSession || checkoutSession.payment_status !== 'paid') {
        return res.redirect('/events/subscribe.html?error=payment_failed');
    }

    const email = checkoutSession.customer_email;
    const plan = checkoutSession.metadata?.plan;

    if (!plan) {
        console.error('❌ Missing metadata in Stripe session.');
        return res.redirect('/events/subscribe.html?error=missing_plan_data');
    }

    const users = await execute(
        'SELECT id FROM users WHERE email = ?',
        [email]
    );

    if (!users.length) {
        console.error('❌ User not found in database:', email);
        return res.redirect('/events/subscribe.html?error=user_not_found');
    }

    const userId = users[0].id;
    let nextBillingDate = null;
    let dayPassEnds = null;

    if (plan === 'day-pass') {
        const events = safeJsonParse(checkoutSession.metadata?.selected_events, []);

        if (events.length) {
            const insertValues = events
                .map((event) => ({
                    eventId: event?.eventId,
                    name: String(event?.name || '').trim(),
                    date: String(event?.date || '').trim()
                }))
                .filter((event) => event.eventId && event.name && event.date)
                .map((event) => [userId, event.eventId, event.name, event.date]);

            if (insertValues.length) {
                await query(
                    'INSERT IGNORE INTO day_passes (user_id, event_id, event_name, event_date) VALUES ?',
                    [insertValues]
                );
                console.log(`✅ Added ${insertValues.length} event(s) to day_passes.`);
            }
        }
    } else if (plan === 'unlimited') {
        nextBillingDate = moment().add(30, 'days').utc().format('YYYY-MM-DD HH:mm:ss');
    }

    await execute(`
        UPDATE users
        SET subscribed             = 1,
            tier                   = ?,
            subscription_status    = 'Active',
            stripe_subscription_id = ?,
            next_billing_date      = ?,
            daypass_ends           = ?
        WHERE id = ?
    `, [plan, checkoutSession.subscription || null, nextBillingDate, dayPassEnds, userId]);

    req.session.subscribed = true;
    req.session.tier = plan;

    await req.session.save();

    return res.redirect(`/events/live.html?session_id=${encodeURIComponent(req.sessionID)}&user_id=${encodeURIComponent(userId)}`);
}));

app.get('/api/session', (req, res) => {
    res.json({
        loggedIn: !!req.session.userId,
        userId: req.session.userId || null,
        sessionId: req.sessionID || null,
        firstName: req.session.firstName || null,
        emailVerified: !!req.session.emailVerified,
        phoneVerified: !!req.session.phoneVerified,
        subscribed: !!req.session.subscribed,
        tier: req.session.tier || null
    });
});

app.post('/logout', asyncHandler(async (req, res) => {
    await new Promise((resolve, reject) => {
        req.session.destroy((err) => {
            if (err) {
                return reject(err);
            }
            return resolve();
        });
    });

    res.clearCookie('connect.sid', {path: '/'});
    res.json({success: true});
}));

app.get('/api/user-info', requireAuth, asyncHandler(async (req, res) => {
    const users = await execute(
        `SELECT first_name,
                last_name,
                email,
                email_verified,
                phone_number,
                phone_verified,
                subscribed,
                tier,
                subscription_status,
                next_billing_date
         FROM users
         WHERE id = ?`,
        [req.session.userId]
    );

    if (!users.length) {
        return res.status(404).json({success: false, message: 'User not found'});
    }

    const user = users[0];

    res.json({
        success: true,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        emailVerified: !!user.email_verified,
        phone: user.phone_number || '',
        phoneVerified: !!user.phone_verified,
        subscribed: !!user.subscribed,
        subscriptionPlan: user.tier || 'N/A',
        subscriptionStatus: user.subscription_status || 'Inactive',
        nextBillingDate: user.next_billing_date || 'N/A'
    });
}));

app.use((err, req, res, next) => {
    console.error('❌ Uncaught error:', err);
    if (res.headersSent) {
        return next(err);
    }
    const status = err.status || 500;
    const message = err.expose ? err.message : 'Internal Server Error';
    return res.status(status).json({success: false, message});
});

app.listen(config.port, '0.0.0.0', () => {
    console.log(`🚀 Server accessible via http://127.0.0.1:${config.port}`);
});
