var _isAdmin = false;

// ═══ CTRL+P INTERCEPT — Custom print for logged-in users ═══
window.addEventListener('keydown', function(e){
  if((e.ctrlKey || e.metaKey) && e.key === 'p'){
    var propOverlay = document.getElementById('propOverlay');
    if(propOverlay && propOverlay.classList.contains('active')){
      if(_acctLoggedIn){
        e.preventDefault();
        propShare('print');
      } else {
        // Not logged in — block custom print, let browser do its default (which won't look as nice)
        // Or we could block entirely and prompt account creation:
        e.preventDefault();
        openAcctModal();
      }
    }
  }
});

// ═══ THEME TOGGLE ═══
function toggleTheme(){
  const html=document.documentElement;
  const current=html.getAttribute('data-theme');
  const next=current==='dark'?'light':'dark';
  html.setAttribute('data-theme',next);
  try{localStorage.setItem('cc-theme',next);localStorage.setItem('cc-theme-seen','1')}catch(e){}
  // Hide tooltip on first use
  var tip=document.getElementById('themeTooltip');
  if(tip)tip.classList.remove('show');
}
// Load saved theme
try{const saved=localStorage.getItem('cc-theme');if(saved)document.documentElement.setAttribute('data-theme',saved)}catch(e){}
// Show tooltip for first-time visitors
document.addEventListener('DOMContentLoaded', function(){
  try{
    if(!localStorage.getItem('cc-theme-seen')){
      setTimeout(function(){
        var tip=document.getElementById('themeTooltip');
        if(tip){
          tip.classList.add('show');
          // Auto-hide after 8 seconds
          setTimeout(function(){tip.classList.remove('show')},8000);
        }
      },2000);
    }
  }catch(e){}
});

// ═══ NAV ═══
const nav=document.getElementById('nav');
if(nav) window.addEventListener('scroll',()=>nav.classList.toggle('scrolled',window.scrollY>50));
var _navToggle=document.getElementById('navToggle');
if(_navToggle) _navToggle.addEventListener('click',function(){var mm=document.getElementById('mobileMenu');if(mm){var opening=!mm.classList.contains('open');mm.classList.toggle('open');if(mm.classList.contains('open')){_lockScroll()}else{_unlockScroll()}if(opening){history.pushState({page:'menu'},'','#menu')}else{if(history.state&&history.state.page==='menu')history.back()}}});
function closeMobile(fromPopstate){var mm=document.getElementById('mobileMenu');if(mm&&mm.classList.contains('open')){mm.classList.remove('open');_unlockScroll();if(!fromPopstate&&history.state&&history.state.page==='menu')history.back()}}

// ═══ SCROLL LOCK HELPERS ═══
var _scrollLockY=0;
function _scrollLockTouch(e){
  // Allow scrolling inside any active overlay or panel with scrollable content
  var t=e.target;
  var ids=['chatPanel','mobileMenu','srListPanel','compareOverlay','propOverlay','colOverlay','affordOverlay','qaOverlay','acctModalInner'];
  for(var i=0;i<ids.length;i++){var el=document.getElementById(ids[i]);if(el&&el.contains(t))return;}
  // Also allow scrolling inside page overlays (town/blog pages opened inline)
  if(t.closest&&t.closest('.page-overlay'))return;
  e.preventDefault();
}
function _lockScroll(){
  if(document.body.style.position==='fixed')return;
  _scrollLockY=window.pageYOffset||document.documentElement.scrollTop;
  document.documentElement.style.overflow='hidden';
  document.documentElement.style.height='100%';
  document.body.style.position='fixed';
  document.body.style.top='-'+_scrollLockY+'px';
  document.body.style.left='0';
  document.body.style.right='0';
  document.body.style.width='100%';
  document.body.style.overflow='hidden';
  document.addEventListener('touchmove',_scrollLockTouch,{passive:false});
}
function _unlockScroll(){
  if(document.body.style.position!=='fixed')return;
  var y=_scrollLockY;
  document.documentElement.style.overflow='';
  document.documentElement.style.height='';
  document.body.style.position='';
  document.body.style.top='';
  document.body.style.left='';
  document.body.style.right='';
  document.body.style.width='';
  document.body.style.overflow='';
  document.removeEventListener('touchmove',_scrollLockTouch,{passive:false});
  document.documentElement.style.scrollBehavior='auto';
  window.scrollTo(0,y);
  requestAnimationFrame(function(){document.documentElement.style.scrollBehavior='';});
}

// ═══ REGISTRATION GATE ═══
var _pendingProp = null; // {listing, townName} stored when unregistered user clicks a property
var _smartSignupInProgress = false; // true during smart login→signup probe to prevent onAuthStateChange race
var _guestViewCount = 0; // Track property detail views for guest users
try { _guestViewCount = parseInt(sessionStorage.getItem('cc_guest_views') || '0', 10); } catch(e) {}

// ═══ MOBILE MENU INLINE AUTH ═══
function toggleMobileSignup(){
  var login=document.getElementById('mobileLoginFields');
  var signup=document.getElementById('mobileSignupFields');
  var complete=document.getElementById('mobileCompleteFields');
  if(!login||!signup)return;
  if(complete) complete.style.display='none'; // Always hide completion form when toggling
  if(signup.style.display==='none'){
    // Switching to signup — carry email from login
    var loginEmail=document.getElementById('mobileLoginEmail');
    var signupEmail=document.getElementById('mobileSignupEmail');
    if(loginEmail&&signupEmail&&loginEmail.value.trim()) signupEmail.value=loginEmail.value.trim();
    login.style.display='none';signup.style.display='';
  } else {
    // Switching to login — carry email from signup
    var signupEmail2=document.getElementById('mobileSignupEmail');
    var loginEmail2=document.getElementById('mobileLoginEmail');
    if(signupEmail2&&loginEmail2&&signupEmail2.value.trim()) loginEmail2.value=signupEmail2.value.trim();
    signup.style.display='none';login.style.display='';
  }
}

function _showMobileError(id,msg){var el=document.getElementById(id);if(el){el.textContent=msg;el.style.display=''}}
function _clearMobileErrors(){['mobileLoginError','mobileSignupError','mobileCompleteError'].forEach(function(id){var el=document.getElementById(id);if(el){el.style.display='none';el.textContent=''}})}

async function mobileLogin(){
  _clearMobileErrors();
  var email=document.getElementById('mobileLoginEmail').value.trim();
  var pass=document.getElementById('mobileLoginPass').value;
  if(!email||email.indexOf('@')<1){_showMobileError('mobileLoginError','Please enter a valid email');return}
  if(!pass||pass.length<6){_showMobileError('mobileLoginError','Password must be at least 6 characters');return}
  var btn=document.querySelector('#mobileLoginFields .mobile-acct-submit');
  btn.textContent='Signing In...';btn.disabled=true;
  if(!_sb){_showMobileError('mobileLoginError','Service unavailable');btn.textContent='Sign In';btn.disabled=false;return}
  try{
    var result=await _sb.auth.signInWithPassword({email:email,password:pass});
    if(result.error){
      // Smart probe: try signUp to see if account exists
      console.log('[Auth] Mobile login failed, probing with signUp...');
      _smartSignupInProgress=true;
      try{
        var probe=await _sb.auth.signUp({email:email,password:pass});
        if(probe.error){
          _smartSignupInProgress=false;
          var errMsg=probe.error.message||'';
          if(errMsg.indexOf('already registered')>-1){
            _showMobileError('mobileLoginError','Incorrect password. Please try again.');
          } else {
            _showMobileError('mobileLoginError',errMsg||'Something went wrong');
          }
          btn.textContent='Sign In';btn.disabled=false;
          return;
        }
        // No account existed — user created. Show completion form.
        if(probe.data&&probe.data.user){
          _currentUser=probe.data.user;
          console.log('[Auth] Mobile: No account found, showing completion form.');
          btn.textContent='Sign In';btn.disabled=false;
          showMobileComplete(email);
          setTimeout(function(){_smartSignupInProgress=false},30000);
          return;
        }
        _smartSignupInProgress=false;
        _showMobileError('mobileLoginError','Something went wrong');
        btn.textContent='Sign In';btn.disabled=false;
      }catch(probeErr){
        _smartSignupInProgress=false;
        _showMobileError('mobileLoginError','Something went wrong');
        btn.textContent='Sign In';btn.disabled=false;
      }
      return;
    }
    _acctLoggedIn=true;_currentUser=result.data.user;
    await loadFavoritesFromCloud();
    updateAcctUI();checkAdminRole();
    btn.textContent='Sign In';btn.disabled=false;
    document.getElementById('mobileLoginEmail').value='';
    document.getElementById('mobileLoginPass').value='';
  }catch(e){_showMobileError('mobileLoginError','Something went wrong');btn.textContent='Sign In';btn.disabled=false}
}

async function mobileSignup(){
  _clearMobileErrors();
  var email=document.getElementById('mobileSignupEmail').value.trim();
  var pass=document.getElementById('mobileSignupPass').value;
  if(!email||email.indexOf('@')<1){_showMobileError('mobileSignupError','Valid email is required');return}
  if(!pass||pass.length<6){_showMobileError('mobileSignupError','Password must be at least 6 characters');return}
  var btn=document.querySelector('#mobileSignupFields .mobile-acct-submit');
  btn.textContent='Creating Account...';btn.disabled=true;
  if(!_sb){_showMobileError('mobileSignupError','Service unavailable');btn.textContent='Continue';btn.disabled=false;return}
  try{
    _smartSignupInProgress=true;
    var result=await _sb.auth.signUp({email:email,password:pass});
    if(result.error){
      _smartSignupInProgress=false;
      var errMsg=result.error.message||'Sign up failed';
      if(errMsg.indexOf('already registered')>-1) errMsg='This email already has an account. Try signing in instead.';
      _showMobileError('mobileSignupError',errMsg);btn.textContent='Continue';btn.disabled=false;return;
    }
    _currentUser=result.data.user;
    btn.textContent='Continue';btn.disabled=false;
    showMobileComplete(email);
    setTimeout(function(){_smartSignupInProgress=false},30000);
  }catch(e){_smartSignupInProgress=false;_showMobileError('mobileSignupError','Something went wrong');btn.textContent='Continue';btn.disabled=false}
}

// ═══ MOBILE CTA BAR ═══
function hideMobileCta(){var el=document.getElementById('mobileCta');if(el)el.classList.add('hidden')}
function showMobileCta(){var el=document.getElementById('mobileCta');if(el)el.classList.remove('hidden')}

// ═══ TOWN PAGE DETECTION & OVERLAY INJECTION ═══
var _isTownPage = !document.getElementById('propOverlay') && !document.getElementById('featuredGrid');
if(_isTownPage){
(function(){
  // Inject all overlay HTML that town pages need but don't have in their static HTML.
  // This enables the property overlay, lightbox, search, compare, account modal, and chat
  // to work directly on town pages without redirecting to index.html.
  var html = '';

  // --- Property Detail Overlay ---
  html += '<div class="prop-overlay" id="propOverlay">' +
    '<div class="prop-demo-banner" id="propDemoBanner" style="display:none"><span class="demo-banner-icon">\u26A0</span> Sample listings shown for demonstration purposes only. These properties are not real.</div>' +
    '<button class="prop-close" onclick="closeProp()">&times;</button>' +
    '<div class="prop-theme-toggle" onclick="toggleTheme()" title="Toggle light/dark mode"><span class="prop-toggle-sun">☀</span><span class="prop-toggle-moon">☽</span></div>' +
    '<div class="prop-hero-wrap"><div class="prop-hero" id="propHeroZone">' +
      '<img class="prop-hero-img" id="propHeroImg" src="" alt="Property listing photo">' +
      '<div class="prop-nav prop-nav-left" onclick="propImgNav(-1)"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></div>' +
      '<div class="prop-nav prop-nav-right" onclick="propImgNav(1)"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></div>' +
      '<div class="prop-hero-expand" onclick="openLightbox()"><svg viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg> View Photos</div>' +
      '<div class="prop-hero-content"><div class="prop-hero-status active-status" id="propStatus">Active Listing</div><div class="prop-demo-notice" id="propDemoNotice" style="display:none">Sample Listing — Demo Data</div><div class="prop-thumbs" id="propThumbs"></div></div>' +
    '</div></div>' +
    '<div class="prop-info-bar"><div class="prop-info-bar-inner">' +
      '<div class="prop-info-left"><div class="prop-hero-price" id="propPrice"></div><div class="prop-hero-addr" id="propAddr"></div><div class="prop-hero-city" id="propCity"></div><div class="prop-listing-broker" id="propListingBroker"></div></div>' +
      '<div class="prop-info-right">' +
        '<div class="prop-info-scroll-hint"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 5v14M19 12l-7 7-7-7" stroke="currentColor" stroke-width="2" fill="none"/></svg><span>Scroll for details</span></div>' +
        '<button class="prop-fav-btn" id="propFavBtn" onclick="toggleFavProp()"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg><span id="propFavLabel">Save</span></button>' +
        '<button class="prop-info-print-btn" id="propInfoPrintBtn" onclick="propShare(\'print\')"><svg viewBox="0 0 24 24"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg><span>Print</span></button>' +
      '</div>' +
    '</div></div>' +
    '<div class="prop-content-area" id="propContentArea">' +
      '<div class="prop-stats" id="propStats"></div>' +
      '<div class="prop-body"><div class="prop-main">' +
        '<div class="prop-section-label">Property Overview</div>' +
        '<h2 class="prop-section-title" id="propTitle"></h2>' +
        '<p class="prop-desc" id="propDesc1"></p><p class="prop-desc" id="propDesc2"></p>' +
        '<div class="prop-section-label" style="margin-top:2.5rem">Property Details</div>' +
        '<div class="prop-features" id="propFeatures"></div>' +
        '<div class="corys-take-gated gated-wrap locked" id="gatedCorysTake" onclick="onGatedClick()">' +
          '<div class="gated-prompt"><svg class="gated-prompt-icon" viewBox="0 0 24 24"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg><div class="gated-prompt-text"><strong>Unlock Cory\'s Market Insights</strong> &mdash; Free</div><div class="gated-prompt-sub">Click anywhere to unlock</div></div>' +
          '<div class="gated-content"><div class="corys-take" id="corysTake" style="display:none"><div class="corys-take-pin"><svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="6" r="4" fill="#C4B08C" stroke="none"/><path d="M12 10v10" stroke="#C4B08C" stroke-width="2" fill="none"/></svg></div><div class="corys-take-header"><div class="corys-take-label">From the Broker</div><div class="corys-take-title">Cory\'s Take</div></div><div class="corys-take-insights" id="corysTakeInsights"></div><div class="corys-take-sig">&mdash; Cory Coleman, Keller Williams Great Smokies</div></div></div>' +
        '</div>' +
        '<div class="prop-section-label" style="margin-top:2.5rem">Property Highlights</div>' +
        '<div class="prop-highlights" id="propHighlights"></div>' +
        '<div class="gated-wrap locked" id="gatedNeighborhood" onclick="onGatedClick()"><div class="gated-prompt"><svg class="gated-prompt-icon" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg><div class="gated-prompt-text"><strong>Unlock Neighborhood Details</strong> &mdash; Free</div><div class="gated-prompt-sub">Click anywhere to unlock</div></div><div class="gated-content"><div class="prop-section-label" style="margin-top:2.5rem">Neighborhood Details</div><div class="neighborhood-dive" id="neighborhoodDive"></div></div></div>' +
        '<div class="gated-wrap locked" id="gatedDistances" onclick="onGatedClick()"><div class="gated-prompt"><svg class="gated-prompt-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg><div class="gated-prompt-text"><strong>Unlock Drive Times</strong> &mdash; Free</div><div class="gated-prompt-sub">Click anywhere to unlock</div></div><div class="gated-content"><div class="prop-section-label" style="margin-top:2.5rem">Distances & Drive Times</div><div class="prop-distances" id="propDistances"></div></div></div>' +
        '<div class="prop-section-label" style="margin-top:2.5rem">Location</div>' +
        '<div class="prop-map" id="propMapContainer"></div>' +
        '<div class="prop-listing-broker" id="propListingBroker"></div>' +
        '<div class="prop-admin-notes" id="propAdminNotes" style="display:none"><div class="prop-section-label" style="margin-top:2rem">Agent Notes <span class="admin-badge">Admin Only</span></div><div class="prop-admin-field" id="propPrivateRemarks"></div><div class="prop-admin-field" id="propShowingInstructions"></div><div class="prop-admin-field" id="propDirections"></div><div class="prop-admin-field" id="propBuyerAgent"></div><div class="prop-admin-field" id="propListAgentContact"></div></div>' +
      '</div>' +
      '<div class="prop-sidebar">' +
        '<div class="prop-agent"><div class="prop-agent-header"><div class="prop-agent-avatar">CC</div><div><div class="prop-agent-name">Cory Coleman</div><div class="prop-agent-brokerage">Keller Williams Great Smokies</div></div></div>' +
          '<a href="tel:8285066413" class="prop-agent-cta primary"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>Call Cory</a>' +
          '<a href="sms:8285066413" class="prop-agent-cta secondary"><svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>Text About This Property</a>' +
          '<a href="mailto:cory@coryhelpsyoumove.com" class="prop-agent-cta secondary"><svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>Email Inquiry</a>' +
          '<a href="tel:8285066413" class="prop-agent-phone"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>(828) 506-6413</a>' +
          '<button class="prop-showing-btn" id="propShowingBtn" onclick="openShowingRequest()"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Request a Showing</button>' +
        '</div>' +
        '<div class="prop-notes-wrap" id="propNotesWrap" style="display:none"><div class="prop-notes-header"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><div class="prop-notes-title">Your Notes</div></div><textarea class="prop-notes-ta" id="propNotesTA" placeholder="Jot down thoughts, questions, or things to look for at the showing..."></textarea><div class="prop-notes-hint"><svg viewBox="0 0 24 24" width="12" height="12"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Notes appear on your printed property sheet</div></div>' +
        '<div class="prop-ask-cory" id="propAskCory" style="display:none"><div class="prop-notes-header"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><div class="prop-notes-title">Ask Cory</div></div><div id="propQuestionsList"></div><textarea class="prop-notes-ta" id="propQuestionTA" placeholder="Have a question about this property? Ask Cory directly..."></textarea><button class="prop-ask-send" onclick="submitPropertyQuestion()">Send Question</button></div>' +
        '<div class="gated-wrap locked" id="gatedCalc" onclick="onGatedClick()"><div class="gated-prompt"><svg class="gated-prompt-icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg><div class="gated-prompt-text"><strong>Unlock Mortgage Estimates</strong> &mdash; Free</div><div class="gated-prompt-sub">Click anywhere to unlock</div></div><div class="gated-content"><div class="prop-calc"><div class="prop-calc-title">Estimated Payment</div><div class="prop-calc-row"><span class="prop-calc-label">Purchase Price</span><span class="prop-calc-val" id="calcPrice"></span></div><div class="prop-calc-row"><span class="prop-calc-label">Down Payment (20%)</span><span class="prop-calc-val" id="calcDown"></span></div><div class="prop-calc-row"><span class="prop-calc-label">Loan Amount</span><span class="prop-calc-val" id="calcLoan"></span></div><div class="prop-calc-row"><span class="prop-calc-label">Interest Rate</span><span class="prop-calc-val">6.75%</span></div><div class="prop-calc-row"><span class="prop-calc-label">Loan Term</span><span class="prop-calc-val">30 years</span></div><div class="prop-calc-total"><span class="prop-calc-label">Est. Monthly</span><span class="prop-calc-val" id="calcMonthly"></span></div><div class="prop-calc-note">Estimate only. Does not include taxes, insurance, or HOA. Contact a lender for an accurate pre-approval.</div></div></div></div>' +
        '<div class="prop-share"><button class="prop-share-btn" onclick="propShare(\'copy\')"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy Link</button><button class="prop-share-btn" onclick="propShare(\'email\')"><svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg> Email</button><button class="prop-share-btn gated-print-btn" id="propPrintBtn" onclick="propShare(\'print\')"><svg viewBox="0 0 24 24"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print</button></div>' +
      '</div>' +
    '</div></div>' +
    '<div class="corys-suggestions" id="corysSuggestions" style="display:none"><div class="corys-suggestions-inner"><div class="corys-take-label">Personalized for You</div><div class="prop-section-title" style="margin-bottom:0.5rem">Cory\'s <em>Suggestions</em></div><div class="corys-suggestions-reason" id="corysSuggestionsReason"></div><div class="corys-suggestions-grid" id="corysSuggestionsGrid"></div></div></div>' +
    '<div class="print-page" id="printPage"><div class="print-hero-row"><div class="print-hero-left"><img class="print-page-thumb" id="printThumb" src="" alt="Property photo"></div><div class="print-hero-right"><div class="print-page-price" id="printPrice"></div><div class="print-page-addr" id="printAddr"></div><div class="print-page-city" id="printCity"></div><div class="print-page-date" id="printDate"></div><div class="print-page-stats" id="printStats"></div></div></div><div class="print-section-label">Property Overview</div><div class="print-page-desc" id="printDesc"></div><div class="print-section-label">Property Details</div><div class="print-page-details" id="printDetails"></div><div class="print-corys-take" id="printCorysTake" style="display:none"><div class="print-section-label">Cory\'s Take</div><div class="print-corys-take-insights" id="printCorysTakeInsights"></div></div><div class="print-neighborhood" id="printNeighborhood" style="display:none"><div class="print-section-label">Neighborhood Details</div><div class="print-nd-grid" id="printNdGrid"></div><div class="print-nd-amenities" id="printNdAmenities"></div></div><div class="print-distances" id="printDistances" style="display:none"><div class="print-section-label">Distances &amp; Drive Times</div><div class="print-dist-grid" id="printDistGrid"></div></div><div class="print-qa" id="printQA" style="display:none"><div class="print-section-label" style="border-left:none;padding-left:0;margin-top:0">Questions &amp; Answers</div><div id="printQAList"></div></div><div class="print-bottom-row"><div class="print-notes-section"><div class="print-notes-title">Your Notes</div><div class="print-notes-content" id="printYourNotes"></div></div><div class="print-notepad-section"><div class="print-notepad-title">Additional Notes</div><div class="print-notepad-lines"><div class="print-line"></div><div class="print-line"></div><div class="print-line"></div><div class="print-line"></div><div class="print-line"></div><div class="print-line"></div><div class="print-line"></div><div class="print-line"></div></div></div></div><div class="print-page-footer">Cory Coleman | Keller Williams Great Smokies | (828) 506-6413 | coryhelpsyoumove.com</div></div>' +
  '</div>';

  // --- Fullscreen Lightbox ---
  html += '<div class="prop-lightbox" id="propLightbox" onclick="closeLightbox(event)">' +
    '<button class="prop-lightbox-close" onclick="closeLightbox()">&times;</button>' +
    '<div class="prop-lb-nav prop-lb-prev" onclick="event.stopPropagation();lbNav(-1)"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></div>' +
    '<div class="prop-lb-nav prop-lb-next" onclick="event.stopPropagation();lbNav(1)"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></div>' +
    '<img id="propLbImg" src="" alt="Property photo fullscreen">' +
    '<div class="prop-lb-count" id="propLbCount"></div>' +
  '</div>';

  // --- Account Modal ---
  html += '<div class="acct-modal-bg" id="acctModal" onclick="if(event.target===this)closeAcctModal()"><div class="acct-modal" id="acctModalInner">' +
    '<button class="acct-modal-close" onclick="closeAcctModal()">&times;</button>' +
    '<div id="acctLoginView"><div class="acct-modal-badge">Welcome Back</div><h3>Sign In</h3><div class="acct-modal-sub">Access your saved favorites, searches, and full property details.</div>' +
    '<div class="acct-oauth-btns"><button class="acct-oauth-btn acct-oauth-google" onclick="signInWithGoogle()"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Continue with Google</button><button class="acct-oauth-btn acct-oauth-facebook" onclick="signInWithFacebook()"><svg viewBox="0 0 24 24" width="18" height="18" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> Continue with Facebook</button></div>' +
    '<div class="acct-or">&mdash; or sign in with email &mdash;</div>' +
    '<div class="acct-error" id="acctLoginError" style="display:none"></div><div class="acct-field"><label>Email Address</label><input type="email" id="acctLoginEmail" placeholder="john@example.com" required></div><div class="acct-field"><label>Password</label><input type="password" id="acctLoginPass" placeholder="Your password" required></div><button class="acct-submit" onclick="loginAcct()">Sign In</button><div class="form-privacy"><svg viewBox="0 0 24 24" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Your information stays with me &mdash; I never sell or share it with third parties.</div><div class="acct-or">&mdash; or &mdash;</div><button class="acct-create-btn" onclick="showAcctSignup()">Create a Free Account</button></div>' +
    '<div id="acctFormView" style="display:none"><div class="acct-modal-badge">Free Account</div><h3>Unlock <em>Full Details</em></h3><div class="acct-modal-sub">Unlock mortgage calculators, restriction details, saved favorites, and more &mdash; completely free.</div>' +
    '<div class="acct-oauth-btns"><button class="acct-oauth-btn acct-oauth-google" onclick="signInWithGoogle()"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Continue with Google</button><button class="acct-oauth-btn acct-oauth-facebook" onclick="signInWithFacebook()"><svg viewBox="0 0 24 24" width="18" height="18" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> Continue with Facebook</button></div>' +
    '<div class="acct-or">&mdash; or sign up with email &mdash;</div>' +
    '<div class="acct-error" id="acctSignupError" style="display:none"></div><div class="acct-field"><label>Email Address</label><input type="email" id="acctEmail" placeholder="john@example.com" required></div><div class="acct-field"><label>Password</label><input type="password" id="acctPass" placeholder="Create a password" required minlength="6"><div class="acct-pass-note">Minimum 6 characters</div></div><button class="acct-submit" onclick="submitAcct()">Continue</button><div class="acct-or">&mdash; or &mdash;</div><div class="acct-login-link" onclick="showAcctLogin()">Already have an account? <strong>Sign in</strong></div></div>' +
    '<div id="acctCompleteView" style="display:none"><div class="acct-modal-badge">Almost There</div><h3>Complete Your <em>Account</em></h3><div class="acct-modal-sub">Just one more detail to unlock full property access.</div>' +
    '<div class="acct-complete-email" id="acctCompleteEmail"></div>' +
    '<div class="acct-error" id="acctCompleteError" style="display:none"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem"><div class="acct-field"><label>First Name</label><input type="text" id="acctCompleteFirst" placeholder="John" required></div><div class="acct-field"><label>Last Name <span class="acct-optional">(optional)</span></label><input type="text" id="acctCompleteLast" placeholder="Smith"></div></div><button class="acct-submit" onclick="completeAcctSetup()">Get Free Access</button><div class="form-privacy"><svg viewBox="0 0 24 24" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Your information stays with me &mdash; I never sell or share it with third parties.</div></div>' +
    '<div id="acctSuccessView" style="display:none"><div class="acct-success"><svg class="acct-success-icon" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg><h3>Welcome!</h3><p>Your free account is ready. You now have full access to property details, mortgage estimates, and can save your favorites.</p></div></div>' +
    '<div id="acctDashView" style="display:none"><div style="text-align:center;margin-bottom:1rem"><svg viewBox="0 0 24 24" style="width:40px;height:40px;stroke:var(--gold);fill:none;stroke-width:1.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><h3 id="acctDashName" style="margin:0.5rem 0 0;color:var(--text)">My Account</h3><p id="acctDashEmail" style="margin:0;font-size:0.85rem;color:var(--text-muted)"></p></div>' +
      '<div class="acct-dash-tools"><button onclick="closeAcctModal();openAfford()" class="acct-tool-btn"><svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>Affordability</button><button onclick="closeAcctModal();openCol()" class="acct-tool-btn"><svg viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>Cost of Living</button><button onclick="closeAcctModal();openQA()" class="acct-tool-btn"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Local Q&A</button></div>' +
      '<div style="margin:1rem 0"><h4 style="color:var(--gold);font-size:0.9rem;margin-bottom:0.5rem;border-bottom:1px solid var(--border);padding-bottom:0.4rem">Saved Searches</h4><div id="acctSavedSearches" style="max-height:200px;overflow-y:auto"></div></div><div style="margin:1rem 0"><h4 style="color:var(--gold);font-size:0.9rem;margin-bottom:0.5rem;border-bottom:1px solid var(--border);padding-bottom:0.4rem">Favorites</h4><p id="acctFavCount" style="font-size:0.85rem;color:var(--text-muted)"></p><button onclick="closeAcctModal();openCompare()" style="margin-top:0.5rem;padding:0.55rem 1rem;border:1px solid var(--gold);background:transparent;color:var(--gold);font-family:\'Outfit\',sans-serif;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;transition:all 0.3s;width:100%" id="acctCompareBtn">Compare Favorites</button></div>' +
      '<div style="margin:1rem 0"><h4 style="color:var(--gold);font-size:0.9rem;margin-bottom:0.5rem;border-bottom:1px solid var(--border);padding-bottom:0.4rem">Recently Viewed</h4><div id="acctViewingHistory" style="max-height:200px;overflow-y:auto"><p style="font-size:0.85rem;color:var(--text-muted)">No properties viewed yet</p></div></div>' +
      '<div style="margin:1rem 0"><h4 style="color:var(--gold);font-size:0.9rem;margin-bottom:0.5rem;border-bottom:1px solid var(--border);padding-bottom:0.4rem">My Journey</h4><div id="acctTimeline" style="max-height:250px;overflow-y:auto"><p style="font-size:0.85rem;color:var(--text-muted)">No activity yet</p></div></div>' +
      '<div style="margin:1rem 0"><h4 style="color:var(--gold);font-size:0.9rem;margin-bottom:0.5rem;border-bottom:1px solid var(--border);padding-bottom:0.4rem">Cory\'s Suggestions</h4><div id="acctSuggestionsPreview" style="max-height:300px;overflow-y:auto"><p style="font-size:0.85rem;color:var(--text-muted)">Save at least 2 properties to unlock personalized suggestions.</p></div></div>' +
      '<div id="acctAdminBtn" style="display:none;margin:1rem 0"><button onclick="closeAcctModal();openAdmin()" style="width:100%;padding:0.65rem;border-radius:8px;border:1px solid var(--gold);background:rgba(196,176,140,0.1);color:var(--gold);cursor:pointer;font-size:0.82rem;font-weight:500">Open Admin Dashboard</button></div>' +
      '<div style="display:flex;gap:0.5rem;margin-top:1.2rem"><button onclick="closeAcctModal()" style="flex:1;padding:0.65rem;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;font-size:0.85rem">Close</button><button onclick="signOutAcct()" style="flex:1;padding:0.65rem;border-radius:8px;border:none;background:#c0392b;color:#fff;cursor:pointer;font-size:0.85rem">Sign Out</button></div></div>' +
  '</div></div>';

  // --- Search Results Overlay ---
  html += '<div class="search-overlay" id="searchOverlay">' +
    '<div class="sr-topbar"><div class="sr-topbar-left"><button class="sr-back" onclick="closeSearch()"><svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button><div><div class="sr-title">Properties in <em id="srRegion">Western NC</em></div><div class="sr-count" id="srCount">0 listings</div></div></div><div class="sr-topbar-right"><button class="theme-toggle" onclick="toggleTheme()" style="width:36px;height:36px;font-size:0.85rem" aria-label="Toggle theme"><span class="prop-toggle-sun" style="display:none">☀</span><span class="prop-toggle-moon">☽</span></button></div></div>' +
    '<div class="sr-filters" id="srFilters">' +
      '<div class="sr-filter-chip sr-multi-chip" id="srfLocation" onclick="toggleLocDropdown(event)"><svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg><span class="sr-multi-label" id="srfLocLabel">All Areas</span><svg class="sr-multi-arrow" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg><div class="sr-multi-dropdown" id="srfLocDropdown" onclick="event.stopPropagation()"><label class="sr-multi-option"><input type="checkbox" value="Waynesville" onchange="srLocChanged()"><span>Waynesville</span></label><label class="sr-multi-option"><input type="checkbox" value="Sylva" onchange="srLocChanged()"><span>Sylva</span></label><label class="sr-multi-option"><input type="checkbox" value="Maggie Valley" onchange="srLocChanged()"><span>Maggie Valley</span></label><label class="sr-multi-option"><input type="checkbox" value="Bryson City" onchange="srLocChanged()"><span>Bryson City</span></label><label class="sr-multi-option"><input type="checkbox" value="Cashiers" onchange="srLocChanged()"><span>Cashiers / Highlands</span></label><label class="sr-multi-option"><input type="checkbox" value="Franklin" onchange="srLocChanged()"><span>Franklin</span></label><label class="sr-multi-option"><input type="checkbox" value="Dillsboro" onchange="srLocChanged()"><span>Dillsboro</span></label><label class="sr-multi-option"><input type="checkbox" value="Cullowhee" onchange="srLocChanged()"><span>Cullowhee</span></label></div></div>' +
      '<div class="sr-filter-chip" id="srfType"><svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg><select id="srfTypeSelect" onchange="srApplyFilters()"><option value="">All Types</option><option value="Single Family">Single Family</option><option value="Cabin">Cabin</option><option value="Multi-Family">Multi-Family</option><option value="Land">Land</option></select></div>' +
      '<div class="sr-filter-chip" id="srfPrice"><svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg><select id="srfPriceSelect" onchange="srApplyFilters()"><option value="">Any Price</option><option value="0-200000">Under $200K</option><option value="200000-400000">$200K – $400K</option><option value="400000-700000">$400K – $700K</option><option value="700000-1000000">$700K – $1M</option><option value="1000000-99999999">$1M+</option></select></div>' +
      '<div class="sr-filter-chip" id="srfBeds"><select id="srfBedsSelect" onchange="srApplyFilters()"><option value="">Any Beds</option><option value="2">2+ Beds</option><option value="3">3+ Beds</option><option value="4">4+ Beds</option><option value="5">5+ Beds</option></select></div>' +
      '<div class="sr-filter-chip" id="srfBaths"><select id="srfBathsSelect" onchange="srApplyFilters()"><option value="">Any Baths</option><option value="1">1+ Bath</option><option value="2">2+ Baths</option><option value="3">3+ Baths</option><option value="4">4+ Baths</option></select></div>' +
      '<div class="sr-filter-chip sr-restrict-gated" id="srfRestrict" onclick="if(!_acctLoggedIn){event.preventDefault();event.stopPropagation();openAcctModal();}"><select id="srfRestrictSelect" onchange="srApplyFilters()" class="sr-restrict-select" disabled><option value="">Any Restrictions</option><option value="unrestricted">Unrestricted</option><option value="restricted">Restrictions</option></select><div class="restrict-lock-overlay" id="srRestrictOverlay"><span>Create account to filter</span></div></div>' +
      '<button class="sr-filter-clear" id="srfClear" onclick="srClearFilters()">Clear All</button>' +
    '</div>' +
    '<div class="sr-body" id="srBody"><div class="sr-map-panel" id="srMapPanel"><div class="sr-map-loading" id="srMapLoading"><span>Loading Map...</span></div><div id="srMap" style="height:100%;width:100%"></div><div class="sr-map-vignette"></div><div class="sr-map-overlay"></div><div class="sr-map-brand"><div class="sr-map-brand-text">Western North Carolina</div><div class="sr-map-brand-sub">Cory Coleman Real Estate</div></div></div><div class="sr-list-panel" id="srListPanel"><div class="sr-sort"><span>Sort by</span><select id="srSort" onchange="srApplyFilters()"><option value="relevance">Best Match</option><option value="daysOnMarket-asc">Newest</option><option value="price-asc">Price: Low to High</option><option value="price-desc">Price: High to Low</option><option value="priceSqft-asc">Price/SqFt</option><option value="priceAcre-asc">Price/Acre</option><option value="beds-desc">Most Bedrooms</option><option value="sqft-desc">Largest</option></select></div><div class="sr-cards" id="srCards"></div></div></div>' +
    '<button class="sr-view-toggle" id="srViewToggle" onclick="srToggleView()"><svg viewBox="0 0 24 24" id="srToggleIcon"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg><span id="srToggleLabel">Show Map</span></button>' +
  '</div>';

  // --- Compare Overlay ---
  html += '<div class="compare-overlay" id="compareOverlay">' +
    '<div class="compare-topbar"><div class="compare-topbar-left"><button class="sr-back" onclick="closeCompare()"><svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button><div><div class="compare-title">Compare <em>Properties</em></div><div class="compare-count" id="compareCount">Select properties to compare</div></div></div><div class="compare-topbar-right"><button class="theme-toggle" onclick="toggleTheme()" style="width:36px;height:36px;font-size:0.85rem" aria-label="Toggle theme"><span class="prop-toggle-sun" style="display:none">☀</span><span class="prop-toggle-moon">☽</span></button></div></div>' +
    '<div class="compare-select" id="compareSelect"><div class="compare-select-header"><div class="prop-section-label">Your Favorites</div><h2 class="prop-section-title">Choose Properties to <em>Compare</em></h2><p class="compare-select-sub">Select 2 to 10 saved properties, then hit Compare.</p></div><div class="compare-fav-grid" id="compareFavGrid"></div><div class="compare-select-actions"><button class="compare-go-btn" id="compareGoBtn" onclick="runCompare()" disabled>Compare Selected (0)</button></div></div>' +
    '<div class="compare-table-wrap" id="compareTableWrap" style="display:none"><div class="compare-table-actions"><button class="compare-back-btn" onclick="showCompareSelect()">&#8592; Change Selection</button></div><div class="compare-table-scroll"><table class="compare-table" id="compareTable"><thead id="compareHead"></thead><tbody id="compareBody"></tbody></table></div></div>' +
  '</div>';

  // --- Admin Dashboard Overlay ---
  html += '<div class="admin-overlay" id="adminOverlay">' +
    '<div class="admin-topbar"><div class="admin-topbar-left"><button class="sr-back" onclick="closeAdmin()"><svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button><div><div class="sr-title">Admin <em>Dashboard</em></div></div></div></div>' +
    '<div class="admin-body"><div class="admin-nav" id="adminNav"></div><div class="admin-content" id="adminContent"></div></div>' +
  '</div>';

  // --- Affordability Calculator Overlay ---
  html += '<div class="afford-overlay" id="affordOverlay">' +
    '<div class="afford-topbar"><div class="admin-topbar-left"><button class="sr-back" onclick="closeAfford()"><svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button><div><div class="sr-title">What Can I <em>Afford?</em></div></div></div></div>' +
    '<div class="afford-body"><div class="afford-inputs" id="affordInputs"></div><div class="afford-results" id="affordResults"></div></div>' +
  '</div>';

  // --- Cost of Living Overlay ---
  html += '<div class="col-overlay" id="colOverlay">' +
    '<div class="col-topbar"><div class="admin-topbar-left"><button class="sr-back" onclick="closeCol()"><svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button><div><div class="sr-title">Cost of <em>Living</em></div></div></div></div>' +
    '<div class="col-body" id="colBody"></div>' +
  '</div>';

  // --- Q&A Library Overlay ---
  html += '<div class="qa-overlay" id="qaOverlay">' +
    '<div class="qa-topbar"><div class="admin-topbar-left"><button class="sr-back" onclick="closeQA()"><svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button><div><div class="sr-title">Local Expert <em>Q&A</em></div></div></div></div>' +
    '<div class="qa-body" id="qaBody"></div>' +
  '</div>';

  // --- Notification Panel ---
  html += '<div class="notif-panel" id="notifPanel" style="display:none"><div class="notif-header"><span>Notifications</span><button onclick="markAllNotifsRead()" style="background:none;border:none;color:var(--gold);cursor:pointer;font-size:0.72rem">Mark all read</button></div><div class="notif-list" id="notifList"></div></div>';

  // --- Chat Widget ---
  html += '<div class="chat-preview" id="chatPreview"><div class="chat-preview-header"><div class="chat-preview-hinfo"><div class="chat-av">CC</div><div><div class="chat-hname">Cory\'s Assistant</div><div class="chat-hstatus">Online now</div></div></div><button class="chat-hbtn" id="chatPreviewClose" title="Close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div><div class="chat-preview-body"><div class="msg assistant"><div class="msg-bubble">Skip the filters. Tell me what you\'re after — I can dial in your search better than the big real estate sites. Are you searching for a home, land, investment property, or are you looking to sell?</div></div><div class="quick-actions" id="previewChips"><button class="chip" data-preview-chip>I\'m looking to buy</button><button class="chip" data-preview-chip>I want to sell</button><button class="chip" data-preview-chip>Tell me about the area</button></div></div><div class="chat-preview-input"><div class="chat-input-wrap"><input type="text" class="chat-input" id="chatPreviewInput" placeholder="Type a message..." maxlength="500"><button class="chat-send" id="chatPreviewSend"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button></div></div></div>' +
    '<button class="chat-trigger" id="chatTrigger" onclick="toggleChat()"><div class="chat-trigger-av">CC</div><div class="chat-trigger-label"><span class="chat-trigger-name">Chat with Cory</span><span class="chat-trigger-status">Online Now</span></div><div class="chat-trigger-dot"></div><svg id="triggerIcon" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" fill="none"/></svg><div class="chat-badge" id="chatBadge">1</div></button>' +
    '<div class="chat-panel" id="chatPanel"><div class="chat-header" id="chatHeader"><div class="chat-hinfo"><div class="chat-av">CC</div><div><div class="chat-hname">Cory\'s Assistant</div><div class="chat-hstatus">Online now</div></div></div><div style="display:flex;gap:0.4rem"><button class="chat-hbtn" onclick="clearChat()" title="New chat"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button><button class="chat-hbtn" onclick="minimizeChat()" title="Minimize"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button><button class="chat-hbtn" onclick="toggleChat()" title="Close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div></div><div class="chat-messages" id="chatMessages"></div><div class="chat-input-area"><input type="text" class="chat-hp" id="chatHp" tabindex="-1" autocomplete="off"><div class="chat-input-wrap"><textarea class="chat-input" id="chatInput" placeholder="Type your message..." rows="1" maxlength="500"></textarea><button class="chat-send" id="chatSend" onclick="sendMessage()"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button></div><div class="chat-powered">Powered by AI &middot; Cory Coleman Realty</div></div></div>';

  // Inject all HTML into the page
  document.body.insertAdjacentHTML('beforeend', html);

  // Now that chat elements exist, re-bind listeners
  var ct = document.getElementById('chatTrigger');
  if(ct){ ct.addEventListener('click', toggleChat); ct.classList.add('compact'); }
  bindPreviewListeners();

  // Re-bind chatInput listeners
  var ci = document.getElementById('chatInput');
  if(ci){
    ci.addEventListener('keydown', function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}});
    ci.addEventListener('input', function(){ci.style.height='auto';ci.style.height=Math.min(ci.scrollHeight,100)+'px'});
  }
})();
}

// ═══ INJECT NAV EXTRAS (notification bell + admin link) ═══
(function(){
  var navAcct = document.getElementById('navAcct');
  if(!navAcct) return;
  // Notification bell (before account button)
  if(!document.getElementById('navNotifBell')){
    var bell = document.createElement('div');
    bell.className = 'nav-notif';
    bell.id = 'navNotifBell';
    bell.style.display = 'none';
    bell.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg><span class="notif-badge" id="notifBadge" style="display:none">0</span>';
    bell.onclick = function(){ toggleNotifPanel(); };
    navAcct.parentNode.insertBefore(bell, navAcct);
  }
  // Admin dashboard link (before notification bell)
  if(!document.getElementById('navAdminLink')){
    var link = document.createElement('div');
    link.className = 'nav-admin-link';
    link.id = 'navAdminLink';
    link.style.display = 'none';
    link.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';
    link.title = 'Admin Dashboard';
    link.onclick = function(){ openAdmin(); };
    var bellEl = document.getElementById('navNotifBell');
    if(bellEl) navAcct.parentNode.insertBefore(link, bellEl);
    else navAcct.parentNode.insertBefore(link, navAcct);
  }
})();

// ═══ SCROLL REVEAL ═══
const obs=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('vis');obs.unobserve(e.target)}})},{threshold:0.1,rootMargin:'0px 0px -40px 0px'});
document.querySelectorAll('.reveal').forEach(el=>obs.observe(el));
// Fallback: if elements haven't revealed after 2s, force them visible
setTimeout(()=>{document.querySelectorAll('.reveal:not(.vis)').forEach(el=>el.classList.add('vis'))},2000);

// ═══ COMPACT CHAT TRIGGER ON SCROLL (homepage only) ═══
(function(){
  var areasEl = document.getElementById('areas');
  if(!areasEl) return; // not homepage — handled elsewhere
  var compactObs = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(e.isIntersecting){
        var ct = document.getElementById('chatTrigger');
        if(ct && !ct.classList.contains('open')) ct.classList.add('compact');
        var cprev = document.getElementById('chatPreview');
        if(cprev) cprev.classList.remove('show');
        var cb = document.getElementById('chatBadge');
        if(cb) cb.classList.remove('show');
        compactObs.unobserve(areasEl);
      }
    });
  }, {threshold: 0.1});
  compactObs.observe(areasEl);
})();

// ═══ SMOOTH SCROLL ═══
document.querySelectorAll('a[href^="#"]').forEach(a=>{a.addEventListener('click',function(e){e.preventDefault();const t=document.querySelector(this.getAttribute('href'));if(t)t.scrollIntoView({behavior:'smooth',block:'start'})})});

// ═══ SIMPLYRETS IDX INTEGRATION ═══
var SIMPLYRETS = {
  // ─── CONFIGURATION ───────────────────────────────────────────────
  // Set enabled:true and enter your credentials to pull live MLS data.
  // Demo credentials (simplyrets:simplyrets) show sample Houston data.
  // When your MLS is connected, replace with your real API key/secret.
  enabled: false,                                    // Disabled — using MLS_GRID (Navica CSAR) instead
  apiKey:  'simplyrets',                             // Your SimplyRETS API key
  apiSecret: 'simplyrets',                           // Your SimplyRETS API secret
  apiUrl: 'https://api.simplyrets.com/properties',   // API endpoint
  limit: 500,                                        // Max listings per request
  // Map SimplyRETS city names → your town slugs (fill in when MLS connected)
  cityMap: {
    // 'MLS City Name': 'your-town-slug'
    // Example for WNC MLS:
    // 'Waynesville': 'waynesville',
    // 'Sylva': 'sylva',
    // 'Cashiers': 'cashiers-highlands',
    // 'Highlands': 'cashiers-highlands',
    // 'Bryson City': 'bryson-city',
    // 'Maggie Valley': 'maggie-valley',
    // 'Franklin': 'franklin',
    // 'Dillsboro': 'dillsboro',
    // 'Cullowhee': 'cullowhee',
  },
  // ─── INTERNAL ────────────────────────────────────────────────────
  loaded: false,

  // Fetch listings from SimplyRETS API
  fetch: function(params) {
    var url = SIMPLYRETS.apiUrl + '?limit=' + SIMPLYRETS.limit;
    if(params) url += '&' + params;
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true, SIMPLYRETS.apiKey, SIMPLYRETS.apiSecret);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.onload = function() {
        if(xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch(e) { reject(new Error('SimplyRETS JSON parse error')); }
        } else {
          reject(new Error('SimplyRETS API error: ' + xhr.status));
        }
      };
      xhr.onerror = function() { reject(new Error('SimplyRETS network error — check console')); };
      xhr.send();
    });
  },

  // Map a SimplyRETS listing → local format
  mapListing: function(sr) {
    var typeMap = {'RES':'Single Family','Residential':'Single Family','LND':'Land','Land':'Land',
                   'CND':'Condo','Condominium':'Condo','MUL':'Multi-Family','Multifamily':'Multi-Family',
                   'COM':'Commercial','Commercial':'Commercial','FRM':'Farm','Farm':'Farm','Rental':'Rental'};
    var pType = (sr.property && sr.property.type) ? sr.property.type : '';
    var mappedType = typeMap[pType] || pType || 'Single Family';
    var lotRaw = (sr.property && sr.property.lotSize) ? sr.property.lotSize : '';
    var lotAc = lotRaw ? (parseFloat(lotRaw) > 500 ? (parseFloat(lotRaw)/43560).toFixed(2)+' ac' : lotRaw+' ac') : '';
    var restrict = 'unrestricted';
    if(sr.association && sr.association.fee && sr.association.fee > 0) restrict = 'hoa';
    var statusRaw = (sr.mls && sr.mls.statusText) ? sr.mls.statusText : 'Active';
    var status = statusRaw;
    if(statusRaw.toLowerCase().indexOf('pending')>-1 || statusRaw.toLowerCase().indexOf('contract')>-1) status = 'Under Contract';
    if(statusRaw.toLowerCase().indexOf('closed')>-1) status = 'Sold';
    var city = (sr.address && sr.address.city) ? sr.address.city : 'Unknown';
    return {
      mlsId: sr.mlsId || null,
      listingId: sr.listingId || null,
      price: sr.listPrice || 0,
      address: (sr.address && sr.address.full) ? sr.address.full : '',
      city: city,
      type: mappedType,
      beds: (sr.property && sr.property.bedrooms) ? sr.property.bedrooms : 0,
      baths: (sr.property && sr.property.bathsFull) ? sr.property.bathsFull : 0,
      sqft: (sr.property && sr.property.area) ? sr.property.area : 0,
      lot: lotAc,
      status: status,
      restrictions: restrict,
      photo: (sr.photos && sr.photos.length) ? sr.photos[0] : null,
      photos: sr.photos || [],
      lat: (sr.geo && sr.geo.lat) ? sr.geo.lat : null,
      lng: (sr.geo && sr.geo.lng) ? sr.geo.lng : null,
      yearBuilt: (sr.property && sr.property.yearBuilt) ? sr.property.yearBuilt : null,
      daysOnMarket: (sr.mls && sr.mls.daysOnMarket) ? sr.mls.daysOnMarket : 0,
      description: sr.remarks || '',
      _src: 'simplyrets'
    };
  },

  // Resolve a city name to a town slug
  resolveTown: function(cityName) {
    // Check explicit mapping first
    if(SIMPLYRETS.cityMap[cityName]) return SIMPLYRETS.cityMap[cityName];
    // Auto-slug: lowercase, replace spaces with hyphens
    return cityName.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'');
  },

  // Load all listings and populate site data structures
  init: function() {
    if(!SIMPLYRETS.enabled) return Promise.resolve();
    console.log('[SimplyRETS] Fetching listings...');
    return SIMPLYRETS.fetch('status=Active&include=association').then(function(data) {
      if(!data || !data.length) { console.warn('[SimplyRETS] No listings returned'); return; }
      console.log('[SimplyRETS] Received ' + data.length + ' listings');
      var mapped = data.map(SIMPLYRETS.mapListing);

      // Build TOWN_LISTINGS from API data
      var newTowns = {};
      mapped.forEach(function(l) {
        var slug = SIMPLYRETS.resolveTown(l.city);
        if(!newTowns[slug]) {
          newTowns[slug] = { display: l.city, listings: [] };
        }
        newTowns[slug].listings.push({
          price:l.price, address:l.address, type:l.type, beds:l.beds, baths:l.baths,
          sqft:l.sqft, sqftRange:l.sqftRange||'', lot:l.lot, status:l.status, restrictions:l.restrictions,
          photo:l.photo, photos:l.photos, lat:l.lat, lng:l.lng,
          mlsId:l.mlsId, listingId:l.listingId, yearBuilt:l.yearBuilt,
          daysOnMarket:l.daysOnMarket, description:l.description
        });
      });

      // Replace global data
      Object.keys(TOWN_LISTINGS).forEach(function(k){ delete TOWN_LISTINGS[k]; });
      Object.keys(newTowns).forEach(function(k){ TOWN_LISTINGS[k] = newTowns[k]; });

      // Update LISTINGS (featured) — 6 newest listings with photos
      var sorted = mapped.filter(function(l){return l.photo}).sort(function(a,b){
        var aDays = (typeof a.daysOnMarket === 'number') ? a.daysOnMarket : 9999;
        var bDays = (typeof b.daysOnMarket === 'number') ? b.daysOnMarket : 9999;
        return aDays - bDays;
      });
      LISTINGS.length = 0;
      sorted.slice(0,6).forEach(function(l,i){
        LISTINGS.push({
          id:i+1, price:l.price, address:l.address, city:l.city, type:l.type,
          beds:l.beds, baths:l.baths, sqft:l.sqft, sqftRange:l.sqftRange||'', lot:l.lot,
          photo:l.photo, photos:l.photos, days:l.daysOnMarket,
          mlsId:l.mlsId, restrictions:l.restrictions, status:l.status
        });
      });

      // Rebuild ALL_LISTINGS
      ALL_LISTINGS.length = 0;
      LISTINGS.forEach(function(l){
        ALL_LISTINGS.push({
          price:l.price, address:l.address, city:l.city, type:l.type,
          beds:l.beds, baths:l.baths, sqft:l.sqft, sqftRange:l.sqftRange||'', lot:l.lot,
          photo:l.photo, photos:l.photos, status:l.status||'Active',
          restrictions:l.restrictions||'unrestricted', _src:'featured',
          lat:null, lng:null, mlsId:l.mlsId
        });
      });
      Object.keys(TOWN_LISTINGS).forEach(function(tid){
        var td = TOWN_LISTINGS[tid];
        td.listings.forEach(function(l){
          var isDup = ALL_LISTINGS.some(function(e){return e.address===l.address && e.price===l.price});
          if(!isDup){
            ALL_LISTINGS.push({
              price:l.price, address:l.address, city:td.display, type:l.type,
              beds:l.beds, baths:l.baths, sqft:l.sqft, sqftRange:l.sqftRange||'', lot:l.lot,
              photo:l.photo||null, photos:l.photos||[], status:l.status||'Active',
              restrictions:l.restrictions||'unrestricted', _src:'simplyrets',
              lat:l.lat||null, lng:l.lng||null, mlsId:l.mlsId
            });
          }
        });
      });

      // Assign coordinates — use API lat/lng if available, fallback to town coords
      ALL_LISTINGS.forEach(function(l){
        if(l.lat && l.lng) return; // API provided coords
        var tc = TOWN_COORDS[l.city];
        var rand = function(){return Math.random()};
        if(tc){
          l.lat = tc.lat + (rand()-0.5)*0.06;
          l.lng = tc.lng + (rand()-0.5)*0.06;
        } else {
          l.lat = 35.38 + (rand()-0.5)*0.15;
          l.lng = -83.18 + (rand()-0.5)*0.3;
        }
      });

      // Re-render featured
      var grid = document.getElementById('featuredGrid');
      if(grid) {
        grid.innerHTML = '';
        LISTINGS.slice(0,6).forEach(function(l,i){
          var c=document.createElement('div');c.className='f-card reveal vis';
          var feats=_cardFeats(l);
          var imgSrc = l.photo || 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=700&q=80';
          var hpStatus=l.status==='Under Contract'?'<div class="card-status-tag">Under Contract</div>':'';
          c.innerHTML='<div class="f-card-img"><img src="'+imgSrc+'" alt="'+l.address+'" loading="lazy"><div class="f-card-badge '+(l.type==='Land'?'land':'')+'">'+l.type+'</div>'+hpStatus+cardFavHtml(l.address,l.city)+'</div><div class="f-card-body"><div class="f-card-price">$'+l.price.toLocaleString()+'</div><div class="f-card-addr">'+l.address+'</div><div class="f-card-city">'+l.city+', NC</div><div class="f-card-features">'+feats+'</div></div>';
          c.onclick=function(){try{openProp({price:l.price,address:l.address,type:l.type,beds:l.beds,baths:l.baths,sqft:l.sqft,lot:l.lot,restrictions:l.restrictions||'unrestricted',status:l.status||'Active',photo:l.photo||null,photos:l.photos||[],description:l.description||''},l.city)}catch(err){console.error(err)}};
          grid.appendChild(c);
        });
      }

      // Update town page nav with new towns
      SIMPLYRETS._updateTownNav();
      SIMPLYRETS.loaded = true;
      // Update IDX timestamp to reflect data freshness
      var tsEl = document.getElementById('idxTimestamp');
      if(tsEl) tsEl.textContent = 'Data last updated: ' + new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) + ' at ' + new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
      // Sync listings to Supabase cache for notification system
      if(_sb && ALL_LISTINGS.length > 0){
        SIMPLYRETS._syncListingsCache(ALL_LISTINGS);
      }
      console.log('[SimplyRETS] Site updated with ' + ALL_LISTINGS.length + ' total listings across ' + Object.keys(TOWN_LISTINGS).length + ' areas');
      // Briefly show success for debugging — remove in production
      var okDiv = document.createElement('div');
      okDiv.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:#1a2e1a;color:#90ee90;padding:12px 20px;border-radius:8px;z-index:99999;font-size:13px;border:1px solid #2a5e2a;max-width:90%';
      okDiv.textContent = 'SimplyRETS connected — Loaded ' + data.length + ' listings';
      document.body.appendChild(okDiv);
      setTimeout(function(){ okDiv.remove(); }, 5000);
    }).catch(function(err){
      console.error('[SimplyRETS] Failed to load:', err.message);
      console.log('[SimplyRETS] Falling back to demo data');
      // Briefly show error for debugging — remove in production
      var errDiv = document.createElement('div');
      errDiv.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:#331a1a;color:#ff9999;padding:12px 20px;border-radius:8px;z-index:99999;font-size:13px;border:1px solid #662222;max-width:90%';
      errDiv.textContent = 'SimplyRETS: ' + err.message + ' — Using fallback demo data';
      document.body.appendChild(errDiv);
      setTimeout(function(){ errDiv.remove(); }, 8000);
    });
  },

  // Update the town page navigation if new towns from API
  _updateTownNav: function() {
    console.log('[SimplyRETS] Available towns:', Object.keys(TOWN_LISTINGS).map(function(k){return TOWN_LISTINGS[k].display}));
  },

  // Sync listings to Supabase cache for new-listing notifications
  _syncListingsCache: function(listings) {
    if(!_sb || !listings.length) return;
    var batch = listings.map(function(l){
      var key = (l.address + '|' + (l.city||'')).toLowerCase().replace(/\s+/g,'-');
      return {
        listing_key: key,
        listing_data: {
          address: l.address, city: l.city, price: l.price,
          type: l.type, beds: l.beds, baths: l.baths,
          sqft: l.sqft, lot: l.lot, status: l.status,
          photo: l.photo || null
        }
      };
    });
    // Upsert in chunks of 50
    var chunk = 50;
    for(var i=0; i<batch.length; i+=chunk){
      var slice = batch.slice(i, i+chunk);
      _sb.from('listings_cache').upsert(slice, {onConflict:'listing_key', ignoreDuplicates:true})
        .then(function(){})
        .catch(function(e){ console.warn('[SimplyRETS] Cache sync error:', e); });
    }
    console.log('[SimplyRETS] Syncing ' + batch.length + ' listings to notification cache');
  }
};

// ═══ MLS GRID (via Supabase) ═══
// When MLS Grid feed is active, this replaces SimplyRETS.
// Set MLS_GRID.enabled = true and SIMPLYRETS.enabled = false to switch.
var MLS_GRID = {
  enabled: true, // Navica CSAR sync is live — queries mls_listings from Supabase
  // Town slugs mapped from MLS city names
  cityMap: {
    'Waynesville': 'waynesville',
    'Sylva': 'sylva',
    'Cashiers': 'cashiers-highlands',
    'Highlands': 'cashiers-highlands',
    'Bryson City': 'bryson-city',
    'Maggie Valley': 'maggie-valley',
    'Franklin': 'franklin',
    'Dillsboro': 'dillsboro',
    'Cullowhee': 'cullowhee',
  },
  resolveTown: function(city) {
    if(MLS_GRID.cityMap[city]) return MLS_GRID.cityMap[city];
    return city.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'');
  },
  // Map DB row to site listing format
  mapListing: function(row) {
    var typeMap = {'Residential':'Single Family','Land':'Land','Condominium':'Condo',
                   'Commercial Sale':'Commercial','Farm':'Farm','Multifamily':'Multi-Family'};
    var pType = typeMap[row.property_type] || row.property_sub_type || row.property_type || 'Single Family';
    var lotAc = row.lot_size_acres ? parseFloat(row.lot_size_acres).toFixed(2)+' ac' :
                row.lot_size_square_feet ? (parseFloat(row.lot_size_square_feet)/43560).toFixed(2)+' ac' : '';
    var restrict = 'unrestricted';
    if(row.association_fee && parseFloat(row.association_fee) > 0) restrict = 'hoa';
    var status = row.standard_status || 'Active';
    if(status.toLowerCase().indexOf('pending')>-1 || status.toLowerCase().indexOf('contract')>-1) status = 'Under Contract';
    if(status.toLowerCase().indexOf('closed')>-1) status = 'Sold';
    return {
      mlsId: row.listing_id,
      listingId: row.listing_id,
      listingKey: row.listing_key,
      price: row.list_price || 0,
      address: row.full_address || '',
      city: row.city || '',
      type: pType,
      beds: row.bedrooms_total || 0,
      baths: row.bathrooms_total_integer || 0,
      sqft: row.living_area ? parseInt(row.living_area) : 0,
      sqftRange: row.living_area_range || '',
      lot: lotAc,
      status: status,
      restrictions: restrict,
      photo: null, // Set from media query
      photos: [],
      lat: row.latitude && parseFloat(row.latitude) > 34.8 && parseFloat(row.latitude) < 36.0 ? parseFloat(row.latitude) : null,
      lng: row.longitude && parseFloat(row.longitude) > -84.5 && parseFloat(row.longitude) < -82.5 ? parseFloat(row.longitude) : null,
      yearBuilt: row.year_built,
      daysOnMarket: row.days_on_market || 0,
      description: row.public_remarks || '',
      listAgent: row.list_agent_full_name || '',
      listOffice: row.list_office_name || '',
      listOfficePhone: row.list_office_phone || '',
      attributionContact: row.attribution_contact || '',
      originatingSystem: row.originating_system_name || '',
      _src: 'mlsgrid'
    };
  },
  // Readable MLS source label from originating_system_name
  _mlsLabel: function(sys) {
    if(!sys) return 'MLS';
    var s = sys.toLowerCase();
    if(s === 'csar' || s.indexOf('carolina smokies') > -1) return 'CSAR';
    // Canopy MLS / MLS Grid — the originating system name from MLS Grid
    return 'Canopy MLS';
  },
  // Merge duplicate listings that appear in both CSAR and Canopy MLS.
  // Match by normalized address+city. The merged listing keeps the data from
  // the version with the most complete info (photo, description, etc.) and
  // stores an mlsSources array crediting each MLS feed.
  // Same-system duplicates (e.g. 3 CSAR listings for one property) are
  // collapsed to the newest MLS# only — the older ones are stale relists.
  _deduplicateListings: function(listings) {
    var groups = {};
    listings.forEach(function(l) {
      // Normalize: lowercase, strip punctuation/whitespace, combine address+city
      // If address is empty/missing, use mlsId as key so it never groups with others
      var addr = (l.address || '').trim();
      var key = addr ? (addr + '|' + l.city).toLowerCase().replace(/[^a-z0-9|]/g, '') : ('_mls_' + l.mlsId);
      if(!groups[key]) groups[key] = [];
      groups[key].push(l);
    });
    var merged = [];
    Object.keys(groups).forEach(function(key) {
      var group = groups[key];
      if(group.length === 1) {
        // Single source — wrap in mlsSources for consistent downstream access
        var single = group[0];
        single.mlsSources = [{ system: MLS_GRID._mlsLabel(single.originatingSystem), mlsId: single.mlsId, attributionContact: single.attributionContact }];
        merged.push(single);
      } else {
        // Multiple listings for same address — deduplicate by MLS system.
        // Within each system, keep only the newest listing (highest MLS#).
        var bySystem = {};
        group.forEach(function(l) {
          var sys = MLS_GRID._mlsLabel(l.originatingSystem);
          if(!bySystem[sys]) bySystem[sys] = [];
          bySystem[sys].push(l);
        });
        // For each system, sort by MLS ID descending and keep only the newest
        var bestPerSystem = [];
        Object.keys(bySystem).forEach(function(sys) {
          var sysGroup = bySystem[sys];
          sysGroup.sort(function(a, b) {
            // Higher MLS ID = newer listing
            var aId = parseInt(a.mlsId) || 0;
            var bId = parseInt(b.mlsId) || 0;
            if(bId !== aId) return bId - aId;
            // Tiebreak: prefer one with photo/description
            var aScore = (a.photo ? 100 : 0) + (a.description ? 10 : 0) + (a.sqft ? 1 : 0);
            var bScore = (b.photo ? 100 : 0) + (b.description ? 10 : 0) + (b.sqft ? 1 : 0);
            return bScore - aScore;
          });
          bestPerSystem.push(sysGroup[0]); // newest from this system
        });
        // Now pick the best across systems as primary
        bestPerSystem.sort(function(a, b) {
          var aScore = (a.photo ? 100 : 0) + (a.description ? 10 : 0) + (a.sqft ? 1 : 0);
          var bScore = (b.photo ? 100 : 0) + (b.description ? 10 : 0) + (b.sqft ? 1 : 0);
          return bScore - aScore;
        });
        var primary = bestPerSystem[0];
        primary.mlsSources = bestPerSystem.map(function(l) {
          return { system: MLS_GRID._mlsLabel(l.originatingSystem), mlsId: l.mlsId, attributionContact: l.attributionContact };
        });
        // If primary lacks a photo but another has one, take it
        if(!primary.photo) {
          for(var i = 1; i < bestPerSystem.length; i++) {
            if(bestPerSystem[i].photo) { primary.photo = bestPerSystem[i].photo; primary.photos = bestPerSystem[i].photos; break; }
          }
        }
        merged.push(primary);
      }
    });
    return merged;
  },
  // Paginated fetch helper — Supabase caps at 1000 rows per request
  _fetchAll: function(table, selectCols, filters) {
    var PAGE = 1000;
    var allRows = [];
    function fetchPage(offset) {
      var q = _sb.from(table).select(selectCols).range(offset, offset + PAGE - 1);
      // Apply filters
      if(filters) {
        filters.forEach(function(f) { q = q[f.method].apply(q, f.args); });
      }
      return q.then(function(res) {
        if(res.error) throw new Error(res.error.message);
        var rows = res.data || [];
        allRows = allRows.concat(rows);
        if(rows.length === PAGE) return fetchPage(offset + PAGE); // more pages
        return allRows;
      });
    }
    return fetchPage(0);
  },
  init: function() {
    if(!MLS_GRID.enabled) return Promise.resolve();
    if(!_sb) {
      console.error('[MLS Grid] Supabase client not available — cannot load listings');
      var _fg = document.getElementById('featuredGrid');
      if(_fg) { var _ld = _fg.querySelector('.idx-loading'); if(_ld) _ld.innerHTML = '<div style="margin-bottom:0.8rem;font-size:1.8rem;">&#x26A0;</div>Unable to connect to listing database.<div style="margin-top:0.5rem;font-size:0.85rem;opacity:0.6;">Please refresh the page or try again later.</div>'; }
      return Promise.resolve();
    }
    console.log('[MLS Grid] Loading listings from Supabase...');

    // Fetch all listings (paginated) and all primary photos (paginated) in parallel
    var listingsPromise = MLS_GRID._fetchAll('mls_listings',
      'listing_id,listing_key,list_price,full_address,city,property_type,property_sub_type,' +
      'bedrooms_total,bathrooms_total_integer,living_area,living_area_range,lot_size_acres,lot_size_square_feet,' +
      'standard_status,association_fee,latitude,longitude,year_built,days_on_market,' +
      'public_remarks,list_agent_full_name,list_office_name,list_office_phone,attribution_contact,originating_system_name', [
      { method: 'eq', args: ['mlg_can_view', true] },
      { method: 'in', args: ['standard_status', ['Active','Active Under Contract','Pending']] },
      { method: 'neq', args: ['property_type', 'Residential Lease'] }
    ]);
    var mediaPromise = MLS_GRID._fetchAll('mls_media', 'listing_key, local_url, media_url', [
      { method: 'eq', args: ['"order"', 1] }
    ]);

    return Promise.all([listingsPromise, mediaPromise]).then(function(results) {
        var listingRows = results[0];
        var mediaRows = results[1];

        if(!listingRows || !listingRows.length) {
          console.warn('[MLS Grid] No listings found');
          var _fg2 = document.getElementById('featuredGrid');
          if(_fg2) { var _ld2 = _fg2.querySelector('.idx-loading'); if(_ld2) _ld2.innerHTML = '<div style="margin-bottom:0.8rem;font-size:1.8rem;">&#x1F3E0;</div>No active listings found at this time.<div style="margin-top:0.5rem;font-size:0.85rem;opacity:0.6;">Please check back soon.</div>'; }
          return;
        }
        console.log('[MLS Grid] Received ' + listingRows.length + ' listings');
        var mapped = listingRows.map(MLS_GRID.mapListing);

        // Build photo lookup from paginated media results
        var mediaMap = {};
        mediaRows.forEach(function(m) {
          mediaMap[m.listing_key] = m.local_url || m.media_url;
        });
        console.log('[MLS Grid] Primary photos loaded: ' + mediaRows.length + ' rows, ' + Object.keys(mediaMap).length + ' unique listings');

        // Assign primary photo to listings
        var withPhoto = 0, noPhoto = 0;
        mapped.forEach(function(l) {
          l.photo = mediaMap[l.listingKey] || null;
          l.photos = l.photo ? [l.photo] : [];
          if(l.photo) withPhoto++; else noPhoto++;
        });
        console.log('[MLS Grid] Photo assignment: ' + withPhoto + ' with photo, ' + noPhoto + ' without');

        // ── Multi-MLS deduplication ─────────────────────────────
        // Both CSAR (Navica) and Canopy MLS (MLS Grid) write to the same table.
        // If the same property appears in both feeds, merge into a single listing
        // with mlsSources array crediting both MLSs and both MLS numbers.
        var preDedupCount = mapped.length;
        mapped = MLS_GRID._deduplicateListings(mapped);
        if(preDedupCount !== mapped.length) {
          console.log('[MLS Grid] Deduplicated: ' + preDedupCount + ' → ' + mapped.length + ' listings (' + (preDedupCount - mapped.length) + ' duplicates merged)');
        }

        // Populate TOWN_LISTINGS
        var newTowns = {};
        mapped.forEach(function(l) {
          var slug = MLS_GRID.resolveTown(l.city);
          if(!newTowns[slug]) newTowns[slug] = { display: l.city, listings: [] };
          newTowns[slug].listings.push(l);
        });
        Object.keys(TOWN_LISTINGS).forEach(function(k){ delete TOWN_LISTINGS[k]; });
        Object.keys(newTowns).forEach(function(k){ TOWN_LISTINGS[k] = newTowns[k]; });

        // Populate LISTINGS (featured) — 6 newest listings with photos (by days on market)
        var sorted = mapped.filter(function(l){return l.photo}).sort(function(a,b){
          var aDays = (typeof a.daysOnMarket === 'number') ? a.daysOnMarket : 9999;
          var bDays = (typeof b.daysOnMarket === 'number') ? b.daysOnMarket : 9999;
          return aDays - bDays; // lowest days on market = newest listing
        });
        LISTINGS.length = 0;
        sorted.slice(0,6).forEach(function(l,i){
          LISTINGS.push({
            id:i+1, price:l.price, address:l.address, city:l.city, type:l.type,
            beds:l.beds, baths:l.baths, sqft:l.sqft, sqftRange:l.sqftRange||'', lot:l.lot,
            photo:l.photo, photos:l.photos, days:l.daysOnMarket,
            mlsId:l.mlsId, restrictions:l.restrictions, status:l.status,
            listingKey:l.listingKey,
            listAgent:l.listAgent, listOffice:l.listOffice, listOfficePhone:l.listOfficePhone,
            attributionContact:l.attributionContact,
            originatingSystem:l.originatingSystem, mlsSources:l.mlsSources
          });
        });

        // Rebuild ALL_LISTINGS
        ALL_LISTINGS.length = 0;
        mapped.forEach(function(l){
          ALL_LISTINGS.push({
            price:l.price, address:l.address, city:l.city, type:l.type,
            beds:l.beds, baths:l.baths, sqft:l.sqft, sqftRange:l.sqftRange||'', lot:l.lot,
            photo:l.photo, photos:l.photos, status:l.status,
            restrictions:l.restrictions, _src:'mlsgrid',
            lat:l.lat, lng:l.lng, mlsId:l.mlsId, description:l.description,
            daysOnMarket:l.daysOnMarket, listingKey:l.listingKey,
            listAgent:l.listAgent, listOffice:l.listOffice, listOfficePhone:l.listOfficePhone,
            attributionContact:l.attributionContact,
            originatingSystem:l.originatingSystem, mlsSources:l.mlsSources
          });
        });

        // Cache listings for instant load on next visit
        try {
          localStorage.setItem('cc_listings_cache', JSON.stringify({
            ts: Date.now(),
            listings: ALL_LISTINGS
          }));
          console.log('[MLS Grid] Cached ' + ALL_LISTINGS.length + ' listings to localStorage');
        } catch(e) { console.warn('[MLS Grid] Cache write failed:', e.message); }

        // Update timestamps
        var _tsNow = new Date();
        var _tsFormatted = _tsNow.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) + ' at ' + _tsNow.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
        var tsEl = document.getElementById('idxTimestamp');
        if(tsEl) tsEl.textContent = 'Data last updated: ' + _tsFormatted;
        // Rule 24 compliance: MLS GRID data timestamp in disclaimer
        var gridTsEl = document.getElementById('idxGridTimestamp');
        if(gridTsEl) gridTsEl.textContent = _tsFormatted;

        // Remove demo banner
        var demoBanner = document.getElementById('demoBanner');
        if(demoBanner) demoBanner.remove();
        var demoNote = document.querySelector('.idx-demo-note');
        if(demoNote) demoNote.style.display = 'none';

        // Re-render
        renderFeatured();
        console.log('[MLS Grid] Site updated with ' + ALL_LISTINGS.length + ' listings across ' + Object.keys(TOWN_LISTINGS).length + ' areas');
      }).catch(function(err){
        console.error('[MLS Grid] Failed to load:', err.message || err);
        var _fg = document.getElementById('featuredGrid');
        if(_fg) { var _ld = _fg.querySelector('.idx-loading'); if(_ld) _ld.innerHTML = '<div style="margin-bottom:0.8rem;font-size:1.8rem;">&#x26A0;</div>Unable to load listings. Please refresh the page.<div style="margin-top:0.5rem;font-size:0.85rem;opacity:0.6;">' + (err.message || 'Connection error') + '</div>'; }
      });
  },
  // Load all photos for a specific listing (on-demand for property detail overlay)
  loadPhotos: function(listingKey) {
    if(!_sb || !listingKey) return Promise.resolve([]);
    return _sb.from('mls_media')
      .select('local_url, media_url, order')
      .eq('listing_key', listingKey)
      .order('order', {ascending: true})
      .limit(50)
      .then(function(res) {
        if(!res.data || !res.data.length) return [];
        return res.data.map(function(m) { return m.local_url || m.media_url; });
      }).catch(function(err) {
        console.warn('[MLS Grid] Failed to load photos for ' + listingKey, err);
        return [];
      });
  }
};

// ═══ DEMO LISTINGS ═══
var LISTINGS=[
  {id:1,price:389900,address:"74 Mountain View Rd",city:"Waynesville",type:"Single Family",beds:3,baths:2,sqft:1840,lot:"0.82 ac",photo:"https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=700&q=80",days:12,listAgent:"Sarah Mitchell",listOffice:"Blue Ridge Realty Group",listOfficePhone:"(828) 555-0142",attributionContact:"(828) 555-0142",mlsId:"DEMO-1001",originatingSystem:"CSAR",mlsSources:[{system:"CSAR",mlsId:"DEMO-1001",attributionContact:"(828) 555-0142"}]},
  {id:2,price:549000,address:"218 Ridge Top Lane",city:"Sylva",type:"Single Family",beds:4,baths:3,sqft:2680,lot:"1.45 ac",photo:"https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=700&q=80",days:7,listAgent:"Mark Thompson",listOffice:"Mountain Home Real Estate",listOfficePhone:"(828) 555-0287",attributionContact:"(828) 555-0287",mlsId:"DEMO-1002",originatingSystem:"Canopy MLS",mlsSources:[{system:"Canopy MLS",mlsId:"DEMO-1002",attributionContact:"(828) 555-0287"}]},
  {id:3,price:159900,address:"Lot 12, Smoky Hollow Rd",city:"Maggie Valley",type:"Land",beds:0,baths:0,sqft:0,lot:"3.2 ac",photo:"https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=700&q=80",days:34,listAgent:"Cory Coleman",listOffice:"Keller Williams Great Smokies",listOfficePhone:"(828) 506-6413",attributionContact:"(828) 506-6413",mlsId:"DEMO-1003",originatingSystem:"CSAR",mlsSources:[{system:"CSAR",mlsId:"DEMO-1003",attributionContact:"(828) 506-6413"},{system:"Canopy MLS",mlsId:"DEMO-7003",attributionContact:"(828) 506-6413"}]},
  {id:4,price:895000,address:"42 Whitewater Falls Dr",city:"Cashiers",type:"Single Family",beds:5,baths:4,sqft:3920,lot:"2.1 ac",photo:"https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=700&q=80",days:18,listAgent:"Jennifer Adams",listOffice:"Cashiers Valley Real Estate",listOfficePhone:"(828) 555-0391",attributionContact:"(828) 555-0391",mlsId:"DEMO-1004",originatingSystem:"Canopy MLS",mlsSources:[{system:"Canopy MLS",mlsId:"DEMO-1004",attributionContact:"(828) 555-0391"}]},
  {id:5,price:274900,address:"155 Tuckasegee River Rd",city:"Bryson City",type:"Cabin",beds:2,baths:2,sqft:1280,lot:"0.65 ac",photo:"https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=700&q=80",days:5,listAgent:"David Harmon",listOffice:"Smoky Mountain Properties",listOfficePhone:"(828) 555-0518",attributionContact:"(828) 555-0518",mlsId:"DEMO-1005",originatingSystem:"CSAR",mlsSources:[{system:"CSAR",mlsId:"DEMO-1005",attributionContact:"(828) 555-0518"}]},
  {id:6,price:1250000,address:"1 Summit Overlook",city:"Cashiers",type:"Single Family",beds:6,baths:5,sqft:5200,lot:"3.5 ac",photo:"https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=700&q=80",days:28,listAgent:"Patricia Wells",listOffice:"Highlands Sotheby's International",listOfficePhone:"(828) 555-0672",attributionContact:"(828) 555-0672",mlsId:"DEMO-1006",originatingSystem:"CSAR",mlsSources:[{system:"CSAR",mlsId:"DEMO-1006",attributionContact:"(828) 555-0672"},{system:"Canopy MLS",mlsId:"DEMO-7006",attributionContact:"(828) 555-0672"}]}
];

// Helper: check if listing has any square footage data
function _hasSqftData(l) {
  return (l.sqft && l.sqft > 0) || (l.sqftRange && l.sqftRange.length > 0);
}

// Helper: display square footage — use exact sqft if available, fall back to range
// Returns formatted string like "1,840" or "1,500–2,000" or "" if no data
function _formatSqft(l) {
  if(l.sqft && l.sqft > 0) return l.sqft.toLocaleString();
  if(l.sqftRange) {
    // Range might come as "1000-1500" or "1,000 - 1,500" or similar
    var parts = l.sqftRange.replace(/,/g,'').split(/\s*[-–—]\s*/);
    if(parts.length === 2) {
      var lo = parseInt(parts[0]), hi = parseInt(parts[1]);
      if(!isNaN(lo) && !isNaN(hi)) return lo.toLocaleString() + '–' + hi.toLocaleString();
    }
    return l.sqftRange; // Return raw value if we can't parse it
  }
  return '';
}

// Helper: build the sqft label for cards — "SF" for exact, "SF (range)" for range
function _sqftLabel(l) {
  if(l.sqft && l.sqft > 0) return 'SF';
  if(l.sqftRange) return 'SF (range)';
  return 'SF';
}

// Helper: parse lot string like "0.82 ac" → numeric acres (0 if unparseable)
function _parseLotAcres(lot) {
  if(!lot) return 0;
  var m = String(lot).match(/([\d.]+)\s*ac/i);
  return m ? parseFloat(m[1]) : 0;
}

// Helper: build card feature chips for non-Land listings
// Shows beds, baths, sqft (or lot if no sqft data)
function _cardFeats(l) {
  if(l.type === 'Land') return '<span class="f-feat"><strong>' + l.lot + '</strong></span>';
  var h = '<span class="f-feat"><strong>' + l.beds + '</strong> Beds</span>' +
          '<span class="f-feat"><strong>' + l.baths + '</strong> Baths</span>';
  if(_hasSqftData(l)) {
    h += '<span class="f-feat"><strong>' + _formatSqft(l) + '</strong> ' + _sqftLabel(l) + '</span>';
  } else if(l.lot) {
    h += '<span class="f-feat"><strong>' + l.lot + '</strong> Lot</span>';
  }
  return h;
}

// Helper: format MLS numbers from mlsSources array for display
// Single source: "MLS# 12345"
// Dual source:   "CSAR MLS# 12345 | Canopy MLS# 67890"
function _formatMlsNums(l) {
  if(l.mlsSources && l.mlsSources.length > 1) {
    return l.mlsSources.map(function(s) { return s.system + ' MLS# ' + s.mlsId; }).join(' | ');
  }
  if(l.mlsSources && l.mlsSources.length === 1) {
    return 'MLS# ' + l.mlsSources[0].mlsId;
  }
  return l.mlsId ? 'MLS# ' + l.mlsId : '';
}

// Helper: generate heart icon HTML for a property card (defined early so all card renderers can use it)
function cardFavHtml(address, city) {
  var key = (address + '|' + (city||'')).toLowerCase();
  var saved = (typeof _favProps!=='undefined' && _favProps[key]) ? ' saved' : '';
  return '<button class="card-fav-heart'+saved+'" data-key="'+key+'" onclick="toggleCardFav(event,\''+address.replace(/'/g,"\\'")+'\',\''+city.replace(/'/g,"\\'")+'\')"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button>';
}

function renderFeatured(){
  const grid=document.getElementById('featuredGrid');
  if(!grid) return;
  grid.innerHTML = ''; // Clear loading state / previous cards
  LISTINGS.slice(0,6).forEach(function(l,i){
    const c=document.createElement('div');c.className='f-card reveal';
    const feats=_cardFeats(l);
    var brokerParts=[];if(l.listAgent)brokerParts.push(l.listAgent);if(l.listOffice)brokerParts.push(l.listOffice);
    var mlsNums = _formatMlsNums(l);
    var brokerHtml=brokerParts.length?'<div class="f-card-office">Listed by '+brokerParts.join(' &bull; ')+(mlsNums?' | '+mlsNums:'')+'</div>':'';
    var isDemo = l.mlsId && l.mlsId.toString().indexOf('DEMO') === 0;
    var rfStatus=l.status==='Under Contract'?'<div class="card-status-tag">Under Contract</div>':'';
    c.innerHTML='<div class="f-card-img"><img src="'+l.photo+'" alt="'+l.address+'" loading="lazy"><div class="f-card-badge '+(l.type==='Land'?'land':'')+'">'+l.type+'</div>'+(isDemo?'<div class="f-card-demo-badge">DEMO</div>':'')+rfStatus+cardFavHtml(l.address,l.city)+'</div><div class="f-card-body"><div class="f-card-price">$'+l.price.toLocaleString()+'</div><div class="f-card-addr">'+l.address+'</div><div class="f-card-city">'+l.city+', NC</div><div class="f-card-features">'+feats+'</div>'+brokerHtml+'</div>';
    c.onclick=function(){try{openProp({price:l.price,address:l.address,type:l.type,beds:l.beds,baths:l.baths,sqft:l.sqft,sqftRange:l.sqftRange||'',lot:l.lot,restrictions:l.restrictions||'unrestricted',status:l.status||'Active',photo:l.photo||null,photos:l.photos||[],description:l.description||'',listAgent:l.listAgent||'',listOffice:l.listOffice||'',listOfficePhone:l.listOfficePhone||'',attributionContact:l.attributionContact||'',mlsId:l.mlsId||'',listingKey:l.listingKey||'',originatingSystem:l.originatingSystem||'',mlsSources:l.mlsSources||[]},l.city)}catch(err){console.error(err)}};
    grid.appendChild(c);
  });
  document.querySelectorAll('.f-card.reveal').forEach(function(el){obs.observe(el)});
}
// Only render hardcoded demo data if MLS_GRID is OFF — otherwise wait for live data
if(!MLS_GRID.enabled) {
  renderFeatured();
  // ═══ DEMO DATA BANNER ═══
  (function(){
    if(document.getElementById('demoBanner'))return;
    var banner=document.createElement('div');
    banner.id='demoBanner';
    banner.className='demo-banner';
    banner.innerHTML='<div class="demo-banner-inner"><span class="demo-banner-icon">\u26A0</span> <span>Sample listings shown for demonstration purposes only. These properties are not real.</span></div>';
    document.body.appendChild(banner);
    var nav=document.querySelector('.nav');
    function positionBanner(){
      if(!nav)return;
      banner.style.top=nav.offsetHeight+'px';
    }
    positionBanner();
    window.addEventListener('scroll',positionBanner);
    window.addEventListener('resize',positionBanner);
  })();
} else {
  // MLS_GRID is enabled — show loading state and clear what's available now
  // Note: TOWN_LISTINGS and ALL_LISTINGS are defined later in the file (var hoisting),
  // so we only clear LISTINGS here. MLS_GRID.init() clears/replaces all three arrays.
  LISTINGS.length = 0;
  var _loadingHtml = '<div class="idx-loading" style="grid-column:1/-1;text-align:center;padding:3rem 1rem;color:var(--gold);font-family:var(--font-body);font-size:1.1rem;"><div style="margin-bottom:0.8rem;font-size:1.8rem;">&#x1F3E0;</div>Loading live listings from MLS...<div style="margin-top:0.5rem;font-size:0.85rem;opacity:0.6;">Connecting to Carolina Smokies MLS</div></div>';
  var _fg = document.getElementById('featuredGrid');
  if(_fg) _fg.innerHTML = _loadingHtml;
  // Also show loading on town page grids (search + featured)
  document.querySelectorAll('[id^="tps-grid-"]').forEach(function(el){ el.innerHTML = _loadingHtml; });
  document.querySelectorAll('[id^="tp-featured-"]').forEach(function(el){ el.innerHTML = _loadingHtml; });
}

// ═══ IDX DISCLAIMER INJECTION (for town pages) ═══
(function(){
  // index.html has the disclaimer in HTML; inject for town pages that load via app.js
  if(document.querySelector('.idx-disclaimer'))return;
  var fb=document.querySelector('.footer-bottom');
  if(fb){
    var disc=document.createElement('div');
    disc.className='idx-disclaimer';
    disc.innerHTML='<p class="idx-source">Listing data provided by Carolina Smokies Association of Realtors (CSAR).</p><p>All data is obtained from various sources and may not have been verified by broker or MLS. Supplied Open House Information is subject to change without notice. All information should be independently reviewed and verified for accuracy. Properties may or may not be listed by the office/agent presenting the information.</p><p>IDX information is provided exclusively for consumers\u2019 personal, non-commercial use and may not be used for any purpose other than to identify prospective properties consumers may be interested in purchasing. Data is deemed reliable but is not guaranteed accurate by the MLS.</p><p>Properties displayed may be listed or sold by various participants in the MLS. \u00A9 2026 Carolina Smokies Association of Realtors. All rights reserved.</p><p class="idx-timestamp" id="idxTimestamp">Data last updated: loading...</p>';
    // DMCA notice (Rule 30)
    var dmca=document.createElement('div');
    dmca.className='idx-dmca';
    dmca.innerHTML='<p class="idx-dmca-title">DMCA Notice</p><p>The Digital Millennium Copyright Act of 1998, 17 U.S.C. \u00A7 512 (the \u201CDMCA\u201D) provides recourse for copyright owners who believe that material appearing on the Internet infringes their rights under U.S. copyright law. If you believe in good faith that any content or material made available in connection with our website or services infringes your copyright, you (or your agent) may send us a notice requesting that the content or material be removed, or access to it blocked. Notices must be sent in writing by email to: coryhelpsyoumove@gmail.com.</p><p>The DMCA requires that your notice of alleged copyright infringement include the following information: (1) description of the copyrighted work that is the subject of claimed infringement; (2) description of the alleged infringing content and information sufficient to permit us to locate the content; (3) contact information for you, including your address, telephone number and email address; (4) a statement by you that you have a good faith belief that the content in the manner complained of is not authorized by the copyright owner, or its agent, or by the operation of any law; (5) a statement by you, signed under penalty of perjury, that the information in the notification is accurate and that you have the authority to enforce the copyrights that are claimed to be infringed; and (6) a physical or electronic signature of the copyright owner or a person authorized to act on the copyright owner\u2019s behalf. Failure to include all of the above information may result in the delay of the processing of your complaint.</p>';
    fb.parentNode.insertBefore(dmca,fb);
    // Anti-scraping notice (Rule 29)
    var scrape=document.createElement('div');
    scrape.className='idx-scraping-notice';
    scrape.innerHTML='<p>Any use or search of data on this website, other than by a consumer looking to purchase real estate, is prohibited.</p>';
    fb.parentNode.insertBefore(scrape,fb);
    fb.parentNode.insertBefore(disc,fb);
  }
  // Fair Housing statement injection
  if(!document.querySelector('.fair-housing')&&fb){
    var fh=document.createElement('div');
    fh.className='fair-housing';
    fh.innerHTML='<div class="fair-housing-inner"><svg class="fair-housing-logo" viewBox="0 0 24 24" width="28" height="28" aria-label="Equal Housing Opportunity"><path d="M12 3L2 12h3v9h14v-9h3L12 3zm0 2.84L19 12h-2v7H7v-7H5l7-6.16z" fill="currentColor"/><rect x="9" y="14" width="6" height="1.5" fill="currentColor"/><rect x="9" y="17" width="6" height="1.5" fill="currentColor"/></svg><div class="fair-housing-text"><strong>Equal Housing Opportunity.</strong> Cory Coleman and Keller Williams Great Smokies fully support the principles of the Fair Housing Act. We do not discriminate on the basis of race, color, religion, national origin, sex, disability, or familial status.</div></div>';
    fb.parentNode.insertBefore(fh,fb);
  }
})();

// ═══ CHATBOT ═══
var CHAT_SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// --- Chat persistence across page navigations ---
function _saveChatState(){
  try{
    localStorage.setItem('cc_chat_conv', JSON.stringify({
      history: convHistory,
      ts: Date.now(),
      leadPushed: _chatLeadPushed || false,
      previewDismissed: _chatPreviewDismissed || false
    }));
  }catch(e){}
}
function _loadChatState(){
  try{
    var raw = localStorage.getItem('cc_chat_conv');
    if(!raw) return null;
    var state = JSON.parse(raw);
    if(Date.now() - state.ts > CHAT_SESSION_TIMEOUT){ _clearChatState(); return null; }
    return state;
  }catch(e){ return null; }
}
function _clearChatState(){
  try{ localStorage.removeItem('cc_chat_conv'); }catch(e){}
}

// Restore conversation history from localStorage (flags restored at their declaration sites)
var _savedChatState = _loadChatState();
let chatOpen=false,isTyping=false,convHistory=(_savedChatState && _savedChatState.history && _savedChatState.history.length > 0) ? _savedChatState.history : [];

// --- Rate limiting ---
var _chatLimits = {
  lastSend: 0,
  minuteCount: 0,
  minuteStart: 0,
  dayCount: parseInt(localStorage.getItem('cc-chat-day-count')||'0'),
  dayKey: localStorage.getItem('cc-chat-day-key')||'',
  exchangeCount: 0
};
var CHAT_COOLDOWN = 3000;
var CHAT_PER_MINUTE = 8;
var CHAT_PER_DAY = 500;
var CHAT_MAX_LENGTH = 500;
var CHAT_MEMORY = 15;
var CHAT_NUDGE_AT = 30;

// Reset day count if new day
(function(){
  var today = new Date().toDateString();
  if(_chatLimits.dayKey !== today){
    _chatLimits.dayCount = 0;
    _chatLimits.dayKey = today;
    try{localStorage.setItem('cc-chat-day-count','0');localStorage.setItem('cc-chat-day-key',today)}catch(e){}
  }
})();

function checkRateLimit(){
  var now = Date.now();
  if(now - _chatLimits.lastSend < CHAT_COOLDOWN) return 'Please wait a moment before sending another message.';
  if(now - _chatLimits.minuteStart > 60000){ _chatLimits.minuteCount = 0; _chatLimits.minuteStart = now; }
  if(_chatLimits.minuteCount >= CHAT_PER_MINUTE) return "You're sending messages pretty fast! Take a breath and try again in a minute.";
  if(_chatLimits.dayCount >= CHAT_PER_DAY) return 'You\'ve been chatting a lot today! For more detailed help, call or text Cory at <strong>(828) 506-6413</strong>.';
  return null;
}

function updateRateLimits(){
  _chatLimits.lastSend = Date.now();
  _chatLimits.minuteCount++;
  _chatLimits.dayCount++;
  _chatLimits.exchangeCount++;
  try{localStorage.setItem('cc-chat-day-count',String(_chatLimits.dayCount))}catch(e){}
}

// --- System prompt builder ---
function buildSystemPrompt(){
  var prompt = 'You are Cory\'s assistant on his real estate website CoryHelpsYouMove.com. Cory Coleman is a real estate broker with Keller Williams Great Smokies in Western NC.\n\n';
  prompt += 'PERSONALITY: Warm, friendly, down-to-earth — like chatting with a knowledgeable neighbor. Never pushy or salesy. Keep responses concise (2-4 sentences unless more detail is genuinely needed).\n\n';
  prompt += 'GOAL: Help visitors with WNC real estate questions. Naturally build rapport and capture their name, email, and phone through conversation — never ask for all three at once.\n\n';
  prompt += 'NAME CAPTURE RULES:\n';
  prompt += '- Early in conversation, casually ask "What\'s your name?" (NOT "first name" — keep it natural)\n';
  prompt += '- If they only give a first name (like "I\'m Sarah"), continue chatting naturally and later ask "And what\'s your last name, Sarah?"\n';
  prompt += '- If they give a last name with a title (like "Mr. Johnson"), ask "And your first name?"\n';
  prompt += '- If they give their full name, great — move on naturally\n';
  prompt += '- Don\'t ask for their name if they\'ve already provided it\n\n';
  prompt += 'CONTACT CAPTURE: After learning their name, find natural moments to ask for email ("Want me to send you some listings? What\'s a good email?") and phone ("What\'s the best number if Cory wants to reach out?"). Space these out — don\'t rapid-fire.\n\n';
  prompt += 'FAIR HOUSING: NEVER describe communities by demographics, race, religion, or similar characteristics. Only describe by physical features, geography, amenities, attractions, and lifestyle.\n\n';
  prompt += 'WESTERN NC COMMUNITIES:\n';
  prompt += '- Waynesville: Charming walkable downtown Main Street with local shops, restaurants, galleries, breweries. Blue Ridge Parkway access. Haywood County seat.\n';
  prompt += '- Sylva: Vibrant Main Street, Tuckasegee River, historic courthouse. Jackson County seat. Great dining scene.\n';
  prompt += '- Maggie Valley: Scenic mountain valley. Cataloochee ski area. Festivals and events. Quiet mountain living.\n';
  prompt += '- Bryson City: Gateway to Great Smoky Mountains National Park. Nantahala River rafting. Historic railroad.\n';
  prompt += '- Cashiers/Highlands: Elevated mountain plateau (3,500+ ft). Waterfalls, estate-style properties. Cooler summers.\n';
  prompt += '- Franklin: Gem capital of the world. Appalachian Trail access. Macon County seat. Affordable mountain living.\n';
  prompt += '- Dillsboro: Charming artisan village. River setting. Unique shops and galleries. Quiet and walkable.\n';
  prompt += '- Cullowhee: Home to Western Carolina University. Panthertown Valley hiking. Outdoor recreation paradise.\n\n';
  prompt += 'CONTACT INFO: Cory\'s direct line is (828) 506-6413 (call or text). Email: coryhelpsyoumove@gmail.com.\n\n';
  prompt += 'PROPERTY SEARCH TRIGGER:\n';
  prompt += 'When a user describes what they are looking for clearly enough to search (like "3 bed home in Waynesville under 400k"), include a hidden search tag at the END of your response in this exact format:\n';
  prompt += '[SEARCH:{"location":"VALUE","type":"VALUE","price":"VALUE","beds":"VALUE","baths":"VALUE"}]\n';
  prompt += 'Valid location values: Waynesville, Sylva, Maggie Valley, Bryson City, Cashiers, Franklin, Dillsboro, Cullowhee, or "" for all areas.\n';
  prompt += 'Valid type values: Single Family, Cabin, Land, townhome, or "" for all types.\n';
  prompt += 'Valid price values: 0-200000, 200000-400000, 400000-700000, 700000-1000000, 1000000-99999999, or "" for any price.\n';
  prompt += 'Valid beds values: 2, 3, 4, 5, or "" for any.\n';
  prompt += 'Valid baths values: 1, 2, 3, 4, or "" for any.\n';
  prompt += 'Only include the SEARCH tag when the user has given enough info to do a meaningful search. In your visible response, tell them you are pulling up results for them. Do NOT include the search tag in every message — only when they have stated clear search criteria.';

  // Add logged-in user context
  if(_acctLoggedIn && _currentUser){
    try {
      var prof = localStorage.getItem('cc_profile');
      if(prof){
        var p = JSON.parse(prof);
        prompt += '\n\nLOGGED-IN USER: This visitor has an account. ';
        if(p.firstName) prompt += 'Their name is ' + p.firstName + (p.lastName ? ' ' + p.lastName : '') + '. ';
        if(p.email) prompt += 'Email: ' + p.email + '. ';
        if(p.phone) prompt += 'Phone: ' + p.phone + '. ';
        prompt += 'You already have their contact info — no need to ask for it again. Focus on helping them.';
      }
    } catch(e){}
  }

  // Add listing context for property recommendations
  try {
    if(typeof ALL_LISTINGS !== 'undefined' && ALL_LISTINGS && ALL_LISTINGS.length > 0){
      var sample = ALL_LISTINGS.slice(0, 30);
      var summary = sample.map(function(l){
        return l.address + ' in ' + l.city + ' — $' + (l.price||0).toLocaleString() + ', ' + (l.beds||0) + 'bd/' + (l.baths||0) + 'ba, ' + (l.type||'Home') + (l.lot ? ', ' + l.lot : '');
      }).join('\n');
      prompt += '\n\nAVAILABLE LISTINGS (recommend these when relevant):\n' + summary;
      prompt += '\nWhen recommending properties, mention specific listings by address and key details.';
    }
  } catch(e){}

  
  // Add event context for chatbot
  try {
    if(typeof EVENTS !== 'undefined' && EVENTS.data && EVENTS.data.length > 0){
      var upcoming = EVENTS.data.slice(0, 8);
      var evtSummary = upcoming.map(function(e){
        return e.title + ' in ' + e.town_display + ' on ' + e.event_date + (e.recurrence_note ? ' (' + e.recurrence_note + ')' : '');
      }).join('\n');
      prompt += '\n\nUPCOMING EVENTS (mention naturally when relevant):\n' + evtSummary;
      prompt += '\nWhen visitors ask about things to do or what is happening, reference specific upcoming events.';
    }
  } catch(e){}

  return prompt;
}

// --- Build chat transcript for FUB ---
function buildChatTranscript(){
  if(!convHistory || !convHistory.length) return '';
  var lines = [];
  for(var i=0; i<convHistory.length; i++){
    var m = convHistory[i];
    var label = m.role === 'user' ? 'Visitor' : "Cory's Assistant";
    // Strip HTML tags and [SEARCH:...] commands from assistant messages
    var text = m.content.replace(/<[^>]*>/g,'').replace(/\[SEARCH:[^\]]*\]/g,'').trim();
    if(text) lines.push(label + ': ' + text);
  }
  if(!lines.length) return '';
  return '--- Chat Transcript ---\n' + lines.join('\n');
}

// --- Push lead to Follow Up Boss via edge function ---
function _pushToFUB(leadData){
  try {
    fetch(SUPABASE_URL + '/functions/v1/fub-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify(leadData)
    }).then(function(r){ return r.json(); })
      .then(function(d){
        if(d.success) console.log('[FUB] Lead pushed successfully');
        else console.warn('[FUB] Push response:', d);
      })
      .catch(function(e){ console.warn('[FUB] Push failed:', e); });
  } catch(e){ console.warn('[FUB] Push error:', e); }
}

// --- FUB lead capture from chat ---
var _chatLeadPushed = (_savedChatState && _savedChatState.leadPushed) || false;
function tryPushChatLead(){
  if(_chatLeadPushed || !_sb) return;
  var fullText = convHistory.map(function(m){ return m.content }).join(' ');
  var emailMatch = fullText.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  var phoneMatch = fullText.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  var nameFromConv = '';
  for(var i=0; i<Math.min(convHistory.length, 10); i++){
    if(convHistory[i].role === 'user'){
      var txt = convHistory[i].content;
      var nameMatch = txt.match(/(?:i'm|im|i am|my name is|name's|it's|its|this is|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
      if(nameMatch) { nameFromConv = nameMatch[1]; break; }
      if(txt.length < 30 && /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/.test(txt.trim())){ nameFromConv = txt.trim(); break; }
    }
  }
  if(nameFromConv && (emailMatch || phoneMatch)){
    var parts = nameFromConv.split(/\s+/);
    var transcript = buildChatTranscript();
    var chatLeadData = {
      first_name: parts[0] || '',
      last_name: parts.slice(1).join(' ') || '',
      email: emailMatch ? emailMatch[0] : '',
      phone: phoneMatch ? phoneMatch[0] : '',
      message: transcript || 'Captured via chatbot conversation',
      source: 'chatbot'
    };
    _sb.from('leads').insert(chatLeadData)
      .then(function(){ _chatLeadPushed = true; console.log('[Chat] Lead saved'); _pushToFUB(chatLeadData); })
      .catch(function(e){ console.warn('[Chat] Lead push failed:', e); });
  }
}

// --- Chat UI ---
var _chatMinimized = false;
var _chatPreviewDismissed = (_savedChatState && _savedChatState.previewDismissed) || false;

function toggleChat(){
  var cp=document.getElementById('chatPanel');if(!cp)return;

  // Always hide preview when toggling
  var cprev=document.getElementById('chatPreview');
  if(cprev) cprev.classList.remove('show');
  var cb2=document.getElementById('chatBadge');
  if(cb2) cb2.classList.remove('show');

  // If minimized → fully close (second close)
  if(_chatMinimized){
    _chatMinimized = false;
    chatOpen = false;
    cp.classList.remove('minimized','open');
    cp.style.height='';cp.style.maxHeight='';cp.style.top='';cp.style.bottom='';cp.style.transform='';cp.style.transition='';
    _kbOpen=false;
    var ct=document.getElementById('chatTrigger');if(ct)ct.classList.remove('open');
    var nc=document.getElementById('navChat');if(nc)nc.classList.remove('open');
    _unlockScroll();
    showMobileCta();
    return;
  }

  // If open (full size) → close on mobile, minimize on desktop
  if(chatOpen){
    if(window.innerWidth <= 1024){
      // Mobile: close fully instead of minimize
      _closeChat();
      if(history.state&&history.state.page==='chat')history.back();
    } else {
      minimizeChat();
    }
    return;
  }

  // If closed → open
  chatOpen = true;
  hideMobileCta();
  if(window.innerWidth <= 1024) _lockScroll();
  cp.classList.add('open');
  var ct=document.getElementById('chatTrigger');if(ct)ct.classList.add('open');
  var nc=document.getElementById('navChat');if(nc)nc.classList.add('open');
  var cm=document.getElementById('chatMessages');if(cm&&!cm.children.length){ if(!_restoreChatMessages()) addInitMsg(); }
  // Auto-focus input: preventScroll stops browser from shifting the background
  var ci=document.getElementById('chatInput');
  if(ci)setTimeout(()=>ci.focus({preventScroll:true}), window.innerWidth<=1024 ? 500 : 300);
  if(window.innerWidth <= 1024) history.pushState({page:'chat'},'','#chat');
}
function _closeChat(){
  chatOpen=false;_chatMinimized=false;
  var cp=document.getElementById('chatPanel');
  if(cp){cp.classList.remove('minimized','open');cp.style.height='';cp.style.maxHeight='';cp.style.top='';cp.style.bottom='';cp.style.transform='';cp.style.transition='';_kbOpen=false;}
  var ct=document.getElementById('chatTrigger');if(ct)ct.classList.remove('open');
  var nc=document.getElementById('navChat');if(nc)nc.classList.remove('open');
  _unlockScroll();
  showMobileCta();
}

function minimizeChat(){
  var cp=document.getElementById('chatPanel');if(!cp)return;
  if(_chatMinimized){
    // Restore from minimized
    _chatMinimized = false;
    cp.classList.remove('minimized');
    var ci=document.getElementById('chatInput');if(ci)setTimeout(()=>ci.focus({preventScroll:true}),300);
  } else {
    // Minimize
    _chatMinimized = true;
    cp.classList.add('minimized');
  }
}

// --- Resize chat panel when mobile keyboard opens/closes ---
// Uses transform instead of top/bottom to avoid layout reflow (which steals input
// focus and dismisses the keyboard). Transform is GPU-composited and animates smoothly.
var _chatResizeTimer=null;
var _kbOpen=false;
if(window.visualViewport){
  var _handleChatResize = function(){
    var cp=document.getElementById('chatPanel');
    if(!cp||!chatOpen||_chatMinimized||window.innerWidth>1024)return;
    clearTimeout(_chatResizeTimer);
    _chatResizeTimer=setTimeout(function(){
      var vv=window.visualViewport;
      var keyboardOpen = vv.height < window.innerHeight * 0.85;
      if(keyboardOpen){
        // Keyboard open — shift panel up with transform (no reflow)
        var kbHeight = window.innerHeight - vv.height - vv.offsetTop;
        var panelH = vv.height - 24;
        if(!_kbOpen){
          // First frame: enable smooth transition
          cp.style.transition = 'transform 0.25s ease-out, height 0.25s ease-out, max-height 0.25s ease-out';
          _kbOpen = true;
        }
        cp.style.transform = 'translateY(-' + kbHeight + 'px) scale(1)';
        cp.style.height = panelH + 'px';
        cp.style.maxHeight = panelH + 'px';
      } else if(_kbOpen) {
        // Keyboard closed — animate back
        _kbOpen = false;
        cp.style.transition = 'transform 0.25s ease-out, height 0.25s ease-out, max-height 0.25s ease-out';
        cp.style.transform = '';
        cp.style.height = '';
        cp.style.maxHeight = '';
        // Reset transition after animation completes
        setTimeout(function(){ if(cp && !_kbOpen) cp.style.transition = ''; }, 300);
      }
      // Scroll messages to bottom
      var cm=document.getElementById('chatMessages');
      if(cm)setTimeout(function(){cm.scrollTop=cm.scrollHeight},80);
    },60);
  };
  window.visualViewport.addEventListener('resize', _handleChatResize);
  window.visualViewport.addEventListener('scroll', _handleChatResize);
}

// --- Chat Preview → Full Chat transition ---
function openChatFromPreview(text){
  // 1. Hide preview
  var preview=document.getElementById('chatPreview');
  if(preview) preview.classList.remove('show');
  var cb=document.getElementById('chatBadge');
  if(cb) cb.classList.remove('show');
  _chatPreviewDismissed = true;

  // 2. Open full chat panel
  chatOpen = true;
  var cp=document.getElementById('chatPanel');
  if(cp){ cp.classList.add('open'); cp.classList.remove('minimized'); _chatMinimized = false; }
  var ct=document.getElementById('chatTrigger');if(ct){ ct.classList.add('open'); ct.classList.add('compact'); }

  // 3. Restore previous conversation or add greeting if chat is empty
  var cm=document.getElementById('chatMessages');
  if(cm && !cm.children.length){
    if(!_restoreChatMessages()){
      var greeting = "Skip the filters. Tell me what you're after — I can dial in your search better than the big real estate sites. Are you searching for a home, land, investment property, or are you looking to sell?";
      if(_acctLoggedIn){
        try{
          var prof=localStorage.getItem('cc_profile');
          if(prof){ var p=JSON.parse(prof); if(p.firstName) greeting="Welcome back, "+p.firstName+"! How can I help you today?"; }
        }catch(e){}
      }
      addMsg('assistant', greeting);
      convHistory.push({role:'assistant',content:'Greeted visitor.'});
      _saveChatState();
    }
  }

  // 4. Inject user message and send
  var inp=document.getElementById('chatInput');
  if(inp){
    inp.value = text;
    setTimeout(function(){ sendMessage(); inp.focus(); }, 150);
  }
}

// --- Bind preview widget listeners (reusable for town page injection) ---
function bindPreviewListeners(){
  var closeBtn=document.getElementById('chatPreviewClose');
  if(closeBtn) closeBtn.addEventListener('click', function(){
    var cprev=document.getElementById('chatPreview');if(cprev)cprev.classList.remove('show');
    var cb=document.getElementById('chatBadge');if(cb)cb.classList.remove('show');
    _chatPreviewDismissed = true;
    var ct=document.getElementById('chatTrigger');if(ct&&!ct.classList.contains('open'))ct.classList.add('compact');
  });

  document.querySelectorAll('[data-preview-chip]').forEach(function(chip){
    chip.addEventListener('click', function(){ openChatFromPreview(chip.textContent); });
  });

  var prevInput=document.getElementById('chatPreviewInput');
  var prevSend=document.getElementById('chatPreviewSend');
  if(prevInput) prevInput.addEventListener('keydown', function(e){
    if(e.key==='Enter'){ e.preventDefault(); var t=prevInput.value.trim(); if(t) openChatFromPreview(t); }
  });
  if(prevSend) prevSend.addEventListener('click', function(){
    var t=prevInput?prevInput.value.trim():''; if(t) openChatFromPreview(t);
  });
}

// Click minimized header to restore
document.addEventListener('click', function(e){
  if(!_chatMinimized) return;
  var hdr = document.getElementById('chatHeader');
  if(hdr && hdr.contains(e.target) && !e.target.closest('.chat-hbtn')){
    minimizeChat();
  }
});

var _chatTriggerEl=document.getElementById('chatTrigger');
if(_chatTriggerEl) _chatTriggerEl.addEventListener('click',toggleChat);
bindPreviewListeners();

function addMsg(role,text,chips){
  const c=document.getElementById('chatMessages');if(!c)return;var w=document.createElement('div');
  w.className='msg '+role;w.innerHTML='<div class="msg-bubble">'+text+'</div>';c.appendChild(w);
  if(chips){const cw=document.createElement('div');cw.className='quick-actions';chips.forEach(ch=>{const b=document.createElement('button');b.className='chip';b.textContent=ch;b.onclick=()=>{document.getElementById('chatInput').value=ch;sendMessage();cw.remove()};cw.appendChild(b)});c.appendChild(cw)}
  c.scrollTop=c.scrollHeight;
}

function addInitMsg(){
  var greeting = "Skip the filters. Tell me what you're after — I can dial in your search better than the big real estate sites. Are you searching for a home, land, investment property, or are you looking to sell?";
  if(_acctLoggedIn){
    try{
      var prof = localStorage.getItem('cc_profile');
      if(prof){
        var p = JSON.parse(prof);
        if(p.firstName) greeting = "Welcome back, " + p.firstName + "! Great to see you again. How can I help you today?";
      }
    }catch(e){}
  }
  addMsg('assistant', greeting, ["I'm looking to buy","I want to sell","Tell me about the area","Call or text Cory"]);
  convHistory.push({role:'assistant',content:'Greeted visitor.'});
}

// Rebuild chat DOM from saved convHistory (for cross-page persistence)
function _restoreChatMessages(){
  var cm = document.getElementById('chatMessages');
  if(!cm || !convHistory.length) return false;
  cm.innerHTML = '';
  for(var i=0; i<convHistory.length; i++){
    var m = convHistory[i];
    if(m.content === 'Greeted visitor.'){
      // Reconstruct the greeting text
      var g = "Skip the filters. Tell me what you're after — I can dial in your search better than the big real estate sites. Are you searching for a home, land, investment property, or are you looking to sell?";
      if(_acctLoggedIn){
        try{ var p=JSON.parse(localStorage.getItem('cc_profile')||'{}'); if(p.firstName) g="Welcome back, "+p.firstName+"! How can I help you today?"; }catch(e){}
      }
      addMsg('assistant', g);
    } else {
      var html = m.content.replace(/\n/g,'<br>');
      addMsg(m.role, html);
    }
  }
  cm.scrollTop = cm.scrollHeight;
  return true;
}

function showTyping(){const c=document.getElementById('chatMessages');if(!c)return;var t=document.createElement('div');t.className='typing-indicator';t.id='typInd';t.innerHTML='<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';c.appendChild(t);c.scrollTop=c.scrollHeight}
function hideTyping(){const e=document.getElementById('typInd');if(e)e.remove()}

async function sendMessage(){
  const inp=document.getElementById('chatInput');if(!inp)return;
  var txt=inp.value.trim();
  if(!txt||isTyping)return;

  // Honeypot check
  var hp = document.getElementById('chatHp');
  if(hp && hp.value){ console.warn('[Chat] Honeypot triggered'); inp.value=''; return; }

  // Length check
  if(txt.length > CHAT_MAX_LENGTH){
    addMsg('assistant','That message is a bit long — could you shorten it up?');
    return;
  }

  // Rate limit check
  var limitMsg = checkRateLimit();
  if(limitMsg){ addMsg('assistant', limitMsg); return; }

  // reCAPTCHA v3 token
  var recapToken = null;
  try {
    if(typeof grecaptcha !== 'undefined'){
      recapToken = await grecaptcha.execute('6LcZ7WssAAAAAAfFNuMeWyKnQnRcc5a2kvS8yVdx', {action:'chat_message'});
    }
  } catch(e){ console.warn('[Chat] reCAPTCHA error:', e); }

  if(!recapToken){
    addMsg('assistant','Having trouble verifying your session. Please refresh the page and try again.');
    return;
  }

  inp.value='';inp.style.height='auto';
  addMsg('user',txt);
  convHistory.push({role:'user',content:txt});
  updateRateLimits();

  // Trim conversation memory
  var trimmed = convHistory;
  if(convHistory.length > CHAT_MEMORY * 2){
    trimmed = [convHistory[0]].concat(convHistory.slice(-(CHAT_MEMORY * 2 - 1)));
  }

  var systemPrompt = buildSystemPrompt();
  if(_chatLimits.exchangeCount >= CHAT_NUDGE_AT){
    systemPrompt += '\n\nNOTE: This has been a long conversation. Naturally suggest calling or texting Cory at (828) 506-6413 for more detailed help. Be casual about it.';
  }

  isTyping=true;document.getElementById('chatSend').disabled=true;showTyping();
  try{
    const r=await fetch('https://kzaabnnwjupjqvydiqlz.supabase.co/functions/v1/chat-proxy',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzk1NjIxNjQsImV4cCI6MjA1NTEzODE2NH0.AU2i5fZGKvFLmgXWJiGAbKxbFigkNJbNzHNM3U3FjSk'},body:JSON.stringify({system:systemPrompt,messages:trimmed.map(m=>({role:m.role,content:m.content})),recaptchaToken:recapToken})});
    const d=await r.json();hideTyping();
    let rawText=d.content.filter(c=>c.type==='text').map(c=>c.text).join('').trim();
    // Extract search trigger before cleaning
    var searchMatch = rawText.match(/\[SEARCH:(.*?)\]/);
    var searchFilters = null;
    if(searchMatch){
      try { searchFilters = JSON.parse(searchMatch[1]); } catch(e){}
      rawText = rawText.replace(/\[SEARCH:.*?\]/g, '').trim();
    }
    let t = rawText.replace(/\[.*?\]/g,'').trim().replace(/\n/g,'<br>');
    addMsg('assistant',t);convHistory.push({role:'assistant',content:t.replace(/<br>/g,'\n')});
    _saveChatState();
    tryPushChatLead();
    // Trigger search if bot detected search intent
    if(searchFilters){
      setTimeout(function(){
        var chips = ['View Results'];
        if(_acctLoggedIn) chips.push('Save This Search');
        else chips.push('Save Search (create account)');
        var c = document.getElementById('chatMessages');
        var cw = document.createElement('div');
        cw.className='quick-actions';
        chips.forEach(function(ch){
          var b = document.createElement('button');
          b.className='chip';
          b.textContent=ch;
          b.onclick=function(){
            if(ch === 'View Results'){
              openSearchResults(searchFilters);
              toggleChat();
            } else if(ch === 'Save This Search' && _acctLoggedIn){
              saveSearchFromChat(searchFilters);
              b.textContent='Saved!';b.style.background='var(--green)';b.disabled=true;
            } else {
              openAcctModal();
              window._pendingSaveSearch = searchFilters;
            }
            if(ch === 'View Results') cw.remove();
          };
          cw.appendChild(b);
        });
        c.appendChild(cw);
        c.scrollTop = c.scrollHeight;
      }, 300);
    }
  }catch(e){hideTyping();addMsg('assistant','I\'m having trouble connecting. Feel free to call or text Cory anytime at <strong>(828) 506-6413</strong>!')}
  isTyping=false;document.getElementById('chatSend').disabled=false;
}
// --- Save search from chatbot ---
async function saveSearchFromChat(filters) {
  if(!_sb || !_currentUser) return;
  // Build a readable name
  var parts = [];
  if(filters.location) parts.push(filters.location);
  if(filters.type) parts.push(filters.type);
  if(filters.price) {
    var pp = filters.price.split('-');
    if(pp[0]==='0') parts.push('Under $' + (parseInt(pp[1])/1000) + 'K');
    else if(parseInt(pp[1])>9999999) parts.push('$' + (parseInt(pp[0])/1000000) + 'M+');
    else parts.push('$' + (parseInt(pp[0])/1000) + 'K-$' + (parseInt(pp[1])/1000) + 'K');
  }
  if(filters.beds) parts.push(filters.beds + '+ beds');
  if(filters.baths) parts.push(filters.baths + '+ baths');
  var searchName = parts.join(', ') || 'Custom Search';

  try {
    await _sb.from('saved_searches').insert({
      user_id: _currentUser.id,
      search_name: searchName,
      filters: filters,
      notify_email: true
    });
    addMsg('assistant', 'Search saved! I\'ll notify you when new listings match: <strong>' + searchName + '</strong>. You can manage your saved searches from your account.');
    console.log('[Chat] Search saved:', searchName);
  } catch(e) {
    console.warn('[Chat] Save search error:', e);
    addMsg('assistant', 'Had trouble saving that search. You can still view the results though!');
  }
}

// Check for pending save search after account creation
var _origUpdateAcctUI = updateAcctUI;
updateAcctUI = function() {
  _origUpdateAcctUI();
  if(_acctLoggedIn && window._pendingSaveSearch) {
    saveSearchFromChat(window._pendingSaveSearch);
    window._pendingSaveSearch = null;
  }
};

function clearChat(){convHistory=[];_chatLimits.exchangeCount=0;_chatLeadPushed=false;_clearChatState();var cm=document.getElementById('chatMessages');if(cm)cm.innerHTML='';addInitMsg()}

const chatInp=document.getElementById('chatInput');
if(chatInp){
  chatInp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}});
  chatInp.addEventListener('input',()=>{chatInp.style.height='auto';chatInp.style.height=Math.min(chatInp.scrollHeight,100)+'px'});
}

// ═══ COMMUNITY EVENTS (Preview for main page) ═══
var EVENTS = {
  data: [],
  init: function() {
    if (!_sb) { console.warn('[Events] No Supabase'); return; }
    var today = new Date().toISOString().split('T')[0];
    _sb.from('community_events').select('*').eq('is_published', true).gte('event_date', today)
      .order('is_featured', { ascending: false })
      .order('event_date', { ascending: true }).limit(6)
      .then(function(result) {
        if (result.error) { console.warn('[Events]', result.error.message); EVENTS._clear(); return; }
        EVENTS.data = result.data || [];
        if (EVENTS.data.length) { EVENTS.renderPreview(); EVENTS.generateSchema(); }
        else { EVENTS._clear(); }
        console.log('[Events] Loaded ' + EVENTS.data.length + ' preview events');
      });
  },
  _clear: function() {
    var g = document.getElementById('eventsPreviewGrid');
    if (g) g.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px;grid-column:1/-1">Events coming soon — check back for festivals, markets, and more!</p>';
  },
  renderPreview: function() {
    var grid = document.getElementById('eventsPreviewGrid');
    if(!grid) return;
    var cta = document.getElementById('eventsPreviewCta');
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var html = '';
    EVENTS.data.slice(0, 3).forEach(function(evt) {
      var d = new Date(evt.event_date + 'T12:00:00');
      var timeStr = '';
      if (evt.start_time) {
        var p = evt.start_time.split(':'), h = parseInt(p[0]), ap = h >= 12 ? 'PM' : 'AM';
        if (h > 12) h -= 12; if (h === 0) h = 12;
        timeStr = h + ':' + p[1] + ' ' + ap;
      }
      var featured = evt.is_featured ? ' featured-ep' : '';
      html += '<a href="events.html" class="ep-card' + featured + '"><div class="ep-card-inner">';
      html += '<div class="ep-date"><span class="ep-month">' + months[d.getMonth()] + '</span><span class="ep-day">' + d.getDate() + '</span><span class="ep-dow">' + days[d.getDay()] + '</span></div>';
      html += '<div class="ep-info"><h3>' + evt.title + '</h3>';
      html += '<div class="ep-meta">';
      if (evt.town_display) html += '<span><svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>' + evt.town_display + '</span>';
      if (timeStr) html += '<span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' + timeStr + '</span>';
      html += '</div>';
      html += '<span class="ep-tag">' + evt.category + '</span>';
      html += '</div></div></a>';
    });
    grid.innerHTML = html;
    if (cta) cta.style.display = '';
  },
  generateSchema: function() {
    EVENTS.data.forEach(function(evt) {
      var s = {'@context':'https://schema.org','@type':'Event','name':evt.title,'startDate':evt.event_date + (evt.start_time ? 'T' + evt.start_time : ''),'location':{'@type':'Place','name':evt.venue || evt.town_display,'address':{'@type':'PostalAddress','addressLocality':evt.town_display,'addressRegion':'NC','addressCountry':'US'}}};
      if (evt.description) s.description = evt.description;
      if (evt.address) s.location.address.streetAddress = evt.address;
      if (evt.url) s.url = evt.url;
      var el = document.createElement('script');
      el.type = 'application/ld+json';
      el.textContent = JSON.stringify(s);
      document.head.appendChild(el);
    });
  }
};

// ═══ HERO IDX SEARCH ═══
let searchType='buy';
function setSearchType(type,btn){
  searchType=type;
  document.querySelectorAll('.hs-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  const searchBar=document.getElementById('heroSearchBar');
  const sellForm=document.getElementById('heroSellForm');
  const bedField=document.getElementById('hsBedField');
  const bathField=document.getElementById('hsBathField');
  const restrictField=document.getElementById('hsRestrictField');
  const note=document.getElementById('hsNote');
  const searchBtn=document.getElementById('hsSearchBtn');
  const textRow=document.getElementById('heroSearchText');

  if(type==='sell'){
    searchBar.style.display='none';
    sellForm.style.display='';
    if(textRow) textRow.style.display='none';
    note.textContent='Get a complimentary market analysis for your WNC property';
  }else{
    searchBar.style.display='';
    sellForm.style.display='none';
    if(textRow) textRow.style.display='';
    restrictField.style.display='';
    if(type==='land'){
      bedField.style.display='none';
      bathField.style.display='none';
      note.textContent='Searching land and acreage across 8+ WNC counties';
      document.getElementById('hsType').value='land';
    }else{
      bedField.style.display='';
      bathField.style.display='';
      note.textContent='Searching homes, cabins, and land across 8+ WNC counties';
      document.getElementById('hsType').value='';
    }
  }
}

// ── Hero location multi-select ──
function getHsSelectedAreas() {
  var checks = document.querySelectorAll('#hsLocDropdown input[type="checkbox"]:checked');
  var areas = [];
  checks.forEach(function(cb){ areas.push(cb.value); });
  return areas;
}
function updateHsLocLabel() {
  var areas = getHsSelectedAreas();
  var label = document.getElementById('hsLocLabel');
  if(!label) return;
  if(areas.length === 0) label.textContent = 'All of Western NC';
  else if(areas.length === 1) label.textContent = AREA_LABELS[areas[0]] || areas[0];
  else label.textContent = areas.length + ' Areas';
}
function toggleHsLocDropdown(e) {
  var dd = document.getElementById('hsLocDropdown');
  var field = document.getElementById('hsLocField');
  if(!dd) return;
  var isOpen = dd.classList.contains('open');
  document.querySelectorAll('.sr-multi-dropdown.open').forEach(function(d){ d.classList.remove('open'); });
  if(!isOpen) {
    // Portal: move dropdown to body to escape stacking contexts
    var rect = field.getBoundingClientRect();
    dd.style.position = 'fixed';
    dd.style.top = (rect.bottom + 4) + 'px';
    dd.style.left = rect.left + 'px';
    dd.style.minWidth = Math.max(rect.width, 220) + 'px';
    dd.style.zIndex = '99999';
    // Cap max-height so dropdown doesn't go off screen
    var maxH = window.innerHeight - rect.bottom - 12;
    if(maxH < 200) maxH = 200;
    dd.style.maxHeight = maxH + 'px';
    document.body.appendChild(dd);
    dd.classList.add('open');
    setTimeout(function(){
      document.addEventListener('click', _closeHsLocDropdown);
      window.addEventListener('scroll', _closeHsLocOnScroll, true);
    }, 0);
  }
}
function _closeHsLocOnScroll() {
  // Close dropdown when page scrolls (not dropdown internal scroll)
  _forceCloseHsLoc();
}
function _forceCloseHsLoc() {
  var dd = document.getElementById('hsLocDropdown');
  var field = document.getElementById('hsLocField');
  if(dd && dd.classList.contains('open')) {
    dd.classList.remove('open');
    if(field) field.appendChild(dd);
    dd.style.position = '';
    dd.style.top = '';
    dd.style.left = '';
    dd.style.minWidth = '';
    dd.style.zIndex = '';
    dd.style.maxHeight = '';
  }
  document.removeEventListener('click', _closeHsLocDropdown);
  window.removeEventListener('scroll', _closeHsLocOnScroll, true);
}
function _closeHsLocDropdown(e) {
  var dd = document.getElementById('hsLocDropdown');
  var field = document.getElementById('hsLocField');
  if(dd && !dd.contains(e.target) && field && !field.contains(e.target)) {
    _forceCloseHsLoc();
  }
}
function hsLocChanged() {
  updateHsLocLabel();
}

function heroSearch(){
  var areas = getHsSelectedAreas();
  var loc = areas.join(',');
  var type=document.getElementById('hsType').value;
  var price=document.getElementById('hsPrice').value;
  var beds=document.getElementById('hsBeds').value;
  var baths=document.getElementById('hsBaths').value;
  var restrict=document.getElementById('hsRestrict').value;
  var query=(document.getElementById('hsTextQuery')||{}).value||'';

  // Map hero type values to search type values
  var typeMap = {'home':'Single Family','cabin':'Cabin','land':'Land','townhome':'Townhome / Condo','multifamily':'Multi-Family'};
  var mappedType = typeMap[type] || '';

  openSearchResults({
    location: loc || '',
    type: mappedType,
    price: price || '',
    beds: beds || '',
    baths: baths || '',
    restrictions: restrict || '',
    query: query.trim()
  });
}

function toggleSellPw(){
  const pw=document.getElementById('hsfPassword');
  const btn=document.getElementById('hsfPwToggle');
  if(pw.type==='password'){pw.type='text';btn.textContent='Hide'}
  else{pw.type='password';btn.textContent='Show'}
}

function submitSellForm(){
  // Clear previous errors
  document.querySelectorAll('.hsf-error').forEach(e=>e.classList.remove('show'));
  document.querySelectorAll('.hsf-input').forEach(e=>e.classList.remove('error'));

  const first=document.getElementById('hsfFirst').value.trim();
  const last=document.getElementById('hsfLast').value.trim();
  const email=document.getElementById('hsfEmail').value.trim();
  const phone=document.getElementById('hsfPhone').value.trim();
  const property=document.getElementById('hsfProperty').value.trim();
  const password=document.getElementById('hsfPassword').value;
  let valid=true;

  if(!first){document.getElementById('hsfFirstErr').classList.add('show');document.getElementById('hsfFirst').classList.add('error');valid=false}
  if(!last){document.getElementById('hsfLastErr').classList.add('show');document.getElementById('hsfLast').classList.add('error');valid=false}
  if(!email||!email.includes('@')||!email.includes('.')){document.getElementById('hsfEmailErr').classList.add('show');document.getElementById('hsfEmail').classList.add('error');valid=false}
  // Phone is optional — skip validation

  if(!valid)return;

  // Collect data
  const formData={firstName:first,lastName:last,email,phone,property,hasPassword:!!password,type:'Seller Inquiry'};
  console.log('[Sell Form] Lead captured:',formData);

  // Save profile to localStorage (used by chatbot + greeting suppression)
  if(password){
    try{localStorage.setItem('cc_profile',JSON.stringify({firstName:first,lastName:last,email,phone,password:true}))}catch(e){}
  }

  // In production: push to Follow Up Boss via /v1/events
  // pushToFollowUpBoss('Seller Inquiry', `Sell form submission. Property info: ${property||'Not provided'}`);

  // Show success
  const btn=document.querySelector('.hsf-submit');
  btn.textContent='Sent!';
  btn.classList.add('sent');
  document.getElementById('hsfSuccess').style.display='flex';

  // Disable inputs
  document.querySelectorAll('#heroSellForm .hsf-input').forEach(i=>i.disabled=true);
}


// Show chat preview after 3.5s — only once per day on first external landing
setTimeout(function(){
  try{
    var today = new Date().toDateString();
    var lastShown = localStorage.getItem('cc_preview_shown_date');
    var referrer = document.referrer || '';
    var isInternal = referrer.indexOf('coryhelpsyoumove.com') !== -1;
    if(!chatOpen && lastShown !== today && !isInternal){
      var cp=document.getElementById('chatPreview');if(cp)cp.classList.add('show');
      var cb=document.getElementById('chatBadge');if(cb)cb.classList.add('show');
      localStorage.setItem('cc_preview_shown_date', today);
    }
  }catch(e){}
},3500);
// Auto-hide preview — 8s on mobile, 30s on desktop
var _previewHideDelay = window.innerWidth <= 1024 ? 8000 : 30000;
setTimeout(function(){
  try{
    var cp=document.getElementById('chatPreview');
    if(cp && cp.classList.contains('show') && !chatOpen){
      cp.classList.remove('show');
      var ct=document.getElementById('chatTrigger');if(ct&&!ct.classList.contains('open'))ct.classList.add('compact');
    }
  }catch(e){}
}, _previewHideDelay);

// Mobile: hide preview on any scroll
if(window.innerWidth <= 1024){
  var _mobileScrollHide = false;
  window.addEventListener('scroll', function(){
    if(_mobileScrollHide) return;
    var cp=document.getElementById('chatPreview');
    if(cp && cp.classList.contains('show')){
      cp.classList.remove('show');
      var cb=document.getElementById('chatBadge');if(cb)cb.classList.remove('show');
      _mobileScrollHide = true;
    }
  }, {passive:true});
}

// ═══ PAGE OVERLAYS (Towns + Blogs) ═══
function openPage(id){
  var el=document.getElementById('page-'+id)||document.getElementById(id);
  if(!el)return;
  el.classList.add('active');
  _lockScroll();
  el.scrollTop=0;
  history.pushState({page:id},'','#'+id);
  var imgEl=document.getElementById('page-img-'+id);
  if(imgEl && !imgEl.getAttribute('src')){
    var nameEl=document.querySelector('[data-town="'+id+'"]');
    if(nameEl){
      var card=nameEl.closest('.area-card');
      if(card){var cardImg=card.querySelector('img');if(cardImg)imgEl.src=cardImg.src;}
    }
  }
}
function closePage(id,fromPopstate){
  var el=document.getElementById('page-'+id)||document.getElementById(id);
  if(el)el.classList.remove('active');
  _unlockScroll();
  if(!fromPopstate&&history.state&&history.state.page===id)history.back();
}
window.addEventListener('popstate',function(e){
  var activePages = document.querySelectorAll('.page-overlay.active');
  if(activePages.length > 0){
    activePages.forEach(function(el){ el.classList.remove('active') });
    // Only restore scroll if no other overlays are open
    var searchOv = document.getElementById('searchOverlay');
    var propOv = document.getElementById('propOverlay');
    if((!searchOv || !searchOv.classList.contains('active')) && (!propOv || !propOv.classList.contains('active'))){
      _unlockScroll();
    }
  }
});
document.querySelectorAll('.area-card').forEach(function(card){
  var nameEl=card.querySelector('[data-town]');
  if(nameEl){
    card.style.cursor='pointer';
    card.addEventListener('click',function(){openPage(nameEl.dataset.town)});
  }
});


// ═══ PRICE RANGE SLIDER ═══
var PS_MAX=2000000,PS_STEP=25000;
function fmtP(v){if(v<=0)return'$0';if(v>=PS_MAX)return'$2M+';if(v>=1000000)return'$'+(v/1000000).toFixed(v%1000000?1:0)+'M';return'$'+(v/1000)+'K'}

function initSlider(id){
  var wrap=document.getElementById('ps-'+id);
  if(!wrap||wrap._init)return;wrap._init=true;
  var track=document.getElementById('pst-'+id);
  var fill=document.getElementById('psf-'+id);
  var tA=document.getElementById('psa-'+id);
  var tB=document.getElementById('psb-'+id);
  var disp=document.getElementById('psd-'+id);
  var hidden=document.getElementById((id==='hero'||id==='hero-m')?'hsPrice':'tps-price-'+id);
  if(!track||!tA||!tB)return;
  var vals=[0,0],moved=[false,false];

  function pctOf(v){return(v/PS_MAX)*100}
  function valAt(pct){return Math.round((pct*PS_MAX)/PS_STEP)*PS_STEP}

  function render(){
    var a=vals[0],b=vals[1],lo=Math.min(a,b),hi=Math.max(a,b);
    tA.style.left=pctOf(a)+'%';
    tB.style.left=pctOf(b)+'%';
    fill.style.left=pctOf(lo)+'%';
    fill.style.width=(pctOf(hi)-pctOf(lo))+'%';
    tA.classList.toggle('idle',!moved[0]);
    tB.classList.toggle('idle',!moved[1]);
    // Display logic
    var anyMoved=moved[0]||moved[1];
    if(!anyMoved){disp.textContent='';if(hidden)hidden.value='';return}
    if(lo===0&&hi===0){disp.textContent='';if(hidden)hidden.value='';return}
    if(lo===0&&hi>0){disp.textContent='Up to '+fmtP(hi);if(hidden)hidden.value='0-'+hi}
    else if(lo>0&&lo===hi){disp.textContent=fmtP(lo)+'+';if(hidden)hidden.value=lo+'-'+PS_MAX}
    else if(lo>0){disp.textContent=fmtP(lo)+' — '+fmtP(hi);if(hidden)hidden.value=lo+'-'+hi}
  }

  function startDrag(idx,e){
    e.preventDefault();e.stopPropagation();
    var thumb=idx===0?tA:tB;
    thumb.classList.add('active');moved[idx]=true;
    function onMove(ev){
      ev.preventDefault();
      var rect=track.getBoundingClientRect();
      var cx=ev.touches?ev.touches[0].clientX:ev.clientX;
      var pct=Math.max(0,Math.min(1,(cx-rect.left)/rect.width));
      vals[idx]=valAt(pct);
      render();
    }
    function onUp(){
      thumb.classList.remove('active');
      document.removeEventListener('mousemove',onMove);
      document.removeEventListener('mouseup',onUp);
      document.removeEventListener('touchmove',onMove);
      document.removeEventListener('touchend',onUp);
    }
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
    document.addEventListener('touchmove',onMove,{passive:false});
    document.addEventListener('touchend',onUp);
  }

  tA.addEventListener('mousedown',function(e){startDrag(0,e)});
  tA.addEventListener('touchstart',function(e){startDrag(0,e)},{passive:false});
  tB.addEventListener('mousedown',function(e){startDrag(1,e)});
  tB.addEventListener('touchstart',function(e){startDrag(1,e)},{passive:false});

  track.addEventListener('mousedown',function(e){
    if(e.target.classList.contains('ps-thumb'))return;
    var rect=track.getBoundingClientRect();
    var pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
    var v=valAt(pct);
    if(!moved[0]){vals[0]=v;moved[0]=true;startDrag(0,e)}
    else if(!moved[1]){vals[1]=v;moved[1]=true;startDrag(1,e)}
    else{var d0=Math.abs(vals[0]-v),d1=Math.abs(vals[1]-v);if(d0<=d1){vals[0]=v;startDrag(0,e)}else{vals[1]=v;startDrag(1,e)}}
    render();
  });
  // Touch: tap anywhere on track to jump nearest thumb (mobile)
  track.addEventListener('touchstart',function(e){
    if(e.target.classList.contains('ps-thumb'))return;
    var rect=track.getBoundingClientRect();
    var cx=e.touches[0].clientX;
    var pct=Math.max(0,Math.min(1,(cx-rect.left)/rect.width));
    var v=valAt(pct);
    if(!moved[0]){vals[0]=v;moved[0]=true;startDrag(0,e)}
    else if(!moved[1]){vals[1]=v;moved[1]=true;startDrag(1,e)}
    else{var d0=Math.abs(vals[0]-v),d1=Math.abs(vals[1]-v);if(d0<=d1){vals[0]=v;startDrag(0,e)}else{vals[1]=v;startDrag(1,e)}}
    render();
  },{passive:false});

  wrap._reset=function(){vals=[0,0];moved=[false,false];render()};
  render();
}

setTimeout(function(){initSlider('hero')},100);


// ═══ HERO PRICE POPOVER ═══
var hpMobileInit=false;
function hpMobileTap(){
  if(window.innerWidth<=768){
    document.getElementById('hpOverlay').classList.add('open');
    document.getElementById('hpSheet').classList.add('open');
    if(!hpMobileInit){initSlider('hero-m');hpMobileInit=true;}
  }
}
// Pin popover open during any mousedown inside it (prevents close during slider drag)
(function(){
  var pop=document.getElementById('hpPop');
  if(!pop)return;
  pop.addEventListener('mousedown',function(){pop.classList.add('pinned')},true);
  pop.addEventListener('touchstart',function(){pop.classList.add('pinned')},true);
  document.addEventListener('mouseup',function(){
    setTimeout(function(){if(pop)pop.classList.remove('pinned')},400);
  });
  document.addEventListener('touchend',function(){
    setTimeout(function(){if(pop)pop.classList.remove('pinned')},400);
  });
})();
function hpCloseSheet(){
  document.getElementById('hpOverlay').classList.remove('open');
  document.getElementById('hpSheet').classList.remove('open');
  // Sync mobile slider value to hidden input and trigger text
  var mHidden=document.getElementById('tps-price-hero-m');
  // We'll read from mobile display
  var mDisp=document.getElementById('psd-hero-m');
  if(mDisp&&mDisp.textContent){
    document.getElementById('hpTriggerText').textContent=mDisp.textContent;
    document.getElementById('hpTriggerText').className='hp-val';
  }
}
function hpPreset(lo,hi){
  var hidden=document.getElementById('hsPrice');
  if(lo===0&&hi===0){
    // Reset
    if(hidden)hidden.value='';
    document.getElementById('hpTriggerText').textContent='Any Price';
    document.getElementById('hpTriggerText').className='hp-placeholder';
    var wrap=document.getElementById('ps-hero');if(wrap&&wrap._reset)wrap._reset();
    var wrapM=document.getElementById('ps-hero-m');if(wrapM&&wrapM._reset)wrapM._reset();
    document.querySelectorAll('.hp-preset').forEach(function(b){b.classList.remove('active')});
    return;
  }
  if(hidden)hidden.value=lo+'-'+hi;
  var label=fmtP(lo)+' — '+fmtP(hi);
  if(lo===0)label='Under '+fmtP(hi);
  if(hi>=2000000)label=fmtP(lo)+'+';
  document.getElementById('hpTriggerText').textContent=label;
  document.getElementById('hpTriggerText').className='hp-val';
  // Highlight active preset
  document.querySelectorAll('.hp-preset').forEach(function(b){b.classList.remove('active')});
  event.target.classList.add('active');
  // Update slider displays
  var dDisp=document.getElementById('psd-hero');if(dDisp)dDisp.textContent=label;
  var mDisp=document.getElementById('psd-hero-m');if(mDisp)mDisp.textContent=label;
}

// Override hero slider render to update trigger text
var _origInitSlider=initSlider;
initSlider=function(id){
  _origInitSlider(id);
  if(id==='hero'||id==='hero-m'){
    // Patch the slider to sync trigger text on drag
    var wrap=document.getElementById('ps-'+id);
    if(!wrap)return;
    var track=document.getElementById('pst-'+id);
    if(!track)return;
    var origMouseDown=null;
    // Use MutationObserver on display element to sync
    var disp=document.getElementById('psd-'+id);
    if(disp){
      var obs=new MutationObserver(function(){
        var txt=disp.textContent;
        var trigTxt=document.getElementById('hpTriggerText');
        var hidden=document.getElementById('hsPrice');
        if(txt){
          trigTxt.textContent=txt;
          trigTxt.className='hp-val';
        }else{
          trigTxt.textContent='Any Price';
          trigTxt.className='hp-placeholder';
          if(hidden)hidden.value='';
        }
      });
      obs.observe(disp,{childList:true,characterData:true,subtree:true});
    }
  }
};

// ═══ TOWN PAGE SEARCH ═══
var TOWN_LISTINGS = {"waynesville": {"display": "Waynesville", "listings": [{"price": 389900, "address": "74 Mountain View Rd", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1840, "lot": "0.82 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Cory Coleman", "listOffice": "Keller Williams Great Smokies", "listOfficePhone": "(828) 506-6413", "attributionContact": "(828) 506-6413", "mlsId": "DEMO-2001"}, {"price": 529000, "address": "12 Plott Balsam Dr", "type": "Single Family", "beds": 4, "baths": 3, "sqft": 2450, "lot": "1.2 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Janet Holbrook", "listOffice": "Blue Ridge Realty", "listOfficePhone": "(828) 555-3201", "attributionContact": "(828) 555-3201", "mlsId": "DEMO-2002"}, {"price": 179900, "address": "Lot 8, Fines Creek Rd", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "5.7 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Randy Messer", "listOffice": "Appalachian Land Co.", "listOfficePhone": "(828) 555-4410", "attributionContact": "(828) 555-4410", "mlsId": "DEMO-2003"}, {"price": 315000, "address": "220 Dellwood Rd", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1560, "lot": "0.45 ac", "status": "Active", "restrictions": "restricted", "listAgent": "Susan Whitfield", "listOffice": "Mountain Home Real Estate", "listOfficePhone": "(828) 555-2718", "attributionContact": "(828) 555-2718", "mlsId": "DEMO-2004"}, {"price": 675000, "address": "88 Eagles Nest Trail", "type": "Single Family", "beds": 4, "baths": 4, "sqft": 3200, "lot": "2.3 ac", "status": "Active", "restrictions": "hoa", "listAgent": "Tom Braddock", "listOffice": "Great Smokies Realty", "listOfficePhone": "(828) 555-8190", "attributionContact": "(828) 555-8190", "mlsId": "DEMO-2005"}, {"price": 249000, "address": "16 Jonathan Creek Rd", "type": "Cabin", "beds": 2, "baths": 1, "sqft": 980, "lot": "0.6 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Donna Riggs", "listOffice": "Smoky Mountain Properties", "listOfficePhone": "(828) 555-5523", "attributionContact": "(828) 555-5523", "mlsId": "DEMO-2006"}, {"price": 139900, "address": "Lot 22, Crabtree Rd", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "8.1 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Mike Ensley", "listOffice": "WNC Real Estate Group", "listOfficePhone": "(828) 555-6347", "attributionContact": "(828) 555-6347", "mlsId": "DEMO-2007"}, {"price": 425000, "address": "55 Laurel Ridge Dr", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1980, "lot": "0.75 ac", "status": "Under Contract", "restrictions": "light", "listAgent": "Karen Plemmons", "listOffice": "Highland Properties", "listOfficePhone": "(828) 555-7082", "attributionContact": "(828) 555-7082", "mlsId": "DEMO-2008"}]}, "sylva": {"display": "Sylva", "listings": [{"price": 349900, "address": "88 Mill Creek Rd", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1650, "lot": "0.6 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Cory Coleman", "listOffice": "Keller Williams Great Smokies", "listOfficePhone": "(828) 506-6413", "attributionContact": "(828) 506-6413", "mlsId": "DEMO-2009"}, {"price": 549000, "address": "218 Ridge Top Lane", "type": "Single Family", "beds": 4, "baths": 3, "sqft": 2680, "lot": "1.45 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "David Buchanan", "listOffice": "Tuckasegee Realty", "listOfficePhone": "(828) 555-1145", "attributionContact": "(828) 555-1145", "mlsId": "DEMO-2010"}, {"price": 139900, "address": "Lot 3, Webster Rd", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "4.1 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Lisa Hooper", "listOffice": "Appalachian Land Co.", "listOfficePhone": "(828) 555-4410", "attributionContact": "(828) 555-4410", "mlsId": "DEMO-2011"}, {"price": 289000, "address": "44 Skyland Dr", "type": "Single Family", "beds": 2, "baths": 2, "sqft": 1320, "lot": "0.5 ac", "status": "Active", "restrictions": "restricted", "listAgent": "Brian Pressley", "listOffice": "Mountain Home Real Estate", "listOfficePhone": "(828) 555-2718", "attributionContact": "(828) 555-2718", "mlsId": "DEMO-2012"}, {"price": 475000, "address": "120 Balsam Ridge", "type": "Single Family", "beds": 4, "baths": 3, "sqft": 2400, "lot": "1.8 ac", "status": "Active", "restrictions": "hoa", "listAgent": "Angela Davis", "listOffice": "Blue Ridge Realty", "listOfficePhone": "(828) 555-3201", "attributionContact": "(828) 555-3201", "mlsId": "DEMO-2013"}, {"price": 199900, "address": "Lot 9, Speedwell Rd", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "6.5 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Greg Stillwell", "listOffice": "WNC Real Estate Group", "listOfficePhone": "(828) 555-6347", "attributionContact": "(828) 555-6347", "mlsId": "DEMO-2014"}]}, "cashiers-highlands": {"display": "Cashiers / Highlands", "listings": [{"price": 895000, "address": "42 Whitewater Falls Dr", "type": "Single Family", "beds": 5, "baths": 4, "sqft": 3920, "lot": "2.1 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Cory Coleman", "listOffice": "Keller Williams Great Smokies", "listOfficePhone": "(828) 506-6413", "attributionContact": "(828) 506-6413", "mlsId": "DEMO-2015"}, {"price": 1250000, "address": "1 Summit Overlook", "type": "Single Family", "beds": 6, "baths": 5, "sqft": 5200, "lot": "3.5 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Patricia Neville", "listOffice": "Cashiers Valley Real Estate", "listOfficePhone": "(828) 555-9301", "attributionContact": "(828) 555-9301", "mlsId": "DEMO-2016"}, {"price": 425000, "address": "Lot 19, Sapphire Valley", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "2.8 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Robert Zachary", "listOffice": "Highland Properties", "listOfficePhone": "(828) 555-7082", "attributionContact": "(828) 555-7082", "mlsId": "DEMO-2017"}, {"price": 725000, "address": "88 Glenville Lake Rd", "type": "Single Family", "beds": 4, "baths": 3, "sqft": 2800, "lot": "1.5 ac", "status": "Active", "restrictions": "restricted", "listAgent": "Ellen Crawford", "listOffice": "Blue Ridge Realty", "listOfficePhone": "(828) 555-3201", "attributionContact": "(828) 555-3201", "mlsId": "DEMO-2018"}, {"price": 2100000, "address": "15 Chattooga Club Dr", "type": "Single Family", "beds": 5, "baths": 5, "sqft": 4800, "lot": "4.2 ac", "status": "Active", "restrictions": "hoa", "listAgent": "William Hightower", "listOffice": "Cashiers Valley Real Estate", "listOfficePhone": "(828) 555-9301", "attributionContact": "(828) 555-9301", "mlsId": "DEMO-2019"}, {"price": 599000, "address": "Lot 7, Whiteside Cove", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "5.0 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Nancy Talley", "listOffice": "Appalachian Land Co.", "listOfficePhone": "(828) 555-4410", "attributionContact": "(828) 555-4410", "mlsId": "DEMO-2020"}]}, "bryson-city": {"display": "Bryson City", "listings": [{"price": 274900, "address": "155 Tuckasegee River Rd", "type": "Cabin", "beds": 2, "baths": 2, "sqft": 1280, "lot": "0.65 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Cory Coleman", "listOffice": "Keller Williams Great Smokies", "listOfficePhone": "(828) 506-6413", "attributionContact": "(828) 506-6413", "mlsId": "DEMO-2021"}, {"price": 459000, "address": "320 Deep Creek Rd", "type": "Single Family", "beds": 3, "baths": 3, "sqft": 2100, "lot": "1.8 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Mark Sutton", "listOffice": "Fontana Realty Group", "listOfficePhone": "(828) 555-8865", "attributionContact": "(828) 555-8865", "mlsId": "DEMO-2022"}, {"price": 99900, "address": "Lot 5, Alarka Rd", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "6.2 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Teresa Hyde", "listOffice": "Smoky Mountain Properties", "listOfficePhone": "(828) 555-5523", "attributionContact": "(828) 555-5523", "mlsId": "DEMO-2023"}, {"price": 339000, "address": "72 Nantahala View", "type": "Cabin", "beds": 3, "baths": 2, "sqft": 1450, "lot": "0.8 ac", "status": "Active", "restrictions": "restricted", "listAgent": "James Wiggins", "listOffice": "Great Smokies Realty", "listOfficePhone": "(828) 555-8190", "attributionContact": "(828) 555-8190", "mlsId": "DEMO-2024"}, {"price": 549000, "address": "10 Fontana Ridge", "type": "Single Family", "beds": 4, "baths": 3, "sqft": 2650, "lot": "2.5 ac", "status": "Active", "restrictions": "hoa", "listAgent": "Carol Ann Bradley", "listOffice": "Fontana Realty Group", "listOfficePhone": "(828) 555-8865", "attributionContact": "(828) 555-8865", "mlsId": "DEMO-2025"}, {"price": 189000, "address": "Lot 11, Governor's Island", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "3.4 ac", "status": "Under Contract", "restrictions": "unrestricted", "listAgent": "Steve Monteith", "listOffice": "Appalachian Land Co.", "listOfficePhone": "(828) 555-4410", "attributionContact": "(828) 555-4410", "mlsId": "DEMO-2026"}]}, "maggie-valley": {"display": "Maggie Valley", "listings": [{"price": 329000, "address": "44 Campbell Creek Rd", "type": "Cabin", "beds": 2, "baths": 2, "sqft": 1100, "lot": "0.5 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Cory Coleman", "listOffice": "Keller Williams Great Smokies", "listOfficePhone": "(828) 506-6413", "attributionContact": "(828) 506-6413", "mlsId": "DEMO-2027"}, {"price": 489000, "address": "102 Soco Falls Dr", "type": "Single Family", "beds": 3, "baths": 3, "sqft": 2200, "lot": "1.1 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Ray Caldwell", "listOffice": "Smoky Mountain Properties", "listOfficePhone": "(828) 555-5523", "attributionContact": "(828) 555-5523", "mlsId": "DEMO-2028"}, {"price": 159900, "address": "Lot 12, Smoky Hollow Rd", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "3.2 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Pamela Reeves", "listOffice": "WNC Real Estate Group", "listOfficePhone": "(828) 555-6347", "attributionContact": "(828) 555-6347", "mlsId": "DEMO-2029"}, {"price": 375000, "address": "88 Dellwood Loop", "type": "Cabin", "beds": 3, "baths": 2, "sqft": 1600, "lot": "0.7 ac", "status": "Active", "restrictions": "restricted", "listAgent": "Wayne Ferguson", "listOffice": "Mountain Home Real Estate", "listOfficePhone": "(828) 555-2718", "attributionContact": "(828) 555-2718", "mlsId": "DEMO-2030"}, {"price": 269000, "address": "210 Soco Rd", "type": "Single Family", "beds": 2, "baths": 1, "sqft": 1050, "lot": "0.35 ac", "status": "Active", "restrictions": "hoa", "listAgent": "Brenda Parton", "listOffice": "Great Smokies Realty", "listOfficePhone": "(828) 555-8190", "attributionContact": "(828) 555-8190", "mlsId": "DEMO-2031"}, {"price": 119900, "address": "Lot 4, Jonathan Creek", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "4.8 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Keith Hampton", "listOffice": "Appalachian Land Co.", "listOfficePhone": "(828) 555-4410", "attributionContact": "(828) 555-4410", "mlsId": "DEMO-2032"}]}, "franklin": {"display": "Franklin", "listings": [{"price": 279000, "address": "55 Riverview Terrace", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1520, "lot": "0.4 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Cory Coleman", "listOffice": "Keller Williams Great Smokies", "listOfficePhone": "(828) 506-6413", "attributionContact": "(828) 506-6413", "mlsId": "DEMO-2033"}, {"price": 449000, "address": "1200 Burningtown Rd", "type": "Single Family", "beds": 4, "baths": 3, "sqft": 2600, "lot": "3.8 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Beverly Shook", "listOffice": "Blue Ridge Realty", "listOfficePhone": "(828) 555-3201", "attributionContact": "(828) 555-3201", "mlsId": "DEMO-2034"}, {"price": 89900, "address": "Lot 22, Otto Rd", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "7.5 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Dale Higdon", "listOffice": "Appalachian Land Co.", "listOfficePhone": "(828) 555-4410", "attributionContact": "(828) 555-4410", "mlsId": "DEMO-2035"}, {"price": 335000, "address": "78 Cartoogechaye Creek", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1700, "lot": "1.2 ac", "status": "Active", "restrictions": "restricted", "listAgent": "Linda Mashburn", "listOffice": "Mountain Home Real Estate", "listOfficePhone": "(828) 555-2718", "attributionContact": "(828) 555-2718", "mlsId": "DEMO-2036"}, {"price": 195000, "address": "Lot 15, Nantahala Gorge", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "12 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Russell Peek", "listOffice": "WNC Real Estate Group", "listOfficePhone": "(828) 555-6347", "attributionContact": "(828) 555-6347", "mlsId": "DEMO-2037"}, {"price": 525000, "address": "42 Cowee Mountain", "type": "Single Family", "beds": 4, "baths": 3, "sqft": 2800, "lot": "5.0 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Sharon Potts", "listOffice": "Smoky Mountain Properties", "listOfficePhone": "(828) 555-5523", "attributionContact": "(828) 555-5523", "mlsId": "DEMO-2038"}]}, "dillsboro": {"display": "Dillsboro", "listings": [{"price": 339000, "address": "18 Front Street", "type": "Single Family", "beds": 2, "baths": 2, "sqft": 1350, "lot": "0.3 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Cory Coleman", "listOffice": "Keller Williams Great Smokies", "listOfficePhone": "(828) 506-6413", "attributionContact": "(828) 506-6413", "mlsId": "DEMO-2039"}, {"price": 475000, "address": "44 Riverwatch Rd", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1900, "lot": "0.85 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Dennis Cope", "listOffice": "Tuckasegee Realty", "listOfficePhone": "(828) 555-1145", "attributionContact": "(828) 555-1145", "mlsId": "DEMO-2040"}, {"price": 119900, "address": "Lot 7, Webster Heights", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "2.3 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Martha Howell", "listOffice": "Appalachian Land Co.", "listOfficePhone": "(828) 555-4410", "attributionContact": "(828) 555-4410", "mlsId": "DEMO-2041"}, {"price": 399000, "address": "22 Monteith Gap Rd", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1750, "lot": "1.1 ac", "status": "Active", "restrictions": "restricted", "listAgent": "Gary Nations", "listOffice": "Mountain Home Real Estate", "listOfficePhone": "(828) 555-2718", "attributionContact": "(828) 555-2718", "mlsId": "DEMO-2042"}]}, "cullowhee": {"display": "Cullowhee", "listings": [{"price": 259000, "address": "90 University Heights", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1400, "lot": "0.35 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Cory Coleman", "listOffice": "Keller Williams Great Smokies", "listOfficePhone": "(828) 506-6413", "attributionContact": "(828) 506-6413", "mlsId": "DEMO-2043"}, {"price": 399000, "address": "55 Caney Fork Rd", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1800, "lot": "1.5 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Amanda Leatherwood", "listOffice": "Tuckasegee Realty", "listOfficePhone": "(828) 555-1145", "attributionContact": "(828) 555-1145", "mlsId": "DEMO-2044"}, {"price": 109900, "address": "Lot 14, East LaPorte", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "3.4 ac", "status": "Active", "restrictions": "unrestricted", "listAgent": "Philip McCall", "listOffice": "Appalachian Land Co.", "listOfficePhone": "(828) 555-4410", "attributionContact": "(828) 555-4410", "mlsId": "DEMO-2045"}, {"price": 310000, "address": "120 Tuckasegee Rd", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1550, "lot": "0.6 ac", "status": "Active", "restrictions": "restricted", "listAgent": "Cindy Bowers", "listOffice": "Blue Ridge Realty", "listOfficePhone": "(828) 555-3201", "attributionContact": "(828) 555-3201", "mlsId": "DEMO-2046"}, {"price": 475000, "address": "8 Panthertown Way", "type": "Single Family", "beds": 4, "baths": 3, "sqft": 2300, "lot": "2.0 ac", "status": "Active", "restrictions": "hoa", "listAgent": "Troy Wilson", "listOffice": "Highland Properties", "listOfficePhone": "(828) 555-7082", "attributionContact": "(828) 555-7082", "mlsId": "DEMO-2047"}]}};

function townSearch(townId){
  var data=TOWN_LISTINGS[townId];
  if(!data)return;
  var typeEl=document.getElementById('tps-type-'+townId);
  var priceEl=document.getElementById('tps-price-'+townId);
  var bedsEl=document.getElementById('tps-beds-'+townId);
  var bathsEl=document.getElementById('tps-baths-'+townId);
  var restrictEl=document.getElementById('tps-restrict-'+townId);
  if(!typeEl||!priceEl||!bedsEl)return;
  var typeVal=typeEl.value,priceVal=priceEl.value,bedsVal=bedsEl.value;
  var bathsVal=bathsEl?bathsEl.value:'';
  var restrictVal=restrictEl?restrictEl.value:'';
  var results=data.listings.filter(function(l){
    if(typeVal && l.type!==typeVal)return false;
    if(priceVal){var parts=priceVal.split('-');if(l.price<parseInt(parts[0])||l.price>parseInt(parts[1]))return false;}
    if(bedsVal && l.beds<parseInt(bedsVal))return false;
    if(bathsVal && l.baths<parseInt(bathsVal))return false;
    if(restrictVal==='unrestricted' && l.restrictions!=='unrestricted')return false;
    if(restrictVal==='restricted' && l.restrictions==='unrestricted')return false;
    return true;
  });
  renderTownResults(townId,results,data.display);
}

function renderTownResults(townId,results,townName){
  var grid=document.getElementById('tps-grid-'+townId);
  var info=document.getElementById('tps-results-info-'+townId);
  if(!grid||!info)return;
  grid.innerHTML='';
  if(results.length===0){
    grid.innerHTML='<div class="tp-no-results" style="grid-column:1/-1"><strong>No properties match your criteria</strong>Try adjusting your filters, or contact Cory for off-market opportunities in '+townName+'.<br><br><a href="tel:8285066413" class="btn-primary" style="display:inline-flex"><span>Call (828) 506-6413</span></a></div>';
    info.innerHTML='<div class="tp-results-info">0 properties found <button class="tp-clear" onclick="clearTownSearch(\''+townId+'\')">Clear Filters</button></div>';
    return;
  }
  info.innerHTML='<div class="tp-results-info">'+results.length+' propert'+(results.length===1?'y':'ies')+' found <button class="tp-clear" onclick="clearTownSearch(\''+townId+'\')">Clear Filters</button></div>';
  results.forEach(function(l){
    var c=document.createElement('div');c.className='f-card';
    var feats=_cardFeats(l);
    var badge=l.type==='Land'?' land':'';
    var statusBadge=l.status==='Under Contract'?'<div class="card-status-tag">Under Contract</div>':'';
    var tBrokerParts=[];if(l.listAgent)tBrokerParts.push(l.listAgent);if(l.listOffice)tBrokerParts.push(l.listOffice);
    var tMlsNums = _formatMlsNums(l);
    var tBrokerHtml=tBrokerParts.length?'<div class="f-card-office">Listed by '+tBrokerParts.join(' &bull; ')+(tMlsNums?' | '+tMlsNums:'')+'</div>':'';
    var tIsDemo = l.mlsId && l.mlsId.toString().indexOf('DEMO') === 0;
    var photoHtml = l.photo ? '<img src="'+l.photo+'" alt="'+l.address+'" loading="lazy">' : '<div style="aspect-ratio:16/10;background:var(--surface);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.75rem">No Photo Available</div>';
    c.innerHTML='<div class="f-card-img" style="position:relative">'+photoHtml+'<div class="f-card-badge'+badge+'">'+l.type+'</div>'+(tIsDemo?'<div class="f-card-demo-badge">DEMO</div>':'')+statusBadge+cardFavHtml(l.address,townName)+'</div><div class="f-card-body"><div class="f-card-price">$'+l.price.toLocaleString()+'</div><div class="f-card-addr">'+l.address+'</div><div class="f-card-city">'+townName+', NC</div><div class="f-card-features">'+feats+'</div>'+tBrokerHtml+'</div>';
    (function(listing,town){c.onclick=function(){try{openProp(listing,town)}catch(err){console.error(err)}}})(l,townName);
    grid.appendChild(c);
  });
}

function clearTownSearch(townId){
  document.getElementById('tps-type-'+townId).value='';
  document.getElementById('tps-price-'+townId).value='';
  document.getElementById('tps-beds-'+townId).value='';
  var b=document.getElementById('tps-baths-'+townId);if(b)b.value='';
  var r=document.getElementById('tps-restrict-'+townId);if(r)r.value='';
  var w=document.getElementById('ps-'+townId);if(w&&w._reset)w._reset();
  townSearch(townId);
}

// Auto-load listings when town page opens
var _origOpenPage=openPage;
openPage=function(id){
  _origOpenPage(id);
  if(TOWN_LISTINGS[id]){
    setTimeout(function(){
      initSlider(id);
      townSearch(id);
    },50);
  }
};
document.addEventListener('keydown',function(e){if(e.key==='Escape'){var active=document.querySelector('.page-overlay.active');if(active){history.back()}}});


// Helper functions for onclick attributes
function openPropFromCard(idx){
  var l=window._FLIST[idx];
  if(!l){console.error('Listing not found at index',idx);return}
  openProp({price:l.price,address:l.address,type:l.type,beds:l.beds,baths:l.baths,sqft:l.sqft,sqftRange:l.sqftRange||'',lot:l.lot,
    restrictions:l.restrictions||'unrestricted',status:l.status||'Active',
    photo:l.photo||null,photos:l.photos||[],description:l.description||'',
    mlsId:l.mlsId||null,yearBuilt:l.yearBuilt||null,daysOnMarket:l.daysOnMarket||0,
    listAgent:l.listAgent||'',listOffice:l.listOffice||'',listOfficePhone:l.listOfficePhone||'',attributionContact:l.attributionContact||'',originatingSystem:l.originatingSystem||'',mlsSources:l.mlsSources||[]},l.city);
}
function openPropFromTown(lid){
  var data=window[lid];
  if(data)openProp(data.l,data.t);
}
// Render top 3 MLS listings into the town page featured grid
function renderTownFeatured(townSlug){
  var grid = document.getElementById('tp-featured-'+townSlug);
  if(!grid) return;
  var data = TOWN_LISTINGS[townSlug];
  if(!data || !data.listings || !data.listings.length){ grid.innerHTML=''; return; }
  var townName = data.display;
  grid.innerHTML = '';
  data.listings.slice(0,3).forEach(function(l){
    var c=document.createElement('div');c.className='f-card';
    var feats=_cardFeats(l);
    var badge=l.type==='Land'?' land':'';
    var statusBadge=l.status==='Under Contract'?'<div class="card-status-tag">Under Contract</div>':'';
    var photoHtml=l.photo?'<img src="'+l.photo+'" alt="'+l.address+'" loading="lazy">':'<div style="aspect-ratio:16/10;background:var(--surface);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.75rem">No Photo Available</div>';
    var tBrokerParts=[];if(l.listAgent)tBrokerParts.push(l.listAgent);if(l.listOffice)tBrokerParts.push(l.listOffice);
    var tMlsNums2 = _formatMlsNums(l);
    var tBrokerHtml=tBrokerParts.length?'<div class="f-card-office">Listed by '+tBrokerParts.join(' &bull; ')+(tMlsNums2?' | '+tMlsNums2:'')+'</div>':'';
    c.innerHTML='<div class="f-card-img" style="position:relative">'+photoHtml+'<div class="f-card-badge'+badge+'">'+l.type+'</div>'+statusBadge+cardFavHtml(l.address,townName)+'</div><div class="f-card-body"><div class="f-card-price">$'+l.price.toLocaleString()+'</div><div class="f-card-addr">'+l.address+'</div><div class="f-card-city">'+townName+', NC</div><div class="f-card-features">'+feats+'</div>'+tBrokerHtml+'</div>';
    (function(listing,town){c.onclick=function(e){if(e.target.closest('.card-fav-heart'))return;try{openProp(listing,town)}catch(err){console.error(err)}}})(l,townName);
    grid.appendChild(c);
  });
}

// Wire static featured cards — match to MLS data, inject photos + hearts + click handlers
function _wireFeaturedCards(containerEl, townSlug){
  if(!containerEl) return;
  var townName = TOWN_LISTINGS[townSlug] ? TOWN_LISTINGS[townSlug].display : townSlug.replace(/-/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase()});
  var cards=containerEl.querySelectorAll('.f-card');
  cards.forEach(function(card){
    if(card._propWired)return;
    card._propWired=true;
    var priceEl=card.querySelector('.f-card-price');
    var addrEl=card.querySelector('.f-card-addr');
    if(!priceEl||!addrEl)return;
    var price=parseInt(priceEl.textContent.replace(/[^0-9]/g,''));
    var addr=addrEl.textContent;
    var cityEl=card.querySelector('.f-card-city');
    var city=cityEl?cityEl.textContent.replace(/,\s*NC$/i,'').trim():townName;

    // Inject heart icon if not already present
    var imgWrap=card.querySelector('.f-card-img');
    if(imgWrap && !imgWrap.querySelector('.card-fav-heart')){
      imgWrap.insertAdjacentHTML('beforeend', cardFavHtml(addr, city));
    }

    // Wire click — try to match from TOWN_LISTINGS for full data, else build from card
    var match=null;
    if(TOWN_LISTINGS[townSlug]){
      TOWN_LISTINGS[townSlug].listings.forEach(function(l){if(l.address===addr&&l.price===price)match=l});
    }
    if(match){
      // Update photo if the static card has a placeholder
      if(match.photo && imgWrap){
        var existingImg = imgWrap.querySelector('img');
        if(!existingImg){
          var placeholder = imgWrap.querySelector('div[style]');
          if(placeholder){
            var img = document.createElement('img');
            img.src = match.photo;
            img.alt = addr;
            img.loading = 'lazy';
            imgWrap.replaceChild(img, placeholder);
          }
        }
      }
      card.onclick=function(e){if(e.target.closest('.card-fav-heart'))return;try{openProp(match,townName)}catch(err){console.error(err)}};
    } else {
      // Fallback: build listing from card HTML
      var badgeEl=card.querySelector('.f-card-badge');
      var type=badgeEl?badgeEl.textContent.trim():'Single Family';
      var feats=card.querySelectorAll('.f-feat strong');
      var beds=0,baths=0,sqft=0,lot='';
      if(type==='Land'){lot=feats[0]?feats[0].textContent:'';}
      else{beds=feats[0]?parseInt(feats[0].textContent):0;baths=feats[1]?parseInt(feats[1].textContent):0;sqft=feats[2]?parseInt(feats[2].textContent.replace(/,/g,'')):0;}
      card.onclick=function(e){if(e.target.closest('.card-fav-heart'))return;try{openProp({price:price,address:addr,type:type,beds:beds,baths:baths,sqft:sqft,lot:lot,restrictions:'unrestricted',status:'Active'},city)}catch(err){console.error(err)}};
    }
  });
}
// Call on SPA navigation from homepage
(function(){
  var origOpen=openPage;
  openPage=function(id){
    origOpen(id);
    setTimeout(function(){
      renderTownFeatured(id);
    },100);
  };
})();





// ═══ PROPERTY DETAIL PAGE ═══
var PROP_IMAGES = {
  'Single Family': [
    'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200&q=85',
    'https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=1200&q=85',
    'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1200&q=85',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=85'
  ],
  'Cabin': [
    'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=1200&q=85',
    'https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?w=1200&q=85',
    'https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=1200&q=85'
  ],
  'Land': [
    'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=85',
    'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200&q=85',
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&q=85'
  ]
};

var PROP_DESCRIPTIONS = {
  'Single Family': [
    'This beautifully maintained home sits on a quiet street with mature landscaping and mountain views from nearly every room. The open floor plan features hardwood floors throughout, a stone fireplace, and a chef\'s kitchen with granite counters and stainless appliances. The primary suite offers a spa-like bathroom with a soaking tub and walk-in shower.',
    'Step outside onto the wraparound deck and take in the layered mountain views that shift with every season. The property offers both privacy and convenience — minutes from town, yet you\'d never know it from the serene, wooded setting. A detached workshop and ample parking complete the picture.'
  ],
  'Cabin': [
    'This classic mountain cabin blends rustic charm with modern comfort. Exposed beams, a stacked-stone fireplace, and tongue-and-groove ceilings create the authentic mountain retreat feel, while updated systems, insulation, and appliances ensure year-round livability. The wraparound porch is the perfect spot for morning coffee with long-range views.',
    'Whether you\'re looking for a full-time mountain escape or a high-performing vacation rental, this cabin delivers. The location offers easy access to outdoor recreation while maintaining the peaceful, wooded privacy that draws people to the mountains. Strong rental history and turnkey furnishings available.'
  ],
  'Land': [
    'This exceptional mountain acreage offers a rare combination of privacy, views, and accessibility. The gently rolling topography provides multiple ideal building sites with long-range mountain views. A seasonal creek runs along the western boundary, and mature hardwoods offer both beauty and potential timber value.',
    'Access is via a well-maintained gravel road, and power is available at the property line. The parcel has been soil-tested and approved for a conventional septic system, removing one of the biggest unknowns in mountain land purchases. Unrestricted — bring your vision and build your dream.'
  ]
};

var RESTRICT_LABELS = {'unrestricted':'Unrestricted — No HOA','restricted':'Has Restrictions','light':'Has Restrictions','hoa':'Has Restrictions'};

function openProp(listing, townName) {
  // Registration gate — allow 3 free previews, gate on 4th view
  if(!_acctLoggedIn){
    _guestViewCount++;
    try { sessionStorage.setItem('cc_guest_views', _guestViewCount.toString()); } catch(e) {}
    if(_guestViewCount >= 4){
      // Gate: require registration
      _pendingProp = {listing:listing, townName:townName};
      openAcctModal();
      return;
    }
    // Allow preview but will show soft banner (rendered below)
  }
  hideMobileCta();
  try{
  var o = document.getElementById('propOverlay');
  if (!o) {console.error('propOverlay not found');return;}

  // Show/hide demo indicators based on whether listing has DEMO mlsId
  var _isDemo = listing.mlsId && listing.mlsId.toString().indexOf('DEMO') === 0;
  var _demoBanner = document.getElementById('propDemoBanner');
  if(_demoBanner) _demoBanner.style.display = _isDemo ? '' : 'none';
  var _demoNotice = document.getElementById('propDemoNotice');
  if(_demoNotice) _demoNotice.style.display = _isDemo ? '' : 'none';

  // Images — show primary photo immediately, then load full gallery from DB
  var imgs;
  if(listing.photos && listing.photos.length > 0) {
    imgs = listing.photos;
  } else if(listing.photo) {
    imgs = [listing.photo];
  } else {
    imgs = PROP_IMAGES[listing.type] || PROP_IMAGES['Single Family'];
  }
  var mainImg = imgs[0] || imgs[Math.floor(Math.random()*imgs.length)];
  document.getElementById('propHeroImg').src = mainImg;
  document.getElementById('propHeroImg').alt = listing.address + ' ' + townName + ' NC real estate';

  // Image gallery state
  window._propImgs = imgs;
  window._propImgIdx = 0;

  // Thumbnails — render what we have now
  function _renderThumbs(imgArr) {
    var thumbsEl = document.getElementById('propThumbs');
    thumbsEl.innerHTML = '';
    imgArr.forEach(function(src, i) {
      var d = document.createElement('div');
      d.className = 'prop-thumb' + (i === 0 ? ' active' : '');
      d.innerHTML = '<img src="' + src + '" alt="Photo ' + (i+1) + '"><span class="prop-img-count">' + (i+1) + ' / ' + imgArr.length + '</span>';
      d.onclick = function(e) {
        e.stopPropagation();
        propGoTo(i);
        openLightbox(i);
      };
      thumbsEl.appendChild(d);
    });
  }
  _renderThumbs(imgs);

  // Load full photo gallery from Supabase (on-demand)
  if(MLS_GRID.enabled && listing.listingKey && typeof MLS_GRID.loadPhotos === 'function') {
    MLS_GRID.loadPhotos(listing.listingKey).then(function(allPhotos) {
      if(allPhotos && allPhotos.length > 1) {
        window._propImgs = allPhotos;
        window._propImgIdx = 0;
        document.getElementById('propHeroImg').src = allPhotos[0];
        _renderThumbs(allPhotos);
        // Update the listing's cached photos for future opens
        listing.photos = allPhotos;
      }
    });
  }

  // Status
  var statusEl = document.getElementById('propStatus');
  statusEl.textContent = listing.status || 'Active Listing';
  statusEl.className = 'prop-hero-status ' + (listing.status === 'Under Contract' ? 'pending-status' : 'active-status');

  // Price, address, city
  document.getElementById('propPrice').textContent = '$' + listing.price.toLocaleString();
  document.getElementById('propAddr').textContent = listing.address;
  document.getElementById('propCity').textContent = townName + ', North Carolina';

  // Listing broker attribution (IDX compliance — multi-MLS aware)
  var brokerEl = document.getElementById('propListingBroker');
  if(brokerEl) {
    var parts = [];
    if(listing.listAgent) parts.push('Listed by ' + listing.listAgent);
    if(listing.listOffice) parts.push(listing.listOffice);
    if(listing.attributionContact) parts.push(listing.attributionContact);
    var brokerText = parts.join(' \u2022 ');
    // Show MLS numbers — dual-source listings get both credited
    var mlsNums = _formatMlsNums(listing);
    if(mlsNums) brokerText += ' | ' + mlsNums;
    brokerEl.textContent = brokerText || '';
    brokerEl.style.display = brokerText ? '' : 'none';
  }

  // IDX source attribution — dynamic per listing source(s) + Rule 24 required verbiage
  var idxSrcEl = document.getElementById('propIdxSource');
  if(idxSrcEl) {
    var sources = listing.mlsSources || [];
    var srcParts = [];
    var hasCsar = false, hasCanopy = false;
    sources.forEach(function(s) {
      if(s.system === 'CSAR') hasCsar = true;
      else hasCanopy = true;
    });
    if(hasCsar) srcParts.push('Carolina Smokies Association of Realtors');
    if(hasCanopy) srcParts.push('Canopy MLS as distributed by MLS GRID');
    // Fallback if no mlsSources (demo data or cache without sources)
    if(!srcParts.length) srcParts.push('Canopy MLS as distributed by MLS GRID');
    // Rule 24 compliant disclaimer with MLS GRID timestamp
    var _gridTs = document.getElementById('idxGridTimestamp');
    var _gridTsText = (_gridTs && _gridTs.textContent !== 'the last data refresh') ? _gridTs.textContent : new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) + ' at ' + new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    idxSrcEl.textContent = 'Listing courtesy of ' + srcParts.join(' and ') + '. Based on information submitted to the MLS GRID as of ' + _gridTsText + '. All data is obtained from various sources and may not have been verified by broker or MLS GRID. Supplied Open House Information is subject to change without notice. All information should be independently reviewed and verified for accuracy. Properties may or may not be listed by the office/agent presenting the information.';
  }

  // Stats ribbon
  var statsEl = document.getElementById('propStats');
  if (listing.type === 'Land') {
    statsEl.innerHTML =
      '<div class="prop-stat"><div class="prop-stat-val">' + listing.lot + '</div><div class="prop-stat-label">Total Acreage</div></div>' +
      '<div class="prop-stat"><div class="prop-stat-val">' + (RESTRICT_LABELS[listing.restrictions]||'—').split('—')[0].trim() + '</div><div class="prop-stat-label">Restrictions</div></div>' +
      '<div class="prop-stat"><div class="prop-stat-val">$' + Math.round(listing.price/parseFloat(listing.lot)).toLocaleString() + '</div><div class="prop-stat-label">Price Per Acre</div></div>' +
      '<div class="prop-stat"><div class="prop-stat-val">' + (listing.days||Math.floor(Math.random()*40+5)) + '</div><div class="prop-stat-label">Days on Market</div></div>';
  } else {
    var _hasSqft = (listing.sqft && listing.sqft > 0) || listing.sqftRange;
    var _sqftStat = _hasSqft
      ? '<div class="prop-stat"><div class="prop-stat-val">' + _formatSqft(listing) + '</div><div class="prop-stat-label">Square Feet' + ((!listing.sqft || listing.sqft === 0) && listing.sqftRange ? ' (range)' : '') + '</div></div>'
      : '<div class="prop-stat"><div class="prop-stat-val">' + (listing.daysOnMarket || listing.days || '—') + '</div><div class="prop-stat-label">Days on Market</div></div>';
    statsEl.innerHTML =
      '<div class="prop-stat"><div class="prop-stat-val">' + listing.beds + '</div><div class="prop-stat-label">Bedrooms</div></div>' +
      '<div class="prop-stat"><div class="prop-stat-val">' + listing.baths + '</div><div class="prop-stat-label">Bathrooms</div></div>' +
      _sqftStat +
      '<div class="prop-stat"><div class="prop-stat-val">' + listing.lot + '</div><div class="prop-stat-label">Lot Size</div></div>';
  }

  // Title
  var titleEl = document.getElementById('propTitle');
  if (listing.type === 'Land') {
    titleEl.innerHTML = listing.lot + ' of <em>Unrestricted Mountain Land</em>';
  } else {
    titleEl.innerHTML = 'A ' + listing.beds + '-Bedroom <em>' + listing.type + '</em> in ' + townName;
  }

  // Descriptions — use API description if available, fallback to stock
  var descs = PROP_DESCRIPTIONS[listing.type] || PROP_DESCRIPTIONS['Single Family'];
  if(listing.description && listing.description.length > 20) {
    // Split long API description into two paragraphs
    var desc = listing.description;
    var mid = Math.floor(desc.length / 2);
    var splitPt = desc.indexOf('. ', mid);
    if(splitPt > -1 && splitPt < desc.length - 20) {
      document.getElementById('propDesc1').textContent = desc.substring(0, splitPt+1);
      document.getElementById('propDesc2').textContent = desc.substring(splitPt+2);
    } else {
      document.getElementById('propDesc1').textContent = desc;
      document.getElementById('propDesc2').textContent = '';
    }
  } else {
    document.getElementById('propDesc1').textContent = descs[0];
    document.getElementById('propDesc2').textContent = descs[1];
  }

  // Features grid
  var featEl = document.getElementById('propFeatures');
  var feats = [];
  if (listing.type !== 'Land') {
    if(_hasSqftData(listing)) {
      var _sqftDisplay = _formatSqft(listing) + ' ' + _sqftLabel(listing);
      feats.push({icon:'<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/>',val:_sqftDisplay,label:'Living Area'});
    }
    feats.push({icon:'<path d="M2 4v16h20V4H2zm0 8h20"/><path d="M6 8v0"/>',val:listing.beds+' Beds / '+listing.baths+' Baths',label:'Bedrooms & Bathrooms'});
    feats.push({icon:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>',val:listing.lot,label:'Lot Size'});
    if(listing.yearBuilt){feats.push({icon:'<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',val:listing.yearBuilt.toString(),label:'Year Built'});}
    feats.push({icon:'<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',val:RESTRICT_LABELS[listing.restrictions]||'Contact Agent',label:'Restrictions'});
    feats.push({icon:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',val:(listing.days||Math.floor(Math.random()*40+5))+' days',label:'Days on Market'});
  } else {
    feats.push({icon:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>',val:listing.lot,label:'Total Acreage'});
    feats.push({icon:'<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',val:RESTRICT_LABELS[listing.restrictions]||'Unrestricted',label:'Restrictions'});
    feats.push({icon:'<path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/>',val:townName+', NC',label:'Location'});
    feats.push({icon:'<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',val:'Available at Road',label:'Power'});
    feats.push({icon:'<path d="M12 2v20M2 12h20"/>',val:'Approved',label:'Septic / Perc Test'});
    feats.push({icon:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',val:'$'+Math.round(listing.price/parseFloat(listing.lot)).toLocaleString()+'/ac',label:'Price Per Acre'});
  }
  featEl.innerHTML = feats.map(function(f){return '<div class="prop-feat"><svg viewBox="0 0 24 24">'+f.icon+'</svg><div class="prop-feat-info"><div class="prop-feat-val">'+f.val+'</div><div class="prop-feat-label">'+f.label+'</div></div></div>'}).join('');

  // Highlights
  var hlEl = document.getElementById('propHighlights');
  var hls = listing.type === 'Land' ? [
    {icon:'<path d="M18 8A6 6 0 006 8c0 7-8 13-8 13h20S18 15 18 8z"/><path d="M13.73 21a2 2 0 01-3.46 0"/>',title:'Unrestricted',desc:'Build your dream — no HOA'},
    {icon:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>',title:'Mountain Views',desc:'Long-range layered ridgelines'},
    {icon:'<path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>',title:'Creek / Water',desc:'Seasonal creek on property'}
  ] : [
    {icon:'<path d="M18 8A6 6 0 006 8c0 7-8 13-8 13h20S18 15 18 8z"/><path d="M13.73 21a2 2 0 01-3.46 0"/>',title:'Move-In Ready',desc:'Updated and well maintained'},
    {icon:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>',title:'Mountain Views',desc:'Panoramic ridge views from deck'},
    {icon:'<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',title:'Great Location',desc:'Minutes from downtown '+townName}
  ];
  hlEl.innerHTML = hls.map(function(h){return '<div class="prop-highlight"><svg viewBox="0 0 24 24">'+h.icon+'</svg><div class="prop-highlight-title">'+h.title+'</div><div class="prop-highlight-desc">'+h.desc+'</div></div>'}).join('');

  // Property map — real Leaflet map
  var mapContainer = document.getElementById('propMapContainer');
  if(mapContainer && typeof L !== 'undefined') {
    // Destroy previous map instance if any
    if(window._propMap) { try { window._propMap.remove(); } catch(e){} window._propMap = null; }
    mapContainer.innerHTML = '';
    var mapLat = listing.lat || (TOWN_COORDS[townName] ? TOWN_COORDS[townName].lat : 35.38);
    var mapLng = listing.lng || (TOWN_COORDS[townName] ? TOWN_COORDS[townName].lng : -83.18);
    var zoom = (listing.lat && listing.lng) ? 15 : 12;
    window._propMap = L.map(mapContainer, {zoomControl:true, attributionControl:true, scrollWheelZoom:false, zoomSnap:0}).setView([mapLat, mapLng], zoom);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution:'&copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom:18,
      keepBuffer:5,
      updateWhenZooming:false,
      updateWhenIdle:true
    }).addTo(window._propMap);
    L.marker([mapLat, mapLng]).addTo(window._propMap).bindPopup('<strong>'+listing.address+'</strong><br>'+townName+', NC');
    // Invalidate size after overlay animation completes
    setTimeout(function(){ if(window._propMap) window._propMap.invalidateSize(); }, 400);
  }

  // Mortgage calc
  var price = listing.price;
  var down = Math.round(price * 0.2);
  var loan = price - down;
  var rate = 0.0675 / 12;
  var n = 360;
  var monthly = Math.round(loan * (rate * Math.pow(1+rate,n)) / (Math.pow(1+rate,n)-1));
  document.getElementById('calcPrice').textContent = '$' + price.toLocaleString();
  document.getElementById('calcDown').textContent = '$' + down.toLocaleString();
  document.getElementById('calcLoan').textContent = '$' + loan.toLocaleString();
  document.getElementById('calcMonthly').textContent = '$' + monthly.toLocaleString();

  // Admin BBO notes — reset then fetch
  var adminNotesEl = document.getElementById('propAdminNotes');
  if(adminNotesEl) {
    adminNotesEl.style.display = 'none';
    document.getElementById('propPrivateRemarks').innerHTML = '';
    document.getElementById('propShowingInstructions').innerHTML = '';
    document.getElementById('propDirections').innerHTML = '';
    document.getElementById('propBuyerAgent').innerHTML = '';
    document.getElementById('propListAgentContact').innerHTML = '';
  }

  // Guest preview banner — show for views 1-3 when not logged in
  var existingBanner = document.getElementById('guestPreviewBanner');
  if(existingBanner) existingBanner.remove();
  if(!_acctLoggedIn && _guestViewCount <= 3){
    var remaining = 3 - _guestViewCount;
    var bannerHTML = '<div class="guest-preview-banner' + (remaining === 0 ? ' last-preview' : '') + '" id="guestPreviewBanner">';
    if(remaining > 0){
      bannerHTML += '<span>Free preview <strong>' + _guestViewCount + ' of 3</strong></span>';
    } else {
      bannerHTML += '<span><strong>Last free preview</strong></span>';
    }
    bannerHTML += '<button onclick="openAcctModal()">Unlock Unlimited Access &mdash; Free</button></div>';
    var contentArea = document.getElementById('propContentArea');
    if(contentArea) contentArea.insertAdjacentHTML('beforebegin', bannerHTML);
  }

  // Show overlay
  o.classList.add('active');
  o.scrollTop = 0;
  _lockScroll();
  try{history.pushState({page:'property'},'','#property')}catch(he){}

  // Fetch full MLS data for admin — reads raw_data from Navica API
  if(_isAdmin && listing.listingKey && _sb) {
    _sb.from('mls_listings')
      .select('*')
      .eq('listing_key', listing.listingKey)
      .maybeSingle()
      .then(function(resp){
        if(!resp.data) return;
        var d = resp.data;
        var r = d.raw_data || {};
        var notesEl = document.getElementById('propAdminNotes');
        if(!notesEl) return;

        // Helper: format field value (handles arrays, booleans, nulls)
        function fv(val) {
          if(val === null || val === undefined || val === '') return '';
          if(Array.isArray(val)) return val.filter(Boolean).join(', ');
          if(typeof val === 'boolean') return val ? 'Yes' : 'No';
          return String(val);
        }
        // Helper: build admin field row
        function bf(label, value) {
          var v = fv(value);
          if(!v) return '';
          var safe = v.replace(/</g,'&lt;').replace(/>/g,'&gt;');
          return '<div class="prop-admin-field"><div class="prop-admin-field-label">' + label + '</div><div class="prop-admin-field-value">' + safe + '</div></div>';
        }
        // Helper: build admin field with a link
        function bfLink(label, text, url) {
          if(!text) return '';
          var safe = String(text).replace(/</g,'&lt;').replace(/>/g,'&gt;');
          return '<div class="prop-admin-field"><div class="prop-admin-field-label">' + label + '</div><div class="prop-admin-field-value"><a href="' + url + '" target="_blank" rel="noopener" style="color:var(--gold);text-decoration:underline;text-underline-offset:3px">' + safe + ' ↗</a></div></div>';
        }
        // Helper: format parcel PIN with dashes (7622097767 → 7622-09-7767)
        function fmtPin(pin) {
          if(!pin) return '';
          var s = String(pin).replace(/[^0-9]/g, '');
          if(s.length === 10) return s.slice(0,4) + '-' + s.slice(4,6) + '-' + s.slice(6);
          return String(pin);
        }
        // Helper: collapsible section wrapper
        function section(title, content, startOpen) {
          if(!content) return '';
          return '<div class="admin-section' + (startOpen ? ' open' : '') + '">' +
            '<div class="admin-section-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
            '<span>' + title + '</span><svg viewBox="0 0 24 24" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg></div>' +
            '<div class="admin-section-body">' + content + '</div></div>';
        }

        var html = '';

        // ── Copy MLS # button at top of admin panel ──
        var _mlsNum = r.ListingId || d.listing_id || '';
        if(_mlsNum) {
          var _mlsDisplay = 'R' + _mlsNum + 'A';
          html += '<div class="admin-mls-copy">' +
            '<button class="admin-mls-btn" onclick="navigator.clipboard.writeText(\'' + _mlsDisplay + '\').then(function(){var b=this;b.textContent=\'Copied!\';setTimeout(function(){b.innerHTML=\'<svg viewBox=&quot;0 0 24 24&quot; width=&quot;14&quot; height=&quot;14&quot;><rect x=&quot;9&quot; y=&quot;9&quot; width=&quot;13&quot; height=&quot;13&quot; rx=&quot;2&quot; ry=&quot;2&quot;/><path d=&quot;M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1&quot;/></svg> MLS# ' + _mlsDisplay + '\'},1200)}.bind(this))">' +
            '<svg viewBox="0 0 24 24" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> MLS# ' + _mlsDisplay +
            '</button></div>';
        }

        // ── 1. Agent Remarks & Showing (always open) ──
        var s1 = '';
        s1 += bf('Agent Remarks', r.PrivateRemarks);
        s1 += bf('Showing Instructions', r.ShowingInstructions);
        s1 += bf('Lockbox', r.LockBoxType);
        s1 += bf('Lockbox Location', r.LockBoxLocation);
        s1 += bf('Directions', r.Directions);
        s1 += bf('Possession', r.Possession);
        html += section('Agent Remarks & Showing', s1, true);

        // ── 2. Owner & Listing Info ──
        var s2 = '';
        s2 += bf('Owner', r.OwnerName);
        s2 += bf('Additional Owner', r.NAV27_AdditionalOwnrNm);
        s2 += bf('Ownership', r.Ownership);
        s2 += bf('Primary Residence', r.NAV27_Prim_Res);
        s2 += bf('Allows Vacation Rental', r.NAV27_AllowsVacationRentalYN);
        s2 += bf('Vacation Rental History', r.NAV27_VacationRentalHistoryYN);
        s2 += bf('Home Warranty', r.HomeWarrantyYN);
        s2 += bf('Furnished', r.Furnished);
        s2 += bf('Senior Community', r.SeniorCommunityYN);
        s2 += bf('Listing Agreement', r.ListingAgreement);
        s2 += bf('Listing Terms', r.ListingTerms);
        s2 += bf('Special Conditions', r.SpecialListingConditions);
        s2 += bf('FSBO', r.NAV27_FSBOYN);
        html += section('Owner & Listing Info', s2, true);

        // ── 3. Compensation ──
        var s3 = '';
        s3 += bf('Buyer Agency Compensation', r.BuyerAgencyCompensation);
        s3 += bf('Sub-Agency Compensation', r.SubAgencyCompensation);
        s3 += bf('Transaction Broker Comp', r.TransactionBrokerCompensation);
        if(r.ConcessionsAmount) s3 += bf('Seller Concessions', '$' + parseFloat(r.ConcessionsAmount).toLocaleString());
        s3 += bf('Concession Comments', r.ConcessionsComments);
        html += section('Compensation', s3, true);

        // ── 4. Tax & Legal ──
        var s4 = '';
        // Link Parcel ID to county GIS when available
        var _pin = r.ParcelNumber || '';
        var _county = (r.CountyOrParish || '').toLowerCase();
        var _fmtPin = fmtPin(_pin);
        var _gisUrls = {
          'jackson': 'https://gis.jacksonnc.org/rpv/?find=' + encodeURIComponent(_fmtPin),
          'haywood': 'https://maps.haywoodcountync.gov/?find=' + encodeURIComponent(_fmtPin),
          'macon':   'https://gis2.maconnc.org/lightmap/Maps/default.htm?pid=' + encodeURIComponent(_pin.replace(/[^0-9]/g,'')),
          'swain':   'https://maps.swaincountync.gov/gis/?find=' + encodeURIComponent(_fmtPin)
        };
        if(_pin && _gisUrls[_county]) {
          s4 += bfLink('Parcel ID', _fmtPin, _gisUrls[_county]);
        } else {
          s4 += bf('Parcel ID', _pin);
        }
        s4 += bf('Deed Book', r.TaxBookNumber);
        s4 += bf('Deed Page', r.NAV27_Deed_Pg);
        s4 += bf('County Tax', r.TaxAnnualAmount ? '$' + parseFloat(r.TaxAnnualAmount).toLocaleString() : '');
        s4 += bf('Tax Year', r.TaxYear);
        s4 += bf('Special Assessment', r.NAV27_Spcl_Asmnt);
        s4 += bf('Restrictions', r.NAV27_Restrictions);
        s4 += bf('Restriction Deed Book/Page', r.NAV27_Restriction_Desc);
        s4 += bf('Zoning', r.Zoning);
        html += section('Tax & Legal', s4, false);

        // ── 5. HOA / Association ──
        var s5 = '';
        s5 += bf('HOA', r.AssociationYN);
        s5 += bf('HOA Dues', r.AssociationFee ? '$' + parseFloat(r.AssociationFee).toLocaleString() : '');
        s5 += bf('HOA Frequency', r.AssociationFeeFrequency);
        s5 += bf('Association Name', r.AssociationName);
        s5 += bf('Road Frontage', r.RoadFrontageType);
        s5 += bf('Road Responsibility', r.RoadResponsibility);
        html += section('HOA & Roads', s5, false);

        // ── 6. Lot & Land ──
        var s6 = '';
        s6 += bf('Lot Size (Acres)', r.LotSizeAcres);
        s6 += bf('Lot Size (SqFt)', r.LotSizeSquareFeet ? parseFloat(r.LotSizeSquareFeet).toLocaleString() : '');
        s6 += bf('Acreage Range', r.NAV27_Acrg_Rng);
        s6 += bf('Lot Features', r.LotFeatures);
        s6 += bf('Acreage/Waterfront Features', r.WaterfrontFeatures);
        s6 += bf('View', r.View);
        s6 += bf('Flood Hazard', r.NAV27_Fld_Haz);
        s6 += bf('Elevation', r.Elevation || r.ElevationUnits ? (r.Elevation || '0') + ' ' + (r.ElevationUnits || 'ft') : '');
        s6 += bf('Topography', r.Topography);
        html += section('Lot & Land', s6, false);

        // ── 7. Construction & Exterior ──
        var s7 = '';
        s7 += bf('Style', r.ArchitecturalStyle);
        s7 += bf('Year Built', r.YearBuilt);
        s7 += bf('Age Range', r.NAV27_Age_Rng);
        s7 += bf('Exterior Finish', r.ConstructionMaterials);
        s7 += bf('Roofing', r.Roof);
        s7 += bf('Foundation', r.FoundationDetails);
        s7 += bf('Basement', r.Basement);
        s7 += bf('Attic', r.NAV27_CF_H);
        s7 += bf('Windows', r.WindowFeatures);
        s7 += bf('Doors', r.DoorFeatures);
        s7 += bf('Patio/Porch', r.PatioAndPorchFeatures);
        s7 += bf('Other Structures', r.OtherStructures);
        s7 += bf('Exterior Features', r.ExteriorFeatures);
        html += section('Construction & Exterior', s7, false);

        // ── 8. Interior & Rooms ──
        var s8 = '';
        s8 += bf('SqFt Range', r.NAV27_SqFt_Rng);
        s8 += bf('Flooring', r.Flooring);
        s8 += bf('Fireplace', r.FireplaceFeatures);
        s8 += bf('Interior Features', r.InteriorFeatures);
        s8 += bf('Appliances', r.Appliances);
        // Room levels
        var rooms = [];
        if(r.RoomMasterBedroomLevel) rooms.push('Primary Bedroom: ' + r.RoomMasterBedroomLevel);
        if(r.RoomBedroom2Level) rooms.push('Bedroom 2: ' + r.RoomBedroom2Level);
        if(r.RoomBedroom3Level) rooms.push('Bedroom 3: ' + r.RoomBedroom3Level);
        if(r.RoomBedroom4Level) rooms.push('Bedroom 4: ' + r.RoomBedroom4Level);
        if(r.RoomKitchenLevel) rooms.push('Kitchen: ' + r.RoomKitchenLevel);
        if(r.RoomLivingRoomLevel) rooms.push('Living Room: ' + r.RoomLivingRoomLevel);
        if(r.RoomDiningRoomLevel) rooms.push('Dining Room: ' + r.RoomDiningRoomLevel);
        if(r.RoomFamilyRoomLevel) rooms.push('Family Room: ' + r.RoomFamilyRoomLevel);
        if(rooms.length) s8 += bf('Room Levels', rooms.join(', '));
        html += section('Interior & Rooms', s8, false);

        // ── 9. Utilities & Systems ──
        var s9 = '';
        s9 += bf('Heating', r.Heating);
        s9 += bf('Cooling', r.Cooling);
        s9 += bf('Water Source', r.WaterSource);
        s9 += bf('Sewer', r.Sewer);
        s9 += bf('Electric', r.Electric);
        s9 += bf('Gas', r.Gas);
        s9 += bf('Utilities', r.Utilities);
        s9 += bf('Internet', r.InternetWholeListing);
        html += section('Utilities & Systems', s9, false);

        // ── 10. Parking ──
        var s10 = '';
        s10 += bf('Garage', r.GarageYN);
        s10 += bf('Garage Spaces', r.GarageSpaces || '');
        s10 += bf('Carport', r.CarportYN);
        s10 += bf('Carport Spaces', r.CarportSpaces || '');
        s10 += bf('Parking Features', r.ParkingFeatures);
        s10 += bf('Covered Spaces', r.CoveredSpaces || '');
        html += section('Parking', s10, false);

        // ── 11. Listing Agent / Office ──
        var s11 = '';
        s11 += bf('List Agent', r.ListAgentFullName);
        s11 += bf('Agent Email', r.ListAgentEmail);
        s11 += bf('Agent Phone', r.ListAgentPreferredPhone || r.ListAgentDirectPhone);
        s11 += bf('Agent MLS ID', r.ListAgentMlsId);
        s11 += bf('List Office', r.ListOfficeName);
        s11 += bf('Office Phone', r.ListOfficePhone);
        s11 += bf('Office Email', r.ListOfficeEmail);
        s11 += bf('Office Fax', r.ListOfficeFax);
        s11 += bf('Office MLS ID', r.ListOfficeMlsId);
        // Buyer side
        s11 += bf('Buyer Agent', r.BuyerAgentFullName);
        s11 += bf('Buyer Agent Email', r.BuyerAgentEmail);
        s11 += bf('Buyer Office', r.BuyerOfficeName);
        html += section('Listing Agent & Office', s11, false);

        // ── 12. IDX / Display Flags ──
        var s12 = '';
        s12 += bf('Feed Types', r.FeedTypes);
        s12 += bf('IDX Participation', r.IDXParticipationYN);
        s12 += bf('Display Address', r.InternetAddressDisplayYN);
        s12 += bf('Display Listing', r.InternetEntireListingDisplayYN);
        s12 += bf('Allow AVM', r.InternetAutomatedValuationDisplayYN);
        s12 += bf('Allow Comments', r.InternetConsumerCommentYN);
        s12 += bf('Days on Market', r.DaysOnMarket);
        s12 += bf('Cumulative DOM', r.CumulativeDaysOnMarket);
        s12 += bf('List Date', r.ListingContractDate);
        s12 += bf('Expiration Date', r.ExpirationDate);
        s12 += bf('MLS #', r.ListingId);
        s12 += bf('Listing Key', r.ListingKey);
        s12 += bf('Original List Price', r.OriginalListPrice ? '$' + parseFloat(r.OriginalListPrice).toLocaleString() : '');
        html += section('MLS Details', s12, false);

        if(html) {
          // Clear legacy individual field containers
          ['propPrivateRemarks','propShowingInstructions','propDirections','propBuyerAgent','propListAgentContact'].forEach(function(id){
            var el = document.getElementById(id); if(el) el.innerHTML = '';
          });
          notesEl.querySelector('.prop-section-label').insertAdjacentHTML('afterend', html);
          notesEl.style.display = '';
        }
      }).catch(function(e){ console.error('[BBO] fetch error:', e); });
  }

  }catch(err){console.error('openProp error:',err)}
}

function closeProp(fromPopstate) {
  showMobileCta();
  // Clean up property map
  if(window._propMap) { try { window._propMap.remove(); } catch(e){} window._propMap = null; }
  var o = document.getElementById('propOverlay');
  if (o) o.classList.remove('active');
  // On town pages, simply hide and restore scroll — no navigation
  if(_isTownPage) {
    var searchOv = document.getElementById('searchOverlay');
    if(!searchOv || !searchOv.classList.contains('active')){
      _unlockScroll();
    }
    if (!fromPopstate && history.state && history.state.page === 'property') {
      window._propJustClosed = true;
      history.back();
    }
    return;
  }
  // Only restore scroll if search overlay isn't also open
  var searchOv = document.getElementById('searchOverlay');
  if(!searchOv || !searchOv.classList.contains('active')){
    _unlockScroll();
  }
  // If user came from a town page deep link, go back there
  if(_propDeepLinkRef) {
    var returnUrl = _propDeepLinkRef;
    _propDeepLinkRef = null;
    window.location.href = returnUrl;
    return;
  }
  if (!fromPopstate && history.state && history.state.page === 'property') {
    window._propJustClosed = true;
    history.back();
  }
}

function propShare(type) {
  var addr = document.getElementById('propAddr').textContent;
  var price = document.getElementById('propPrice').textContent;
  if (type === 'copy') {
    var text = addr + ' — ' + price + ' | Cory Coleman Real Estate | coryhelpsyoumove.com';
    navigator.clipboard.writeText(text).then(function(){
      event.target.closest('.prop-share-btn').innerHTML = '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg> Copied!';
    });
  } else if (type === 'email') {
    window.location.href = 'mailto:?subject=Check out this property in Western NC&body=' + encodeURIComponent(addr + ' — ' + price + '\n\nView at coryhelpsyoumove.com');
  } else if (type === 'sms') {
    window.location.href = 'sms:?body=' + encodeURIComponent('Check out this property: ' + addr + ' — ' + price + ' | coryhelpsyoumove.com');
  } else if (type === 'print') {
    if(!_acctLoggedIn) { openAcctModal(); return; }
    // Hide compare print page if present
    var cpPage = document.getElementById('comparePrintPage');
    if(cpPage) cpPage.className = 'compare-print-page';
    // Populate print page
    var heroImg = document.getElementById('propHeroImg');
    document.getElementById('printThumb').src = heroImg ? heroImg.src : '';
    document.getElementById('printPrice').textContent = price;
    document.getElementById('printAddr').textContent = addr;
    document.getElementById('printCity').textContent = document.getElementById('propCity').textContent || '';
    document.getElementById('printDate').textContent = 'Printed: ' + new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
    // Listing broker attribution (IDX compliance)
    var printBrokerEl = document.getElementById('printBroker');
    if(printBrokerEl) {
      var brokerSrc = document.getElementById('propListingBroker');
      printBrokerEl.textContent = brokerSrc ? brokerSrc.textContent : '';
      printBrokerEl.style.display = printBrokerEl.textContent ? '' : 'none';
    }
    // Stats from the stats ribbon
    var statsEl = document.getElementById('propStats');
    var printStatsEl = document.getElementById('printStats');
    if(statsEl && printStatsEl){
      var statDivs = statsEl.querySelectorAll('.prop-stat');
      printStatsEl.innerHTML = '';
      statDivs.forEach(function(s){
        var val = s.querySelector('.prop-stat-val');
        var label = s.querySelector('.prop-stat-label');
        if(val && label){
          printStatsEl.innerHTML += '<div class="print-page-stat"><div class="print-page-stat-val">'+val.textContent+'</div><div class="print-page-stat-label">'+label.textContent+'</div></div>';
        }
      });
    }
    // Property Overview (description)
    var d1 = document.getElementById('propDesc1');
    var d2 = document.getElementById('propDesc2');
    var descText = (d1 ? d1.textContent : '') + (d2 && d2.textContent ? ' ' + d2.textContent : '');
    document.getElementById('printDesc').textContent = descText;

    // Property Details (features grid)
    var featEls = document.querySelectorAll('#propFeatures .prop-feat');
    var printDetailsEl = document.getElementById('printDetails');
    if(printDetailsEl){
      printDetailsEl.innerHTML = '';
      featEls.forEach(function(f){
        var val = f.querySelector('.prop-feat-val');
        var label = f.querySelector('.prop-feat-label');
        if(val && label){
          printDetailsEl.innerHTML += '<div class="print-detail-item"><span class="print-detail-label">'+label.textContent+'</span><span class="print-detail-val">'+val.textContent+'</span></div>';
        }
      });
    }

    // Cory's Take
    var corysTakeEl = document.getElementById('corysTake');
    var printCT = document.getElementById('printCorysTake');
    var printCTInsights = document.getElementById('printCorysTakeInsights');
    if(printCT && printCTInsights && corysTakeEl && corysTakeEl.style.display !== 'none'){
      var insightEls = corysTakeEl.querySelectorAll('.corys-take-insight');
      if(insightEls.length > 0){
        printCTInsights.innerHTML = '';
        insightEls.forEach(function(ins){
          var textDiv = ins.querySelector('div:last-child');
          if(textDiv){
            // Strip HTML spans but keep the text content
            var text = textDiv.textContent;
            printCTInsights.innerHTML += '<div class="print-ct-insight">'+text+'</div>';
          }
        });
        printCT.style.display = '';
      } else {
        printCT.style.display = 'none';
      }
    } else if(printCT) {
      printCT.style.display = 'none';
    }

    // Neighborhood Details
    var printND = document.getElementById('printNeighborhood');
    var printNdGrid = document.getElementById('printNdGrid');
    var printNdAm = document.getElementById('printNdAmenities');
    if(printND && printNdGrid && printNdAm) {
      var tn = (window._currentTownName||'').toLowerCase().replace(/\s*\/\s*/g,'-').replace(/\s+/g,'-');
      var ndData = NEIGHBORHOOD_DATA[tn];
      if(ndData) {
        printNdGrid.innerHTML =
          '<div class="print-nd-card"><div class="print-nd-label">Schools</div><div class="print-nd-value">' + ndData.schools.range + '/10</div><div class="print-nd-detail">' + ndData.schools.district + ' (via GreatSchools.org)</div></div>' +
          '<div class="print-nd-card"><div class="print-nd-label">Walkability</div><div class="print-nd-value">' + ndData.walkability.score + '</div><div class="print-nd-detail">' + ndData.walkability.label + '</div></div>' +
          '<div class="print-nd-card"><div class="print-nd-label">Commute</div><div class="print-nd-value">' + ndData.commute.avg + ' min</div><div class="print-nd-detail">To ' + ndData.commute.to + '</div></div>';
        printNdAm.innerHTML =
          '<span class="print-nd-tag">' + ndData.amenities.restaurants + ' Restaurants</span>' +
          '<span class="print-nd-tag">' + ndData.amenities.breweries + ' Breweries</span>' +
          '<span class="print-nd-tag">' + ndData.amenities.parks + ' Parks</span>' +
          '<span class="print-nd-tag">' + ndData.amenities.trailheads + ' Trailheads</span>';
        printND.style.display = '';
      } else {
        printND.style.display = 'none';
      }
    }

    // Distances & Drive Times
    var printDist = document.getElementById('printDistances');
    var printDistGrid = document.getElementById('printDistGrid');
    if(printDist && printDistGrid) {
      var tn2 = (window._currentTownName||'').toLowerCase().replace(/\s*\/\s*/g,'-').replace(/\s+/g,'-');
      var pois = TOWN_POIS[tn2];
      if(pois) {
        var distHtml = '';
        Object.keys(POI_LABELS).forEach(function(cat) {
          if(!pois[cat] || !pois[cat].length) return;
          distHtml += '<div class="print-dist-card"><div class="print-dist-cat">' + POI_LABELS[cat] + '</div>';
          pois[cat].forEach(function(p) {
            distHtml += '<div class="print-dist-item"><span>' + p.n + '</span><span class="print-dist-time">' + p.d + '</span></div>';
          });
          distHtml += '</div>';
        });
        printDistGrid.innerHTML = distHtml;
        printDist.style.display = '';
      } else {
        printDist.style.display = 'none';
      }
    }

    // Ask Cory Q&A
    var printQA = document.getElementById('printQA');
    var printQAList = document.getElementById('printQAList');
    if(printQA && printQAList) {
      var qaItems = document.querySelectorAll('#propQuestionsList .prop-qa-item');
      if(qaItems && qaItems.length > 0) {
        printQAList.innerHTML = '';
        qaItems.forEach(function(item) {
          var qEl = item.querySelector('.prop-qa-q');
          var aEl = item.querySelector('.prop-qa-a');
          var html = '<div class="print-qa-item"><div class="print-qa-q">' + (qEl ? qEl.textContent : '') + '</div>';
          if(aEl) html += '<div class="print-qa-a">' + aEl.textContent + '</div>';
          html += '</div>';
          printQAList.innerHTML += html;
        });
        printQA.style.display = '';
      } else {
        printQA.style.display = 'none';
      }
    }

    // Notes — party transcript or personal notes
    var printNotes = document.getElementById('printYourNotes');
    var printNotesSection = printNotes ? printNotes.closest('.print-notes-section') : null;
    var printNotesTitle = printNotesSection ? printNotesSection.querySelector('.print-notes-title') : null;
    if(printNotes && printNotesSection) {
      if(_activeParty && _partyNotes[_currentPropKey] && _partyNotes[_currentPropKey].length > 0) {
        // Party mode — render transcript
        if(printNotesTitle) printNotesTitle.textContent = 'Search Party Notes';
        var pnHtml = '';
        _partyNotes[_currentPropKey].forEach(function(n) {
          pnHtml += '<div style="margin-bottom:6px"><strong>' + (n.user_display_name || 'Party member') + ':</strong> ' + n.note_text.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>';
        });
        printNotes.innerHTML = pnHtml;
        printNotesSection.style.display = '';
      } else {
        // Solo mode — personal textarea
        if(printNotesTitle) printNotesTitle.textContent = 'Your Notes';
        var notesTA = document.getElementById('propNotesTA');
        if(notesTA) {
          var noteText = notesTA.value.trim();
          if(noteText) {
            printNotes.textContent = noteText;
            printNotesSection.style.display = '';
          } else {
            printNotesSection.style.display = 'none';
          }
        } else {
          printNotesSection.style.display = 'none';
        }
      }
    }
    window.print();
  }
}

// Handle popstate for property page
var _origPopstate = window.onpopstate;
window.addEventListener('popstate', function(e) {
  // Close chat panel if it was open (mobile back button)
  if(chatOpen||_chatMinimized){_closeChat();return}
  // Close mobile menu if open (back button)
  var mm=document.getElementById('mobileMenu');
  if(mm&&mm.classList.contains('open')){closeMobile(true);return}
  // Close compare overlay if open
  var compareOv = document.getElementById('compareOverlay');
  if(compareOv && compareOv.classList.contains('active')) {
    compareOv.classList.remove('active');
    _unlockScroll();
    return;
  }
  // Close lightbox first if open
  var lb = document.getElementById('propLightbox');
  if (lb && lb.classList.contains('open')) {
    lb.classList.remove('open');
    return;
  }
  // If lightbox was just closed via X button, don't close property page
  if (_lbJustClosed) {
    _lbJustClosed = false;
    return;
  }
  // Then close property overlay
  var propOverlay = document.getElementById('propOverlay');
  if (propOverlay && propOverlay.classList.contains('active')) {
    propOverlay.classList.remove('active');
    // Only restore scroll if search isn't also open
    var searchOv = document.getElementById('searchOverlay');
    if(!searchOv || !searchOv.classList.contains('active')){
      _unlockScroll();
    }
    return;
  }
  // If property was just closed via X, stay on search
  if (window._propJustClosed) {
    window._propJustClosed = false;
    return;
  }
  // Then close search overlay
  var searchOv = document.getElementById('searchOverlay');
  if (searchOv && searchOv.classList.contains('active')) {
    searchOv.classList.remove('active');
    _unlockScroll();
  }
});

// ═══ PROPERTY IMAGE NAVIGATION & LIGHTBOX ═══
function propGoTo(idx) {
  var imgs = window._propImgs;
  if (!imgs || !imgs.length) return;
  idx = ((idx % imgs.length) + imgs.length) % imgs.length;
  window._propImgIdx = idx;
  var heroImg = document.getElementById('propHeroImg');
  heroImg.classList.add('fade');
  setTimeout(function() {
    heroImg.src = imgs[idx];
    heroImg.classList.remove('fade');
  }, 250);
  var thumbs = document.querySelectorAll('.prop-thumb');
  thumbs.forEach(function(t, i) { t.classList.toggle('active', i === idx) });
  // Auto-scroll thumbnail strip to keep active thumb visible
  if(thumbs[idx]){
    thumbs[idx].scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
  }
}
function propImgNav(dir) {
  propGoTo((window._propImgIdx || 0) + dir);
}

// Keyboard nav (only when property overlay is open)
document.addEventListener('keydown', function(e) {
  var lb = document.getElementById('propLightbox');
  if (lb && lb.classList.contains('open')) {
    if (e.key === 'ArrowLeft') lbNav(-1);
    else if (e.key === 'ArrowRight') lbNav(1);
    else if (e.key === 'Escape') closeLightbox();
    return;
  }
  var prop = document.getElementById('propOverlay');
  if (prop && prop.classList.contains('active')) {
    if (e.key === 'ArrowLeft') propImgNav(-1);
    else if (e.key === 'ArrowRight') propImgNav(1);
    else if (e.key === 'Escape') closeProp();
  }
});

// Lightbox
function openLightbox(idx) {
  var imgs = window._propImgs;
  if (!imgs || !imgs.length) return;
  if (idx === undefined) idx = window._propImgIdx || 0;
  window._lbIdx = idx;
  var lb = document.getElementById('propLightbox');
  document.getElementById('propLbImg').src = imgs[idx];
  document.getElementById('propLbCount').textContent = (idx + 1) + ' of ' + imgs.length;
  lb.classList.add('open');
  history.pushState({page:'lightbox'},'','#photos');
}
var _lbJustClosed = false;
function closeLightbox(e,fromPopstate) {
  if (e && e.target && e.target.tagName === 'IMG') return;
  var lb = document.getElementById('propLightbox');
  if (!lb || !lb.classList.contains('open')) return;
  lb.classList.remove('open');
  if (!fromPopstate && history.state && history.state.page === 'lightbox') {
    _lbJustClosed = true;
    history.back();
  }
}
function lbNav(dir) {
  var imgs = window._propImgs;
  if (!imgs) return;
  var idx = ((window._lbIdx + dir) % imgs.length + imgs.length) % imgs.length;
  window._lbIdx = idx;
  document.getElementById('propLbImg').src = imgs[idx];
  document.getElementById('propLbCount').textContent = (idx + 1) + ' of ' + imgs.length;
}

// Click hero image to open lightbox (deferred - element created later in DOM)
document.addEventListener('click', function(e) {
  if (!e.target.closest('#propHeroZone')) return;
  if (e.target.closest('.prop-nav') || e.target.closest('.prop-thumb') || e.target.closest('.prop-hero-content') || e.target.closest('.prop-hero-expand')) return;
  openLightbox();
});


// ═══ TOUCH SWIPE HELPER ═══
function addSwipe(el, onLeft, onRight) {
  var startX = 0, startY = 0, tracking = false;
  el.addEventListener('touchstart', function(e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, {passive: true});
  el.addEventListener('touchend', function(e) {
    if (!tracking) return;
    tracking = false;
    var dx = e.changedTouches[0].clientX - startX;
    var dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) onLeft();
      else onRight();
    }
  }, {passive: true});
}

// Attach swipe to hero gallery
(function(){
  var heroZone = document.getElementById('propHeroZone');
  if (heroZone && !heroZone._swipeInit) {
    addSwipe(heroZone, function(){ propImgNav(1); }, function(){ propImgNav(-1); });
    heroZone._swipeInit = true;
  }
  // Attach swipe to lightbox
  var lb = document.getElementById('propLightbox');
  if (lb && !lb._swipeInit) {
    addSwipe(lb, function(){ lbNav(1); }, function(){ lbNav(-1); });
    lb._swipeInit = true;
  }
})();

// Fade in scroll-over gradient + hero darken on scroll
(function(){
  var overlay = document.getElementById('propOverlay');
  if (!overlay) return;
  overlay.addEventListener('scroll', function() {
    var area = document.getElementById('propContentArea');
    if (area) {
      if (overlay.scrollTop > 30) area.classList.add('scroll-fade');
      else area.classList.remove('scroll-fade');
    }
    // Darken hero image as user scrolls
    var hero = document.querySelector('.prop-hero');
    if (hero) {
      var heroH = hero.offsetHeight || 500;
      var fade = Math.min(overlay.scrollTop / heroH, 0.85);
      hero.style.setProperty('--hero-fade', fade);
    }
  });
})();



// ═══════════════════════════════════════════════════
// SEARCH RESULTS PAGE
// ═══════════════════════════════════════════════════

// Town coordinates for map
var TOWN_COORDS = {
  "Waynesville": {lat:35.4887,lng:-83.0055},
  "Sylva": {lat:35.3736,lng:-83.2243},
  "Maggie Valley": {lat:35.5182,lng:-83.0998},
  "Bryson City": {lat:35.4312,lng:-83.4493},
  "Cashiers": {lat:35.1032,lng:-83.1160},
  "Cashiers / Highlands": {lat:35.1032,lng:-83.1160},
  "Franklin": {lat:35.1824,lng:-83.3810},
  "Dillsboro": {lat:35.3697,lng:-83.2478},
  "Cullowhee": {lat:35.3135,lng:-83.1774}
};

// Aggregate ALL listings into one searchable array
var ALL_LISTINGS = [];
(function(){
  // When MLS_GRID is enabled, skip demo data population — MLS_GRID.init() handles ALL_LISTINGS
  if(MLS_GRID.enabled) return;
  // From featured listings
  LISTINGS.forEach(function(l){
    ALL_LISTINGS.push({
      price:l.price, address:l.address, city:l.city, type:l.type,
      beds:l.beds, baths:l.baths, sqft:l.sqft, sqftRange:l.sqftRange||'', lot:l.lot,
      photo:l.photo, photos:l.photos||[], status:l.status||'Active', restrictions:l.restrictions||'unrestricted',
      listAgent:l.listAgent||'', listOffice:l.listOffice||'', listOfficePhone:l.listOfficePhone||'',
      attributionContact:l.attributionContact||'',
      mlsId:l.mlsId||'', description:l.description||'', daysOnMarket:l.daysOnMarket||l.days||0,
      originatingSystem:l.originatingSystem||'', mlsSources:l.mlsSources||[],
      _src:'featured'
    });
  });
  // From town listings
  Object.keys(TOWN_LISTINGS).forEach(function(tid){
    var td = TOWN_LISTINGS[tid];
    td.listings.forEach(function(l){
      // Avoid duplicates (check address+price)
      var isDup = ALL_LISTINGS.some(function(e){return e.address===l.address && e.price===l.price});
      if(!isDup){
        ALL_LISTINGS.push({
          price:l.price, address:l.address, city:td.display, type:l.type,
          beds:l.beds, baths:l.baths, sqft:l.sqft, sqftRange:l.sqftRange||'', lot:l.lot,
          photo:l.photo||null, photos:l.photos||[], status:l.status||'Active', restrictions:l.restrictions||'unrestricted',
          listAgent:l.listAgent||'', listOffice:l.listOffice||'', listOfficePhone:l.listOfficePhone||'',
          attributionContact:l.attributionContact||'',
          mlsId:l.mlsId||'', description:l.description||'', daysOnMarket:l.daysOnMarket||0,
          originatingSystem:l.originatingSystem||'', mlsSources:l.mlsSources||[],
          _src:'town'
        });
      }
    });
  });

  // Add randomized coordinates to each listing
  var rng = function(seed){return function(){seed=(seed*16807)%2147483647;return(seed-1)/2147483646}};
  var rand = rng(42);
  ALL_LISTINGS.forEach(function(l){
    var tc = TOWN_COORDS[l.city];
    if(tc){
      l.lat = tc.lat + (rand()-0.5)*0.06;
      l.lng = tc.lng + (rand()-0.5)*0.06;
    } else {
      l.lat = 35.38 + (rand()-0.5)*0.15;
      l.lng = -83.18 + (rand()-0.5)*0.3;
    }
  });
})();

var _srMap = null;
var _srMarkers = [];
var _srMarkerMap = {};       // listingKey → marker for ID-based lookup
var _srClusterGroup = null;  // L.markerClusterGroup
var _srActiveCard = null;
var _srMobileView = 'list';  // 'list' or 'map'
var _srAllFilteredResults = []; // Full dropdown-filtered results (before viewport/spatial)
var _srViewportDebounce = null;

// Drawing state
var _srDrawMode = null;          // null | 'radius' | 'polygon' | 'freedraw'
var _srDrawnLayer = null;        // The drawn L.Circle or L.Polygon on the map
var _srDrawHandler = null;       // Active Leaflet.draw handler
var _srSpatialFilter = null;     // function(lat, lng) => boolean
var _srFreedrawing = false;      // True while freehand drawing in progress
var _srFreedrawPoints = [];      // LatLng array for freehand
var _srFreedrawLine = null;      // Temporary polyline during freehand

// ── Area → city mapping (includes rural variants) ──
var AREA_CITIES = {
  'Waynesville': ['Waynesville'],
  'Sylva': ['Sylva'],
  'Maggie Valley': ['Maggie Valley'],
  'Bryson City': ['Bryson City'],
  'Cashiers': ['Cashiers','Highlands','Sapphire','Glenville','Scaly Mountain'],
  'Franklin': ['Franklin','Franklin City Limits','Otto'],
  'Dillsboro': ['Dillsboro'],
  'Cullowhee': ['Cullowhee','Webster','Tuckasegee']
};
// Display labels for area chip
var AREA_LABELS = {
  'Waynesville':'Waynesville','Sylva':'Sylva','Maggie Valley':'Maggie Valley',
  'Bryson City':'Bryson City','Cashiers':'Cashiers / Highlands',
  'Franklin':'Franklin','Dillsboro':'Dillsboro','Cullowhee':'Cullowhee'
};

// Check if a listing city matches a selected area (includes rural variants)
function cityMatchesArea(city, area) {
  if(!city || !area) return false;
  var mapped = AREA_CITIES[area] || [area];
  // Exact match against mapped cities
  for(var i=0; i<mapped.length; i++){
    if(city === mapped[i]) return true;
  }
  // Also match "[AreaName] Rural", "[AreaName] Township", etc.
  if(city.indexOf(area) === 0) return true;
  return false;
}

// Get selected areas from checkboxes
function getSelectedAreas() {
  var checks = document.querySelectorAll('#srfLocDropdown input[type="checkbox"]:checked');
  var areas = [];
  checks.forEach(function(cb){ areas.push(cb.value); });
  return areas;
}

// Set selected areas (for programmatic use)
function setSelectedAreas(areas) {
  var allChecks = document.querySelectorAll('#srfLocDropdown input[type="checkbox"]');
  allChecks.forEach(function(cb){
    cb.checked = areas.indexOf(cb.value) !== -1;
  });
  updateLocLabel();
}

// Update the label text on the chip
function updateLocLabel() {
  var areas = getSelectedAreas();
  var label = document.getElementById('srfLocLabel');
  var chip = document.getElementById('srfLocation');
  if(!label) return;
  if(areas.length === 0) {
    label.textContent = 'All Areas';
    if(chip) chip.classList.remove('active');
  } else if(areas.length === 1) {
    label.textContent = AREA_LABELS[areas[0]] || areas[0];
    if(chip) chip.classList.add('active');
  } else {
    label.textContent = areas.length + ' Areas';
    if(chip) chip.classList.add('active');
  }
}

// Toggle dropdown open/close
function toggleLocDropdown(e) {
  var dd = document.getElementById('srfLocDropdown');
  var chip = document.getElementById('srfLocation');
  if(!dd) return;
  var isOpen = dd.classList.contains('open');
  // Close any other open dropdowns first
  document.querySelectorAll('.sr-multi-dropdown.open').forEach(function(d){ d.classList.remove('open'); });
  document.querySelectorAll('.sr-multi-chip.open').forEach(function(c){ c.classList.remove('open'); });
  if(!isOpen) {
    // Position fixed dropdown below the chip
    var rect = chip.getBoundingClientRect();
    dd.style.top = (rect.bottom + 4) + 'px';
    dd.style.left = rect.left + 'px';
    dd.classList.add('open');
    if(chip) chip.classList.add('open');
    // Close on outside click
    setTimeout(function(){
      document.addEventListener('click', _closeLocDropdown);
    }, 0);
  }
}
function _closeLocDropdown(e) {
  var dd = document.getElementById('srfLocDropdown');
  var chip = document.getElementById('srfLocation');
  if(dd && chip && !chip.contains(e.target)) {
    dd.classList.remove('open');
    chip.classList.remove('open');
    document.removeEventListener('click', _closeLocDropdown);
  }
}

// Called when any area checkbox changes
function srLocChanged() {
  updateLocLabel();
  srApplyFilters();
}

function openSearchResults(filters){
  hideMobileCta();
  filters = filters || {};

  // Set filter values
  var typeSel = document.getElementById('srfTypeSelect');
  var priceSel = document.getElementById('srfPriceSelect');
  var bedsSel = document.getElementById('srfBedsSelect');
  var bathsSel = document.getElementById('srfBathsSelect');
  var restrictSel = document.getElementById('srfRestrictSelect');

  // Set location multi-select
  if(filters.location) {
    // Support comma-separated areas or single area
    var locs = filters.location.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
    setSelectedAreas(locs);
  } else {
    setSelectedAreas([]);
  }
  typeSel.value = filters.type || '';

  // Price: if value doesn't match a dropdown option, add a custom one
  var priceVal = filters.price || '';
  if(priceVal) {
    // Remove any previous custom option
    var existing = priceSel.querySelector('option[data-custom]');
    if(existing) existing.remove();
    // Try setting the value
    priceSel.value = priceVal;
    // If select didn't accept it (no matching option), create a custom option
    if(priceSel.value !== priceVal) {
      var parts = priceVal.split('-');
      var lo = parseInt(parts[0]), hi = parseInt(parts[1]);
      var fmtK = function(v){ return v >= 1000000 ? '$' + (v/1000000).toFixed(1) + 'M' : '$' + Math.round(v/1000) + 'K'; };
      var label = lo === 0 ? 'Under ' + fmtK(hi) : fmtK(lo) + ' – ' + fmtK(hi);
      var opt = document.createElement('option');
      opt.value = priceVal;
      opt.textContent = label;
      opt.setAttribute('data-custom', '1');
      priceSel.appendChild(opt);
      priceSel.value = priceVal;
    }
  } else {
    priceSel.value = '';
  }

  bedsSel.value = filters.beds || '';
  bathsSel.value = filters.baths || '';
  restrictSel.value = filters.restrictions || '';

  // Set text query in search overlay
  var srTextInput = document.getElementById('srfTextQuery');
  if(srTextInput) srTextInput.value = filters.query || '';

  // Show overlay
  var overlay = document.getElementById('searchOverlay');
  overlay.classList.add('active');
  _lockScroll();
  history.pushState({page:'search'},'','#search');

  // Update theme toggle
  var theme = document.documentElement.getAttribute('data-theme');
  overlay.querySelectorAll('.prop-toggle-sun').forEach(function(el){el.style.display = theme==='light'?'inline':'none'});
  overlay.querySelectorAll('.prop-toggle-moon').forEach(function(el){el.style.display = theme==='dark'?'inline':'none'});

  // Initialize map if not yet
  setTimeout(function(){
    if(!_srMap){
      initSearchMap();
    } else {
      _srMap.invalidateSize();
    }
    srApplyFilters();
    document.getElementById('srMapLoading').style.display = 'none';
  }, 100);
}

function closeSearch(){
  showMobileCta();
  var overlay = document.getElementById('searchOverlay');
  if(!overlay || !overlay.classList.contains('active')) return;
  overlay.classList.remove('active');
  _unlockScroll();
  if(history.state && history.state.page === 'search') history.back();
}

function initSearchMap(){
  try {
    var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    _srMap = L.map('srMap',{
      zoomControl:false,
      attributionControl:true,
      zoomSnap:0,
      zoomDelta:1,
      scrollWheelZoom:true,
      wheelDebounceTime:30,
      wheelPxPerZoomLevel:20,
      touchZoom:true,
      bounceAtZoomLimits:false,
      zoomAnimation:true,
      zoomAnimationThreshold:4
    }).setView([35.38,-83.20],10);
    L.control.zoom({position:'topright'}).addTo(_srMap);

    // Use dark or light tiles
    var darkTiles = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    var lightTiles = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    window._srTileLayer = L.tileLayer(isDark ? darkTiles : lightTiles, {
      attribution:'&copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom:18,
      keepBuffer:6,
      updateWhenZooming:true,
      updateWhenIdle:false
    }).addTo(_srMap);

    // Store tile URLs for theme switching
    window._srDarkTiles = darkTiles;
    window._srLightTiles = lightTiles;

    // Marker cluster group
    if(typeof L.markerClusterGroup === 'function') {
      _srClusterGroup = L.markerClusterGroup({
        maxClusterRadius: 50,
        disableClusteringAtZoom: 15,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        chunkedLoading: true,
        animate: true,
        animateAddingMarkers: false,
        iconCreateFunction: function(cluster) {
          var count = cluster.getChildCount();
          var size = count < 20 ? 'small' : count < 50 ? 'medium' : 'large';
          var px = size === 'small' ? 36 : size === 'medium' ? 44 : 52;
          return L.divIcon({
            html: '<div class="sr-cluster sr-cluster-' + size + '">' + count + '</div>',
            className: 'sr-cluster-wrap',
            iconSize: L.point(px, px)
          });
        }
      });
      _srMap.addLayer(_srClusterGroup);
    }

    // Town name labels — float above markers/clusters
    _srMap.createPane('townLabels');
    _srMap.getPane('townLabels').style.zIndex = 650; // above markers (600) and clusters
    _srMap.getPane('townLabels').style.pointerEvents = 'none';
    var townLabelCoords = {
      'Waynesville':{lat:35.4887,lng:-83.0055},
      'Sylva':{lat:35.3736,lng:-83.2243},
      'Maggie Valley':{lat:35.5182,lng:-83.0998},
      'Bryson City':{lat:35.4312,lng:-83.4493},
      'Cashiers':{lat:35.1032,lng:-83.1160},
      'Highlands':{lat:35.0527,lng:-83.1968},
      'Franklin':{lat:35.1824,lng:-83.3810},
      'Dillsboro':{lat:35.3697,lng:-83.2478},
      'Cullowhee':{lat:35.3135,lng:-83.1774}
    };
    Object.keys(townLabelCoords).forEach(function(name){
      var c = townLabelCoords[name];
      L.marker([c.lat, c.lng], {
        pane:'townLabels',
        interactive:false,
        icon: L.divIcon({
          className:'sr-town-label-wrap',
          html:'<div class="sr-town-label">'+name+'</div>',
          iconSize:[0,0],
          iconAnchor:[0,18]
        })
      }).addTo(_srMap);
    });

    // Viewport-based card filtering: update cards on pan/zoom
    _srMap.on('moveend', function(){
      if(_srSpatialFilter) return; // Drawing active — skip viewport filter
      clearTimeout(_srViewportDebounce);
      _srViewportDebounce = setTimeout(srFilterCardsByViewport, 150);
    });

    // Leaflet.draw event: shape created
    _srMap.on('draw:created', function(e) {
      srHandleDrawCreated(e);
    });

    // Freehand drawing events
    _srMap.on('mousedown', function(e) {
      if(!_srFreedrawing) return;
      _srFreedrawPoints = [e.latlng];
      _srFreedrawLine = L.polyline([e.latlng], {color:'#C4B08C', weight:2, dashArray:'6,4'}).addTo(_srMap);
    });
    _srMap.on('mousemove', function(e) {
      if(!_srFreedrawing || !_srFreedrawLine) return;
      _srFreedrawPoints.push(e.latlng);
      _srFreedrawLine.addLatLng(e.latlng);
    });
    _srMap.on('mouseup', function(e) {
      if(!_srFreedrawing || !_srFreedrawLine) return;
      _srFreedrawing = false;
      _srMap.dragging.enable();
      _srMap.getContainer().style.cursor = '';
      if(_srFreedrawLine) { _srMap.removeLayer(_srFreedrawLine); _srFreedrawLine = null; }
      if(_srFreedrawPoints.length < 5) { _srFreedrawPoints = []; return; } // Too few points
      // Close the polygon and apply filter
      if(_srDrawnLayer) { _srMap.removeLayer(_srDrawnLayer); }
      _srDrawnLayer = L.polygon(_srFreedrawPoints, {color:'#C4B08C', weight:2, fillColor:'#C4B08C', fillOpacity:0.12, dashArray:null}).addTo(_srMap);
      var verts = _srFreedrawPoints.map(function(p){return [p.lat, p.lng]});
      _srSpatialFilter = function(lat, lng) { return srPointInPolygon(lat, lng, verts); };
      _srDrawMode = 'freedraw';
      srApplySpatialFilter();
      document.getElementById('srDrawClear').style.display = '';
      document.querySelectorAll('.sr-draw-btn').forEach(function(b){b.classList.remove('active')});
      document.getElementById('srDrawFree').classList.add('active');
    });

  } catch(e) {
    console.error('Map init error:', e);
    document.getElementById('srMapLoading').innerHTML = '<span style="color:var(--text-muted)">Map requires internet connection</span>';
  }
}

function srApplyFilters(){
  var selectedAreas = getSelectedAreas();
  var type = document.getElementById('srfTypeSelect').value;
  var price = document.getElementById('srfPriceSelect').value;
  var beds = document.getElementById('srfBedsSelect').value;
  var baths = document.getElementById('srfBathsSelect').value;
  var restrict = document.getElementById('srfRestrictSelect').value;
  var textQuery = ((document.getElementById('srfTextQuery')||{}).value||'').trim().toLowerCase();
  var sortEl = document.getElementById('srSort');
  if(textQuery) {
    if(sortEl && sortEl.value !== 'relevance') sortEl.value = 'relevance';
  } else {
    if(sortEl && sortEl.value === 'relevance') sortEl.value = 'daysOnMarket-asc';
  }
  var sort = sortEl.value;

  // Highlight active filters (select-based chips)
  document.querySelectorAll('.sr-filter-chip:not(.sr-multi-chip)').forEach(function(c){
    var sel = c.querySelector('select');
    if(sel) c.classList.toggle('active', sel.value !== '');
  });
  // Location chip active state managed by updateLocLabel()
  updateLocLabel();
  // Highlight text search chip if has content
  var textChip = document.getElementById('srfTextChip');
  if(textChip) textChip.classList.toggle('active', textQuery.length > 0);

  // Filter — when a text query is present, skip area filter so address/MLS searches
  // always find the property regardless of which location checkboxes are active
  var skipAreaFilter = textQuery.length > 0;
  var results = ALL_LISTINGS.filter(function(l){
    if(!skipAreaFilter && selectedAreas.length > 0){
      var locMatch = false;
      for(var i=0; i<selectedAreas.length; i++){
        if(cityMatchesArea(l.city, selectedAreas[i])){ locMatch = true; break; }
      }
      if(!locMatch) return false;
    }
    if(type && l.type !== type) return false;
    if(price){
      var parts = price.split('-');
      var lo = parseInt(parts[0]), hi = parseInt(parts[1]);
      if(l.price < lo || l.price > hi) return false;
    }
    if(beds && l.beds < parseInt(beds)) return false;
    if(baths && l.baths < parseInt(baths)) return false;
    if(restrict === 'unrestricted' && l.restrictions !== 'unrestricted') return false;
    if(restrict === 'restricted' && l.restrictions === 'unrestricted') return false;
    return true;
  });

  // Fuzzy text search (address, city, mlsId, description)
  if(textQuery && typeof Fuse !== 'undefined') {
    var fuse = new Fuse(results, {
      keys: [
        { name: 'address', weight: 3 },
        { name: 'city', weight: 2 },
        { name: 'mlsId', weight: 2 },
        { name: 'description', weight: 1 }
      ],
      threshold: 0.35,       // 0=exact, 1=match anything — 0.35 is good for typos
      distance: 300,          // how far into the string to search
      ignoreLocation: true,   // match anywhere in the string
      minMatchCharLength: 2,
      includeScore: true,
      useExtendedSearch: false
    });
    var fuseResults = fuse.search(textQuery);
    results = fuseResults.map(function(r){ return r.item; });
  } else if(textQuery) {
    // Fallback if Fuse.js not loaded: exact substring match
    var words = textQuery.split(/\s+/).filter(function(w){return w.length > 0});
    results = results.filter(function(l){
      var haystack = ((l.address||'') + ' ' + (l.city||'') + ' ' + (l.mlsId||'') + ' ' + (l.description||'')).toLowerCase();
      return words.every(function(w){ return haystack.indexOf(w) !== -1; });
    });
  }

  // Sort (skip when "relevance" — preserve Fuse.js best-match order)
  if(sort !== 'relevance') {
    var sortParts = sort.split('-');
    var sortKey = sortParts[0], sortDir = sortParts[1];
    results.sort(function(a,b){
      var va, vb;
      if(sortKey === 'priceSqft') {
        // Price per sqft — compute on the fly; listings without sqft go to end
        var aSqft = a.sqft || 0;
        var bSqft = b.sqft || 0;
        va = (aSqft > 0 && a.price) ? a.price / aSqft : 999999;
        vb = (bSqft > 0 && b.price) ? b.price / bSqft : 999999;
      } else if(sortKey === 'priceAcre') {
        // Price per acre — parse lot string; listings without lot go to end
        var aAcre = _parseLotAcres(a.lot);
        var bAcre = _parseLotAcres(b.lot);
        va = (aAcre > 0 && a.price) ? a.price / aAcre : 999999999;
        vb = (bAcre > 0 && b.price) ? b.price / bAcre : 999999999;
      } else {
        va = a[sortKey]||0; vb = b[sortKey]||0;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }

  // Apply spatial filter if a shape is drawn
  if(_srSpatialFilter) {
    results = results.filter(function(l){
      return l.lat && l.lng && _srSpatialFilter(l.lat, l.lng);
    });
  }

  // Update region title
  var region = 'Western NC';
  if(selectedAreas.length === 1) region = AREA_LABELS[selectedAreas[0]] || selectedAreas[0];
  else if(selectedAreas.length > 1) region = selectedAreas.length + ' Areas';
  document.getElementById('srRegion').textContent = region;

  // Update URL
  var params = new URLSearchParams();
  if(selectedAreas.length > 0) params.set('location', selectedAreas.join(','));
  if(type) params.set('type',type);
  if(price) params.set('price',price);
  if(beds) params.set('beds',beds);
  if(baths) params.set('baths',baths);
  if(restrict) params.set('restrictions',restrict);
  var hashStr = '#search' + (params.toString() ? '?' + params.toString() : '');
  history.replaceState({page:'search'},'',hashStr);

  // Store full filtered results (before viewport filtering)
  _srAllFilteredResults = results;
  _srCurrentResults = results;

  // Render map markers (all filtered results — clustering handles visibility)
  srRenderMarkers(results);

  // Render cards — always render immediately, then viewport filter can refine
  var _mapVisible = _srMap && !document.getElementById('srBody').classList.contains('map-hidden');
  if(_srSpatialFilter) {
    document.getElementById('srCount').textContent = results.length + ' listing' + (results.length!==1?'s':'');
    srRenderCards(results);
  } else if(_mapVisible) {
    // Map is visible — render viewport-filtered cards immediately
    // (don't rely solely on moveend, which may not fire if bounds don't change)
    var bounds = _srMap.getBounds();
    var inView = results.filter(function(l){
      return l.lat && l.lng && bounds.contains(L.latLng(l.lat, l.lng));
    });
    _srCurrentResults = inView;
    document.getElementById('srCount').textContent = inView.length + ' of ' + results.length + ' listing' + (results.length!==1?'s':'') + ' in view';
    srRenderCards(inView);
  } else {
    document.getElementById('srCount').textContent = results.length + ' listing' + (results.length!==1?'s':'');
    srRenderCards(results);
  }
}

function srRenderCards(results){
  var container = document.getElementById('srCards');
  container.innerHTML = '';

  if(results.length === 0){
    if(ALL_LISTINGS.length === 0 && MLS_GRID.enabled) {
      container.innerHTML = '<div class="sr-no-results"><div style="margin:0 auto 1rem;width:36px;height:36px;border:3px solid var(--gold);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style><p>Loading properties...</p></div>';
    } else {
      container.innerHTML = '<div class="sr-no-results"><h3>No Properties Found</h3><p>Try adjusting your filters, or contact Cory for off-market opportunities.</p><a href="tel:8285066413" class="btn-primary" style="display:inline-flex"><span>Call (828) 506-6413</span></a></div>';
    }
    return;
  }

  results.forEach(function(l, i){
    var card = document.createElement('div');
    card.className = 'sr-card';
    var lid = l.listingKey || l.mlsId || (l.address + '|' + l.city);
    card.setAttribute('data-lid', lid);

    var feats = l.type === 'Land'
      ? '<strong>' + l.lot + '</strong>'
      : '<span><strong>' + l.beds + '</strong> Bed</span><span><strong>' + l.baths + '</strong> Bath</span>' + (_hasSqftData(l) ? '<span><strong>' + _formatSqft(l) + '</strong> ' + _sqftLabel(l) + '</span>' : (l.lot ? '<span><strong>' + l.lot + '</strong> Lot</span>' : ''));

    var imgHtml = l.photo
      ? '<img src="' + l.photo + '" alt="' + l.address + '" loading="lazy">'
      : '<div style="width:100%;height:100%;background:var(--surface);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.55rem">Photo</div>';

    var badgeClass = l.type === 'Land' ? 'sr-card-badge land' : 'sr-card-badge';
    var statusTag = l.status === 'Under Contract' ? '<div class="card-status-tag">Under Contract</div>' : '';

    var srBrokerParts=[];if(l.listAgent)srBrokerParts.push(l.listAgent);if(l.listOffice)srBrokerParts.push(l.listOffice);
    var srMlsNums = _formatMlsNums(l);
    var srBrokerHtml=srBrokerParts.length?'<div class="sr-card-office">Listed by '+srBrokerParts.join(' &bull; ')+(srMlsNums?' | '+srMlsNums:'')+'</div>':'';
    // Value metric badge when sorting by price/sqft or price/acre
    var _curSort = (document.getElementById('srSort')||{}).value || '';
    var valueBadge = '';
    if(_curSort === 'priceSqft-asc' && l.sqft && l.sqft > 0 && l.price) {
      valueBadge = '<div class="sr-card-value">$' + Math.round(l.price / l.sqft).toLocaleString() + '/sqft</div>';
    } else if(_curSort === 'priceAcre-asc') {
      var _acres = _parseLotAcres(l.lot);
      if(_acres > 0 && l.price) valueBadge = '<div class="sr-card-value">$' + Math.round(l.price / _acres).toLocaleString() + '/acre</div>';
    }

    if(l.listingKey) card.setAttribute('data-lk', l.listingKey);
    card.innerHTML = '<div class="sr-card-img">' + imgHtml + '<div class="' + badgeClass + '">' + l.type + '</div>' + statusTag + cardFavHtml(l.address, l.city) + '</div>' +
      '<div class="sr-card-body">' +
        '<div class="sr-card-price">$' + l.price.toLocaleString() + valueBadge + '</div>' +
        '<div class="sr-card-addr">' + l.address + '</div>' +
        '<div class="sr-card-city">' + l.city + ', NC</div>' +
        '<div class="sr-card-feats">' + feats + '</div>' +
        srBrokerHtml +
      '</div>';

    (function(listing, listingId){
      card.onclick = function(){
        if(window._cardSwiped){window._cardSwiped=false;return;}
        try { openProp({price:listing.price,address:listing.address,type:listing.type,beds:listing.beds,baths:listing.baths,sqft:listing.sqft,sqftRange:listing.sqftRange||'',lot:listing.lot,restrictions:listing.restrictions||'unrestricted',status:listing.status||'Active',photo:listing.photo||null,photos:listing.photos||[],description:listing.description||'',listAgent:listing.listAgent||'',listOffice:listing.listOffice||'',listOfficePhone:listing.listOfficePhone||'',attributionContact:listing.attributionContact||'',mlsId:listing.mlsId||'',daysOnMarket:listing.daysOnMarket||0,listingKey:listing.listingKey||'',originatingSystem:listing.originatingSystem||'',mlsSources:listing.mlsSources||[]}, listing.city); } catch(err){console.error(err)}
      };
      card.onmouseenter = function(){ srHighlightMarkerById(listingId) };
      card.onmouseleave = function(){ srUnhighlightMarkerById(listingId) };
    })(l, lid);

    container.appendChild(card);
  });
}

function srRenderMarkers(results){
  if(!_srMap) return;

  // Clear existing markers
  if(_srClusterGroup) {
    _srClusterGroup.clearLayers();
  } else {
    _srMarkers.forEach(function(m){ _srMap.removeLayer(m) });
  }
  _srMarkers = [];
  _srMarkerMap = {};

  if(results.length === 0) return;

  var bounds = L.latLngBounds();
  var markersToAdd = [];

  results.forEach(function(l, i){
    if(!l.lat || !l.lng) return;

    var lid = l.listingKey || l.mlsId || (l.address + '|' + l.city);
    var priceLabel = l.price >= 1000000
      ? '$' + (l.price/1000000).toFixed(1) + 'M'
      : '$' + Math.round(l.price/1000) + 'K';

    var icon = L.divIcon({
      className: 'sr-price-marker-wrap',
      html: '<div class="sr-price-marker" data-lid="' + lid + '">' + priceLabel + '</div>',
      iconSize: null,
      iconAnchor: [30, 36]
    });

    var marker = L.marker([l.lat, l.lng], {icon: icon});
    marker._lid = lid; // Store listing ID on marker

    // Popup
    var feats = l.type === 'Land'
      ? l.lot
      : l.beds + ' Bed · ' + l.baths + ' Bath · ' + (_hasSqftData(l) ? _formatSqft(l) + ' ' + _sqftLabel(l) : (l.lot || ''));

    var popupImg = l.photo
      ? '<img class="sr-popup-img" src="' + l.photo + '" alt="' + l.address + '">'
      : '<div style="width:100%;height:110px;background:var(--surface);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.6rem">Property Photo</div>';

    var popBroker = l.listOffice ? '<div class="sr-popup-office">Listed by ' + l.listOffice + '</div>' : '';
    var popupHtml = '<div class="sr-popup-inner">' +
      popupImg +
      '<div class="sr-popup-body">' +
        '<div class="sr-popup-price">$' + l.price.toLocaleString() + '</div>' +
        '<div class="sr-popup-addr">' + l.address + '</div>' +
        '<div class="sr-popup-city">' + l.city + ', NC</div>' +
        '<div class="sr-popup-feats">' + feats + '</div>' +
        popBroker +
        '<button class="sr-popup-btn" onclick="event.stopPropagation();srOpenFromMapById(\'' + lid.replace(/'/g,"\\'") + '\')">View Details</button>' +
      '</div></div>';

    marker.bindPopup(popupHtml, {className:'sr-popup', maxWidth:220, minWidth:220, closeButton:false});

    // Hover: highlight corresponding card by ID
    (function(listingId){
      marker.on('mouseover', function(){ srHighlightCardById(listingId) });
      marker.on('mouseout', function(){ srUnhighlightCardById(listingId) });
    })(lid);

    _srMarkers.push(marker);
    _srMarkerMap[lid] = marker;
    markersToAdd.push(marker);
    bounds.extend([l.lat, l.lng]);
  });

  // Add all markers at once (clustering handles batching)
  if(_srClusterGroup) {
    _srClusterGroup.addLayers(markersToAdd);
  } else {
    markersToAdd.forEach(function(m){ m.addTo(_srMap); });
  }

  // Fit map to show all markers
  if(markersToAdd.length > 0){
    _srMap.fitBounds(bounds, {padding:[40,40], maxZoom:13});
  }
}

// Store filtered results for popup access
var _srCurrentResults = [];
function srOpenFromMap(idx){
  var l = _srCurrentResults[idx];
  if(!l) return;
  openProp({price:l.price,address:l.address,type:l.type,beds:l.beds,baths:l.baths,sqft:l.sqft,lot:l.lot,restrictions:l.restrictions||'unrestricted',status:l.status||'Active',photo:l.photo||null,photos:l.photos||[],description:l.description||'',listAgent:l.listAgent||'',listOffice:l.listOffice||'',listOfficePhone:l.listOfficePhone||'',attributionContact:l.attributionContact||'',mlsId:l.mlsId||'',daysOnMarket:l.daysOnMarket||0,listingKey:l.listingKey||'',originatingSystem:l.originatingSystem||'',mlsSources:l.mlsSources||[]}, l.city);
}
function srOpenFromMapById(lid){
  var l = _srAllFilteredResults.find(function(x){return (x.listingKey||x.mlsId||(x.address+'|'+x.city))===lid});
  if(!l) l = _srCurrentResults.find(function(x){return (x.listingKey||x.mlsId||(x.address+'|'+x.city))===lid});
  if(!l) return;
  openProp({price:l.price,address:l.address,type:l.type,beds:l.beds,baths:l.baths,sqft:l.sqft,lot:l.lot,restrictions:l.restrictions||'unrestricted',status:l.status||'Active',photo:l.photo||null,photos:l.photos||[],description:l.description||'',listAgent:l.listAgent||'',listOffice:l.listOffice||'',listOfficePhone:l.listOfficePhone||'',attributionContact:l.attributionContact||'',mlsId:l.mlsId||'',daysOnMarket:l.daysOnMarket||0,listingKey:l.listingKey||'',originatingSystem:l.originatingSystem||'',mlsSources:l.mlsSources||[]}, l.city);
}

// ═══ Card Image Swipe — carousel slide with peek (touch to browse photos) ═══
(function(){
  var _photoCache = {};  // listingKey → [url, ...]
  var _photoIdx = {};    // listingKey → current index
  var _swipe = null;     // active touch state
  var EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
  window._cardSwiped = false;

  function findImgAndKey(target){
    var el = target;
    while(el && !el.classList.contains('sr-card-img')){
      if(el.classList.contains('sr-cards')||el.classList.contains('sr-card-body')) return null;
      el = el.parentElement;
    }
    if(!el) return null;
    var card = el.closest('.sr-card');
    var key = card ? card.getAttribute('data-lk') : null;
    return key ? {el:el, key:key} : null;
  }

  function getPhotos(key){
    if(_photoCache[key]) return Promise.resolve(_photoCache[key]);
    return MLS_GRID.loadPhotos(key).then(function(photos){
      _photoCache[key] = photos && photos.length ? photos : [];
      return _photoCache[key];
    });
  }

  function renderDots(imgEl, key){
    var photos = _photoCache[key];
    if(!photos || photos.length <= 1) return;
    var idx = _photoIdx[key] || 0;
    var dots = imgEl.querySelector('.card-swipe-dots');
    if(!dots){
      dots = document.createElement('div');
      dots.className = 'card-swipe-dots';
      imgEl.appendChild(dots);
    }
    var n = Math.min(photos.length, 7);
    var html = '';
    for(var i=0; i<n; i++) html += '<span'+(i===idx?' class="active"':'')+'></span>';
    if(photos.length > 7) html += '<span class="more">…</span>';
    dots.innerHTML = html;
  }

  function cleanupPeek(imgEl){
    var p = imgEl.querySelector('.card-swipe-peek');
    if(p && p.parentNode) p.parentNode.removeChild(p);
  }

  // Create / reuse the peek image for the adjacent photo
  function ensurePeek(imgEl, key, dx){
    var photos = _photoCache[key];
    if(!photos || photos.length <= 1) return null;
    var cur = _photoIdx[key] || 0;
    var peekIdx = dx < 0 ? cur + 1 : cur - 1; // left drag → next; right → prev
    if(peekIdx < 0 || peekIdx >= photos.length) return null;
    var peek = imgEl.querySelector('.card-swipe-peek');
    if(!peek){
      peek = new Image();
      peek.className = 'card-swipe-peek';
      imgEl.appendChild(peek);
    }
    if(peek.src !== photos[peekIdx]) peek.src = photos[peekIdx];
    return peek;
  }

  // ─── Touch delegation ───
  document.addEventListener('touchstart', function(e){
    var ci = findImgAndKey(e.target);
    if(!ci) return;
    _swipe = {x:e.touches[0].clientX, y:e.touches[0].clientY, key:ci.key, el:ci.el, horizontal:false, decided:false, dx:0, peekSign:0};
    getPhotos(ci.key); // preload photo URLs
  }, {passive:true});

  document.addEventListener('touchmove', function(e){
    if(!_swipe) return;
    var dx = e.touches[0].clientX - _swipe.x;
    var dy = e.touches[0].clientY - _swipe.y;
    if(!_swipe.decided && (Math.abs(dx) > 8 || Math.abs(dy) > 8)){
      _swipe.decided = true;
      _swipe.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if(!_swipe.horizontal) return;
    e.preventDefault();
    _swipe.dx = dx;

    var imgEl = _swipe.el;
    var img = imgEl.querySelector('img:not(.card-swipe-peek)');
    if(!img) return;
    var w = imgEl.offsetWidth;

    // Current image follows finger
    img.style.transition = 'none';
    img.style.transform = 'translateX(' + dx + 'px)';

    // Rebuild peek if drag direction flipped
    var sign = dx < 0 ? -1 : 1;
    if(sign !== _swipe.peekSign){ cleanupPeek(imgEl); _swipe.peekSign = sign; }

    // Adjacent photo slides in from the edge
    var peek = ensurePeek(imgEl, _swipe.key, dx);
    if(peek){
      var offset = dx < 0 ? w : -w;
      peek.style.transition = 'none';
      peek.style.transform = 'translateX(' + (dx + offset) + 'px)';
    }
  }, {passive:false});

  document.addEventListener('touchend', function(e){
    if(!_swipe) return;
    var dx = e.changedTouches[0].clientX - _swipe.x;
    var key = _swipe.key;
    var imgEl = _swipe.el;
    var wasHorizontal = _swipe.horizontal;
    _swipe = null;

    var img = imgEl.querySelector('img:not(.card-swipe-peek)');
    if(!img || !wasHorizontal){ cleanupPeek(imgEl); return; }

    var w = imgEl.offsetWidth;
    var photos = _photoCache[key];
    var cur = _photoIdx[key] || 0;
    var advance = dx < 0 ? 1 : -1;
    var newIdx = cur + advance;
    var canComplete = photos && photos.length > 1 && newIdx >= 0 && newIdx < photos.length && Math.abs(dx) >= 40;

    if(canComplete){
      // ── Slide to completion ──
      window._cardSwiped = true;
      setTimeout(function(){window._cardSwiped=false;},350);
      _photoIdx[key] = newIdx;

      var peek = imgEl.querySelector('.card-swipe-peek');
      img.style.transition = 'transform 0.32s ' + EASE;
      img.style.transform = 'translateX(' + (advance > 0 ? -w : w) + 'px)';
      if(peek){
        peek.style.transition = 'transform 0.32s ' + EASE;
        peek.style.transform = 'translateX(0)';
      }
      setTimeout(function(){
        img.src = photos[newIdx];
        img.style.transform = '';
        img.style.transition = '';
        cleanupPeek(imgEl);
      }, 340);
      renderDots(imgEl, key);

    } else {
      // ── Elastic snap-back ──
      img.style.transition = 'transform 0.28s ' + EASE;
      img.style.transform = '';
      var peek = imgEl.querySelector('.card-swipe-peek');
      if(peek){
        peek.style.transition = 'transform 0.28s ' + EASE;
        peek.style.transform = 'translateX(' + (dx < 0 ? w : -w) + 'px)';
      }
      setTimeout(function(){
        img.style.transition = '';
        cleanupPeek(imgEl);
      }, 300);
    }
  });
})();

// ═══ ID-based marker/card highlight sync ═══
function srHighlightMarkerById(lid){
  var marker = _srMarkerMap[lid];
  if(!marker) return;
  var el = marker.getElement();
  if(el){
    var pm = el.querySelector('.sr-price-marker');
    if(pm) pm.classList.add('active');
  }
}
function srUnhighlightMarkerById(lid){
  var marker = _srMarkerMap[lid];
  if(!marker) return;
  var el = marker.getElement();
  if(el){
    var pm = el.querySelector('.sr-price-marker');
    if(pm) pm.classList.remove('active');
  }
}
function srHighlightCardById(lid){
  var card = document.querySelector('.sr-card[data-lid="' + lid + '"]');
  if(card) card.classList.add('highlighted');
}
function srUnhighlightCardById(lid){
  var card = document.querySelector('.sr-card[data-lid="' + lid + '"]');
  if(card) card.classList.remove('highlighted');
}
// Legacy index-based (kept for compatibility)
function srHighlightMarker(idx){ var m = _srMarkers[idx]; if(m) srHighlightMarkerById(m._lid); }
function srUnhighlightMarker(idx){ var m = _srMarkers[idx]; if(m) srUnhighlightMarkerById(m._lid); }
function srHighlightCard(idx){
  var cards = document.querySelectorAll('.sr-card');
  if(cards[idx]) cards[idx].classList.add('highlighted');
}
function srUnhighlightCard(idx){
  var cards = document.querySelectorAll('.sr-card');
  if(cards[idx]) cards[idx].classList.remove('highlighted');
}

// ═══ VIEWPORT-BASED CARD FILTERING ═══
function srFilterCardsByViewport(){
  if(!_srMap || !_srAllFilteredResults.length) return;
  if(_srSpatialFilter) return; // Drawing active — spatial filter controls cards
  if(document.getElementById('srBody').classList.contains('map-hidden')) return; // Map hidden on mobile — skip viewport filter
  var bounds = _srMap.getBounds();
  var inView = _srAllFilteredResults.filter(function(l){
    return l.lat && l.lng && bounds.contains(L.latLng(l.lat, l.lng));
  });
  _srCurrentResults = inView;
  document.getElementById('srCount').textContent = inView.length + ' of ' + _srAllFilteredResults.length + ' listing' + (_srAllFilteredResults.length!==1?'s':'') + ' in view';
  srRenderCards(inView);
}

// ═══ SPATIAL MATH ═══
function srPointInPolygon(lat, lng, verts){
  // Ray-casting algorithm
  var inside = false;
  for(var i = 0, j = verts.length - 1; i < verts.length; j = i++){
    var yi = verts[i][0], xi = verts[i][1];
    var yj = verts[j][0], xj = verts[j][1];
    var intersect = ((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if(intersect) inside = !inside;
  }
  return inside;
}

function srPointInCircle(lat, lng, cLat, cLng, radiusMeters){
  // Haversine distance
  var R = 6371000; // Earth radius in meters
  var dLat = (lat - cLat) * Math.PI / 180;
  var dLng = (lng - cLng) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(cLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
  var d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return d <= radiusMeters;
}

// ═══ DRAWING TOOLS ═══
function srApplySpatialFilter(){
  // Re-run full filter pipeline with spatial filter active
  srApplyFilters();
}

function srCancelDrawing(){
  if(_srDrawHandler) {
    _srDrawHandler.disable();
    _srDrawHandler = null;
  }
  _srFreedrawing = false;
  if(_srFreedrawLine) { _srMap.removeLayer(_srFreedrawLine); _srFreedrawLine = null; }
  _srMap.dragging.enable();
  _srMap.getContainer().style.cursor = '';
  document.querySelectorAll('.sr-draw-btn').forEach(function(b){b.classList.remove('active')});
}

function srStartRadius(){
  if(!_srMap || typeof L.Draw === 'undefined') return;
  srCancelDrawing();
  if(_srDrawnLayer) { _srMap.removeLayer(_srDrawnLayer); _srDrawnLayer = null; _srSpatialFilter = null; }
  _srDrawMode = 'radius';
  document.getElementById('srDrawRadius').classList.add('active');
  _srDrawHandler = new L.Draw.Circle(_srMap, {
    shapeOptions: { color: '#C4B08C', weight: 2, fillColor: '#C4B08C', fillOpacity: 0.12, dashArray: null }
  });
  _srDrawHandler.enable();
}

function srStartPolygon(){
  if(!_srMap || typeof L.Draw === 'undefined') return;
  srCancelDrawing();
  if(_srDrawnLayer) { _srMap.removeLayer(_srDrawnLayer); _srDrawnLayer = null; _srSpatialFilter = null; }
  _srDrawMode = 'polygon';
  document.getElementById('srDrawPolygon').classList.add('active');
  _srDrawHandler = new L.Draw.Polygon(_srMap, {
    shapeOptions: { color: '#C4B08C', weight: 2, fillColor: '#C4B08C', fillOpacity: 0.12 },
    showArea: false
  });
  _srDrawHandler.enable();
}

function srStartFreedraw(){
  if(!_srMap) return;
  srCancelDrawing();
  if(_srDrawnLayer) { _srMap.removeLayer(_srDrawnLayer); _srDrawnLayer = null; _srSpatialFilter = null; }
  _srDrawMode = 'freedraw';
  _srFreedrawing = true;
  _srFreedrawPoints = [];
  document.getElementById('srDrawFree').classList.add('active');
  _srMap.dragging.disable();
  _srMap.getContainer().style.cursor = 'crosshair';
}

function srHandleDrawCreated(e){
  var layer = e.layer;
  if(_srDrawnLayer) { _srMap.removeLayer(_srDrawnLayer); }
  _srDrawnLayer = layer;
  layer.setStyle({ color: '#C4B08C', weight: 2, fillColor: '#C4B08C', fillOpacity: 0.12 });
  _srMap.addLayer(layer);
  _srDrawHandler = null;

  if(e.layerType === 'circle') {
    var center = layer.getLatLng();
    var radius = layer.getRadius();
    _srSpatialFilter = function(lat, lng) { return srPointInCircle(lat, lng, center.lat, center.lng, radius); };
  } else if(e.layerType === 'polygon') {
    var latlngs = layer.getLatLngs()[0];
    var verts = latlngs.map(function(p){return [p.lat, p.lng]});
    _srSpatialFilter = function(lat, lng) { return srPointInPolygon(lat, lng, verts); };
  }

  srApplySpatialFilter();
  document.getElementById('srDrawClear').style.display = '';
  document.querySelectorAll('.sr-draw-btn').forEach(function(b){b.classList.remove('active')});
  if(_srDrawMode === 'radius') document.getElementById('srDrawRadius').classList.add('active');
  else if(_srDrawMode === 'polygon') document.getElementById('srDrawPolygon').classList.add('active');
}

function srClearDrawing(){
  srCancelDrawing();
  if(_srDrawnLayer) { _srMap.removeLayer(_srDrawnLayer); _srDrawnLayer = null; }
  _srSpatialFilter = null;
  _srDrawMode = null;
  document.getElementById('srDrawClear').style.display = 'none';
  srApplyFilters(); // Restore full dropdown-filtered results
}

function srClearFilters(){
  setSelectedAreas([]);
  document.getElementById('srfTypeSelect').value = '';
  document.getElementById('srfPriceSelect').value = '';
  document.getElementById('srfBedsSelect').value = '';
  document.getElementById('srfBathsSelect').value = '';
  document.getElementById('srfRestrictSelect').value = '';
  var srText = document.getElementById('srfTextQuery');
  if(srText) srText.value = '';
  var hsText = document.getElementById('hsTextQuery');
  if(hsText) hsText.value = '';
  srClearDrawing(); // Also clear any drawn shapes
}

// Save current search filters from search results topbar
async function saveCurrentSearch() {
  if(!_acctLoggedIn) { openAcctModal(); return; }
  if(!_sb || !_currentUser) return;
  // Read current filter state from DOM
  var locations = [];
  var locCheckboxes = document.querySelectorAll('#srfLocDropdown input[type="checkbox"]:checked');
  locCheckboxes.forEach(function(cb){ locations.push(cb.value); });
  var type = document.getElementById('srfTypeSelect') ? document.getElementById('srfTypeSelect').value : '';
  var price = document.getElementById('srfPriceSelect') ? document.getElementById('srfPriceSelect').value : '';
  var beds = document.getElementById('srfBedsSelect') ? document.getElementById('srfBedsSelect').value : '';
  var baths = document.getElementById('srfBathsSelect') ? document.getElementById('srfBathsSelect').value : '';
  var restrict = document.getElementById('srfRestrictSelect') ? document.getElementById('srfRestrictSelect').value : '';
  var textQuery = document.getElementById('srfTextQuery') ? document.getElementById('srfTextQuery').value : '';
  var filters = {locations: locations, type: type, price: price, beds: beds, baths: baths, restrictions: restrict, textQuery: textQuery};
  // Build name
  var parts = [];
  if(locations.length && locations.length <= 3) parts.push(locations.join(', '));
  else if(locations.length > 3) parts.push(locations.length + ' areas');
  if(type) parts.push(type);
  if(price) {
    var pp = price.split('-');
    if(pp[0]==='0'&&pp[1]) parts.push('Under $' + (parseInt(pp[1])/1000) + 'K');
    else if(pp[1]&&parseInt(pp[1])>9999999) parts.push('$' + (parseInt(pp[0])/1000000) + 'M+');
    else if(pp[0]&&pp[1]) parts.push('$' + (parseInt(pp[0])/1000) + 'K-$' + (parseInt(pp[1])/1000) + 'K');
  }
  if(beds) parts.push(beds + '+ beds');
  if(baths) parts.push(baths + '+ baths');
  if(textQuery) parts.push('"' + textQuery + '"');
  var searchName = parts.join(', ') || 'Custom Search';
  var btn = document.getElementById('srSaveSearchBtn');
  try {
    if(btn) { btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg> Saving...'; btn.disabled = true; }
    await _sb.from('saved_searches').insert({user_id: _currentUser.id, search_name: searchName, filters: filters, notify_email: true});
    showToast('Search saved! You\'ll get alerts for new matches.', 'success');
    if(btn) { btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg> Saved!'; }
    setTimeout(function(){ if(btn) { btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg> Save Search'; btn.disabled = false; } }, 3000);
  } catch(e) {
    console.warn('[Search] Save error:', e);
    showToast('Failed to save search', 'error');
    if(btn) { btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg> Save Search'; btn.disabled = false; }
  }
}

// Mobile view toggle
function srToggleView(){
  var body = document.getElementById('srBody');
  var label = document.getElementById('srToggleLabel');
  var icon = document.getElementById('srToggleIcon');
  if(_srMobileView === 'list'){
    body.classList.remove('map-hidden');
    body.classList.add('list-hidden');
    label.textContent = 'Show List';
    icon.innerHTML = '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>';
    _srMobileView = 'map';
    if(_srMap) _srMap.invalidateSize();
  } else {
    body.classList.remove('list-hidden');
    body.classList.add('map-hidden');
    label.textContent = 'Show Map';
    icon.innerHTML = '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>';
    _srMobileView = 'list';
    // Re-render cards showing all filtered results (no viewport filter when map hidden)
    if(_srAllFilteredResults.length) {
      _srCurrentResults = _srAllFilteredResults;
      document.getElementById('srCount').textContent = _srAllFilteredResults.length + ' listing' + (_srAllFilteredResults.length!==1?'s':'');
      srRenderCards(_srAllFilteredResults);
    }
  }
}

// Update map tiles when theme changes
var _origToggleTheme = toggleTheme;
toggleTheme = function(){
  _origToggleTheme();
  // Update map tiles if search is open
  if(_srMap && window._srTileLayer){
    var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    _srMap.removeLayer(window._srTileLayer);
    window._srTileLayer = L.tileLayer(isDark ? window._srDarkTiles : window._srLightTiles, {
      attribution:'&copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom:18,
      keepBuffer:5,
      updateWhenZooming:false,
      updateWhenIdle:true
    }).addTo(_srMap);
  }
  // Update search overlay theme toggle icons
  var searchOv = document.getElementById('searchOverlay');
  if(searchOv){
    var theme = document.documentElement.getAttribute('data-theme');
    searchOv.querySelectorAll('.prop-toggle-sun').forEach(function(el){el.style.display=theme==='light'?'inline':'none'});
    searchOv.querySelectorAll('.prop-toggle-moon').forEach(function(el){el.style.display=theme==='dark'?'inline':'none'});
  }
};

// ═══ REWIRE HERO SEARCH ═══

// Escape key to close search
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){
    var searchOv = document.getElementById('searchOverlay');
    if(searchOv && searchOv.classList.contains('active')){
      // Don't close if property page or lightbox is open on top
      var propOv = document.getElementById('propOverlay');
      var lb = document.getElementById('propLightbox');
      if((propOv && propOv.classList.contains('active')) || (lb && lb.classList.contains('open'))) return;
      closeSearch();
    }
  }
});

// Mobile: default to list view
(function(){
  var body = document.getElementById('srBody');
  if(body && window.innerWidth <= 900){
    body.classList.add('map-hidden');
  }
})();
// ═══════════════════════════════════════════════════
// ACCOUNT / GATING / FAVORITES / VIEWED STATES
// ═══════════════════════════════════════════════════

// ═══ SUPABASE INIT ═══
var SUPABASE_URL = 'https://kzaabnnwjupjqvydiqlz.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA';
var _sb = null;
try { _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'cc-supabase-auth',
    storage: window.localStorage
  }
}); } catch(e){ console.warn('[Supabase] Could not init:', e); }

// ═══ LOAD REVIEWS FROM SUPABASE ═══
(function(){
  var grid = document.getElementById('reviewsGrid');
  if(!grid || !_sb) return;
  var starSvg = '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  var stars5 = starSvg+starSvg+starSvg+starSvg+starSvg;

  function renderReviews(reviews){
    if(!reviews || reviews.length === 0) return; // keep fallback HTML
    grid.innerHTML = '';
    reviews.forEach(function(r){
      var initials = (r.reviewer_name||'').split(' ').map(function(w){return w[0]}).join('').toUpperCase().slice(0,2);
      var source = r.source || 'Google';
      var card = document.createElement('div');
      card.className = 'test-card reveal vis';
      card.innerHTML = '<div class="test-quote">&ldquo;</div>' +
        '<div class="test-text">' + (r.review_text||'') + '</div>' +
        '<div class="test-author"><div class="test-avatar">' + initials + '</div><div>' +
        '<div class="test-name">' + (r.reviewer_name||'') + '</div>' +
        '<div class="test-source">' + source + '</div>' +
        '<div class="test-stars">' + stars5 + '</div>' +
        '</div></div>';
      grid.appendChild(card);
    });
    // Update stat counter
    _sb.from('reviews').select('id',{count:'exact',head:true}).eq('rating',5).eq('is_published',true).then(function(res){
      var statEl = document.getElementById('reviewStatNum');
      if(statEl && res.count != null){
        statEl.textContent = res.count + ' ★';
      }
    });
  }

  _sb.from('reviews')
    .select('*')
    .eq('rating', 5)
    .eq('is_published', true)
    .order('review_date', {ascending: false})
    .limit(9)
    .then(function(res){
      if(res.error){ console.warn('[Reviews]', res.error.message); return; }
      renderReviews(res.data);
    });
})();

// --- Account state ---
var _acctLoggedIn = false;
var _currentUser = null;

// --- Admin role check ---
async function checkAdminRole() {
  if(!_sb || !_currentUser) { _isAdmin = false; return; }
  try {
    var resp = await _sb.from('profiles').select('role').eq('id', _currentUser.id).single();
    if(resp.data && resp.data.role === 'admin') {
      _isAdmin = true;
      console.log('[Auth] Admin mode active');
    } else { _isAdmin = false; }
  } catch(e) { _isAdmin = false; }
  updateAcctUI();
}

// --- Viewed & favorited tracking ---
var _viewedProps = {};
var _favProps = {};
try {
  var vp = localStorage.getItem('cc-viewed');
  if(vp) _viewedProps = JSON.parse(vp);
} catch(e){}

function propKey(listing, city) {
  return (listing.address + '|' + (city||listing.city||'')).toLowerCase();
}

function saveViewed() { try{localStorage.setItem('cc-viewed',JSON.stringify(_viewedProps))}catch(e){} }
function saveFavs() { /* synced to cloud now — localStorage kept as cache */ try{localStorage.setItem('cc-favs',JSON.stringify(_favProps))}catch(e){} }

// --- Cloud favorites sync ---
async function loadFavoritesFromCloud() {
  if(!_sb || !_currentUser) return;
  try {
    var resp = await _sb.from('favorites').select('property_key').eq('user_id', _currentUser.id);
    if(resp.data) {
      _favProps = {};
      resp.data.forEach(function(f){ _favProps[f.property_key] = true; });
      saveFavs(); // cache locally
    }
  } catch(e){ console.warn('[Supabase] Load favs error:', e); }
}

async function saveFavToCloud(key, isFav) {
  if(!_sb || !_currentUser) return;
  try {
    if(isFav) {
      await _sb.from('favorites').upsert({ user_id: _currentUser.id, property_key: key });
    } else {
      await _sb.from('favorites').delete().eq('user_id', _currentUser.id).eq('property_key', key);
    }
  } catch(e){ console.warn('[Supabase] Save fav error:', e); }
}

// --- Auth initialization (runs on page load) ---
async function initSupabaseAuth() {
  if(!_sb) return;
  try {
    var sess = await _sb.auth.getSession();
    if(sess.data && sess.data.session) {
      _acctLoggedIn = true;
      _currentUser = sess.data.session.user;
      await loadFavoritesFromCloud();
      await loadActiveParty();
      if(_activeParty) await loadPartyFavorites();
      updateAcctUI();
      checkAdminRole();
    } else {
      // Session expired — try to refresh silently
      var refresh = await _sb.auth.refreshSession();
      if(refresh.data && refresh.data.session) {
        _acctLoggedIn = true;
        _currentUser = refresh.data.session.user;
        await loadFavoritesFromCloud();
        await loadActiveParty();
        if(_activeParty) await loadPartyFavorites();
        updateAcctUI();
        checkAdminRole();
        console.log('[Auth] Session refreshed successfully');
      }
    }
    // Listen for auth changes (login/logout/token refresh)
    _sb.auth.onAuthStateChange(function(event, session) {
      if(session && session.user) {
        _acctLoggedIn = true;
        _currentUser = session.user;
        if(event === 'SIGNED_IN') {
          loadFavoritesFromCloud(); loadActiveParty().then(function(){ if(_activeParty) loadPartyFavorites(); }); checkAdminRole(); checkReengagement(); checkPartyInvite();
          // Reset guest view counter on login
          _guestViewCount = 0;
          try { sessionStorage.removeItem('cc_guest_views'); } catch(e) {}
          // Remove guest preview banner if visible
          var gpb = document.getElementById('guestPreviewBanner');
          if(gpb) gpb.remove();
          // OAuth: create profile + lead for social login users
          _handleOAuthProfile(session);
          // Open pending property if user was gated (skip during smart signup flow)
          if(!_smartSignupInProgress) _openPendingProp();
        }
      } else if(event === 'SIGNED_OUT') {
        _acctLoggedIn = false;
        _currentUser = null;
        _isAdmin = false;
        _favProps = {};
        _activeParty = null;
        _partyNotes = {};
        _partyFavs = {};
        saveFavs();
      }
      // Don't log out on TOKEN_REFRESHED failures — keep cached state
      updateAcctUI();
    });
  } catch(e){ console.warn('[Supabase] Auth init error:', e); }
}
// Run auth check
initSupabaseAuth();

// ═══ SEARCH PARTY — Collaborative Home Search ═══
var _activeParty = null;   // {id, name, members: [{id, user_id, display_name, role, email}]}
var _partyNotes = {};      // {property_key: [{user_display_name, note_text, created_at, user_id}]}
var _partyFavs = {};       // {property_key: [{user_id, user_display_name}]}
var PARTY_COLORS = ['#C4B08C','#7B9E89','#A67C7C','#8B7BB8','#C49058'];

function getPartyColor(memberId) {
  if(!_activeParty || !_activeParty.members) return PARTY_COLORS[0];
  var idx = _activeParty.members.findIndex(function(m){ return m.user_id === memberId || m.id === memberId; });
  return PARTY_COLORS[(idx >= 0 ? idx : 0) % PARTY_COLORS.length];
}

function getInitials(name) {
  if(!name) return '?';
  var parts = name.trim().split(/\s+/);
  if(parts.length >= 2) return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
  return parts[0].substring(0,2).toUpperCase();
}

function timeAgo(dateStr) {
  var d = new Date(dateStr);
  var now = new Date();
  var diff = Math.floor((now - d) / 1000);
  if(diff < 60) return 'just now';
  if(diff < 3600) return Math.floor(diff/60) + 'm ago';
  if(diff < 86400) return Math.floor(diff/3600) + 'h ago';
  if(diff < 604800) return Math.floor(diff/86400) + 'd ago';
  return d.toLocaleDateString('en-US', {month:'short', day:'numeric'});
}

async function loadActiveParty() {
  if(!_sb || !_currentUser) { _activeParty = null; return; }
  try {
    // Find user's active party membership
    var {data: memberships} = await _sb.from('search_party_members')
      .select('party_id, role, display_name')
      .eq('user_id', _currentUser.id)
      .eq('status', 'active');
    if(!memberships || !memberships.length) { _activeParty = null; return; }
    var partyId = memberships[0].party_id;
    // Load party info
    var {data: party} = await _sb.from('search_parties').select('id, name').eq('id', partyId).single();
    if(!party) { _activeParty = null; return; }
    // Load all active members
    var {data: members} = await _sb.from('search_party_members')
      .select('id, user_id, display_name, role, email, status')
      .eq('party_id', partyId)
      .eq('status', 'active');
    _activeParty = {id: party.id, name: party.name, members: members || []};
    console.log('[Party] Active party loaded:', _activeParty.name, 'with', _activeParty.members.length, 'members');
  } catch(e) { console.warn('[Party] Load error:', e); _activeParty = null; }
}

async function loadPartyFavorites() {
  if(!_sb || !_activeParty) { _partyFavs = {}; return; }
  try {
    var {data} = await _sb.from('search_party_favorites')
      .select('property_key, user_id, property_data')
      .eq('party_id', _activeParty.id);
    _partyFavs = {};
    if(data) {
      data.forEach(function(f) {
        if(!_partyFavs[f.property_key]) _partyFavs[f.property_key] = [];
        var member = _activeParty.members.find(function(m){ return m.user_id === f.user_id; });
        _partyFavs[f.property_key].push({
          user_id: f.user_id,
          user_display_name: member ? member.display_name : 'Party member'
        });
      });
    }
  } catch(e) { console.warn('[Party] Load favs error:', e); }
}

async function loadPartyNotes(propertyKey) {
  if(!_sb || !_activeParty) return [];
  try {
    var {data} = await _sb.from('search_party_notes')
      .select('id, user_id, note_text, user_display_name, created_at')
      .eq('party_id', _activeParty.id)
      .eq('property_key', propertyKey)
      .order('created_at', {ascending: true});
    var notes = data || [];
    _partyNotes[propertyKey] = notes;
    return notes;
  } catch(e) { console.warn('[Party] Load notes error:', e); return []; }
}

async function sendPartyNote(propertyKey) {
  if(!_sb || !_activeParty || !_currentUser) return;
  var ta = document.getElementById('partyNoteInput');
  if(!ta) return;
  var text = ta.value.trim();
  if(!text) return;
  // Get display name
  var me = _activeParty.members.find(function(m){ return m.user_id === _currentUser.id; });
  var displayName = me ? me.display_name : 'You';
  // Optimistic UI — append immediately
  var note = {
    id: 'temp-' + Date.now(),
    user_id: _currentUser.id,
    note_text: text,
    user_display_name: displayName,
    created_at: new Date().toISOString()
  };
  if(!_partyNotes[propertyKey]) _partyNotes[propertyKey] = [];
  _partyNotes[propertyKey].push(note);
  renderPartyTranscript(propertyKey);
  ta.value = '';
  // Insert to database
  try {
    await _sb.from('search_party_notes').insert({
      party_id: _activeParty.id,
      user_id: _currentUser.id,
      property_key: propertyKey,
      note_text: text,
      user_display_name: displayName
    });
    logActivity('party_note', propertyKey, {});
    // Notify other party members (fire-and-forget)
    var listing = window._currentListing;
    var addr = listing ? listing.address : propertyKey.split('|')[0];
    notifyPartyMembers('note', addr, text, propertyKey);
  } catch(e) { console.warn('[Party] Send note error:', e); }
}

function renderPartyTranscript(propertyKey) {
  var container = document.getElementById('partyTranscript');
  if(!container) return;
  var notes = _partyNotes[propertyKey] || [];
  if(!notes.length) {
    container.innerHTML = '<div class="party-empty-notes">No notes yet. Be the first to share your thoughts!</div>';
    return;
  }
  var html = '';
  notes.forEach(function(n) {
    var isMe = _currentUser && n.user_id === _currentUser.id;
    var color = getPartyColor(n.user_id);
    var initials = getInitials(n.user_display_name);
    html += '<div class="party-note' + (isMe ? ' mine' : '') + '">' +
      '<div class="party-note-avatar" style="background:' + color + '">' + initials + '</div>' +
      '<div class="party-note-body">' +
        '<div class="party-note-meta">' +
          '<span class="party-note-name">' + (n.user_display_name || 'Party member') + '</span>' +
          '<span class="party-note-time">' + timeAgo(n.created_at) + '</span>' +
        '</div>' +
        '<div class="party-note-text">' + n.note_text.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>' +
      '</div>' +
    '</div>';
  });
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

function notifyPartyMembers(actionType, propertyAddress, notePreview, propertyKey) {
  if(!_sb || !_activeParty || !_currentUser) return;
  var me = _activeParty.members.find(function(m){ return m.user_id === _currentUser.id; });
  var actorName = me ? me.display_name : 'A party member';
  try {
    var token = _sb.auth.session ? _sb.auth.session().access_token : '';
    if(!token) {
      _sb.auth.getSession().then(function(s) {
        if(s.data && s.data.session) {
          _doPartyNotify(s.data.session.access_token, actionType, actorName, propertyAddress, notePreview, propertyKey);
        }
      });
    } else {
      _doPartyNotify(token, actionType, actorName, propertyAddress, notePreview, propertyKey);
    }
  } catch(e) { console.warn('[Party] Notify error:', e); }
}

function _doPartyNotify(token, actionType, actorName, propertyAddress, notePreview, propertyKey) {
  fetch(SUPABASE_URL + '/functions/v1/party-notify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'apikey': SUPABASE_KEY
    },
    body: JSON.stringify({
      party_id: _activeParty.id,
      action_type: actionType,
      actor_name: actorName,
      property_address: propertyAddress,
      note_preview: notePreview || '',
      property_key: propertyKey || ''
    })
  }).catch(function(e){ console.warn('[Party] Notify fetch error:', e); });
}

async function createSearchParty(name) {
  if(!_sb || !_currentUser) return null;
  try {
    var prof = null;
    try { prof = JSON.parse(localStorage.getItem('cc_profile')); } catch(e){}
    var displayName = prof ? ((prof.firstName || '') + ' ' + (prof.lastName || '')).trim() : (_currentUser.email || '');
    var {data: party, error: pErr} = await _sb.from('search_parties').insert({
      name: name || 'Our Home Search',
      created_by: _currentUser.id
    }).select().single();
    if(pErr || !party) { console.error('[Party] Create error:', pErr); return null; }
    // Insert self as owner
    await _sb.from('search_party_members').insert({
      party_id: party.id,
      user_id: _currentUser.id,
      email: _currentUser.email,
      role: 'owner',
      status: 'active',
      display_name: displayName,
      joined_at: new Date().toISOString()
    });
    await loadActiveParty();
    return party;
  } catch(e) { console.error('[Party] Create error:', e); return null; }
}

async function inviteToParty(email) {
  if(!_sb || !_activeParty || !_currentUser) return {error: 'Not in a party'};
  try {
    var me = _activeParty.members.find(function(m){ return m.user_id === _currentUser.id; });
    var inviterName = me ? me.display_name : 'Someone';
    var sess = await _sb.auth.getSession();
    var token = sess.data && sess.data.session ? sess.data.session.access_token : SUPABASE_KEY;
    var res = await fetch(SUPABASE_URL + '/functions/v1/party-invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({
        party_id: _activeParty.id,
        invitee_email: email,
        inviter_name: inviterName
      })
    });
    var data = await res.json();
    return data;
  } catch(e) { return {error: String(e)}; }
}

async function acceptPartyInvite(token) {
  if(!_sb || !_currentUser) return false;
  try {
    // Find pending member by invite token
    var {data: member} = await _sb.from('search_party_members')
      .select('id, party_id')
      .eq('invite_token', token)
      .eq('status', 'pending')
      .single();
    if(!member) { console.warn('[Party] Invalid or expired invite token'); return false; }
    var prof = null;
    try { prof = JSON.parse(localStorage.getItem('cc_profile')); } catch(e){}
    var displayName = prof ? ((prof.firstName || '') + ' ' + (prof.lastName || '')).trim() : (_currentUser.email || '');
    // Update membership
    await _sb.from('search_party_members')
      .update({
        user_id: _currentUser.id,
        status: 'active',
        display_name: displayName,
        joined_at: new Date().toISOString()
      })
      .eq('id', member.id);
    // Load the party
    await loadActiveParty();
    await loadPartyFavorites();
    // Get party name for toast
    var partyName = _activeParty ? _activeParty.name : 'the Search Party';
    showToast('You\'ve joined ' + partyName + '!', 'success');
    return true;
  } catch(e) { console.error('[Party] Accept invite error:', e); return false; }
}

// Check for invite token on page load
function checkPartyInvite() {
  var params = new URLSearchParams(window.location.search);
  var inviteToken = params.get('invite');
  if(!inviteToken) {
    // Check sessionStorage for pending invite (stored before login)
    try { inviteToken = sessionStorage.getItem('cc_pending_invite'); } catch(e){}
  }
  if(!inviteToken) return;
  if(_acctLoggedIn && _currentUser) {
    // Accept invite immediately
    try { sessionStorage.removeItem('cc_pending_invite'); } catch(e){}
    acceptPartyInvite(inviteToken);
    // Clean up URL
    var url = new URL(window.location);
    url.searchParams.delete('invite');
    window.history.replaceState({}, '', url.toString());
  } else {
    // Store token and prompt login
    try { sessionStorage.setItem('cc_pending_invite', inviteToken); } catch(e){}
    // Show invite banner on account modal
    setTimeout(function() {
      window._partyInvitePending = true;
      openAcctModal();
    }, 500);
  }
}
// Run on page load
setTimeout(checkPartyInvite, 1000);

function showToast(msg, type) {
  var existing = document.getElementById('ccToast');
  if(existing) existing.remove();
  var t = document.createElement('div');
  t.id = 'ccToast';
  t.className = 'cc-toast' + (type === 'success' ? ' success' : type === 'error' ? ' error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(function(){ t.classList.add('show'); });
  setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 400); }, 3500);
}

// --- First-visit auth popup (scroll-triggered at 40% depth) ---
function maybeShowAuthPopup(){
  if(_acctLoggedIn) return;
  // Only show on homepage, not town pages
  if(_isTownPage) return;
  var dismissed=localStorage.getItem('cc_auth_popup_dismissed');
  if(dismissed){
    var ts=parseInt(dismissed,10);
    if(Date.now()-ts < 7*24*60*60*1000) return; // 7-day cooldown
  }
  var shown=false;
  window.addEventListener('scroll', function(){
    if(shown || _acctLoggedIn) return;
    var scrollPct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
    if(scrollPct >= 0.4){
      shown=true;
      showAuthPopup();
    }
  });
}
function showAuthPopup(){
  if(_acctLoggedIn) return;
  var el=document.getElementById('authPopup');
  if(el){ el.style.display=''; requestAnimationFrame(function(){ el.classList.add('visible'); }); }
}
function dismissAuthPopup(){
  var el=document.getElementById('authPopup');
  if(el){ el.classList.remove('visible'); setTimeout(function(){ el.style.display='none'; },400); }
  try{localStorage.setItem('cc_auth_popup_dismissed',Date.now().toString())}catch(e){}
  // After dismissing, try Google One Tap as a second chance
  setTimeout(initGoogleOneTap, 1000);
}
// Trigger popup after a brief delay for auth to initialize
setTimeout(maybeShowAuthPopup, 1500);

// --- Exit-Intent Popup (desktop only) ---
function showExitPopup(){
  if(_acctLoggedIn) return;
  if(sessionStorage.getItem('cc_exit_shown')) return;
  // Dismiss auth popup if visible (don't stack popups)
  var authEl = document.getElementById('authPopup');
  if(authEl && authEl.classList.contains('visible')) dismissAuthPopup();
  var el=document.getElementById('exitPopup');
  if(el){ el.style.display=''; requestAnimationFrame(function(){ el.classList.add('visible'); }); }
  try{sessionStorage.setItem('cc_exit_shown','1')}catch(e){}
}
function dismissExitPopup(){
  var el=document.getElementById('exitPopup');
  if(el){ el.classList.remove('visible'); setTimeout(function(){ el.style.display='none'; },400); }
}
// Exit-intent detection: mouseleave toward top of viewport
document.documentElement.addEventListener('mouseleave', function(e){
  if(e.clientY > 0) return; // Only trigger on top-exit (toward browser tabs/address bar)
  if(_acctLoggedIn) return;
  if(_guestViewCount < 1) return; // Only for users who have engaged
  if(sessionStorage.getItem('cc_exit_shown')) return; // 1-session cooldown
  showExitPopup();
});

// --- Google One Tap ---
function initGoogleOneTap(){
  if(_acctLoggedIn || typeof google === 'undefined' || !google.accounts) return;
  // Don't show if auth popup was recently dismissed (avoid double prompts)
  var dismissed = localStorage.getItem('cc_auth_popup_dismissed');
  if(dismissed && Date.now() - parseInt(dismissed,10) < 3600000) return; // 1hr cooldown after popup dismiss
  try {
    google.accounts.id.initialize({
      client_id: '878118307539-5vujunbk1fgoh7ctijfdjhdui8sf33fk.apps.googleusercontent.com',
      callback: handleGoogleOneTap,
      use_fedcm_for_prompt: true,
      auto_select: false,
      cancel_on_tap_outside: true
    });
    google.accounts.id.prompt();
  } catch(e) { console.warn('[OneTap] Init error:', e); }
}
async function handleGoogleOneTap(response){
  if(!_sb || !response.credential) return;
  try {
    var result = await _sb.auth.signInWithIdToken({
      provider: 'google',
      token: response.credential
    });
    if(result.error){
      console.error('[OneTap] Error:', result.error);
      return;
    }
    // onAuthStateChange will fire SIGNED_IN → _handleOAuthProfile creates profile + lead
    console.log('[OneTap] Success');
  } catch(e) { console.error('[OneTap] Error:', e); }
}
// Initialize Google One Tap after a delay (let auth state settle first)
setTimeout(function(){
  if(!_acctLoggedIn) initGoogleOneTap();
}, 3500);

// --- Account UI update ---
function updateAcctUI() {
  var btn = document.getElementById('navAcct');
  var label = document.getElementById('navAcctLabel');
  if(label) label.textContent = _isAdmin ? 'Admin' : (_acctLoggedIn ? 'My Account' : 'Sign In');
  if(btn) { if(_acctLoggedIn) btn.classList.add('logged-in'); else btn.classList.remove('logged-in'); }
  // Show/hide admin dashboard link in nav
  var adminLink = document.getElementById('navAdminLink');
  if(adminLink) adminLink.style.display = _isAdmin ? '' : 'none';
  // Show/hide notification bell
  var notifBell = document.getElementById('navNotifBell');
  if(notifBell) notifBell.style.display = _acctLoggedIn ? '' : 'none';
  if(_acctLoggedIn) loadNotificationCount();
  // Mirror state to mobile menu — toggle guest/user sections
  var mobileGuest = document.getElementById('mobileAcctGuest');
  var mobileUser = document.getElementById('mobileAcctUser');
  if(mobileGuest) mobileGuest.style.display = _acctLoggedIn ? 'none' : '';
  if(mobileUser) mobileUser.style.display = _acctLoggedIn ? '' : 'none';
  var mobileAdmin = document.getElementById('mobileMenuAdmin');
  if(mobileAdmin) mobileAdmin.style.display = _isAdmin ? '' : 'none';
  // Populate logged-in user info from profile cache
  if(_acctLoggedIn){
    try{
      var prof=JSON.parse(localStorage.getItem('cc_profile')||'{}');
      var nameEl=document.getElementById('mobileUserName');
      var emailEl=document.getElementById('mobileUserEmail');
      if(nameEl) nameEl.textContent=(prof.firstName||'')+' '+(prof.lastName||'')||'My Account';
      if(emailEl) emailEl.textContent=prof.email||'';
    }catch(e){}
  }
  // Unlock gated content
  document.querySelectorAll('.gated-wrap').forEach(function(el){
    if(_acctLoggedIn) el.classList.remove('locked');
    else el.classList.add('locked');
  });
  // Update dynamically gated features
  updateGatedFeatures();
  // Update restriction filters
  gateRestrictionFilters();
  // Hide consultation form account opt-in if logged in
  var ctaOpt = document.getElementById('ctaAcctOpt');
  if(ctaOpt) ctaOpt.style.display = _acctLoggedIn ? 'none' : '';
}

// --- Account modal ---
function openAcctModal() {
  var modal = document.getElementById('acctModal');
  if(!modal) return;
  _lockScroll(); // Lock background scroll
  if(_acctLoggedIn) {
    // Show account dashboard
    document.getElementById('acctFormView').style.display = 'none';
    document.getElementById('acctLoginView').style.display = 'none';
    document.getElementById('acctCompleteView').style.display = 'none';
    document.getElementById('acctSuccessView').style.display = 'none';
    document.getElementById('acctDashView').style.display = '';
    // Populate dashboard
    try {
      var prof = localStorage.getItem('cc_profile');
      if(prof) {
        var p = JSON.parse(prof);
        document.getElementById('acctDashName').textContent = (p.firstName||'') + ' ' + (p.lastName||'');
        document.getElementById('acctDashEmail').textContent = p.email || '';
      }
    } catch(e){}
    // Fav count
    var favCount = Object.keys(_favProps).filter(function(k){return _favProps[k]}).length;
    document.getElementById('acctFavCount').textContent = favCount ? favCount + ' saved propert' + (favCount===1?'y':'ies') : 'No favorites yet';
    // Load saved searches
    renderPartyDashboard();
    loadSavedSearchesUI();
    buildDashboardSuggestions();
    loadViewingHistoryUI();
    loadTimelineUI();
    // Show admin button if admin
    var adminBtn = document.getElementById('acctAdminBtn');
    if(adminBtn) adminBtn.style.display = _isAdmin ? '' : 'none';
    modal.classList.add('open');
    return;
  }
  document.getElementById('acctLoginView').style.display = '';
  document.getElementById('acctFormView').style.display = 'none';
  document.getElementById('acctCompleteView').style.display = 'none';
  document.getElementById('acctSuccessView').style.display = 'none';
  document.getElementById('acctDashView').style.display = 'none';
  clearAcctErrors();
  modal.classList.add('open');
  setTimeout(function(){ document.getElementById('acctLoginEmail').focus() }, 300);
}

function closeAcctModal() {
  var m=document.getElementById('acctModal');if(m)m.classList.remove('open');
  _unlockScroll(); // Restore background scroll
}

function signOutAcct() {
  if(_sb) _sb.auth.signOut();
  _acctLoggedIn = false;
  _currentUser = null;
  _isAdmin = false;
  _favProps = {};
  saveFavs();
  updateAcctUI();
  closeAcctModal();
}

function renderPartyDashboard() {
  var section = document.getElementById('partyDashSection');
  var container = document.getElementById('partyDashContent');
  if(!section || !container) return;

  if(!_activeParty) {
    // No party — show create button
    container.innerHTML =
      '<p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.75rem">Invite family or friends to search together. Share favorites, notes, and collaborate on finding the perfect home.</p>' +
      '<div id="partyCreateRow" style="display:flex;gap:0.5rem;align-items:center">' +
        '<input type="text" id="partyNameInput" placeholder="Party name (e.g. Our Home Search)" style="flex:1;padding:0.55rem 0.75rem;border-radius:6px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:0.82rem;font-family:Outfit,sans-serif">' +
        '<button onclick="handleCreateParty()" style="padding:0.55rem 1rem;border-radius:6px;border:none;background:var(--gold);color:var(--bg);cursor:pointer;font-size:0.75rem;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;white-space:nowrap">Create Party</button>' +
      '</div>';
    return;
  }

  // Has party — show management UI
  var membersHtml = '';
  var activeCount = 0;
  var pendingCount = 0;
  _activeParty.members.forEach(function(m) {
    if(m.status === 'active') activeCount++;
  });

  _activeParty.members.forEach(function(m, i) {
    var color = PARTY_COLORS[i % PARTY_COLORS.length];
    var initials = getInitials(m.display_name || m.email);
    var roleTag = m.role === 'owner' ? ' <span style="font-size:0.65rem;color:var(--gold)">(Owner)</span>' : '';
    var isMe = _currentUser && m.user_id === _currentUser.id;
    membersHtml +=
      '<div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0">' +
        '<div style="width:28px;height:28px;border-radius:50%;background:' + color + ';display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:700;color:#fff;flex-shrink:0">' + initials + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:0.82rem;color:var(--text)">' + (m.display_name || m.email) + roleTag + (isMe ? ' <span style="font-size:0.65rem;color:var(--text-muted)">(you)</span>' : '') + '</div>' +
        '</div>' +
      '</div>';
  });

  // Count party favorites and notes
  var favCount = Object.keys(_partyFavs).length;
  var noteCount = 0;
  Object.keys(_partyNotes).forEach(function(k){ noteCount += _partyNotes[k].length; });

  container.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem">' +
      '<div style="font-size:0.92rem;font-weight:600;color:var(--text)">' + _activeParty.name + '</div>' +
      '<div style="font-size:0.7rem;color:var(--text-muted)">' + activeCount + ' member' + (activeCount !== 1 ? 's' : '') + '</div>' +
    '</div>' +
    '<div style="margin-bottom:0.75rem">' + membersHtml + '</div>' +
    '<div style="display:flex;gap:0.75rem;margin-bottom:0.75rem;font-size:0.75rem;color:var(--text-muted)">' +
      '<span>' + favCount + ' shared favorite' + (favCount !== 1 ? 's' : '') + '</span>' +
      '<span>' + noteCount + ' note' + (noteCount !== 1 ? 's' : '') + '</span>' +
    '</div>' +
    '<div style="margin-bottom:0.5rem">' +
      '<div style="font-size:0.78rem;color:var(--text);margin-bottom:0.35rem;font-weight:500">Invite Someone</div>' +
      '<div style="display:flex;gap:0.4rem">' +
        '<input type="email" id="partyInviteEmail" placeholder="Email address" style="flex:1;padding:0.5rem 0.65rem;border-radius:6px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:0.8rem;font-family:Outfit,sans-serif">' +
        '<button id="partyInviteBtn" onclick="handlePartyInvite()" style="padding:0.5rem 0.85rem;border-radius:6px;border:none;background:var(--gold);color:var(--bg);cursor:pointer;font-size:0.72rem;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;white-space:nowrap">Send</button>' +
      '</div>' +
      '<div id="partyInviteMsg" style="font-size:0.72rem;margin-top:0.25rem;display:none"></div>' +
    '</div>';
}

async function handleCreateParty() {
  var input = document.getElementById('partyNameInput');
  var name = input ? input.value.trim() : '';
  var party = await createSearchParty(name || 'Our Home Search');
  if(party) {
    showToast('Search Party created!', 'success');
    renderPartyDashboard();
  } else {
    showToast('Failed to create party', 'error');
  }
}

async function handlePartyInvite() {
  var input = document.getElementById('partyInviteEmail');
  var msg = document.getElementById('partyInviteMsg');
  var btn = document.getElementById('partyInviteBtn');
  if(!input || !input.value.trim()) return;
  var email = input.value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if(msg) { msg.textContent = 'Please enter a valid email'; msg.style.color = '#c0392b'; msg.style.display = ''; }
    return;
  }
  if(btn) { btn.textContent = 'Sending...'; btn.disabled = true; }
  var result = await inviteToParty(email);
  if(result.success) {
    if(msg) { msg.textContent = 'Invite sent to ' + email + '!'; msg.style.color = 'var(--green,#27ae60)'; msg.style.display = ''; }
    input.value = '';
  } else {
    if(msg) { msg.textContent = result.error || 'Failed to send invite'; msg.style.color = '#c0392b'; msg.style.display = ''; }
  }
  if(btn) { btn.textContent = 'Send'; btn.disabled = false; }
}

async function loadSavedSearchesUI() {
  var container = document.getElementById('acctSavedSearches');
  container.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem">Loading...</p>';
  if(!_sb || !_currentUser) { container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Sign in to see saved searches</p>'; return; }
  try {
    var {data, error} = await _sb.from('saved_searches').select('*').eq('user_id', _currentUser.id).order('created_at', {ascending:false});
    if(error) throw error;
    if(!data || !data.length) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">No saved searches yet. Chat with our assistant to find properties and save your search!</p>';
      return;
    }
    container.innerHTML = '';
    data.forEach(function(s) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:0.5rem;margin-bottom:0.4rem;background:var(--card);border:1px solid var(--border);border-radius:6px;font-size:0.82rem';
      var info = document.createElement('div');
      info.style.cssText = 'flex:1;cursor:pointer';
      info.innerHTML = '<strong style="color:var(--text)">' + (s.search_name||'Custom Search') + '</strong><br><span style="color:var(--text-muted);font-size:0.75rem">' + (s.notify_email ? 'Alerts on' : 'Alerts off') + '</span>';
      info.onclick = function(){ openSearchResults(s.filters); closeAcctModal(); };
      var actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:0.3rem;align-items:center';
      // Toggle notifications
      var toggleBtn = document.createElement('button');
      toggleBtn.style.cssText = 'padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:transparent;cursor:pointer;font-size:0.7rem;color:var(--text-muted)';
      toggleBtn.textContent = s.notify_email ? 'Alerts On' : 'Alerts Off';
      toggleBtn.style.color = s.notify_email ? 'var(--green)' : 'var(--text-muted)';
      toggleBtn.onclick = function(){ toggleSearchNotify(s.id, !s.notify_email, toggleBtn); };
      // Delete
      var delBtn = document.createElement('button');
      delBtn.style.cssText = 'padding:4px 6px;border-radius:4px;border:1px solid var(--border);background:transparent;cursor:pointer;font-size:0.7rem;color:#c0392b';
      delBtn.textContent = 'X';
      delBtn.onclick = function(){ deleteSearchSaved(s.id, row); };
      actions.appendChild(toggleBtn);
      actions.appendChild(delBtn);
      row.appendChild(info);
      row.appendChild(actions);
      container.appendChild(row);
    });
  } catch(e) {
    console.warn('[Acct] Load saved searches error:', e);
    container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Could not load saved searches</p>';
  }
}

async function toggleSearchNotify(id, newValue, btn) {
  if(!_sb) return;
  try {
    await _sb.from('saved_searches').update({notify_email: newValue}).eq('id', id);
    btn.textContent = newValue ? 'Alerts On' : 'Alerts Off';
    btn.style.color = newValue ? 'var(--green)' : 'var(--text-muted)';
  } catch(e){ console.warn('[Acct] Toggle notify error:', e); }
}

async function deleteSearchSaved(id, rowEl) {
  if(!_sb) return;
  if(!confirm('Delete this saved search?')) return;
  try {
    await _sb.from('saved_searches').delete().eq('id', id);
    rowEl.remove();
  } catch(e){ console.warn('[Acct] Delete search error:', e); }
}

function showAcctLogin() {
  // Carry email from signup → login
  var signupEmail = document.getElementById('acctEmail');
  var loginEmail = document.getElementById('acctLoginEmail');
  if(signupEmail && loginEmail && signupEmail.value.trim()) {
    loginEmail.value = signupEmail.value.trim();
  }
  document.getElementById('acctFormView').style.display = 'none';
  document.getElementById('acctLoginView').style.display = '';
  document.getElementById('acctCompleteView').style.display = 'none';
  document.getElementById('acctSuccessView').style.display = 'none';
  document.getElementById('acctDashView').style.display = 'none';
  clearAcctErrors();
  // Focus password if email already filled, otherwise focus email
  var focusId = (loginEmail && loginEmail.value) ? 'acctLoginPass' : 'acctLoginEmail';
  setTimeout(function(){ document.getElementById(focusId).focus() }, 100);
}

function showAcctSignup() {
  // Carry email from login → signup
  var loginEmail = document.getElementById('acctLoginEmail');
  var signupEmail = document.getElementById('acctEmail');
  if(loginEmail && signupEmail && loginEmail.value.trim()) {
    signupEmail.value = loginEmail.value.trim();
  }
  document.getElementById('acctFormView').style.display = '';
  document.getElementById('acctLoginView').style.display = 'none';
  document.getElementById('acctCompleteView').style.display = 'none';
  document.getElementById('acctSuccessView').style.display = 'none';
  document.getElementById('acctDashView').style.display = 'none';
  clearAcctErrors();
  // Ensure OAuth buttons exist in signup view (browser HTML parsing can strip them from innerHTML)
  var fv = document.getElementById('acctFormView');
  if(fv && !fv.querySelector('.acct-oauth-btns')) {
    var sub = fv.querySelector('.acct-modal-sub');
    if(sub) {
      var oauthDiv = document.createElement('div');
      oauthDiv.className = 'acct-oauth-btns';
      oauthDiv.innerHTML = '<button class="acct-oauth-btn acct-oauth-google" onclick="signInWithGoogle()"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"></path><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"></path><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path></svg> Continue with Google</button>' +
        '<button class="acct-oauth-btn acct-oauth-facebook" onclick="signInWithFacebook()"><svg viewBox="0 0 24 24" width="18" height="18" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"></path></svg> Continue with Facebook</button>';
      var orDiv = document.createElement('div');
      orDiv.className = 'acct-or';
      orDiv.innerHTML = '&mdash; or sign up with email &mdash;';
      sub.after(oauthDiv, orDiv);
    }
  }
  // Focus email field (first field in 2-step signup)
  var focusEl = document.getElementById('acctEmail');
  if(focusEl && !focusEl.value) setTimeout(function(){ focusEl.focus() }, 100);
}

// --- Smart signup completion (desktop) ---
function showAcctComplete(email) {
  document.getElementById('acctLoginView').style.display = 'none';
  document.getElementById('acctFormView').style.display = 'none';
  document.getElementById('acctCompleteView').style.display = '';
  document.getElementById('acctSuccessView').style.display = 'none';
  document.getElementById('acctDashView').style.display = 'none';
  clearAcctErrors();
  var emailEl = document.getElementById('acctCompleteEmail');
  if(emailEl) emailEl.textContent = email;
  setTimeout(function(){ document.getElementById('acctCompleteFirst').focus() }, 100);
}

async function completeAcctSetup() {
  var first = document.getElementById('acctCompleteFirst').value.trim();
  var last = document.getElementById('acctCompleteLast').value.trim();
  clearAcctErrors();
  if(!first){ document.getElementById('acctCompleteFirst').focus(); document.getElementById('acctCompleteFirst').style.borderColor='#c07070'; return; }
  // Last name is optional
  var btn = document.querySelector('#acctCompleteView .acct-submit');
  btn.textContent = 'Finishing...'; btn.disabled = true;
  var email = (document.getElementById('acctCompleteEmail').textContent || '').trim();
  try {
    if(_sb && _currentUser) {
      await _sb.from('profiles').insert({ id: _currentUser.id, first_name: first, last_name: last, email: email });
      var leadData = { first_name: first, last_name: last, email: email, source: 'smart_signup', message: 'Account created via smart login flow' };
      if(!_chatLeadPushed && typeof convHistory !== 'undefined' && convHistory && convHistory.length > 0){
        var transcript = buildChatTranscript();
        if(transcript){ leadData.message += '\n\n' + transcript; leadData.source = 'chatbot_smart_signup'; }
      }
      _sb.from('leads').insert(leadData)
        .then(function(){ _chatLeadPushed = true; console.log('[SmartSignup] Lead saved'); _pushToFUB(leadData); })
        .catch(function(e){ console.warn('[SmartSignup] Lead push failed:', e); });
    }
    _acctLoggedIn = true;
    _smartSignupInProgress = false;
    try{ localStorage.setItem('cc_profile', JSON.stringify({firstName:first, lastName:last, email:email, password:true})) }catch(e){}
    document.getElementById('acctCompleteView').style.display = 'none';
    document.getElementById('acctSuccessView').style.display = '';
    updateAcctUI();
    if(_pendingProp){
      setTimeout(function(){ closeAcctModal(); openProp(_pendingProp.listing, _pendingProp.townName); _pendingProp = null; }, 1200);
    } else {
      setTimeout(function(){ closeAcctModal() }, 2000);
    }
  } catch(e) {
    showAcctError('acctCompleteError', 'Something went wrong. Please try again.');
    btn.textContent = 'Get Free Access'; btn.disabled = false;
    _smartSignupInProgress = false;
  }
}

// --- Smart signup completion (mobile) ---
function showMobileComplete(email) {
  document.getElementById('mobileLoginFields').style.display = 'none';
  document.getElementById('mobileSignupFields').style.display = 'none';
  document.getElementById('mobileCompleteFields').style.display = '';
  _clearMobileErrors();
  var emailEl = document.getElementById('mobileCompleteEmail');
  if(emailEl) emailEl.textContent = email;
  setTimeout(function(){ document.getElementById('mobileCompleteFirst').focus() }, 100);
}

async function mobileCompleteSignup() {
  _clearMobileErrors();
  var first = document.getElementById('mobileCompleteFirst').value.trim();
  var last = document.getElementById('mobileCompleteLast').value.trim();
  if(!first){ _showMobileError('mobileCompleteError', 'First name is required'); return; }
  // Last name is optional
  var btn = document.querySelector('#mobileCompleteFields .mobile-acct-submit');
  btn.textContent = 'Finishing...'; btn.disabled = true;
  var email = (document.getElementById('mobileCompleteEmail').textContent || '').trim();
  try {
    if(_sb && _currentUser) {
      await _sb.from('profiles').insert({ id: _currentUser.id, first_name: first, last_name: last, email: email });
      var leadData = { first_name: first, last_name: last, email: email, source: 'smart_signup_mobile', message: 'Account created via smart login flow (mobile)' };
      if(!_chatLeadPushed && typeof convHistory !== 'undefined' && convHistory && convHistory.length > 0){
        var transcript = buildChatTranscript();
        if(transcript){ leadData.message += '\n\n' + transcript; leadData.source = 'chatbot_smart_signup_mobile'; }
      }
      _sb.from('leads').insert(leadData)
        .then(function(){ _chatLeadPushed = true; _pushToFUB(leadData); })
        .catch(function(){});
    }
    _acctLoggedIn = true;
    _smartSignupInProgress = false;
    try{ localStorage.setItem('cc_profile', JSON.stringify({firstName:first, lastName:last, email:email, password:true})) }catch(e){}
    updateAcctUI(); checkAdminRole();
    btn.textContent = 'Get Free Access'; btn.disabled = false;
    // Reset form
    document.getElementById('mobileCompleteFields').style.display = 'none';
    document.getElementById('mobileLoginFields').style.display = '';
    document.getElementById('mobileLoginEmail').value = '';
    document.getElementById('mobileLoginPass').value = '';
    // Open pending property if gated
    if(_pendingProp){ closeMobile(); setTimeout(function(){ openProp(_pendingProp.listing, _pendingProp.townName); _pendingProp = null; }, 600); }
  } catch(e) {
    _showMobileError('mobileCompleteError', 'Something went wrong. Please try again.');
    btn.textContent = 'Get Free Access'; btn.disabled = false;
    _smartSignupInProgress = false;
  }
}

function clearAcctErrors() {
  var errs = document.querySelectorAll('.acct-error');
  errs.forEach(function(el){ el.style.display = 'none'; el.textContent = ''; });
}

function showAcctError(id, msg) {
  var el = document.getElementById(id);
  if(el) { el.textContent = msg; el.style.display = 'block'; }
}

function closeAcctModal() {
  var m=document.getElementById('acctModal');if(m)m.classList.remove('open');
  _unlockScroll(); // Restore background scroll
}

// --- Create account Step 1: Email + Password (Supabase) ---
async function submitAcct() {
  var email = document.getElementById('acctEmail').value.trim();
  var pass = document.getElementById('acctPass').value;
  clearAcctErrors();
  // Validate required fields
  if(!email || email.indexOf('@')<1){ document.getElementById('acctEmail').focus(); document.getElementById('acctEmail').style.borderColor='#c07070'; return; }
  if(!pass || pass.length < 6){ document.getElementById('acctPass').focus(); document.getElementById('acctPass').style.borderColor='#c07070'; return; }

  // Disable button while working
  var btn = document.querySelector('#acctFormView .acct-submit');
  btn.textContent = 'Creating Account...';
  btn.disabled = true;

  if(!_sb) { showAcctError('acctSignupError', 'Service unavailable. Please try again later.'); btn.textContent='Continue'; btn.disabled=false; return; }

  try {
    _smartSignupInProgress = true;
    var result = await _sb.auth.signUp({ email: email, password: pass });
    if(result.error) {
      _smartSignupInProgress = false;
      var errMsg = result.error.message;
      if(errMsg.indexOf('already registered') > -1) errMsg = 'This email already has an account. Try signing in instead.';
      showAcctError('acctSignupError', errMsg);
      btn.textContent = 'Continue';
      btn.disabled = false;
      return;
    }
    // Signup succeeded — save user, show Step 2 (name collection)
    if(result.data && result.data.user) {
      _currentUser = result.data.user;
    }
    btn.textContent = 'Continue';
    btn.disabled = false;
    showAcctComplete(email);
    setTimeout(function(){ _smartSignupInProgress = false; }, 30000);
  } catch(e) {
    _smartSignupInProgress = false;
    showAcctError('acctSignupError', 'Something went wrong. Please try again.');
    btn.textContent = 'Continue';
    btn.disabled = false;
  }
}

// --- OAuth: Google & Facebook Sign-In ---
async function signInWithGoogle(){
  if(!_sb) return;
  // Persist pending property across redirect
  if(_pendingProp) try{localStorage.setItem('cc_pending_prop',JSON.stringify(_pendingProp))}catch(e){}
  try{
    await _sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+window.location.pathname}});
  }catch(e){console.error('[OAuth] Google error:',e)}
}
async function signInWithFacebook(){
  if(!_sb) return;
  if(_pendingProp) try{localStorage.setItem('cc_pending_prop',JSON.stringify(_pendingProp))}catch(e){}
  try{
    await _sb.auth.signInWithOAuth({provider:'facebook',options:{redirectTo:window.location.origin+window.location.pathname}});
  }catch(e){console.error('[OAuth] Facebook error:',e)}
}

// --- OAuth profile + lead creation for social logins ---
async function _handleOAuthProfile(session){
  if(!session||!session.user||!_sb) return;
  var meta=session.user.user_metadata;
  if(!meta) return;
  // Only process if user has OAuth metadata (full_name from Google/Facebook)
  var fullName=meta.full_name||meta.name||'';
  if(!fullName) return;
  try{
    // Check if profile already exists — skip if so
    var existing=await _sb.from('profiles').select('id').eq('id',session.user.id).single();
    if(existing.data) return; // Already has a profile
    var names=fullName.split(' ');
    var first=names[0]||'';
    var last=names.slice(1).join(' ')||'';
    var email=session.user.email||'';
    var avatar=meta.avatar_url||meta.picture||'';
    var provider=meta.iss||session.user.app_metadata.provider||'oauth';
    // Create profile
    await _sb.from('profiles').insert({id:session.user.id,first_name:first,last_name:last,email:email,phone:''});
    // Create lead + push to Follow-Up Boss
    var leadData={first_name:first,last_name:last,email:email,phone:'',source:'oauth_'+provider,message:'Signed in via '+provider};
    _sb.from('leads').insert(leadData).then(function(){_pushToFUB(leadData)}).catch(function(){});
    // Cache profile locally
    try{localStorage.setItem('cc_profile',JSON.stringify({firstName:first,lastName:last,email:email,phone:'',avatar:avatar}))}catch(e){}
  }catch(e){console.warn('[OAuth] Profile creation:',e)}
}

// --- Open pending property after auth (registration gate) ---
function _openPendingProp(){
  // Check in-memory first (email auth — same page, no redirect)
  if(_pendingProp){
    var p=_pendingProp;_pendingProp=null;
    setTimeout(function(){closeAcctModal();openProp(p.listing,p.townName)},800);
    return;
  }
  // Check localStorage (OAuth redirect — page reloaded)
  var stored=localStorage.getItem('cc_pending_prop');
  if(stored){
    localStorage.removeItem('cc_pending_prop');
    try{
      var p=JSON.parse(stored);
      if(p&&p.listing){
        console.log('[Auth] Restoring pending property after OAuth redirect');
        // Wait longer for page to fully load after OAuth redirect
        setTimeout(function(){
          closeAcctModal();
          openProp(p.listing,p.townName);
        },2000);
      }
    }catch(e){console.warn('[Auth] Failed to restore pending property:',e)}
  }
}

// --- Sign in (Supabase) — with smart signup probe ---
async function loginAcct() {
  var email = document.getElementById('acctLoginEmail').value.trim();
  var pass = document.getElementById('acctLoginPass').value;
  clearAcctErrors();
  if(!email || email.indexOf('@')<1){ document.getElementById('acctLoginEmail').focus(); document.getElementById('acctLoginEmail').style.borderColor='#c07070'; return; }
  if(!pass || pass.length < 6){ document.getElementById('acctLoginPass').focus(); document.getElementById('acctLoginPass').style.borderColor='#c07070'; return; }

  var btn = document.querySelector('#acctLoginView .acct-submit');
  btn.textContent = 'Signing In...';
  btn.disabled = true;

  if(!_sb) { showAcctError('acctLoginError', 'Service unavailable. Please try again later.'); btn.textContent='Sign In'; btn.disabled=false; return; }

  try {
    var result = await _sb.auth.signInWithPassword({ email: email, password: pass });
    if(result.error) {
      // Smart probe: try signUp to see if account exists
      console.log('[Auth] Login failed, probing with signUp...');
      _smartSignupInProgress = true;
      try {
        var probe = await _sb.auth.signUp({ email: email, password: pass });
        if(probe.error) {
          // Account exists but password was wrong
          _smartSignupInProgress = false;
          var errMsg = probe.error.message || '';
          if(errMsg.indexOf('already registered') > -1) {
            showAcctError('acctLoginError', 'Incorrect password. Please try again.');
          } else {
            showAcctError('acctLoginError', errMsg || 'Something went wrong. Please try again.');
          }
          btn.textContent = 'Sign In'; btn.disabled = false;
          return;
        }
        // No account existed — user just got created. Show completion form.
        if(probe.data && probe.data.user) {
          _currentUser = probe.data.user;
          console.log('[Auth] No account found, created via smart probe. Showing completion form.');
          btn.textContent = 'Sign In'; btn.disabled = false;
          showAcctComplete(email);
          // Safety timeout to clear flag
          setTimeout(function(){ _smartSignupInProgress = false; }, 30000);
          return;
        }
        // Unexpected: no error but no user
        _smartSignupInProgress = false;
        showAcctError('acctLoginError', 'Something went wrong. Please try again.');
        btn.textContent = 'Sign In'; btn.disabled = false;
      } catch(probeErr) {
        _smartSignupInProgress = false;
        showAcctError('acctLoginError', 'Something went wrong. Please try again.');
        btn.textContent = 'Sign In'; btn.disabled = false;
      }
      return;
    }
    // Login succeeded
    _acctLoggedIn = true;
    _currentUser = result.data.user;
    await loadFavoritesFromCloud();
    // Show success
    document.getElementById('acctLoginView').style.display = 'none';
    document.getElementById('acctSuccessView').style.display = '';
    updateAcctUI();
    // Open pending property or just close modal
    if(_pendingProp){
      setTimeout(function(){ closeAcctModal(); openProp(_pendingProp.listing,_pendingProp.townName); _pendingProp=null; },1200);
    } else {
      setTimeout(function(){ closeAcctModal() }, 2000);
    }
  } catch(e) {
    showAcctError('acctLoginError', 'Something went wrong. Please try again.');
    btn.textContent = 'Sign In';
    btn.disabled = false;
  }
}

// Click on gated blurred area
function onGatedClick() {
  if(!_acctLoggedIn) openAcctModal();
}

// --- Consultation form submit (with optional account creation) ---
async function submitConsultation(btn) {
  var first = document.getElementById('ctaFirst').value.trim();
  var last = document.getElementById('ctaLast').value.trim();
  var email = document.getElementById('ctaEmail').value.trim();
  var phone = document.getElementById('ctaPhone').value.trim();
  // Basic validation
  if(!first){ document.getElementById('ctaFirst').focus(); document.getElementById('ctaFirst').style.borderColor='#c07070'; return; }
  if(!last){ document.getElementById('ctaLast').focus(); document.getElementById('ctaLast').style.borderColor='#c07070'; return; }
  if(!email || email.indexOf('@')<1){ document.getElementById('ctaEmail').focus(); document.getElementById('ctaEmail').style.borderColor='#c07070'; return; }
  // Phone is optional — skip validation

  btn.textContent = 'Sending...';
  btn.disabled = true;

  // Push lead to Supabase (triggers FUB)
  if(_sb) {
    try {
      var typeEl = document.getElementById('ctaType');
      var msgEl = document.getElementById('ctaMessage');
      var leadMsg = (typeEl ? typeEl.value + ': ' : '') + (msgEl ? msgEl.value : '');
      // Append chat transcript if they talked to the chatbot
      if(!_chatLeadPushed && convHistory && convHistory.length > 0){
        var transcript = buildChatTranscript();
        if(transcript) leadMsg += '\n\n' + transcript;
      }
      var ctaLeadData = {
        first_name: first,
        last_name: last,
        email: email,
        phone: phone,
        message: leadMsg,
        source: 'consultation_form'
      };
      await _sb.from('leads').insert(ctaLeadData);
      _pushToFUB(ctaLeadData);
      if(convHistory && convHistory.length > 0) _chatLeadPushed = true;
    } catch(e){ console.warn('[Supabase] Lead insert error:', e); }
  }

  // If account opt-in is checked, create account too
  var acctCheck = document.getElementById('ctaAcctCheck');
  if(acctCheck && acctCheck.checked) {
    var pass = document.getElementById('ctaPassword').value;
    if(!pass || pass.length < 6){ document.getElementById('ctaPassword').focus(); document.getElementById('ctaPassword').style.borderColor='#c07070'; btn.textContent='Send Message'; btn.disabled=false; return; }
    if(_sb) {
      try {
        var result = await _sb.auth.signUp({ email: email, password: pass });
        if(result.data && result.data.user) {
          _currentUser = result.data.user;
          await _sb.from('profiles').insert({
            id: result.data.user.id,
            first_name: first,
            last_name: last,
            email: email,
            phone: phone
          });
          _acctLoggedIn = true;
          try{localStorage.setItem('cc_profile',JSON.stringify({firstName:first,lastName:last,email:email,phone:phone,password:true}))}catch(e){}
          updateAcctUI();
        }
      } catch(e){ console.warn('[Supabase] Acct create error:', e); }
    }
    btn.textContent = 'Sent! Account Created';
    btn.style.background = 'var(--green)';
  } else {
    btn.textContent = 'Message Sent!';
    btn.style.background = 'var(--green)';
  }
  btn.disabled = false;
  setTimeout(function(){ btn.textContent='Send Message'; btn.style.background=''; }, 3000);
}

// Close modal on bg click (deferred — modal HTML loads after this script)
document.addEventListener('DOMContentLoaded', function(){
  var m = document.getElementById('acctModal');
  if(m) m.addEventListener('click', function(e){ if(e.target === this) closeAcctModal(); });
});

// --- Gated features (restrictions/HOA) in property detail ---
function updateGatedFeatures() {
  // Gate restriction values in features grid
  var feats = document.querySelectorAll('#propFeatures .prop-feat');
  feats.forEach(function(f){
    var label = f.querySelector('.prop-feat-label');
    if(!label) return;
    var txt = label.textContent.toLowerCase();
    if(txt.indexOf('restriction') > -1 || txt.indexOf('hoa') > -1) {
      applyGateToElement(f.querySelector('.prop-feat-val'));
    }
  });
  // Gate restriction values in stats ribbon
  var stats = document.querySelectorAll('#propStats .prop-stat');
  stats.forEach(function(s){
    var label = s.querySelector('.prop-stat-label');
    if(!label) return;
    var txt = label.textContent.toLowerCase();
    if(txt.indexOf('restriction') > -1 || txt.indexOf('hoa') > -1) {
      applyGateToElement(s.querySelector('.prop-stat-val'));
    }
  });
}

function applyGateToElement(valEl) {
  if(!valEl) return;
  var parentBox = valEl.closest('.prop-stat') || valEl.closest('.prop-feat') || valEl.parentElement;
  if(!_acctLoggedIn) {
    if(!valEl.getAttribute('data-gated')) {
      valEl.setAttribute('data-gated','1');
      valEl.setAttribute('data-original', valEl.textContent);
      valEl.style.filter = 'blur(6px)';
      valEl.style.userSelect = 'none';
      // Make entire parent box clickable
      parentBox.style.cursor = 'pointer';
      parentBox.title = 'Unlock this detail \u2014 Free';
      parentBox.setAttribute('data-gated-parent','1');
      parentBox.onclick = function(e){ e.stopPropagation(); openAcctModal(); };
      // Add "Create Account" hint below the blurred text
      if(!parentBox.querySelector('.gated-hint')){
        var hint = document.createElement('div');
        hint.className = 'gated-hint';
        hint.textContent = 'Unlock \u2014 Free';
        hint.style.cssText = 'font-size:0.5rem;color:var(--gold);letter-spacing:0.1em;text-transform:uppercase;margin-top:0.25rem;opacity:0.7;pointer-events:none';
        parentBox.appendChild(hint);
      }
    }
  } else {
    if(valEl.getAttribute('data-gated')) {
      valEl.style.filter = '';
      valEl.style.userSelect = '';
      valEl.onclick = null;
      valEl.removeAttribute('data-gated');
      parentBox.style.cursor = '';
      parentBox.title = '';
      parentBox.onclick = null;
      parentBox.removeAttribute('data-gated-parent');
      var hint = parentBox.querySelector('.gated-hint');
      if(hint) hint.remove();
    }
  }
}

// --- Favorite toggle from property card heart icon ---
function toggleCardFav(e, address, city) {
  e.stopPropagation(); // Don't open property details
  if(!_acctLoggedIn) { openAcctModal(); return; }
  var key = (address + '|' + (city||'')).toLowerCase();
  if(_favProps[key]) {
    delete _favProps[key];
    saveFavs();
    saveFavToCloud(key, false);
  } else {
    _favProps[key] = true;
    saveFavs();
    saveFavToCloud(key, true);
  }
  // Update all heart icons on page for this property
  document.querySelectorAll('.card-fav-heart[data-key="'+key+'"]').forEach(function(h){
    h.classList.toggle('saved', !!_favProps[key]);
  });
  // Update property detail save button if same property is open
  if(_currentPropKey === key) updateFavBtn();
  srApplyViewedFavStates();
  // Update account dashboard fav count
  var favCount = Object.keys(_favProps).filter(function(k){return _favProps[k]}).length;
  var fc = document.getElementById('acctFavCount');
  if(fc) fc.textContent = favCount;
}

// --- Favorite toggle on property detail ---
var _currentPropKey = '';
function toggleFavProp() {
  if(!_acctLoggedIn) {
    openAcctModal();
    return;
  }
  if(!_currentPropKey) return;
  var isFav = !!_favProps[_currentPropKey];
  if(isFav) {
    delete _favProps[_currentPropKey];
    saveFavs();
    saveFavToCloud(_currentPropKey, false);
    logActivity('unfavorite', _currentPropKey, {});
    // Remove from party favorites
    if(_activeParty && _sb && _currentUser) {
      _sb.from('search_party_favorites').delete()
        .eq('party_id', _activeParty.id)
        .eq('user_id', _currentUser.id)
        .eq('property_key', _currentPropKey)
        .then(function(){ loadPartyFavorites(); });
    }
  } else {
    _favProps[_currentPropKey] = true;
    saveFavs();
    saveFavToCloud(_currentPropKey, true);
    logActivity('favorite', _currentPropKey, {});
    // Add to party favorites
    if(_activeParty && _sb && _currentUser) {
      var listing = window._currentListing || {};
      _sb.from('search_party_favorites').upsert({
        party_id: _activeParty.id,
        user_id: _currentUser.id,
        property_key: _currentPropKey,
        property_data: {address: listing.address, city: listing.city, price: listing.price, type: listing.type, photo: listing.photo}
      }).then(function(){
        loadPartyFavorites();
        // Notify party members
        var addr = listing.address || _currentPropKey.split('|')[0];
        notifyPartyMembers('favorite', addr, '', _currentPropKey);
      });
    }
  }
  updateFavBtn();
  // Update search results if open
  srApplyViewedFavStates();
}

function updateFavBtn() {
  var btn = document.getElementById('propFavBtn');
  var label = document.getElementById('propFavLabel');
  if(_favProps[_currentPropKey]) {
    btn.classList.add('favorited');
    label.textContent = 'Saved';
  } else {
    btn.classList.remove('favorited');
    label.textContent = 'Save';
  }
  // Show party member avatars who also favorited this property
  var dotsEl = document.getElementById('propFavPartyDots');
  if(dotsEl) dotsEl.remove();
  if(_activeParty && _partyFavs[_currentPropKey]) {
    var others = _partyFavs[_currentPropKey].filter(function(f){ return f.user_id !== (_currentUser ? _currentUser.id : ''); });
    if(others.length > 0) {
      var dots = document.createElement('div');
      dots.id = 'propFavPartyDots';
      dots.className = 'prop-fav-party-dots';
      others.forEach(function(f) {
        var color = getPartyColor(f.user_id);
        dots.innerHTML += '<span class="party-fav-dot" style="background:' + color + '" title="' + (f.user_display_name||'Party member') + '">' + getInitials(f.user_display_name) + '</span>';
      });
      var favWrap = btn.closest('.prop-action') || btn.parentElement;
      if(favWrap) favWrap.appendChild(dots);
    }
  }
}

// ═══ CORY'S TAKE — Dynamic market insights (Fair Housing compliant) ═══
function buildCorysTake(listing, townName) {
  var container = document.getElementById('corysTake');
  var insightsEl = document.getElementById('corysTakeInsights');
  if(!container || !insightsEl) return;

  // Find the town slug
  var townSlug = null;
  Object.keys(TOWN_LISTINGS).forEach(function(k){
    if(TOWN_LISTINGS[k].display === townName) townSlug = k;
  });
  if(!townSlug || !TOWN_LISTINGS[townSlug]) { container.style.display='none'; return; }

  var areaListings = TOWN_LISTINGS[townSlug].listings;
  var insights = [];
  var dollarIcon = '<svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>';
  var clockIcon = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
  var checkIcon = '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>';
  var lotIcon = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>';
  var homeIcon = '<svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>';
  var starIcon = '<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

  // --- Insight: $/sqft vs area average (homes) ---
  if(listing.type !== 'Land' && listing.sqft > 0) {
    var homes = areaListings.filter(function(l){ return l.type !== 'Land' && l.sqft > 0 && l.price > 0; });
    if(homes.length >= 3) {
      var avgPsf = homes.reduce(function(s,l){ return s + l.price/l.sqft; }, 0) / homes.length;
      var thisPsf = listing.price / listing.sqft;
      var psfDiff = ((thisPsf - avgPsf) / avgPsf * 100);
      var absDiff = Math.abs(Math.round(psfDiff));
      if(absDiff >= 5) {
        if(psfDiff < 0) {
          insights.push({ icon: dollarIcon, text: 'Priced at <strong>$'+Math.round(thisPsf)+'/sqft</strong> — <span class="insight-great">'+absDiff+'% below</span> the '+townName+' average of $'+Math.round(avgPsf)+'/sqft. Strong value positioning.' });
        } else {
          insights.push({ icon: dollarIcon, text: 'At <strong>$'+Math.round(thisPsf)+'/sqft</strong>, this property reflects <span class="insight-note">premium quality</span> for '+townName+' (avg $'+Math.round(avgPsf)+'/sqft) — often indicative of superior finishes or setting.' });
        }
      }
    }
  }

  // --- Insight: $/acre vs area average (land) ---
  if(listing.type === 'Land' && listing.lot) {
    var acres = parseFloat(listing.lot);
    if(acres > 0) {
      var lands = areaListings.filter(function(l){ return l.type === 'Land' && l.lot && parseFloat(l.lot) > 0 && l.price > 0; });
      if(lands.length >= 2) {
        var avgPpa = lands.reduce(function(s,l){ return s + l.price/parseFloat(l.lot); }, 0) / lands.length;
        var thisPpa = listing.price / acres;
        var ppaDiff = ((thisPpa - avgPpa) / avgPpa * 100);
        var absPpaDiff = Math.abs(Math.round(ppaDiff));
        if(absPpaDiff >= 8) {
          if(ppaDiff < 0) {
            insights.push({ icon: lotIcon, text: 'At <strong>$'+Math.round(thisPpa).toLocaleString()+'/acre</strong>, this parcel is <span class="insight-great">'+absPpaDiff+'% below</span> the '+townName+' average of $'+Math.round(avgPpa).toLocaleString()+'/acre — excellent value for the area.' });
          } else {
            insights.push({ icon: lotIcon, text: 'At <strong>$'+Math.round(thisPpa).toLocaleString()+'/acre</strong>, this parcel commands a <span class="insight-note">premium</span> over the area average — often reflecting views, access, or desirable topography.' });
          }
        }
      }
    }
  }

  // --- Insight: Days on market ---
  var dom = listing.daysOnMarket || listing.days || 0;
  if(dom > 0) {
    var listingsWithDom = areaListings.filter(function(l){ return (l.daysOnMarket || 0) > 0; });
    if(listingsWithDom.length >= 3) {
      var avgDom = listingsWithDom.reduce(function(s,l){ return s + (l.daysOnMarket||0); }, 0) / listingsWithDom.length;
      if(dom < avgDom * 0.6) {
        insights.push({ icon: clockIcon, text: 'Only <strong>'+dom+' days on market</strong> — well below the '+townName+' average of '+Math.round(avgDom)+' days. <span class="insight-note">Fresh listing generating early interest.</span>' });
      } else if(dom > avgDom * 1.5 && dom > 30) {
        insights.push({ icon: clockIcon, text: 'At <strong>'+dom+' days on market</strong> ('+townName+' avg: '+Math.round(avgDom)+'), <span class="insight-great">this listing may present a strong negotiation opportunity.</span>' });
      } else {
        insights.push({ icon: clockIcon, text: 'At <strong>'+dom+' days on market</strong>, this property is tracking near the '+townName+' average of '+Math.round(avgDom)+' days — healthy market activity.' });
      }
    }
  }

  // --- Insight: Price vs median for similar properties ---
  if(listing.type !== 'Land' && listing.beds > 0 && listing.price > 0) {
    var similar = areaListings.filter(function(l){
      return l.type === listing.type && l.beds >= listing.beds-1 && l.beds <= listing.beds+1 && l.price > 0;
    });
    if(similar.length >= 3) {
      var prices = similar.map(function(l){ return l.price; }).sort(function(a,b){ return a-b; });
      var median = prices[Math.floor(prices.length/2)];
      var valDiff = ((listing.price - median) / median * 100);
      var absValDiff = Math.abs(Math.round(valDiff));
      if(valDiff < -8) {
        insights.push({ icon: checkIcon, text: '<span class="insight-great">Priced '+absValDiff+'% below the median</span> for comparable '+listing.beds+'-bedroom '+listing.type.toLowerCase()+'s in '+townName+'. Well-positioned for value-minded buyers.' });
      } else if(valDiff > 15) {
        insights.push({ icon: starIcon, text: 'This '+listing.beds+'-bedroom '+listing.type.toLowerCase()+' is positioned at the <span class="insight-note">upper end of the market</span> — likely reflecting upgraded features, views, or lot quality.' });
      }
    }
  }

  // --- Insight: Lot size advantage ---
  if(listing.lot) {
    var thisAcres = parseFloat(listing.lot);
    if(thisAcres > 0) {
      var sameTypeWithLot = areaListings.filter(function(l){ return l.lot && parseFloat(l.lot) > 0 && l.type === listing.type; });
      if(sameTypeWithLot.length >= 3) {
        var avgLot = sameTypeWithLot.reduce(function(s,l){ return s + parseFloat(l.lot); }, 0) / sameTypeWithLot.length;
        if(thisAcres > avgLot * 1.5 && thisAcres - avgLot > 0.5) {
          insights.push({ icon: lotIcon, text: '<strong>'+listing.lot+'</strong> — <span class="insight-great">significantly more land</span> than the '+townName+' average of '+avgLot.toFixed(1)+' acres for this property type. Great for privacy and outdoor space.' });
        }
      }
    }
  }

  // --- Insight: Year built ---
  if(listing.yearBuilt && listing.yearBuilt > 1900) {
    var currentYear = new Date().getFullYear();
    var age = currentYear - listing.yearBuilt;
    if(age <= 5) {
      insights.push({ icon: homeIcon, text: 'Built in <strong>'+listing.yearBuilt+'</strong> — <span class="insight-great">newer construction</span> with modern building standards, energy efficiency, and current design features.' });
    } else if(age >= 40) {
      insights.push({ icon: homeIcon, text: 'Built in <strong>'+listing.yearBuilt+'</strong> — an established property with <span class="insight-note">proven construction</span> and mature landscaping. Character and craftsmanship from a different era.' });
    }
  }

  // --- Insight: Overall value score ---
  if(insights.length >= 2 && listing.price > 0) {
    var positiveCount = 0;
    insights.forEach(function(ins){ if(ins.text.indexOf('insight-great') > -1) positiveCount++; });
    if(positiveCount >= 2) {
      insights.push({ icon: starIcon, text: '<span class="insight-great">Multiple value indicators</span> suggest this property is well-positioned in the '+townName+' market. Worth a closer look.' });
    }
  }

  // Show max 5 insights
  insights = insights.slice(0, 5);

  if(insights.length === 0) { container.style.display='none'; return; }

  insightsEl.innerHTML = insights.map(function(ins){
    return '<div class="corys-take-insight"><div class="corys-take-insight-icon">'+ins.icon+'</div><div>'+ins.text+'</div></div>';
  }).join('');
  container.style.display = '';
}

// ═══ CORY'S SUGGESTIONS — Personalized recommendations ═══
function analyzeFavoritePatterns() {
  var favKeys = Object.keys(_favProps).filter(function(k){ return _favProps[k]; });
  if(favKeys.length < 2) return null;
  // Resolve to listings
  var favListings = [];
  ALL_LISTINGS.forEach(function(l){
    var key = propKey(l, l.city);
    if(_favProps[key]) favListings.push(l);
  });
  if(favListings.length < 2) return null;

  var types={}, towns={}, restrictions={};
  var priceSum=0, priceCount=0;

  favListings.forEach(function(l){
    types[l.type] = (types[l.type]||0)+1;
    towns[l.city] = (towns[l.city]||0)+1;
    restrictions[l.restrictions] = (restrictions[l.restrictions]||0)+1;
    if(l.price>0){priceSum+=l.price;priceCount++}
  });

  var topType = Object.keys(types).sort(function(a,b){return types[b]-types[a]})[0];
  var topTown = Object.keys(towns).sort(function(a,b){return towns[b]-towns[a]})[0];
  var topRestriction = Object.keys(restrictions).sort(function(a,b){return restrictions[b]-restrictions[a]})[0];
  var avgPrice = priceCount ? priceSum/priceCount : 0;

  return {
    favListings:favListings, topType:topType, topTypeCount:types[topType]||0,
    topTown:topTown, topTownCount:towns[topTown]||0,
    topRestriction:topRestriction, avgPrice:avgPrice,
    priceMin:avgPrice*0.5, priceMax:avgPrice*1.8,
    totalFavs:favListings.length
  };
}

function findSuggestionsFromPatterns(patterns, excludeAddress) {
  if(!patterns) return [];
  var scored = [];
  var now = Date.now();
  ALL_LISTINGS.forEach(function(l){
    var key = propKey(l, l.city);
    if(_favProps[key]) return;
    if(excludeAddress && l.address === excludeAddress) return;
    var score = 0;
    if(l.type === patterns.topType) score += 3;
    if(l.city === patterns.topTown) score += 3;
    // County proximity: same county gets a boost
    if(l.county && patterns.topCounty && l.county === patterns.topCounty) score += 2;
    // Tighter price range matching
    if(l.price >= patterns.priceMin && l.price <= patterns.priceMax) score += 3;
    else if(l.price >= patterns.priceMin * 0.8 && l.price <= patterns.priceMax * 1.2) score += 1;
    if(l.restrictions === patterns.topRestriction) score += 1;
    // Recency weighting — newer listings score higher
    if(l.listDate) {
      var age = (now - new Date(l.listDate).getTime()) / (1000*60*60*24);
      if(age < 7) score += 2;
      else if(age < 30) score += 1;
    }
    if(score >= 3) scored.push({listing:l, score:score});
  });
  scored.sort(function(a,b){return b.score-a.score});
  return scored.slice(0,6).map(function(s){return s.listing});
}

// Fallback: find suggestions based on current property (for non-logged-in users)
function findSuggestionsFromCurrent(currentListing) {
  if(!currentListing) return [];
  var scored = [];
  var now = Date.now();
  ALL_LISTINGS.forEach(function(l){
    if(l.address === currentListing.address && l.price === currentListing.price) return;
    var score = 0;
    if(l.type === currentListing.type) score += 3;
    if(l.city === (currentListing.city || window._currentTownName)) score += 3;
    // County proximity
    if(l.county && currentListing.county && l.county === currentListing.county) score += 2;
    // Tighter price range
    if(currentListing.price > 0 && l.price >= currentListing.price*0.7 && l.price <= currentListing.price*1.5) score += 3;
    else if(currentListing.price > 0 && l.price >= currentListing.price*0.5 && l.price <= currentListing.price*1.8) score += 1;
    // Recency
    if(l.listDate) {
      var age = (now - new Date(l.listDate).getTime()) / (1000*60*60*24);
      if(age < 7) score += 2;
      else if(age < 30) score += 1;
    }
    if(score >= 4) scored.push({listing:l, score:score});
  });
  scored.sort(function(a,b){return b.score-a.score});
  return scored.slice(0,6).map(function(s){return s.listing});
}

function buildCorysSuggestions(currentListing, townName) {
  var container = document.getElementById('corysSuggestions');
  if(!container) return;

  var patterns = analyzeFavoritePatterns();
  var suggestions, reason;

  if(patterns) {
    suggestions = findSuggestionsFromPatterns(patterns, currentListing ? currentListing.address : null);
    if(suggestions.length > 0) {
      reason = 'You\'ve saved ' + patterns.topTypeCount + ' ' + patterns.topType.toLowerCase() +
        (patterns.topTypeCount > 1 ? ' properties':'') +
        (patterns.topTownCount >= 2 ? ' in '+patterns.topTown : '') +
        ' \u2014 here are '+suggestions.length+' more you might like.';
    }
  }

  // Fallback for non-logged-in users or no favorites match
  if(!suggestions || suggestions.length === 0) {
    suggestions = findSuggestionsFromCurrent(currentListing);
    if(suggestions.length > 0) {
      var tn = townName || (currentListing ? currentListing.city : 'this area');
      reason = 'Based on this '+((currentListing && currentListing.type) || 'property').toLowerCase()+' in '+tn+', here are similar listings you might want to explore.';
    }
  }

  if(!suggestions || suggestions.length === 0) {
    container.style.display = 'none';
    return;
  }

  document.getElementById('corysSuggestionsReason').textContent = reason;
  var grid = document.getElementById('corysSuggestionsGrid');
  grid.innerHTML = '';
  suggestions.forEach(function(l){
    var c = document.createElement('div');
    c.className = 'f-card'; c.style.cursor = 'pointer';
    var feats = _cardFeats(l);
    var imgSrc = l.photo || (PROP_IMAGES[l.type]||PROP_IMAGES['Single Family'])[0].replace('w=1200','w=700');
    var sgStatus=l.status==='Under Contract'?'<div class="card-status-tag">Under Contract</div>':'';
    c.innerHTML = '<div class="f-card-img"><img src="'+imgSrc+'" alt="'+l.address+'" loading="lazy"><div class="f-card-badge'+(l.type==='Land'?' land':'')+'">' + l.type + '</div><div class="f-card-badge" style="right:auto;left:0.75rem;background:var(--gold);color:var(--bg);font-size:0.5rem">Suggested</div>'+sgStatus+cardFavHtml(l.address, l.city||townName)+'</div><div class="f-card-body"><div class="f-card-price">$'+l.price.toLocaleString()+'</div><div class="f-card-addr">'+l.address+'</div><div class="f-card-city">'+(l.city||townName)+', NC</div><div class="f-card-features">'+feats+'</div></div>';
    c.onclick = function(){ openProp(l, l.city||townName); };
    grid.appendChild(c);
  });
  // "View More Like This" button
  var moreBtn = document.getElementById('suggestViewMore');
  if(!moreBtn) {
    moreBtn = document.createElement('button');
    moreBtn.id = 'suggestViewMore';
    moreBtn.className = 'suggest-view-more';
    moreBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg> View More Like This';
    grid.parentElement.appendChild(moreBtn);
  }
  moreBtn.onclick = function() {
    // Pre-fill search with similar filters
    var l0 = suggestions[0];
    if(l0) {
      closeProp();
      openSearchResults({locations: [l0.city || townName], type: l0.type || '', price: '', beds: '', baths: ''});
    }
  };
  container.style.display = '';
}

function buildDashboardSuggestions() {
  var container = document.getElementById('acctSuggestionsPreview');
  if(!container) return;
  var patterns = analyzeFavoritePatterns();
  if(!patterns) {
    container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted)">Save at least 2 properties to unlock personalized suggestions.</p>';
    return;
  }
  var suggestions = findSuggestionsFromPatterns(patterns);
  if(suggestions.length === 0) {
    container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted)">No new suggestions right now. Save more favorites and check back!</p>';
    return;
  }
  container.innerHTML = '';
  suggestions.forEach(function(l){
    var card = document.createElement('div');
    card.className = 'suggestion-mini';
    var imgSrc = l.photo || 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=200&q=80';
    card.innerHTML = '<img class="suggestion-mini-img" src="'+imgSrc+'" alt="'+l.address+'"><div class="suggestion-mini-info"><div class="suggestion-mini-price">$'+l.price.toLocaleString()+'</div><div class="suggestion-mini-addr">'+l.address+', '+(l.city||'')+', NC</div></div>';
    card.onclick = function(){ closeAcctModal(); openProp(l, l.city||''); };
    container.appendChild(card);
  });
}

// ═══ COMPARE PROPERTIES ═══
var _compareSelected = [];
var _compareRowOrder = ['price','beds','baths','sqft','lot','daysOnMarket','type','restrictions','location','listingBroker'];
var _compareRowLabels = {
  price:'Price', beds:'Bedrooms', baths:'Bathrooms', sqft:'Square Feet',
  lot:'Lot Size', daysOnMarket:'Days on Market', type:'Property Type',
  restrictions:'Restrictions', location:'Location', listingBroker:'Listing Office'
};

function openCompare() {
  hideMobileCta();
  if(!_acctLoggedIn) { openAcctModal(); return; }
  _compareSelected = [];
  var overlay = document.getElementById('compareOverlay');
  overlay.classList.add('active');
  _lockScroll();
  showCompareSelect();
  try{history.pushState({page:'compare'},'','#compare')}catch(e){}
}

function closeCompare() {
  showMobileCta();
  var overlay = document.getElementById('compareOverlay');
  if(!overlay) return;
  overlay.classList.remove('active');
  _unlockScroll();
  if(history.state && history.state.page === 'compare') history.back();
}

function showCompareSelect() {
  document.getElementById('compareSelect').style.display = '';
  document.getElementById('compareTableWrap').style.display = 'none';
  _compareSelected = [];
  updateCompareBtn();
  renderCompareFavGrid();
}

function renderCompareFavGrid() {
  var grid = document.getElementById('compareFavGrid');
  grid.innerHTML = '';
  var favKeys = Object.keys(_favProps).filter(function(k){return _favProps[k]});
  if(favKeys.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;grid-column:1/-1">No saved properties yet. Favorite some listings first, then come back to compare them.</p>';
    return;
  }
  var favListings = [];
  ALL_LISTINGS.forEach(function(l){
    var key = propKey(l, l.city);
    if(_favProps[key]) { l._compareKey = key; favListings.push(l); }
  });
  favListings.forEach(function(l){
    var card = document.createElement('div');
    card.className = 'compare-fav-card';
    card.setAttribute('data-compare-key', l._compareKey);
    var imgSrc = l.photo || (PROP_IMAGES[l.type]||PROP_IMAGES['Single Family'])[0].replace('w=1200','w=400');
    var cmpMlsNums = _formatMlsNums(l);
    var cmpBroker = l.listOffice ? '<div class="compare-fav-card-office">Listed by '+l.listOffice+(cmpMlsNums?' | '+cmpMlsNums:'')+'</div>' : '';
    card.innerHTML = '<img class="compare-fav-card-img" src="'+imgSrc+'" alt="'+l.address+'" loading="lazy">'+
      '<div class="compare-fav-card-price">$'+l.price.toLocaleString()+'</div>'+
      '<div class="compare-fav-card-addr">'+l.address+'</div>'+
      '<div class="compare-fav-card-city">'+(l.city||'')+', NC</div>'+
      '<div class="compare-fav-card-type">'+l.type+'</div>'+
      cmpBroker;
    card.onclick = function(){
      var isSelected = card.classList.contains('selected');
      if(isSelected){
        card.classList.remove('selected');
        _compareSelected = _compareSelected.filter(function(s){return s._compareKey !== l._compareKey});
      } else {
        if(_compareSelected.length >= 10) return;
        card.classList.add('selected');
        _compareSelected.push(l);
      }
      updateCompareBtn();
    };
    grid.appendChild(card);
  });
}

function updateCompareBtn() {
  var btn = document.getElementById('compareGoBtn');
  var count = _compareSelected.length;
  var total = Object.keys(_favProps).filter(function(k){return _favProps[k]}).length;
  btn.textContent = 'Compare Selected ('+count+')';
  btn.disabled = count < 2;
  document.getElementById('compareCount').textContent = count+' of '+total+' favorites selected';
}

function runCompare() {
  if(_compareSelected.length < 2) return;
  document.getElementById('compareSelect').style.display = 'none';
  document.getElementById('compareTableWrap').style.display = '';
  renderCompareTable();
}

function renderCompareTable() {
  var head = document.getElementById('compareHead');
  var body = document.getElementById('compareBody');

  // Header
  var headHtml = '<tr><th>Criteria</th>';
  _compareSelected.forEach(function(l, idx){
    var imgSrc = l.photo || (PROP_IMAGES[l.type]||PROP_IMAGES['Single Family'])[0].replace('w=1200','w=300');
    headHtml += '<th><div class="compare-th-card" data-compare-idx="'+idx+'">'+
      '<img class="compare-th-img" src="'+imgSrc+'" alt="'+l.address+'">'+
      '$'+l.price.toLocaleString()+
      '<div class="compare-th-addr">'+l.address+'<br>'+(l.city||'')+', NC</div></div></th>';
  });
  headHtml += '</tr>';
  head.innerHTML = headHtml;

  // Bind click events to header cards
  head.querySelectorAll('.compare-th-card').forEach(function(card){
    card.addEventListener('click', function(){
      var idx = parseInt(card.getAttribute('data-compare-idx'));
      var listing = _compareSelected[idx];
      if(listing) { closeCompare(); setTimeout(function(){ openProp(listing, listing.city||''); }, 150); }
    });
  });

  // Body rows
  body.innerHTML = '';
  _compareRowOrder.forEach(function(field, rowIdx){
    var tr = document.createElement('tr');
    tr.setAttribute('data-field', field);

    var th = document.createElement('td');
    th.className = 'compare-criteria-cell';
    th.innerHTML = '<div class="compare-row-header">'+
      '<div class="compare-move-zone compare-move-up" data-row="'+rowIdx+'" title="Move up">&#9650;</div>'+
      '<span class="compare-criteria-label">'+_compareRowLabels[field]+'</span>'+
      '<div class="compare-move-zone compare-move-down" data-row="'+rowIdx+'" title="Move down">&#9660;</div>'+
    '</div>';
    th.querySelector('.compare-move-up').addEventListener('click', function(){ compareMove(rowIdx, -1); });
    th.querySelector('.compare-move-down').addEventListener('click', function(){ compareMove(rowIdx, 1); });
    tr.appendChild(th);

    var vals = _compareSelected.map(function(l){return getCompareVal(l, field)});
    var bestIdx = findBestValue(vals, field);

    _compareSelected.forEach(function(l, colIdx){
      var td = document.createElement('td');
      td.textContent = formatCompareVal(l, field);
      if(colIdx === bestIdx) td.classList.add('compare-best');
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

function getCompareVal(listing, field) {
  switch(field){
    case 'price': return listing.price || 0;
    case 'beds': return listing.beds || 0;
    case 'baths': return listing.baths || 0;
    case 'sqft': return listing.sqft || 0;
    case 'lot': return parseFloat(listing.lot) || 0;
    case 'daysOnMarket': return listing.daysOnMarket || 0;
    case 'listingBroker': return listing.listOffice || '';
    default: return '';
  }
}

function formatCompareVal(listing, field) {
  switch(field){
    case 'price': return '$'+(listing.price||0).toLocaleString();
    case 'beds': return (listing.beds||0)+' Bed'+(listing.beds!==1?'s':'');
    case 'baths': return (listing.baths||0)+' Bath'+(listing.baths!==1?'s':'');
    case 'sqft': var _sf = _formatSqft(listing); return _sf !== '—' ? _sf + ' ' + _sqftLabel(listing) : 'N/A';
    case 'lot': return listing.lot || 'N/A';
    case 'daysOnMarket': return (listing.daysOnMarket||0)+' days';
    case 'type': return listing.type || 'N/A';
    case 'restrictions': return RESTRICT_LABELS[listing.restrictions]||listing.restrictions||'N/A';
    case 'location': return (listing.city||'')+', NC';
    case 'listingBroker': return listing.listOffice || 'N/A';
    default: return 'N/A';
  }
}

function findBestValue(vals, field) {
  if(vals.every(function(v){return typeof v==='string'})) return -1;
  if(vals.every(function(v){return v===0})) return -1;
  var numVals = vals.filter(function(v){return typeof v==='number' && v>0});
  if(numVals.length < 2) return -1;

  var comparator;
  switch(field){
    case 'price': case 'daysOnMarket':
      comparator = function(a,b){return a-b}; break; // lower better
    case 'beds': case 'baths': case 'sqft': case 'lot':
      comparator = function(a,b){return b-a}; break; // higher better
    default: return -1;
  }
  var sorted = vals.slice().filter(function(v){return typeof v==='number' && v>0}).sort(comparator);
  var bestVal = sorted[0];
  return vals.indexOf(bestVal);
}

function compareMove(fromIdx, direction) {
  var toIdx = fromIdx + direction;
  if(toIdx < 0 || toIdx >= _compareRowOrder.length) return;
  var temp = _compareRowOrder[fromIdx];
  _compareRowOrder[fromIdx] = _compareRowOrder[toIdx];
  _compareRowOrder[toIdx] = temp;
  renderCompareTable();
}

// ═══ COMPARE PRINT ═══

function printComparison() {
  if(!_acctLoggedIn) { openAcctModal(); return; }
  var props = _compareSelected;
  if(!props || props.length < 2) return;

  // Date
  document.getElementById('cpDate').textContent = 'Prepared: ' + new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});

  // Property photo cards
  var propsRow = document.getElementById('cpPropsRow');
  propsRow.innerHTML = '';
  props.forEach(function(l) {
    var imgSrc = (l.photos && l.photos.length) ? l.photos[0] : l.photo || (PROP_IMAGES[l.type] || PROP_IMAGES['Single Family'])[0].replace('w=1200','w=400');
    var card = document.createElement('div');
    card.className = 'cp-prop-card';
    card.innerHTML =
      '<img class="cp-prop-img" src="' + imgSrc + '" alt="' + (l.address||'') + '">' +
      '<div class="cp-prop-price">$' + (l.price||0).toLocaleString() + '</div>' +
      '<div class="cp-prop-addr">' + (l.address||'') + '</div>' +
      '<div class="cp-prop-city">' + (l.city||'') + ', NC</div>';
    propsRow.appendChild(card);
  });

  // Table header
  var thead = document.getElementById('cpTableHead');
  var headHtml = '<tr><th class="cp-criteria-th">Criteria</th>';
  props.forEach(function(l) { headHtml += '<th>' + (l.address||'Property') + '</th>'; });
  thead.innerHTML = headHtml + '</tr>';

  // Table body
  var tbody = document.getElementById('cpTableBody');
  tbody.innerHTML = '';
  _compareRowOrder.forEach(function(field) {
    var tr = document.createElement('tr');
    var th = document.createElement('td');
    th.className = 'cp-criteria-cell';
    th.textContent = _compareRowLabels[field];
    tr.appendChild(th);
    var vals = props.map(function(l){ return getCompareVal(l, field); });
    var bestIdx = findBestValue(vals, field);
    props.forEach(function(l, colIdx) {
      var td = document.createElement('td');
      td.textContent = formatCompareVal(l, field);
      if(colIdx === bestIdx) td.classList.add('cp-best');
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  // Broker attribution per property (multi-MLS aware)
  var brokersEl = document.getElementById('cpBrokers');
  brokersEl.innerHTML = '';
  props.forEach(function(l) {
    var parts = [];
    if(l.listAgent) parts.push(l.listAgent);
    if(l.listOffice) parts.push(l.listOffice);
    if(l.attributionContact) parts.push(l.attributionContact);
    var cpMlsNums = _formatMlsNums(l);
    if(cpMlsNums) parts.push(cpMlsNums);
    if(parts.length > 0) {
      brokersEl.innerHTML += '<div class="cp-broker-line">' + (l.address||'') + ': Listed by ' + parts.join(' \u2022 ') + '</div>';
    }
  });

  // Timestamp
  document.getElementById('cpUpdated').textContent = 'Data last updated: ' + new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});

  // Column count class for responsive scaling
  var printEl = document.getElementById('comparePrintPage');
  printEl.className = 'compare-print-page cp-cols-' + props.length;

  // Hide single-property print page, show compare print page
  var singlePrint = document.getElementById('printPage');
  if(singlePrint) singlePrint.style.display = 'none';
  window.print();
  // Restore after print
  if(singlePrint) singlePrint.style.display = '';
}

// ═══ PROPERTY HISTORY (Price + Tax) ═══

async function loadPropertyHistory(listing) {
  var historyEl = document.getElementById('propHistory');
  var priceBody = document.getElementById('propPriceHistoryBody');
  var priceEmpty = document.getElementById('propPriceHistoryEmpty');
  var priceTable = document.getElementById('propPriceHistoryTable');
  var taxBody = document.getElementById('propTaxHistoryBody');
  var taxEmpty = document.getElementById('propTaxHistoryEmpty');
  var taxTable = document.getElementById('propTaxHistoryTable');
  if(!historyEl) return;

  // Reset
  priceBody.innerHTML = '';
  taxBody.innerHTML = '';
  priceEmpty.style.display = 'none';
  taxEmpty.style.display = 'none';
  priceTable.style.display = '';
  taxTable.style.display = '';
  historyEl.style.display = '';

  var hasPriceData = false;
  var hasTaxData = false;
  var listingKey = listing.listingKey || null;

  // --- Price History from Supabase ---
  if(listingKey && typeof _sb !== 'undefined' && _sb) {
    try {
      var resp = await _sb.from('price_history')
        .select('price, event_type, recorded_at, source, previous_price')
        .eq('listing_key', listingKey)
        .order('recorded_at', { ascending: false });
      if(resp.data && resp.data.length > 0) {
        hasPriceData = true;
        resp.data.forEach(function(row) {
          var change = '';
          var changeClass = '';
          if(row.previous_price && row.price) {
            var diff = row.price - row.previous_price;
            var pct = ((diff / row.previous_price) * 100).toFixed(1);
            var sign = diff > 0 ? '+' : '';
            change = sign + '$' + Math.abs(diff).toLocaleString() + ' (' + sign + pct + '%)';
            changeClass = diff > 0 ? 'prop-history-up' : diff < 0 ? 'prop-history-down' : '';
          }
          var dateStr = row.recorded_at ? new Date(row.recorded_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
          var eventLabel = (row.event_type || 'Price Change').replace(/_/g,' ').replace(/\b\w/g, function(c){return c.toUpperCase();});
          priceBody.innerHTML +=
            '<tr><td>' + dateStr + '</td>' +
            '<td><span class="prop-history-event">' + eventLabel + '</span></td>' +
            '<td class="prop-history-price">' + (row.price ? '$' + row.price.toLocaleString() : '—') + '</td>' +
            '<td class="' + changeClass + '">' + change + '</td>' +
            '<td class="prop-history-source">' + (row.source || 'MLS') + '</td></tr>';
        });
      }
    } catch(err) { console.warn('[PropHistory] Price error:', err); }
  }

  // Fallback: construct from listing fields if no DB data
  if(!hasPriceData && listing.price && listing.mlsId) {
    if(listing.originalListPrice && listing.originalListPrice !== listing.price) {
      hasPriceData = true;
      var listDate = listing.listDate ? new Date(listing.listDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
      priceBody.innerHTML =
        '<tr><td>' + listDate + '</td><td><span class="prop-history-event">Listed</span></td>' +
        '<td class="prop-history-price">$' + listing.originalListPrice.toLocaleString() + '</td><td></td><td class="prop-history-source">MLS</td></tr>';
      var diff = listing.price - listing.originalListPrice;
      var pct = ((diff / listing.originalListPrice) * 100).toFixed(1);
      var sign = diff > 0 ? '+' : '';
      var cls = diff > 0 ? 'prop-history-up' : 'prop-history-down';
      priceBody.innerHTML +=
        '<tr><td>—</td><td><span class="prop-history-event">Price Change</span></td>' +
        '<td class="prop-history-price">$' + listing.price.toLocaleString() + '</td>' +
        '<td class="' + cls + '">' + sign + '$' + Math.abs(diff).toLocaleString() + ' (' + sign + pct + '%)</td><td class="prop-history-source">MLS</td></tr>';
    }
  }

  if(!hasPriceData) {
    priceEmpty.style.display = '';
    priceTable.style.display = 'none';
  }

  // --- Tax History from Supabase ---
  if(listingKey && typeof _sb !== 'undefined' && _sb) {
    try {
      var taxResp = await _sb.from('public_records')
        .select('year, tax_amount, assessed_value, land_value, improved_value, source_county')
        .eq('listing_key', listingKey)
        .order('year', { ascending: false });
      if(taxResp.data && taxResp.data.length > 0) {
        hasTaxData = true;
        taxResp.data.forEach(function(row, i) {
          var change = '';
          var changeClass = '';
          if(i < taxResp.data.length - 1) {
            var prevTax = taxResp.data[i+1].tax_amount;
            if(prevTax && row.tax_amount) {
              var diff = row.tax_amount - prevTax;
              var pct = ((diff / prevTax) * 100).toFixed(1);
              change = (diff>0?'+':'') + '$' + Math.round(Math.abs(diff)).toLocaleString() + ' (' + (diff>0?'+':'') + pct + '%)';
              changeClass = diff > 0 ? 'prop-history-up' : diff < 0 ? 'prop-history-down' : '';
            }
          }
          taxBody.innerHTML +=
            '<tr><td>' + row.year + '</td>' +
            '<td class="prop-history-price">$' + Math.round(row.tax_amount || 0).toLocaleString() + '</td>' +
            '<td class="prop-history-price">$' + Math.round(row.assessed_value || 0).toLocaleString() + '</td>' +
            '<td class="' + changeClass + '">' + change + '</td></tr>';
        });
      }
    } catch(err) { console.warn('[PropHistory] Tax error:', err); }
  }

  // Fallback: use single tax year/amount from listing
  if(!hasTaxData && listing.taxYear && listing.taxAmount) {
    hasTaxData = true;
    taxBody.innerHTML = '<tr><td>' + listing.taxYear + '</td>' +
      '<td class="prop-history-price">$' + Math.round(listing.taxAmount).toLocaleString() + '</td>' +
      '<td>—</td><td>—</td></tr>';
  }

  if(!hasTaxData) {
    taxEmpty.style.display = '';
    taxTable.style.display = 'none';
  }
}

// --- Gate the print button for non-logged-in users ---
function updatePrintGate() {
  var printBtn = document.getElementById('propPrintBtn');
  var shareWrap = printBtn ? printBtn.closest('.prop-share') : null;
  if(!printBtn || !shareWrap) return;
  var existingOverlay = shareWrap.querySelector('.gated-print-overlay');
  if(!_acctLoggedIn) {
    printBtn.classList.add('gated');
    shareWrap.classList.add('has-gated-print');
    if(!existingOverlay) {
      var ov = document.createElement('div');
      ov.className = 'gated-print-overlay';
      ov.textContent = 'Create account to print';
      ov.onclick = function(e){ e.stopPropagation(); openAcctModal(); };
      shareWrap.appendChild(ov);
    }
  } else {
    printBtn.classList.remove('gated');
    shareWrap.classList.remove('has-gated-print');
    if(existingOverlay) existingOverlay.remove();
  }
}

// --- Hook into openProp to track views & update fav button ---
var _origOpenProp = openProp;
openProp = function(listing, townName) {
  _origOpenProp(listing, townName);
  // Store current listing for features
  window._currentListing = listing;
  window._currentTownName = townName;
  // Track as viewed
  var key = propKey(listing, townName);
  _currentPropKey = key;
  _viewedProps[key] = true;
  saveViewed();
  // Update fav button
  updateFavBtn();
  // Update gated features
  setTimeout(updateGatedFeatures, 50);
  // Update print gate
  setTimeout(updatePrintGate, 60);
  // Show/hide party share button
  var partyShareBtn = document.getElementById('propPartyShareBtn');
  if(partyShareBtn) partyShareBtn.style.display = _activeParty ? '' : 'none';
  // Reset price drop button state
  var pdBtn = document.getElementById('propPriceDropBtn');
  if(pdBtn) { pdBtn.classList.remove('subscribed'); pdBtn.disabled = false; pdBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 17H2"/><path d="M6 17V4"/><path d="M12 17V10"/><path d="M18 17V7"/><path d="M3 7l3-3 3 3"/></svg> Get Price Drop Alerts'; }
  // Check if already subscribed to price drops
  if(_acctLoggedIn && _sb && _currentUser && pdBtn) {
    _sb.from('price_drop_subscriptions').select('id').eq('user_id', _currentUser.id).eq('property_key', key).single().then(function(r) {
      if(r.data) { pdBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg> Subscribed'; pdBtn.classList.add('subscribed'); }
    });
  }
  // Show notes for logged-in users — party transcript or personal textarea
  var notesWrap = document.getElementById('propNotesWrap');
  if(notesWrap) {
    notesWrap.style.display = _acctLoggedIn ? '' : 'none';
    if(_acctLoggedIn && _activeParty) {
      // === Search Party Notes (transcript mode) ===
      var memberCount = _activeParty.members ? _activeParty.members.length : 0;
      notesWrap.innerHTML =
        '<div class="prop-notes-header">' +
          '<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:var(--gold);fill:none;stroke-width:2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' +
          '<div class="prop-notes-title">Search Party Notes</div>' +
          '<span class="party-member-badge">' + memberCount + ' member' + (memberCount !== 1 ? 's' : '') + '</span>' +
        '</div>' +
        '<div class="party-transcript" id="partyTranscript"><div class="party-empty-notes">Loading notes...</div></div>' +
        '<div class="party-note-input-row">' +
          '<textarea class="party-note-ta" id="partyNoteInput" placeholder="Share your thoughts with the party..." rows="2"></textarea>' +
          '<button class="party-note-send" onclick="sendPartyNote(\'' + key.replace(/'/g, "\\'") + '\')">Send</button>' +
        '</div>' +
        '<div class="prop-notes-hint"><svg viewBox="0 0 24 24" width="12" height="12" style="stroke:var(--text-muted);fill:none;stroke-width:2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Shared with your Search Party. All notes appear on printed property sheets.</div>';
      // Enter key sends note
      setTimeout(function() {
        var inp = document.getElementById('partyNoteInput');
        if(inp) {
          inp.addEventListener('keydown', function(e) {
            if(e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendPartyNote(key);
            }
          });
        }
      }, 50);
      // Load party notes
      loadPartyNotes(key).then(function(){ renderPartyTranscript(key); });
    } else if(_acctLoggedIn) {
      // === Solo mode (personal textarea — original behavior) ===
      notesWrap.innerHTML =
        '<div class="prop-notes-header">' +
          '<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:var(--gold);fill:none;stroke-width:2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
          '<div class="prop-notes-title">Your Notes</div>' +
        '</div>' +
        '<textarea class="prop-notes-ta" id="propNotesTA" placeholder="Jot down thoughts, questions, or things to look for at the showing..."></textarea>' +
        '<div class="prop-notes-hint"><svg viewBox="0 0 24 24" width="12" height="12" style="stroke:var(--text-muted);fill:none;stroke-width:2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Notes appear on your printed property sheet</div>';
      var notesTA = document.getElementById('propNotesTA');
      if(notesTA) {
        var localNote = ''; try { localNote = localStorage.getItem('cc-note-'+key) || ''; } catch(e){}
        notesTA.value = localNote;
        if(_currentUser) {
          loadPropertyNote(key).then(function(cloudNote) {
            if(cloudNote !== null) notesTA.value = cloudNote;
            else if(localNote) savePropertyNote(key, localNote);
          });
        }
        var _noteTimer = null;
        notesTA.oninput = function(){
          try{ if(notesTA.value) localStorage.setItem('cc-note-'+key, notesTA.value); else localStorage.removeItem('cc-note-'+key); }catch(e){}
          clearTimeout(_noteTimer);
          _noteTimer = setTimeout(function(){ if(_acctLoggedIn) { savePropertyNote(key, notesTA.value); logActivity('note', key, {}); } }, 1500);
        };
      }
    }
  }
  // Log viewing history to cloud
  if(_acctLoggedIn && _currentUser) {
    logViewingHistory(key, listing, townName);
    logActivity('view', key, {address: listing.address, city: townName});
    checkHighIntent(key, listing.address || key);
  }
  // Show/hide Ask Cory section
  var askCory = document.getElementById('propAskCory');
  if(askCory) askCory.style.display = _acctLoggedIn ? '' : 'none';
  if(_acctLoggedIn) loadPropertyQuestions(key);
  // Remove previous showing request form
  var oldShowForm = document.getElementById('showingRequestForm');
  if(oldShowForm) oldShowForm.remove();
  // Render neighborhood and distances
  var townSlug = '';
  var tn = (townName||listing.city||'').toLowerCase().replace(/\s*\/\s*/g,'-').replace(/\s+/g,'-');
  if(NEIGHBORHOOD_DATA[tn]) townSlug = tn;
  renderNeighborhoodDive(townSlug);
  renderDistances(townSlug);
  // Admin print buttons
  var printBtn = document.getElementById('propInfoPrintBtn');
  if(printBtn && _isAdmin) {
    var wrap = printBtn.parentElement;
    if(wrap && !document.getElementById('adminPrintBtns')) {
      wrap.insertAdjacentHTML('beforeend', '<div id="adminPrintBtns" class="admin-print-btns"><button class="prop-info-print-btn" onclick="printAgentCopy()"><svg viewBox="0 0 24 24"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg><span>Agent Copy</span></button><button class="prop-info-print-btn" onclick="printClientCopy()"><svg viewBox="0 0 24 24"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg><span>Client Copy</span></button></div>');
    }
  }
  var adminPrintBtns = document.getElementById('adminPrintBtns');
  if(adminPrintBtns) adminPrintBtns.style.display = _isAdmin ? '' : 'none';
  // Load property history (price + tax)
  setTimeout(function(){ loadPropertyHistory(listing); }, 65);
  // Build Cory's Take
  setTimeout(function(){ buildCorysTake(listing, townName); }, 70);
  // Build Cory's Suggestions
  setTimeout(function(){ buildCorysSuggestions(listing, townName); }, 80);
  // Update card/marker states
  srApplyViewedFavStates();
};

// --- Apply viewed/favorited states to search result cards & map markers ---
function srApplyViewedFavStates() {
  // Update ALL heart icons on page (all card types)
  document.querySelectorAll('.card-fav-heart').forEach(function(h){
    var k = h.getAttribute('data-key');
    if(k) h.classList.toggle('saved', !!_favProps[k]);
  });

  if(!_srCurrentResults || !_srCurrentResults.length) return;

  var cards = document.querySelectorAll('.sr-card');

  _srCurrentResults.forEach(function(l, i){
    var key = propKey(l, l.city);
    var card = cards[i];
    var marker = _srMarkers[i];

    // Card states
    if(card) {
      card.classList.remove('viewed','fav-card');
      if(_favProps[key]) {
        card.classList.add('fav-card');
      } else if(_viewedProps[key]) {
        card.classList.add('viewed');
      }
    }

    // Marker states
    if(marker) {
      var el = marker.getElement();
      if(el) {
        var pm = el.querySelector('.sr-price-marker');
        if(pm) {
          pm.classList.remove('viewed-marker','fav-marker');
          if(_favProps[key]) {
            pm.classList.add('fav-marker');
          } else if(_viewedProps[key]) {
            pm.classList.add('viewed-marker');
          }
        }
      }
    }
  });
}

// --- Hook into srApplyFilters to apply states after render ---
var _origSrApplyFilters = srApplyFilters;
srApplyFilters = function() {
  _origSrApplyFilters();
  setTimeout(srApplyViewedFavStates, 100);
};

// --- Init account UI ---
updateAcctUI();
gateRestrictionFilters();
// Re-run after brief delay to catch any late-rendered elements
setTimeout(gateRestrictionFilters, 500);

// --- Gate all restriction filter dropdowns across the site ---
function gateRestrictionFilters() {
  // Hero search restriction
  var heroField = document.getElementById('hsRestrictField');
  var heroSelect = document.getElementById('hsRestrict');
  if(heroField) {
    if(_acctLoggedIn) {
      heroField.classList.remove('hs-restrict-gated');
      heroField.classList.add('hs-restrict-unlocked');
      heroField.onclick = null;
      if(heroSelect) heroSelect.disabled = false;
    } else {
      heroField.classList.add('hs-restrict-gated');
      heroField.classList.remove('hs-restrict-unlocked');
      if(heroSelect) heroSelect.disabled = true;
    }
  }

  // Search results restriction chip
  var srChip = document.getElementById('srfRestrict');
  var srSelect = document.getElementById('srfRestrictSelect');
  if(srChip) {
    if(_acctLoggedIn) {
      srChip.classList.remove('sr-restrict-gated');
      srChip.classList.add('sr-restrict-unlocked');
      srChip.onclick = null;
      if(srSelect) srSelect.disabled = false;
    } else {
      srChip.classList.add('sr-restrict-gated');
      srChip.classList.remove('sr-restrict-unlocked');
      if(srSelect) srSelect.disabled = true;
    }
  }

  // All town page restriction fields
  document.querySelectorAll('.tp-restrict-gated, .tp-restrict-unlocked').forEach(function(field){
    var sel = field.querySelector('select');
    if(_acctLoggedIn) {
      field.classList.remove('tp-restrict-gated');
      field.classList.add('tp-restrict-unlocked');
      field.onclick = null;
      if(sel) sel.disabled = false;
    } else {
      field.classList.add('tp-restrict-gated');
      field.classList.remove('tp-restrict-unlocked');
      if(sel) sel.disabled = true;
    }
  });
}

// Re-gate when search overlay opens
var _origOpenSearchResults = openSearchResults;
openSearchResults = function(filters) {
  _origOpenSearchResults(filters);
  setTimeout(gateRestrictionFilters, 150);
};

// Re-gate when town pages open
var _origOpenPage = openPage;
openPage = function(id) {
  _origOpenPage(id);
  setTimeout(gateRestrictionFilters, 150);
};

// ═══ LISTING DATA INIT ═══
// MLS Grid (via Supabase) takes priority when enabled; falls back to SimplyRETS demo data
if(MLS_GRID.enabled) {
  // Restore cached listings for instant search while fresh data loads
  try {
    var _cached = JSON.parse(localStorage.getItem('cc_listings_cache'));
    if(_cached && _cached.listings && _cached.listings.length > 0) {
      ALL_LISTINGS.length = 0;
      _cached.listings.forEach(function(l){ ALL_LISTINGS.push(l); });
      // Rebuild TOWN_LISTINGS from cache
      var _cachedTowns = {};
      ALL_LISTINGS.forEach(function(l){
        var slug = MLS_GRID.resolveTown(l.city);
        if(!_cachedTowns[slug]) _cachedTowns[slug] = { display: l.city, listings: [] };
        _cachedTowns[slug].listings.push(l);
      });
      Object.keys(TOWN_LISTINGS).forEach(function(k){ delete TOWN_LISTINGS[k]; });
      Object.keys(_cachedTowns).forEach(function(k){ TOWN_LISTINGS[k] = _cachedTowns[k]; });
      // Rebuild LISTINGS (featured) from cache — 6 newest listings with photos
      var _cachedSorted = ALL_LISTINGS.filter(function(l){return l.photo}).sort(function(a,b){
        var aDays = (typeof a.daysOnMarket === 'number') ? a.daysOnMarket : 9999;
        var bDays = (typeof b.daysOnMarket === 'number') ? b.daysOnMarket : 9999;
        return aDays - bDays;
      });
      LISTINGS.length = 0;
      _cachedSorted.slice(0,6).forEach(function(l,i){
        LISTINGS.push({ id:i+1, price:l.price, address:l.address, city:l.city, type:l.type,
          beds:l.beds, baths:l.baths, sqft:l.sqft, sqftRange:l.sqftRange||'', lot:l.lot,
          photo:l.photo, photos:l.photos, days:l.daysOnMarket,
          mlsId:l.mlsId, restrictions:l.restrictions, status:l.status,
          listingKey:l.listingKey, listAgent:l.listAgent, listOffice:l.listOffice, listOfficePhone:l.listOfficePhone, attributionContact:l.attributionContact, originatingSystem:l.originatingSystem, mlsSources:l.mlsSources });
      });
      renderFeatured();
      // Also populate town featured grid from cache
      if(_isTownPage) {
        var _cPathMatch = window.location.pathname.match(/\/towns\/([a-z-]+)\.html/i);
        var _cTownSlug = _cPathMatch ? _cPathMatch[1].toLowerCase() : '';
        if(_cTownSlug && TOWN_LISTINGS[_cTownSlug]) { renderTownFeatured(_cTownSlug); townSearch(_cTownSlug); }
      }
      console.log('[MLS Grid] Loaded ' + ALL_LISTINGS.length + ' cached listings (fresh fetch in background)');
    }
  } catch(e) { console.warn('[MLS Grid] Cache restore failed:', e.message); }

  // Fetch fresh data from Supabase (overwrites cache when done)
  MLS_GRID.init().then(function(){
    if(typeof updateAcctUI === 'function') updateAcctUI();
    _checkPropDeepLink();
    // Re-render town page listings now that live data is loaded
    if(_isTownPage) {
      var pathMatch = window.location.pathname.match(/\/towns\/([a-z-]+)\.html/i);
      var townSlug = pathMatch ? pathMatch[1].toLowerCase() : '';
      if(townSlug && TOWN_LISTINGS[townSlug]) {
        townSearch(townSlug);
        // Populate featured grid with real MLS listings
        renderTownFeatured(townSlug);
        console.log('[MLS Grid] Town page refreshed: ' + townSlug + ' with ' + TOWN_LISTINGS[townSlug].listings.length + ' listings');
      }
    }
    // If search overlay is already open, refresh results with live data
    var srOverlay = document.getElementById('searchOverlay');
    if(srOverlay && srOverlay.classList.contains('active') && typeof srApplyFilters === 'function') {
      srApplyFilters();
      console.log('[MLS Grid] Search results refreshed with live data');
    }
  });
  EVENTS.init();
} else if(SIMPLYRETS.enabled) {
  var isLocal = (window.location.protocol === 'file:');
  if(isLocal) {
    console.log('[SimplyRETS] Skipped — site is running from a local file. SimplyRETS will activate automatically once hosted on your domain.');
  } else {
    SIMPLYRETS.init().then(function(){
      if(typeof updateAcctUI === 'function') updateAcctUI();
      // Check for deep link after listings load
      _checkPropDeepLink();
    });
    // Initialize community events calendar
    EVENTS.init();
  }
}

// ═══ DEEP LINK: Open property from ?prop=address&city=town query params ═══
var _propDeepLinkRef = null; // Return URL when coming from town page
function _checkPropDeepLink(){
  try {
    var params = new URLSearchParams(window.location.search);
    var propAddr = params.get('prop');
    var propCity = params.get('city');
    var ref = params.get('ref');
    if(!propAddr) return;
    if(ref) _propDeepLinkRef = ref;
    // Clean URL without reloading
    history.replaceState(null, '', window.location.pathname);
    // Search ALL_LISTINGS for a match
    var match = null;
    var addrLower = propAddr.toLowerCase();
    var cityLower = (propCity||'').toLowerCase();
    for(var i=0; i<ALL_LISTINGS.length; i++){
      var l = ALL_LISTINGS[i];
      if(l.address.toLowerCase() === addrLower && (l.city||'').toLowerCase() === cityLower){
        match = l; break;
      }
    }
    if(match){
      setTimeout(function(){ openProp(match, match.city||propCity); }, 300);
    } else {
      // Fallback: try LISTINGS (demo data)
      for(var j=0; j<LISTINGS.length; j++){
        var dl = LISTINGS[j];
        if(dl.address.toLowerCase() === addrLower && (dl.city||'').toLowerCase() === cityLower){
          match = dl; break;
        }
      }
      if(match){
        setTimeout(function(){ openProp({price:match.price,address:match.address,type:match.type,beds:match.beds,baths:match.baths,sqft:match.sqft,sqftRange:match.sqftRange||'',lot:match.lot,restrictions:match.restrictions||'unrestricted',status:match.status||'Active',photo:match.photo||null,photos:match.photos||[],description:match.description||''}, match.city||propCity); }, 300);
      }
    }
  } catch(e){ console.warn('[DeepLink] Error:', e); }
}
// Also check on page load in case SimplyRETS is disabled
if(!SIMPLYRETS.enabled) _checkPropDeepLink();

// ═══════════════════════════════════════════════════
// NEW FEATURES: 12 Account Features + Admin Dashboard
// ═══════════════════════════════════════════════════

// ═══ PROPERTY NOTES CLOUD SYNC ═══
async function loadPropertyNote(propertyKey) {
  if(!_sb || !_currentUser) return null;
  try {
    var resp = await _sb.from('property_notes').select('note_text').eq('user_id', _currentUser.id).eq('property_key', propertyKey).single();
    return resp.data ? resp.data.note_text : null;
  } catch(e) { return null; }
}
async function savePropertyNote(propertyKey, text) {
  if(!_sb || !_currentUser) return;
  try {
    await _sb.from('property_notes').upsert({
      user_id: _currentUser.id, property_key: propertyKey,
      note_text: text, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,property_key' });
  } catch(e) { console.warn('[Notes] Save error:', e); }
}

// ═══ VIEWING HISTORY ═══
async function logViewingHistory(propertyKey, listing, townName) {
  if(!_sb || !_currentUser) return;
  try {
    await _sb.from('viewing_history').insert({
      user_id: _currentUser.id, property_key: propertyKey,
      property_data: { address: listing.address, city: townName||listing.city, price: listing.price, type: listing.type, photo: listing.photo||(listing.photos&&listing.photos[0])||null, beds: listing.beds, baths: listing.baths, sqft: listing.sqft }
    });
  } catch(e) { console.warn('[History] Log error:', e); }
}
async function loadViewingHistoryUI() {
  var container = document.getElementById('acctViewingHistory');
  if(!container || !_sb || !_currentUser) return;
  container.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem">Loading...</p>';
  try {
    var resp = await _sb.from('viewing_history').select('*').eq('user_id', _currentUser.id).order('viewed_at', { ascending: false }).limit(20);
    if(!resp.data || !resp.data.length) { container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">No properties viewed yet</p>'; return; }
    container.innerHTML = '';
    var seen = {};
    resp.data.forEach(function(v) {
      if(seen[v.property_key]) return; seen[v.property_key] = true;
      var d = v.property_data || {};
      var card = document.createElement('div');
      card.className = 'suggestion-mini';
      card.style.cursor = 'pointer';
      card.innerHTML = '<img class="suggestion-mini-img" src="' + (d.photo||'') + '" alt=""><div class="suggestion-mini-info"><div class="suggestion-mini-price">$' + (d.price||0).toLocaleString() + '</div><div class="suggestion-mini-addr">' + (d.address||'') + ', ' + (d.city||'') + '</div></div>';
      card.onclick = function() {
        closeAcctModal();
        var match = ALL_LISTINGS.find(function(l){ return propKey(l, l.city) === v.property_key; });
        if(match) { openProp(match, match.city); }
        else if(d.address) {
          // Fallback: use saved property data snapshot
          openProp({
            price:d.price||0, address:d.address, type:d.type||'Single Family',
            beds:d.beds||0, baths:d.baths||0, sqft:d.sqft||0, lot:d.lot||'',
            restrictions:d.restrictions||'unrestricted', status:d.status||'Active',
            photo:d.photo||null, photos:d.photos||[], description:d.description||'',
            mlsId:d.mlsId||'', listingKey:d.listingKey||'',
            listAgent:d.listAgent||'', listOffice:d.listOffice||'', listOfficePhone:d.listOfficePhone||'',
            attributionContact:d.attributionContact||''
          }, d.city||'');
        }
      };
      container.appendChild(card);
    });
  } catch(e) { container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Could not load history</p>'; }
}

// ═══ USER ACTIVITY LOGGING ═══
async function logActivity(type, propertyKey, metadata) {
  if(!_sb || !_currentUser) return;
  try {
    await _sb.from('user_activity').insert({
      user_id: _currentUser.id, activity_type: type,
      property_key: propertyKey || null, metadata: metadata || {}
    });
  } catch(e) { /* silent fail */ }
}

// ═══ ACTIVITY ALERTS → FOLLOW UP BOSS ═══

// Re-engagement: detect users returning after 7+ days of inactivity
async function checkReengagement() {
  if(!_sb || !_currentUser) return;
  var sentKey = 'cc_reengagement_' + new Date().toDateString();
  if(localStorage.getItem(sentKey)) return;
  try {
    var resp = await _sb.from('user_activity')
      .select('created_at')
      .eq('user_id', _currentUser.id)
      .order('created_at', { ascending: false })
      .limit(1);
    if(!resp.data || !resp.data.length) return; // brand new user, no history yet
    var lastActivity = new Date(resp.data[0].created_at);
    var daysSince = Math.floor((Date.now() - lastActivity.getTime()) / 86400000);
    if(daysSince >= 7) {
      localStorage.setItem(sentKey, '1');
      var prof = {}; try { prof = JSON.parse(localStorage.getItem('cc_profile')||'{}'); } catch(e){}
      var userName = ((prof.firstName||'') + ' ' + (prof.lastName||'')).trim() || _currentUser.email;
      _pushToFUB({
        email: _currentUser.email,
        first_name: prof.firstName || '',
        last_name: prof.lastName || '',
        source: 'reengagement',
        message: 'Re-engaged after ' + daysSince + ' days — ' + userName + ' is back on CoryHelpsYouMove.com'
      });
      console.log('[Activity] Re-engagement alert sent (' + daysSince + ' days)');
    }
  } catch(e) { console.warn('[Reengagement] Check failed:', e); }
}

// High-intent: detect when a user views the same property 3+ times
async function checkHighIntent(propertyKey, address) {
  if(!_sb || !_currentUser) return;
  var alertKey = 'cc_highintent_' + propertyKey;
  if(localStorage.getItem(alertKey)) return;
  try {
    var resp = await _sb.from('user_activity')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', _currentUser.id)
      .eq('activity_type', 'view')
      .eq('property_key', propertyKey);
    if(resp.count >= 3) {
      localStorage.setItem(alertKey, '1');
      var prof = {}; try { prof = JSON.parse(localStorage.getItem('cc_profile')||'{}'); } catch(e){}
      var userName = ((prof.firstName||'') + ' ' + (prof.lastName||'')).trim() || _currentUser.email;
      _pushToFUB({
        email: _currentUser.email,
        first_name: prof.firstName || '',
        last_name: prof.lastName || '',
        source: 'high_intent',
        message: 'High intent — ' + userName + ' viewed ' + address + ' ' + resp.count + ' times'
      });
      console.log('[Activity] High-intent alert sent for ' + address + ' (' + resp.count + ' views)');
    }
  } catch(e) { console.warn('[HighIntent] Check failed:', e); }
}

// ═══ NOTIFICATION CENTER ═══
async function loadNotificationCount() {
  if(!_sb || !_currentUser) return;
  try {
    var resp = await _sb.from('alert_notifications').select('id', {count:'exact', head:true}).eq('user_id', _currentUser.id).eq('is_read', false);
    var badge = document.getElementById('notifBadge');
    if(badge) {
      var count = resp.count || 0;
      badge.textContent = count;
      badge.style.display = count > 0 ? '' : 'none';
    }
  } catch(e) {}
}
function toggleNotifPanel() {
  var panel = document.getElementById('notifPanel');
  if(!panel) return;
  if(panel.style.display === 'none') { panel.style.display = ''; loadNotifications(); }
  else panel.style.display = 'none';
}
async function loadNotifications() {
  var list = document.getElementById('notifList');
  if(!list || !_sb || !_currentUser) return;
  list.innerHTML = '<p style="padding:1rem;color:var(--text-muted);font-size:0.8rem">Loading...</p>';
  try {
    var resp = await _sb.from('alert_notifications').select('*').eq('user_id', _currentUser.id).order('created_at', {ascending:false}).limit(20);
    if(!resp.data || !resp.data.length) { list.innerHTML = '<p style="padding:1rem;color:var(--text-muted);font-size:0.85rem">No notifications yet</p>'; return; }
    list.innerHTML = '';
    resp.data.forEach(function(n) {
      var item = document.createElement('div');
      item.className = 'notif-item' + (n.is_read ? '' : ' unread');
      var icon = n.alert_type === 'price_drop' ? '$' : n.alert_type === 'new_listing_match' ? '🏠' : n.alert_type === 'question_response' ? '💬' : '🔔';
      var ago = timeAgo(n.created_at);
      item.innerHTML = '<div class="notif-icon">' + icon + '</div><div class="notif-text"><div class="notif-msg">' + (n.title || n.message) + '</div><div class="notif-time">' + ago + '</div></div>';
      item.onclick = function() { markNotifRead(n.id); item.classList.remove('unread'); };
      list.appendChild(item);
    });
  } catch(e) { list.innerHTML = '<p style="padding:1rem;color:var(--text-muted)">Could not load</p>'; }
}
async function markNotifRead(id) {
  if(!_sb) return;
  try { await _sb.from('alert_notifications').update({is_read:true}).eq('id', id); loadNotificationCount(); } catch(e) {}
}
async function markAllNotifsRead() {
  if(!_sb || !_currentUser) return;
  try { await _sb.from('alert_notifications').update({is_read:true}).eq('user_id', _currentUser.id).eq('is_read', false); loadNotificationCount(); loadNotifications(); } catch(e) {}
}
function timeAgo(dateStr) {
  var diff = Date.now() - new Date(dateStr).getTime();
  var mins = Math.floor(diff/60000);
  if(mins < 1) return 'just now';
  if(mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins/60);
  if(hrs < 24) return hrs + 'h ago';
  var days = Math.floor(hrs/24);
  if(days < 7) return days + 'd ago';
  return new Date(dateStr).toLocaleDateString();
}

// ═══ PRICE DROP SUBSCRIPTION ═══
async function subscribePriceDrop() {
  if(!_acctLoggedIn) { openAcctModal(); return; }
  if(!_sb || !_currentUser || !_currentPropKey) return;
  var btn = document.getElementById('propPriceDropBtn');
  var listing = window._currentListing || {};
  var price = listing.price || parseInt((document.getElementById('propPrice').textContent||'0').replace(/[^0-9]/g,''));
  if(!price) { showToast('No price available for this listing', 'error'); return; }
  try {
    if(btn) { btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M22 17H2"/><path d="M6 17V4"/><path d="M12 17V10"/><path d="M18 17V7"/><path d="M3 7l3-3 3 3"/></svg> Subscribing...'; btn.disabled = true; }
    await _sb.from('price_drop_subscriptions').upsert({
      user_id: _currentUser.id,
      property_key: _currentPropKey,
      listing_key: listing.listingKey || '',
      current_price: price
    });
    showToast('You\'ll be notified if the price drops!', 'success');
    if(btn) { btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg> Subscribed'; btn.classList.add('subscribed'); }
    logActivity('price_drop_sub', _currentPropKey, {price: price});
  } catch(e) {
    console.warn('[PriceDrop] Subscribe error:', e);
    showToast('Failed to subscribe', 'error');
    if(btn) { btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M22 17H2"/><path d="M6 17V4"/><path d="M12 17V10"/><path d="M18 17V7"/><path d="M3 7l3-3 3 3"/></svg> Get Price Drop Alerts'; btn.disabled = false; }
  }
}

// ═══ SHARE WITH SEARCH PARTY ═══
function quickPartyShare() {
  if(!_activeParty) return;
  // Scroll to party notes and focus input
  var transcript = document.getElementById('partyTranscript');
  if(transcript) transcript.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(function(){
    var input = document.getElementById('partyNoteInput');
    if(input) input.focus();
  }, 400);
  // Auto-favorite if not already
  if(!_favProps[_currentPropKey]) {
    toggleFavProp();
  }
}

// ═══ SHOWING REQUEST ═══
function todayStr() { var d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function openShowingRequest() {
  if(!_acctLoggedIn) { openAcctModal(); return; }
  var existing = document.getElementById('showingRequestForm');
  if(existing) { existing.style.display = existing.style.display === 'none' ? '' : 'none'; if(existing.style.display === '') existing.scrollIntoView({behavior:'smooth'}); return; }
  var btn = document.getElementById('propShowingBtn');
  if(!btn) return;
  var wrap = btn.closest('.prop-agent');
  if(!wrap) return;
  var html = '<div id="showingRequestForm" class="showing-form">' +
    '<div class="prop-section-label">Request a Showing</div>' +
    '<p class="showing-form-sub">Choose up to 3 preferred times and I\'ll confirm one that works for both of us.</p>' +
    '<div class="showing-slot"><label>Option 1 *</label><div class="showing-slot-row"><input type="date" id="showDate1" class="showing-input" min="' + todayStr() + '"><input type="time" id="showTime1" class="showing-input" value="10:00"></div></div>' +
    '<div class="showing-slot"><label>Option 2 *</label><div class="showing-slot-row"><input type="date" id="showDate2" class="showing-input" min="' + todayStr() + '"><input type="time" id="showTime2" class="showing-input" value="14:00"></div></div>' +
    '<div class="showing-slot"><label>Option 3 (optional)</label><div class="showing-slot-row"><input type="date" id="showDate3" class="showing-input" min="' + todayStr() + '"><input type="time" id="showTime3" class="showing-input"></div></div>' +
    '<textarea id="showMessage" class="prop-notes-ta" placeholder="Any notes for the showing..." rows="2"></textarea>' +
    '<button class="acct-submit" id="showSubmitBtn" onclick="submitShowingRequest()">Request Showing</button>' +
  '</div>';
  wrap.insertAdjacentHTML('afterend', html);
  document.getElementById('showingRequestForm').scrollIntoView({behavior:'smooth'});
}
async function submitShowingRequest() {
  var slots = [];
  for(var i=1; i<=3; i++) {
    var d = document.getElementById('showDate'+i); var t = document.getElementById('showTime'+i);
    if(d && t && d.value && t.value) slots.push({date: d.value, time: t.value});
  }
  if(slots.length < 2) { alert('Please select at least 2 preferred times.'); return; }
  var btn = document.getElementById('showSubmitBtn');
  if(btn) { btn.textContent = 'Sending...'; btn.disabled = true; }
  var prof = {}; try { prof = JSON.parse(localStorage.getItem('cc_profile')||'{}'); } catch(e) {}
  try {
    await _sb.from('showing_requests').insert({
      user_id: _currentUser.id, property_key: _currentPropKey,
      property_data: { address: window._currentListing.address, city: window._currentTownName, price: window._currentListing.price, photo: window._currentListing.photo||(window._currentListing.photos&&window._currentListing.photos[0])||'' },
      preferred_slots: slots, status: 'pending',
      user_name: (prof.firstName||'')+' '+(prof.lastName||''), user_email: prof.email||'', user_phone: prof.phone||''
    });
    logActivity('showing_request', _currentPropKey, {slots: slots});
    // Push showing request to Follow Up Boss
    _pushToFUB({
      email: prof.email || _currentUser.email,
      first_name: prof.firstName || '',
      last_name: prof.lastName || '',
      phone: prof.phone || '',
      source: 'showing_request',
      message: 'Showing requested for ' + (window._currentListing.address || _currentPropKey) +
        ' — ' + slots.map(function(s){ return s.date + ' ' + s.time; }).join(', ')
    });
    var form = document.getElementById('showingRequestForm');
    if(form) form.innerHTML = '<div class="showing-success"><svg viewBox="0 0 24 24" style="width:32px;height:32px;stroke:var(--gold);fill:none;stroke-width:2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg><h4>Request Sent!</h4><p>I\'ll get back to you shortly to confirm a time.</p></div>';
  } catch(e) { alert('Could not send request. Please try again.'); if(btn) { btn.textContent = 'Request Showing'; btn.disabled = false; } }
}

// ═══ ASK CORY PER-PROPERTY QUESTIONS ═══
async function loadPropertyQuestions(propertyKey) {
  var list = document.getElementById('propQuestionsList');
  if(!list || !_sb || !_currentUser) return;
  list.innerHTML = '';
  try {
    var resp = await _sb.from('property_questions').select('*').eq('user_id', _currentUser.id).eq('property_key', propertyKey).order('created_at', {ascending: true});
    if(!resp.data || !resp.data.length) return;
    resp.data.forEach(function(q) {
      var div = document.createElement('div');
      div.className = 'prop-qa-item';
      div.innerHTML = '<div class="prop-qa-q"><strong>You:</strong> ' + q.question_text + '</div>' +
        (q.response_text ? '<div class="prop-qa-a"><strong>Cory:</strong> ' + q.response_text + '</div>' : '<div class="prop-qa-pending">Awaiting response</div>');
      list.appendChild(div);
    });
  } catch(e) {}
}
async function submitPropertyQuestion() {
  var ta = document.getElementById('propQuestionTA');
  if(!ta || !ta.value.trim()) return;
  if(!_acctLoggedIn) { openAcctModal(); return; }
  var text = ta.value.trim();
  ta.value = '';
  var prof = {}; try { prof = JSON.parse(localStorage.getItem('cc_profile')||'{}'); } catch(e) {}
  try {
    await _sb.from('property_questions').insert({
      user_id: _currentUser.id, property_key: _currentPropKey,
      property_data: { address: window._currentListing.address, city: window._currentTownName, price: window._currentListing.price },
      question_text: text,
      user_name: (prof.firstName||'')+' '+(prof.lastName||''), user_email: prof.email||''
    });
    logActivity('question', _currentPropKey, {question: text});
    loadPropertyQuestions(_currentPropKey);
  } catch(e) { alert('Could not send question. Please try again.'); }
}

// ═══ NEIGHBORHOOD DATA (static) ═══
var NEIGHBORHOOD_DATA = {
  'waynesville': { schools: {district:'Haywood County Schools', range:'4–9', url:'https://www.greatschools.org/north-carolina/waynesville/'}, walkability: {score:52, label:'Somewhat Walkable'}, commute: {avg:25, to:'Asheville'}, amenities: {restaurants:45, breweries:4, parks:8, trailheads:12} },
  'sylva': { schools: {district:'Jackson County Public Schools', range:'5–7', url:'https://www.greatschools.org/north-carolina/sylva/'}, walkability: {score:48, label:'Car-Dependent'}, commute: {avg:50, to:'Asheville'}, amenities: {restaurants:30, breweries:3, parks:5, trailheads:8} },
  'maggie-valley': { schools: {district:'Haywood County Schools', range:'4–9', url:'https://www.greatschools.org/north-carolina/maggie-valley/'}, walkability: {score:20, label:'Car-Dependent'}, commute: {avg:40, to:'Asheville'}, amenities: {restaurants:25, breweries:1, parks:3, trailheads:15} },
  'bryson-city': { schools: {district:'Swain County Schools', range:'2–7', url:'https://www.greatschools.org/north-carolina/bryson-city/'}, walkability: {score:45, label:'Somewhat Walkable'}, commute: {avg:65, to:'Asheville'}, amenities: {restaurants:35, breweries:2, parks:4, trailheads:20} },
  'cashiers-highlands': { schools: {district:'Jackson & Macon County Schools', range:'4–6', url:'https://www.greatschools.org/north-carolina/cashiers/'}, walkability: {score:25, label:'Car-Dependent'}, commute: {avg:75, to:'Asheville'}, amenities: {restaurants:40, breweries:1, parks:6, trailheads:10} },
  'franklin': { schools: {district:'Macon County Schools', range:'5–8', url:'https://www.greatschools.org/north-carolina/franklin/'}, walkability: {score:40, label:'Car-Dependent'}, commute: {avg:60, to:'Asheville'}, amenities: {restaurants:35, breweries:2, parks:5, trailheads:8} },
  'dillsboro': { schools: {district:'Jackson County Public Schools', range:'5–7', url:'https://www.greatschools.org/north-carolina/sylva/'}, walkability: {score:55, label:'Somewhat Walkable'}, commute: {avg:52, to:'Asheville'}, amenities: {restaurants:12, breweries:1, parks:3, trailheads:6} },
  'cullowhee': { schools: {district:'Jackson County Public Schools', range:'2–7', url:'https://www.greatschools.org/north-carolina/cullowhee/'}, walkability: {score:35, label:'Car-Dependent'}, commute: {avg:55, to:'Asheville'}, amenities: {restaurants:15, breweries:1, parks:4, trailheads:7} }
};
function renderNeighborhoodDive(townSlug) {
  var container = document.getElementById('neighborhoodDive');
  if(!container) return;
  var data = NEIGHBORHOOD_DATA[townSlug];
  if(!data) { container.innerHTML = ''; return; }
  container.innerHTML =
    '<div class="nd-grid">' +
      '<div class="nd-card"><div class="nd-card-icon"><svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg></div><div class="nd-card-label">Schools</div><div class="nd-card-value">' + data.schools.range + '/10</div><div class="nd-card-detail"><a href="' + data.schools.url + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">' + data.schools.district + '</a></div></div>' +
      '<div class="nd-card"><div class="nd-card-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg></div><div class="nd-card-label">Walkability</div><div class="nd-card-value">' + data.walkability.score + '</div><div class="nd-card-detail">' + data.walkability.label + '</div></div>' +
      '<div class="nd-card"><div class="nd-card-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div><div class="nd-card-label">Commute</div><div class="nd-card-value">' + data.commute.avg + ' min</div><div class="nd-card-detail">To ' + data.commute.to + '</div></div>' +
    '</div>' +
    '<div class="nd-amenities"><span class="nd-am-tag">' + data.amenities.restaurants + ' Restaurants</span><span class="nd-am-tag">' + data.amenities.breweries + ' Breweries</span><span class="nd-am-tag">' + data.amenities.parks + ' Parks</span><span class="nd-am-tag">' + data.amenities.trailheads + ' Trailheads</span></div>' +
    '<div class="nd-links">' +
      '<a href="https://www.walkscore.com/score/' + encodeURIComponent((window._currentListing ? (window._currentListing.address + ' ' + (window._currentListing.city||'') + ' NC') : townSlug.replace(/-/g,' ') + ' NC').replace(/\s+/g,'-').toLowerCase()) + '" target="_blank" rel="noopener" class="nd-link-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> Walk Score Details</a>' +
      '<a href="https://www.greatschools.org/search/search.page?q=' + encodeURIComponent(townSlug.replace(/-/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase()}) + ', NC') + '" target="_blank" rel="noopener" class="nd-link-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg> School Ratings</a>' +
    '</div>' +
    '<div class="nd-source" style="margin-top:0.75rem;font-size:0.7rem;opacity:0.45;text-align:center">School ratings provided by <a href="https://www.greatschools.org" target="_blank" rel="noopener" style="color:inherit">GreatSchools.org</a>. Walkability estimates via <a href="https://www.walkscore.com" target="_blank" rel="noopener" style="color:inherit">Walk Score</a>. Amenity counts are approximate.</div>';
}

// ═══ COMMUTE / DISTANCE CALCULATOR (static) ═══
var TOWN_POIS = {
  'waynesville': { hospital:[{n:'Haywood Regional Medical',d:'5 min',m:2.1}], grocery:[{n:'Ingles Markets',d:'3 min',m:1.2},{n:'Publix',d:'8 min',m:3.5}], schools:[{n:'Waynesville Middle',d:'7 min',m:2.8},{n:'Tuscola High',d:'10 min',m:4.1}], downtown:[{n:'Downtown Waynesville',d:'5 min',m:1.8}], outdoors:[{n:'Blue Ridge Parkway',d:'15 min',m:8.2},{n:'Great Smoky Mtns NP',d:'25 min',m:15}] },
  'sylva': { hospital:[{n:'Harris Regional Hospital',d:'5 min',m:1.5}], grocery:[{n:'Ingles Markets',d:'4 min',m:1.4},{n:'Sav-Mor',d:'3 min',m:0.8}], schools:[{n:'Sylva-Webster Elem',d:'5 min',m:1.6},{n:'Smoky Mountain High',d:'8 min',m:3.2}], downtown:[{n:'Downtown Sylva',d:'3 min',m:0.9}], outdoors:[{n:'Pinnacle Park Trail',d:'5 min',m:1.5},{n:'Great Smoky Mtns NP',d:'35 min',m:22}] },
  'maggie-valley': { hospital:[{n:'Haywood Regional Medical',d:'20 min',m:10}], grocery:[{n:'Ingles Markets',d:'5 min',m:2.2}], schools:[{n:'Jonathan Valley Elem',d:'8 min',m:3}], downtown:[{n:'Soco Road (Main)',d:'3 min',m:1}], outdoors:[{n:'Cataloochee Ski',d:'10 min',m:5},{n:'Blue Ridge Parkway',d:'10 min',m:5.5},{n:'Great Smoky Mtns NP',d:'15 min',m:8}] },
  'bryson-city': { hospital:[{n:'Swain Community Hospital',d:'5 min',m:1.8}], grocery:[{n:'Ingles Markets',d:'5 min',m:2}], schools:[{n:'Swain County Schools',d:'7 min',m:2.5}], downtown:[{n:'Downtown Bryson City',d:'3 min',m:0.8}], outdoors:[{n:'Great Smoky Mtns NP',d:'5 min',m:3},{n:'Nantahala Gorge',d:'15 min',m:10},{n:'Deep Creek Trails',d:'5 min',m:2}] },
  'cashiers-highlands': { hospital:[{n:'Highlands-Cashiers Hospital',d:'10 min',m:5}], grocery:[{n:'Ingles Markets',d:'8 min',m:3.5}], schools:[{n:'Summit Charter School',d:'5 min',m:2}], downtown:[{n:'Cashiers Crossroads',d:'5 min',m:1.5},{n:'Downtown Highlands',d:'15 min',m:8}], outdoors:[{n:'Whiteside Mountain',d:'10 min',m:5},{n:'Panthertown Valley',d:'15 min',m:8}] },
  'franklin': { hospital:[{n:'Angel Medical Center',d:'5 min',m:2}], grocery:[{n:'Ingles Markets',d:'4 min',m:1.5},{n:'Bi-Lo',d:'5 min',m:2}], schools:[{n:'Macon County Schools',d:'7 min',m:3}], downtown:[{n:'Downtown Franklin',d:'5 min',m:1.5}], outdoors:[{n:'Appalachian Trail',d:'20 min',m:12},{n:'Nantahala NF',d:'15 min',m:8}] },
  'dillsboro': { hospital:[{n:'Harris Regional Hospital',d:'8 min',m:3}], grocery:[{n:'Ingles (Sylva)',d:'8 min',m:3.5}], schools:[{n:'Sylva-Webster Elem',d:'8 min',m:3}], downtown:[{n:'Downtown Dillsboro',d:'2 min',m:0.5},{n:'Downtown Sylva',d:'5 min',m:2.5}], outdoors:[{n:'Tuckasegee River',d:'2 min',m:0.3},{n:'Great Smoky Mtns NP',d:'30 min',m:20}] },
  'cullowhee': { hospital:[{n:'Harris Regional Hospital',d:'10 min',m:4}], grocery:[{n:'Ingles (Sylva)',d:'10 min',m:4.5}], schools:[{n:'Cullowhee Valley School',d:'3 min',m:1},{n:'WCU (University)',d:'2 min',m:0.5}], downtown:[{n:'Downtown Sylva',d:'10 min',m:5}], outdoors:[{n:'Pinnacle Park',d:'12 min',m:5.5},{n:'Tuckasegee River',d:'5 min',m:2}] }
};
var POI_LABELS = {hospital:'Medical',grocery:'Grocery',schools:'Schools',downtown:'Downtown',outdoors:'Outdoors & Trails'};
var POI_ICONS = {hospital:'<svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',grocery:'<svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>',schools:'<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>',downtown:'<svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/></svg>',outdoors:'<svg viewBox="0 0 24 24"><path d="M17 21H7l5-10 5 10z"/><path d="M12.5 7.5L16 14"/><path d="M8 14l3.5-6.5"/><path d="M21 21H3"/></svg>'};
function renderDistances(townSlug) {
  var container = document.getElementById('propDistances');
  if(!container) return;
  var pois = TOWN_POIS[townSlug];
  if(!pois) { container.innerHTML = ''; return; }
  var html = '';
  Object.keys(POI_LABELS).forEach(function(cat) {
    if(!pois[cat] || !pois[cat].length) return;
    html += '<div class="prop-distance-card"><div class="prop-distance-category">' + (POI_ICONS[cat]||'') + ' ' + POI_LABELS[cat] + '</div>';
    pois[cat].forEach(function(p) {
      html += '<div class="prop-distance-item"><span>' + p.n + '</span><span class="prop-distance-time">' + p.d + '</span></div>';
    });
    html += '</div>';
  });
  container.innerHTML = html;
}

// ═══ COST OF LIVING ESTIMATOR ═══
var COST_OF_LIVING = {
  'National Average': {housing:100,groceries:100,utilities:100,transport:100,healthcare:100},
  'Waynesville': {housing:72,groceries:96,utilities:92,transport:88,healthcare:95},
  'Sylva': {housing:68,groceries:95,utilities:90,transport:86,healthcare:94},
  'Maggie Valley': {housing:70,groceries:96,utilities:91,transport:90,healthcare:95},
  'Bryson City': {housing:65,groceries:94,utilities:89,transport:85,healthcare:93},
  'Cashiers / Highlands': {housing:110,groceries:100,utilities:93,transport:88,healthcare:96},
  'Franklin': {housing:62,groceries:93,utilities:88,transport:84,healthcare:92},
  'Dillsboro': {housing:66,groceries:94,utilities:89,transport:86,healthcare:93},
  'Cullowhee': {housing:64,groceries:94,utilities:89,transport:85,healthcare:93},
  'Atlanta, GA': {housing:105,groceries:102,utilities:98,transport:110,healthcare:103},
  'Charlotte, NC': {housing:98,groceries:100,utilities:96,transport:105,healthcare:101},
  'Raleigh, NC': {housing:100,groceries:99,utilities:97,transport:102,healthcare:100},
  'Miami, FL': {housing:145,groceries:108,utilities:103,transport:112,healthcare:107},
  'New York, NY': {housing:230,groceries:115,utilities:110,transport:130,healthcare:112},
  'Chicago, IL': {housing:95,groceries:103,utilities:99,transport:108,healthcare:104},
  'Nashville, TN': {housing:105,groceries:98,utilities:93,transport:100,healthcare:99},
  'Tampa, FL': {housing:100,groceries:103,utilities:101,transport:105,healthcare:100},
  'Denver, CO': {housing:125,groceries:103,utilities:95,transport:105,healthcare:103}
};
function openCol() {
  if(!_acctLoggedIn) { openAcctModal(); return; }
  var overlay = document.getElementById('colOverlay');
  if(!overlay) return;
  overlay.style.display = 'flex';
  _lockScroll();
  renderColUI();
}
function closeCol() {
  var o = document.getElementById('colOverlay'); if(o) o.style.display = 'none';
  _unlockScroll();
}
function renderColUI() {
  var body = document.getElementById('colBody');
  if(!body) return;
  var cities = Object.keys(COST_OF_LIVING);
  var wncCities = cities.filter(function(c){ return !c.match(/,/) && c !== 'National Average'; });
  var otherCities = cities.filter(function(c){ return c.match(/,/) || c === 'National Average'; });
  var html = '<div class="col-container"><div class="col-selects"><div class="col-select-wrap"><label>Compare from</label><select id="colFrom" onchange="updateColComparison()"><option value="">Select a city...</option>';
  otherCities.forEach(function(c){ html += '<option value="' + c + '">' + c + '</option>'; });
  html += '</select></div><div class="col-vs">vs</div><div class="col-select-wrap"><label>Moving to</label><select id="colTo" onchange="updateColComparison()"><option value="">Select a WNC town...</option>';
  wncCities.forEach(function(c){ html += '<option value="' + c + '">' + c + '</option>'; });
  html += '</select></div></div><div id="colResults"></div></div>';
  body.innerHTML = html;
}
function updateColComparison() {
  var from = document.getElementById('colFrom').value;
  var to = document.getElementById('colTo').value;
  var results = document.getElementById('colResults');
  if(!from || !to || !results) { if(results) results.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem">Select both cities to compare</p>'; return; }
  var fd = COST_OF_LIVING[from]; var td = COST_OF_LIVING[to];
  if(!fd || !td) return;
  var categories = ['housing','groceries','utilities','transport','healthcare'];
  var labels = {housing:'Housing',groceries:'Groceries',utilities:'Utilities',transport:'Transportation',healthcare:'Healthcare'};
  var overall_from = 0, overall_to = 0;
  categories.forEach(function(c){ overall_from += fd[c]; overall_to += td[c]; });
  overall_from = Math.round(overall_from / categories.length);
  overall_to = Math.round(overall_to / categories.length);
  var diff = overall_to - overall_from;
  var diffLabel = diff < 0 ? '<span style="color:var(--green)">' + Math.abs(diff) + '% lower</span>' : diff > 0 ? '<span style="color:#c07070">' + diff + '% higher</span>' : '<span>Same</span>';
  var html = '<div class="col-summary"><div class="col-summary-title">Overall Cost of Living</div><div class="col-summary-diff">' + to + ' is ' + diffLabel + ' than ' + from + '</div></div><div class="col-bars">';
  categories.forEach(function(cat) {
    var fv = fd[cat]; var tv = td[cat];
    var max = Math.max(fv, tv, 100);
    var cdiff = tv - fv;
    var clr = cdiff < 0 ? 'var(--green)' : cdiff > 0 ? '#c07070' : 'var(--text-muted)';
    html += '<div class="col-bar-row"><div class="col-bar-label">' + labels[cat] + '</div><div class="col-bar-tracks"><div class="col-bar-track"><div class="col-bar-fill from" style="width:' + (fv/max*100) + '%"></div><span class="col-bar-val">' + fv + '</span></div><div class="col-bar-track"><div class="col-bar-fill to" style="width:' + (tv/max*100) + '%"></div><span class="col-bar-val">' + tv + '</span></div></div><div class="col-bar-diff" style="color:' + clr + '">' + (cdiff > 0 ? '+' : '') + cdiff + '</div></div>';
  });
  html += '</div><div class="col-legend"><span class="col-legend-dot from"></span> ' + from + ' <span class="col-legend-dot to"></span> ' + to + ' <span style="color:var(--text-muted);font-size:0.7rem">(100 = national average)</span></div>';
  results.innerHTML = html;
}

// ═══ WHAT CAN I AFFORD? CALCULATOR ═══
function openAfford() {
  if(!_acctLoggedIn) { openAcctModal(); return; }
  var overlay = document.getElementById('affordOverlay');
  if(!overlay) return;
  overlay.style.display = 'flex';
  _lockScroll();
  renderAffordUI();
}
function closeAfford() { var o = document.getElementById('affordOverlay'); if(o) o.style.display = 'none'; _unlockScroll(); }
function renderAffordUI() {
  var inputs = document.getElementById('affordInputs');
  var results = document.getElementById('affordResults');
  if(!inputs) return;
  inputs.innerHTML =
    '<div class="afford-section-title">Your Financial Picture</div>' +
    '<div class="afford-field"><label>Annual Household Income</label><input type="number" id="affIncome" class="form-input" placeholder="85000" value="85000"></div>' +
    '<div class="afford-field"><label>Monthly Debts (car, student loans, etc.)</label><input type="number" id="affDebts" class="form-input" placeholder="500" value="500"></div>' +
    '<div class="afford-row"><div class="afford-field"><label>Down Payment %</label><input type="number" id="affDown" class="form-input" placeholder="20" value="20" min="3" max="100"></div><div class="afford-field"><label>Interest Rate %</label><input type="number" id="affRate" class="form-input" placeholder="6.75" value="6.75" step="0.25"></div></div>' +
    '<div class="afford-row"><div class="afford-field"><label>Property Tax Rate %</label><input type="number" id="affTax" class="form-input" placeholder="0.5" value="0.5" step="0.1"></div><div class="afford-field"><label>Monthly Insurance</label><input type="number" id="affInsurance" class="form-input" placeholder="150" value="150"></div></div>' +
    '<button class="acct-submit" onclick="calcAffordability()">Calculate</button>';
  if(results) results.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem">Enter your details and click Calculate</p>';
}
function calcAffordability() {
  var income = parseFloat(document.getElementById('affIncome').value)||0;
  var debts = parseFloat(document.getElementById('affDebts').value)||0;
  var downPct = parseFloat(document.getElementById('affDown').value)||20;
  var rate = parseFloat(document.getElementById('affRate').value)||6.75;
  var taxRate = parseFloat(document.getElementById('affTax').value)||0.5;
  var insurance = parseFloat(document.getElementById('affInsurance').value)||150;
  var monthlyIncome = income/12;
  var maxHousing = monthlyIncome * 0.28;
  var maxTotal = monthlyIncome * 0.36;
  var maxAfterDebt = Math.min(maxHousing, maxTotal - debts);
  if(maxAfterDebt <= 0) { document.getElementById('affordResults').innerHTML = '<div class="afford-result-card"><h3>Debt-to-Income Ratio Too High</h3><p>Your monthly debts exceed what lenders typically allow. Consider reducing debts before applying for a mortgage.</p></div>'; return; }
  var maxPrice = 0, bestMonthly = 0, bestPI = 0, bestTax = 0;
  var monthlyRate = (rate/100)/12; var n = 360;
  for(var price = 50000; price <= 3000000; price += 5000) {
    var loan = price * (1 - downPct/100);
    var pi = loan * (monthlyRate * Math.pow(1+monthlyRate,n)) / (Math.pow(1+monthlyRate,n)-1);
    var tax = (price * taxRate/100)/12;
    var total = pi + tax + insurance;
    if(total <= maxAfterDebt) { maxPrice = price; bestMonthly = total; bestPI = pi; bestTax = tax; }
    else break;
  }
  var downAmt = Math.round(maxPrice * downPct/100);
  var loanAmt = maxPrice - downAmt;
  var results = document.getElementById('affordResults');
  results.innerHTML =
    '<div class="afford-result-card">' +
      '<div class="afford-max-label">You Can Afford Up To</div>' +
      '<div class="afford-max-price">$' + maxPrice.toLocaleString() + '</div>' +
      '<div class="afford-breakdown">' +
        '<div class="afford-bk-row"><span>Down Payment (' + downPct + '%)</span><span>$' + downAmt.toLocaleString() + '</span></div>' +
        '<div class="afford-bk-row"><span>Loan Amount</span><span>$' + loanAmt.toLocaleString() + '</span></div>' +
        '<div class="afford-bk-row"><span>Interest Rate</span><span>' + rate + '%</span></div>' +
        '<div class="afford-bk-divider"></div>' +
        '<div class="afford-bk-row"><span>Principal & Interest</span><span>$' + Math.round(bestPI).toLocaleString() + '/mo</span></div>' +
        '<div class="afford-bk-row"><span>Property Taxes</span><span>$' + Math.round(bestTax).toLocaleString() + '/mo</span></div>' +
        '<div class="afford-bk-row"><span>Insurance</span><span>$' + insurance.toLocaleString() + '/mo</span></div>' +
        '<div class="afford-bk-divider"></div>' +
        '<div class="afford-bk-row total"><span>Est. Monthly Payment</span><span>$' + Math.round(bestMonthly).toLocaleString() + '</span></div>' +
      '</div>' +
      '<div class="afford-note">Based on the 28/36 qualifying rule. Contact a lender for an official pre-approval.</div>' +
    '</div>';
}

// ═══ Q&A LIBRARY ═══
function openQA() {
  if(!_acctLoggedIn) { openAcctModal(); return; }
  var overlay = document.getElementById('qaOverlay');
  if(!overlay) return;
  overlay.style.display = 'flex';
  _lockScroll();
  loadQALibrary();
}
function closeQA() { var o = document.getElementById('qaOverlay'); if(o) o.style.display = 'none'; _unlockScroll(); }
async function loadQALibrary() {
  var body = document.getElementById('qaBody');
  if(!body) return;
  body.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem">Loading...</p>';
  if(!_sb) { body.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem">Service unavailable</p>'; return; }
  try {
    var resp = await _sb.from('qa_library').select('*').eq('is_published', true).order('category').order('sort_order');
    if(!resp.data || !resp.data.length) { body.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem">Q&A content coming soon!</p>'; return; }
    var cats = {}; resp.data.forEach(function(q) { if(!cats[q.category]) cats[q.category] = []; cats[q.category].push(q); });
    var catLabels = {'moving-logistics':'Moving Logistics','weather':'Weather & Seasons','outdoors':'Outdoors & Recreation','schools':'Schools & Education','healthcare':'Healthcare','lifestyle':'Lifestyle & Community','real-estate':'Real Estate Market'};
    var html = '<div class="qa-container">';
    Object.keys(cats).forEach(function(cat) {
      html += '<div class="qa-category"><div class="qa-cat-title">' + (catLabels[cat]||cat) + '</div>';
      cats[cat].forEach(function(q) {
        html += '<div class="qa-item"><button class="qa-question" onclick="this.parentElement.classList.toggle(\'open\')"><span>' + q.question + '</span><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button><div class="qa-answer">' + q.answer + '</div></div>';
      });
      html += '</div>';
    });
    html += '</div>';
    body.innerHTML = html;
  } catch(e) { body.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem">Could not load Q&A</p>'; }
}

// ═══ PROPERTY JOURNEY TIMELINE ═══
async function loadTimelineUI() {
  var container = document.getElementById('acctTimeline');
  if(!container || !_sb || !_currentUser) return;
  container.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem">Loading...</p>';
  try {
    var resp = await _sb.from('user_activity').select('*').eq('user_id', _currentUser.id).order('created_at', {ascending:false}).limit(50);
    if(!resp.data || !resp.data.length) { container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">No activity yet</p>'; return; }
    container.innerHTML = '';
    var timeline = document.createElement('div');
    timeline.className = 'timeline';
    var actIcons = {view:'👁',favorite:'❤️',unfavorite:'💔',save_search:'🔍',showing_request:'📅',question:'💬',note:'📝'};
    var actLabels = {view:'Viewed',favorite:'Saved',unfavorite:'Removed',save_search:'Saved search',showing_request:'Requested showing',question:'Asked question',note:'Added note'};
    resp.data.forEach(function(a) {
      var item = document.createElement('div');
      item.className = 'timeline-item';
      var meta = a.metadata || {};
      var propInfo = a.property_key ? a.property_key.split('|')[0] : '';
      item.innerHTML = '<div class="timeline-dot"></div><div class="timeline-date">' + timeAgo(a.created_at) + '</div><div class="timeline-text">' + (actIcons[a.activity_type]||'🔔') + ' ' + (actLabels[a.activity_type]||a.activity_type) + (propInfo ? ' — ' + propInfo : '') + '</div>';
      timeline.appendChild(item);
    });
    container.appendChild(timeline);
  } catch(e) { container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Could not load timeline</p>'; }
}

// ═══ ADMIN DASHBOARD — Redirects to /admin.html ═══
function openAdmin() {
  if(!_isAdmin) return;
  window.location.href = '/admin.html';
}
function closeAdmin() { /* no-op, overlay removed */ }

// ═══ ADMIN PRINT: Agent Copy vs Client Copy ═══
function printAgentCopy() {
  var pp = document.getElementById('printPage');
  if(!pp) return;
  // Add agent-only section
  var agentSection = document.getElementById('printAgentSection');
  if(!agentSection) {
    var div = document.createElement('div');
    div.id = 'printAgentSection';
    div.className = 'print-agent-section';
    div.innerHTML = '<div class="print-agent-header">CONFIDENTIAL — Agent Use Only</div>' +
      '<div class="print-agent-grid">' +
        '<div class="print-agent-field"><label>Agent Remarks</label><div class="print-agent-value" id="printAgentRemarks">— Available with BBO feed —</div></div>' +
        '<div class="print-agent-field"><label>Showing Instructions</label><div class="print-agent-value" id="printShowingInstr">— Available with BBO feed —</div></div>' +
        '<div class="print-agent-field"><label>Buyer Agent Commission</label><div class="print-agent-value" id="printCommission">— Available with BBO feed —</div></div>' +
        '<div class="print-agent-field"><label>Lockbox / Access</label><div class="print-agent-value" id="printLockbox">— Available with BBO feed —</div></div>' +
      '</div>';
    var footer = pp.querySelector('.print-page-footer');
    if(footer) pp.insertBefore(div, footer);
    else pp.appendChild(div);
  }
  agentSection = document.getElementById('printAgentSection');
  if(agentSection) agentSection.style.display = '';
  propShare('print');
}
function printClientCopy() {
  var agentSection = document.getElementById('printAgentSection');
  if(agentSection) agentSection.style.display = 'none';
  propShare('print');
}

// ═══ TOWN PAGE INITIALIZATION ═══
// When app.js loads on a standalone town page, wire cards, search, and filters
if(_isTownPage){
  document.addEventListener('DOMContentLoaded', function(){
    // Detect town slug from URL
    var pathMatch = window.location.pathname.match(/\/towns\/([a-z-]+)\.html/i);
    var townSlug = pathMatch ? pathMatch[1].toLowerCase() : '';
    var townData = townSlug ? TOWN_LISTINGS[townSlug] : null;
    var townName = townData ? townData.display : '';

    // 1. Wire static f-cards to openProp()
    var cards = document.querySelectorAll('.f-card');
    cards.forEach(function(card){
      var addrEl = card.querySelector('.f-card-addr');
      var cityEl = card.querySelector('.f-card-city');
      if(!addrEl) return;
      var addr = addrEl.textContent.trim();
      var city = cityEl ? cityEl.textContent.replace(/,\s*NC$/i,'').trim() : townName;

      // Find matching listing in TOWN_LISTINGS
      var listing = null;
      if(townData){
        for(var i=0; i<townData.listings.length; i++){
          if(townData.listings[i].address === addr){ listing = townData.listings[i]; break; }
        }
      }
      // Fallback: search ALL_LISTINGS
      if(!listing){
        var addrLower = addr.toLowerCase();
        for(var j=0; j<ALL_LISTINGS.length; j++){
          if(ALL_LISTINGS[j].address.toLowerCase() === addrLower){ listing = ALL_LISTINGS[j]; break; }
        }
      }
      if(!listing) return;

      // Add heart icon
      var imgWrap = card.querySelector('.f-card-img');
      if(imgWrap && !imgWrap.querySelector('.card-fav-heart')){
        imgWrap.insertAdjacentHTML('beforeend', cardFavHtml(listing.address, city));
      }

      // Wire click → openProp
      card.style.cursor = 'pointer';
      card.onclick = function(){
        try{ openProp(listing, city); } catch(err){ console.error(err); }
      };
    });

    // 2. Override search button to pass town page filter values
    var searchBtns = document.querySelectorAll('.tp-search-btn');
    searchBtns.forEach(function(btn){
      btn.onclick = function(e){
        e.preventDefault();
        var filters = { location: townName };
        // Read town page filter values
        var typeEl = document.getElementById('tps-type-' + townSlug);
        var bedsEl = document.getElementById('tps-beds-' + townSlug);
        var bathsEl = document.getElementById('tps-baths-' + townSlug);
        var restrictEl = document.getElementById('tps-restrict-' + townSlug);
        var priceEl = document.getElementById('tps-price-' + townSlug);
        if(typeEl && typeEl.value) filters.type = typeEl.value;
        if(bedsEl && bedsEl.value) filters.beds = bedsEl.value;
        if(bathsEl && bathsEl.value) filters.baths = bathsEl.value;
        if(restrictEl && restrictEl.value) filters.restrictions = restrictEl.value;
        if(priceEl && priceEl.value) filters.price = priceEl.value;
        openSearchResults(filters);
      };
    });

    // 3. Run town page search to populate dynamic grid
    if(townSlug && townData){
      townSearch(townSlug);
      // Wire filter change events to re-run townSearch
      ['tps-type-','tps-beds-','tps-baths-','tps-restrict-'].forEach(function(prefix){
        var el = document.getElementById(prefix + townSlug);
        if(el) el.addEventListener('change', function(){ townSearch(townSlug); });
      });
    }

    // 4. Update account UI now that navAcct exists in the injected nav
    if(typeof updateAcctUI === 'function') updateAcctUI();
    if(typeof gateRestrictionFilters === 'function') gateRestrictionFilters();
  });
}
