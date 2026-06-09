// ═══ THEME TOGGLE (shared across all pages) ═══
(function(){
  // Restore saved theme
  var saved = localStorage.getItem('theme');
  if(saved) document.documentElement.setAttribute('data-theme', saved);
})();

function toggleTheme(){
  var html = document.documentElement;
  var current = html.getAttribute('data-theme');
  var next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}

// ═══ NAV SCROLL ═══
window.addEventListener('scroll', function(){
  var nav = document.getElementById('nav');
  if(nav) nav.classList.toggle('scrolled', window.scrollY > 40);
});

// ═══ MOBILE MENU ═══
// Only wire hamburger if app.js is NOT loaded (app.js has its own handler with pushState support)
document.addEventListener('DOMContentLoaded', function(){
  if(typeof _isTownPage !== 'undefined') return; // app.js is loaded — it handles the menu
  var toggle = document.getElementById('navToggle');
  var menu = document.getElementById('mobileMenu');
  if(toggle && menu){
    toggle.addEventListener('click', function(){
      menu.classList.toggle('open');
      toggle.classList.toggle('active');
    });
  }
});

function closeMobile(){
  var menu = document.getElementById('mobileMenu');
  var toggle = document.getElementById('navToggle');
  if(menu) menu.classList.remove('open');
  if(toggle) toggle.classList.remove('active');
}

// ═══ PRICE RANGE SLIDER (shared for town pages) ═══
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

// Auto-init any sliders found on the page
document.addEventListener('DOMContentLoaded', function(){
  var wraps = document.querySelectorAll('.ps-wrap[id]');
  wraps.forEach(function(el){
    var id = el.id.replace('ps-','');
    if(id) initSlider(id);
  });
});

// ═══ TOWN PAGE CARD WIRING ═══
// Makes static property cards clickable on standalone town pages (not index.html)
(function(){
  // Only run on town pages (not the main site which has app.js)
  if(document.getElementById('featuredGrid')) return; // main site has this

  document.addEventListener('DOMContentLoaded', function(){
    // If app.js is loaded, it handles card wiring with openProp — skip redirect wiring
    if(typeof openProp === 'function') return;

    var cards = document.querySelectorAll('.f-card');
    if(!cards.length) return;

    cards.forEach(function(card){
      var priceEl = card.querySelector('.f-card-price');
      var addrEl = card.querySelector('.f-card-addr');
      var cityEl = card.querySelector('.f-card-city');
      if(!priceEl || !addrEl) return;

      var price = priceEl.textContent.trim();
      var addr = addrEl.textContent.trim();
      var city = cityEl ? cityEl.textContent.replace(/,\s*NC$/i,'').trim() : '';

      // Make card clickable — navigate to main site and open property
      card.style.cursor = 'pointer';
      card.onclick = function(){
        var base = window.location.pathname.indexOf('/towns/') > -1 ? '../index.html' : '/index.html';
        var returnUrl = window.location.href;
        var url = base + '?prop=' + encodeURIComponent(addr) + '&city=' + encodeURIComponent(city) + '&ref=' + encodeURIComponent(returnUrl);
        window.location.href = url;
      };
    });
  });
})();

// ═══ LEAD JOURNEY TRACKER (shared across all pages) ═══
// Best-effort record of how a visitor arrived and what they viewed, kept in
// sessionStorage so a captured lead can carry its full story to the CRM
// (referrer/channel, landing page, pages, properties). Never throws, never blocks.
// app.js calls window._leadJourney.addProperty(...) on each property view, and
// _pushToFUB attaches window._leadJourney.fields() to every forwarded lead.
(function(){
  var KEY = 'cc_journey';
  function iso(){ try { return new Date().toISOString(); } catch(e){ return ''; } }
  function read(){ try { return JSON.parse(sessionStorage.getItem(KEY)); } catch(e){ return null; } }
  function write(j){ try { sessionStorage.setItem(KEY, JSON.stringify(j)); } catch(e){} }
  function path(){ try { return location.pathname + (location.search || ''); } catch(e){ return ''; } }
  function title(){ try { return (document.title || '').slice(0, 120); } catch(e){ return ''; } }
  function utm(){
    var o = {};
    try {
      var p = new URLSearchParams(location.search || '');
      ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'].forEach(function(k){
        var v = p.get(k); if(v) o[k] = v;
      });
    } catch(e){}
    return o;
  }
  function channel(j){
    if(j.utm && j.utm.utm_source) return j.utm.utm_source + (j.utm.utm_medium ? ' / ' + j.utm.utm_medium : '') + (j.utm.utm_campaign ? ' (' + j.utm.utm_campaign + ')' : '');
    var r = j.referrer || '';
    if(!r) return 'Direct (typed in or bookmarked)';
    if(/google\./i.test(r)) return 'Google search';
    if(/bing\./i.test(r)) return 'Bing search';
    if(/duckduckgo\./i.test(r)) return 'DuckDuckGo search';
    if(/facebook\.|fb\.com|fb\.me|fbclid/i.test(r)) return 'Facebook';
    if(/instagram\./i.test(r)) return 'Instagram';
    if(/youtube\./i.test(r)) return 'YouTube';
    if(/coryhelpsyoumove\.com/i.test(r)) return 'Direct (typed in or bookmarked)';
    return r;
  }
  function summary(j){
    var L = [];
    L.push('Found via: ' + channel(j));
    L.push('Landed on: ' + (j.landing_title || j.landing_page) + '  [' + j.landing_page + ']');
    var props = j.properties || [];
    if(props.length) L.push('Properties viewed (' + props.length + '): ' + props.map(function(p){ return p.address + (p.price ? ' ' + p.price : ''); }).join('; '));
    var pgs = (j.pages || []).map(function(p){ return p.title || p.path; }).filter(function(v, i, a){ return a.indexOf(v) === i; });
    if(pgs.length) L.push('Pages this visit (' + pgs.length + '): ' + pgs.slice(0, 15).join(' -> '));
    return L.join('\n');
  }

  var j = read();
  if(!j){
    var ref = ''; try { ref = document.referrer || ''; } catch(e){}
    j = { landing_page: path(), landing_title: title(), referrer: ref, utm: utm(), started_at: iso(), pages: [], properties: [] };
  }
  var cur = path(), lastPage = j.pages.length ? j.pages[j.pages.length - 1] : null;
  if(!lastPage || lastPage.path !== cur){
    j.pages.push({ path: cur, title: title(), at: iso() });
    if(j.pages.length > 40) j.pages = j.pages.slice(-40);
  }
  write(j);

  window._leadJourney = {
    get: function(){ return read() || j; },
    addProperty: function(address, price, id){
      if(!address) return;
      var c = read() || j;
      if(!c.properties) c.properties = [];
      if(!c.properties.some(function(p){ return p.address === address; })){
        c.properties.push({ address: address, price: price || '', id: id || '', at: iso() });
        if(c.properties.length > 30) c.properties = c.properties.slice(-30);
        write(c);
      }
    },
    summary: function(){ return summary(read() || j); },
    fields: function(){
      var c = read() || j;
      return {
        referrer: c.referrer || '',
        channel: channel(c),
        landing_page: c.landing_page || '',
        utm_source: (c.utm && c.utm.utm_source) || '',
        utm_medium: (c.utm && c.utm.utm_medium) || '',
        utm_campaign: (c.utm && c.utm.utm_campaign) || '',
        pages_viewed: (c.pages || []).map(function(p){ return p.path; }),
        properties_viewed: (c.properties || []).map(function(p){ return { address: p.address, price: p.price, id: p.id }; }),
        journey_summary: summary(c)
      };
    }
  };
})();
