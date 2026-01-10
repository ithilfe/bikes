// GitHub API Configuration
let GITHUB_TOKEN = '';
let GITHUB_OWNER = '';
let GITHUB_REPO = '';
let GITHUB_API_BASE = '';

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
const githubTokenInput = document.getElementById('github-token');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const usernameSpan = document.getElementById('username');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('--- Application Initializing ---');
    // Check for stored token
    const storedToken = localStorage.getItem('github_token');
    if (storedToken) {
        githubTokenInput.value = storedToken;
        console.log('Found stored token, attempting to authenticate.');
        authenticateUser();
    } else {
        console.log('No stored token found.');
    }

    // Event listeners
    if (loginBtn) loginBtn.addEventListener('click', authenticateUser);
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    console.log('Login/Logout listeners attached.');

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    console.log('Tab switching listeners attached.');

    // Modal handling
    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('message-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('message-modal')) {
            closeModal();
        }
    });
    console.log('Modal listeners attached.');

    // Extract repository info from current URL
    extractRepositoryInfo();
    console.log('--- Initialization Complete ---');
});

function extractRepositoryInfo() {
    console.log('Attempting to extract repository info...');
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;

    if (hostname.includes('github.io')) {
        // Extract from GitHub Pages URL format: username.github.io/repository-name
        const parts = hostname.split('.');
        GITHUB_OWNER = parts[0];

        // Repository name from pathname
        const pathParts = pathname.split('/').filter(part => part);
        GITHUB_REPO = pathParts[0] || 'blog';

        GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

        console.log(`✅ Detected repository: ${GITHUB_OWNER}/${GITHUB_REPO}`);
        console.log(`API Base: ${GITHUB_API_BASE}`);
    } else {
        // Local development or other hosting
        console.warn('⚠️ Could not auto-detect repository. Please configure manually.');
    }
}

async function authenticateUser() {
    console.log('--- Authenticating User ---');
    const token = githubTokenInput.value.trim();

    if (!token) {
        console.error('Authentication failed: Token is empty.');
        showNotification('Please enter your GitHub Personal Access Token', 'error');
        return;
    }

    if (!GITHUB_API_BASE) {
        console.error('Authentication failed: Repository API base is not set.');
        showNotification('Repository information not detected. Please check the URL.', 'error');
        return;
    }
    
    // NOTE: Do not log the full token for security reasons.
    console.log('Token present. Verifying user against GitHub API...');

    try {
        // Verify token and get user info
        const response = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            console.error(`GitHub /user request failed with status: ${response.status}`);
            throw new Error('Invalid GitHub token');
        }

        const user = await response.json();
        console.log(`✅ Token verified. User: ${user.login}`);

        // Store token and user info
        GITHUB_TOKEN = token;
        localStorage.setItem('github_token', token);

        // Update UI
        authSection.style.display = 'none';
        userInfo.style.display = 'flex';
        mainContent.style.display = 'block';
        usernameSpan.textContent = user.login;
        console.log('UI updated for authenticated user.');

        showNotification(`Connected as ${user.login}`, 'success');

        // Load initial data
        await loadAllMessages();

    } catch (error) {
        showNotification('Authentication failed. Please check your token.', 'error');
        console.error('❌ Authentication error:', error.message, error);
    }
}

function logout() {
    console.log('--- Logging Out ---');
    GITHUB_TOKEN = '';
    localStorage.removeItem('github_token');
    console.log('Token removed from memory and localStorage.');

    authSection.style.display = 'flex';
    userInfo.style.display = 'none';
    mainContent.style.display = 'none';
    githubTokenInput.value = '';
    console.log('UI reset to login state.');

    showNotification('Logged out successfully', 'success');
}

async function loadAllMessages() {
    console.log('--- Loading All Messages ---');
    try {
        // Load all message types
        const [pending, approved, published] = await Promise.all([
            loadMessages('pending-messages.json'),
            loadMessages('approved-messages.json'),
            loadMessages('published-messages.json')
        ]);

        currentMessages.pending = (pending && pending.messages) || [];
        currentMessages.approved = (approved && approved.messages) || [];
        currentMessages.published = (published && published.messages) || [];
        console.log(`Loaded messages: Pending=${currentMessages.pending.length}, Approved=${currentMessages.approved.length}, Published=${currentMessages.published.length}`);

        updateStats();
        renderMessages();
        console.log('Message stats and rendering updated.');

    } catch (error) {
        showNotification('Failed to load messages', 'error');
        console.error('❌ Load messages error:', error);
    }
}

async function loadMessages(filename) {
    console.log(`Fetching file: ${filename}`);
    const response = await fetch(`${GITHUB_API_BASE}/contents/data/${filename}`, {
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });

    if (!response.ok) {
        if (response.status === 404) {
            console.warn(`File not found (404): ${filename}. Returning empty array.`);
            return { messages: [], lastUpdated: new Date().toISOString(), version: "1.0" };
        }
        console.error(`Failed to load ${filename}. Status: ${response.status}`);
        throw new Error(`Failed to load ${filename}`);
    }

    const data = await response.json();
    const content = atob(data.content);
    console.log(`Successfully loaded and decoded ${filename}.`);
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && 'messages' in parsed) {
        return parsed;
    }
    return { messages: [], lastUpdated: new Date().toISOString(), version: "1.0" };
}

function updateStats() {
    // ... (unchanged)
    document.getElementById('pending-count').textContent = currentMessages.pending.length;
    document.getElementById('approved-count').textContent = currentMessages.approved.length;
    document.getElementById('published-count').textContent = currentMessages.published.length;

    document.getElementById('pending-tab-count').textContent = currentMessages.pending.length;
    document.getElementById('approved-tab-count').textContent = currentMessages.approved.length;
    document.getElementById('published-tab-count').textContent = currentMessages.published.length;
    console.log(`Stats updated. Pending: ${currentMessages.pending.length}`);
}

function renderMessages() {
    console.log('Rendering all message lists.');
    renderMessageList('pending', currentMessages.pending);
    renderMessageList('approved', currentMessages.approved);
    renderMessageList('published', currentMessages.published);
}

function renderMessageList(type, messages) {
    console.log(`Rendering ${messages.length} messages for type: ${type}`);
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
            <div class="message-meta">
                ${message.tags ? message.tags.map(tag => `<span class="tag">${tag}</span>`).join('') : ''}
                ${message.images && message.images.length > 0 ? `<span class="image-count">${message.images.length} image(s)</span>` : ''}
            </div>
        </div>
    `).join('');
}

function showMessageDetails(messageId, type) {
    console.log(`Showing details for Message ID: ${messageId} (Type: ${type})`);
    const message = currentMessages[type].find(m => m.id === messageId);
    if (!message) {
        console.error(`Message ID ${messageId} not found in ${type} list.`);
        return;
    }

    const modal = document.getElementById('message-modal');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');

    // Populate modal content
    // ... (modal body HTML generation)
    modalBody.innerHTML = `
        <div class="form-group">
            <label>Message ID:</label>
            <input type="text" value="${message.id}" readonly>
        </div>
        <div class="form-group">
            <label>Date:</label>
            <input type="text" value="${formatDate(message.timestamp)}" readonly>
        </div>
        <div class="form-group">
            <label>Content:</label>
            <textarea rows="6" readonly>${message.content}</textarea>
        </div>
        ${message.images && message.images.length > 0 ? `
            <div class="form-group">
                <label>Images:</label>
                ${message.images.map(img => `
                    <div>📷 ${img.filename} ${img.caption ? `- ${img.caption}` : ''}</div>
                `).join('')}
            </div>
        ` : ''}
        ${type === 'pending' ? `
            <div class="form-group">
                <label>Tags (comma-separated):</label>
                <input type="text" id="message-tags" placeholder="tag1, tag2, tag3">
            </div>
        ` : ''}
        ${message.tags ? `
            <div class="form-group">
                <label>Current Tags:</label>
                <div>${message.tags.map(tag => `<span class="tag">${tag}</span>`).join(' ')}</div>
            </div>
        ` : ''}
    `;

    // Populate modal footer based on message type
    if (type === 'pending') {
        console.log('Populating modal with Approve/Reject actions.');
        modalFooter.innerHTML = `
            <button class="btn-approve" onclick="approveMessage('${messageId}')">✅ Approve</button>
            <button class="btn-reject" onclick="rejectMessage('${messageId}')">❌ Reject</button>
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
        `;
    } else {
        console.log('Populating modal with Close action (not pending).');
        modalFooter.innerHTML = `
            <button class="btn-secondary" onclick="closeModal()">Close</button>
        `;
    }

    modal.style.display = 'block';
    console.log('Message detail modal displayed.');
}

async function approveMessage(messageId) {
    console.log(`--- Approving Message ID: ${messageId} ---`);
    try {
        const message = currentMessages.pending.find(m => m.id === messageId);
        if (!message) {
            console.error(`Cannot approve: Message ID ${messageId} not found in pending list.`);
            return;
        }

        // Get tags from input
        const tagsInput = document.getElementById('message-tags');
        const tags = tagsInput ? tagsInput.value.split(',').map(t => t.trim()).filter(t => t) : [];

        // Update message
        message.status = 'approved';
        message.approved_at = new Date().toISOString();
        message.tags = tags;
        console.log(`Message updated. Tags: ${tags.join(', ')}`);

        // Move from pending to approved
        currentMessages.pending = currentMessages.pending.filter(m => m.id !== messageId);
        currentMessages.approved.push(message);
        console.log(`Message moved from pending to approved lists.`);

        // Save changes
        await saveMessages('pending-messages.json', currentMessages.pending);
        await saveMessages('approved-messages.json', currentMessages.approved);

        // Trigger site rebuild
        await triggerSiteRebuild();

        updateStats();
        renderMessages();
        closeModal();

        showNotification(`Message ${messageId} approved successfully`, 'success');
        console.log(`✅ Message ${messageId} successfully approved and saved.`);

    } catch (error) {
        showNotification('Failed to approve message', 'error');
        console.error('❌ Approve message error:', error);
    }
}

async function rejectMessage(messageId) {
    console.log(`--- Rejecting Message ID: ${messageId} ---`);
    try {
        const message = currentMessages.pending.find(m => m.id === messageId);
        if (!message) {
            console.error(`Cannot reject: Message ID ${messageId} not found in pending list.`);
            return;
        }

        // Update message
        message.status = 'rejected';
        message.rejected_at = new Date().toISOString();
        console.log('Message status set to rejected.');

        // Move from pending to rejected (we'll store in rejected file)
        currentMessages.pending = currentMessages.pending.filter(m => m.id !== messageId);

        // Save rejected message
        const rejectedData = await loadMessages('rejected-messages.json');
        rejectedData.messages.push(message);
        console.log(`Message moved from pending list. Total rejected messages (before save): ${rejectedData.messages.length}`);


        await saveMessages('pending-messages.json', currentMessages.pending);
        await saveMessages('rejected-messages.json', rejectedData.messages);

        updateStats();
        renderMessages();
        closeModal();

        showNotification(`Message ${messageId} rejected`, 'success');
        console.log(`✅ Message ${messageId} successfully rejected and saved.`);

    } catch (error) {
        showNotification('Failed to reject message', 'error');
        console.error('❌ Reject message error:', error);
    }
}

async function saveMessages(filename, messages) {
    console.log(`--- Saving File: ${filename} (Total messages: ${messages.length}) ---`);
    const data = {
        messages: messages,
        lastUpdated: new Date().toISOString(),
        version: "1.0"
    };

    const content = btoa(JSON.stringify(data, null, 2));

    // Get current file (for SHA)
    let sha = null;
    try {
        console.log(`Attempting to get current SHA for ${filename}.`);
        const response = await fetch(`${GITHUB_API_BASE}/contents/data/${filename}`, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (response.ok) {
            const data = await response.json();
            sha = data.sha;
            console.log(`Found existing SHA: ${sha}`);
        } else if (response.status === 404) {
             console.log(`File ${filename} not found (404), proceeding with creation.`);
        }
    } catch (e) {
        console.warn(`Error while fetching SHA for ${filename}: ${e.message}`);
        // File might not exist yet
    }

    // Update file
    console.log(`Submitting PUT request to update/create ${filename}.`);
    const updateResponse = await fetch(`${GITHUB_API_BASE}/contents/data/${filename}`, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: `Update ${filename}`,
            content: content,
            sha: sha
        })
    });

    if (!updateResponse.ok) {
        console.error(`❌ Failed to save ${filename}. Status: ${updateResponse.status}`);
        throw new Error(`Failed to save ${filename}`);
    }
    console.log(`✅ Successfully saved/updated ${filename}.`);
}

async function triggerSiteRebuild() {
    console.log('Attempting to trigger site rebuild via repository dispatch...');
    try {
        const response = await fetch(`${GITHUB_API_BASE}/dispatches`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                event_type: 'rebuild-site'
            })
        });

        if (response.ok || response.status === 204) { // 204 No Content is common for dispatches
            showNotification('Site rebuild triggered', 'success');
            console.log('✅ Site rebuild *trigger* successful.');
        } else {
            const errorText = await response.text();
             throw new Error(`Status ${response.status}: ${errorText}`);
        }

    } catch (error) {
        console.warn('⚠️ Could not trigger rebuild (check GitHub Actions workflow):', error);
        // Non-critical error
    }
}

function switchTab(tabName) {
    console.log(`Switching to tab: ${tabName}`);
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `${tabName}-panel`);
    });
}

function closeModal() {
    console.log('Closing message details modal.');
    document.getElementById('message-modal').style.display = 'none';
}

function showNotification(message, type = 'info') {
    // ... (unchanged)
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    document.getElementById('notifications').appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Utility functions
function formatDate(dateString) {
    // ... (unchanged)
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function truncateText(text, maxLength) {
    // ... (unchanged)
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Refresh data every 30 seconds
setInterval(() => {
    if (GITHUB_TOKEN) {
        console.log('--- Auto-refreshing data ---');
        loadAllMessages();
    }
}, 30000);