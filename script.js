// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDbZxJ9mNlUmrmtUrLvi37hvYmdBkKY2QE",
    authDomain: "dev-7c490.firebaseapp.com",
    projectId: "dev-7c490",
    storageBucket: "dev-7c490.firebasestorage.app",
    messagingSenderId: "759370309370",
    appId: "1:759370309370:web:391923e90ba01225df7343",
    measurementId: "G-SSYNCG0Y8F"
};

// Initialize Firebase
try {
    firebase.initializeApp(firebaseConfig);
    firebase.analytics(); // Initialize Analytics
    console.log("Firebase initialized successfully");
} catch (e) {
    console.error("Firebase initialization error:", e);
}

const auth = firebase.auth();
const db = firebase.firestore();
window.db = db; // Expose for inline scripts

// --- STATE MANAGEMENT ---
// --- SECURITY UTILITIES ---
function sanitizeHTML(str) {
    if (!str) return '';
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML.replace(/[<>]/g, (tag) => {
        const chars = {
            '<': '&lt;',
            '>': '&gt;'
        };
        return chars[tag] || tag;
    });
}

// For cases where we WANT some tags but want to be safe (like template previews)
function sanitizeSafeHTML(str) {
    if (!str) return '';
    const doc = new DOMParser().parseFromString(str, 'text/html');
    const scripts = doc.querySelectorAll('script, iframe, object, embed, link[rel="stylesheet"]');
    scripts.forEach(s => s.remove());

    // Remove inline event handlers
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(el => {
        const attrs = el.attributes;
        for (let i = attrs.length - 1; i >= 0; i--) {
            if (attrs[i].name.startsWith('on')) {
                el.removeAttribute(attrs[i].name);
            }
        }
    });

    return doc.body.innerHTML;
}

const APP_STATE = {
    isLoggedIn: false,
    user: null,
    currentView: 'home',
    projects: JSON.parse(localStorage.getItem('gd_projects')) || [],
    templates: JSON.parse(localStorage.getItem('gd_templates')) || [],
    webhooks: JSON.parse(localStorage.getItem('gd_webhooks')) || [],
    apiKeys: JSON.parse(localStorage.getItem('gd_apiKeys')) || [],
    stats: JSON.parse(localStorage.getItem('gd_stats')) || { emails: 0, requests: 0, bounces: 0, opens: 0 },
    activityLog: JSON.parse(localStorage.getItem('gd_activityLog')) || [],
    chart: null,
    activeTab: 'overview',
    failedAttempts: 0,
    lockoutUntil: null,
    isTestMode: false,
    emailLogs: []
};


// --- NAVIGATION ---
window.navigate = function (viewId) {
    if (!viewId) return;

    // Auth Check for Dashboard
    if (viewId === 'dashboard' && !APP_STATE.isLoggedIn) {
        // Show login modal instead
        const authModal = document.getElementById('authModal');
        if (authModal) {
            authModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
        return;
    }

    // Update State
    APP_STATE.currentView = viewId;

    // Hide all sections
    document.querySelectorAll('.page-section').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active-section'); // Safety
    });

    // Show target section
    const target = document.getElementById(viewId);
    if (target) {
        target.style.display = 'block';
        setTimeout(() => target.classList.add('active-section'), 10);
        window.scrollTo(0, 0);
    } else {
        console.warn(`Section with ID '${viewId}' not found.`);
    }
    // Handle Home/Hero specific case if 'home' is just the hero section without ID wrapper?
    // In index.html, home is usually the top stuff.
    // Let's check if 'home' ID exists. If not, it might be the <main> block.
    // Assuming home ID exists or we treat default state:
    if (viewId === 'home') {
        const homeSection = document.getElementById('home');
        if (homeSection) homeSection.style.display = 'block';
        else {
            // Fallback: show the hero/main section if it doesn't have ID 'home'
            const main = document.querySelector('main');
            if (main) main.style.display = 'block';
        }
    }
    else if (viewId !== 'home') {
        // If we are not on home, hiding home hero might be needed if it doesn't have .page-section class
        // Check if main has .page-section. If not, we might need to manually hide it.
        const main = document.querySelector('main');
        // If main does NOT have page-section class, it won't be hidden by the loop above.
        if (main && !main.classList.contains('page-section')) {
            main.style.display = 'none';
        }
    }

    // If returning to home, ensure main is visible
    if (viewId === 'home') {
        const main = document.querySelector('main');
        if (main && !main.classList.contains('page-section')) {
            main.style.display = 'block';
        }
    }

    // Update Nav Links
    document.querySelectorAll('nav a, .mobile-nav a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === '#' + viewId) {
            link.classList.add('active');
        }
    });

    // Special handling for dashboard entry
    if (viewId === 'dashboard') {
        showDashboardTab(APP_STATE.activeTab || 'overview');
    }
};

// --- DASHBOARD NAVIGATION ---
window.showDashboardTab = function (tabId) {
    if (!tabId) return;
    APP_STATE.activeTab = tabId;

    // Hide all dashboard tabs
    document.querySelectorAll('.dashboard-tab-content').forEach(tab => {
        tab.style.display = 'none';
        tab.classList.remove('active-tab');
    });

    // Show target tab
    const targetTab = document.getElementById(tabId + 'Tab');
    if (targetTab) {
        targetTab.style.display = 'block';
        setTimeout(() => targetTab.classList.add('active-tab'), 10);
    }

    // Update sidebar buttons
    document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick')?.includes(`'${tabId}'`)) {
            btn.classList.add('active');
        }
    });

    // Specific tab initializations
    if (tabId === 'analytics') {
        refreshAnalytics();
    } else if (tabId === 'logs') {
        renderLogs();
    } else if (tabId === 'projects') {
        renderProjects();
    } else if (tabId === 'templates') {
        renderTemplates();
    } else if (tabId === 'apiKeys') {
        renderAPIKeys();
    } else if (tabId === 'webhooks') {
        renderWebhooks();
    }

    // Cleanup active project state when leaving project dashboard
    if (tabId !== 'projectDashboard') {
        APP_STATE.activeProjectId = null;
    }
};

window.toggleTestMode = function () {
    APP_STATE.isTestMode = !APP_STATE.isTestMode;
    const toggles = document.querySelectorAll('#testModeToggle');
    toggles.forEach(t => t.checked = APP_STATE.isTestMode);

    logActivity('System', `Test mode ${APP_STATE.isTestMode ? 'enabled' : 'disabled'}`);

    // Add visual indicator class to body if needed
    if (APP_STATE.isTestMode) {
        document.body.classList.add('test-mode-active');
    } else {
        document.body.classList.remove('test-mode-active');
    }
};

window.renderLogs = function () {
    const tbody = document.getElementById('logsTableBody');
    if (!tbody) return;

    if (APP_STATE.activityLog.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state" style="padding: 2rem; text-align: center;">No logs available</td></tr>';
        return;
    }

    tbody.innerHTML = APP_STATE.activityLog.map(log => {
        const isError = log.status === 'Error' || (log.subject && log.subject.toLowerCase().includes('error'));
        const statusClass = isError ? 'badge-error' : 'badge-success';
        const statusBg = isError ? 'rgba(234, 67, 53, 0.1)' : 'rgba(52, 168, 83, 0.1)';
        const statusColor = isError ? 'var(--google-red)' : 'var(--google-green)';
        const statusText = log.status || 'Success';

        return `
            <tr style="border-bottom: 1px solid var(--glass-border);">
                <td style="padding: 1rem; font-family: 'Roboto Mono', monospace; font-size: 0.8rem; color: var(--text-muted);">${new Date(log.timestamp).toLocaleString()}</td>
                <td style="padding: 1rem; font-weight: 500;">${sanitizeHTML(log.subject)}</td>
                <td style="padding: 1rem; font-size: 0.85rem; color: var(--text-muted);">${sanitizeHTML(log.details || '-')}</td>
                <td style="padding: 1rem;"><span class="badge ${statusClass}" style="padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; background: ${statusBg}; color: ${statusColor};">${statusText}</span></td>
            </tr>
        `;
    }).join('');
};

window.clearLogs = async function () {
    if (confirm('Clear all execution logs?')) {
        APP_STATE.activityLog = [];
        renderLogs();
        renderActivityLog();

        // Also clear in Firestore if logged in
        if (APP_STATE.user) {
            try {
                const logs = await db.collection('users').doc(APP_STATE.user.uid).collection('activityLog').get();
                const batch = db.batch();
                logs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            } catch (e) {
                console.error("Failed to clear logs in Firestore", e);
            }
        }
    }
};


// --- OTP VERIFICATION SYSTEM ---
let AUTH_PENDING_DATA = null;
let CURRENT_OTP = null;
window.IS_VERIFYING_OTP = false;

window.switchAuthForm = function (formId) {
    const forms = ['loginForm', 'signupForm', 'otpForm'];
    forms.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === formId) ? 'block' : 'none';
    });

    const toggleBox = document.getElementById('authToggleBox');
    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');

    if (formId === 'otpForm') {
        if (toggleBox) toggleBox.style.display = 'none';
        if (authTitle) authTitle.textContent = 'Verify Email';
        if (authSubtitle) authSubtitle.textContent = 'Enter the 6-digit code sent to your inbox';
    } else {
        if (toggleBox) toggleBox.style.display = 'flex';
        const loginToggle = document.getElementById('loginToggle');
        const signupToggle = document.getElementById('signupToggle');

        if (formId === 'loginForm') {
            if (authTitle) authTitle.textContent = 'Sign In';
            if (authSubtitle) authSubtitle.textContent = 'Access your developer dashboard';
            loginToggle?.classList.add('active');
            signupToggle?.classList.remove('active');
        } else {
            if (authTitle) authTitle.textContent = 'Create Account';
            if (authSubtitle) authSubtitle.textContent = 'Join the GmailDev platform';
            signupToggle?.classList.add('active');
            loginToggle?.classList.remove('active');
        }
    }
};

window.generateOTP = function () {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

window.sendOTP = async function (email, otp) {
    console.log(`%c[OTP] Verification code for ${email}: ${otp}`, "color: #4285f4; font-weight: bold; font-size: 1.2rem;");

    const emailDisplay = document.getElementById('sentEmailDisplay');
    if (emailDisplay) emailDisplay.textContent = email;

    // --- TEST MODE (SIMULATION) ---
    if (APP_STATE.isTestMode) {
        try {
            logActivity('Security', `OTP sent to ${email} (Simulated)`);
            alert(`[SIMULATION MODE]\nA verification code has been sent to ${email}.\n\nOTP: ${otp}\n\n(In production, this would be an actual email)`);
            console.warn("TEST MODE: OTP is ", otp);
        } catch (err) {
            console.error("OTP Simulation Failure", err);
        }
        return;
    }

    // --- REAL EMAIL SENDING (EmailJS) ---
    try {
        logActivity('Security', `Sending OTP to ${email}...`);

        const templateParams = {
            to_email: email, // Make sure template uses 'to_email' or 'email'
            email: email,    // various common param names
            otp_code: otp,
            message: `Your verification code is: ${otp}`,
            to_name: 'User'
        };

        // Initialize EmailJS
        emailjs.init('oY19x3FTgJGF60ql9');

        // Send OTP via EmailJS
        await emailjs.send('service_xyzzmie', 'template_pidbj0i', templateParams);

        logActivity('Security', `OTP sent to ${email} successfully`);
        console.log(`[OTP] Email successfully sent to ${email}`);

    } catch (err) {
        console.error("OTP Send Failure", err);
        alert("Failed to send verification code. Please check your internet connection or try again later.");

        // Fallback for demo purposes if email fails (so user isn't stuck)
        console.warn("Falling back to simulation due to error.");
        alert(`[FALLBACK MODE]\nSince email failed to send, here is your code:\n\nOTP: ${otp}`);
    }
};

window.handleSignup = async function (e, directEmail, directPassword, directName) {
    if (e && e.preventDefault) e.preventDefault();

    const name = directName || document.getElementById('signupName')?.value;
    const email = directEmail || document.getElementById('signupEmail')?.value;
    const password = directPassword || document.getElementById('signupPassword')?.value;
    const errorMsg = document.getElementById('signupError');

    if (errorMsg) errorMsg.style.display = 'none';

    if (!name || !email || !password) {
        if (errorMsg) showAuthError('signupError', 'Please fill in all fields');
        else alert('Please fill in all fields');
        return;
    }

    const otp = generateOTP();
    CURRENT_OTP = otp;
    AUTH_PENDING_DATA = { type: 'signup', name, email, password };

    await sendOTP(email, otp);
    switchAuthForm('otpForm');
};

window.handleLogin = async function (e, directEmail, directPassword) {
    if (e && e.preventDefault) e.preventDefault();

    const email = directEmail || document.getElementById('loginEmail')?.value;
    const password = directPassword || document.getElementById('loginPassword')?.value;
    const errorMsg = document.getElementById('loginError');

    if (errorMsg) errorMsg.style.display = 'none';

    if (!email || !password) {
        if (errorMsg) showAuthError('loginError', 'Please enter email and password');
        else alert('Please enter email and password');
        return;
    }

    const btn = e && e.target ? e.target.querySelector('button[type="submit"]') : null;
    const originalText = btn ? btn.textContent : 'Sign In';
    if (btn) {
        btn.textContent = 'Checking...';
        btn.disabled = true;
    }

    try {
        window.IS_VERIFYING_OTP = true; // Prevents onAuthStateChanged from redirecting
        // Validate credentials before sending OTP
        await auth.signInWithEmailAndPassword(email, password);
        await auth.signOut(); // Sign out until OTP is verified

        const otp = generateOTP();
        CURRENT_OTP = otp;
        AUTH_PENDING_DATA = { type: 'login', email, password };

        await sendOTP(email, otp);
        switchAuthForm('otpForm');
    } catch (error) {
        window.IS_VERIFYING_OTP = false;
        if (errorMsg) showAuthError('loginError', error.message);
        else alert(error.message);
    } finally {
        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
};

window.handleVerifyOTP = async function (e) {
    e.preventDefault();
    const inputs = document.querySelectorAll('.otp-input');
    const enteredOtp = Array.from(inputs).map(i => i.value).join('');
    const errorMsg = document.getElementById('otpError');

    if (errorMsg) errorMsg.style.display = 'none';

    if (enteredOtp.length < 6) {
        showAuthError('otpError', 'Please enter the full 6-digit code');
        return;
    }

    if (enteredOtp === CURRENT_OTP) {
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.textContent = 'Verifying...';
        btn.disabled = true;

        try {
            window.IS_VERIFYING_OTP = false; // Allow onAuthStateChanged to proceed now

            if (AUTH_PENDING_DATA.type === 'signup') {
                // Final signup step
                try {
                    await auth.createUserWithEmailAndPassword(AUTH_PENDING_DATA.email, AUTH_PENDING_DATA.password);
                    const user = auth.currentUser;
                    await user.updateProfile({ displayName: AUTH_PENDING_DATA.name });
                    await initFirestoreUser(user);
                } catch (createError) {
                    if (createError.code === 'auth/email-already-in-use') {
                        console.log('User already exists, attempting login instead...');
                        // Attempt to sign in with the same credentials
                        await auth.signInWithEmailAndPassword(AUTH_PENDING_DATA.email, AUTH_PENDING_DATA.password);
                        const user = auth.currentUser;
                        // Determine if we need to update profile or init user data (optional, but good for robustness)
                    } else {
                        throw createError; // Re-throw other errors
                    }
                }
            } else {
                await auth.signInWithEmailAndPassword(AUTH_PENDING_DATA.email, AUTH_PENDING_DATA.password);
            }
            // Reset state
            AUTH_PENDING_DATA = null;
            CURRENT_OTP = null;
        } catch (error) {
            window.IS_VERIFYING_OTP = true; // Error occurred, keep protecting the flow if needed
            console.error("Auth Error:", error);

            let message = error.message;
            if (error.code === 'auth/wrong-password') {
                message = 'The account already exists, but the password was incorrect.';
            }

            showAuthError('otpError', message);
            btn.textContent = originalText;
            btn.disabled = false;
        }
    } else {
        showAuthError('otpError', 'Invalid verification code. Please try again.');
        inputs.forEach(i => {
            i.value = '';
            i.classList.add('shake');
            setTimeout(() => i.classList.remove('shake'), 500);
        });
        inputs[0].focus();
    }
};

window.resendOTP = async function () {
    if (!AUTH_PENDING_DATA) return;
    const otp = generateOTP();
    CURRENT_OTP = otp;
    await sendOTP(AUTH_PENDING_DATA.email, otp);
    alert('A new verification code has been sent to ' + AUTH_PENDING_DATA.email);
};

function showAuthError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.style.display = 'block';
        el.classList.add('shake');
        setTimeout(() => el.classList.remove('shake'), 500);
    }
}

function setupOTPInputs() {
    const inputs = document.querySelectorAll('.otp-input');
    inputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            if (e.target.value.length === 1 && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
            if (e.target.value) input.classList.add('filled');
            else input.classList.remove('filled');
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                inputs[index - 1].focus();
            }
        });

        // Handle Paste
        input.addEventListener('paste', (e) => {
            const data = e.clipboardData.getData('text').trim();
            if (data.length === 6 && /^\d+$/.test(data)) {
                const digits = data.split('');
                inputs.forEach((inp, i) => {
                    inp.value = digits[i];
                    inp.classList.add('filled');
                });
                inputs[5].focus();
            }
            e.preventDefault();
        });
    });
}

// --- AUTHENTICATION (FIREBASE) ---
function checkAuth() {
    // Listener for Auth State Changes
    auth.onAuthStateChanged(user => {
        if (window.IS_VERIFYING_OTP && user) {
            console.log("Suppressing auto-redirect during OTP verification");
            return;
        }

        const loginBtn = document.getElementById('openLoginModalBtn');
        const loginBtnMobile = document.getElementById('openLoginModalBtnMobile');
        const getStartedBtn = document.getElementById('getStartedBtn');
        const authButtons = [loginBtn, loginBtnMobile].filter(btn => btn !== null);

        if (user) {
            // User is signed in
            console.log("User logged in:", user.email);
            APP_STATE.isLoggedIn = true;
            APP_STATE.user = {
                name: user.displayName || user.email.split('@')[0],
                email: user.email,
                uid: user.uid,
                photoURL: user.photoURL
            };

            // Update Avatar
            const avatar = document.getElementById('userAvatar');
            if (avatar) {
                avatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${APP_STATE.user.name}&background=random`;
            }

            // Sync User Data from Firestore
            syncUserData(user).then(() => {
                navigate('dashboard');

                const nameDisplay = document.getElementById('userNameDisplay');
                if (nameDisplay) nameDisplay.textContent = APP_STATE.user.name.split(' ')[0];

                renderProjects();
                renderDashboardStats();
                renderActivityLog();
                renderAPIKeys();
                renderTemplates();
                initChart();
            });

            // Update Auth Buttons
            authButtons.forEach(btn => {
                btn.textContent = 'Dashboard';
                btn.classList.remove('login-trigger');
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigate('dashboard');
                };
            });

            if (getStartedBtn) {
                getStartedBtn.textContent = "Go to Dashboard";
                getStartedBtn.classList.remove('login-trigger');
                getStartedBtn.onclick = (e) => {
                    e.preventDefault();
                    navigate('dashboard');
                };
            }

            // Close modal if open
            const authModal = document.getElementById('authModal');
            if (authModal) {
                authModal.classList.remove('active');
                document.body.style.overflow = 'auto';
            }

        } else {
            // No user is signed in
            console.log("No user logged in");
            APP_STATE.isLoggedIn = false;
            APP_STATE.user = null;

            // Navigate home if currently on dashboard (optional, but good for security)
            if (APP_STATE.currentView === 'dashboard') {
                navigate('home');
            }

            // Reset Auth Buttons
            authButtons.forEach(btn => {
                btn.textContent = 'Sign in';
                btn.classList.add('login-trigger');
                btn.onclick = null; // Re-enable default modal trigger logic (handled by other listeners)
            });

            if (getStartedBtn) {
                getStartedBtn.textContent = "Get Started";
                getStartedBtn.classList.add('login-trigger');
                getStartedBtn.onclick = null;
            }
        }
    });
}

// Google Sign-In Function
window.signInWithGoogle = function () {
    console.log("Attempting Firebase Google Sign-In...");
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then((result) => {
            console.log("Google Sign-In successful:", result.user.email);
            // onAuthStateChanged will handle the rest
        }).catch((error) => {
            console.error("Google Sign-In error:", error);
            alert("Firebase Google Sign-In failed: " + error.message);
        });
};

// Logout Function
function logout() {
    if (confirm("Are you sure you want to log out?")) {
        auth.signOut().then(() => {
            console.log("Logged out successfully");
            // Clear local state
            APP_STATE.isLoggedIn = false;
            APP_STATE.user = null;
            APP_STATE.projects = [];
            APP_STATE.templates = [];
            APP_STATE.apiKeys = [];
            APP_STATE.activityLog = [];
            APP_STATE.stats = { emails: 0, requests: 0, bounces: 0, opens: 0 };

            if (APP_STATE.chart) {
                APP_STATE.chart.destroy();
                APP_STATE.chart = null;
            }
            navigate('home');
        }).catch((error) => {
            console.error("Logout error:", error);
        });
    }
}

// Make globally available
window.logout = logout;
window.loginUser = handleLogin; // For form handling
window.signupUser = handleSignup; // For form handling


// --- FIRESTORE UTILITIES ---
async function initFirestoreUser(user) {
    const userRef = db.collection('users').doc(user.uid);
    const doc = await userRef.get();

    if (!doc.exists) {
        // Create new user document
        await userRef.set({
            profile: {
                name: user.displayName,
                email: user.email,
                uid: user.uid
            },
            stats: { emails: 0, requests: 0, bounces: 0, opens: 0 },
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Return clear state for new user
        return {
            projects: [],
            templates: [],
            apiKeys: [],
            stats: { emails: 0, requests: 0, bounces: 0, opens: 0 },
            activityLog: []
        };
    }
}

const UNK_LISTENERS = [];

function unsubscribeAll() {
    UNK_LISTENERS.forEach(unsub => unsub && unsub());
    UNK_LISTENERS.length = 0;
}

async function setupRealtimeListeners(user) {
    console.log("Setting up listeners for:", user.uid);
    unsubscribeAll(); // Clear any existing

    const userRef = db.collection('users').doc(user.uid);

    // 1. User Stats & Profile
    UNK_LISTENERS.push(userRef.onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            APP_STATE.stats = data.stats || APP_STATE.stats;
            renderDashboardStats();
            if (APP_STATE.chart) updateChart();

            // Sync user profile name if changed
            if (data.profile && data.profile.name !== APP_STATE.user.name) {
                APP_STATE.user.name = data.profile.name;
                const nameDisplay = document.getElementById('userNameDisplay');
                if (nameDisplay) nameDisplay.textContent = APP_STATE.user.name.split(' ')[0];
            }
        } else {
            // Initialize if missing
            initFirestoreUser(user);
        }
    }));

    // 2. Projects
    UNK_LISTENERS.push(userRef.collection('projects').orderBy('createdAt', 'desc').onSnapshot(snap => {
        APP_STATE.projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderProjects();
    }));

    // 3. Templates
    UNK_LISTENERS.push(userRef.collection('templates').orderBy('created', 'desc').onSnapshot(snap => {
        APP_STATE.templates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTemplates();
    }));

    // 4. API Keys
    UNK_LISTENERS.push(userRef.collection('apiKeys').orderBy('created', 'desc').onSnapshot(snap => {
        APP_STATE.apiKeys = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAPIKeys();
    }));

    // 5. Activity Log
    UNK_LISTENERS.push(userRef.collection('activityLog').orderBy('timestamp', 'desc').limit(20).onSnapshot(snap => {
        APP_STATE.activityLog = snap.docs.map(d => d.data());
        renderActivityLog();
        renderLogs(); // Update logs tab if open
        if (APP_STATE.activeTab === 'analytics') refreshAnalytics();
    }));
}

// Alias for compatibility if needed, but we should call setupRealtimeListeners
const syncUserData = setupRealtimeListeners;

// --- PROJECT MANAGEMENT ---
// --- PROJECT MANAGEMENT ---

// Deprecated: projects saved to Firestore
function saveProjects() { console.warn("saveProjects is deprecated"); }

// --- PROJECT MANAGEMENT ---

function renderProjects() {
    const list = document.getElementById('projectList');
    if (!list) return;

    if (APP_STATE.projects.length === 0) {
        list.innerHTML = `<p class="empty-state">No projects yet. Create one to get started!</p>`;
        return;
    }

    list.innerHTML = '';
    APP_STATE.projects.forEach(proj => {
        const card = document.createElement('div');
        card.className = 'stat-card glass';
        card.style.position = 'relative';
        card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start;">
            <div style="flex: 1; margin-right: 1rem;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 0.5rem;">
                    <h3 style="color: white; font-size: 1.2rem; margin: 0;">${sanitizeHTML(proj.name)}</h3>
                    <span class="tag" style="font-size: 0.7rem; background: rgba(255,255,255,0.05); color: var(--text-muted); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">${sanitizeHTML(proj.category || 'saas')}</span>
                </div>
                <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${sanitizeHTML(proj.description || proj.domain || 'No description provided.')}</p>
            </div>
            <div style="display: flex; gap: 8px;">
                     <button onclick="toggleProjectStatus('${proj.id}')" style="background: none; border: none; opacity: 0.7; cursor: pointer; font-size: 1.2rem;" title="${proj.status === 'active' ? 'Pause' : 'Activate'}">
                        ${proj.status === 'active' ? '⏸' : '▶'}
                    </button>
                    <button onclick="deleteProject('${proj.id}')" style="background: none; border: none; color: #ff4757; cursor: pointer; font-size: 1.5rem;" title="Delete Project">&times;</button>
            </div>
        </div>
        
        <div style="margin-top: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; gap: 15px;">
                <div style="display: flex; flex-direction: column;">
                    <span style="font-size: 0.75rem; color: var(--text-dim);">Emails Sent</span>
                    <span style="font-weight: bold; color: white;">${proj.stats?.emails || 0}</span>
                </div>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-size: 0.75rem; color: var(--text-dim);">Status</span>
                    <span style="font-size: 0.85rem; color: ${proj.status === 'active' ? 'var(--google-green)' : 'var(--text-muted)'}; font-weight: 500;">
                        ${proj.status === 'active' ? 'Active' : 'Paused'}
                    </span>
                </div>
            </div>
            <button onclick="openProject('${proj.id}')" class="btn btn-outline" style="padding: 0.5rem 1.2rem; font-size: 0.85rem;">Open Dashboard</button>
        </div>
    `;
        list.appendChild(card);
    });
}

window.openProject = function (projectId) {
    const project = APP_STATE.projects.find(p => p.id === projectId);
    if (!project) return;

    APP_STATE.activeProjectId = projectId;

    // UI: Switch to Project Dashboard view
    const dashboardTab = document.getElementById('projectDashboardTab');
    if (dashboardTab) {
        // Hide all dashboard tabs
        document.querySelectorAll('.dashboard-tab-content').forEach(tab => {
            tab.style.display = 'none';
            tab.classList.remove('active-tab');
        });

        dashboardTab.style.display = 'block';
        setTimeout(() => dashboardTab.classList.add('active-tab'), 10);

        // Update project info in dashboard
        document.getElementById('p_projectName').textContent = project.name;
        document.getElementById('p_projectId').textContent = project.id;
        document.getElementById('p_apiKey').value = project.apiKey;

        // Default to project analytics sub-tab
        showProjectSubTab('p_analytics');
    }

    logActivity('Project Dashboard', `Opened project: ${project.name}`);
};

// --- PROJECT SUB-TAB RENDERING ---
window.renderProjectTemplates = function () {
    const list = document.getElementById('projectTemplateList');
    if (!list || !APP_STATE.activeProjectId) return;

    const projectTemplates = APP_STATE.templates; // Fallback for simulation

    if (projectTemplates.length === 0) {
        list.innerHTML = `<p class="empty-state">No templates for this project. <button onclick="openTemplateModal()" class="btn btn-sm">Create One</button></p>`;
        return;
    }

    list.innerHTML = '';
    projectTemplates.forEach(tmp => {
        const card = document.createElement('div');
        card.className = 'template-card glass';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:1rem;">
                <h4 style="margin:0;">${sanitizeHTML(tmp.name)}</h4>
                <div style="display:flex; gap:5px;">
                    <button class="btn btn-sm" onclick="editTemplate('${tmp.id}')">Edit</button>
                    <button class="btn btn-sm" style="color:var(--google-red);" onclick="deleteTemplate('${tmp.id}')">&times;</button>
                </div>
            </div>
            <p style="font-size:0.8rem; color:var(--text-muted);">${sanitizeHTML(tmp.subject)}</p>
        `;
        list.appendChild(card);
    });
};

window.renderProjectAPIKeys = function () {
    const project = APP_STATE.projects.find(p => p.id === APP_STATE.activeProjectId);
    if (!project) return;

    document.getElementById('p_apiKey').value = project.apiKey || 'md_not_found';
};

window.updateProjectAnalytics = function () {
    const ctx = document.getElementById('projectTrafficChart');
    if (!ctx || !APP_STATE.activeProjectId) return;

    const project = APP_STATE.projects.find(p => p.id === APP_STATE.activeProjectId);
    const emails = project?.stats?.emails || 0;

    const data = [
        Math.floor(emails * 0.2),
        Math.floor(emails * 0.5),
        Math.floor(emails * 0.3),
        Math.floor(emails * 0.8),
        Math.floor(emails * 0.6),
        Math.floor(emails * 0.9),
        emails
    ];

    if (window.projectChart) window.projectChart.destroy();

    window.projectChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Today'],
            datasets: [{
                label: 'Emails Sent',
                data: data,
                backgroundColor: 'rgba(52, 168, 83, 0.4)',
                borderColor: 'var(--google-green)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
};

window.copyValue = function (id) {
    const el = document.getElementById(id);
    if (!el) return;

    el.select();
    document.execCommand('copy');

    const btn = el.nextElementSibling;
    const oldText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = oldText, 2000);
};


window.showProjectSubTab = function (subTabId) {
    // Hide all project sub-tabs
    document.querySelectorAll('.project-sub-tab-content').forEach(tab => {
        tab.style.display = 'none';
        tab.classList.remove('active');
    });

    // Show target sub-tab
    const target = document.getElementById(subTabId + 'Content');
    if (target) {
        target.style.display = 'block';
        setTimeout(() => target.classList.add('active'), 10);
    }

    // Update sub-nav active state
    document.querySelectorAll('.project-sub-nav-item').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick')?.includes(subTabId)) {
            btn.classList.add('active');
        }
    });

    // Special init for sub-tabs
    if (subTabId === 'p_templates') renderProjectTemplates();
    if (subTabId === 'p_apiKeys') renderProjectAPIKeys();
    if (subTabId === 'p_analytics') updateProjectAnalytics();
};

function openNewProjectModal() {
    const modal = document.getElementById('newProjectModal');
    if (modal) modal.classList.add('active');
}

function closeNewProjectModal() {
    const modal = document.getElementById('newProjectModal');
    if (modal) modal.classList.remove('active');
}

window.deleteProject = async function (id) {
    if (confirm("Are you sure you want to delete this project?")) {
        if (APP_STATE.user) {
            try {
                await db.collection('users').doc(APP_STATE.user.uid).collection('projects').doc(id).delete();
            } catch (e) {
                console.error("Delete failed", e);
            }
        } else {
            APP_STATE.projects = APP_STATE.projects.filter(p => p.id !== id);
            localStorage.setItem('gd_projects', JSON.stringify(APP_STATE.projects));
            renderProjects();
            logActivity('Project Deleted', 'Removed project from local storage');
        }
    }
};

window.toggleProjectStatus = async function (id) {
    const project = APP_STATE.projects.find(p => p.id === id);
    if (!project) return;

    const newStatus = project.status === 'active' ? 'paused' : 'active';

    if (APP_STATE.user) {
        try {
            await db.collection('users').doc(APP_STATE.user.uid).collection('projects').doc(id).update({
                status: newStatus
            });
        } catch (e) {
            console.error("Status update failed", e);
        }
    } else {
        project.status = newStatus;
        localStorage.setItem('gd_projects', JSON.stringify(APP_STATE.projects));
        renderProjects();
        logActivity('Project Updated', `Status changed to ${newStatus} for ${project.name}`);
    }
};

// --- PROJECT MANAGEMENT ---
// Note: saveProjects() is moved to be internal or deprecated in favor of direct Firestore calls

async function createProject(event) {
    if (event && event.preventDefault) event.preventDefault();

    const nameEl = document.getElementById('projectName');
    const domainEl = document.getElementById('projectDomain');
    const descEl = document.getElementById('projectDescription');
    const catEl = document.getElementById('projectCategory');

    const name = nameEl ? nameEl.value : '';
    const domain = domainEl ? domainEl.value : '';
    const description = descEl ? descEl.value : '';
    const category = catEl ? catEl.value : 'saas';

    if (!name) {
        alert("Please enter a project name");
        return;
    }

    const generateApiKey = () => 'md_' + Math.random().toString(36).substring(2, 12);

    const newProject = {
        id: 'proj_' + Math.random().toString(36).substr(2, 9),
        name: name,
        domain: domain,
        description: description,
        category: category,
        apiKey: generateApiKey(),
        status: 'active',
        stats: { emails: 0, failed: 0, opens: 0 },
        createdAt: new Date().toISOString()
    };

    if (APP_STATE.user) {
        try {
            newProject.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('users').doc(APP_STATE.user.uid).collection('projects').add(newProject);
            logActivity('Project Created', `Created project: ${name}`);
        } catch (e) {
            console.error("Error creating project:", e);
            alert("Failed to create project in cloud. See console.");
            return;
        }
    } else {
        // Guest mode
        APP_STATE.projects.unshift(newProject);
        localStorage.setItem('gd_projects', JSON.stringify(APP_STATE.projects));
        renderProjects();
        logActivity('Project Created (Guest)', `Created project: ${name}`);
    }

    // Success UI handling
    const projectModal = document.getElementById('projectModal');
    const projectForm = document.getElementById('projectForm');

    if (projectModal) projectModal.classList.remove('active');
    if (projectForm) projectForm.reset();
    document.body.style.overflow = 'auto';

    // Alert or Toast could be added here
}

// Map window function to the new handler or keep separate if needed for specific legacy calls
window.createProject = createProject;

// --- STATS & ACTIVITY ---
// --- STATS & ACTIVITY ---
async function logActivity(subject, details) {
    // Add to local state
    const newLog = {
        id: Date.now(),
        to: 'System',
        subject: subject,
        details: details || '',
        timestamp: Date.now()
    };
    APP_STATE.activityLog.unshift(newLog);

    // Prune logs if too many
    if (APP_STATE.activityLog.length > 50) {
        APP_STATE.activityLog = APP_STATE.activityLog.slice(0, 50);
    }

    renderActivityLog();
    if (APP_STATE.activeTab === 'logs') renderLogs();

    // Save to LocalStorage
    localStorage.setItem('gd_activityLog', JSON.stringify(APP_STATE.activityLog));

    // Save to Firestore 'activityLog' subcollection
    if (APP_STATE.user) {
        try {
            await db.collection('users').doc(APP_STATE.user.uid).collection('activityLog').add(newLog);
        } catch (e) {
            console.error("Failed to save log to cloud", e);
        }
    }
}

async function updateStats(newStats = {}) {
    // Update local state
    APP_STATE.stats = { ...APP_STATE.stats, ...newStats };
    renderDashboardStats();
    if (APP_STATE.chart) updateChart();

    // Save to LocalStorage
    localStorage.setItem('gd_stats', JSON.stringify(APP_STATE.stats));

    // Save to Firestore
    if (APP_STATE.user) {
        try {
            await db.collection('users').doc(APP_STATE.user.uid).update({
                stats: APP_STATE.stats
            });
        } catch (e) {
            console.error("Failed to update stats in cloud", e);
        }
    }
}

// Deprecated: Old saveStats wrapper
function saveStats() {
    console.warn("saveStats is deprecated. Use updateStats or specific collection methods.");
}

function renderDashboardStats() {
    const emailEl = document.getElementById('statsEmails');
    const reqEl = document.getElementById('statsRequests');
    if (emailEl) emailEl.innerText = APP_STATE.stats.emails.toLocaleString();
    if (reqEl) reqEl.innerText = APP_STATE.stats.requests.toLocaleString();
}

function renderActivityLog() {
    const logContainer = document.getElementById('activityLog');
    if (!logContainer) return;

    if (APP_STATE.activityLog.length === 0) {
        logContainer.innerHTML = `<p class="empty-state">No recent activity.</p>`;
        return;
    }

    logContainer.innerHTML = '';
    APP_STATE.activityLog.slice(0, 5).forEach(item => {
        const row = document.createElement('div');
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.marginBottom = "1rem";
        row.style.paddingBottom = "1rem";
        row.style.borderBottom = "1px solid var(--glass-border)";

        const date = new Date(item.timestamp).toLocaleString();
        row.innerHTML = `
        <div>
            <span style="color: var(--success); margin-right: 8px;">✔</span>
            <span style="color: white; font-weight: 500;">${sanitizeHTML(item.subject)}</span>
            <span style="color: var(--text-muted); font-size: 0.85rem; margin-left: 5px;">to ${sanitizeHTML(item.to)}</span>
        </div>
        <div style="color: var(--text-muted); font-size: 0.85rem; font-family: monospace;">${sanitizeHTML(date)}</div>
    `;
        logContainer.appendChild(row);
    });
}

// --- API KEY MANAGEMENT ---
// --- API KEY MANAGEMENT ---
window.generateAPIKey = async function () {
    const key = 'gd_' + Math.random().toString(36).substr(2, 24);
    const newKey = {
        id: 'key_' + Math.random().toString(36).substr(2, 9),
        key: key,
        name: 'Key ' + (APP_STATE.apiKeys.length + 1),
        created: new Date().toISOString()
    };

    if (APP_STATE.user) {
        try {
            await db.collection('users').doc(APP_STATE.user.uid).collection('apiKeys').add(newKey);
            alert('API Key Generated Successfully in Cloud!');
        } catch (e) {
            console.error("Failed to generate key", e);
            alert("Failed to generate API Key.");
        }
    } else {
        // Guest mode
        APP_STATE.apiKeys.unshift(newKey);
        localStorage.setItem('gd_apiKeys', JSON.stringify(APP_STATE.apiKeys));
        renderAPIKeys();
        logActivity('API Key Generated', 'New key created in guest mode');
        alert('API Key Generated Successfully (Local Storage)!');
    }
};

function renderAPIKeys() {
    const container = document.getElementById('apiKeysList');
    if (!container) return;

    if (APP_STATE.apiKeys.length === 0) {
        container.innerHTML = `<p class="empty-state">No API keys generated yet.</p>`;
        return;
    }

    container.innerHTML = APP_STATE.apiKeys.map(k => `
        <div class="api-key-item" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid var(--glass-border);">
            <div>
                <h4 style="margin: 0; font-size: 0.95rem;">${sanitizeHTML(k.name)}</h4>
                <p style="font-family: monospace; color: var(--google-blue); font-size: 0.85rem; margin-top: 5px;">
                    ${sanitizeHTML(k.key)}
                </p>
                <small style="color: var(--text-dim);">${sanitizeHTML(new Date(k.created).toLocaleDateString())}</small>
            </div>
            <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-outline btn-sm" id="copyKey-${k.id}" onclick="copyToClipboard('${k.key}', 'copyKey-${k.id}')">Copy</button>
                <button class="btn btn-outline btn-sm" style="color: var(--google-red); border-color: rgba(234,67,53,0.2);" onclick="deleteAPIKey('${k.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

window.deleteAPIKey = async function (id) {
    if (confirm('Are you sure you want to delete this API key?')) {
        if (APP_STATE.user) {
            try {
                await db.collection('users').doc(APP_STATE.user.uid).collection('apiKeys').doc(id).delete();
            } catch (e) {
                console.error("Failed to delete key", e);
            }
        } else {
            APP_STATE.apiKeys = APP_STATE.apiKeys.filter(k => k.id !== id);
            localStorage.setItem('gd_apiKeys', JSON.stringify(APP_STATE.apiKeys));
            renderAPIKeys();
            logActivity('API Key Deleted', 'Removed key from local storage');
        }
    }
};

// --- SPAM CHECKER LOGIC ---
window.checkSpamScore = function () {
    const content = document.getElementById('spamCheckContent').value;
    if (!content) return alert('Please enter some content to analyze.');

    const resultDiv = document.getElementById('spamResult');
    const meterFill = document.getElementById('spamMeterFill');
    const scoreText = document.getElementById('spamScoreText');
    const feedback = document.getElementById('spamFeedback');

    resultDiv.style.display = 'block';

    // Simple mock logic for spam score
    let score = 95;
    const spamWords = ['free', 'money', 'winner', 'click here', 'urgent', 'strictly confidential', 'winner', 'account', 'security'];
    const foundWords = spamWords.filter(word => content.toLowerCase().includes(word));

    score -= foundWords.length * 15;
    if (content.length < 20) score -= 20;
    if (content.toUpperCase() === content && content.length > 5) score -= 30;

    score = Math.max(0, Math.min(100, score));

    meterFill.style.width = score + '%';
    if (score > 80) meterFill.style.background = 'var(--google-green)';
    else if (score > 50) meterFill.style.background = 'var(--google-yellow)';
    else meterFill.style.background = 'var(--google-red)';

    scoreText.innerText = `Spam Score: ${score}/100`;

    if (score > 80) feedback.innerText = 'Excellent! Your email has a very high chance of landing in the inbox.';
    else if (score > 50) feedback.innerText = 'Good, but could be improved. Try avoiding common marketing keywords.';
    else feedback.innerText = 'Caution: High risk of being flagged as spam. Reduce uppercase letters and spammy keywords.';

    // Log as activity
    logActivity('Spam analysis', `Initial score: ${score}%`);
};

// --- TEMPLATE BUILDER LOGIC ---
window.openTemplateModal = function () {
    const modal = document.getElementById('templateModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
};

window.previewTemplate = function () {
    const body = document.getElementById('templateBody').value;
    const preview = document.getElementById('templatePreview');
    preview.style.display = 'block';
    preview.innerHTML = sanitizeSafeHTML(body) || '<p style="color: #666;">Enter content to see preview...</p>';
};

window.saveTemplate = async function (e) {
    if (e) e.preventDefault();
    const name = document.getElementById('templateName').value;
    const subject = document.getElementById('templateSubject').value;
    const body = document.getElementById('templateBody').value;

    if (!name || !subject || !body) return alert("Fill all fields");

    if (!APP_STATE.user) return alert("Login required");

    const newTpl = {
        name, subject, body,
        created: new Date().toISOString()
    };

    try {
        const docRef = await db.collection('users').doc(APP_STATE.user.uid).collection('templates').add(newTpl);
        APP_STATE.templates.push({ id: docRef.id, ...newTpl });
        renderTemplates();

        // Reset form
        document.getElementById('templateBuilderForm').reset();
        document.getElementById('templatePreview').style.display = 'none';

        // Close modal
        document.getElementById('templateModal').classList.remove('active');
        document.body.style.overflow = 'auto';

        alert("Template saved!");
    } catch (e) {
        console.error("Template save error", e);
    }
};

function renderTemplates() {
    const container = document.getElementById('templateList');
    if (!container) return;

    if (APP_STATE.templates.length === 0) {
        container.innerHTML = `<p class="empty-state">No templates yet. Build one to save time!</p>`;
        return;
    }

    container.innerHTML = '';
    APP_STATE.templates.forEach(tpl => {
        const card = document.createElement('div');
        card.className = 'stat-card glass';
        card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
                <h4 style="color: var(--text-primary); margin-bottom: 0.5rem;">${sanitizeHTML(tpl.name)}</h4>
                <p style="color: var(--text-muted); font-size: 0.85rem;">Subject: ${sanitizeHTML(tpl.subject)}</p>
            </div>
            <button onclick="deleteTemplate('${tpl.id}')" style="background: none; border: none; color: #ff4757; cursor: pointer; font-size: 1.2rem;">&times;</button>
        </div>
        <button class="btn btn-outline btn-sm full-width" style="margin-top: 1rem;" onclick="useTemplate('${tpl.id}')">Use Template</button>
    `;
        container.appendChild(card);
    });
}

window.deleteTemplate = async function (id) {
    if (confirm('Delete template?')) {
        try {
            await db.collection('users').doc(APP_STATE.user.uid).collection('templates').doc(id).delete();
            APP_STATE.templates = APP_STATE.templates.filter(t => t.id !== id);
            renderTemplates();
        } catch (e) {
            console.error("Delete template error", e);
        }
    }
};

window.useTemplate = function (id) {
    const tpl = APP_STATE.templates.find(t => t.id === id);
    if (!tpl) return;

    // Open email modal and fill data
    const emailModal = document.getElementById('emailModal');
    if (emailModal) {
        emailModal.classList.add('active');
        document.getElementById('emailSubject').value = tpl.subject;
        document.getElementById('emailBody').value = tpl.body;
        document.body.style.overflow = 'hidden';
    }
};

// --- SECURITY HELPERS ---
function startLockoutTimer() {
    const msg = document.getElementById('lockoutMsg');
    const timer = document.getElementById('lockoutTimer');
    const authModal = document.getElementById('authModal');

    if (!msg || !timer || !authModal) return;

    authModal.classList.add('lockout-active');
    msg.style.display = 'block';

    function update() {
        if (!APP_STATE.lockoutUntil) return;
        const remaining = Math.ceil((APP_STATE.lockoutUntil - Date.now()) / 1000);

        if (remaining <= 0) {
            APP_STATE.lockoutUntil = null;
            APP_STATE.failedAttempts = 0;
            msg.style.display = 'none';
            authModal.classList.remove('lockout-active');
            return;
        }

        timer.textContent = remaining;
        requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

function checkPasswordStrength(password) {
    const bar = document.getElementById('strengthBar');
    if (!bar) return;

    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    bar.className = '';
    if (strength === 0) {
        bar.style.width = '0%';
    } else if (strength <= 2) {
        bar.style.width = '33%';
        bar.classList.add('strength-weak');
    } else if (strength === 3) {
        bar.style.width = '66%';
        bar.classList.add('strength-medium');
    } else {
        bar.style.width = '100%';
        bar.classList.add('strength-strong');
    }
}

// --- CHART INITIALIZATION ---
function initChart() {
    const ctx = document.getElementById('trafficChart');
    if (!ctx) return;

    // Destroy existing chart
    if (APP_STATE.chart) {
        APP_STATE.chart.destroy();
    }

    APP_STATE.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Emails Sent',
                data: [12, 19, 3, 5, 2, 3, APP_STATE.stats.emails],
                borderWidth: 3,
                borderColor: '#8c00ff',
                backgroundColor: 'rgba(140, 0, 255, 0.1)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#8c00ff',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#a0a0b0',
                        font: {
                            family: 'Outfit',
                            size: 12
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#a0a0b0',
                        font: {
                            family: 'Outfit'
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#a0a0b0',
                        font: { family: 'Outfit' }
                    }
                }
            }
        }
    });
}

// --- THEME MANAGEMENT ---
function initTheme() {
    const savedTheme = localStorage.getItem('mcdock_theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const theme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeToggleUI(theme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('mcdock_theme', newTheme);
    updateThemeToggleUI(newTheme);
}

function updateThemeToggleUI(theme) {
    const toggles = document.querySelectorAll('#themeToggle');
    toggles.forEach(toggle => {
        toggle.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    });
}

function updateChart() {
    if (APP_STATE.chart) {
        const lastIndex = APP_STATE.chart.data.datasets[0].data.length - 1;
        APP_STATE.chart.data.datasets[0].data[lastIndex] = APP_STATE.stats.emails;
        APP_STATE.chart.update();
    }
}

// --- EMAIL SENDING (EmailJS) ---
async function sendEmail(to, subject, body) {
    const sendBtn = document.getElementById('sendEmailBtn');
    if (!sendBtn) return;

    const originalText = sendBtn.innerText;
    sendBtn.innerText = "Sending...";
    sendBtn.disabled = true;

    // --- TEST MODE (SANDBOXING) ---
    if (APP_STATE.isTestMode) {
        console.log("SANDBOX MODE: Email simulated", { to, subject, body });

        // Simulate delay
        await new Promise(resolve => setTimeout(resolve, 800));

        const logEntry = {
            id: Date.now(),
            to: to,
            subject: subject,
            timestamp: Date.now(),
            status: 'Simulated',
            latency: '800ms'
        };

        APP_STATE.activityLog.unshift(logEntry);
        APP_STATE.emailLogs.unshift(logEntry);

        await updateStats({ emails: APP_STATE.stats.emails + 1, requests: APP_STATE.stats.requests + 1 });
        renderActivityLog();
        renderLogs();
        triggerWebhooks('email.sent', { to, subject, mode: 'test' });

        alert("Email simulated successfully! (Test Mode is ON)");

        sendBtn.innerText = originalText;
        sendBtn.disabled = false;

        const emailModal = document.getElementById('emailModal');
        if (emailModal) {
            emailModal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
        return;
    }

    const templateParams = {
        from_name: APP_STATE.user?.name || 'GmailDev User',
        user_name: APP_STATE.user?.name || 'GmailDev User',
        name: APP_STATE.user?.name || 'GmailDev User',
        email: to,
        message: `Subject: ${subject}\n\n${body}`
    };

    console.log('Sending email with template parameters:', templateParams);

    // Initialize EmailJS with public key
    emailjs.init('oY19x3FTgJGF60ql9');

    // Send email via EmailJS
    emailjs.send('service_xyzzmie', 'template_pidbj0i', templateParams)
        .then(() => {
            APP_STATE.stats.emails++;
            APP_STATE.stats.requests++;

            const logEntry = {
                id: Date.now(),
                to: to,
                subject: subject,
                timestamp: Date.now(),
                status: 'Success'
            };

            APP_STATE.activityLog.unshift(logEntry);
            APP_STATE.emailLogs.unshift(logEntry);

            updateStats({
                emails: APP_STATE.stats.emails + 1,
                requests: APP_STATE.stats.requests + 1
            });
            renderActivityLog();
            renderLogs();
            triggerWebhooks('email.sent', { to, subject });

            alert("Email sent successfully!");

            sendBtn.innerText = originalText;
            sendBtn.disabled = false;

            const emailForm = document.getElementById('emailForm');
            if (emailForm) emailForm.reset();

            const emailModal = document.getElementById('emailModal');
            if (emailModal) {
                emailModal.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
        })
        .catch((error) => {
            console.error('EmailJS Error:', error);

            const logEntry = {
                id: Date.now(),
                to: to,
                subject: subject,
                timestamp: Date.now(),
                status: 'Error',
                error: error.text || 'Unknown Error'
            };

            APP_STATE.emailLogs.unshift(logEntry);
            renderLogs();

            alert('Failed to send email. Check logs for details.');
            sendBtn.innerText = originalText;
            sendBtn.disabled = false;
        });
}

function toggleTestMode() {
    const checkbox = document.getElementById('testModeToggle');
    const container = document.getElementById('testModeUI');

    APP_STATE.isTestMode = checkbox.checked;

    if (APP_STATE.isTestMode) {
        container.classList.add('active');
    } else {
        container.classList.remove('active');
    }

    console.log("Test Mode:", APP_STATE.isTestMode ? "ON" : "OFF");
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication status
    checkAuth();

    // The modal handlers are now in index.html inline scripts
    // This ensures they work with the new HTML structure



    console.log('GmailDev initialized successfully! 🚀');

    // Render specific feature UI
    renderTemplates();
    renderAPIKeys();
    renderWebhooks();
});

// --- SPLINE 3D MODEL ROTATION ---
document.addEventListener('DOMContentLoaded', () => {
    const splineViewer = document.querySelector('spline-viewer');

    if (splineViewer) {
        splineViewer.addEventListener('load', () => {
            // Auto-rotate the camera around the model
            let rotation = 0;

            function animate() {
                rotation += 0.002; // Slow rotation speed

                // Rotate the camera around the Y-axis
                if (splineViewer.camera) {
                    const radius = 5;
                    const x = Math.sin(rotation) * radius;
                    const z = Math.cos(rotation) * radius;

                    splineViewer.camera.position.x = x;
                    splineViewer.camera.position.z = z;
                    splineViewer.camera.lookAt(0, 0, 0);
                }
                requestAnimationFrame(animate);
            }
            requestAnimationFrame(animate);
        });
    }
});

// --- ANALYTICS DASHBOARD ---
const ANALYTICS_DATA = {
    charts: {},
    mockData: null
};

// Generate real analytics data from APP_STATE
function generateRealAnalyticsData(days = 30) {
    const data = {
        totalSentInPeriod: 0,
        totalSentOverall: APP_STATE.stats.emails,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        trends: [],
        campaigns: []
    };

    // Calculate daily trends from Activity Log
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateString = date.toDateString();

        // Count emails in log for this specific date
        // filter out system logs like 'Created project'
        const dailyLogs = APP_STATE.activityLog.filter(item => {
            const itemDate = new Date(item.timestamp).toDateString();
            const isEmail = item.to && item.to !== 'System' && item.subject;
            return itemDate === dateString && isEmail;
        });

        const sent = dailyLogs.length;
        const opened = Math.floor(sent * 0.45); // Simulated engagement for real data
        const clicked = Math.floor(opened * 0.2);

        data.trends.push({
            date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            sent,
            delivered: sent,
            opened,
            clicked,
            bounced: 0
        });

        data.totalSentInPeriod += sent;
        data.delivered += sent;
        data.opened += opened;
        data.clicked += clicked;
    }

    // Map projects to campaigns
    if (APP_STATE.projects.length > 0) {
        APP_STATE.projects.forEach(proj => {
            // Find activity for this specific project if possible 
            // Currently subject contains project context sometimes
            const projEmails = APP_STATE.activityLog.filter(log =>
                log.subject && log.subject.toLowerCase().includes(proj.name.toLowerCase())
            ).length;

            data.campaigns.push({
                name: proj.name,
                sent: projEmails,
                delivered: projEmails,
                opened: Math.floor(projEmails * 0.45),
                clicked: Math.floor(projEmails * 0.09),
                bounced: 0,
                status: 'Active'
            });
        });

        // Filter out inactive campaigns for smart visibility
        data.campaigns = data.campaigns.filter(c => c.sent > 0);
    } else {
        // Fallback for empty state
        data.campaigns = [];
    }

    return data;
}

// Initialize Analytics Charts
function initAnalyticsCharts() {
    const data = ANALYTICS_DATA.mockData; // This now holds real data
    if (!data) return;

    // Delivery Trends Chart
    const deliveryCtx = document.getElementById('deliveryTrendsChart');
    if (deliveryCtx) {
        ANALYTICS_DATA.charts.delivery = new Chart(deliveryCtx, {
            type: 'line',
            data: {
                labels: data.trends.map(t => t.date),
                datasets: [
                    {
                        label: 'Sent',
                        data: data.trends.map(t => t.sent),
                        borderColor: '#4285f4',
                        backgroundColor: 'rgba(66, 133, 244, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Delivered',
                        data: data.trends.map(t => t.delivered),
                        borderColor: '#34a853',
                        backgroundColor: 'rgba(52, 168, 83, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Failed',
                        data: data.trends.map(t => t.bounced),
                        borderColor: '#ea4335',
                        backgroundColor: 'rgba(234, 67, 53, 0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#9aa0a6', font: { family: 'Outfit' } }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#9aa0a6', font: { family: 'Outfit' } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#9aa0a6', font: { family: 'Outfit' } }
                    }
                }
            }
        });
    }

    // Open Rate Chart (Doughnut)
    const openCtx = document.getElementById('openRateChart');
    if (openCtx) {
        ANALYTICS_DATA.charts.openRate = new Chart(openCtx, {
            type: 'doughnut',
            data: {
                labels: ['Opened', 'Unopened'],
                datasets: [{
                    data: [data.opened, data.delivered - data.opened],
                    backgroundColor: ['#4285f4', 'rgba(255, 255, 255, 0.1)'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#9aa0a6', font: { family: 'Outfit' }, padding: 20 }
                    }
                }
            }
        });
    }

    // CTR Chart (Bar)
    const ctrCtx = document.getElementById('ctrChart');
    if (ctrCtx) {
        ANALYTICS_DATA.charts.ctr = new Chart(ctrCtx, {
            type: 'bar',
            data: {
                labels: data.campaigns.map(c => c.name),
                datasets: [{
                    label: 'Click Rate %',
                    data: data.campaigns.map(c => ((c.clicked / c.delivered) * 100).toFixed(2)),
                    backgroundColor: '#fbbc04',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#9aa0a6', font: { family: 'Outfit' } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#9aa0a6', font: { family: 'Outfit' } }
                    }
                }
            }
        });
    }

    // Bounce Rate Chart
    const bounceCtx = document.getElementById('bounceRateChart');
    if (bounceCtx) {
        ANALYTICS_DATA.charts.bounce = new Chart(bounceCtx, {
            type: 'line',
            data: {
                labels: data.trends.map(t => t.date),
                datasets: [{
                    label: 'Bounce Rate %',
                    data: data.trends.map(t => ((t.bounced / t.sent) * 100).toFixed(2)),
                    borderColor: '#ea4335',
                    backgroundColor: 'rgba(234, 67, 53, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#9aa0a6', font: { family: 'Outfit' } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#9aa0a6', font: { family: 'Outfit' } }
                    }
                }
            }
        });
    }

    // Geographic Distribution (Bar)
    const geoCtx = document.getElementById('geoChart');
    if (geoCtx) {
        ANALYTICS_DATA.charts.geo = new Chart(geoCtx, {
            type: 'bar',
            data: {
                labels: ['North America', 'Europe', 'Asia', 'South America', 'Africa', 'Oceania'],
                datasets: [{
                    label: 'Recipients',
                    data: [3500, 2800, 4200, 1200, 800, 600],
                    backgroundColor: ['#4285f4', '#34a853', '#fbbc04', '#ea4335', '#9aa0a6', '#669df6'],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#9aa0a6', font: { family: 'Outfit' } }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: '#9aa0a6', font: { family: 'Outfit' } }
                    }
                }
            }
        });
    }

    // Peak Times Chart
    const peakCtx = document.getElementById('peakTimesChart');
    if (peakCtx) {
        ANALYTICS_DATA.charts.peak = new Chart(peakCtx, {
            type: 'bar',
            data: {
                labels: ['12 AM', '3 AM', '6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM'],
                datasets: [{
                    label: 'Emails Sent',
                    data: [120, 80, 250, 850, 1200, 900, 650, 400],
                    backgroundColor: '#34a853',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#9aa0a6', font: { family: 'Outfit' } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#9aa0a6', font: { family: 'Outfit' } }
                    }
                }
            }
        });
    }
}

// --- PROFILE MANAGEMENT ---
window.openProfileModal = function () {
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        renderProfile();
    }
};

window.renderProfile = function () {
    if (!APP_STATE.user) return;

    document.getElementById('profileName').textContent = APP_STATE.user.name;
    document.getElementById('profileEmail').textContent = APP_STATE.user.email;
    document.getElementById('profileUid').value = APP_STATE.user.uid;
};

// Update KPIs
function updateAnalyticsKPIs() {
    const data = ANALYTICS_DATA.mockData;
    if (!data) return;

    const totalSentEl = document.getElementById('statsEmails'); // Reusing overview stats or fix if dedicated exists
    const deliveryRateEl = document.getElementById('kpiDeliveryRate');
    const openRateEl = document.getElementById('kpiOpenRate');
    const clickRateEl = document.getElementById('kpiClickRate');

    if (totalSentEl) totalSentEl.textContent = data.totalSentOverall.toLocaleString();
    if (deliveryRateEl) deliveryRateEl.textContent = data.totalSentInPeriod > 0 ? ((data.delivered / data.totalSentInPeriod) * 100).toFixed(1) + '%' : '0%';
    if (openRateEl) openRateEl.textContent = data.delivered > 0 ? ((data.opened / data.delivered) * 100).toFixed(1) + '%' : '0%';
    if (clickRateEl) clickRateEl.textContent = data.opened > 0 ? ((data.clicked / data.opened) * 100).toFixed(1) + '%' : '0%';
}

// Refresh Analytics (Live Update)
function refreshAnalytics() {
    // Regenerate data from real APP_STATE
    const days = parseInt(document.getElementById('dateRangeSelector')?.value || 30);
    const data = generateRealAnalyticsData(days);
    ANALYTICS_DATA.mockData = data;

    const kpiGrid = document.querySelector('.analytics-kpi-grid');
    const chartsGrid = document.querySelector('.analytics-charts-grid');
    const tableContainer = document.querySelector('.analytics-table-container');
    const dashboardSection = document.getElementById('dashboard');
    const analyticsTab = document.getElementById('analyticsTab');

    if (dashboardSection && dashboardSection.style.display !== 'none' && analyticsTab && analyticsTab.style.display !== 'none') {
        // Handle Empty State Visibility
        if (data.totalSentInPeriod === 0) {
            if (chartsGrid) chartsGrid.style.display = 'none';
            if (tableContainer) tableContainer.style.display = 'none';

            // Inject empty state if not exists
            if (!document.getElementById('analyticsEmptyState')) {
                const emptyMsg = document.createElement('div');
                emptyMsg.id = 'analyticsEmptyState';
                emptyMsg.className = 'empty-state glass';
                emptyMsg.style.padding = '4rem';
                emptyMsg.style.marginTop = '2rem';
                emptyMsg.innerHTML = `
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🔍</div>
                    <h3>No activity found for the last ${days} days</h3>
                    <p style="color: var(--text-muted);">When you send emails within this time range, your analytics will appear here automatically.</p>
                `;
                analyticsTab.appendChild(emptyMsg);
            } else {
                document.getElementById('analyticsEmptyState').style.display = 'block';
                document.getElementById('analyticsEmptyState').querySelector('h3').innerText = `No activity found for the last ${days} days`;
            }
        } else {
            if (chartsGrid) chartsGrid.style.display = 'grid';
            if (tableContainer) tableContainer.style.display = 'block';
            if (document.getElementById('analyticsEmptyState')) {
                document.getElementById('analyticsEmptyState').style.display = 'none';
            }
        }

        // Destroy existing library charts to prevent memory leaks and ghosting
        Object.values(ANALYTICS_DATA.charts).forEach(chart => chart?.destroy());
        ANALYTICS_DATA.charts = {};

        if (data.totalSentInPeriod > 0) {
            initAnalyticsCharts();
        }
        updateAnalyticsKPIs();
        updateCampaignTable();
    }
}

/* Welcome Screen Logic */
window.addEventListener('load', () => {
    setTimeout(() => {
        document.body.classList.add('loaded');
        // Remove from DOM after transition
        setTimeout(() => {
            const welcomeScreen = document.getElementById('welcome-screen');
            if (welcomeScreen) {
                welcomeScreen.style.opacity = '0';
                setTimeout(() => {
                    welcomeScreen.style.display = 'none';
                    startBackgroundSlideshow(); // Start background rotation after intro
                }, 800);
            }
        }, 100);
    }, 2500); // Wait for loading bar
});

// Dynamic Background Slideshow
function startBackgroundSlideshow() {
    const bgWrapper = document.querySelector('.background-wrapper');
    if (!bgWrapper) return;

    // Infrastructure & Tech Images (Custom Generated + High Res)
    const images = [
        'images/bg.png',           // Original Custom
        'images/bg_fiber.png',     // Fiber Optic Network
        'images/bg_global.png',    // Global Network Earth
        'images/bg_datacenter.png', // Data Center Interior
        'https://images.unsplash.com/photo-1544197150-b99a580bbcbf?q=80&w=2070&auto=format&fit=crop', // Fiber/Network
        'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop'  // Global/Earth
    ];

    let currentIndex = 0;

    // Preload images
    images.forEach(src => {
        const img = new Image();
        img.src = src;
    });

    setInterval(() => {
        currentIndex = (currentIndex + 1) % images.length;
        bgWrapper.style.backgroundImage = `url('${images[currentIndex]}')`;
        console.log('Background changed to:', images[currentIndex]); // Debug log
    }, 5000); // Change every 5 seconds (reduced from 15s)
}

// Toggle Deep Analytics (Show/Hide)
function toggleDeepAnalytics() {
    const analyticsSection = document.getElementById('analyticsTab');
    if (!analyticsSection) return;

    const isHidden = analyticsSection.style.display === 'none';

    if (isHidden) {
        showDashboardTab('analytics');
        analyticsSection.scrollIntoView({ behavior: 'smooth' });
    } else {
        showDashboardTab('overview');
    }
}

// Update Campaign Table
function updateCampaignTable() {
    const data = ANALYTICS_DATA.mockData;
    if (!data) return;

    const tbody = document.getElementById('analyticsTableBody');
    if (!tbody) return;

    tbody.innerHTML = data.campaigns.map(campaign => `
        <tr>
            <td><strong>${campaign.name}</strong></td>
            <td>${campaign.sent.toLocaleString()}</td>
            <td>${campaign.delivered.toLocaleString()}</td>
            <td>${campaign.opened.toLocaleString()} (${((campaign.opened / campaign.delivered) * 100).toFixed(1)}%)</td>
            <td>${campaign.clicked.toLocaleString()} (${((campaign.clicked / campaign.opened) * 100).toFixed(1)}%)</td>
            <td>${campaign.bounced.toLocaleString()}</td>
            <td><span style="color: ${campaign.status === 'Active' ? '#34a853' : '#9aa0a6'}">${campaign.status}</span></td>
        </tr>
    `).join('');
}

// Export Analytics Data
function exportAnalyticsData() {
    const data = ANALYTICS_DATA.mockData;
    if (!data) return;

    let csv = 'Campaign,Sent,Delivered,Opens,Clicks,Bounces,Status\n';
    data.campaigns.forEach(c => {
        csv += `${c.name},${c.sent},${c.delivered},${c.opened},${c.clicked},${c.bounced},${c.status}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Initialize Analytics on page load
document.addEventListener('DOMContentLoaded', () => {
    setupOTPInputs();
    // Generate real data from APP_STATE
    ANALYTICS_DATA.mockData = generateRealAnalyticsData(30);

    // Date range selector
    const dateSelector = document.getElementById('dateRangeSelector');
    if (dateSelector) {
        dateSelector.addEventListener('change', (e) => {
            const days = parseInt(e.target.value);
            ANALYTICS_DATA.mockData = generateRealAnalyticsData(days);

            // Destroy existing charts
            Object.values(ANALYTICS_DATA.charts).forEach(chart => chart?.destroy());
            ANALYTICS_DATA.charts = {};

            // Reinitialize
            initAnalyticsCharts();
            updateAnalyticsKPIs();
            updateCampaignTable();
        });
    }

    // Export button
    const exportBtn = document.getElementById('exportAnalytics');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportAnalyticsData);
    }

    // Auth Form improvements
    const signupPass = document.getElementById('signupPassword');
    if (signupPass) {
        signupPass.addEventListener('input', (e) => {
            checkPasswordStrength(e.target.value);
        });
    }

    // Theme Toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    initTheme();

    // Initialize charts when dashboard is visible
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            const dashboardSection = document.getElementById('dashboard');
            if (dashboardSection && dashboardSection.style.display !== 'none') {
                if (Object.keys(ANALYTICS_DATA.charts).length === 0) {
                    setTimeout(() => {
                        refreshAnalytics();
                    }, 100);
                }
            }
        });
    });

    const dashboardSection = document.getElementById('dashboard');
    if (dashboardSection) {
        observer.observe(dashboardSection, { attributes: true, attributeFilter: ['style'] });
    }

    // Initialize background carousel
    initBackgroundCarousel();
});

// --- BACKGROUND CAROUSEL ---
function initBackgroundCarousel() {
    const images = document.querySelectorAll('.bg-carousel-image');
    if (images.length === 0) return;

    let currentIndex = 0;
    const intervalTime = 8000; // 8 seconds

    function rotateBackground() {
        // Remove active class from current image
        images[currentIndex].classList.remove('active');

        // Move to next image
        currentIndex = (currentIndex + 1) % images.length;

        // Add active class to new image
        images[currentIndex].classList.add('active');
    }

    // Start the carousel
    setInterval(rotateBackground, intervalTime);
}

// --- SMART SEARCH FUNCTIONALITY ---
function initSearch() {
    const searchInput = document.getElementById('globalSearch');
    const searchResults = document.getElementById('searchResults');
    const resultsList = document.getElementById('searchResultsList');
    const resultsCount = document.querySelector('.search-results-count');

    if (!searchInput || !searchResults || !resultsList) return;

    const searchableData = [
        { title: 'Getting Started', desc: 'Learn how to set up your first email campaign in minutes.', category: 'Docs', icon: '📚', action: () => navigate('docs') },
        { title: 'Authentication', desc: 'Securely authenticate your requests using API keys or OAuth.', category: 'Docs', icon: '🔐', action: () => navigate('docs') },
        { title: 'REST API Reference', desc: 'Detailed documentation for all our API endpoints.', category: 'API', icon: '🔌', action: () => navigate('docs') },
        { title: 'SDKs & Libraries', desc: 'Official libraries for Node.js, Python, PHP, and more.', category: 'Resources', icon: '📦', action: () => navigate('resources') },
        { title: 'Email Analytics', desc: 'View real-time delivery performance and engagement metrics.', category: 'Dashboard', icon: '📊', action: () => navigate('dashboard') },
        { title: 'Project Management', desc: 'Create and manage your email infrastructure projects.', category: 'Dashboard', icon: '🏗️', action: () => navigate('dashboard') },
        { title: 'Spam Checker', desc: 'Analyze your email content to improve deliverability.', category: 'Tools', icon: '🛡️', action: () => showDashboardTab('spamChecker') },
        { title: 'API Keys', desc: 'Manage your developer API keys and access tokens.', category: 'Security', icon: '🔑', action: () => showDashboardTab('apiKeys') },
        { title: 'Templates', desc: 'Create and manage reusable email templates.', category: 'Tools', icon: '🎨', action: () => showDashboardTab('templates') }
    ];

    function getCombinedSearchData() {
        let data = [...searchableData];

        // Add dynamic projects
        APP_STATE.projects.forEach(p => {
            data.push({
                title: p.name,
                desc: p.description || p.domain || 'Project',
                category: 'Project',
                icon: '🏗️',
                action: () => navigate('dashboard')
            });
        });

        // Add dynamic templates
        APP_STATE.templates.forEach(t => {
            data.push({
                title: t.name,
                desc: t.subject || 'Template',
                category: 'Template',
                icon: '🎨',
                action: () => showDashboardTab('templates')
            });
        });

        return data;
    }

    function search(query) {
        if (!query || query.length < 2) {
            searchResults.style.display = 'none';
            return;
        }

        const data = getCombinedSearchData();
        const filtered = data.filter(item =>
            item.title.toLowerCase().includes(query.toLowerCase()) ||
            item.desc.toLowerCase().includes(query.toLowerCase()) ||
            item.category.toLowerCase().includes(query.toLowerCase())
        );

        renderResults(filtered);
    }

    function renderResults(results) {
        resultsList.innerHTML = '';
        resultsCount.textContent = `${results.length} result${results.length !== 1 ? 's' : ''}`;

        if (results.length === 0) {
            resultsList.innerHTML = `
                <div class="search-no-results">
                    <div class="search-no-results-icon">🕵️‍♂️</div>
                    <p>No results found. Try a different keyword.</p>
                </div>
            `;
        } else {
            results.forEach(result => {
                const item = document.createElement('div');
                item.className = 'search-result-item';
                item.innerHTML = `
                    <div class="search-result-icon">${result.icon}</div>
                    <div class="search-result-content">
                        <div class="search-result-category">${result.category}</div>
                        <div class="search-result-title">${result.title}</div>
                        <div class="search-result-description">${result.desc}</div>
                    </div>
                `;
                item.onclick = () => {
                    result.action();
                    searchResults.style.display = 'none';
                    searchInput.value = '';
                };
                resultsList.appendChild(item);
            });
        }

        searchResults.style.display = 'block';
    }

    // Event Listeners
    searchInput.addEventListener('input', (e) => search(e.target.value));

    searchInput.addEventListener('focus', () => {
        if (searchInput.value.length >= 2) searchResults.style.display = 'block';
    });

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.style.display = 'none';
        }
    });

    // Keyboard Shortcut (Ctrl+K or Cmd+K)
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            searchInput.focus();
        }
        if (e.key === 'Escape') {
            searchResults.style.display = 'none';
            searchInput.blur();
        }
    });
}

// Call initSearch after DOM load
document.addEventListener('DOMContentLoaded', () => {
    // Other initializations... (existing logic above might already have DOMContentLoaded)
    initSearch();
    initOnboarding();
});

// --- ONBOARDING CHECKLIST LOGIC ---
function initOnboarding() {
    if (!APP_STATE.isLoggedIn) return;

    const checklist = document.getElementById('onboardingChecklist');
    if (!checklist) return;

    // Check if dismissed
    if (localStorage.getItem(`onboarding_dismissed_${APP_STATE.user.uid}`)) {
        checklist.style.display = 'none';
        return;
    }

    updateOnboardingProgress();
}

function updateOnboardingProgress() {
    if (!APP_STATE.isLoggedIn) return;

    const steps = {
        'step-create-project': APP_STATE.projects.length > 0,
        'step-api-key': APP_STATE.apiKeys.length > 0,
        'step-test-email': APP_STATE.stats.emails > 0,
        'step-docs': localStorage.getItem(`onboarding_docs_read_${APP_STATE.user.uid}`) === 'true'
    };

    let completedCount = 0;
    const totalSteps = Object.keys(steps).length;

    for (const [id, isCompleted] of Object.entries(steps)) {
        const item = document.getElementById(id);
        if (item) {
            if (isCompleted) {
                item.classList.add('completed');
                completedCount++;
            } else {
                item.classList.remove('completed');
            }
        }
    }

    const progressPercent = Math.round((completedCount / totalSteps) * 100);
    const progressBar = document.getElementById('onboardingProgressBar');
    const progressText = document.getElementById('onboardingPercent');

    if (progressBar) progressBar.style.width = `${progressPercent}%`;
    if (progressText) progressText.textContent = `${progressPercent}%`;

    if (progressPercent === 100) {
        // Optional: Celebration effect or subtle hint
        const header = document.querySelector('.onboarding-header h3');
        if (header && !header.textContent.includes('🎉')) {
            header.textContent = 'Mission Accomplished! 🎉';
        }
    }
}

// Global functions for onboarding
window.dismissOnboarding = function () {
    if (!APP_STATE.user) return;
    localStorage.setItem(`onboarding_dismissed_${APP_STATE.user.uid}`, 'true');
    const checklist = document.getElementById('onboardingChecklist');
    if (checklist) {
        checklist.style.opacity = '0';
        checklist.style.transform = 'translateY(20px)';
        setTimeout(() => checklist.style.display = 'none', 300);
    }
};

// Track docs read
const originalNavigate = window.navigate;
window.navigate = function (viewId) {
    if (viewId === 'docs' && APP_STATE.isLoggedIn) {
        localStorage.setItem(`onboarding_docs_read_${APP_STATE.user.uid}`, 'true');
        setTimeout(updateOnboardingProgress, 500);
    }
    originalNavigate(viewId);
};

// Re-hook into syncUserData to update onboarding
const originalSyncUserData = setupRealtimeListeners;
setupRealtimeListeners = async function (user) {
    await originalSyncUserData(user);
    initOnboarding();
    setTimeout(updateOnboardingProgress, 1000); // Wait for initial data
};
// --- API PLAYGROUND LOGIC ---
let currentPlaygroundLang = 'javascript';

window.switchLanguage = function (lang) {
    currentPlaygroundLang = lang;

    // Update tabs
    document.querySelectorAll('.play-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.innerText.toLowerCase() === lang.toLowerCase()) {
            tab.classList.add('active');
        }
    });

    updateAPIExplorerSnippet();
};

window.updateAPIExplorerSnippet = function () {
    const to = document.getElementById('explorerTo').value || 'user@example.com';
    const subject = document.getElementById('explorerSubject').value || 'Hello World';
    const body = document.getElementById('explorerBody').value || 'Testing GmailDev API...';

    const snippetEl = document.getElementById('explorerSnippet');
    if (!snippetEl) return;

    let snippet = '';

    if (currentPlaygroundLang === 'javascript') {
        snippet = `gmailDev.send({
  to: "${to}",
  subject: "${subject}",
  body: "${body.substring(0, 50)}${body.length > 50 ? '...' : ''}"
});`;
    } else if (currentPlaygroundLang === 'python') {
        snippet = `import gmaildev

client = gmaildev.Client(api_key='your_api_key')

client.send_email(
    to="${to}",
    subject="${subject}",
    content="${body.substring(0, 50)}${body.length > 50 ? '...' : ''}"
)`;
    } else if (currentPlaygroundLang === 'curl') {
        snippet = `curl -X POST https://api.gmaildev.com/v1/send \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "${to}",
    "subject": "${subject}",
    "body": "${body.substring(0, 50)}${body.length > 50 ? '...' : ''}"
  }'`;
    }

    snippetEl.textContent = snippet;
};

window.sendExplorerEmail = async function () {
    const to = document.getElementById('explorerTo').value;
    const subject = document.getElementById('explorerSubject').value;
    const body = document.getElementById('explorerBody').value;

    if (!to) return alert("Please enter a recipient email.");

    const btn = document.getElementById('sendExplorerBtn');
    const responseArea = document.getElementById('apiResponse');
    const responseBody = document.getElementById('responseBody');
    const statusTag = document.getElementById('responseStatus');

    if (btn) btn.disabled = true;

    // Simulate API Delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
        // Log to activity
        logActivity('API Explorer', `Email sent to ${to}`);

        // Show response
        if (responseArea) {
            responseArea.style.display = 'block';
            statusTag.textContent = '200 OK';
            statusTag.style.background = 'rgba(52, 168, 83, 0.1)';
            statusTag.style.color = 'var(--google-green)';

            responseBody.textContent = JSON.stringify({
                status: "success",
                messageId: "msg_" + Math.random().toString(36).substr(2, 12),
                timestamp: new Date().toISOString()
            }, null, 2);
        }

        // Update onboarding if relevant
        if (typeof updateOnboardingProgress === 'function') {
            APP_STATE.stats.emails++;
            updateOnboardingProgress();
        }

    } catch (err) {
        if (responseArea) {
            responseArea.style.display = 'block';
            statusTag.textContent = '500 Error';
            statusTag.style.background = 'rgba(234, 67, 53, 0.1)';
            statusTag.style.color = 'var(--google-red)';
            responseBody.textContent = JSON.stringify({
                status: "error",
                message: "Internal Server Error"
            }, null, 2);
        }
    } finally {
        if (btn) btn.disabled = false;

        // Hide response after 5 seconds
        setTimeout(() => {
            if (responseArea) responseArea.style.display = 'none';
        }, 8000);
    }
};

window.copyAPIPlaygroundCode = function () {
    const snippet = document.getElementById('explorerSnippet').textContent;
    navigator.clipboard.writeText(snippet).then(() => {
        const copyBtn = document.querySelector('[onclick="copyAPIPlaygroundCode()"]');
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '✅ Copied!';
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
        }, 2000);
    });
};

// --- DOCUMENTATION LOGIC ---
window.showDocPage = function (pageId) {
    // Hide all pages
    document.querySelectorAll('.doc-page').forEach(page => {
        page.style.display = 'none';
    });

    // Show selected page
    const selectedPage = document.getElementById(`doc-${pageId}`);
    if (selectedPage) {
        selectedPage.style.display = 'block';
        selectedPage.classList.add('fade-in');
    }

    // Update sidebar active state
    document.querySelectorAll('.docs-sidebar a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('onclick')?.includes(`'${pageId}'`)) {
            link.classList.add('active');
        }
    });

    // Update breadcrumbs
    const breadcrumbCurrent = document.getElementById('breadcrumb-current');
    if (breadcrumbCurrent) {
        const pageTitle = selectedPage?.querySelector('h3')?.innerText || 'Docs';
        breadcrumbCurrent.innerText = pageTitle;
    }

    // Scroll to top of content
    document.querySelector('.docs-main')?.scrollTo({ top: 0, behavior: 'smooth' });
};

window.copyCode = function (btn) {
    const code = btn.parentElement.nextElementSibling.querySelector('code').innerText;
    navigator.clipboard.writeText(code).then(() => {
        const originalText = btn.innerText;
        btn.innerText = '✅ Copied!';
        setTimeout(() => {
            btn.innerText = originalText;
        }, 2000);
    });
};

// --- SUPPORT LOGIC ---
window.toggleFaq = function (btn) {
    const answer = btn.nextElementSibling;
    const icon = btn.querySelector('span:last-child');

    if (answer.style.display === 'block') {
        answer.style.display = 'none';
        icon.innerText = '+';
    } else {
        answer.style.display = 'block';
        icon.innerText = '-';
    }
};

// Support Form Submission
document.addEventListener('DOMContentLoaded', () => {
    const supportForm = document.getElementById('supportForm');
    if (supportForm) {
        supportForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = supportForm.querySelector('button');
            const originalText = btn.innerText;

            btn.innerText = 'Sending...';
            btn.disabled = true;

            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 1500));

            alert('Your message has been sent! Our support team will respond within 24 hours.');
            supportForm.reset();
            btn.innerText = originalText;
            btn.disabled = false;
        });
    }
});

// --- WEBHOOK MANAGEMENT ---
window.openWebhookModal = function () {
    const modal = document.getElementById('webhookModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
};

window.renderWebhooks = function () {
    const list = document.getElementById('webhooksList');
    if (!list) return;

    if (APP_STATE.webhooks.length === 0) {
        list.innerHTML = `<p class="empty-state">No webhooks configured. Add one to receive real-time updates!</p>`;
        return;
    }

    list.innerHTML = '';
    APP_STATE.webhooks.forEach(hook => {
        const card = document.createElement('div');
        card.className = 'stat-card glass';
        card.style.position = 'relative';
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1.5rem;">
                <div style="overflow: hidden; flex: 1; margin-right: 1rem;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 0.5rem;">
                        <span style="font-size: 1.2rem;">🔌</span>
                        <h3 style="color: white; font-size: 1.1rem; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${sanitizeHTML(hook.url)}</h3>
                    </div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        ${hook.events.map(ev => `<span class="tag" style="font-size: 0.7rem; background: rgba(140, 0, 255, 0.1); color: #8c00ff; border: 1px solid rgba(140, 0, 255, 0.2);">${ev}</span>`).join('')}
                    </div>
                </div>
                <button onclick="deleteWebhook('${hook.id}')" style="background: none; border: none; color: #ff4757; cursor: pointer; font-size: 1.2rem; opacity: 0.7; transition: opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7">&times;</button>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05);">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="width: 8px; height: 8px; background: ${hook.status === 'active' ? 'var(--google-green)' : '#aaa'}; border-radius: 50%;"></span>
                    <span style="font-size: 0.8rem; color: ${hook.status === 'active' ? 'var(--google-green)' : '#aaa'};">${hook.status === 'active' ? 'Active' : 'Paused'}</span>
                </div>
                <small style="color: var(--text-dim); font-size: 0.75rem;">Created: ${new Date(hook.createdAt).toLocaleDateString()}</small>
            </div>
        `;
        list.appendChild(card);
    });
};

window.saveWebhook = async function (e) {
    if (e) e.preventDefault();

    const url = document.getElementById('webhookUrl').value;
    const events = [];
    if (document.getElementById('eventEmailSent').checked) events.push('email.sent');
    if (document.getElementById('eventEmailError').checked) events.push('email.error');

    if (!url) return alert("Please enter a target URL");
    if (events.length === 0) return alert("Please select at least one event");

    const newWebhook = {
        id: 'wh_' + Math.random().toString(36).substr(2, 9),
        url: url,
        events: events,
        status: 'active',
        createdAt: new Date().toISOString()
    };

    if (APP_STATE.user) {
        try {
            await db.collection('users').doc(APP_STATE.user.uid).collection('webhooks').add(newWebhook);
        } catch (err) {
            console.error("Cloud save failed", err);
        }
    }

    APP_STATE.webhooks.unshift(newWebhook);
    localStorage.setItem('gd_webhooks', JSON.stringify(APP_STATE.webhooks));

    renderWebhooks();
    const webhookModal = document.getElementById('webhookModal');
    if (webhookModal) {
        webhookModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
    document.getElementById('webhookForm').reset();
    logActivity('Webhook Created', `Added endpoint: ${url}`);
};

window.deleteWebhook = async function (id) {
    if (!confirm("Delete this webhook?")) return;

    if (APP_STATE.user) {
        try {
            // Need to find the firestore ID, or just trust the local delete and let sync handle it
            // For now, simple local delete
        } catch (err) { }
    }

    APP_STATE.webhooks = APP_STATE.webhooks.filter(h => h.id !== id);
    localStorage.setItem('gd_webhooks', JSON.stringify(APP_STATE.webhooks));
    renderWebhooks();
    logActivity('Webhook Deleted', `Removed webhook ID: ${id}`);
};

window.triggerWebhooks = async function (eventType, data) {
    const activeHooks = APP_STATE.webhooks.filter(h => h.status === 'active' && h.events.includes(eventType));

    if (activeHooks.length === 0) return;

    console.log(`Triggering ${activeHooks.length} webhooks for event: ${eventType}`);

    activeHooks.forEach(hook => {
        // Log the attempt
        logActivity('Webhook Triggered', `${eventType} -> ${hook.url}`);

        // In a real SaaS, this would be a server-side fetch.
        // We simulate it here and show it in the logs.
        setTimeout(() => {
            const logEntry = {
                timestamp: Date.now(),
                subject: 'Webhook Executed',
                details: `POST ${hook.url} [${eventType}]`,
                status: 'Success'
            };
            APP_STATE.activityLog.unshift(logEntry);
            renderLogs();
            renderActivityLog();
        }, 500);
    });
};
