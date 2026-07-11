/* ================================================================
   AI HOMEWORK HELPER — script.js  (v2: Chat + Voice + Auth)
   Backend: Express /api/ask → OpenRouter
   Auth:    /api/auth/{login,register,logout,me}
================================================================ */

/* ── State ───────────────────────────────────────────────────── */
let currentPage   = 'home';
let currentUser   = null;       // { id, username, fullName, email }
let chatMessages  = [];         // [{ role, content }] — sent to API
let isRequesting  = false;
let lastAIText    = '';         // for "read last answer"

// Voice input
let recognition   = null;
let isRecording   = false;

// Voice output
let isSpeaking    = false;
let currentUtter  = null;
let activeSpeakBtn = null;

// History (session-level)
const sessionHistory = [];      // [{ timestamp, subject, name, klass, messages }]

const SUBJECT_EMOJI = {
  Math:'➗', Science:'🔬', English:'📝', History:'📜',
  Geography:'🌍', Computer:'💻', Economics:'💰', Civics:'🏛️',
};

/* ── Page Navigation ─────────────────────────────────────────── */
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + name);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(link =>
    link.classList.toggle('active', link.dataset.page === name)
  );
  currentPage = name;
  if (name === 'history') renderHistory();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Dark mode ───────────────────────────────────────────────── */
const html        = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
html.setAttribute('data-theme', localStorage.getItem('ai-hw-theme') || 'light');
themeToggle.addEventListener('click', () => {
  const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', next);
  localStorage.setItem('ai-hw-theme', next);
});

/* ── Mobile menu ─────────────────────────────────────────────── */
const hamburger  = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
hamburger.addEventListener('click', () => mobileMenu.classList.toggle('open'));
function closeMobileMenu() { mobileMenu.classList.remove('open'); }

window.addEventListener('scroll', () => {
  document.getElementById('navbar').style.boxShadow =
    window.scrollY > 10 ? '0 4px 24px rgba(79,70,229,0.15)' : 'none';
}, { passive: true });

/* ================================================================
   AUTH
================================================================ */
async function checkAuthStatus() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      currentUser = await res.json();
    } else {
      currentUser = null;
    }
  } catch {
    currentUser = null;
  }
  updateNavAuth();
  if (currentUser) prefillProfile();
}

function prefillProfile() {
  const nameEl = document.getElementById('studentName');
  if (nameEl && !nameEl.value) nameEl.value = currentUser.fullName || '';
}

function updateNavAuth() {
  const ctrl   = document.getElementById('authControls');
  const mobile = document.getElementById('mobileAuthControls');

  if (currentUser) {
    const initials = (currentUser.fullName || currentUser.username || '?')
      .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    ctrl.innerHTML = `
      <div class="nav-user-chip">
        <div class="nav-user-avatar">${escapeHtml(initials)}</div>
        <span>${escapeHtml(currentUser.fullName || currentUser.username)}</span>
      </div>
      <button class="icon-btn" onclick="handleLogout()">Logout</button>
    `;
    mobile.innerHTML = `
      <div style="padding:8px 18px; font-size:0.9rem; font-weight:600;">
        👤 ${escapeHtml(currentUser.fullName || currentUser.username)}
      </div>
      <a href="#" class="mobile-link" onclick="handleLogout(); closeMobileMenu(); return false;">Logout</a>
    `;
  } else {
    ctrl.innerHTML = `
      <button class="btn btn-primary" style="padding:8px 18px; font-size:0.88rem;" onclick="showAuthModal('login')">Sign In</button>
    `;
    mobile.innerHTML = `
      <a href="#" class="mobile-link" onclick="showAuthModal('login'); closeMobileMenu(); return false;">Sign In</a>
    `;
  }
}

function showAuthModal(tab = 'login') {
  const overlay = document.getElementById('authOverlay');
  overlay.classList.add('open');
  switchAuthTab(tab);
  // Clear errors
  ['loginError', 'registerError'].forEach(id => {
    const el = document.getElementById(id);
    el.textContent = '';
    el.classList.remove('visible');
  });
}

function closeAuthModal() {
  document.getElementById('authOverlay').classList.remove('open');
}

function overlayClick(e) {
  if (e.target === document.getElementById('authOverlay')) closeAuthModal();
}

function switchAuthTab(tab) {
  const loginForm  = document.getElementById('loginForm');
  const regForm    = document.getElementById('registerForm');
  const loginTab   = document.getElementById('loginTab');
  const regTab     = document.getElementById('registerTab');
  const title      = document.getElementById('authModalTitle');
  const sub        = document.getElementById('authModalSub');

  if (tab === 'login') {
    loginForm.style.display  = '';
    regForm.style.display    = 'none';
    loginTab.classList.add('active');
    regTab.classList.remove('active');
    title.textContent = 'Welcome Back';
    sub.textContent   = 'Sign in to your account';
  } else {
    loginForm.style.display  = 'none';
    regForm.style.display    = '';
    loginTab.classList.remove('active');
    regTab.classList.add('active');
    title.textContent = 'Create Account';
    sub.textContent   = 'Join PandaGPT';
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const btn    = document.getElementById('loginBtn');
  const errEl  = document.getElementById('loginError');
  const email  = document.getElementById('loginEmail').value.trim();
  const pwd    = document.getElementById('loginPassword').value;

  errEl.textContent = '';
  errEl.classList.remove('visible');
  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Signing in…';

  try {
    const res  = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pwd }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    currentUser = data;
    updateNavAuth();
    prefillProfile();
    closeAuthModal();
    showToast(`👋 Welcome back, ${data.fullName || data.username}!`);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('visible');
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Sign In';
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const btn      = document.getElementById('registerBtn');
  const errEl    = document.getElementById('registerError');
  const fullName = document.getElementById('regName').value.trim();
  const username = document.getElementById('regUsername').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;

  errEl.textContent = '';
  errEl.classList.remove('visible');
  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Creating account…';

  try {
    const res  = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');

    currentUser = data;
    updateNavAuth();
    prefillProfile();
    closeAuthModal();
    showToast(`🎉 Account created! Welcome, ${data.fullName}!`);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('visible');
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Create Account';
  }
}

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  currentUser = null;
  updateNavAuth();
  showToast('👋 Logged out successfully');
}

/* ================================================================
   CHAT
================================================================ */
function getProfile() {
  const name     = document.getElementById('studentName').value.trim();
  const klass    = document.getElementById('studentClass').value;
  const subInput = document.querySelector('input[name="subject"]:checked');
  return { name, klass, subject: subInput?.value || null };
}

async function sendChatMessage() {
  if (isRequesting) return;

  const input = document.getElementById('chatInput');
  const text  = input.value.trim();
  if (!text) { showToast('⚠️ Please type a question first!'); return; }

  const { name, klass, subject } = getProfile();
  if (!name)    { showToast('⚠️ Please enter your name first!');    return; }
  if (!klass)   { showToast('⚠️ Please select your class first!'); return; }
  if (!subject) { showToast('⚠️ Please pick a subject first!');     return; }

  // Remove welcome screen
  const welcome = document.getElementById('chatWelcome');
  if (welcome) welcome.remove();

  // Append user bubble
  appendBubble('user', text);
  chatMessages.push({ role: 'user', content: text });
  input.value = '';
  autoResizeTextarea(input);

  // Show AI loading bubble
  const loadingBubble = appendLoadingBubble();

  isRequesting = true;
  setInputDisabled(true);

  try {
    const res  = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, studentClass: klass, subject, messages: [...chatMessages] }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');

    const answer = data.answer || 'Sorry, no answer was returned.';

    // Replace loading bubble with real answer
    loadingBubble.remove();
    appendBubble('assistant', answer);
    chatMessages.push({ role: 'assistant', content: answer });
    lastAIText = answer;

    document.getElementById('speakAllBtn').style.display = '';

    // Save to history
    sessionHistory.push({
      timestamp: new Date().toLocaleTimeString(),
      subject, name, klass,
      messages: [...chatMessages],
    });
    updateHistoryBadge();

  } catch (err) {
    loadingBubble.remove();
    appendErrorBubble(err.message || 'Something went wrong. Please try again.');
    chatMessages.pop(); // remove the failed user message from history
  } finally {
    isRequesting = false;
    setInputDisabled(false);
    document.getElementById('chatInput').focus();
  }
}

function appendBubble(role, text) {
  const container = document.getElementById('chatMessages');
  const isUser    = role === 'user';

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isUser ? 'user-bubble' : 'ai-bubble'}`;

  const avatarEl = document.createElement('div');
  avatarEl.className = 'bubble-avatar';
  avatarEl.textContent = isUser ? '👤' : '🤖';

  const contentEl = document.createElement('div');
  contentEl.className = 'bubble-content';

  const textEl = document.createElement('div');
  textEl.className = 'bubble-text';

  if (isUser) {
    textEl.textContent = text;
  } else {
    // Render markdown for AI replies
    textEl.innerHTML = renderMarkdown(text);
  }

  contentEl.appendChild(textEl);

  if (!isUser) {
    const actionsEl = document.createElement('div');
    actionsEl.className = 'bubble-actions';

    const speakBtn = document.createElement('button');
    speakBtn.className = 'bubble-action-btn';
    speakBtn.textContent = '🔊 Read';
    speakBtn.onclick = () => toggleSpeak(speakBtn, text);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'bubble-action-btn';
    copyBtn.textContent = '📋 Copy';
    copyBtn.onclick = () => { copyText(text); showToast('✅ Copied!'); };

    actionsEl.appendChild(speakBtn);
    actionsEl.appendChild(copyBtn);
    contentEl.appendChild(actionsEl);
  }

  if (isUser) {
    bubble.appendChild(contentEl);
    bubble.appendChild(avatarEl);
  } else {
    bubble.appendChild(avatarEl);
    bubble.appendChild(contentEl);
  }

  container.appendChild(bubble);
  scrollChatToBottom();
  return bubble;
}

function appendLoadingBubble() {
  const container = document.getElementById('chatMessages');
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble ai-bubble';

  const avatar = document.createElement('div');
  avatar.className = 'bubble-avatar';
  avatar.textContent = '🤖';

  const content = document.createElement('div');
  content.className = 'bubble-content';

  const dots = document.createElement('div');
  dots.className = 'bubble-text loading-bubble';
  dots.innerHTML = '<span></span><span></span><span></span>';

  content.appendChild(dots);
  bubble.appendChild(avatar);
  bubble.appendChild(content);
  container.appendChild(bubble);
  scrollChatToBottom();
  return bubble;
}

function appendErrorBubble(message) {
  const container = document.getElementById('chatMessages');
  const bubble    = document.createElement('div');
  bubble.className = 'chat-bubble ai-bubble';

  const avatar  = document.createElement('div');
  avatar.className = 'bubble-avatar';
  avatar.textContent = '⚠️';

  const content = document.createElement('div');
  content.className = 'bubble-content';

  const textEl = document.createElement('div');
  textEl.className = 'bubble-text';
  textEl.style.cssText = 'color:#ef4444; border-color:rgba(239,68,68,0.3);';
  textEl.textContent = '❌ ' + message;

  content.appendChild(textEl);
  bubble.appendChild(avatar);
  bubble.appendChild(content);
  container.appendChild(bubble);
  scrollChatToBottom();
}

function clearChat() {
  chatMessages = [];
  lastAIText   = '';
  const container = document.getElementById('chatMessages');
  container.innerHTML = `
    <div class="chat-welcome" id="chatWelcome">
      <div class="welcome-icon">🎓</div>
      <h3>Ready to Help!</h3>
      <p>Fill in your profile on the left, then type or speak your homework question below.</p>
      <div class="welcome-tips">
        <span class="tip-chip">🎙️ Voice input supported</span>
        <span class="tip-chip">💬 Ask follow-up questions</span>
        <span class="tip-chip">🔊 AI can read answers aloud</span>
      </div>
    </div>
  `;
  stopSpeaking();
  document.getElementById('speakAllBtn').style.display = 'none';
}

function handleChatKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}

function scrollChatToBottom() {
  const c = document.getElementById('chatMessages');
  c.scrollTop = c.scrollHeight;
}

function setInputDisabled(disabled) {
  document.getElementById('sendBtn').disabled    = disabled;
  document.getElementById('chatInput').disabled  = disabled;
  document.getElementById('micBtn').disabled     = disabled;
}

// Auto-resize textarea as user types
document.getElementById('chatInput').addEventListener('input', function() {
  autoResizeTextarea(this);
});
function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

/* ================================================================
   VOICE INPUT  (SpeechRecognition)
================================================================ */
function initVoiceInput() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    document.getElementById('micBtn').title = 'Voice input not supported in this browser';
    document.getElementById('micBtn').style.opacity = '0.4';
    document.getElementById('micBtn').style.cursor = 'not-allowed';
    return;
  }
  recognition = new SR();
  recognition.lang         = 'en-US';
  recognition.interimResults = true;
  recognition.continuous   = false;

  recognition.onstart = () => {
    isRecording = true;
    document.getElementById('micBtn').classList.add('recording');
    document.getElementById('micBtn').textContent = '⏹️';
    document.getElementById('voiceStatusCard').style.display = '';
    document.getElementById('voiceStatusText').textContent = 'Listening…';
  };

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const input = document.getElementById('chatInput');
    input.value = transcript;
    autoResizeTextarea(input);
    document.getElementById('voiceStatusText').textContent = transcript
      ? `"${transcript.slice(0, 50)}${transcript.length > 50 ? '…' : ''}"`
      : 'Listening…';
  };

  recognition.onerror = (event) => {
    if (event.error !== 'aborted') {
      showToast(`🎙️ Voice error: ${event.error}`);
    }
    stopVoiceInput();
  };

  recognition.onend = () => {
    stopVoiceInput();
    // Auto-send if there's text
    const val = document.getElementById('chatInput').value.trim();
    if (val) {
      setTimeout(() => sendChatMessage(), 300);
    }
  };
}

function toggleVoiceInput() {
  if (!recognition) {
    showToast('🎙️ Voice input is not supported in this browser');
    return;
  }
  if (isRecording) {
    stopVoiceInput();
  } else {
    try {
      recognition.start();
    } catch (e) {
      showToast('🎙️ Could not start recording');
    }
  }
}

function stopVoiceInput() {
  if (recognition && isRecording) {
    try { recognition.stop(); } catch (_) {}
  }
  isRecording = false;
  const micBtn = document.getElementById('micBtn');
  micBtn.classList.remove('recording');
  micBtn.textContent = '🎙️';
  document.getElementById('voiceStatusCard').style.display = 'none';
}

/* ================================================================
   VOICE OUTPUT  (SpeechSynthesis)
================================================================ */
function toggleSpeak(btn, text) {
  if (isSpeaking && activeSpeakBtn === btn) {
    stopSpeaking();
    return;
  }
  if (isSpeaking) {
    stopSpeaking();
  }
  speakText(text, btn);
}

function speakText(text, btn) {
  if (!window.speechSynthesis) {
    showToast('🔊 Text-to-speech not supported in this browser');
    return;
  }
  // Strip markdown for speech
  const plain = text
    .replace(/#{1,6}\s?/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();

  const utter = new SpeechSynthesisUtterance(plain);
  utter.rate  = 0.95;
  utter.pitch = 1;
  utter.lang  = 'en-US';

  utter.onstart = () => {
    isSpeaking    = true;
    currentUtter  = utter;
    activeSpeakBtn = btn;
    if (btn) { btn.textContent = '⏹️ Stop'; btn.classList.add('speaking'); }
  };
  utter.onend = utter.onerror = () => {
    isSpeaking    = false;
    currentUtter  = null;
    if (activeSpeakBtn) {
      activeSpeakBtn.textContent = '🔊 Read';
      activeSpeakBtn.classList.remove('speaking');
    }
    activeSpeakBtn = null;
  };

  window.speechSynthesis.speak(utter);
}

function stopSpeaking() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  isSpeaking = false;
  currentUtter = null;
  if (activeSpeakBtn) {
    activeSpeakBtn.textContent = '🔊 Read';
    activeSpeakBtn.classList.remove('speaking');
  }
  activeSpeakBtn = null;
}

function speakLastAnswer() {
  if (!lastAIText) { showToast('⚠️ No answer to read yet!'); return; }
  if (isSpeaking) { stopSpeaking(); return; }
  const btn = document.getElementById('speakAllBtn');
  speakText(lastAIText, btn);
}

/* ================================================================
   SIMPLE MARKDOWN RENDERER
================================================================ */
function renderMarkdown(text) {
  // Step 1: protect code blocks from further processing
  const codeBlocks = [];
  let safe = escapeHtml(text).replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return `\x00CODE${idx}\x00`;
  });

  // Inline code
  safe = safe.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Bold & italic
  safe = safe.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/__([^_\n]+)__/g,      '<strong>$1</strong>');
  safe = safe.replace(/\*([^*\n]+)\*/g,      '<em>$1</em>');
  safe = safe.replace(/_([^_\n]+)_/g,        '<em>$1</em>');

  // Headers
  safe = safe.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  safe = safe.replace(/^##\s+(.+)$/gm,  '<h2>$1</h2>');
  safe = safe.replace(/^#\s+(.+)$/gm,   '<h1>$1</h1>');

  // Horizontal rule
  safe = safe.replace(/^---+$/gm, '<hr>');

  // Step 2: process lists line-by-line so items get correct wrappers
  const rawLines = safe.split('\n');
  const outLines = [];
  let listType = null; // 'ul' | 'ol' | null

  for (const line of rawLines) {
    const ulMatch = line.match(/^[-*•]\s+(.*)/);
    const olMatch = line.match(/^\d+[.)]\s+(.*)/);

    if (ulMatch) {
      if (listType === 'ol') { outLines.push('</ol>'); listType = null; }
      if (!listType)         { outLines.push('<ul>');  listType = 'ul'; }
      outLines.push(`<li>${ulMatch[1]}</li>`);
    } else if (olMatch) {
      if (listType === 'ul') { outLines.push('</ul>'); listType = null; }
      if (!listType)         { outLines.push('<ol>');  listType = 'ol'; }
      outLines.push(`<li>${olMatch[1]}</li>`);
    } else {
      if (listType) { outLines.push(`</${listType}>`); listType = null; }
      outLines.push(line);
    }
  }
  if (listType) outLines.push(`</${listType}>`);
  safe = outLines.join('\n');

  // Step 3: wrap plain-text paragraphs (skip block-level elements)
  safe = safe
    .split(/\n{2,}/)
    .map(block => {
      block = block.trim();
      if (!block) return '';
      if (/^<(h[1-6]|ul|ol|li|pre|hr|\x00CODE)/.test(block)) return block;
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  // Step 4: restore code blocks
  safe = safe.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[Number(i)]);

  return safe;
}

/* ================================================================
   HISTORY
================================================================ */
function updateHistoryBadge() {
  const badge = document.getElementById('historyBadge');
  if (!badge) return;
  const count = sessionHistory.length;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline-flex' : 'none';
}

function renderHistory() {
  const list    = document.getElementById('historyList');
  const emptyEl = document.getElementById('historyEmpty');
  const clearBtn = document.getElementById('clearHistoryBtn');
  list.innerHTML = '';

  if (sessionHistory.length === 0) {
    emptyEl.style.display = 'block';
    clearBtn.style.display = 'none';
    return;
  }
  emptyEl.style.display = 'none';
  clearBtn.style.display = 'inline-flex';

  [...sessionHistory].reverse().forEach((session, revIdx) => {
    const emoji   = SUBJECT_EMOJI[session.subject] ?? '📖';
    const msgCount = session.messages.length;
    const preview = session.messages[0]?.content || '';

    const card = document.createElement('div');
    card.className = 'history-entry';
    card.innerHTML = `
      <div class="history-entry-inner">
        <div class="history-entry-header">
          <div class="history-entry-meta">
            <span class="history-subject-badge">${emoji} ${escapeHtml(session.subject)}</span>
            <span class="history-student-info">${escapeHtml(session.name)} · Class ${escapeHtml(session.klass)}</span>
          </div>
          <span class="history-timestamp">🕐 ${escapeHtml(session.timestamp)}</span>
        </div>
        <div class="history-entry-body">
          <div class="history-entry-preview">❓ ${escapeHtml(preview.slice(0, 120))}${preview.length > 120 ? '…' : ''}</div>
          <div class="history-msg-count">💬 ${msgCount} message${msgCount !== 1 ? 's' : ''} in conversation</div>
        </div>
        <div class="history-entry-footer">
          <button class="icon-btn" onclick="replaySession(${sessionHistory.length - 1 - revIdx})">🔄 Continue Chat</button>
        </div>
      </div>
    `;
    list.appendChild(card);
  });
}

function replaySession(idx) {
  const session = sessionHistory[idx];
  if (!session) return;
  // Restore profile
  document.getElementById('studentName').value  = session.name;
  document.getElementById('studentClass').value = session.klass;
  const radio = document.querySelector(`input[name="subject"][value="${session.subject}"]`);
  if (radio) radio.checked = true;
  // Restore chat
  chatMessages = [...session.messages];
  const container = document.getElementById('chatMessages');
  container.innerHTML = '';
  session.messages.forEach(msg => appendBubble(msg.role, msg.content));
  if (session.messages.length > 0) {
    const last = session.messages[session.messages.length - 1];
    if (last.role === 'assistant') lastAIText = last.content;
    document.getElementById('speakAllBtn').style.display = '';
  }
  showPage('helper');
  showToast('📋 Chat session loaded — continue the conversation!');
}

function clearHistory() {
  sessionHistory.length = 0;
  updateHistoryBadge();
  renderHistory();
  showToast('🗑️ History cleared!');
}

/* ================================================================
   UTILITIES
================================================================ */
let toastTimeout = null;
function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  if (toastTimeout) clearTimeout(toastTimeout);
  toast.classList.add('show');
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
    toastTimeout = null;
  }, duration);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function copyText(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = Object.assign(document.createElement('textarea'), {
    value: text, style: 'position:fixed;opacity:0',
  });
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (_) {}
  document.body.removeChild(ta);
}

/* ================================================================
   INIT
================================================================ */
checkAuthStatus();
initVoiceInput();

/* ── Window globals (for inline HTML onclick handlers) ─────── */
window.showPage          = showPage;
window.closeMobileMenu   = closeMobileMenu;
window.showAuthModal     = showAuthModal;
window.closeAuthModal    = closeAuthModal;
window.overlayClick      = overlayClick;
window.switchAuthTab     = switchAuthTab;
window.handleLogin       = handleLogin;
window.handleRegister    = handleRegister;
window.handleLogout      = handleLogout;
window.sendChatMessage   = sendChatMessage;
window.clearChat         = clearChat;
window.handleChatKeydown = handleChatKeydown;
window.toggleVoiceInput  = toggleVoiceInput;
window.stopVoiceInput    = stopVoiceInput;
window.toggleSpeak       = toggleSpeak;
window.speakLastAnswer   = speakLastAnswer;
window.clearHistory      = clearHistory;
window.replaySession     = replaySession;

/* ================================================================
   QUIZ MODULE
================================================================ */

/* ── State ───────────────────────────────────────────────────── */
const quizSel = { subject: null, classLevel: null, num: '10', diff: 'Medium', timer: '0' };
let quizQuestions = [];
let quizIndex     = 0;
let quizAnswers   = [];
let quizTimerInt  = null;
let quizLiveScore = 0;

/* Sync quizSel from pre-selected chips in HTML on first load */
(function initQuizDefaults() {
  document.querySelectorAll('#page-quiz .quiz-chips').forEach(group => {
    const pre = group.querySelector('.quiz-chip.selected, .quiz-chip.quiz-chip-selected');
    if (pre) {
      // derive the type from the onclick attribute
      const match = (pre.getAttribute('onclick') || '').match(/selectQuizChip\(this,'([^']+)'\)/);
      if (match) quizSel[match[1]] = pre.dataset.val;
    }
  });
})();

/* ── Chip selection ──────────────────────────────────────────── */
function selectQuizChip(el, type) {
  el.closest('.quiz-chips').querySelectorAll('.quiz-chip').forEach(c => {
    c.classList.remove('selected', 'quiz-chip-selected');
  });
  el.classList.add('selected');
  quizSel[type] = el.dataset.val;
}

/* ── Screen switcher ─────────────────────────────────────────── */
function showQuizScreen(id) {
  ['quiz-setup','quiz-loading','quiz-question','quiz-results'].forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.style.display = (sid === id) ? 'block' : 'none';
  });
}

/* ── Start / generate ────────────────────────────────────────── */
async function startQuiz() {
  if (!quizSel.subject)     return showToast('Please select a subject');
  if (!quizSel.classLevel)  return showToast('Please select your class');

  const numQ  = parseInt(quizSel.num   || '10');
  const diff  = quizSel.diff  || 'Medium';

  quizIndex     = 0;
  quizAnswers   = [];
  quizLiveScore = 0;

  showQuizScreen('quiz-loading');

  try {
    const resp = await fetch('/api/quiz/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject:      quizSel.subject,
        classLevel:   quizSel.classLevel,
        numQuestions: numQ,
        difficulty:   diff,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to generate quiz');
    quizQuestions = data.questions;
    showQuizScreen('quiz-question');
    renderQuizQuestion();
  } catch (err) {
    showToast(err.message || 'Failed to generate quiz. Please try again.');
    showQuizScreen('quiz-setup');
  }
}

/* ── Render a question ───────────────────────────────────────── */
function renderQuizQuestion() {
  const q     = quizQuestions[quizIndex];
  const total = quizQuestions.length;

  // Progress
  document.getElementById('quiz-progress-text').textContent = `Question ${quizIndex + 1} of ${total}`;
  document.getElementById('quiz-score-live').textContent    = `Score: ${quizLiveScore}`;
  document.getElementById('quiz-progress-bar').style.width  = ((quizIndex / total) * 100) + '%';

  // Question text
  document.getElementById('quiz-question-text').textContent = q.question;

  // Options
  const optWrap = document.getElementById('quiz-options');
  optWrap.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn       = document.createElement('button');
    btn.className   = 'quiz-option';
    btn.innerHTML   = `<span class="qopt-letter">${String.fromCharCode(65 + i)}</span><span class="qopt-text">${escapeHtml(opt)}</span>`;
    btn.onclick     = () => handleQuizAnswer(i);
    optWrap.appendChild(btn);
  });

  // Reset explanation & next button
  const exEl = document.getElementById('quiz-explanation');
  exEl.style.display  = 'none';
  exEl.textContent    = '';

  const nextBtn        = document.getElementById('quiz-next-btn');
  nextBtn.disabled     = true;
  nextBtn.textContent  = (quizIndex + 1 < total) ? 'Next →' : 'See Results 🏁';

  // Timer
  clearInterval(quizTimerInt);
  const timerSecs = parseInt(quizSel.timer || '0');
  const timerWrap = document.getElementById('quiz-timer-display');
  if (timerSecs > 0) {
    timerWrap.style.display = 'flex';
    startQuizTimer(timerSecs);
  } else {
    timerWrap.style.display = 'none';
  }
}

/* ── Timer ───────────────────────────────────────────────────── */
function startQuizTimer(seconds) {
  clearInterval(quizTimerInt);
  let timeLeft = seconds;
  const numEl  = document.getElementById('quiz-timer-num');
  const ring   = document.getElementById('quiz-timer-ring');
  const circ   = 2 * Math.PI * 20;

  // Reset ring instantly (suppress the 1 s CSS transition during reset)
  ring.style.transition       = 'none';
  ring.style.strokeDasharray  = circ;
  ring.style.strokeDashoffset = 0;
  numEl.textContent = timeLeft;
  // Re-enable smooth transition after the reset paint
  requestAnimationFrame(() => {
    ring.style.transition = 'stroke-dashoffset 1s linear';
  });

  quizTimerInt = setInterval(() => {
    timeLeft--;
    numEl.textContent           = timeLeft;
    ring.style.strokeDashoffset = circ * (1 - timeLeft / seconds);
    // Warn at 5 s
    numEl.style.color = timeLeft <= 5 ? '#ef4444' : 'var(--primary)';
    ring.style.stroke = timeLeft <= 5 ? '#ef4444' : 'var(--primary)';
    if (timeLeft <= 0) {
      clearInterval(quizTimerInt);
      timeOutQuizAnswer();
    }
  }, 1000);
}

/* ── Answer handling ─────────────────────────────────────────── */
function handleQuizAnswer(selected) {
  const opts = document.querySelectorAll('.quiz-option');
  if ([...opts].some(o => o.disabled)) return; // already answered

  clearInterval(quizTimerInt);
  const q       = quizQuestions[quizIndex];
  const correct = q.correct;
  const isRight = selected === correct;
  if (isRight) quizLiveScore++;

  opts.forEach((btn, i) => {
    btn.disabled = true;
    if (i === correct)              btn.classList.add('qopt-correct');
    if (i === selected && !isRight) btn.classList.add('qopt-wrong');
  });

  quizAnswers.push({ selected, correct });
  showQuizExplanation(q.explanation);
  document.getElementById('quiz-next-btn').disabled = false;
}

function timeOutQuizAnswer() {
  const opts    = document.querySelectorAll('.quiz-option');
  const q       = quizQuestions[quizIndex];
  const correct = q.correct;
  opts.forEach((btn, i) => {
    btn.disabled = true;
    if (i === correct) btn.classList.add('qopt-correct');
  });
  quizAnswers.push({ selected: -1, correct });
  const msg = q.explanation
    ? `⏰ Time's up!  ${q.explanation}`
    : `⏰ Time's up!  Correct answer: ${q.options[correct]}`;
  showQuizExplanation(msg);
  document.getElementById('quiz-next-btn').disabled = false;
}

function showQuizExplanation(text) {
  if (!text) return;
  const el       = document.getElementById('quiz-explanation');
  el.textContent = text.startsWith('⏰') ? text : `💡 ${text}`;
  el.style.display = 'block';
}

/* ── Next question ───────────────────────────────────────────── */
function nextQuestion() {
  quizIndex++;
  if (quizIndex >= quizQuestions.length) {
    showQuizResults();
  } else {
    renderQuizQuestion();
  }
}

/* ── Results ─────────────────────────────────────────────────── */
function showQuizResults() {
  clearInterval(quizTimerInt);
  showQuizScreen('quiz-results');

  const total   = quizAnswers.length;
  const score   = quizAnswers.filter(a => a.selected === a.correct).length;
  const wrong   = quizAnswers.filter(a => a.selected !== a.correct && a.selected !== -1).length;
  const skipped = quizAnswers.filter(a => a.selected === -1).length;
  const pct     = Math.round((score / total) * 100);

  document.getElementById('quiz-score-num').textContent = `${score} / ${total}`;
  document.getElementById('quiz-score-pct').textContent = `${pct}%`;

  let emoji, grade;
  if      (pct >= 90) { emoji = '🏆'; grade = 'Excellent!'; }
  else if (pct >= 75) { emoji = '🌟'; grade = 'Great job!'; }
  else if (pct >= 60) { emoji = '👍'; grade = 'Good effort!'; }
  else if (pct >= 40) { emoji = '📚'; grade = 'Keep practising!'; }
  else                { emoji = '💪'; grade = "Don't give up!"; }

  document.getElementById('quiz-grade-emoji').textContent = emoji;
  document.getElementById('quiz-grade-text').textContent  = grade;
  document.getElementById('quiz-score-stats').innerHTML   =
    `<span class="qs-correct">✅ ${score} Correct</span>` +
    `<span class="qs-wrong">❌ ${wrong} Wrong</span>` +
    (skipped ? `<span class="qs-skipped">⏰ ${skipped} Skipped</span>` : '');

  // Progress bar → 100%
  document.getElementById('quiz-progress-bar').style.width = '100%';

  // Build review
  const reviewEl = document.getElementById('quiz-review');
  reviewEl.innerHTML = '';
  quizQuestions.forEach((q, i) => {
    const a      = quizAnswers[i];
    const right  = a && a.selected === a.correct;
    const skp    = a && a.selected === -1;
    const div    = document.createElement('div');
    div.className = `qreview-item ${right ? 'qr-correct' : 'qr-wrong'}`;
    div.innerHTML = `
      <div class="qreview-header">
        <span class="qr-num">Q${i + 1}</span>
        <span class="qr-verdict">${right ? '✅ Correct' : skp ? '⏰ Skipped' : '❌ Incorrect'}</span>
      </div>
      <p class="qreview-question">${escapeHtml(q.question)}</p>
      <div class="qreview-opts">
        ${q.options.map((opt, oi) => {
          let cls = 'qropt';
          if (oi === q.correct)              cls += ' qropt-correct';
          if (a && oi === a.selected && !right) cls += ' qropt-wrong';
          return `<div class="${cls}"><span>${String.fromCharCode(65 + oi)}.</span> ${escapeHtml(opt)}</div>`;
        }).join('')}
      </div>
      ${q.explanation ? `<p class="qreview-expl">💡 ${escapeHtml(q.explanation)}</p>` : ''}
    `;
    reviewEl.appendChild(div);
  });
}

/* ── Retake / new settings ───────────────────────────────────── */
function retakeQuiz() {
  clearInterval(quizTimerInt);
  quizIndex     = 0;
  quizAnswers   = [];
  quizLiveScore = 0;
  showQuizScreen('quiz-question');
  renderQuizQuestion();
}

function backToQuizSetup() {
  clearInterval(quizTimerInt);
  showQuizScreen('quiz-setup');
}

/* ── Expose to HTML ──────────────────────────────────────────── */
window.selectQuizChip  = selectQuizChip;
window.startQuiz       = startQuiz;
window.nextQuestion    = nextQuestion;
window.retakeQuiz      = retakeQuiz;
window.backToQuizSetup = backToQuizSetup;
