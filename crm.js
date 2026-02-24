// ═══════════════════════════════════════════════════════════════
// CRM DASHBOARD — crm.js
// Phase 1: Contacts, Pipeline, Tasks, Documents, Transactions
// ═══════════════════════════════════════════════════════════════

// ── Supabase Init ──
var SUPABASE_URL = 'https://kzaabnnwjupjqvydiqlz.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA';
var _sb = null;
try {
  _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'cc-supabase-auth', storage: window.localStorage }
  });
} catch(e) { console.warn('[CRM] Supabase init error:', e); }

var _currentUser = null;
var _currentTab = 'today';
var _contactsCache = [];
var _selectedContacts = new Set();

// ── Auth Check ──
// DEV_BYPASS: set to true to skip login on localhost (remove before deploying!)
var DEV_BYPASS = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

(async function initCRM() {
  var gate = document.getElementById('crmAuthGate');
  var app = document.getElementById('crmApp');
  if (!_sb) { gate.innerHTML = '<div class="crm-auth-denied"><h2>Connection Error</h2><p>Could not connect to database.</p><a href="/">Back to site</a></div>'; return; }

  // Dev bypass for local testing — skip auth, go straight to dashboard
  if (DEV_BYPASS) {
    console.log('[CRM] 🔓 Dev bypass active — skipping auth on localhost');
    _currentUser = { id: 'dev-local', email: 'dev@localhost' };
    gate.style.display = 'none';
    app.style.display = 'flex';
    initThemeToggle();
    renderSidebar();
    initGlobalSearch();
    initFAB();
    switchTab('today');
    return;
  }

  try {
    var { data: { session } } = await _sb.auth.getSession();
    if (!session) {
      // Try refresh
      var { data: refreshData } = await _sb.auth.refreshSession();
      session = refreshData?.session;
    }
    if (!session) { showLoginForm(gate); return; }

    // Check admin role
    var { data: profile } = await _sb.from('profiles').select('role').eq('id', session.user.id).single();
    if (!profile || profile.role !== 'admin') {
      gate.innerHTML = '<div class="crm-auth-denied"><h2>Access Denied</h2><p>Admin access required.</p><a href="/">Back to site</a></div>';
      return;
    }

    _currentUser = session.user;
    gate.style.display = 'none';
    app.style.display = 'flex';
    initThemeToggle();
    renderSidebar();
    initGlobalSearch();
    initFAB();
    switchTab('today');
  } catch(e) {
    console.error('[CRM] Auth error:', e);
    showLoginForm(gate);
  }
})();

function showLoginForm(gate) {
  gate.innerHTML = '<div class="crm-auth-form"><h2 class="fd">Cory CRM</h2><p>Sign in to access your dashboard</p>' +
    '<input class="crm-input" id="loginEmail" type="email" placeholder="Email" />' +
    '<input class="crm-input" id="loginPass" type="password" placeholder="Password" />' +
    '<button class="crm-btn crm-btn-primary" onclick="doLogin()">Sign In</button>' +
    '<div class="crm-auth-error" id="loginError"></div></div>';
}

async function doLogin() {
  var email = document.getElementById('loginEmail').value.trim();
  var pass = document.getElementById('loginPass').value;
  var err = document.getElementById('loginError');
  if (!email || !pass) { err.textContent = 'Please enter email and password.'; return; }
  try {
    var { error } = await _sb.auth.signInWithPassword({ email: email, password: pass });
    if (error) { err.textContent = error.message; return; }
    window.location.reload();
  } catch(e) { err.textContent = 'Login failed.'; }
}

// ── Theme Toggle ──
function initThemeToggle() {
  var btn = document.getElementById('themeToggle');
  if (!btn) return;
  updateThemeIcon();
  btn.onclick = function() {
    var html = document.documentElement;
    var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon();
  };
}
function updateThemeIcon() {
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  var sun = document.querySelector('.t-sun');
  var moon = document.querySelector('.t-moon');
  if (sun) sun.style.display = isDark ? 'inline' : 'none';
  if (moon) moon.style.display = isDark ? 'none' : 'inline';
}

// ── Sidebar ──
var SIDEBAR_TABS = [
  { id: 'today', label: 'Today', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' },
  { id: 'contacts', label: 'Contacts', icon: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>' },
  { id: 'pipeline', label: 'Pipeline', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>' },
  { id: 'tasks', label: 'Tasks', icon: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>' },
  { id: 'documents', label: 'Documents', icon: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>' },
  { id: 'transactions', label: 'Transactions', icon: '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>' },
  { id: 'showings', label: 'Showings', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
  { id: 'questions', label: 'Questions', icon: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>' },
  { id: 'analytics', label: 'Analytics', icon: '<svg viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>' },
  { id: 'listings', label: 'Listings', icon: '<svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>' }
];

function renderSidebar() {
  var sb = document.getElementById('crmSidebar');
  if (!sb) return;
  var html = '<div class="crm-sidebar-section"><div class="crm-sidebar-label">Main</div>';
  SIDEBAR_TABS.forEach(function(t) {
    html += '<div class="crm-sidebar-item' + (_currentTab === t.id ? ' active' : '') + '" data-tab="' + t.id + '" onclick="switchTab(\'' + t.id + '\')">' + t.icon + '<span>' + t.label + '</span></div>';
  });
  html += '</div>';
  sb.innerHTML = html;
}

function switchTab(tab) {
  _currentTab = tab;
  _selectedContacts.clear();
  renderSidebar();
  var main = document.getElementById('crmMain');
  main.innerHTML = '<div class="crm-loading"><div class="crm-spinner"></div></div>';
  // Update topbar title
  var titleEl = document.querySelector('.crm-title');
  var tabObj = SIDEBAR_TABS.find(function(t) { return t.id === tab; });
  if (titleEl && tabObj) titleEl.textContent = tabObj.label;

  if (tab === 'today') loadToday();
  else if (tab === 'contacts') loadContacts();
  else if (tab === 'pipeline') loadPipeline();
  else if (tab === 'tasks') loadTasks();
  else if (tab === 'documents') loadDocuments();
  else if (tab === 'transactions') loadTransactions();
  else if (tab === 'showings') loadShowings();
  else if (tab === 'questions') loadQuestions();
  else if (tab === 'analytics') loadAnalytics();
  else if (tab === 'listings') loadListings();
}

// ── Global Search ──
var _searchDebounce = null;
function initGlobalSearch() {
  var input = document.getElementById('globalSearch');
  var results = document.getElementById('globalSearchResults');
  if (!input) return;

  input.addEventListener('input', function() {
    clearTimeout(_searchDebounce);
    var q = input.value.trim();
    if (q.length < 2) { results.classList.remove('open'); return; }
    _searchDebounce = setTimeout(function() { runGlobalSearch(q); }, 300);
  });
  input.addEventListener('focus', function() { if (input.value.trim().length >= 2) results.classList.add('open'); });
  document.addEventListener('click', function(e) { if (!e.target.closest('.crm-global-search-wrap')) results.classList.remove('open'); });
  // Ctrl+K shortcut
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); input.focus(); input.select(); }
    if (e.key === 'Escape') { input.blur(); results.classList.remove('open'); }
  });
}

async function runGlobalSearch(query) {
  var results = document.getElementById('globalSearchResults');
  var q = '%' + query + '%';
  try {
    var [contactsResp, txResp, docsResp, listingsResp] = await Promise.all([
      _sb.from('contacts').select('id, first_name, last_name, email, stage').or('first_name.ilike.' + q + ',last_name.ilike.' + q + ',email.ilike.' + q + ',phone.ilike.' + q).limit(5),
      _sb.from('transactions').select('id, property_address, status').ilike('property_address', q).limit(3),
      _sb.from('documents').select('id, file_name, category').ilike('file_name', q).limit(3),
      _sb.from('mls_listings').select('listing_key, listing_id, full_address, city, list_price, standard_status').or('full_address.ilike.' + q + ',listing_id.ilike.' + q + ',city.ilike.' + q).limit(5)
    ]);
    var html = '';
    if (listingsResp.data && listingsResp.data.length) {
      html += '<div class="crm-search-category">Listings</div>';
      listingsResp.data.forEach(function(l) {
        html += '<div class="crm-search-item" onclick="_listingsFilters.search=\'' + esc(l.full_address || l.listing_id) + '\';switchTab(\'listings\')">' +
          '<span>' + esc(l.full_address || '') + '</span><span class="crm-badge" style="font-size:0.65rem">' + (l.list_price ? '$' + l.list_price.toLocaleString() : '') + '</span></div>';
      });
    }
    if (contactsResp.data && contactsResp.data.length) {
      html += '<div class="crm-search-category">Contacts</div>';
      contactsResp.data.forEach(function(c) {
        html += '<div class="crm-search-item" onclick="switchTab(\'contacts\'); setTimeout(function(){openContact(\'' + c.id + '\')},100)">' +
          '<span>' + esc(c.first_name + ' ' + c.last_name) + '</span><span class="crm-badge crm-stage-badge" data-stage="' + c.stage + '">' + stageLabel(c.stage) + '</span></div>';
      });
    }
    if (txResp.data && txResp.data.length) {
      html += '<div class="crm-search-category">Transactions</div>';
      txResp.data.forEach(function(t) {
        html += '<div class="crm-search-item" onclick="openTransaction(\'' + t.id + '\')">' + esc(t.property_address) + '</div>';
      });
    }
    if (docsResp.data && docsResp.data.length) {
      html += '<div class="crm-search-category">Documents</div>';
      docsResp.data.forEach(function(d) {
        html += '<div class="crm-search-item" onclick="switchTab(\'documents\')">' + esc(d.file_name) + '</div>';
      });
    }
    if (!html) html = '<div class="crm-search-empty">No results found</div>';
    results.innerHTML = html;
    results.classList.add('open');
  } catch(e) { console.error('[Search]', e); }
}

// ── FAB (Quick Add) ──
function initFAB() {
  var fab = document.getElementById('crmFab');
  var menu = document.getElementById('crmFabMenu');
  if (!fab || !menu) return;

  menu.innerHTML = [
    { icon: '<svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>', label: 'Log Call', action: 'fabLogCall' },
    { icon: '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>', label: 'Add Note', action: 'fabAddNote' },
    { icon: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>', label: 'Add Task', action: 'fabAddTask' },
    { icon: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>', label: 'Add Contact', action: 'fabAddContact' }
  ].map(function(item) {
    return '<div class="crm-fab-item" onclick="' + item.action + '(); closeFAB();">' + item.icon + '<span>' + item.label + '</span></div>';
  }).join('');

  fab.onclick = function() { fab.classList.toggle('open'); menu.classList.toggle('open'); };
  document.addEventListener('click', function(e) { if (!e.target.closest('.crm-fab') && !e.target.closest('.crm-fab-menu')) closeFAB(); });
}
function closeFAB() {
  var fab = document.getElementById('crmFab');
  var menu = document.getElementById('crmFabMenu');
  if (fab) fab.classList.remove('open');
  if (menu) menu.classList.remove('open');
}

function fabLogCall() { showQuickModal('Log Call', '<div class="crm-form-group"><label class="crm-form-label">Contact</label><select class="crm-select" id="fabContactSelect"><option value="">Loading...</option></select></div><div class="crm-form-group"><label class="crm-form-label">Notes</label><textarea class="crm-textarea" id="fabCallNotes" rows="3" placeholder="Call notes..."></textarea></div>', async function() { var cid=document.getElementById('fabContactSelect').value; var notes=document.getElementById('fabCallNotes').value.trim(); if(!cid){toast('Select a contact','error');return false;} await _sb.from('contact_activity').insert({contact_id:cid,activity_type:'call_logged',description:notes||'Phone call logged'}); await _sb.from('contacts').update({last_contacted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',cid); toast('Call logged','success'); return true; }); loadContactDropdown('fabContactSelect'); }

function fabAddNote() { showQuickModal('Add Note', '<div class="crm-form-group"><label class="crm-form-label">Contact</label><select class="crm-select" id="fabContactSelect"><option value="">Loading...</option></select></div><div class="crm-form-group"><label class="crm-form-label">Note</label><textarea class="crm-textarea" id="fabNoteText" rows="3" placeholder="Note text..."></textarea></div>', async function() { var cid=document.getElementById('fabContactSelect').value; var text=document.getElementById('fabNoteText').value.trim(); if(!cid||!text){toast('Fill all fields','error');return false;} await _sb.from('contact_notes').insert({contact_id:cid,note_text:text,created_by:_currentUser.id}); await _sb.from('contact_activity').insert({contact_id:cid,activity_type:'note_added',description:'Note added'}); toast('Note added','success'); return true; }); loadContactDropdown('fabContactSelect'); }

function fabAddTask() { showQuickModal('Add Task', '<div class="crm-form-group"><label class="crm-form-label">Title</label><input class="crm-input" id="fabTaskTitle" placeholder="Task title" /></div><div class="crm-form-row"><div class="crm-form-group"><label class="crm-form-label">Contact</label><select class="crm-select" id="fabContactSelect"><option value="">None</option></select></div><div class="crm-form-group"><label class="crm-form-label">Due Date</label><input class="crm-input" id="fabTaskDue" type="date" /></div></div><div class="crm-form-group"><label class="crm-form-label">Priority</label><select class="crm-select" id="fabTaskPriority"><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>', async function() { var title=document.getElementById('fabTaskTitle').value.trim(); if(!title){toast('Enter a title','error');return false;} var cid=document.getElementById('fabContactSelect').value||null; var due=document.getElementById('fabTaskDue').value||null; var pri=document.getElementById('fabTaskPriority').value; await _sb.from('tasks').insert({contact_id:cid,title:title,due_date:due,priority:pri}); toast('Task created','success'); return true; }); loadContactDropdown('fabContactSelect'); }

function fabAddContact() { showQuickModal('Add Contact', '<div class="crm-form-row"><div class="crm-form-group"><label class="crm-form-label">First Name</label><input class="crm-input" id="fabFirst" /></div><div class="crm-form-group"><label class="crm-form-label">Last Name</label><input class="crm-input" id="fabLast" /></div></div><div class="crm-form-row"><div class="crm-form-group"><label class="crm-form-label">Email</label><input class="crm-input" id="fabEmail" type="email" /></div><div class="crm-form-group"><label class="crm-form-label">Phone</label><input class="crm-input" id="fabPhone" type="tel" /></div></div><div class="crm-form-group"><label class="crm-form-label">Source</label><select class="crm-select" id="fabSource"><option value="manual">Manual</option><option value="referral">Referral</option><option value="other">Other</option></select></div><div id="fabDuplicateWarn"></div>', async function() { var first=document.getElementById('fabFirst').value.trim(); var last=document.getElementById('fabLast').value.trim(); var email=document.getElementById('fabEmail').value.trim(); var phone=document.getElementById('fabPhone').value.trim(); if(!first&&!email){toast('Enter name or email','error');return false;} await _sb.from('contacts').insert({first_name:first,last_name:last,email:email,phone:phone,source:document.getElementById('fabSource').value}); toast('Contact added','success'); return true; });
  // Duplicate detection
  var emailInput = document.getElementById('fabEmail');
  var phoneInput = document.getElementById('fabPhone');
  if (emailInput) emailInput.addEventListener('blur', function() { checkDuplicate(emailInput.value, phoneInput?.value); });
  if (phoneInput) phoneInput.addEventListener('blur', function() { checkDuplicate(emailInput?.value, phoneInput.value); });
}

async function checkDuplicate(email, phone) {
  var warn = document.getElementById('fabDuplicateWarn');
  if (!warn) return;
  if ((!email || !email.trim()) && (!phone || !phone.trim())) { warn.innerHTML = ''; return; }
  var query = _sb.from('contacts').select('id, first_name, last_name, email');
  if (email && email.trim()) query = query.ilike('email', email.trim());
  else if (phone && phone.trim()) query = query.ilike('phone', phone.trim());
  var { data } = await query.limit(1);
  if (data && data.length) {
    warn.innerHTML = '<div class="crm-duplicate-warn"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Possible duplicate: <a href="#" onclick="closeModal();openContact(\'' + data[0].id + '\')">' + esc(data[0].first_name + ' ' + data[0].last_name) + ' (' + esc(data[0].email) + ')</a></div>';
  } else { warn.innerHTML = ''; }
}

async function loadContactDropdown(selectId) {
  var sel = document.getElementById(selectId);
  if (!sel) return;
  var { data } = await _sb.from('contacts').select('id, first_name, last_name, email').eq('is_archived', false).order('first_name').limit(200);
  var opts = '<option value="">Select contact...</option>';
  (data || []).forEach(function(c) { opts += '<option value="' + c.id + '">' + esc(c.first_name + ' ' + c.last_name) + (c.email ? ' (' + esc(c.email) + ')' : '') + '</option>'; });
  sel.innerHTML = opts;
}

// ── Modal System ──
function showQuickModal(title, bodyHtml, onSubmit) {
  var overlay = document.createElement('div');
  overlay.className = 'crm-modal-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) closeModal(); };
  overlay.innerHTML = '<div class="crm-modal"><div class="crm-modal-title fd">' + title + '</div><div class="crm-modal-body">' + bodyHtml + '</div><div class="crm-modal-footer"><button class="crm-btn crm-btn-secondary" onclick="closeModal()">Cancel</button><button class="crm-btn crm-btn-primary" id="modalSubmit">Save</button></div></div>';
  document.body.appendChild(overlay);
  var submitBtn = document.getElementById('modalSubmit');
  submitBtn.onclick = async function() {
    submitBtn.disabled = true; submitBtn.textContent = 'Saving...';
    var result = await onSubmit();
    if (result !== false) closeModal();
    else { submitBtn.disabled = false; submitBtn.textContent = 'Save'; }
  };
}
function closeModal() { var m = document.querySelector('.crm-modal-overlay'); if (m) m.remove(); }

// ── Toast Notifications ──
function toast(message, type) {
  var container = document.getElementById('toastContainer');
  if (!container) return;
  var t = document.createElement('div');
  t.className = 'crm-toast ' + (type || 'info');
  t.innerHTML = '<span>' + message + '</span><span class="crm-toast-close" onclick="this.parentElement.remove()">&times;</span>';
  container.appendChild(t);
  setTimeout(function() { t.classList.add('hiding'); setTimeout(function() { t.remove(); }, 200); }, 3000);
}

// ══════════════════════════════════════
// TODAY VIEW (Default Dashboard)
// ══════════════════════════════════════
async function loadToday() {
  var main = document.getElementById('crmMain');
  try {
    var today = new Date().toISOString().split('T')[0];
    var weekAgo = new Date(Date.now() - 7*86400000).toISOString();
    var twoWeeksAgo = new Date(Date.now() - 14*86400000).toISOString();

    // Use allSettled so one failing query doesn't block the rest
    var results = await Promise.allSettled([
      _sb.from('tasks').select('*, contacts(first_name, last_name)').eq('status', 'pending').order('due_date').limit(20),
      _sb.from('contacts').select('id, first_name, last_name, email, source, created_at').eq('stage', 'new').gte('created_at', new Date(Date.now() - 48*3600000).toISOString()).order('created_at', { ascending: false }).limit(10),
      _sb.from('contacts').select('id, first_name, last_name, email, stage, last_contacted_at').eq('is_archived', false).in('stage', ['new', 'contacted', 'showing']).or('last_contacted_at.is.null,last_contacted_at.lt.' + twoWeeksAgo).limit(20),
      _sb.from('showing_requests').select('*').in('status', ['pending', 'confirmed']).order('created_at', { ascending: false }).limit(5),
      _sb.from('documents').select('id, file_name, sent_at, viewed_at, status, contact_id, contacts(first_name, last_name)').eq('status', 'sent').is('viewed_at', null).limit(10),
      _sb.from('transactions').select('id, property_address, close_date, status, contact_id, contacts(first_name, last_name)').eq('status', 'active').not('close_date', 'is', null).limit(10),
      _sb.from('contact_activity').select('*').order('created_at', { ascending: false }).limit(10),
      _sb.from('contacts').select('id', { count: 'exact' }).eq('is_archived', false)
    ]);
    var safe = function(r) { return r.status === 'fulfilled' ? r.value : { data: [], count: 0 }; };
    var tasksResp = safe(results[0]);
    var newLeadsResp = safe(results[1]);
    var staleResp = safe(results[2]);
    var showingsResp = safe(results[3]);
    var docsResp = safe(results[4]);
    var txResp = safe(results[5]);
    var actResp = safe(results[6]);
    var contactsCountResp = safe(results[7]);

    var overdueTasks = (tasksResp.data || []).filter(function(t) { return t.due_date && t.due_date < today; });
    var todayTasks = (tasksResp.data || []).filter(function(t) { return t.due_date === today; });
    var upcomingTasks = (tasksResp.data || []).filter(function(t) { return !t.due_date || t.due_date > today; });
    var closingTx = (txResp.data || []).filter(function(t) { var d = new Date(t.close_date); return d <= new Date(Date.now() + 14*86400000); });

    // Stats
    var html = '<div class="crm-stats-grid">';
    html += statCard(contactsCountResp.count || 0, 'Total Contacts', 'accent');
    html += statCard((newLeadsResp.data || []).length, 'New Leads (48h)', 'blue');
    html += statCard(overdueTasks.length, 'Overdue Tasks', 'red');
    html += statCard(todayTasks.length, 'Due Today', 'amber');
    html += statCard((showingsResp.data || []).length, 'Active Showings', 'teal');
    html += statCard(closingTx.length, 'Approaching Close', 'green');
    html += '</div>';

    html += '<div class="crm-today-grid">';

    // Overdue + Today tasks
    html += '<div class="crm-today-section">';
    html += '<div class="crm-today-section-title"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><path d="M9 11l3 3L22 4"/></svg>Tasks</div>';
    if (overdueTasks.length) {
      overdueTasks.forEach(function(t) { html += todayTaskRow(t, 'overdue'); });
    }
    todayTasks.forEach(function(t) { html += todayTaskRow(t, 'today'); });
    upcomingTasks.slice(0, 3).forEach(function(t) { html += todayTaskRow(t, 'future'); });
    if (!overdueTasks.length && !todayTasks.length && !upcomingTasks.length) html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No pending tasks</div></div>';
    html += '</div>';

    // Stale leads
    html += '<div class="crm-today-section">';
    html += '<div class="crm-today-section-title"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>Follow-up Needed</div>';
    if (staleResp.data && staleResp.data.length) {
      staleResp.data.forEach(function(c) {
        var days = staleDays(c);
        var cls = days >= 30 ? 'red' : 'amber';
        html += '<div class="crm-today-item"><span class="crm-stale-dot ' + cls + '"></span><span class="crm-table-link" onclick="openContact(\'' + c.id + '\')">' + esc(c.first_name + ' ' + c.last_name) + '</span><span class="crm-badge crm-stale-badge ' + cls + '">' + days + 'd</span></div>';
      });
    } else { html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">All contacts are up to date</div></div>'; }
    html += '</div>';

    // New leads
    html += '<div class="crm-today-section">';
    html += '<div class="crm-today-section-title"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>New Leads</div>';
    if (newLeadsResp.data && newLeadsResp.data.length) {
      newLeadsResp.data.forEach(function(c) {
        html += '<div class="crm-today-item"><span class="crm-table-link" onclick="openContact(\'' + c.id + '\')">' + esc(c.first_name + ' ' + c.last_name) + '</span><span class="crm-badge crm-source-badge">' + c.source + '</span><span class="crm-table-muted">' + timeAgo(c.created_at) + '</span></div>';
      });
    } else { html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No new leads</div></div>'; }
    html += '</div>';

    // Docs awaiting
    html += '<div class="crm-today-section">';
    html += '<div class="crm-today-section-title"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg>Docs Awaiting Review</div>';
    if (docsResp.data && docsResp.data.length) {
      docsResp.data.forEach(function(d) {
        var cName = d.contacts ? d.contacts.first_name + ' ' + d.contacts.last_name : 'Unknown';
        html += '<div class="crm-today-item"><span>' + esc(d.file_name) + '</span><span class="crm-table-muted">Sent to ' + esc(cName) + ' ' + timeAgo(d.sent_at) + '</span></div>';
      });
    } else { html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No pending documents</div></div>'; }
    html += '</div>';

    html += '</div>'; // end today-grid

    // Recent activity
    html += '<div class="crm-section-title fd" style="margin-top:1.5rem">Recent Activity</div>';
    html += renderActivityList(actResp.data || []);

    main.innerHTML = html;
  } catch(e) { console.error('[Today]', e); main.innerHTML = '<div class="crm-empty-state"><div class="crm-empty-state-title">Error loading dashboard</div></div>'; }
}

function todayTaskRow(t, cls) {
  var cName = t.contacts ? t.contacts.first_name + ' ' + t.contacts.last_name : '';
  return '<div class="crm-today-item"><label class="crm-checkbox"><input type="checkbox" onchange="completeTask(\'' + t.id + '\')"><div class="crm-checkbox-box"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div></label><span class="crm-task-title">' + esc(t.title) + '</span>' + (cName ? '<span class="crm-task-contact" onclick="openContact(\'' + t.contact_id + '\')">' + esc(cName) + '</span>' : '') + '<span class="crm-task-due ' + cls + '">' + (t.due_date || 'No date') + '</span><span class="crm-badge crm-priority-badge" data-priority="' + t.priority + '">' + t.priority + '</span></div>';
}

function statCard(num, label, color) {
  return '<div class="crm-stat-card ' + color + '"><div class="crm-stat-num fd">' + num + '</div><div class="crm-stat-label">' + label + '</div></div>';
}

// ══════════════════════════════════════
// CONTACTS
// ══════════════════════════════════════
var _contactFilters = { search: '', stage: '', source: '' };

async function loadContacts() {
  var main = document.getElementById('crmMain');
  try {
    var query = _sb.from('contacts').select('*').eq('is_archived', false).order('updated_at', { ascending: false }).limit(200);
    if (_contactFilters.stage) query = query.eq('stage', _contactFilters.stage);
    if (_contactFilters.source) query = query.eq('source', _contactFilters.source);
    var { data } = await query;
    _contactsCache = data || [];

    var filtered = _contactsCache;
    if (_contactFilters.search) {
      var s = _contactFilters.search.toLowerCase();
      filtered = filtered.filter(function(c) {
        return (c.first_name + ' ' + c.last_name).toLowerCase().includes(s) || (c.email || '').toLowerCase().includes(s) || (c.phone || '').includes(s);
      });
    }

    var html = '<div class="crm-page-header"><div><div class="crm-page-title fd">Contacts</div><div class="crm-page-subtitle">' + filtered.length + ' contacts</div></div><button class="crm-btn crm-btn-primary" onclick="fabAddContact()"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Contact</button></div>';

    // Search + Filters
    html += '<div class="crm-search-bar">';
    html += '<input class="crm-input" placeholder="Search name, email, phone..." value="' + esc(_contactFilters.search) + '" oninput="filterContacts(\'search\',this.value)" />';
    html += '<select class="crm-select" onchange="filterContacts(\'stage\',this.value)"><option value="">All Stages</option>';
    ['new','contacted','showing','under_contract','closed','past_client'].forEach(function(s) { html += '<option value="' + s + '"' + (_contactFilters.stage===s?' selected':'') + '>' + stageLabel(s) + '</option>'; });
    html += '</select>';
    html += '<select class="crm-select" onchange="filterContacts(\'source\',this.value)"><option value="">All Sources</option>';
    ['chatbot','consultation_form','account_signup','manual','referral','other'].forEach(function(s) { html += '<option value="' + s + '"' + (_contactFilters.source===s?' selected':'') + '>' + s + '</option>'; });
    html += '</select></div>';

    // Table
    html += '<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th style="width:30px"><label class="crm-checkbox"><input type="checkbox" id="selectAll" onchange="toggleAllContacts(this.checked)"><div class="crm-checkbox-box"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div></label></th><th>Name</th><th>Email</th><th>Phone</th><th>Stage</th><th>Source</th><th>Last Contact</th></tr></thead><tbody>';
    if (filtered.length) {
      filtered.forEach(function(c) {
        var days = staleDays(c);
        var staleHtml = '';
        if (days >= 30 && ['new','contacted','showing'].includes(c.stage)) staleHtml = ' <span class="crm-stale-dot red"></span>';
        else if (days >= 14 && ['new','contacted','showing'].includes(c.stage)) staleHtml = ' <span class="crm-stale-dot amber"></span>';
        html += '<tr><td><label class="crm-checkbox"><input type="checkbox" value="' + c.id + '" onchange="toggleContactSelect(this)" ' + (_selectedContacts.has(c.id)?'checked':'') + '><div class="crm-checkbox-box"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div></label></td>';
        html += '<td><span class="crm-table-link" onclick="openContact(\'' + c.id + '\')">' + esc(c.first_name + ' ' + c.last_name) + '</span>' + staleHtml + '</td>';
        html += '<td>' + esc(c.email || '') + '</td><td>' + esc(c.phone || '') + '</td>';
        html += '<td><span class="crm-badge crm-stage-badge" data-stage="' + c.stage + '">' + stageLabel(c.stage) + '</span></td>';
        html += '<td><span class="crm-badge crm-source-badge">' + (c.source || '') + '</span></td>';
        html += '<td class="crm-table-muted">' + (c.last_contacted_at ? timeAgo(c.last_contacted_at) : 'Never') + '</td></tr>';
      });
    } else {
      html += '<tr><td colspan="7"><div class="crm-empty-state"><div class="crm-empty-state-text">No contacts found</div></div></td></tr>';
    }
    html += '</tbody></table></div>';

    // Bulk action bar
    html += '<div class="crm-bulk-bar" id="bulkBar"><span class="crm-bulk-count" id="bulkCount">0 selected</span><div class="crm-bulk-actions"><select class="crm-select crm-btn-sm" id="bulkStage"><option value="">Change Stage...</option>';
    ['new','contacted','showing','under_contract','closed','past_client'].forEach(function(s) { html += '<option value="' + s + '">' + stageLabel(s) + '</option>'; });
    html += '</select><button class="crm-btn crm-btn-secondary crm-btn-sm" onclick="bulkChangeStage()">Apply</button><button class="crm-btn crm-btn-danger crm-btn-sm" onclick="bulkArchive()">Archive</button></div></div>';

    main.innerHTML = html;
    updateBulkBar();
  } catch(e) { console.error('[Contacts]', e); main.innerHTML = '<div class="crm-empty-state"><div class="crm-empty-state-title">Error loading contacts</div></div>'; }
}

function filterContacts(key, val) {
  _contactFilters[key] = val;
  loadContacts();
}

function toggleContactSelect(cb) {
  if (cb.checked) _selectedContacts.add(cb.value);
  else _selectedContacts.delete(cb.value);
  updateBulkBar();
}

function toggleAllContacts(checked) {
  _selectedContacts.clear();
  if (checked) _contactsCache.forEach(function(c) { _selectedContacts.add(c.id); });
  document.querySelectorAll('.crm-table input[type="checkbox"][value]').forEach(function(cb) { cb.checked = checked; });
  updateBulkBar();
}

function updateBulkBar() {
  var bar = document.getElementById('bulkBar');
  var count = document.getElementById('bulkCount');
  if (!bar) return;
  if (_selectedContacts.size > 0) { bar.classList.add('visible'); count.textContent = _selectedContacts.size + ' selected'; }
  else { bar.classList.remove('visible'); }
}

async function bulkChangeStage() {
  var stage = document.getElementById('bulkStage').value;
  if (!stage || !_selectedContacts.size) return;
  var ids = Array.from(_selectedContacts);
  await _sb.from('contacts').update({ stage: stage, updated_at: new Date().toISOString() }).in('id', ids);
  toast(_selectedContacts.size + ' contacts updated', 'success');
  _selectedContacts.clear();
  loadContacts();
}

async function bulkArchive() {
  if (!_selectedContacts.size) return;
  var ids = Array.from(_selectedContacts);
  await _sb.from('contacts').update({ is_archived: true, updated_at: new Date().toISOString() }).in('id', ids);
  toast(_selectedContacts.size + ' contacts archived', 'success');
  _selectedContacts.clear();
  loadContacts();
}

// ── Contact Detail ──
async function openContact(id) {
  var main = document.getElementById('crmMain');
  main.innerHTML = '<div class="crm-loading"><div class="crm-spinner"></div></div>';
  try {
    var [contactResp, notesResp, tasksResp, actResp, txResp, docsResp] = await Promise.all([
      _sb.from('contacts').select('*').eq('id', id).single(),
      _sb.from('contact_notes').select('*').eq('contact_id', id).order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(50),
      _sb.from('tasks').select('*').eq('contact_id', id).order('due_date').limit(20),
      _sb.from('contact_activity').select('*').eq('contact_id', id).order('created_at', { ascending: false }).limit(30),
      _sb.from('transactions').select('*').eq('contact_id', id).order('created_at', { ascending: false }).limit(10),
      _sb.from('documents').select('*').eq('contact_id', id).order('created_at', { ascending: false }).limit(20)
    ]);

    var c = contactResp.data;
    if (!c) { main.innerHTML = '<div class="crm-empty-state"><div class="crm-empty-state-title">Contact not found</div></div>'; return; }

    // Also fetch user activity if contact has an account
    var userAct = [];
    if (c.user_id) {
      var uaResp = await _sb.from('user_activity').select('*').eq('user_id', c.user_id).order('created_at', { ascending: false }).limit(20);
      userAct = uaResp.data || [];
    }

    var days = staleDays(c);
    var html = '<div style="margin-bottom:0.5rem"><button class="crm-btn crm-btn-ghost crm-btn-sm" onclick="loadContacts()">&larr; Back to Contacts</button></div>';

    // Stale alert
    if (days >= 30 && ['new','contacted','showing'].includes(c.stage)) {
      html += '<div class="crm-stale-alert red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>You haven\'t reached out in ' + days + ' days</div>';
    } else if (days >= 14 && ['new','contacted','showing'].includes(c.stage)) {
      html += '<div class="crm-stale-alert amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Last contact was ' + days + ' days ago</div>';
    }

    // Header
    html += '<div class="crm-contact-header"><div><div class="crm-contact-name fd">' + esc(c.first_name + ' ' + c.last_name) + '</div><div class="crm-contact-meta"><span><svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>' + esc(c.email || 'No email') + '</span><span><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>' + esc(c.phone || 'No phone') + '</span><span class="crm-badge crm-source-badge">' + (c.source || '') + '</span></div></div><div style="display:flex;gap:0.5rem"><button class="crm-btn crm-btn-primary crm-btn-sm" onclick="quickLogCall(\'' + id + '\')"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72"/></svg>Log Call</button><button class="crm-btn crm-btn-secondary crm-btn-sm" onclick="editContact(\'' + id + '\')">Edit</button></div></div>';

    // Stage selector
    html += '<div class="crm-stage-selector">';
    ['new','contacted','showing','under_contract','closed','past_client'].forEach(function(s) {
      html += '<button class="crm-stage-pill' + (c.stage===s?' active':'') + '" data-stage="' + s + '" onclick="changeStage(\'' + id + '\',\'' + s + '\')">' + stageLabel(s) + '</button>';
    });
    html += '</div>';

    // Tags
    if (c.tags && c.tags.length) {
      html += '<div style="margin-bottom:0.75rem">';
      c.tags.forEach(function(tag) { html += '<span class="crm-tag">' + esc(tag) + '</span>'; });
      html += '</div>';
    }

    // Two-column body
    html += '<div class="crm-contact-body"><div class="crm-contact-left">';

    // Notes section
    html += '<div class="crm-card"><div class="crm-section-title fd">Notes</div>';
    html += '<div class="crm-form-inline" style="margin-bottom:0.75rem"><textarea class="crm-textarea" id="newNote" rows="2" placeholder="Add a note..." style="min-height:50px"></textarea><button class="crm-btn crm-btn-primary crm-btn-sm" onclick="addNote(\'' + id + '\')">Add</button></div>';
    html += '<div class="crm-notes-list">';
    (notesResp.data || []).forEach(function(n) {
      html += '<div class="crm-note-card' + (n.is_pinned?' pinned':'') + '"><div class="crm-note-text">' + esc(n.note_text) + '</div><div class="crm-note-footer"><span class="crm-note-time">' + timeAgo(n.created_at) + '</span><span class="crm-note-pin' + (n.is_pinned?' active':'') + '" onclick="togglePin(\'' + n.id + '\',' + !n.is_pinned + ',\'' + id + '\')">' + (n.is_pinned?'Unpin':'Pin') + '</span></div></div>';
    });
    if (!(notesResp.data || []).length) html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No notes yet</div></div>';
    html += '</div></div>';

    // Chat transcript
    if (c.chat_transcript) {
      html += '<div class="crm-card"><div class="crm-section-title fd">Chat Transcript</div><div class="crm-transcript">' + esc(c.chat_transcript) + '</div></div>';
    }

    // Transactions
    html += '<div class="crm-card"><div class="crm-section-title fd">Transactions</div>';
    if ((txResp.data || []).length) {
      (txResp.data || []).forEach(function(t) {
        html += '<div class="crm-tx-card" onclick="openTransaction(\'' + t.id + '\')"><div class="crm-tx-card-info"><div class="crm-tx-card-address">' + esc(t.property_address || 'No address') + '</div><div class="crm-tx-card-meta">' + t.transaction_type + ' &middot; ' + t.status + (t.close_date ? ' &middot; Close: ' + t.close_date : '') + '</div></div><span class="crm-badge crm-stage-badge" data-stage="' + (t.status==='closed'?'closed':'under_contract') + '">' + t.status + '</span></div>';
      });
    } else { html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No transactions</div></div>'; }
    html += '<button class="crm-btn crm-btn-ghost crm-btn-sm" style="margin-top:0.5rem" onclick="createTransaction(\'' + id + '\')">+ New Transaction</button></div>';

    // Documents
    html += '<div class="crm-card"><div class="crm-section-title fd">Documents</div>';
    if ((docsResp.data || []).length) {
      docsResp.data.forEach(function(d) {
        html += '<div class="crm-today-item"><span>' + esc(d.file_name) + '</span><span class="crm-badge crm-doc-category" data-cat="' + d.category + '">' + d.category + '</span><span class="crm-badge crm-doc-status" data-status="' + d.status + '">' + d.status + '</span></div>';
      });
    } else { html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No documents</div></div>'; }
    html += '</div>';

    html += '</div>'; // end left

    // Right column
    html += '<div class="crm-contact-right">';

    // Tasks
    html += '<div class="crm-card"><div class="crm-section-title fd">Tasks</div>';
    var pendingTasks = (tasksResp.data || []).filter(function(t) { return t.status === 'pending'; });
    pendingTasks.forEach(function(t) {
      var cls = t.due_date && t.due_date < new Date().toISOString().split('T')[0] ? 'overdue' : t.due_date === new Date().toISOString().split('T')[0] ? 'today' : 'future';
      html += '<div class="crm-task-item"><label class="crm-checkbox"><input type="checkbox" onchange="completeTask(\'' + t.id + '\')"><div class="crm-checkbox-box"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div></label><span class="crm-task-title">' + esc(t.title) + '</span><span class="crm-task-due ' + cls + '">' + (t.due_date || '') + '</span></div>';
    });
    if (!pendingTasks.length) html += '<div class="crm-empty-state" style="padding:0.5rem"><div class="crm-empty-state-text">No tasks</div></div>';
    html += '<button class="crm-btn crm-btn-ghost crm-btn-sm" style="margin-top:0.5rem" onclick="fabAddTask()">+ Add Task</button></div>';

    // Activity timeline
    html += '<div class="crm-card"><div class="crm-section-title fd">Activity</div>';
    var allActivity = (actResp.data || []).map(function(a) { return Object.assign({}, a, { _source: 'crm' }); });
    userAct.forEach(function(a) { allActivity.push({ created_at: a.created_at, activity_type: a.activity_type, description: activityLabel(a.activity_type) + (a.property_key ? ' - ' + a.property_key.split('|')[0] : ''), _source: 'user' }); });
    allActivity.sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    html += '<div class="crm-timeline">';
    allActivity.slice(0, 20).forEach(function(a) {
      var dotClass = a._source === 'user' ? 'user-event' : a.activity_type === 'stage_changed' ? 'stage-change' : a.activity_type === 'task_completed' ? 'task-event' : a.activity_type.includes('doc') ? 'doc-event' : 'crm-event';
      html += '<div class="crm-timeline-item"><div class="crm-timeline-dot ' + dotClass + '"></div><div class="crm-timeline-desc">' + esc(a.description || a.activity_type) + '</div><div class="crm-timeline-time">' + timeAgo(a.created_at) + '</div></div>';
    });
    if (!allActivity.length) html += '<div class="crm-empty-state" style="padding:0.5rem"><div class="crm-empty-state-text">No activity yet</div></div>';
    html += '</div></div>';

    html += '</div></div>'; // end right + body

    main.innerHTML = html;
  } catch(e) { console.error('[Contact Detail]', e); main.innerHTML = '<div class="crm-empty-state"><div class="crm-empty-state-title">Error loading contact</div></div>'; }
}

async function changeStage(contactId, newStage) {
  var { data: contact } = await _sb.from('contacts').select('stage').eq('id', contactId).single();
  if (!contact || contact.stage === newStage) return;
  await _sb.from('contacts').update({ stage: newStage, updated_at: new Date().toISOString() }).eq('id', contactId);
  await _sb.from('contact_activity').insert({ contact_id: contactId, activity_type: 'stage_changed', description: 'Stage: ' + stageLabel(contact.stage) + ' → ' + stageLabel(newStage), metadata: { old_stage: contact.stage, new_stage: newStage } });
  if (newStage === 'contacted') {
    await _sb.from('tasks').insert({ contact_id: contactId, title: 'Follow up after initial contact', due_date: addDays(3), priority: 'normal' });
  }
  toast('Stage updated', 'success');
  openContact(contactId);
}

async function addNote(contactId) {
  var ta = document.getElementById('newNote');
  if (!ta || !ta.value.trim()) return;
  await _sb.from('contact_notes').insert({ contact_id: contactId, note_text: ta.value.trim(), created_by: _currentUser.id });
  await _sb.from('contact_activity').insert({ contact_id: contactId, activity_type: 'note_added', description: 'Note added' });
  toast('Note added', 'success');
  openContact(contactId);
}

async function togglePin(noteId, pin, contactId) {
  await _sb.from('contact_notes').update({ is_pinned: pin }).eq('id', noteId);
  openContact(contactId);
}

async function quickLogCall(contactId) {
  showQuickModal('Log Call', '<div class="crm-form-group"><label class="crm-form-label">Notes</label><textarea class="crm-textarea" id="callNotes" rows="3" placeholder="Call notes..."></textarea></div>', async function() {
    var notes = document.getElementById('callNotes').value.trim();
    await _sb.from('contact_activity').insert({ contact_id: contactId, activity_type: 'call_logged', description: notes || 'Phone call logged' });
    await _sb.from('contacts').update({ last_contacted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', contactId);
    toast('Call logged', 'success');
    openContact(contactId);
    return true;
  });
}

async function editContact(id) {
  var { data: c } = await _sb.from('contacts').select('*').eq('id', id).single();
  if (!c) return;
  showQuickModal('Edit Contact', '<div class="crm-form-row"><div class="crm-form-group"><label class="crm-form-label">First Name</label><input class="crm-input" id="editFirst" value="' + esc(c.first_name) + '" /></div><div class="crm-form-group"><label class="crm-form-label">Last Name</label><input class="crm-input" id="editLast" value="' + esc(c.last_name) + '" /></div></div><div class="crm-form-row"><div class="crm-form-group"><label class="crm-form-label">Email</label><input class="crm-input" id="editEmail" value="' + esc(c.email) + '" /></div><div class="crm-form-group"><label class="crm-form-label">Phone</label><input class="crm-input" id="editPhone" value="' + esc(c.phone) + '" /></div></div><div class="crm-form-group"><label class="crm-form-label">Tags (comma-separated)</label><input class="crm-input" id="editTags" value="' + esc((c.tags||[]).join(', ')) + '" /></div>', async function() {
    var tags = document.getElementById('editTags').value.split(',').map(function(t){return t.trim();}).filter(Boolean);
    await _sb.from('contacts').update({ first_name: document.getElementById('editFirst').value.trim(), last_name: document.getElementById('editLast').value.trim(), email: document.getElementById('editEmail').value.trim(), phone: document.getElementById('editPhone').value.trim(), tags: tags, updated_at: new Date().toISOString() }).eq('id', id);
    toast('Contact updated', 'success');
    openContact(id);
    return true;
  });
}

// ══════════════════════════════════════
// PIPELINE (Kanban)
// ══════════════════════════════════════
async function loadPipeline() {
  var main = document.getElementById('crmMain');
  try {
    var { data } = await _sb.from('contacts').select('*').eq('is_archived', false).order('updated_at', { ascending: false });
    var stages = ['new','contacted','showing','under_contract','closed','past_client'];
    var grouped = {};
    stages.forEach(function(s) { grouped[s] = []; });
    (data || []).forEach(function(c) { if (grouped[c.stage]) grouped[c.stage].push(c); });

    var html = '<div class="crm-page-header"><div class="crm-page-title fd">Pipeline</div></div>';
    html += '<div class="crm-kanban">';
    stages.forEach(function(s) {
      var contacts = grouped[s];
      html += '<div class="crm-kanban-col"><div class="crm-kanban-header"><span class="crm-kanban-title" style="color:var(--stage-' + s.replace('_','-') + ')">' + stageLabel(s) + '</span><span class="crm-badge crm-kanban-count" style="background:var(--stage-' + s.replace('_','-') + '-bg);color:var(--stage-' + s.replace('_','-') + ')">' + contacts.length + '</span></div><div class="crm-kanban-cards">';
      contacts.forEach(function(c) {
        var days = staleDays(c);
        var staleHtml = '';
        if (days >= 30) staleHtml = '<span class="crm-stale-dot red"></span>';
        else if (days >= 14) staleHtml = '<span class="crm-stale-dot amber"></span>';
        html += '<div class="crm-kanban-card" onclick="openContact(\'' + c.id + '\')"><div class="crm-kanban-card-name">' + esc(c.first_name + ' ' + c.last_name) + ' ' + staleHtml + '</div><div class="crm-kanban-card-email">' + esc(c.email || '') + '</div><div class="crm-kanban-card-footer"><span class="crm-kanban-card-time">' + timeAgo(c.updated_at) + '</span></div></div>';
      });
      if (!contacts.length) html += '<div class="crm-empty-state" style="padding:1rem;opacity:0.5"><div class="crm-empty-state-text">Empty</div></div>';
      html += '</div></div>';
    });
    html += '</div>';
    main.innerHTML = html;
  } catch(e) { console.error('[Pipeline]', e); main.innerHTML = '<div class="crm-empty-state"><div class="crm-empty-state-title">Error loading pipeline</div></div>'; }
}

// ══════════════════════════════════════
// TASKS
// ══════════════════════════════════════
async function loadTasks() {
  var main = document.getElementById('crmMain');
  try {
    var { data } = await _sb.from('tasks').select('*, contacts(id, first_name, last_name)').order('due_date').limit(100);
    var today = new Date().toISOString().split('T')[0];
    var pending = (data || []).filter(function(t) { return t.status === 'pending'; });
    var completed = (data || []).filter(function(t) { return t.status === 'completed'; });
    var overdue = pending.filter(function(t) { return t.due_date && t.due_date < today; });
    var todayTasks = pending.filter(function(t) { return t.due_date === today; });
    var upcoming = pending.filter(function(t) { return !t.due_date || t.due_date > today; });

    var html = '<div class="crm-page-header"><div><div class="crm-page-title fd">Tasks</div><div class="crm-page-subtitle">' + pending.length + ' pending</div></div><button class="crm-btn crm-btn-primary" onclick="fabAddTask()"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Task</button></div>';

    if (overdue.length) {
      html += '<div class="crm-task-section"><div class="crm-task-section-title overdue"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>Overdue (' + overdue.length + ')</div><div class="crm-task-list">';
      overdue.forEach(function(t) { html += taskRow(t, 'overdue'); });
      html += '</div></div>';
    }
    if (todayTasks.length) {
      html += '<div class="crm-task-section"><div class="crm-task-section-title today">Today (' + todayTasks.length + ')</div><div class="crm-task-list">';
      todayTasks.forEach(function(t) { html += taskRow(t, 'today'); });
      html += '</div></div>';
    }
    html += '<div class="crm-task-section"><div class="crm-task-section-title upcoming">Upcoming (' + upcoming.length + ')</div><div class="crm-task-list">';
    upcoming.forEach(function(t) { html += taskRow(t, 'future'); });
    if (!upcoming.length) html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No upcoming tasks</div></div>';
    html += '</div></div>';

    if (completed.length) {
      html += '<div class="crm-task-section"><div class="crm-task-section-title completed" onclick="document.getElementById(\'completedTasks\').style.display=document.getElementById(\'completedTasks\').style.display===\'none\'?\'block\':\'none\'">Completed (' + completed.length + ') &#9660;</div><div class="crm-task-list" id="completedTasks" style="display:none">';
      completed.slice(0, 20).forEach(function(t) { html += taskRow(t, 'completed'); });
      html += '</div></div>';
    }

    main.innerHTML = html;
  } catch(e) { console.error('[Tasks]', e); }
}

function taskRow(t, cls) {
  var cName = t.contacts ? t.contacts.first_name + ' ' + t.contacts.last_name : '';
  var isCompleted = t.status === 'completed';
  return '<div class="crm-task-item' + (isCompleted?' completed':'') + '"><label class="crm-checkbox"><input type="checkbox" ' + (isCompleted?'checked disabled':'onchange="completeTask(\'' + t.id + '\')"') + '><div class="crm-checkbox-box"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div></label><span class="crm-task-title">' + esc(t.title) + '</span>' + (cName ? '<span class="crm-task-contact" onclick="openContact(\'' + t.contact_id + '\')">' + esc(cName) + '</span>' : '') + '<span class="crm-task-due ' + cls + '">' + (t.due_date || 'No date') + '</span><span class="crm-badge crm-priority-badge" data-priority="' + t.priority + '">' + t.priority + '</span></div>';
}

async function completeTask(taskId) {
  await _sb.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', taskId);
  var { data: task } = await _sb.from('tasks').select('contact_id, title').eq('id', taskId).single();
  if (task && task.contact_id) {
    await _sb.from('contact_activity').insert({ contact_id: task.contact_id, activity_type: 'task_completed', description: 'Completed: ' + task.title });
  }
  toast('Task completed', 'success');
  if (_currentTab === 'tasks') loadTasks();
  else if (_currentTab === 'today') loadToday();
}

// ══════════════════════════════════════
// DOCUMENTS
// ══════════════════════════════════════
async function loadDocuments() {
  var main = document.getElementById('crmMain');
  try {
    var { data } = await _sb.from('documents').select('*, contacts(first_name, last_name), transactions(property_address)').eq('is_template', false).order('created_at', { ascending: false }).limit(100);
    var { data: templates } = await _sb.from('documents').select('*').eq('is_template', true).order('file_name');

    var html = '<div class="crm-page-header"><div><div class="crm-page-title fd">Documents</div><div class="crm-page-subtitle">' + (data||[]).length + ' documents</div></div></div>';

    // Upload area
    html += '<div class="crm-doc-upload" id="docUpload" onclick="document.getElementById(\'docFileInput\').click()"><div class="crm-doc-upload-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div><div class="crm-doc-upload-text">Drop files here or click to browse</div><div class="crm-doc-upload-hint">PDF, images, documents up to 50MB</div></div>';
    html += '<input type="file" id="docFileInput" style="display:none" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif" onchange="handleDocUpload(this.files)" />';

    // Templates section
    if (templates && templates.length) {
      html += '<div class="crm-section-title fd" style="margin-top:1.5rem">Templates</div>';
      html += '<div class="crm-doc-grid">';
      templates.forEach(function(d) { html += docCard(d); });
      html += '</div>';
    }

    // Documents grid
    html += '<div class="crm-section-title fd" style="margin-top:1.5rem">All Documents</div>';
    if (data && data.length) {
      html += '<div class="crm-doc-grid">';
      data.forEach(function(d) { html += docCard(d); });
      html += '</div>';
    } else {
      html += '<div class="crm-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg><div class="crm-empty-state-title">No documents yet</div><div class="crm-empty-state-text">Upload your first document above</div></div>';
    }
    main.innerHTML = html;
    initDragDrop();
  } catch(e) { console.error('[Documents]', e); }
}

function docCard(d) {
  var cName = d.contacts ? d.contacts.first_name + ' ' + d.contacts.last_name : '';
  var txAddr = d.transactions ? d.transactions.property_address : '';
  return '<div class="crm-doc-card"><div class="crm-doc-card-header"><div class="crm-doc-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg></div><div><div class="crm-doc-card-name">' + esc(d.file_name) + '</div><div class="crm-doc-card-size">' + formatSize(d.file_size) + (cName ? ' &middot; ' + esc(cName) : '') + (txAddr ? ' &middot; ' + esc(txAddr) : '') + '</div></div></div><div class="crm-doc-card-badges"><span class="crm-badge crm-doc-category" data-cat="' + d.category + '">' + d.category + '</span><span class="crm-badge crm-doc-status" data-status="' + d.status + '">' + d.status + '</span></div><div class="crm-doc-card-actions"><button class="crm-btn crm-btn-ghost crm-btn-sm" onclick="previewDoc(\'' + d.id + '\')">Preview</button><button class="crm-btn crm-btn-ghost crm-btn-sm" onclick="sendDoc(\'' + d.id + '\')">Send</button><button class="crm-btn crm-btn-danger crm-btn-sm" onclick="deleteDoc(\'' + d.id + '\')">Delete</button></div></div>';
}

function initDragDrop() {
  var area = document.getElementById('docUpload');
  if (!area) return;
  ['dragenter','dragover'].forEach(function(ev) { area.addEventListener(ev, function(e) { e.preventDefault(); area.classList.add('dragover'); }); });
  ['dragleave','drop'].forEach(function(ev) { area.addEventListener(ev, function(e) { e.preventDefault(); area.classList.remove('dragover'); }); });
  area.addEventListener('drop', function(e) { handleDocUpload(e.dataTransfer.files); });
}

async function handleDocUpload(files) {
  if (!files || !files.length) return;
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var path = 'general/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    try {
      var { error: uploadError } = await _sb.storage.from('documents').upload(path, file);
      if (uploadError) { toast('Upload failed: ' + uploadError.message, 'error'); continue; }
      await _sb.from('documents').insert({ file_name: file.name, file_path: path, file_size: file.size, file_type: file.type, uploaded_by: _currentUser.id });
      toast(file.name + ' uploaded', 'success');
    } catch(e) { toast('Upload error', 'error'); console.error(e); }
  }
  loadDocuments();
}

async function previewDoc(docId) {
  var { data: doc } = await _sb.from('documents').select('*').eq('id', docId).single();
  if (!doc) return;
  var { data: urlData } = await _sb.storage.from('documents').createSignedUrl(doc.file_path, 3600);
  if (!urlData || !urlData.signedUrl) { toast('Could not load preview', 'error'); return; }
  var overlay = document.createElement('div');
  overlay.className = 'crm-doc-preview-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = '<div class="crm-doc-preview-panel"><div class="crm-doc-preview-header"><span style="font-weight:500">' + esc(doc.file_name) + '</span><button class="crm-btn crm-btn-ghost crm-btn-sm" onclick="this.closest(\'.crm-doc-preview-overlay\').remove()">Close</button></div><div class="crm-doc-preview-body"><iframe src="' + urlData.signedUrl + '"></iframe></div></div>';
  document.body.appendChild(overlay);
}

async function sendDoc(docId) {
  var token = crypto.randomUUID();
  var expires = new Date(Date.now() + 7 * 86400000).toISOString();
  await _sb.from('documents').update({ share_token: token, share_expires_at: expires, status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', docId);
  var url = window.location.origin + '/doc.html?token=' + token;
  await navigator.clipboard.writeText(url);
  toast('Share link copied to clipboard!', 'success');
  if (_currentTab === 'documents') loadDocuments();
}

async function deleteDoc(docId) {
  if (!confirm('Delete this document?')) return;
  var { data: doc } = await _sb.from('documents').select('file_path').eq('id', docId).single();
  if (doc) await _sb.storage.from('documents').remove([doc.file_path]);
  await _sb.from('documents').delete().eq('id', docId);
  toast('Document deleted', 'success');
  loadDocuments();
}

// ══════════════════════════════════════
// TRANSACTIONS
// ══════════════════════════════════════
async function loadTransactions() {
  var main = document.getElementById('crmMain');
  try {
    var { data } = await _sb.from('transactions').select('*, contacts(first_name, last_name)').order('created_at', { ascending: false }).limit(50);
    var html = '<div class="crm-page-header"><div><div class="crm-page-title fd">Transactions</div><div class="crm-page-subtitle">' + (data||[]).length + ' transactions</div></div><button class="crm-btn crm-btn-primary" onclick="createTransaction()"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Transaction</button></div>';

    if (data && data.length) {
      data.forEach(function(t) {
        var cName = t.contacts ? t.contacts.first_name + ' ' + t.contacts.last_name : 'No client';
        html += '<div class="crm-tx-card" onclick="openTransaction(\'' + t.id + '\')"><div class="crm-tx-card-info"><div class="crm-tx-card-address">' + esc(t.property_address || 'No address') + '</div><div class="crm-tx-card-meta">' + esc(cName) + ' &middot; ' + t.transaction_type + (t.contract_price ? ' &middot; $' + t.contract_price.toLocaleString() : '') + (t.close_date ? ' &middot; Close: ' + t.close_date : '') + '</div></div><span class="crm-badge crm-stage-badge" data-stage="' + (t.status==='closed'?'closed':'under_contract') + '">' + t.status + '</span></div>';
      });
    } else {
      html += '<div class="crm-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg><div class="crm-empty-state-title">No transactions yet</div><div class="crm-empty-state-text">Create your first transaction to start tracking deals</div></div>';
    }
    main.innerHTML = html;
  } catch(e) { console.error('[Transactions]', e); }
}

var PURCHASE_CHECKLIST = ['Offer Submitted', 'Offer Accepted', 'Earnest Money Deposited', 'Inspection Scheduled', 'Inspection Complete', 'Appraisal Ordered', 'Appraisal Complete', 'Title Search', 'Loan Approval', 'Final Walk-Through', 'Closing'];
var SALE_CHECKLIST = ['Listing Agreement Signed', 'Disclosure Forms Complete', 'Offer Received', 'Offer Accepted', 'Inspection Complete', 'Appraisal Complete', 'Title Work', 'Closing'];

async function createTransaction(preContactId) {
  showQuickModal('New Transaction', '<div class="crm-form-group"><label class="crm-form-label">Client</label><select class="crm-select" id="txContact"><option value="">Select...</option></select></div><div class="crm-form-group"><label class="crm-form-label">Property Address</label><input class="crm-input" id="txAddress" /></div><div class="crm-form-row"><div class="crm-form-group"><label class="crm-form-label">Type</label><select class="crm-select" id="txType"><option value="purchase">Purchase</option><option value="sale">Sale</option><option value="lease">Lease</option></select></div><div class="crm-form-group"><label class="crm-form-label">Contract Price</label><input class="crm-input" id="txPrice" type="number" /></div></div><div class="crm-form-group"><label class="crm-form-label">Expected Close Date</label><input class="crm-input" id="txClose" type="date" /></div>', async function() {
    var cid = document.getElementById('txContact').value;
    var addr = document.getElementById('txAddress').value.trim();
    var type = document.getElementById('txType').value;
    var price = parseInt(document.getElementById('txPrice').value) || null;
    var close = document.getElementById('txClose').value || null;
    if (!addr) { toast('Enter property address', 'error'); return false; }

    var { data: tx } = await _sb.from('transactions').insert({ contact_id: cid || null, property_address: addr, transaction_type: type, contract_price: price, close_date: close }).select().single();

    // Auto-populate checklist
    var checklist = type === 'sale' ? SALE_CHECKLIST : PURCHASE_CHECKLIST;
    var items = checklist.map(function(title, i) { return { transaction_id: tx.id, title: title, sort_order: i }; });
    await _sb.from('transaction_checklist').insert(items);

    if (cid) {
      await _sb.from('contact_activity').insert({ contact_id: cid, activity_type: 'transaction_created', description: 'Transaction created: ' + addr });
    }
    toast('Transaction created', 'success');
    openTransaction(tx.id);
    return true;
  });
  loadContactDropdown('txContact');
  if (preContactId) setTimeout(function() { var sel = document.getElementById('txContact'); if (sel) sel.value = preContactId; }, 500);
}

async function openTransaction(id) {
  var main = document.getElementById('crmMain');
  main.innerHTML = '<div class="crm-loading"><div class="crm-spinner"></div></div>';
  try {
    var [txResp, checkResp, docsResp] = await Promise.all([
      _sb.from('transactions').select('*, contacts(id, first_name, last_name, email)').eq('id', id).single(),
      _sb.from('transaction_checklist').select('*, documents(file_name)').eq('transaction_id', id).order('sort_order'),
      _sb.from('documents').select('*').eq('transaction_id', id).order('created_at', { ascending: false })
    ]);

    var tx = txResp.data;
    if (!tx) { main.innerHTML = '<div class="crm-empty-state"><div class="crm-empty-state-title">Transaction not found</div></div>'; return; }
    var cName = tx.contacts ? tx.contacts.first_name + ' ' + tx.contacts.last_name : 'No client';
    var items = checkResp.data || [];
    var completedCount = items.filter(function(i) { return i.is_completed; }).length;

    var html = '<div style="margin-bottom:0.5rem"><button class="crm-btn crm-btn-ghost crm-btn-sm" onclick="loadTransactions()">&larr; Back</button></div>';

    // Header
    html += '<div class="crm-page-header"><div><div class="crm-page-title fd">' + esc(tx.property_address || 'Transaction') + '</div><div class="crm-page-subtitle">' + esc(cName) + ' &middot; ' + tx.transaction_type + (tx.contract_price ? ' &middot; $' + tx.contract_price.toLocaleString() : '') + ' &middot; ' + tx.status + (tx.close_date ? ' &middot; Close: ' + tx.close_date : '') + '</div></div></div>';

    // Visual timeline bar
    if (items.length) {
      html += '<div class="crm-tx-timeline-bar">';
      items.forEach(function(item, idx) {
        var cls = item.is_completed ? 'completed' : (idx === completedCount ? 'active' : '');
        html += '<div class="crm-tx-milestone ' + cls + '"><div class="crm-tx-milestone-dot"><svg viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5"/></svg></div><div class="crm-tx-milestone-label">' + esc(item.title) + '</div>' + (idx < items.length - 1 ? '<div class="crm-tx-milestone-line"></div>' : '') + '</div>';
      });
      html += '</div>';
    }

    // Checklist
    html += '<div class="crm-card"><div class="crm-section-title fd">Checklist (' + completedCount + '/' + items.length + ')</div>';
    html += '<div class="crm-tx-checklist">';
    items.forEach(function(item) {
      html += '<div class="crm-tx-checklist-item' + (item.is_completed?' completed':'') + '"><label class="crm-checkbox"><input type="checkbox" ' + (item.is_completed?'checked':'') + ' onchange="toggleChecklistItem(\'' + item.id + '\',' + !item.is_completed + ',\'' + id + '\')"><div class="crm-checkbox-box"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div></label><span class="crm-tx-checklist-title">' + esc(item.title) + '</span>' + (item.due_date ? '<span class="crm-tx-checklist-due">' + item.due_date + '</span>' : '') + (item.documents ? '<span class="crm-tx-checklist-doc">' + esc(item.documents.file_name) + '</span>' : '') + '</div>';
    });
    html += '</div></div>';

    // Documents
    html += '<div class="crm-card"><div class="crm-section-title fd">Documents</div>';
    html += '<div class="crm-doc-upload" style="padding:1rem;margin-bottom:0.75rem" onclick="document.getElementById(\'txDocInput\').click()"><div class="crm-doc-upload-text" style="font-size:0.75rem">Upload document for this transaction</div></div>';
    html += '<input type="file" id="txDocInput" style="display:none" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onchange="handleTxDocUpload(this.files,\'' + id + '\',\'' + (tx.contact_id||'') + '\')" />';
    if ((docsResp.data || []).length) {
      html += '<div class="crm-doc-grid">';
      docsResp.data.forEach(function(d) { html += docCard(d); });
      html += '</div>';
    }
    html += '</div>';

    main.innerHTML = html;
  } catch(e) { console.error('[Transaction Detail]', e); }
}

async function toggleChecklistItem(itemId, checked, txId) {
  await _sb.from('transaction_checklist').update({ is_completed: checked, completed_at: checked ? new Date().toISOString() : null }).eq('id', itemId);
  openTransaction(txId);
}

async function handleTxDocUpload(files, txId, contactId) {
  if (!files || !files.length) return;
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var path = (contactId || 'general') + '/' + txId + '/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    try {
      var { error: uploadError } = await _sb.storage.from('documents').upload(path, file);
      if (uploadError) { toast('Upload failed: ' + uploadError.message, 'error'); continue; }
      await _sb.from('documents').insert({ file_name: file.name, file_path: path, file_size: file.size, file_type: file.type, contact_id: contactId || null, transaction_id: txId, uploaded_by: _currentUser.id });
      toast(file.name + ' uploaded', 'success');
    } catch(e) { toast('Upload error', 'error'); }
  }
  openTransaction(txId);
}

// ══════════════════════════════════════
// SHOWINGS (ported from app.js)
// ══════════════════════════════════════
async function loadShowings() {
  var main = document.getElementById('crmMain');
  try {
    var { data } = await _sb.from('showing_requests').select('*').order('created_at', { ascending: false }).limit(50);
    var html = '<div class="crm-page-header"><div class="crm-page-title fd">Showings</div></div>';
    if (!data || !data.length) { main.innerHTML = html + '<div class="crm-empty-state"><div class="crm-empty-state-title">No showing requests yet</div></div>'; return; }

    data.forEach(function(s) {
      var pd = s.property_data || {};
      var slots = s.preferred_slots || [];
      html += '<div class="crm-card" style="margin-bottom:0.75rem"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem"><div><strong>' + esc(pd.address || 'Unknown') + '</strong>, ' + esc(pd.city || '') + '</div><span class="crm-badge crm-stage-badge" data-stage="' + (s.status==='confirmed'?'closed':s.status==='cancelled'?'past_client':'under_contract') + '">' + s.status + '</span></div>';
      html += '<div style="font-size:0.75rem;color:var(--crm-text-secondary);margin-bottom:0.5rem">' + esc(s.user_name || '') + ' &middot; ' + esc(s.user_email || '') + ' &middot; ' + esc(s.user_phone || '') + '</div>';
      html += '<div style="font-size:0.72rem;margin-bottom:0.5rem"><strong>Preferred:</strong> ';
      slots.forEach(function(sl, i) { html += (i + 1) + '. ' + sl.date + ' at ' + sl.time + '  '; });
      html += '</div>';
      if (s.status === 'pending') {
        html += '<div style="display:flex;gap:0.5rem;align-items:center"><select class="crm-select crm-btn-sm" id="confirmSlot_' + s.id + '" style="max-width:200px">';
        slots.forEach(function(sl, i) { html += '<option value="' + i + '">' + sl.date + ' ' + sl.time + '</option>'; });
        html += '</select><button class="crm-btn crm-btn-primary crm-btn-sm" onclick="confirmShowing(\'' + s.id + '\')">Confirm</button><button class="crm-btn crm-btn-danger crm-btn-sm" onclick="updateShowingStatus(\'' + s.id + '\',\'cancelled\')">Cancel</button></div>';
      }
      html += '</div>';
    });
    main.innerHTML = html;
  } catch(e) { console.error('[Showings]', e); }
}

async function confirmShowing(id) {
  try {
    var sel = document.getElementById('confirmSlot_' + id);
    if (!sel) return;
    var { data } = await _sb.from('showing_requests').select('preferred_slots').eq('id', id).single();
    var slot = data.preferred_slots[parseInt(sel.value)];
    await _sb.from('showing_requests').update({ status: 'confirmed', confirmed_slot: slot, updated_at: new Date().toISOString() }).eq('id', id);
    toast('Showing confirmed', 'success');
    loadShowings();
  } catch(e) { toast('Error confirming showing', 'error'); }
}

async function updateShowingStatus(id, status) {
  await _sb.from('showing_requests').update({ status: status, updated_at: new Date().toISOString() }).eq('id', id);
  toast('Showing ' + status, 'success');
  loadShowings();
}

// ══════════════════════════════════════
// QUESTIONS (ported from app.js)
// ══════════════════════════════════════
async function loadQuestions() {
  var main = document.getElementById('crmMain');
  try {
    var { data } = await _sb.from('property_questions').select('*').order('created_at', { ascending: false }).limit(50);
    var unanswered = (data || []).filter(function(q) { return !q.response_text; });
    var answered = (data || []).filter(function(q) { return q.response_text; });

    var html = '<div class="crm-page-header"><div class="crm-page-title fd">Questions (' + unanswered.length + ' unanswered)</div></div>';

    if (unanswered.length) {
      html += '<div class="crm-section-title fd">Unanswered</div>';
      unanswered.forEach(function(q) {
        var pd = q.property_data || {};
        html += '<div class="crm-card" style="margin-bottom:0.75rem;border-left:3px solid var(--crm-amber)"><div style="display:flex;justify-content:space-between;margin-bottom:0.4rem"><span style="font-weight:500">' + esc(pd.address || '') + '</span><span style="font-size:0.68rem;color:var(--crm-text-muted)">' + esc(q.user_name || '') + ' &middot; ' + timeAgo(q.created_at) + '</span></div><div style="font-size:0.78rem;margin-bottom:0.5rem">' + esc(q.question_text) + '</div><div class="crm-form-inline"><textarea class="crm-textarea" id="qReply_' + q.id + '" rows="2" placeholder="Type response..." style="min-height:40px"></textarea><button class="crm-btn crm-btn-primary crm-btn-sm" onclick="replyToQuestion(\'' + q.id + '\')">Reply</button></div></div>';
      });
    }

    if (answered.length) {
      html += '<div class="crm-section-title fd" style="margin-top:1.5rem">Answered</div>';
      answered.forEach(function(q) {
        var pd = q.property_data || {};
        html += '<div class="crm-card" style="margin-bottom:0.5rem;opacity:0.7"><div style="font-weight:500;font-size:0.78rem">' + esc(pd.address || '') + ' — ' + esc(q.user_name || '') + '</div><div style="font-size:0.75rem;margin:0.3rem 0">' + esc(q.question_text) + '</div><div style="font-size:0.75rem;color:var(--crm-green)"><strong>Reply:</strong> ' + esc(q.response_text) + '</div></div>';
      });
    }

    if (!data || !data.length) html += '<div class="crm-empty-state"><div class="crm-empty-state-title">No questions yet</div></div>';
    main.innerHTML = html;
  } catch(e) { console.error('[Questions]', e); }
}

async function replyToQuestion(id) {
  var ta = document.getElementById('qReply_' + id);
  if (!ta || !ta.value.trim()) return;
  await _sb.from('property_questions').update({ response_text: ta.value.trim(), responded_at: new Date().toISOString() }).eq('id', id);
  var { data: q } = await _sb.from('property_questions').select('user_id, property_key, property_data').eq('id', id).single();
  if (q && q.user_id) {
    await _sb.from('alert_notifications').insert({ user_id: q.user_id, alert_type: 'question_response', property_key: q.property_key, title: 'Cory answered your question', message: 'Your question about ' + ((q.property_data || {}).address || 'a property') + ' has been answered.' });
  }
  toast('Reply sent', 'success');
  loadQuestions();
}

// ══════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════
async function loadAnalytics() {
  var main = document.getElementById('crmMain');
  try {
    var weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    var monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    var [contactsResp, viewsResp, favsResp, usersResp, closedResp, reachedResp, leadsResp] = await Promise.all([
      _sb.from('contacts').select('id, source, stage, created_at', { count: 'exact' }).eq('is_archived', false),
      _sb.from('viewing_history').select('id', { count: 'exact' }),
      _sb.from('favorites').select('id', { count: 'exact' }),
      _sb.from('profiles').select('id, first_name, last_name, email, created_at', { count: 'exact' }).order('created_at', { ascending: false }).limit(20),
      _sb.from('transactions').select('id', { count: 'exact' }).eq('status', 'closed'),
      _sb.from('contacts').select('id', { count: 'exact' }).gte('last_contacted_at', weekAgo),
      _sb.from('contacts').select('id, source').gte('created_at', monthAgo)
    ]);

    var html = '<div class="crm-page-header"><div class="crm-page-title fd">Analytics</div></div>';

    // Stats
    html += '<div class="crm-stats-grid">';
    html += statCard(contactsResp.count || 0, 'Total Contacts', 'accent');
    html += statCard(usersResp.count || 0, 'Registered Users', 'blue');
    html += statCard(viewsResp.count || 0, 'Property Views', 'teal');
    html += statCard(favsResp.count || 0, 'Favorites', 'purple');
    html += statCard(closedResp.count || 0, 'Deals Closed', 'green');
    html += statCard(reachedResp.count || 0, 'Reached This Week', 'amber');
    html += '</div>';

    // Lead sources
    var sources = {};
    (leadsResp.data || []).forEach(function(l) { sources[l.source] = (sources[l.source] || 0) + 1; });
    html += '<div class="crm-card"><div class="crm-section-title fd">Lead Sources (Last 30 Days)</div>';
    Object.keys(sources).sort(function(a, b) { return sources[b] - sources[a]; }).forEach(function(s) {
      var pct = Math.round(sources[s] / (leadsResp.data || []).length * 100);
      html += '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem"><span style="width:120px;font-size:0.75rem;font-weight:500">' + s + '</span><div style="flex:1;height:8px;background:var(--crm-bg-surface);border-radius:4px;overflow:hidden"><div style="width:' + pct + '%;height:100%;background:var(--crm-accent);border-radius:4px;transition:width 0.3s"></div></div><span style="font-size:0.72rem;color:var(--crm-text-muted);min-width:40px;text-align:right">' + sources[s] + '</span></div>';
    });
    if (!Object.keys(sources).length) html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No lead data this month</div></div>';
    html += '</div>';

    // Pipeline breakdown
    var stageCount = {};
    (contactsResp.data || []).forEach(function(c) { stageCount[c.stage] = (stageCount[c.stage] || 0) + 1; });
    html += '<div class="crm-card"><div class="crm-section-title fd">Pipeline Breakdown</div>';
    ['new','contacted','showing','under_contract','closed','past_client'].forEach(function(s) {
      var count = stageCount[s] || 0;
      html += '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.4rem"><span style="width:120px;font-size:0.75rem">' + stageLabel(s) + '</span><div style="flex:1;height:8px;background:var(--crm-bg-surface);border-radius:4px;overflow:hidden"><div style="width:' + Math.round(count / Math.max(contactsResp.count || 1, 1) * 100) + '%;height:100%;background:var(--stage-' + s.replace('_','-') + ');border-radius:4px"></div></div><span style="font-size:0.72rem;color:var(--crm-text-muted)">' + count + '</span></div>';
    });
    html += '</div>';

    // Recent users
    if (usersResp.data && usersResp.data.length) {
      html += '<div class="crm-card"><div class="crm-section-title fd">Recent Signups</div>';
      html += '<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Name</th><th>Email</th><th>Joined</th></tr></thead><tbody>';
      usersResp.data.forEach(function(u) {
        html += '<tr><td>' + esc((u.first_name||'') + ' ' + (u.last_name||'')) + '</td><td>' + esc(u.email||'') + '</td><td class="crm-table-muted">' + new Date(u.created_at).toLocaleDateString() + '</td></tr>';
      });
      html += '</tbody></table></div></div>';
    }

    main.innerHTML = html;
  } catch(e) { console.error('[Analytics]', e); }
}

// ══════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════
function esc(str) { if (!str) return ''; var d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

function timeAgo(dateStr) {
  if (!dateStr) return '';
  var diff = Date.now() - new Date(dateStr).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  var days = Math.floor(hrs / 24);
  if (days < 30) return days + 'd ago';
  var months = Math.floor(days / 30);
  return months + 'mo ago';
}

function staleDays(contact) {
  if (!contact.last_contacted_at) {
    return Math.floor((Date.now() - new Date(contact.created_at).getTime()) / 86400000);
  }
  return Math.floor((Date.now() - new Date(contact.last_contacted_at).getTime()) / 86400000);
}

function stageLabel(stage) {
  var labels = { new: 'New', contacted: 'Contacted', showing: 'Showing', under_contract: 'Under Contract', closed: 'Closed', past_client: 'Past Client' };
  return labels[stage] || stage;
}

function activityLabel(type) {
  var labels = { property_view: 'Viewed property', favorite_added: 'Favorited property', favorite_removed: 'Unfavorited property', showing_requested: 'Requested showing', question_asked: 'Asked question', search_saved: 'Saved search', account_created: 'Created account' };
  return labels[type] || type;
}

function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; }

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function renderActivityList(activities) {
  if (!activities || !activities.length) return '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No recent activity</div></div>';
  var html = '<div class="crm-timeline">';
  activities.forEach(function(a) {
    var dotClass = a.activity_type === 'stage_changed' ? 'stage-change' : a.activity_type === 'task_completed' ? 'task-event' : a.activity_type.includes('doc') ? 'doc-event' : 'crm-event';
    html += '<div class="crm-timeline-item"><div class="crm-timeline-dot ' + dotClass + '"></div><div class="crm-timeline-desc">' + esc(a.description || a.activity_type) + '</div><div class="crm-timeline-time">' + timeAgo(a.created_at) + '</div></div>';
  });
  html += '</div>';
  return html;
}

// ═══════════════════════════════════════════════════════════════
// LISTINGS TAB — Full MLS Research Tool
// ═══════════════════════════════════════════════════════════════

var _listingsCache = [];
var _listingsFilters = { search: '', status: '', type: '', city: '', feed: '', priceMin: '', priceMax: '' };
var _listingsSort = { col: 'list_price', asc: false };
var _listingsDetailOpen = null; // listing_key of expanded row

async function loadListings() {
  var main = document.getElementById('crmMain');
  if (!_listingsCache.length) {
    main.innerHTML = '<div class="crm-loading"><div class="crm-spinner"></div></div>';
    try {
      var data = [];
      var from = 0;
      var pageSize = 1000;
      while (true) {
        var resp = await _sb.from('mls_listings').select('*').range(from, from + pageSize - 1);
        if (resp.error) throw resp.error;
        if (!resp.data || !resp.data.length) break;
        data = data.concat(resp.data);
        if (resp.data.length < pageSize) break;
        from += pageSize;
      }
      _listingsCache = data;
    } catch(e) {
      console.error('[Listings]', e);
      main.innerHTML = '<div class="crm-empty-state"><div class="crm-empty-state-title">Error loading listings</div><div class="crm-empty-state-text">' + esc(e.message || 'Unknown error') + '</div></div>';
      return;
    }
  }
  renderListingsTab();
}

function renderListingsTab() {
  var main = document.getElementById('crmMain');
  var filtered = filterListings();

  // Unique cities for dropdown
  var cities = {};
  _listingsCache.forEach(function(l) { if (l.city) cities[l.city] = true; });
  var cityOptions = Object.keys(cities).sort();

  var html = '<div class="crm-page-header"><div><div class="crm-page-title fd">MLS Listings</div><div class="crm-page-subtitle">' + filtered.length + ' of ' + _listingsCache.length + ' listings</div></div></div>';

  // Filters
  html += '<div class="listings-filters">';
  html += '<input class="crm-input listings-search" placeholder="Search address, MLS#, agent..." value="' + esc(_listingsFilters.search) + '" oninput="filterListingsBy(\'search\',this.value)" />';
  html += '<select class="crm-select" onchange="filterListingsBy(\'status\',this.value)"><option value="">All Statuses</option>';
  ['Active', 'Under Contract', 'Closed', 'Expired', 'Withdrawn'].forEach(function(s) {
    html += '<option value="' + s + '"' + (_listingsFilters.status === s ? ' selected' : '') + '>' + s + '</option>';
  });
  html += '</select>';
  html += '<select class="crm-select" onchange="filterListingsBy(\'type\',this.value)"><option value="">All Types</option>';
  ['Single Family', 'Cabin', 'Land', 'Condo', 'Townhouse', 'Multi Family'].forEach(function(s) {
    html += '<option value="' + s + '"' + (_listingsFilters.type === s ? ' selected' : '') + '>' + s + '</option>';
  });
  html += '</select>';
  html += '<select class="crm-select" onchange="filterListingsBy(\'city\',this.value)"><option value="">All Cities</option>';
  cityOptions.forEach(function(c) {
    html += '<option value="' + c + '"' + (_listingsFilters.city === c ? ' selected' : '') + '>' + c + '</option>';
  });
  html += '</select>';
  html += '<select class="crm-select" onchange="filterListingsBy(\'feed\',this.value)"><option value="">All Feeds</option><option value="IDX"' + (_listingsFilters.feed === 'IDX' ? ' selected' : '') + '>IDX Only</option><option value="BBO"' + (_listingsFilters.feed === 'BBO' ? ' selected' : '') + '>BBO Only</option></select>';
  html += '<select class="crm-select" onchange="filterListingsBy(\'priceMax\',this.value)"><option value="">Any Price</option>';
  [200000,400000,700000,1000000,2000000].forEach(function(p) {
    html += '<option value="' + p + '"' + (_listingsFilters.priceMax == p ? ' selected' : '') + '>Under $' + (p >= 1000000 ? (p/1000000) + 'M' : (p/1000) + 'K') + '</option>';
  });
  html += '</select>';
  html += '</div>';

  // Table
  html += '<div class="crm-table-wrap listings-table-wrap"><table class="crm-table listings-table"><thead><tr>';
  var cols = [
    { key: 'standard_status', label: 'Status', w: '90px' },
    { key: 'listing_id', label: 'MLS#', w: '90px' },
    { key: 'full_address', label: 'Address', w: '' },
    { key: 'city', label: 'City', w: '110px' },
    { key: 'property_type', label: 'Type', w: '100px' },
    { key: 'list_price', label: 'Price', w: '100px' },
    { key: 'days_on_market', label: 'DOM', w: '55px' },
    { key: 'list_agent_full_name', label: 'List Agent', w: '130px' },
    { key: 'list_office_name', label: 'Office', w: '140px' },
    { key: 'feed_type', label: 'Feed', w: '55px' }
  ];
  cols.forEach(function(c) {
    var arrow = _listingsSort.col === c.key ? (_listingsSort.asc ? ' ↑' : ' ↓') : '';
    html += '<th style="' + (c.w ? 'width:' + c.w : '') + ';cursor:pointer" onclick="sortListings(\'' + c.key + '\')">' + c.label + arrow + '</th>';
  });
  html += '</tr></thead><tbody>';

  if (filtered.length) {
    filtered.slice(0, 200).forEach(function(l) {
      var statusClass = (l.standard_status || '').toLowerCase().replace(/\s+/g, '-');
      html += '<tr class="listings-row" onclick="toggleListingDetail(\'' + esc(l.listing_key) + '\')">';
      html += '<td><span class="listings-status-dot ' + statusClass + '">' + esc(l.standard_status || '—') + '</span></td>';
      html += '<td class="crm-table-muted">' + esc(l.listing_id || '') + '</td>';
      html += '<td>' + esc(l.full_address || '') + '</td>';
      html += '<td>' + esc(l.city || '') + '</td>';
      html += '<td>' + esc(l.property_type || '') + '</td>';
      html += '<td>$' + (l.list_price ? l.list_price.toLocaleString() : '—') + '</td>';
      html += '<td class="crm-table-muted">' + (l.days_on_market || '—') + '</td>';
      html += '<td class="crm-table-muted">' + esc(l.list_agent_full_name || '') + '</td>';
      html += '<td class="crm-table-muted">' + esc(l.list_office_name || '') + '</td>';
      html += '<td><span class="listings-feed-badge ' + (l.feed_type === 'IDX' ? 'idx' : 'bbo') + '">' + esc(l.feed_type || '—') + '</span></td>';
      html += '</tr>';
      // Inline detail row
      if (_listingsDetailOpen === l.listing_key) {
        html += '<tr class="listings-detail-row"><td colspan="10">' + renderListingDetail(l) + '</td></tr>';
      }
    });
    if (filtered.length > 200) {
      html += '<tr><td colspan="10" class="crm-table-muted" style="text-align:center;padding:1rem">Showing first 200 of ' + filtered.length + ' results. Use filters to narrow down.</td></tr>';
    }
  } else {
    html += '<tr><td colspan="10"><div class="crm-empty-state"><div class="crm-empty-state-text">No listings match your filters</div></div></td></tr>';
  }
  html += '</tbody></table></div>';
  main.innerHTML = html;
}

function filterListings() {
  var results = _listingsCache.slice();
  var f = _listingsFilters;
  if (f.status) results = results.filter(function(l) { return l.standard_status === f.status; });
  if (f.type) results = results.filter(function(l) { return l.property_type === f.type; });
  if (f.city) results = results.filter(function(l) { return l.city === f.city; });
  if (f.feed) results = results.filter(function(l) {
    if (f.feed === 'BBO') return !l.mlg_can_view;
    return l.mlg_can_view === true;
  });
  if (f.priceMax) results = results.filter(function(l) { return l.list_price && l.list_price <= parseInt(f.priceMax); });
  if (f.search) {
    var s = f.search.toLowerCase();
    results = results.filter(function(l) {
      return (l.full_address || '').toLowerCase().includes(s) ||
        (l.listing_id || '').toLowerCase().includes(s) ||
        (l.listing_key || '').toLowerCase().includes(s) ||
        (l.list_agent_full_name || '').toLowerCase().includes(s) ||
        (l.list_office_name || '').toLowerCase().includes(s) ||
        (l.city || '').toLowerCase().includes(s);
    });
  }
  // Sort
  var col = _listingsSort.col;
  var asc = _listingsSort.asc;
  results.sort(function(a, b) {
    var va = a[col], vb = b[col];
    if (va == null) va = '';
    if (vb == null) vb = '';
    if (typeof va === 'number' && typeof vb === 'number') return asc ? va - vb : vb - va;
    va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
    return asc ? va.localeCompare(vb) : vb.localeCompare(va);
  });
  return results;
}

function filterListingsBy(key, val) {
  _listingsFilters[key] = val;
  renderListingsTab();
}

function sortListings(col) {
  if (_listingsSort.col === col) _listingsSort.asc = !_listingsSort.asc;
  else { _listingsSort.col = col; _listingsSort.asc = true; }
  renderListingsTab();
}

function toggleListingDetail(listingKey) {
  _listingsDetailOpen = (_listingsDetailOpen === listingKey) ? null : listingKey;
  renderListingsTab();
  // Scroll to detail row
  if (_listingsDetailOpen) {
    setTimeout(function() {
      var row = document.querySelector('.listings-detail-row');
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }
}

function renderListingDetail(l) {
  var html = '<div class="listings-detail">';

  // Two column layout
  html += '<div class="listings-detail-grid">';

  // Left: photos placeholder + map
  html += '<div class="listings-detail-left">';
  html += '<div class="listings-detail-photos" id="ldPhotos_' + esc(l.listing_key) + '"><div class="crm-loading" style="padding:2rem"><div class="crm-spinner"></div></div></div>';
  if (l.latitude && l.longitude) {
    html += '<div class="listings-detail-map" id="ldMap_' + esc(l.listing_key) + '"></div>';
  }
  html += '</div>';

  // Right: all fields
  html += '<div class="listings-detail-right">';

  // Section 1: Listing Info
  html += '<div class="ld-section"><div class="ld-section-title">Listing Info</div><div class="ld-grid">';
  html += ldField('Price', l.list_price ? '$' + l.list_price.toLocaleString() : '—');
  html += ldField('Status', l.standard_status);
  html += ldField('MLS#', l.listing_id);
  html += ldField('DOM', l.days_on_market);
  html += ldField('List Date', l.list_date);
  html += ldField('Feed Type', l.feed_type);
  html += ldField('Original Price', l.original_list_price ? '$' + l.original_list_price.toLocaleString() : '');
  html += ldField('Close Price', l.close_price ? '$' + l.close_price.toLocaleString() : '');
  html += ldField('Close Date', l.close_date);
  html += '</div></div>';

  // Section 2: Property Details
  html += '<div class="ld-section"><div class="ld-section-title">Property Details</div><div class="ld-grid">';
  html += ldField('Type', l.property_type);
  html += ldField('Sub Type', l.property_sub_type);
  html += ldField('Beds', l.bedrooms_total);
  html += ldField('Baths', l.bathrooms_total_integer);
  html += ldField('Half Baths', l.bathrooms_half);
  html += ldField('Sqft', l.living_area ? parseFloat(l.living_area).toLocaleString() : '');
  html += ldField('Lot Acres', l.lot_size_acres);
  html += ldField('Year Built', l.year_built);
  html += ldField('Stories', l.stories);
  html += ldField('Garage', l.garage_spaces);
  html += ldField('Parking', l.parking_total);
  html += '</div></div>';

  // Section 3: Description
  if (l.public_remarks) {
    html += '<div class="ld-section"><div class="ld-section-title">Public Remarks</div><div class="ld-text">' + esc(l.public_remarks) + '</div></div>';
  }

  // Section 4: BBO / Agent Notes (gold border)
  var hasBBO = l.private_remarks || l.showing_instructions || l.directions;
  if (hasBBO) {
    html += '<div class="ld-section ld-bbo"><div class="ld-section-title">Agent Notes <span class="ld-bbo-badge">BBO</span></div>';
    if (l.private_remarks) html += '<div class="ld-bbo-field"><div class="ld-bbo-label">Private Remarks</div><div class="ld-text">' + esc(l.private_remarks) + '</div></div>';
    if (l.showing_instructions) html += '<div class="ld-bbo-field"><div class="ld-bbo-label">Showing Instructions</div><div class="ld-text">' + esc(l.showing_instructions) + '</div></div>';
    if (l.directions) html += '<div class="ld-bbo-field"><div class="ld-bbo-label">Directions</div><div class="ld-text">' + esc(l.directions) + '</div></div>';
    html += '</div>';
  }

  // Section 5: Agent & Office
  html += '<div class="ld-section"><div class="ld-section-title">Agent & Office</div><div class="ld-grid">';
  html += ldField('List Agent', l.list_agent_full_name);
  html += ldField('Agent Email', l.list_agent_email);
  html += ldField('Agent Phone', l.list_agent_phone);
  html += ldField('List Office', l.list_office_name);
  html += ldField('Office Phone', l.list_office_phone);
  html += ldField('Buyer Agent', l.buyer_agent_full_name);
  html += ldField('Buyer Office', l.buyer_office_name);
  html += '</div></div>';

  // Section 6: Features
  var featureArrays = [
    ['Interior', l.interior_features], ['Exterior', l.exterior_features],
    ['Appliances', l.appliances], ['Heating', l.heating], ['Cooling', l.cooling],
    ['Roof', l.roof], ['Flooring', l.flooring], ['Foundation', l.foundation_details],
    ['Construction', l.construction_materials], ['View', l.view],
    ['Waterfront', l.waterfront_features]
  ];
  var hasFeatures = featureArrays.some(function(f) { return f[1] && f[1].length; });
  if (hasFeatures) {
    html += '<div class="ld-section"><div class="ld-section-title">Features</div><div class="ld-grid">';
    featureArrays.forEach(function(f) {
      if (f[1] && f[1].length) {
        var val = Array.isArray(f[1]) ? f[1].join(', ') : f[1];
        html += ldField(f[0], val);
      }
    });
    html += '</div></div>';
  }

  // Section 7: Utilities
  var hasUtilities = l.water_source || l.sewer || l.electric || l.internet_whole_listing;
  if (hasUtilities) {
    html += '<div class="ld-section"><div class="ld-section-title">Utilities</div><div class="ld-grid">';
    html += ldField('Water', arrayOrStr(l.water_source));
    html += ldField('Sewer', arrayOrStr(l.sewer));
    html += ldField('Electric', arrayOrStr(l.electric));
    html += ldField('Internet', arrayOrStr(l.internet_whole_listing));
    html += '</div></div>';
  }

  // Section 8: Financial
  html += '<div class="ld-section"><div class="ld-section-title">Financial</div><div class="ld-grid">';
  html += ldField('HOA Fee', l.association_fee ? '$' + l.association_fee : '');
  html += ldField('HOA Frequency', l.association_fee_frequency);
  html += ldField('HOA Name', l.association_name);
  html += ldField('Tax Amount', l.tax_annual_amount ? '$' + parseFloat(l.tax_annual_amount).toLocaleString() : '');
  html += ldField('Tax Year', l.tax_year);
  html += ldField('Zoning', l.zoning);
  html += ldField('Restrictions', arrayOrStr(l.restrictions));
  html += '</div></div>';

  // Section 9: Location
  html += '<div class="ld-section"><div class="ld-section-title">Location</div><div class="ld-grid">';
  html += ldField('Address', l.full_address);
  html += ldField('City', l.city);
  html += ldField('County', l.county_or_parish);
  html += ldField('State', l.state_or_province);
  html += ldField('Zip', l.postal_code);
  html += ldField('Lat', l.latitude);
  html += ldField('Lng', l.longitude);
  html += '</div></div>';

  // Section 10: Raw Data (collapsible)
  if (l.raw_data) {
    html += '<div class="ld-section"><details class="ld-raw"><summary class="ld-section-title" style="cursor:pointer">Raw MLS Data ▸</summary><pre class="ld-raw-json">' + esc(JSON.stringify(l.raw_data, null, 2)) + '</pre></details></div>';
  }

  html += '</div>'; // end right
  html += '</div>'; // end grid
  html += '</div>'; // end detail

  // Load photos async
  setTimeout(function() { loadListingPhotos(l.listing_key); }, 100);
  // Init map async
  if (l.latitude && l.longitude) {
    setTimeout(function() { initListingDetailMap(l.listing_key, l.latitude, l.longitude, l.full_address, l.city); }, 200);
  }

  return html;
}

function ldField(label, value) {
  if (value == null || value === '' || value === undefined) return '';
  return '<div class="ld-field"><span class="ld-field-label">' + label + '</span><span class="ld-field-value">' + esc(String(value)) + '</span></div>';
}

function arrayOrStr(val) {
  if (!val) return '';
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

async function loadListingPhotos(listingKey) {
  var container = document.getElementById('ldPhotos_' + listingKey);
  if (!container) return;
  try {
    var resp = await _sb.from('mls_media').select('local_url,media_url,order').eq('listing_key', listingKey).order('order', { ascending: true }).limit(20);
    if (!resp.data || !resp.data.length) {
      container.innerHTML = '<div class="ld-no-photos">No photos available</div>';
      return;
    }
    var html = '<div class="ld-photo-scroll">';
    resp.data.forEach(function(p, i) {
      var src = p.local_url || p.media_url;
      html += '<img class="ld-photo" src="' + esc(src) + '" alt="Photo ' + (i+1) + '" loading="lazy" onclick="window.open(\'' + esc(src) + '\',\'_blank\')" />';
    });
    html += '</div>';
    container.innerHTML = html;
  } catch(e) { container.innerHTML = '<div class="ld-no-photos">Error loading photos</div>'; }
}

var _ldMaps = {};
function initListingDetailMap(listingKey, lat, lng, address, city) {
  var container = document.getElementById('ldMap_' + listingKey);
  if (!container || typeof L === 'undefined') return;
  // Clean up previous map for this key
  if (_ldMaps[listingKey]) { try { _ldMaps[listingKey].remove(); } catch(e){} }
  var map = L.map(container, { zoomControl: true, scrollWheelZoom: false }).setView([parseFloat(lat), parseFloat(lng)], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>', maxZoom: 18
  }).addTo(map);
  L.marker([parseFloat(lat), parseFloat(lng)]).addTo(map).bindPopup('<strong>' + esc(address || '') + '</strong><br>' + esc(city || '') + ', NC');
  _ldMaps[listingKey] = map;
  setTimeout(function() { map.invalidateSize(); }, 300);
}
