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
const usernameSpan = document.getElementById('username');
const authMethodSpan = document.getElementById('auth-method');
const tokenIndicator = document.getElementById('token-indicator');

// Login Elements
const adminUsernameInput = document.getElementById('admin-username');
const adminPasswordInput = document.getElementById('admin-password');
const loginBtn = document.getElementById('login-btn');
const githubTokenDirectInput = document.getElementById('github-token-direct');
const githubLoginBtn = document.getElementById('github-login-btn');
const logoutBtn = document.getElementById('logout-btn');

// Token Modal Elements
const tokenModal = document.getElementById('token-modal');
const manageTokenBtn = document.getElementById('manage-token-btn');
const syncKeyInput = document.getElementById('sync-key-input');
const saveTokenBtn = document.getElementById('save-token-btn');
const closeTokenModalBtn = document.getElementById('close-token-modal');
const cancelTokenBtn = document.getElementById('cancel-token-btn');

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    console.log('--- Application Initializing ---');
    
    // 1. Load configuration
    await loadConfig();
    
    // 2. Extract repository info
    extractRepositoryInfo();

    // 3. Check for stored session
    const session = localStorage.getItem('admin_session');
    if (session) {
        const sessionData = JSON.parse(session);
        completeLoginUI(sessionData.username, sessionData.method);
        
        // Also load token if available, falling back to what was set in loadConfig
        GITHUB_TOKEN = localStorage.getItem('github_token') || GITHUB_TOKEN;
        updateTokenIndicator();
        
        await loadAllMessages();
    }

    // Event listeners
    if (loginBtn) loginBtn.addEventListener('click', loginWithUserList);
    if (githubLoginBtn) githubLoginBtn.addEventListener('click', loginWithGitHubToken);
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Modal handling
    document.getElementById('close-modal').addEventListener('click', closeModal);
    
    // Token management
    if (manageTokenBtn) manageTokenBtn.addEventListener('click', () => {
        syncKeyInput.value = GITHUB_TOKEN;
        tokenModal.style.display = 'block';
    });
    if (closeTokenModalBtn) closeTokenModalBtn.addEventListener('click', () => tokenModal.style.display = 'none');
    if (cancelTokenBtn) cancelTokenBtn.addEventListener('click', () => tokenModal.style.display = 'none');
    if (saveTokenBtn) saveTokenBtn.addEventListener('click', saveToken);

    console.log('--- Initialization Complete ---');
});

async function loadConfig() {
    try {
        const response = await fetch('config.json');
        if (response.ok) {
            ADMIN_CONFIG = await response.json();
            console.log('Admin configuration loaded.');
            
            // Check if a GitHub token was provided via secrets
            if (ADMIN_CONFIG.github_token) {
                GITHUB_TOKEN = ADMIN_CONFIG.github_token;
                console.log('GitHub token loaded from configuration.');
            }
            
            // Update Google Client ID in the DOM
            if (ADMIN_CONFIG.google_client_id) {
                const googleLoader = document.getElementById('g_id_onload');
                if (googleLoader) {
                    googleLoader.setAttribute('data-client_id', ADMIN_CONFIG.google_client_id);
                }
            } else {
                const googleContainer = document.getElementById('google-login-container');
                const divider = document.querySelector('.divider');
                if (googleContainer) googleContainer.style.display = 'none';
                if (divider) divider.style.display = 'none';
            }
        }
    } catch (error) {
        console.warn('Could not load config.json, using defaults.', error);
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
        // Default or local dev
        GITHUB_OWNER = 'OWNER';
        GITHUB_REPO = 'REPO';
    }
    GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
    console.log(`Repository: ${GITHUB_OWNER}/${GITHUB_REPO}`);
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
    
    if (ADMIN_CONFIG.allowed_emails && ADMIN_CONFIG.allowed_emails.includes(email)) {
        completeLogin(email, 'Google');
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

async function loginWithUserList() {
    const username = adminUsernameInput.value.trim();
    const password = adminPasswordInput.value.trim();

    if (!username || !password) {
        showNotification('Please enter username and password', 'error');
        return;
    }

    const passwordHash = await sha256(password);
    const user = (ADMIN_CONFIG.users || []).find(u => u.username === username && u.password_hash === passwordHash);
    
    if (user) {
        completeLogin(user.username, 'Password');
    } else {
        showNotification('Invalid username or password', 'error');
    }
}

async function loginWithGitHubToken() {
    const token = githubTokenDirectInput.value.trim();
    if (!token) {
        showNotification('Please enter a GitHub Token', 'error');
        return;
    }

    try {
        const response = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `token ${token}` }
        });
        if (response.ok) {
            const user = await response.json();
            GITHUB_TOKEN = token;
            localStorage.setItem('github_token', token);
            completeLogin(user.login, 'GitHub');
        } else {
            showNotification('Invalid GitHub Token', 'error');
        }
    } catch (e) {
        showNotification('Failed to verify token', 'error');
    }
}

function completeLogin(username, method) {
    localStorage.setItem('admin_session', JSON.stringify({
        username: username,
        method: method
    }));

    completeLoginUI(username, method);
    
    // Try to recover token
    GITHUB_TOKEN = localStorage.getItem('github_token') || '';
    updateTokenIndicator();

    showNotification(`Welcome, ${username}`, 'success');
    loadAllMessages();
    
    // If no token, prompt to add one
    if (!GITHUB_TOKEN && method !== 'GitHub') {
        setTimeout(() => {
            if (confirm('You are logged in, but you need a Sync Key (GitHub Token) to save changes. Would you like to add one now?')) {
                tokenModal.style.display = 'block';
            }
        }, 1000);
    }
}

function completeLoginUI(username, method) {
    usernameSpan.textContent = username;
    authMethodSpan.textContent = `(via ${method})`;
    authSection.style.display = 'none';
    userInfo.style.display = 'flex';
    mainContent.style.display = 'block';
}

function updateTokenIndicator() {
    if (GITHUB_TOKEN) {
        tokenIndicator.textContent = '✅ Sync Active';
        tokenIndicator.className = 'indicator active';
        manageTokenBtn.textContent = 'Update Sync Key';
    } else {
        tokenIndicator.textContent = '❌ Sync Disabled (Read-only)';
        tokenIndicator.className = 'indicator inactive';
        manageTokenBtn.textContent = 'Add Sync Key';
    }
}

function saveToken() {
    const token = syncKeyInput.value.trim();
    if (token) {
        GITHUB_TOKEN = token;
        localStorage.setItem('github_token', token);
        showNotification('Sync Key saved', 'success');
    } else {
        GITHUB_TOKEN = '';
        localStorage.removeItem('github_token');
        showNotification('Sync Key removed', 'info');
    }
    updateTokenIndicator();
    tokenModal.style.display = 'none';
    loadAllMessages(); // Reload to use the token for API calls
}

function logout() {
    GITHUB_TOKEN = '';
    localStorage.removeItem('admin_session');
    // We keep github_token in localStorage for convenience, or remove it for security?
    // Let's keep it but the session is gone.
    
    authSection.style.display = 'block';
    userInfo.style.display = 'none';
    mainContent.style.display = 'none';
    adminUsernameInput.value = '';
    adminPasswordInput.value = '';
    githubTokenDirectInput.value = '';
    showNotification('Logged out', 'success');
}

async function loadAllMessages() {
    const loadingEl = document.querySelector('.loading');
    if (loadingEl) loadingEl.style.display = 'block';

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
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

async function loadMessages(filename) {
    // Try GitHub API first if token is available
    if (GITHUB_TOKEN) {
        try {
            const response = await fetch(`${GITHUB_API_BASE}/contents/data/${filename}`, {
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                const content = decodeURIComponent(escape(atob(data.content)));
                const parsed = JSON.parse(content);
                return parsed;
            }
        } catch (e) {
            console.warn(`API fetch failed for ${filename}, trying fallback.`);
        }
    }
    
    // Fallback to direct fetch
    try {
        const response = await fetch(`../../data/${filename}?t=${Date.now()}`);
        if (response.ok) {
            return await response.json();
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
    if (!messages || messages.length === 0) {
        container.innerHTML = `<div class="empty-state">No ${type} messages</div>`;
        return;
    }
    container.innerHTML = messages.map(message => `
        <div class="message-card" onclick="showMessageDetails('${message.id}', '${type}')">
            <div class="message-header">
                <span class="message-id">#${message.id.substring(0, 8)}</span>
                <span class="message-date">${formatDate(message.timestamp)}</span>
            </div>
            <div class="message-preview">${truncateText(message.content, 150)}</div>
            <div class="message-footer">
                ${message.tags ? message.tags.map(t => `<span class="tag-pill">${t}</span>`).join('') : ''}
            </div>
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
        <div class="form-group">
            <label>Content:</label>
            <textarea rows="8" readonly>${message.content}</textarea>
        </div>
        ${message.images ? `
            <div class="image-previews">
                ${message.images.map(img => `<img src="../images/${img.filename}" class="preview-img">`).join('')}
            </div>
        ` : ''}
        ${type === 'pending' ? `
            <div class="form-group">
                <label>Tags (comma separated):</label>
                <input type="text" id="message-tags" placeholder="news, update, cycling">
            </div>
        ` : `
            <div class="form-group">
                <label>Tags:</label>
                <div class="tags-list">${message.tags ? message.tags.map(t => `<span class="tag-pill">${t}</span>`).join('') : 'None'}</div>
            </div>
        `}
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
        showNotification('Sync Key required to save changes. Click "Add Sync Key" at the top.', 'error');
        return;
    }
    
    const message = currentMessages.pending.find(m => m.id === messageId);
    const tagsInput = document.getElementById('message-tags');
    const tags = tagsInput ? tagsInput.value.split(',').map(t => t.trim()).filter(t => t) : [];

    // Local update
    message.status = 'approved';
    message.tags = tags;
    const newPending = currentMessages.pending.filter(m => m.id !== messageId);
    const newApproved = [...currentMessages.approved, message];

    try {
        showNotification('Saving changes...', 'info');
        await saveMessages('pending-messages.json', newPending);
        await saveMessages('approved-messages.json', newApproved);
        
        currentMessages.pending = newPending;
        currentMessages.approved = newApproved;
        
        updateStats();
        renderMessages();
        closeModal();
        showNotification('Message approved and saved!', 'success');
    } catch (e) {
        showNotification('Error saving: ' + e.message, 'error');
    }
}

async function rejectMessage(messageId) {
    if (!GITHUB_TOKEN) {
        showNotification('Sync Key required to save changes', 'error');
        return;
    }
    
    const message = currentMessages.pending.find(m => m.id === messageId);
    const newPending = currentMessages.pending.filter(m => m.id !== messageId);
    
    try {
        showNotification('Rejecting message...', 'info');
        const rejectedData = await loadMessages('rejected-messages.json');
        const newRejected = [...(rejectedData.messages || []), message];
        
        await saveMessages('pending-messages.json', newPending);
        await saveMessages('rejected-messages.json', newRejected);
        
        currentMessages.pending = newPending;
        updateStats();
        renderMessages();
        closeModal();
        showNotification('Message rejected', 'success');
    } catch (e) {
        showNotification('Error saving: ' + e.message, 'error');
    }
}

async function saveMessages(filename, messages) {
    const data = { 
        messages, 
        lastUpdated: new Date().toISOString(), 
        version: "1.0" 
    };
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    let sha = null;
    
    // Get SHA
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
        body: JSON.stringify({ 
            message: `Admin: Update ${filename}`, 
            content, 
            sha 
        })
    });

    if (!updateRes.ok) {
        const err = await updateRes.json();
        throw new Error(err.message || 'Save failed');
    }
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
    const container = document.getElementById('notifications');
    container.appendChild(n);
    setTimeout(() => {
        n.style.opacity = '0';
        setTimeout(() => n.remove(), 500);
    }, 4000);
}

function formatDate(ds) { 
    return new Date(ds).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }); 
}

function truncateText(t, l) { 
    if (!t) return '';
    return t.length > l ? t.substring(0, l) + '...' : t; 
}
