// ═══ DEV BYPASS — remove before production ═══
function devUnlock(){ _acctLoggedIn=true; updateAcctUI(); updateGatedFeatures(); updatePrintGate(); var nw=document.getElementById('propNotesWrap');if(nw)nw.style.display=''; console.log('🔓 Dev mode: account unlocked'); }
function devLock(){ _acctLoggedIn=false; updateAcctUI(); updateGatedFeatures(); updatePrintGate(); var nw=document.getElementById('propNotesWrap');if(nw)nw.style.display='none'; console.log('🔒 Dev mode: account locked'); }

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
window.addEventListener('scroll',()=>nav.classList.toggle('scrolled',window.scrollY>50));
document.getElementById('navToggle').addEventListener('click',()=>document.getElementById('mobileMenu').classList.toggle('open'));
function closeMobile(){document.getElementById('mobileMenu').classList.remove('open')}

// ═══ SCROLL REVEAL ═══
const obs=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('vis');obs.unobserve(e.target)}})},{threshold:0.1,rootMargin:'0px 0px -40px 0px'});
document.querySelectorAll('.reveal').forEach(el=>obs.observe(el));
// Fallback: if elements haven't revealed after 2s, force them visible
setTimeout(()=>{document.querySelectorAll('.reveal:not(.vis)').forEach(el=>el.classList.add('vis'))},2000);

// ═══ SMOOTH SCROLL ═══
document.querySelectorAll('a[href^="#"]').forEach(a=>{a.addEventListener('click',function(e){e.preventDefault();const t=document.querySelector(this.getAttribute('href'));if(t)t.scrollIntoView({behavior:'smooth',block:'start'})})});

// ═══ SIMPLYRETS IDX INTEGRATION ═══
var SIMPLYRETS = {
  // ─── CONFIGURATION ───────────────────────────────────────────────
  // Set enabled:true and enter your credentials to pull live MLS data.
  // Demo credentials (simplyrets:simplyrets) show sample Houston data.
  // When your MLS is connected, replace with your real API key/secret.
  enabled: true,                                     // Live! Using demo data until MLS connected
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
          sqft:l.sqft, lot:l.lot, status:l.status, restrictions:l.restrictions,
          photo:l.photo, photos:l.photos, lat:l.lat, lng:l.lng,
          mlsId:l.mlsId, listingId:l.listingId, yearBuilt:l.yearBuilt,
          daysOnMarket:l.daysOnMarket, description:l.description
        });
      });

      // Replace global data
      Object.keys(TOWN_LISTINGS).forEach(function(k){ delete TOWN_LISTINGS[k]; });
      Object.keys(newTowns).forEach(function(k){ TOWN_LISTINGS[k] = newTowns[k]; });

      // Update LISTINGS (featured) — top 6 by price
      var sorted = mapped.filter(function(l){return l.photo}).sort(function(a,b){return b.price-a.price});
      LISTINGS.length = 0;
      sorted.slice(0,6).forEach(function(l,i){
        LISTINGS.push({
          id:i+1, price:l.price, address:l.address, city:l.city, type:l.type,
          beds:l.beds, baths:l.baths, sqft:l.sqft, lot:l.lot,
          photo:l.photo, photos:l.photos, days:l.daysOnMarket,
          mlsId:l.mlsId, restrictions:l.restrictions, status:l.status
        });
      });

      // Rebuild ALL_LISTINGS
      ALL_LISTINGS.length = 0;
      LISTINGS.forEach(function(l){
        ALL_LISTINGS.push({
          price:l.price, address:l.address, city:l.city, type:l.type,
          beds:l.beds, baths:l.baths, sqft:l.sqft, lot:l.lot,
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
              beds:l.beds, baths:l.baths, sqft:l.sqft, lot:l.lot,
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
          var feats=l.type==='Land'?'<span class="f-feat"><strong>'+l.lot+'</strong></span>':'<span class="f-feat"><strong>'+l.beds+'</strong> Beds</span><span class="f-feat"><strong>'+l.baths+'</strong> Baths</span><span class="f-feat"><strong>'+l.sqft.toLocaleString()+'</strong> SF</span>';
          var imgSrc = l.photo || 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=700&q=80';
          c.innerHTML='<div class="f-card-img"><img src="'+imgSrc+'" alt="'+l.address+'" loading="lazy"><div class="f-card-badge '+(l.type==='Land'?'land':'')+'">'+l.type+'</div>'+cardFavHtml(l.address,l.city)+'</div><div class="f-card-body"><div class="f-card-price">$'+l.price.toLocaleString()+'</div><div class="f-card-addr">'+l.address+'</div><div class="f-card-city">'+l.city+', NC</div><div class="f-card-features">'+feats+'</div></div>';
          c.onclick=function(){try{openProp({price:l.price,address:l.address,type:l.type,beds:l.beds,baths:l.baths,sqft:l.sqft,lot:l.lot,restrictions:l.restrictions||'unrestricted',status:l.status||'Active',photo:l.photo||null,photos:l.photos||[],description:l.description||''},l.city)}catch(err){console.error(err)}};
          grid.appendChild(c);
        });
      }

      // Update town page nav with new towns
      SIMPLYRETS._updateTownNav();
      SIMPLYRETS.loaded = true;
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

// ═══ DEMO LISTINGS ═══
var LISTINGS=[
  {id:1,price:389900,address:"74 Mountain View Rd",city:"Waynesville",type:"Single Family",beds:3,baths:2,sqft:1840,lot:"0.82 ac",photo:"https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=700&q=80",days:12},
  {id:2,price:549000,address:"218 Ridge Top Lane",city:"Sylva",type:"Single Family",beds:4,baths:3,sqft:2680,lot:"1.45 ac",photo:"https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=700&q=80",days:7},
  {id:3,price:159900,address:"Lot 12, Smoky Hollow Rd",city:"Maggie Valley",type:"Land",beds:0,baths:0,sqft:0,lot:"3.2 ac",photo:"https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=700&q=80",days:34},
  {id:4,price:895000,address:"42 Whitewater Falls Dr",city:"Cashiers",type:"Single Family",beds:5,baths:4,sqft:3920,lot:"2.1 ac",photo:"https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=700&q=80",days:18},
  {id:5,price:274900,address:"155 Tuckasegee River Rd",city:"Bryson City",type:"Cabin",beds:2,baths:2,sqft:1280,lot:"0.65 ac",photo:"https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=700&q=80",days:5},
  {id:6,price:1250000,address:"1 Summit Overlook",city:"Cashiers",type:"Single Family",beds:6,baths:5,sqft:5200,lot:"3.5 ac",photo:"https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=700&q=80",days:28}
];

// Helper: generate heart icon HTML for a property card (defined early so all card renderers can use it)
function cardFavHtml(address, city) {
  var key = (address + '|' + (city||'')).toLowerCase();
  var saved = (typeof _favProps!=='undefined' && _favProps[key]) ? ' saved' : '';
  return '<button class="card-fav-heart'+saved+'" data-key="'+key+'" onclick="toggleCardFav(event,\''+address.replace(/'/g,"\\'")+'\',\''+city.replace(/'/g,"\\'")+'\')"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button>';
}

function renderFeatured(){
  const grid=document.getElementById('featuredGrid');
  LISTINGS.slice(0,6).forEach(function(l,i){
    const c=document.createElement('div');c.className='f-card reveal';
    const feats=l.type==='Land'?'<span class="f-feat"><strong>'+l.lot+'</strong></span>':'<span class="f-feat"><strong>'+l.beds+'</strong> Beds</span><span class="f-feat"><strong>'+l.baths+'</strong> Baths</span><span class="f-feat"><strong>'+l.sqft.toLocaleString()+'</strong> SF</span>';
    c.innerHTML='<div class="f-card-img"><img src="'+l.photo+'" alt="'+l.address+'" loading="lazy"><div class="f-card-badge '+(l.type==='Land'?'land':'')+'">'+l.type+'</div>'+cardFavHtml(l.address,l.city)+'</div><div class="f-card-body"><div class="f-card-price">$'+l.price.toLocaleString()+'</div><div class="f-card-addr">'+l.address+'</div><div class="f-card-city">'+l.city+', NC</div><div class="f-card-features">'+feats+'</div></div>';
    c.onclick=function(){try{openProp({price:l.price,address:l.address,type:l.type,beds:l.beds,baths:l.baths,sqft:l.sqft,lot:l.lot,restrictions:l.restrictions||'unrestricted',status:l.status||'Active',photo:l.photo||null,photos:l.photos||[],description:l.description||''},l.city)}catch(err){console.error(err)}};
    grid.appendChild(c);
  });
  document.querySelectorAll('.f-card.reveal').forEach(function(el){obs.observe(el)});
}
renderFeatured();

// ═══ CHATBOT ═══
let chatOpen=false,isTyping=false,convHistory=[];

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

// --- FUB lead capture from chat ---
var _chatLeadPushed = false;
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
    _sb.from('leads').insert({
      first_name: parts[0] || '',
      last_name: parts.slice(1).join(' ') || '',
      email: emailMatch ? emailMatch[0] : '',
      phone: phoneMatch ? phoneMatch[0] : '',
      message: transcript || 'Captured via chatbot conversation',
      source: 'chatbot'
    }).then(function(){ _chatLeadPushed = true; console.log('[Chat] Lead pushed to FUB with transcript'); })
      .catch(function(e){ console.warn('[Chat] Lead push failed:', e); });
  }
}

// --- Chat UI ---
function toggleChat(){
  chatOpen=!chatOpen;
  document.getElementById('chatPanel').classList.toggle('open',chatOpen);
  document.getElementById('chatTrigger').classList.toggle('open',chatOpen);
  document.getElementById('chatGreeting').classList.remove('show');
  document.getElementById('chatBadge').classList.remove('show');
  if(chatOpen){
    if(!document.getElementById('chatMessages').children.length)addInitMsg();
    setTimeout(()=>document.getElementById('chatInput').focus(),300);
  }
}
document.getElementById('chatTrigger').addEventListener('click',toggleChat);

function addMsg(role,text,chips){
  const c=document.getElementById('chatMessages'),w=document.createElement('div');
  w.className='msg '+role;w.innerHTML='<div class="msg-bubble">'+text+'</div>';c.appendChild(w);
  if(chips){const cw=document.createElement('div');cw.className='quick-actions';chips.forEach(ch=>{const b=document.createElement('button');b.className='chip';b.textContent=ch;b.onclick=()=>{document.getElementById('chatInput').value=ch;sendMessage();cw.remove()};cw.appendChild(b)});c.appendChild(cw)}
  c.scrollTop=c.scrollHeight;
}

function addInitMsg(){
  var greeting = "Hey there! I'm Cory's assistant. Whether you're looking to buy, sell, or explore Western NC — I'm here to help. What brings you here today?";
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

function showTyping(){const c=document.getElementById('chatMessages'),t=document.createElement('div');t.className='typing-indicator';t.id='typInd';t.innerHTML='<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';c.appendChild(t);c.scrollTop=c.scrollHeight}
function hideTyping(){const e=document.getElementById('typInd');if(e)e.remove()}

async function sendMessage(){
  const inp=document.getElementById('chatInput'),txt=inp.value.trim();
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

function clearChat(){convHistory=[];_chatLimits.exchangeCount=0;_chatLeadPushed=false;document.getElementById('chatMessages').innerHTML='';addInitMsg()}

const chatInp=document.getElementById('chatInput');
chatInp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}});
chatInp.addEventListener('input',()=>{chatInp.style.height='auto';chatInp.style.height=Math.min(chatInp.scrollHeight,100)+'px'});

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

  if(type==='sell'){
    searchBar.style.display='none';
    sellForm.style.display='';
    note.textContent='Get a complimentary market analysis for your WNC property';
  }else{
    searchBar.style.display='';
    sellForm.style.display='none';
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

function heroSearch(){
  var loc=document.getElementById('hsLocation').value;
  var type=document.getElementById('hsType').value;
  var price=document.getElementById('hsPrice').value;
  var beds=document.getElementById('hsBeds').value;
  var baths=document.getElementById('hsBaths').value;
  var restrict=document.getElementById('hsRestrict').value;

  // Map hero type values to search type values
  var typeMap = {'home':'Single Family','cabin':'Cabin','land':'Land','townhome':'Townhome / Condo'};
  var mappedType = typeMap[type] || '';

  openSearchResults({
    location: loc || '',
    type: mappedType,
    price: price || '',
    beds: beds || '',
    baths: baths || '',
    restrictions: restrict || ''
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
  if(!phone||phone.replace(/\D/g,'').length<7){document.getElementById('hsfPhoneErr').classList.add('show');document.getElementById('hsfPhone').classList.add('error');valid=false}

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


// Show greeting after 3.5s — but only if not logged in and chat not open
setTimeout(()=>{
  try{
    const profile=localStorage.getItem('cc_profile');
    if(!chatOpen && !profile){
      document.getElementById('chatGreeting').classList.add('show');
      document.getElementById('chatBadge').classList.add('show');
    }
  }catch(e){}
},3500);
setTimeout(()=>{try{document.getElementById('chatGreeting').classList.remove('show')}catch(e){}},12000);

// ═══ PAGE OVERLAYS (Towns + Blogs) ═══
function openPage(id){
  var el=document.getElementById('page-'+id)||document.getElementById(id);
  if(!el)return;
  el.classList.add('active');
  document.body.style.overflow='hidden';
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
  document.body.style.overflow='';
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
      document.body.style.overflow='';
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
var TOWN_LISTINGS = {"waynesville": {"display": "Waynesville", "listings": [{"price": 389900, "address": "74 Mountain View Rd", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1840, "lot": "0.82 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 529000, "address": "12 Plott Balsam Dr", "type": "Single Family", "beds": 4, "baths": 3, "sqft": 2450, "lot": "1.2 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 179900, "address": "Lot 8, Fines Creek Rd", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "5.7 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 315000, "address": "220 Dellwood Rd", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1560, "lot": "0.45 ac", "status": "Active", "restrictions": "restricted"}, {"price": 675000, "address": "88 Eagles Nest Trail", "type": "Single Family", "beds": 4, "baths": 4, "sqft": 3200, "lot": "2.3 ac", "status": "Active", "restrictions": "hoa"}, {"price": 249000, "address": "16 Jonathan Creek Rd", "type": "Cabin", "beds": 2, "baths": 1, "sqft": 980, "lot": "0.6 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 139900, "address": "Lot 22, Crabtree Rd", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "8.1 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 425000, "address": "55 Laurel Ridge Dr", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1980, "lot": "0.75 ac", "status": "Under Contract", "restrictions": "light"}]}, "sylva": {"display": "Sylva", "listings": [{"price": 349900, "address": "88 Mill Creek Rd", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1650, "lot": "0.6 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 549000, "address": "218 Ridge Top Lane", "type": "Single Family", "beds": 4, "baths": 3, "sqft": 2680, "lot": "1.45 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 139900, "address": "Lot 3, Webster Rd", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "4.1 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 289000, "address": "44 Skyland Dr", "type": "Single Family", "beds": 2, "baths": 2, "sqft": 1320, "lot": "0.5 ac", "status": "Active", "restrictions": "restricted"}, {"price": 475000, "address": "120 Balsam Ridge", "type": "Single Family", "beds": 4, "baths": 3, "sqft": 2400, "lot": "1.8 ac", "status": "Active", "restrictions": "hoa"}, {"price": 199900, "address": "Lot 9, Speedwell Rd", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "6.5 ac", "status": "Active", "restrictions": "unrestricted"}]}, "cashiers-highlands": {"display": "Cashiers / Highlands", "listings": [{"price": 895000, "address": "42 Whitewater Falls Dr", "type": "Single Family", "beds": 5, "baths": 4, "sqft": 3920, "lot": "2.1 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 1250000, "address": "1 Summit Overlook", "type": "Single Family", "beds": 6, "baths": 5, "sqft": 5200, "lot": "3.5 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 425000, "address": "Lot 19, Sapphire Valley", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "2.8 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 725000, "address": "88 Glenville Lake Rd", "type": "Single Family", "beds": 4, "baths": 3, "sqft": 2800, "lot": "1.5 ac", "status": "Active", "restrictions": "restricted"}, {"price": 2100000, "address": "15 Chattooga Club Dr", "type": "Single Family", "beds": 5, "baths": 5, "sqft": 4800, "lot": "4.2 ac", "status": "Active", "restrictions": "hoa"}, {"price": 599000, "address": "Lot 7, Whiteside Cove", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "5.0 ac", "status": "Active", "restrictions": "unrestricted"}]}, "bryson-city": {"display": "Bryson City", "listings": [{"price": 274900, "address": "155 Tuckasegee River Rd", "type": "Cabin", "beds": 2, "baths": 2, "sqft": 1280, "lot": "0.65 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 459000, "address": "320 Deep Creek Rd", "type": "Single Family", "beds": 3, "baths": 3, "sqft": 2100, "lot": "1.8 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 99900, "address": "Lot 5, Alarka Rd", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "6.2 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 339000, "address": "72 Nantahala View", "type": "Cabin", "beds": 3, "baths": 2, "sqft": 1450, "lot": "0.8 ac", "status": "Active", "restrictions": "restricted"}, {"price": 549000, "address": "10 Fontana Ridge", "type": "Single Family", "beds": 4, "baths": 3, "sqft": 2650, "lot": "2.5 ac", "status": "Active", "restrictions": "hoa"}, {"price": 189000, "address": "Lot 11, Governor's Island", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "3.4 ac", "status": "Under Contract", "restrictions": "unrestricted"}]}, "maggie-valley": {"display": "Maggie Valley", "listings": [{"price": 329000, "address": "44 Campbell Creek Rd", "type": "Cabin", "beds": 2, "baths": 2, "sqft": 1100, "lot": "0.5 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 489000, "address": "102 Soco Falls Dr", "type": "Single Family", "beds": 3, "baths": 3, "sqft": 2200, "lot": "1.1 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 159900, "address": "Lot 12, Smoky Hollow Rd", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "3.2 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 375000, "address": "88 Dellwood Loop", "type": "Cabin", "beds": 3, "baths": 2, "sqft": 1600, "lot": "0.7 ac", "status": "Active", "restrictions": "restricted"}, {"price": 269000, "address": "210 Soco Rd", "type": "Single Family", "beds": 2, "baths": 1, "sqft": 1050, "lot": "0.35 ac", "status": "Active", "restrictions": "hoa"}, {"price": 119900, "address": "Lot 4, Jonathan Creek", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "4.8 ac", "status": "Active", "restrictions": "unrestricted"}]}, "franklin": {"display": "Franklin", "listings": [{"price": 279000, "address": "55 Riverview Terrace", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1520, "lot": "0.4 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 449000, "address": "1200 Burningtown Rd", "type": "Single Family", "beds": 4, "baths": 3, "sqft": 2600, "lot": "3.8 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 89900, "address": "Lot 22, Otto Rd", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "7.5 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 335000, "address": "78 Cartoogechaye Creek", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1700, "lot": "1.2 ac", "status": "Active", "restrictions": "restricted"}, {"price": 195000, "address": "Lot 15, Nantahala Gorge", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "12 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 525000, "address": "42 Cowee Mountain", "type": "Single Family", "beds": 4, "baths": 3, "sqft": 2800, "lot": "5.0 ac", "status": "Active", "restrictions": "unrestricted"}]}, "dillsboro": {"display": "Dillsboro", "listings": [{"price": 339000, "address": "18 Front Street", "type": "Single Family", "beds": 2, "baths": 2, "sqft": 1350, "lot": "0.3 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 475000, "address": "44 Riverwatch Rd", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1900, "lot": "0.85 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 119900, "address": "Lot 7, Webster Heights", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "2.3 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 399000, "address": "22 Monteith Gap Rd", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1750, "lot": "1.1 ac", "status": "Active", "restrictions": "restricted"}]}, "cullowhee": {"display": "Cullowhee", "listings": [{"price": 259000, "address": "90 University Heights", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1400, "lot": "0.35 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 399000, "address": "55 Caney Fork Rd", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1800, "lot": "1.5 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 109900, "address": "Lot 14, East LaPorte", "type": "Land", "beds": 0, "baths": 0, "sqft": 0, "lot": "3.4 ac", "status": "Active", "restrictions": "unrestricted"}, {"price": 310000, "address": "120 Tuckasegee Rd", "type": "Single Family", "beds": 3, "baths": 2, "sqft": 1550, "lot": "0.6 ac", "status": "Active", "restrictions": "restricted"}, {"price": 475000, "address": "8 Panthertown Way", "type": "Single Family", "beds": 4, "baths": 3, "sqft": 2300, "lot": "2.0 ac", "status": "Active", "restrictions": "hoa"}]}};

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
    if(restrictVal && l.restrictions!==restrictVal)return false;
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
    var feats=l.type==='Land'?'<span class="f-feat"><strong>'+l.lot+'</strong></span>':'<span class="f-feat"><strong>'+l.beds+'</strong> Beds</span><span class="f-feat"><strong>'+l.baths+'</strong> Baths</span><span class="f-feat"><strong>'+l.sqft.toLocaleString()+'</strong> SF</span>';
    var badge=l.type==='Land'?' land':'';
    var statusBadge=l.status==='Under Contract'?'<div style="position:absolute;top:0.75rem;right:0.75rem;padding:0.25rem 0.5rem;font-size:0.5rem;letter-spacing:0.1em;text-transform:uppercase;background:var(--red-soft);color:#fff">Under Contract</div>':'';
    c.innerHTML='<div class="f-card-img" style="position:relative"><div style="aspect-ratio:16/10;background:var(--surface);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.75rem">Property Photo</div><div class="f-card-badge'+badge+'">'+l.type+'</div>'+statusBadge+cardFavHtml(l.address,townName)+'</div><div class="f-card-body"><div class="f-card-price">$'+l.price.toLocaleString()+'</div><div class="f-card-addr">'+l.address+'</div><div class="f-card-city">'+townName+', NC</div><div class="f-card-features">'+feats+'</div></div>';
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
  openProp({price:l.price,address:l.address,type:l.type,beds:l.beds,baths:l.baths,sqft:l.sqft,lot:l.lot,
    restrictions:l.restrictions||'unrestricted',status:l.status||'Active',
    photo:l.photo||null,photos:l.photos||[],description:l.description||'',
    mlsId:l.mlsId||null,yearBuilt:l.yearBuilt||null,daysOnMarket:l.daysOnMarket||0},l.city);
}
function openPropFromTown(lid){
  var data=window[lid];
  if(data)openProp(data.l,data.t);
}
// Wire static featured cards in town pages on open + inject heart icons
(function(){
  var origOpen=openPage;
  openPage=function(id){
    origOpen(id);
    setTimeout(function(){
      var page=document.getElementById('page-'+id);
      if(!page)return;
      var townName = TOWN_LISTINGS[id] ? TOWN_LISTINGS[id].display : id.replace(/-/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase()});
      var cards=page.querySelectorAll('.f-card');
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
        if(TOWN_LISTINGS[id]){
          TOWN_LISTINGS[id].listings.forEach(function(l){if(l.address===addr&&l.price===price)match=l});
        }
        if(match){
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

var RESTRICT_LABELS = {'unrestricted':'Unrestricted — No HOA','restricted':'Deed Restricted','light':'Lightly Restricted','hoa':'HOA Community'};

function openProp(listing, townName) {
  try{
  var o = document.getElementById('propOverlay');
  if (!o) {console.error('propOverlay not found');return;}

  // Images — use listing photos from API if available, fallback to stock
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

  // Thumbnails
  var thumbsEl = document.getElementById('propThumbs');
  thumbsEl.innerHTML = '';
  imgs.forEach(function(src, i) {
    var d = document.createElement('div');
    d.className = 'prop-thumb' + (i === 0 ? ' active' : '');
    d.innerHTML = '<img src="' + (src.indexOf('unsplash')>-1 ? src.replace('w=1200','w=200').replace('w=700','w=200') : src) + '" alt="Photo ' + (i+1) + '">';
    d.onclick = function(e) {
      e.stopPropagation();
      propGoTo(i);
      openLightbox(i);
    };
    thumbsEl.appendChild(d);
  });
  document.getElementById('propImgCount').textContent = '1 / ' + imgs.length;

  // Status
  var statusEl = document.getElementById('propStatus');
  statusEl.textContent = listing.status || 'Active Listing';
  statusEl.className = 'prop-hero-status ' + (listing.status === 'Under Contract' ? 'pending-status' : 'active-status');

  // Price, address, city
  document.getElementById('propPrice').textContent = '$' + listing.price.toLocaleString();
  document.getElementById('propAddr').textContent = listing.address;
  document.getElementById('propCity').textContent = townName + ', North Carolina';

  // Stats ribbon
  var statsEl = document.getElementById('propStats');
  if (listing.type === 'Land') {
    statsEl.innerHTML =
      '<div class="prop-stat"><div class="prop-stat-val">' + listing.lot + '</div><div class="prop-stat-label">Total Acreage</div></div>' +
      '<div class="prop-stat"><div class="prop-stat-val">' + (RESTRICT_LABELS[listing.restrictions]||'—').split('—')[0].trim() + '</div><div class="prop-stat-label">Restrictions</div></div>' +
      '<div class="prop-stat"><div class="prop-stat-val">$' + Math.round(listing.price/parseFloat(listing.lot)).toLocaleString() + '</div><div class="prop-stat-label">Price Per Acre</div></div>' +
      '<div class="prop-stat"><div class="prop-stat-val">' + (listing.days||Math.floor(Math.random()*40+5)) + '</div><div class="prop-stat-label">Days on Market</div></div>';
  } else {
    statsEl.innerHTML =
      '<div class="prop-stat"><div class="prop-stat-val">' + listing.beds + '</div><div class="prop-stat-label">Bedrooms</div></div>' +
      '<div class="prop-stat"><div class="prop-stat-val">' + listing.baths + '</div><div class="prop-stat-label">Bathrooms</div></div>' +
      '<div class="prop-stat"><div class="prop-stat-val">' + listing.sqft.toLocaleString() + '</div><div class="prop-stat-label">Square Feet</div></div>' +
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
    feats.push({icon:'<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/>',val:listing.sqft.toLocaleString()+' SF',label:'Living Area'});
    feats.push({icon:'<path d="M2 4v16h20V4H2zm0 8h20"/><path d="M6 8v0"/>',val:listing.beds+' Beds / '+listing.baths+' Baths',label:'Bedrooms & Bathrooms'});
    feats.push({icon:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>',val:listing.lot,label:'Lot Size'});
    feats.push({icon:'<path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/>',val:townName+', NC',label:'Location'});
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

  // Map text
  document.getElementById('propMapText').textContent = listing.address + ', ' + townName + ', NC';

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

  // Similar listings
  var simEl = document.getElementById('propSimilar');
  simEl.innerHTML = '';
  var allListings = [];
  Object.keys(TOWN_LISTINGS).forEach(function(tid){
    TOWN_LISTINGS[tid].listings.forEach(function(l){
      l._town = TOWN_LISTINGS[tid].display;
      l._townId = tid;
      allListings.push(l);
    });
  });
  // Filter similar by type and price range, exclude current
  var similar = allListings.filter(function(l){
    return l.address !== listing.address && l.type === listing.type && l.price >= price*0.5 && l.price <= price*1.5;
  }).slice(0,3);
  if(similar.length<3){similar=allListings.filter(function(l){return l.address!==listing.address}).slice(0,3)}
  similar.forEach(function(l){
    var c=document.createElement('div');c.className='f-card';c.style.cursor='pointer';
    var feats=l.type==='Land'?'<span class="f-feat"><strong>'+l.lot+'</strong></span>':'<span class="f-feat"><strong>'+l.beds+'</strong> Beds</span><span class="f-feat"><strong>'+l.baths+'</strong> Baths</span><span class="f-feat"><strong>'+l.sqft.toLocaleString()+'</strong> SF</span>';
    var simImgs=PROP_IMAGES[l.type]||PROP_IMAGES['Single Family'];
    var simImg=simImgs[Math.floor(Math.random()*simImgs.length)].replace('w=1200','w=700');
    c.innerHTML='<div class="f-card-img"><img src="'+simImg+'" alt="'+l.address+'" loading="lazy"><div class="f-card-badge'+(l.type==='Land'?' land':'')+'">'+l.type+'</div>'+cardFavHtml(l.address, l._town||townName)+'</div><div class="f-card-body"><div class="f-card-price">$'+l.price.toLocaleString()+'</div><div class="f-card-addr">'+l.address+'</div><div class="f-card-city">'+(l._town||townName)+', NC</div><div class="f-card-features">'+feats+'</div></div>';
    c.onclick=function(){openProp(l,l._town||townName)};
    simEl.appendChild(c);
  });

  // Show overlay
  o.classList.add('active');
  o.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  try{history.pushState({page:'property'},'','#property')}catch(he){}
  }catch(err){console.error('openProp error:',err)}
}

function closeProp(fromPopstate) {
  var o = document.getElementById('propOverlay');
  if (o) o.classList.remove('active');
  // Only restore scroll if search overlay isn't also open
  var searchOv = document.getElementById('searchOverlay');
  if(!searchOv || !searchOv.classList.contains('active')){
    document.body.style.overflow = '';
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
  } else if (type === 'print') {
    if(!_acctLoggedIn) { openAcctModal(); return; }
    // Populate print page
    var heroImg = document.getElementById('propHeroImg');
    document.getElementById('printThumb').src = heroImg ? heroImg.src : '';
    document.getElementById('printPrice').textContent = price;
    document.getElementById('printAddr').textContent = addr;
    document.getElementById('printCity').textContent = document.getElementById('propCity').textContent || '';
    document.getElementById('printDate').textContent = 'Printed: ' + new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
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
    document.getElementById('printDesc').textContent = descText.substring(0, 400);

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

    // Your Notes (from the notes textarea if it exists)
    var notesTA = document.getElementById('propNotesTA');
    var printNotes = document.getElementById('printYourNotes');
    if(notesTA && printNotes) printNotes.textContent = notesTA.value || '(No notes yet)';
    window.print();
  }
}

// Handle popstate for property page
var _origPopstate = window.onpopstate;
window.addEventListener('popstate', function(e) {
  // Close compare overlay if open
  var compareOv = document.getElementById('compareOverlay');
  if(compareOv && compareOv.classList.contains('active')) {
    compareOv.classList.remove('active');
    document.body.style.overflow = '';
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
      document.body.style.overflow = '';
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
    document.body.style.overflow = '';
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
  document.getElementById('propImgCount').textContent = (idx + 1) + ' / ' + imgs.length;
  var thumbs = document.querySelectorAll('.prop-thumb');
  thumbs.forEach(function(t, i) { t.classList.toggle('active', i === idx) });
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


// Fade in scroll-over gradient on scroll
(function(){
  var overlay = document.getElementById('propOverlay');
  if (!overlay) return;
  overlay.addEventListener('scroll', function() {
    var area = document.getElementById('propContentArea');
    if (area) {
      if (overlay.scrollTop > 30) area.classList.add('scroll-fade');
      else area.classList.remove('scroll-fade');
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
  // From featured listings
  LISTINGS.forEach(function(l){
    ALL_LISTINGS.push({
      price:l.price, address:l.address, city:l.city, type:l.type,
      beds:l.beds, baths:l.baths, sqft:l.sqft, lot:l.lot,
      photo:l.photo, status:'Active', restrictions:'unrestricted',
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
          beds:l.beds, baths:l.baths, sqft:l.sqft, lot:l.lot,
          photo:null, status:l.status||'Active', restrictions:l.restrictions||'unrestricted',
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
var _srActiveCard = null;
var _srMobileView = 'list'; // 'list' or 'map'

function openSearchResults(filters){
  filters = filters || {};

  // Set filter values
  var locSel = document.getElementById('srfLocSelect');
  var typeSel = document.getElementById('srfTypeSelect');
  var priceSel = document.getElementById('srfPriceSelect');
  var bedsSel = document.getElementById('srfBedsSelect');
  var bathsSel = document.getElementById('srfBathsSelect');
  var restrictSel = document.getElementById('srfRestrictSelect');

  locSel.value = filters.location || '';
  typeSel.value = filters.type || '';
  priceSel.value = filters.price || '';
  bedsSel.value = filters.beds || '';
  bathsSel.value = filters.baths || '';
  restrictSel.value = filters.restrictions || '';

  // Show overlay
  var overlay = document.getElementById('searchOverlay');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
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
  var overlay = document.getElementById('searchOverlay');
  if(!overlay.classList.contains('active')) return;
  overlay.classList.remove('active');
  document.body.style.overflow = '';
  if(history.state && history.state.page === 'search') history.back();
}

function initSearchMap(){
  try {
    var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    _srMap = L.map('srMap',{zoomControl:false,attributionControl:true}).setView([35.38,-83.20],10);
    L.control.zoom({position:'topright'}).addTo(_srMap);

    // Use dark or light tiles
    var darkTiles = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    var lightTiles = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    window._srTileLayer = L.tileLayer(isDark ? darkTiles : lightTiles, {
      attribution:'&copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom:18
    }).addTo(_srMap);

    // Store tile URLs for theme switching
    window._srDarkTiles = darkTiles;
    window._srLightTiles = lightTiles;
  } catch(e) {
    console.error('Map init error:', e);
    document.getElementById('srMapLoading').innerHTML = '<span style="color:var(--text-muted)">Map requires internet connection</span>';
  }
}

function srApplyFilters(){
  var loc = document.getElementById('srfLocSelect').value;
  var type = document.getElementById('srfTypeSelect').value;
  var price = document.getElementById('srfPriceSelect').value;
  var beds = document.getElementById('srfBedsSelect').value;
  var baths = document.getElementById('srfBathsSelect').value;
  var restrict = document.getElementById('srfRestrictSelect').value;
  var sort = document.getElementById('srSort').value;

  // Highlight active filters
  document.querySelectorAll('.sr-filter-chip').forEach(function(c){
    var sel = c.querySelector('select');
    if(sel) c.classList.toggle('active', sel.value !== '');
  });

  // Filter
  var results = ALL_LISTINGS.filter(function(l){
    if(loc){
      var locMatch = l.city === loc || (loc === 'Cashiers' && (l.city === 'Cashiers' || l.city === 'Cashiers / Highlands'));
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
    if(restrict && l.restrictions !== restrict) return false;
    return true;
  });

  // Sort
  var sortParts = sort.split('-');
  var sortKey = sortParts[0], sortDir = sortParts[1];
  results.sort(function(a,b){
    var va = a[sortKey]||0, vb = b[sortKey]||0;
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  // Update region title
  var region = loc ? document.getElementById('srfLocSelect').options[document.getElementById('srfLocSelect').selectedIndex].text : 'Western NC';
  document.getElementById('srRegion').textContent = region;
  document.getElementById('srCount').textContent = results.length + ' listing' + (results.length!==1?'s':'');

  // Update URL
  var params = new URLSearchParams();
  if(loc) params.set('location',loc);
  if(type) params.set('type',type);
  if(price) params.set('price',price);
  if(beds) params.set('beds',beds);
  if(baths) params.set('baths',baths);
  if(restrict) params.set('restrictions',restrict);
  var hashStr = '#search' + (params.toString() ? '?' + params.toString() : '');
  history.replaceState({page:'search'},'',hashStr);

  // Store for map popup access
  _srCurrentResults = results;

  // Render cards
  srRenderCards(results);

  // Render map markers
  srRenderMarkers(results);
}

function srRenderCards(results){
  var container = document.getElementById('srCards');
  container.innerHTML = '';

  if(results.length === 0){
    container.innerHTML = '<div class="sr-no-results"><h3>No Properties Found</h3><p>Try adjusting your filters, or contact Cory for off-market opportunities.</p><a href="tel:8285066413" class="btn-primary" style="display:inline-flex"><span>Call (828) 506-6413</span></a></div>';
    return;
  }

  results.forEach(function(l, i){
    var card = document.createElement('div');
    card.className = 'sr-card';
    card.setAttribute('data-idx', i);

    var feats = l.type === 'Land'
      ? '<strong>' + l.lot + '</strong>'
      : '<span><strong>' + l.beds + '</strong> Bed</span><span><strong>' + l.baths + '</strong> Bath</span><span><strong>' + (l.sqft||0).toLocaleString() + '</strong> SF</span>';

    var imgHtml = l.photo
      ? '<img src="' + l.photo + '" alt="' + l.address + '" loading="lazy">'
      : '<div style="width:100%;height:100%;background:var(--surface);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.55rem">Photo</div>';

    var badgeClass = l.type === 'Land' ? 'sr-card-badge land' : 'sr-card-badge';
    var statusHtml = l.status === 'Under Contract' ? '<div class="sr-card-status">Under Contract</div>' : '';

    card.innerHTML = '<div class="sr-card-img">' + imgHtml + '<div class="' + badgeClass + '">' + l.type + '</div>' + cardFavHtml(l.address, l.city) + '</div>' +
      '<div class="sr-card-body">' +
        '<div class="sr-card-price">$' + l.price.toLocaleString() + '</div>' +
        '<div class="sr-card-addr">' + l.address + '</div>' +
        '<div class="sr-card-city">' + l.city + ', NC</div>' +
        '<div class="sr-card-feats">' + feats + '</div>' +
        statusHtml +
      '</div>';

    (function(listing, idx){
      card.onclick = function(){
        try { openProp({price:listing.price,address:listing.address,type:listing.type,beds:listing.beds,baths:listing.baths,sqft:listing.sqft,lot:listing.lot,restrictions:listing.restrictions||'unrestricted',status:listing.status||'Active'}, listing.city); } catch(err){console.error(err)}
      };
      card.onmouseenter = function(){ srHighlightMarker(idx) };
      card.onmouseleave = function(){ srUnhighlightMarker(idx) };
    })(l, i);

    container.appendChild(card);
  });
}

function srRenderMarkers(results){
  if(!_srMap) return;

  // Clear existing
  _srMarkers.forEach(function(m){ _srMap.removeLayer(m) });
  _srMarkers = [];

  if(results.length === 0) return;

  var bounds = L.latLngBounds();

  results.forEach(function(l, i){
    if(!l.lat || !l.lng) return;

    var priceLabel = l.price >= 1000000
      ? '$' + (l.price/1000000).toFixed(1) + 'M'
      : '$' + Math.round(l.price/1000) + 'K';

    var icon = L.divIcon({
      className: 'sr-price-marker-wrap',
      html: '<div class="sr-price-marker" data-idx="' + i + '">' + priceLabel + '</div>',
      iconSize: null,
      iconAnchor: [30, 36]
    });

    var marker = L.marker([l.lat, l.lng], {icon: icon}).addTo(_srMap);

    // Popup
    var feats = l.type === 'Land'
      ? l.lot
      : l.beds + ' Bed · ' + l.baths + ' Bath · ' + (l.sqft||0).toLocaleString() + ' SF';

    var popupImg = l.photo
      ? '<img class="sr-popup-img" src="' + l.photo + '" alt="' + l.address + '">'
      : '<div style="width:100%;height:110px;background:var(--surface);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.6rem">Property Photo</div>';

    var popupHtml = '<div class="sr-popup-inner">' +
      popupImg +
      '<div class="sr-popup-body">' +
        '<div class="sr-popup-price">$' + l.price.toLocaleString() + '</div>' +
        '<div class="sr-popup-addr">' + l.address + '</div>' +
        '<div class="sr-popup-city">' + l.city + ', NC</div>' +
        '<div class="sr-popup-feats">' + feats + '</div>' +
        '<button class="sr-popup-btn" onclick="event.stopPropagation();srOpenFromMap(' + i + ')">View Details</button>' +
      '</div></div>';

    marker.bindPopup(popupHtml, {className:'sr-popup', maxWidth:220, minWidth:220, closeButton:false});

    // Hover: highlight corresponding card
    marker.on('mouseover', function(){ srHighlightCard(i) });
    marker.on('mouseout', function(){ srUnhighlightCard(i) });

    _srMarkers.push(marker);
    bounds.extend([l.lat, l.lng]);
  });

  // Fit map to show all markers
  if(results.length > 0){
    _srMap.fitBounds(bounds, {padding:[40,40], maxZoom:13});
  }
}

// Store filtered results for popup access
var _srCurrentResults = [];
function srOpenFromMap(idx){
  var l = _srCurrentResults[idx];
  if(!l) return;
  openProp({price:l.price,address:l.address,type:l.type,beds:l.beds,baths:l.baths,sqft:l.sqft,lot:l.lot,restrictions:l.restrictions||'unrestricted',status:l.status||'Active'}, l.city);
}

function srHighlightMarker(idx){
  var marker = _srMarkers[idx];
  if(!marker) return;
  var el = marker.getElement();
  if(el){
    var pm = el.querySelector('.sr-price-marker');
    if(pm) pm.classList.add('active');
  }
}
function srUnhighlightMarker(idx){
  var marker = _srMarkers[idx];
  if(!marker) return;
  var el = marker.getElement();
  if(el){
    var pm = el.querySelector('.sr-price-marker');
    if(pm) pm.classList.remove('active');
  }
}
function srHighlightCard(idx){
  var cards = document.querySelectorAll('.sr-card');
  if(cards[idx]) cards[idx].classList.add('highlighted');
}
function srUnhighlightCard(idx){
  var cards = document.querySelectorAll('.sr-card');
  if(cards[idx]) cards[idx].classList.remove('highlighted');
}

function srClearFilters(){
  document.getElementById('srfLocSelect').value = '';
  document.getElementById('srfTypeSelect').value = '';
  document.getElementById('srfPriceSelect').value = '';
  document.getElementById('srfBedsSelect').value = '';
  document.getElementById('srfBathsSelect').value = '';
  document.getElementById('srfRestrictSelect').value = '';
  srApplyFilters();
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
      maxZoom:18
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
      updateAcctUI();
    } else {
      // Session expired — try to refresh silently
      var refresh = await _sb.auth.refreshSession();
      if(refresh.data && refresh.data.session) {
        _acctLoggedIn = true;
        _currentUser = refresh.data.session.user;
        await loadFavoritesFromCloud();
        updateAcctUI();
        console.log('[Auth] Session refreshed successfully');
      }
    }
    // Listen for auth changes (login/logout/token refresh)
    _sb.auth.onAuthStateChange(function(event, session) {
      if(session && session.user) {
        _acctLoggedIn = true;
        _currentUser = session.user;
        if(event === 'SIGNED_IN') loadFavoritesFromCloud();
      } else if(event === 'SIGNED_OUT') {
        _acctLoggedIn = false;
        _currentUser = null;
        _favProps = {};
        saveFavs();
      }
      // Don't log out on TOKEN_REFRESHED failures — keep cached state
      updateAcctUI();
    });
  } catch(e){ console.warn('[Supabase] Auth init error:', e); }
}
// Run auth check
initSupabaseAuth();

// --- Account UI update ---
function updateAcctUI() {
  var btn = document.getElementById('navAcct');
  var label = document.getElementById('navAcctLabel');
  if(_acctLoggedIn) {
    label.textContent = 'My Account';
    btn.classList.add('logged-in');
  } else {
    label.textContent = 'Sign In';
    btn.classList.remove('logged-in');
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
  if(_acctLoggedIn) {
    // Show account dashboard
    document.getElementById('acctFormView').style.display = 'none';
    document.getElementById('acctLoginView').style.display = 'none';
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
    loadSavedSearchesUI();
    buildDashboardSuggestions();
    modal.classList.add('open');
    return;
  }
  document.getElementById('acctFormView').style.display = '';
  document.getElementById('acctLoginView').style.display = 'none';
  document.getElementById('acctSuccessView').style.display = 'none';
  document.getElementById('acctDashView').style.display = 'none';
  clearAcctErrors();
  modal.classList.add('open');
  setTimeout(function(){ document.getElementById('acctFirst').focus() }, 300);
}

function closeAcctModal() {
  document.getElementById('acctModal').classList.remove('open');
}

function signOutAcct() {
  if(_sb) _sb.auth.signOut();
  _acctLoggedIn = false;
  _currentUser = null;
  _favProps = {};
  saveFavs();
  updateAcctUI();
  closeAcctModal();
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
  document.getElementById('acctFormView').style.display = 'none';
  document.getElementById('acctLoginView').style.display = '';
  document.getElementById('acctSuccessView').style.display = 'none';
  document.getElementById('acctDashView').style.display = 'none';
  clearAcctErrors();
  setTimeout(function(){ document.getElementById('acctLoginEmail').focus() }, 100);
}

function showAcctSignup() {
  document.getElementById('acctFormView').style.display = '';
  document.getElementById('acctLoginView').style.display = 'none';
  document.getElementById('acctSuccessView').style.display = 'none';
  document.getElementById('acctDashView').style.display = 'none';
  clearAcctErrors();
  setTimeout(function(){ document.getElementById('acctFirst').focus() }, 100);
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
  document.getElementById('acctModal').classList.remove('open');
}

// --- Create account (Supabase) ---
async function submitAcct() {
  var first = document.getElementById('acctFirst').value.trim();
  var last = document.getElementById('acctLast').value.trim();
  var email = document.getElementById('acctEmail').value.trim();
  var pass = document.getElementById('acctPass').value;
  var phone = document.getElementById('acctPhone').value.trim();
  clearAcctErrors();
  // Validate required fields
  if(!first){ document.getElementById('acctFirst').focus(); document.getElementById('acctFirst').style.borderColor='#c07070'; return; }
  if(!last){ document.getElementById('acctLast').focus(); document.getElementById('acctLast').style.borderColor='#c07070'; return; }
  if(!email || email.indexOf('@')<1){ document.getElementById('acctEmail').focus(); document.getElementById('acctEmail').style.borderColor='#c07070'; return; }
  if(!pass || pass.length < 6){ document.getElementById('acctPass').focus(); document.getElementById('acctPass').style.borderColor='#c07070'; return; }
  if(!phone){ document.getElementById('acctPhone').focus(); document.getElementById('acctPhone').style.borderColor='#c07070'; return; }

  // Disable button while working
  var btn = document.querySelector('#acctFormView .acct-submit');
  btn.textContent = 'Creating Account...';
  btn.disabled = true;

  if(!_sb) { showAcctError('acctSignupError', 'Service unavailable. Please try again later.'); btn.textContent='Create Free Account'; btn.disabled=false; return; }

  try {
    var result = await _sb.auth.signUp({ email: email, password: pass });
    if(result.error) {
      var errMsg = result.error.message;
      if(errMsg.indexOf('already registered') > -1) errMsg = 'This email already has an account. Try signing in instead.';
      showAcctError('acctSignupError', errMsg);
      btn.textContent = 'Create Free Account';
      btn.disabled = false;
      return;
    }
    // Create profile (triggers FUB push)
    if(result.data && result.data.user) {
      _currentUser = result.data.user;
      await _sb.from('profiles').insert({
        id: result.data.user.id,
        first_name: first,
        last_name: last,
        email: email,
        phone: phone
      });
      // If they chatted before signing up, push transcript to FUB as a lead
      if(!_chatLeadPushed && convHistory && convHistory.length > 0){
        var transcript = buildChatTranscript();
        if(transcript){
          _sb.from('leads').insert({
            first_name: first,
            last_name: last,
            email: email,
            phone: phone,
            message: transcript,
            source: 'chatbot_signup'
          }).then(function(){ _chatLeadPushed = true; console.log('[Signup] Chat transcript pushed to FUB'); })
            .catch(function(e){ console.warn('[Signup] Chat transcript push failed:', e); });
        }
      }
    }
    _acctLoggedIn = true;
    // Save profile to localStorage (used by chatbot)
    try{localStorage.setItem('cc_profile',JSON.stringify({firstName:first,lastName:last,email:email,phone:phone,password:true}))}catch(e){}
    // Show success
    document.getElementById('acctFormView').style.display = 'none';
    document.getElementById('acctSuccessView').style.display = '';
    updateAcctUI();
    setTimeout(function(){ closeAcctModal() }, 2000);
  } catch(e) {
    showAcctError('acctSignupError', 'Something went wrong. Please try again.');
    btn.textContent = 'Create Free Account';
    btn.disabled = false;
  }
}

// --- Sign in (Supabase) ---
async function loginAcct() {
  var email = document.getElementById('acctLoginEmail').value.trim();
  var pass = document.getElementById('acctLoginPass').value;
  clearAcctErrors();
  if(!email || email.indexOf('@')<1){ document.getElementById('acctLoginEmail').focus(); document.getElementById('acctLoginEmail').style.borderColor='#c07070'; return; }
  if(!pass){ document.getElementById('acctLoginPass').focus(); document.getElementById('acctLoginPass').style.borderColor='#c07070'; return; }

  var btn = document.querySelector('#acctLoginView .acct-submit');
  btn.textContent = 'Signing In...';
  btn.disabled = true;

  if(!_sb) { showAcctError('acctLoginError', 'Service unavailable. Please try again later.'); btn.textContent='Sign In'; btn.disabled=false; return; }

  try {
    var result = await _sb.auth.signInWithPassword({ email: email, password: pass });
    if(result.error) {
      showAcctError('acctLoginError', 'Invalid email or password. Please try again.');
      btn.textContent = 'Sign In';
      btn.disabled = false;
      return;
    }
    _acctLoggedIn = true;
    _currentUser = result.data.user;
    await loadFavoritesFromCloud();
    // Show success
    document.getElementById('acctLoginView').style.display = 'none';
    document.getElementById('acctSuccessView').style.display = '';
    updateAcctUI();
    setTimeout(function(){ closeAcctModal() }, 2000);
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
  if(!phone){ document.getElementById('ctaPhone').focus(); document.getElementById('ctaPhone').style.borderColor='#c07070'; return; }

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
      await _sb.from('leads').insert({
        first_name: first,
        last_name: last,
        email: email,
        phone: phone,
        message: leadMsg,
        source: 'consultation_form'
      });
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
      parentBox.title = 'Create a free account to view';
      parentBox.setAttribute('data-gated-parent','1');
      parentBox.onclick = function(e){ e.stopPropagation(); openAcctModal(); };
      // Add "Create Account" hint below the blurred text
      if(!parentBox.querySelector('.gated-hint')){
        var hint = document.createElement('div');
        hint.className = 'gated-hint';
        hint.textContent = 'Create account to view';
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
  if(_favProps[_currentPropKey]) {
    delete _favProps[_currentPropKey];
    saveFavs();
    saveFavToCloud(_currentPropKey, false);
  } else {
    _favProps[_currentPropKey] = true;
    saveFavs();
    saveFavToCloud(_currentPropKey, true);
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
  ALL_LISTINGS.forEach(function(l){
    var key = propKey(l, l.city);
    if(_favProps[key]) return;
    if(excludeAddress && l.address === excludeAddress) return;
    var score = 0;
    if(l.type === patterns.topType) score += 3;
    if(l.city === patterns.topTown) score += 2;
    if(l.price >= patterns.priceMin && l.price <= patterns.priceMax) score += 2;
    if(l.restrictions === patterns.topRestriction) score += 1;
    if(score >= 3) scored.push({listing:l, score:score});
  });
  scored.sort(function(a,b){return b.score-a.score});
  return scored.slice(0,3).map(function(s){return s.listing});
}

// Fallback: find suggestions based on current property (for non-logged-in users)
function findSuggestionsFromCurrent(currentListing) {
  if(!currentListing) return [];
  var scored = [];
  ALL_LISTINGS.forEach(function(l){
    if(l.address === currentListing.address && l.price === currentListing.price) return;
    var score = 0;
    if(l.type === currentListing.type) score += 3;
    if(l.city === (currentListing.city || window._currentTownName)) score += 2;
    if(currentListing.price > 0 && l.price >= currentListing.price*0.5 && l.price <= currentListing.price*1.8) score += 2;
    if(score >= 4) scored.push({listing:l, score:score});
  });
  scored.sort(function(a,b){return b.score-a.score});
  return scored.slice(0,3).map(function(s){return s.listing});
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
    var feats = l.type === 'Land'
      ? '<span class="f-feat"><strong>'+l.lot+'</strong></span>'
      : '<span class="f-feat"><strong>'+l.beds+'</strong> Beds</span><span class="f-feat"><strong>'+l.baths+'</strong> Baths</span><span class="f-feat"><strong>'+(l.sqft||0).toLocaleString()+'</strong> SF</span>';
    var imgSrc = l.photo || (PROP_IMAGES[l.type]||PROP_IMAGES['Single Family'])[0].replace('w=1200','w=700');
    c.innerHTML = '<div class="f-card-img"><img src="'+imgSrc+'" alt="'+l.address+'" loading="lazy"><div class="f-card-badge'+(l.type==='Land'?' land':'')+'">' + l.type + '</div><div class="f-card-badge" style="right:auto;left:0.75rem;background:var(--gold);color:var(--bg);font-size:0.5rem">Suggested</div>'+cardFavHtml(l.address, l.city||townName)+'</div><div class="f-card-body"><div class="f-card-price">$'+l.price.toLocaleString()+'</div><div class="f-card-addr">'+l.address+'</div><div class="f-card-city">'+(l.city||townName)+', NC</div><div class="f-card-features">'+feats+'</div></div>';
    c.onclick = function(){ openProp(l, l.city||townName); };
    grid.appendChild(c);
  });
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
var _compareRowOrder = ['price','beds','baths','sqft','lot','daysOnMarket','type','restrictions','location'];
var _compareRowLabels = {
  price:'Price', beds:'Bedrooms', baths:'Bathrooms', sqft:'Square Feet',
  lot:'Lot Size', daysOnMarket:'Days on Market', type:'Property Type',
  restrictions:'Restrictions', location:'Location'
};

function openCompare() {
  if(!_acctLoggedIn) { openAcctModal(); return; }
  _compareSelected = [];
  var overlay = document.getElementById('compareOverlay');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  showCompareSelect();
  try{history.pushState({page:'compare'},'','#compare')}catch(e){}
}

function closeCompare() {
  var overlay = document.getElementById('compareOverlay');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
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
    card.innerHTML = '<img class="compare-fav-card-img" src="'+imgSrc+'" alt="'+l.address+'" loading="lazy">'+
      '<div class="compare-fav-card-price">$'+l.price.toLocaleString()+'</div>'+
      '<div class="compare-fav-card-addr">'+l.address+'</div>'+
      '<div class="compare-fav-card-city">'+(l.city||'')+', NC</div>'+
      '<div class="compare-fav-card-type">'+l.type+'</div>';
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
    default: return '';
  }
}

function formatCompareVal(listing, field) {
  switch(field){
    case 'price': return '$'+(listing.price||0).toLocaleString();
    case 'beds': return (listing.beds||0)+' Bed'+(listing.beds!==1?'s':'');
    case 'baths': return (listing.baths||0)+' Bath'+(listing.baths!==1?'s':'');
    case 'sqft': return listing.sqft ? listing.sqft.toLocaleString()+' SF' : 'N/A';
    case 'lot': return listing.lot || 'N/A';
    case 'daysOnMarket': return (listing.daysOnMarket||0)+' days';
    case 'type': return listing.type || 'N/A';
    case 'restrictions': return RESTRICT_LABELS[listing.restrictions]||listing.restrictions||'N/A';
    case 'location': return (listing.city||'')+', NC';
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
  // Show notes textarea for logged-in users & load saved notes
  var notesWrap = document.getElementById('propNotesWrap');
  var notesTA = document.getElementById('propNotesTA');
  if(notesWrap) notesWrap.style.display = _acctLoggedIn ? '' : 'none';
  if(notesTA) {
    // Load saved notes for this property
    try { notesTA.value = localStorage.getItem('cc-note-'+key) || ''; } catch(e){ notesTA.value = ''; }
    // Auto-save on typing
    notesTA.oninput = function(){ try{ if(notesTA.value) localStorage.setItem('cc-note-'+key, notesTA.value); else localStorage.removeItem('cc-note-'+key); }catch(e){} };
  }
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

// ═══ SIMPLYRETS INIT ═══
// SimplyRETS requires the site to be hosted on a domain (not opened as a local file)
if(SIMPLYRETS.enabled) {
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
function _checkPropDeepLink(){
  try {
    var params = new URLSearchParams(window.location.search);
    var propAddr = params.get('prop');
    var propCity = params.get('city');
    if(!propAddr) return;
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
        setTimeout(function(){ openProp({price:match.price,address:match.address,type:match.type,beds:match.beds,baths:match.baths,sqft:match.sqft,lot:match.lot,restrictions:match.restrictions||'unrestricted',status:match.status||'Active',photo:match.photo||null,photos:match.photos||[],description:match.description||''}, match.city||propCity); }, 300);
      }
    }
  } catch(e){ console.warn('[DeepLink] Error:', e); }
}
// Also check on page load in case SimplyRETS is disabled
if(!SIMPLYRETS.enabled) _checkPropDeepLink();
