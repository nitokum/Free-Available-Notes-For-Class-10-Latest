const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000; // Required adjustment for cloud deployment

// 🚀 CRITICAL FOR RENDER: Tells the server to trust secure login session cookies
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'developer-lock-key-99',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using custom HTTPS domain names later
}));

const MASTER_DEVELOPER_EMAIL = "admin@website.com";
const MASTER_DEVELOPER_PASSWORD = "SuperSecretPass123";

// Simple persistent memory trick (Won't clear if server goes into idle sleep)
if (!global.registeredUsers) global.registeredUsers = [];
const registeredUsers = global.registeredUsers;

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// ⭐ FIX: Deliver index.html directly instead of app.use(express.static(__dirname))
// This seals the backdoor and protects your main directories from raw URL browsing!
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 🛡️ ENFORCED GATEWAY: Validates authentication status BEFORE delivering files
app.get('/uploads/:filename', (req, res) => {
    if (!req.session.isUserLoggedIn && !req.session.isDeveloperAdmin) {
        return res.send(`
            <script>
                alert('Access Denied! You must enter your email and register an account first to download notes.');
                window.location.href = '/';
            </script>
        `);
    }
    res.sendFile(path.join(__dirname, 'uploads', req.params.filename));
});

// Registration Engine (Step 1)
app.post('/auth/request-otp', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.send('All registration fields are required.');
    
    const codeGenerated = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.tempUser = { email, password, otp: codeGenerated };
    
    console.log(`\n===================================`);
    console.log(`📨 ONE-TIME VERIFICATION CODE SENT`);
    console.log(`TARGET EMAIL: ${email}`);
    console.log(`YOUR SECURITY CODE IS: ${codeGenerated}`);
    console.log(`===================================\n`);
    
    res.send(`
        <div style="font-family:Arial, sans-serif; max-width:400px; margin:50px auto; text-align:center; padding:20px; border:1px solid #ccc; border-radius:10px;">
            <h2>🔢 Enter Verification Code</h2>
            <p>A 6-digit security code has been generated on the server command panel console.</p>
            <form action="/auth/verify-otp" method="POST">
                <input type="text" name="userOTP" placeholder="Enter 6-Digit Code" required style="padding:10px; width:80%; margin-bottom:15px; border-radius:5px; border:1px solid #ccc;"><br>
                <button type="submit" style="padding:10px 20px; background:#4f46e5; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;">Verify Account</button>
            </form>
        </div>
    `);
});

// Registration Engine (Step 2)
app.post('/auth/verify-otp', (req, res) => {
    const { userOTP } = req.body;
    const pendingData = req.session.tempUser;
    
    if (!pendingData) return res.send('Session expired. Please restart registration.');
    
    if (userOTP === pendingData.otp) {
        registeredUsers.push({ username: pendingData.email, password: pendingData.password });
        req.session.isUserLoggedIn = true;
        req.session.userProfileName = pendingData.email;
        req.session.tempUser = null; 
        res.redirect('/');
    } else {
        res.send('<h3>Incorrect verification code. <a href="/">Return home and try again</a></h3>');
    }
});

// Login Interface Route
app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === MASTER_DEVELOPER_EMAIL && password === MASTER_DEVELOPER_PASSWORD) {
        req.session.isDeveloperAdmin = true;
        req.session.userProfileName = "System Developer";
        return res.redirect('/');
    }

    const matchedUser = registeredUsers.find(u => u.username === username && u.password === password);
    if (matchedUser) {
        req.session.isUserLoggedIn = true;
        req.session.userProfileName = username;
        res.redirect('/');
    } else {
        res.send('<h3>Invalid Login Credentials. <a href="/">Click here to try again</a></h3>');
    }
});

app.get('/api/auth-state', (req, res) => {
    res.json({ 
        isLoggedIn: !!req.session.isUserLoggedIn, 
        isAdmin: !!req.session.isDeveloperAdmin,
        username: req.session.userProfileName || null 
    });
});

app.post('/action/upload', upload.single('noteFile'), (req, res) => {
    if (!req.session.isDeveloperAdmin) {
        return res.status(403).send('Access Denied: Only the Master Developer can upload notes.');
    }
    res.redirect('/');
});

app.get('/api/notes-inventory', (req, res) => {
    const dir = './uploads';
    if (!fs.existsSync(dir)) return res.json([]);
    fs.readdir(dir, (err, files) => {
        if (err) return res.status(500).json([]);
        res.json(files.filter(f => !f.startsWith('.')));
    });
});

app.post('/admin/erase/:filename', (req, res) => {
    if (!req.session.isDeveloperAdmin) return res.status(403).send('Unauthorized execution.');
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    res.redirect('/');
});

app.listen(PORT, () => console.log(`🚀 Security Engine Active on port ${PORT}`));