// GitHub API Configuration
let GITHUB_TOKEN = '';
let GITHUB_OWNER = '';
let GITHUB_REPO = '';
let GITHUB_API_BASE = '';

// Admin Configuration (loaded from config.json)
let ADMIN_CONFIG = {
    users: [],
    allowed_emails: [],
    google_client_id: ''
};

// Application State
let currentMessages = {
    pending: [],
    approved: [],
    published: []
};

// DOM Elements
const authSection = document.getElementById('auth-section');
const userInfo = document.getElementById('user-info');
const mainContent = document.getElementById('main-content');
const usernameInput = document.getElementById('admin-username');
const passwordInput = document.getElementById('admin-password');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const usernameSpan = document.getElementById('username');

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    console.log('--- Application Initializing ---');
    
    // Load configuration
    await loadConfig();
    
    // Extract repository info
    extractRepositoryInfo();

    // Check for stored session
    const session = localStorage.getItem('admin_session');
    if (session) {
        const sessionData = JSON.parse(session);
        GITHUB_TOKEN = sessionData.github_token;
        usernameSpan.textContent = sessionData.username;
        
        authSection.style.display = 'none';
        userInfo.style.display = 'flex';
        mainContent.style.display = 'block';
        
        await loadAllMessages();
    }

    // Event listeners
    if (loginBtn) loginBtn.addEventListener('click', login);
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('message-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('message-modal')) {
            closeModal();
        }
    });

    console.log('--- Initialization Complete ---');
});

async function loadConfig() {
    try {
        const response = await fetch('config.json');
        if (response.ok) {
            ADMIN_CONFIG = await response.json();
            console.log('Admin configuration loaded.');
            
            // Update Google Client ID in the DOM
            if (ADMIN_CONFIG.google_client_id) {
                const googleLoader = document.getElementById('g_id_onload');
                if (googleLoader) {
                    googleLoader.setAttribute('data-client_id', ADMIN_CONFIG.google_client_id);
                }
            } else {
                // Hide Google login if no client ID
                const googleContainer = document.getElementById('google-login-container');
                const divider = document.querySelector('.divider');
                if (googleContainer) googleContainer.style.display = 'none';
                if (divider) divider.style.display = 'none';
            }
        }
    } catch (error) {
        console.warn('Could not load config.json, falling back to manual entry.', error);
    }
}

function extractRepositoryInfo() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;

    if (hostname.includes('github.io')) {
        const parts = hostname.split('.');
        GITHUB_OWNER = parts[0];
        const pathParts = pathname.split('/').filter(part => part);
        GITHUB_REPO = pathParts[0] || 'blog';
    } else {
        GITHUB_OWNER = 'YOUR_GITHUB_USERNAME';
        GITHUB_REPO = 'YOUR_REPO_NAME';
    }
    GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
}

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Global callback for Google Login
window.handleGoogleLogin = async function(response) {
    console.log('Google login callback received.');
    const responsePayload = decodeJwtResponse(response.credential);
    const email = responsePayload.email;
    
    console.log('Logged in as:', email);

    // Check if email is authorized
    if (ADMIN_CONFIG.allowed_emails && ADMIN_CONFIG.allowed_emails.includes(email)) {
        completeLogin(email);
    } else {
        showNotification('Email not authorized: ' + email, 'error');
    }
};

function decodeJwtResponse(token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

async function login() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        showNotification('Please enter username and password', 'error');
        return;
    }

    const passwordHash = await sha256(password);
    const user = (ADMIN_CONFIG.users || []).find(u => u.username === username && u.password_hash === passwordHash);
    
    if (user) {
        completeLogin(user.username);
    } else {
        showNotification('Invalid username or password', 'error');
    }
}

function completeLogin(username) {
    GITHUB_TOKEN = localStorage.getItem('github_token') || ''; 
    
    if (!GITHUB_TOKEN) {
        const token = prompt('Enter a GitHub Personal Access Token to allow saving changes (this will be saved in your browser):');
        if (token) {
            GITHUB_TOKEN = token;
            localStorage.setItem('github_token', token);
        }
    }

    localStorage.setItem('admin_session', JSON.stringify({
        username: username,
        github_token: GITHUB_TOKEN
    }));

    usernameSpan.textContent = username;
    authSection.style.display = 'none';
    userInfo.style.display = 'flex';
    mainContent.style.display = 'block';

    showNotification(`Welcome, ${username}`, 'success');
    loadAllMessages();
}

function logout() {
    GITHUB_TOKEN = '';
    localStorage.removeItem('admin_session');
    authSection.style.display = 'flex';
    userInfo.style.display = 'none';
    mainContent.style.display = 'none';
    usernameInput.value = '';
    passwordInput.value = '';
    showNotification('Logged out', 'success');
}

// ... (Rest of the message management functions - keeping them identical)

async function loadAllMessages() {
    try {
        const [pending, approved, published] = await Promise.all([
            loadMessages('pending-messages.json'),
            loadMessages('approved-messages.json'),
            loadMessages('published-messages.json')
        ]);

        currentMessages.pending = (pending && pending.messages) || [];
        currentMessages.approved = (approved && approved.messages) || [];
        currentMessages.published = (published && published.messages) || [];

        updateStats();
        renderMessages();
    } catch (error) {
        showNotification('Failed to load messages', 'error');
    }
}

async function loadMessages(filename) {
    if (GITHUB_TOKEN) {
        const response = await fetch(`${GITHUB_API_BASE}/contents/data/${filename}`, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            try {
                const parsed = JSON.parse(atob(data.content));
                if (parsed && typeof parsed === 'object' && 'messages' in parsed) {
                    return parsed;
                }
            } catch (e) {
                console.error('Failed to parse messages:', e);
            }
        }
    }
    
    // Fallback to direct fetch if no token or API fails (using ../.. to go up from static/admin)
    try {
        const response = await fetch(`../../data/${filename}`);
        if (response.ok) {
            const parsed = await response.json();
            if (parsed && typeof parsed === 'object' && 'messages' in parsed) {
                return parsed;
            }
        }
    } catch (e) {
        console.error('Fallback fetch failed:', e);
    }
    return { messages: [] };
}

function updateStats() {
    document.getElementById('pending-count').textContent = currentMessages.pending.length;
    document.getElementById('approved-count').textContent = currentMessages.approved.length;
    document.getElementById('published-count').textContent = currentMessages.published.length;
    document.getElementById('pending-tab-count').textContent = currentMessages.pending.length;
    document.getElementById('approved-tab-count').textContent = currentMessages.approved.length;
    document.getElementById('published-tab-count').textContent = currentMessages.published.length;
}

function renderMessages() {
    renderMessageList('pending', currentMessages.pending);
    renderMessageList('approved', currentMessages.approved);
    renderMessageList('published', currentMessages.published);
}

function renderMessageList(type, messages) {
    const container = document.getElementById(`${type}-messages`);
    if (messages.length === 0) {
        container.innerHTML = `<div class="empty-state">No ${type} messages</div>`;
        return;
    }
    container.innerHTML = messages.map(message => `
        <div class="message-card" onclick="showMessageDetails('${message.id}', '${type}')">
            <div class="message-header">
                <span class="message-id">${message.id}</span>
                <span class="message-date">${formatDate(message.timestamp)}</span>
            </div>
            <div class="message-preview">${truncateText(message.content, 150)}</div>
        </div>
    `).join('');
}

function showMessageDetails(messageId, type) {
    const message = currentMessages[type].find(m => m.id === messageId);
    if (!message) return;

    const modal = document.getElementById('message-modal');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');

    modalBody.innerHTML = `
        <div class="form-group"><label>Content:</label><textarea rows="6" readonly>${message.content}</textarea></div>
        ${type === 'pending' ? `<div class="form-group"><label>Tags:</label><input type="text" id="message-tags" placeholder="tag1, tag2"></div>` : ''}
    `;

    if (type === 'pending') {
        modalFooter.innerHTML = `
            <button class="btn-approve" onclick="approveMessage('${messageId}')">Approve</button>
            <button class="btn-reject" onclick="rejectMessage('${messageId}')">Reject</button>
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
        `;
    } else {
        modalFooter.innerHTML = `<button class="btn-secondary" onclick="closeModal()">Close</button>`;
    }
    modal.style.display = 'block';
}

async function approveMessage(messageId) {
    if (!GITHUB_TOKEN) {
        showNotification('GitHub token required to save changes', 'error');
        return;
    }
    const message = currentMessages.pending.find(m => m.id === messageId);
    const tagsInput = document.getElementById('message-tags');
    const tags = tagsInput ? tagsInput.value.split(',').map(t => t.trim()).filter(t => t) : [];

    message.status = 'approved';
    message.tags = tags;
    currentMessages.pending = currentMessages.pending.filter(m => m.id !== messageId);
    currentMessages.approved.push(message);

    try {
        await saveMessages('pending-messages.json', currentMessages.pending);
        await saveMessages('approved-messages.json', currentMessages.approved);
        updateStats();
        renderMessages();
        closeModal();
        showNotification('Approved', 'success');
    } catch (e) {
        showNotification('Error saving', 'error');
    }
}

async function rejectMessage(messageId) {
    if (!GITHUB_TOKEN) {
        showNotification('GitHub token required to save changes', 'error');
        return;
    }
    const message = currentMessages.pending.find(m => m.id === messageId);
    currentMessages.pending = currentMessages.pending.filter(m => m.id !== messageId);
    
    try {
        const rejectedData = await loadMessages('rejected-messages.json');
        rejectedData.messages = rejectedData.messages || [];
        rejectedData.messages.push(message);
        await saveMessages('pending-messages.json', currentMessages.pending);
        await saveMessages('rejected-messages.json', rejectedData.messages);
        updateStats();
        renderMessages();
        closeModal();
        showNotification('Rejected', 'success');
    } catch (e) {
        showNotification('Error saving', 'error');
    }
}

async function saveMessages(filename, messages) {
    const data = { messages, lastUpdated: new Date().toISOString(), version: "1.0" };
    const content = btoa(JSON.stringify(data, null, 2));
    let sha = null;
    
    const res = await fetch(`${GITHUB_API_BASE}/contents/data/${filename}`, {
        headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
    });
    if (res.ok) {
        const fileData = await res.json();
        sha = fileData.sha;
    }

    const updateRes = await fetch(`${GITHUB_API_BASE}/contents/data/${filename}`, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: `Update ${filename}`, content, sha })
    });

    if (!updateRes.ok) throw new Error('Save failed');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === `${tabName}-panel`));
}

function closeModal() { document.getElementById('message-modal').style.display = 'none'; }

function showNotification(message, type = 'info') {
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.textContent = message;
    document.getElementById('notifications').appendChild(n);
    setTimeout(() => n.remove(), 5000);
}

function formatDate(ds) { return new Date(ds).toLocaleString(); }
function truncateText(t, l) { return t.length > l ? t.substring(0, l) + '...' : t; }
