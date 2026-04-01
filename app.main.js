document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Input & Chat
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatWindow = document.getElementById('chat-window');
    const welcomeScreen = document.getElementById('welcome-screen');
    const historyList = document.getElementById('history-list');

    // DOM Elements - Sidebar & Header
    const newChatBtn = document.getElementById('new-chat-btn');
    const clearChatsBtn = document.getElementById('clear-chats-btn');
    const themeSwitch = document.getElementById('theme-toggle-switch');
    const exportBtn = document.getElementById('export-btn');
    const exportMenu = document.getElementById('export-menu');

    // DOM Elements - Orchestration Panel
    const orchStatusPanel = document.getElementById('orchestration-status');
    const statusText = document.getElementById('status-text');
    const metricModels = document.getElementById('metric-models');
    const metricResponses = document.getElementById('metric-responses');
    const modelCheckboxes = document.querySelectorAll('.model-checkbox input');

    // Safe Storage Wrappers (prevents SecurityError on file:// protocol)
    function safeGet(key) { try { return localStorage.getItem(key); } catch(e) { return null; } }
    function safeSet(key, val) { try { localStorage.setItem(key, val); } catch(e) { console.warn("Storage blocked."); } }

    // State Variables
    let currentSessionId = null;
    let sessions = [];
    try {
        sessions = JSON.parse(safeGet('chatfusion_sessions')) || [];
    } catch(e) {
        console.warn("Corrupted session data! Clearing cache...");
        try { localStorage.removeItem('chatfusion_sessions'); } catch(err) {}
    }
    let isWaitingForResponse = false;
    let activeModelsCount = 5;

    // ----- Initialization -----
    renderHistoryList();
    if (sessions.length === 0) startNewChat();
    updateModelMetrics();
    sendBtn.disabled = chatInput.value.trim().length === 0;

    // ----- Theme Management -----
    let savedTheme = safeGet('chatfusion_theme') || 'light';
    
    // Set initial state based on saved theme
    if (savedTheme === 'dark') {
        themeSwitch.checked = true;
        setTheme('dark');
    } else {
        themeSwitch.checked = false;
        setTheme('light');
    }

    themeSwitch.addEventListener('change', (e) => {
        if (e.target.checked) {
            setTheme('dark');
        } else {
            setTheme('light');
        }
    });

    function setTheme(themeName) {
        try {
            document.documentElement.setAttribute('data-theme', themeName);
            safeSet('chatfusion_theme', themeName);
        } catch(e) {
            console.error("Theme toggle error:", e);
        }
    }

    // ----- Export Menu -----
    exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportMenu.classList.toggle('show');
    });

    document.addEventListener('click', () => {
        if (exportMenu.classList.contains('show')) exportMenu.classList.remove('show');
    });

    exportMenu.querySelectorAll('.export-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const type = e.target.getAttribute('data-type');
            exportChat(type);
        });
    });

    // ----- UI Interaction & Shortcuts -----
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        sendBtn.disabled = this.value.trim().length === 0;
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'k') { e.preventDefault(); startNewChat(); }
        if (e.ctrlKey && e.shiftKey && e.key === 'C') { e.preventDefault(); clearAllChats(); }
    });

    sendBtn.addEventListener('click', sendMessage);
    newChatBtn.addEventListener('click', startNewChat);
    clearChatsBtn.addEventListener('click', clearAllChats);

    // Dynamic model tracking
    modelCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            updateModelMetrics();
        });
    });

    function updateModelMetrics() {
        const checked = Array.from(modelCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
        activeModelsCount = checked.length;
        metricModels.textContent = `Active Models: ${activeModelsCount}`;
        
        if (activeModelsCount === 0) {
            orchStatusPanel.classList.remove('hidden');
            statusText.textContent = "Warning: No models selected";
            orchStatusPanel.querySelector('.status-dot').classList.remove('pulsing');
            orchStatusPanel.querySelector('.status-dot').style.backgroundColor = '#ef4444'; // red
        } else if (!isWaitingForResponse) {
            orchStatusPanel.classList.add('hidden');
        }
    }

    // ----- Chat Orchestration Logic -----
    async function sendMessage() {
        if (isWaitingForResponse) return;
        const question = chatInput.value.trim();
        if (!question) return;

        const selectedModels = Array.from(modelCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
        
        if (selectedModels.length === 0) {
            alert("Please activate at least one model before sending a message.");
            return;
        }

        isWaitingForResponse = true;

        // Session creation mapping
        if (!currentSessionId) {
            currentSessionId = Date.now().toString();
            sessions.unshift({ id: currentSessionId, title: question, messages: [] });
            saveSessions();
            renderHistoryList();
        } else {
            const session = sessions.find(s => s.id === currentSessionId);
            if (session && session.messages.length === 0) {
                session.title = question;
                saveSessions();
                renderHistoryList();
            }
        }

        if (welcomeScreen) welcomeScreen.style.display = 'none';

        appendUserMessage(question);
        
        chatInput.value = '';
        chatInput.style.height = 'auto';
        chatInput.disabled = true;
        sendBtn.disabled = true;

        const loadingId = appendLoading();
        
        // Orchestration UI sequence
        orchStatusPanel.classList.remove('hidden');
        const sDot = orchStatusPanel.querySelector('.status-dot');
        sDot.style.backgroundColor = '';
        sDot.classList.add('pulsing');
        
        statusText.textContent = "Orchestrating... dispatching query to active models";
        metricResponses.textContent = `Responses Collected: 0/${activeModelsCount}`;

        // Fake progressive loading visual for the status panel
        let simCount = 0;
        const simInterval = setInterval(() => {
            if (simCount < activeModelsCount - 1) {
                simCount++;
                metricResponses.textContent = `Responses Collected: ${simCount}/${activeModelsCount}`;
                statusText.textContent = "Orchestrating... evaluating responses";
            }
        }, 400);

        try {
            const response = await fetch('http://localhost:3000/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: question, activeModels: selectedModels })
            });

            if (!response.ok) throw new Error("Server Error");

            const data = await response.json();
            
            clearInterval(simInterval);
            metricResponses.textContent = `Responses Collected: ${selectedModels.length}/${activeModelsCount}`;
            statusText.textContent = "Final response generated successfully";
            sDot.classList.remove('pulsing');
            
            removeMessage(loadingId);
            appendAIResponse(data);
            saveToCurrentSession(question, data);

        } catch (error) {
            console.error(error);
            clearInterval(simInterval);
            removeMessage(loadingId);
            appendGenericMessage('error', "Orchestration Failed. Ensure backend is running.");
            statusText.textContent = "Orchestration Error";
            sDot.classList.remove('pulsing');
            sDot.style.backgroundColor = '#ef4444';
        } finally {
            chatInput.disabled = false;
            isWaitingForResponse = false;
            sendBtn.disabled = chatInput.value.trim().length === 0;
            chatInput.focus();
            
            setTimeout(() => {
                if (!isWaitingForResponse && activeModelsCount > 0) {
                    orchStatusPanel.classList.add('hidden');
                }
            }, 3000);
        }
    }

    // ----- Message Rendering -----
    function appendUserMessage(text) {
        appendGenericMessage('user', text);
    }

    function appendGenericMessage(type, text) {
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${type}`;
        
        let style = type === 'error' ? 'color: #ef4444; border: 1px solid #ef4444;' : '';
        wrapper.innerHTML = `<div class="message" style="${style}">${escapeHtml(text)}</div>`;
        
        chatWindow.appendChild(wrapper);
        scrollToBottom();
    }

    function appendAIResponse(data) {
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ai`;
        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let html = `<div class="message">`;
        
        // Header
        html += `
            <div class="ai-header">
                <span class="ai-header-title">ChatFusion Orchestration Engine</span>
                <span class="msg-timestamp">${timeString}</span>
            </div>`;

        // 3. Final Output
        if (data.final) {
            let finalHtmlContent = escapeHtml(data.final);
            
            // If marked.js is loaded successfully, parse the markdown securely
            if (typeof marked !== 'undefined') {
                finalHtmlContent = marked.parse(data.final, { breaks: true, gfm: true });
            } else {
                // Fallback to basic html lines
                finalHtmlContent = `<p style="margin-top: 8px;">${finalHtmlContent}</p>`;
            }

            html += `
            <div class="final-synthesized">
                <div class="markdown-body" style="margin-top: 8px;">${finalHtmlContent}</div>
                <div class="response-footer">
                    <span class="confidence-score">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        ${data.confidenceScore}% Confidence
                    </span>
                    <button class="copy-btn" onclick="copyText(this.parentElement.previousElementSibling.innerText, this)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        Copy
                    </button>
                </div>
            </div>`;
        }

        html += `</div>`;
        wrapper.innerHTML = html;
        chatWindow.appendChild(wrapper);
        scrollToBottom();
    }

    function appendLoading() {
        const id = 'loading-' + Date.now();
        const wrapper = document.createElement('div');
        wrapper.id = id;
        wrapper.className = `message-wrapper ai`;
        wrapper.innerHTML = `
            <div class="message">
                <div class="loading">
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                </div>
            </div>`;
        chatWindow.appendChild(wrapper);
        scrollToBottom();
        return id;
    }

    function removeMessage(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function scrollToBottom() {
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    // ----- Exporters -----
    window.copyText = function(text, btn) {
        navigator.clipboard.writeText(text).then(() => {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = 'Copied!';
            setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
        });
    };

    function exportChat(format) {
        if (!currentSessionId) return alert("Select an active chat to export.");
        const session = sessions.find(s => s.id === currentSessionId);
        if (!session || session.messages.length === 0) return alert("No messages to export.");

        let content = '';
        let mimeType = '';
        let filename = `ChatFusion_${session.title.replace(/\s+/g, '_')}`;

        if (format === 'json') {
            content = JSON.stringify(session, null, 2);
            mimeType = 'application/json';
            filename += '.json';
        } else {
            mimeType = 'text/plain';
            filename += '.txt';
            content = `ChatFusion Export: ${session.title}\nDate: ${new Date().toLocaleString()}\n\n`;
            session.messages.forEach(msg => {
                if (msg.type === 'user') {
                    content += `[USER]\n${msg.text}\n\n`;
                } else {
                    content += `[CHATFUSION ORCHESTRATION]\n`;
                    if (msg.data.ranking) {
                        content += `>> Ranking:\n`;
                        msg.data.ranking.forEach(r => content += `  ${r.rank}. ${r.model}\n`);
                    }
                    if (msg.data.final) {
                        content += `>> Synthesized Result (Confidence: ${msg.data.confidenceScore}%):\n${msg.data.final}\n\n`;
                    }
                }
            });
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
    }

    // ----- History Management -----
    function startNewChat() {
        currentSessionId = null;
        chatWindow.innerHTML = '';
        if (welcomeScreen) {
            chatWindow.appendChild(welcomeScreen);
            welcomeScreen.style.display = 'flex';
        }
        renderHistoryList();
        chatInput.focus();
    }

    function clearAllChats() {
        if (confirm("Are you sure you want to clear ALL chat history?")) {
            sessions = [];
            saveSessions();
            startNewChat();
        }
    }

    function saveToCurrentSession(question, aiData) {
        const session = sessions.find(s => s.id === currentSessionId);
        if (session) {
            session.messages.push({ type: 'user', text: question });
            session.messages.push({ type: 'ai', data: aiData });
            saveSessions();
        }
    }

    function saveSessions() {
        safeSet('chatfusion_sessions', JSON.stringify(sessions));
    }

    function renderHistoryList() {
        historyList.innerHTML = '';
        sessions.forEach(session => {
            const item = document.createElement('div');
            item.className = 'history-item';
            if (session.id === currentSessionId) item.classList.add('active');
            
            item.innerHTML = `
                <div class="title" title="${escapeHtml(session.title)}">${escapeHtml(session.title)}</div>
                <div class="actions">
                    <button class="action-btn rename-btn" title="Rename"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>
                    <button class="action-btn delete-btn" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                </div>
            `;

            item.querySelector('.title').addEventListener('click', () => loadSession(session.id));
            
            item.querySelector('.rename-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const newTitle = prompt("Enter new chat name:", session.title);
                if (newTitle && newTitle.trim()) {
                    session.title = newTitle.trim();
                    saveSessions();
                    renderHistoryList();
                }
            });

            item.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm("Delete this chat?")) {
                    sessions = sessions.filter(s => s.id !== session.id);
                    saveSessions();
                    if (currentSessionId === session.id) startNewChat();
                    else renderHistoryList();
                }
            });

            historyList.appendChild(item);
        });
    }

    function loadSession(id) {
        currentSessionId = id;
        const session = sessions.find(s => s.id === id);
        if (!session) return;

        chatWindow.innerHTML = '';
        
        session.messages.forEach(msg => {
            if (msg.type === 'user') appendUserMessage(msg.text);
            else if (msg.type === 'ai') appendAIResponse(msg.data);
        });

        renderHistoryList();
        scrollToBottom();
    }

    // ----- Helpers -----
    function escapeHtml(unsafe) {
        return (unsafe || '').toString()
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;")
             .replace(/\n/g, "<br>");
    }
});
