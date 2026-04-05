// ═══ Social Image Generator v2 ═══
// Research-based templates optimized for engagement
// Templates: clean-minimal, scroll-stopper, split-card, corner-badge, magazine

var SocialImage = (function() {
  var WIDTH = 1080;
  var HEIGHT = 1080;
  var _canvas = null;
  var _ctx = null;
  var _img = null;
  var _imgLoaded = false;
  var _offsetY = 0;
  var _offsetX = 0;
  var _zoom = 1;
  var _dragging = false;
  var _dragStartX = 0;
  var _dragStartY = 0;
  var _dragStartOffsetX = 0;
  var _dragStartOffset = 0;
  var _currentTemplate = 'clean-minimal';
  var _listing = null;
  var _onUpdate = null;
  var _photos = [];
  var _photoIndex = 0;
  var _headshot = null;
  var _headshotLoaded = false;

  function init(canvasEl, listing, onUpdate) {
    _canvas = canvasEl;
    _canvas.width = WIDTH;
    _canvas.height = HEIGHT;
    _ctx = _canvas.getContext('2d');
    _listing = listing;
    _onUpdate = onUpdate;
    _offsetY = 0;
    _offsetX = 0;
    _zoom = 1;

    _photos = [];
    if (listing.photos && listing.photos.length) _photos = listing.photos.slice();
    else if (listing.photo) _photos = [listing.photo];
    _photoIndex = 0;

    // Convert R2 public URLs to worker URLs for CORS support
    var WORKER_URL = 'https://r2-upload.coryhelpsyoumove.workers.dev';
    var R2_PUBLIC = 'https://pub-bfc65eba3b4f4bec8ca241aab44da702.r2.dev';
    _photos = _photos.map(function(url) {
      if (url && url.indexOf(R2_PUBLIC) === 0) {
        return WORKER_URL + url.substring(R2_PUBLIC.length);
      }
      return url;
    });

    _img = new Image();
    _img.crossOrigin = 'anonymous';
    _img.onload = function() {
      _imgLoaded = true;
      var scale = WIDTH / _img.width;
      var scaledH = _img.height * scale;
      _offsetY = -(scaledH - HEIGHT) / 2;
      render();
    };
    _img.onerror = function() {
      _imgLoaded = false;
      _ctx.fillStyle = '#1A1815';
      _ctx.fillRect(0, 0, WIDTH, HEIGHT);
      _ctx.fillStyle = '#8A8578';
      _ctx.font = '24px sans-serif';
      _ctx.textAlign = 'center';
      _ctx.fillText('Photo not available', WIDTH/2, HEIGHT/2);
    };
    if (_photos.length > 0) _img.src = _photos[0];

    // Preload headshot
    _headshot = new Image();
    _headshot.crossOrigin = 'anonymous';
    _headshot.onload = function() { _headshotLoaded = true; render(); };
    _headshot.src = 'https://coryhelpsyoumove.com/images/about-cory.webp';

    _canvas.onmousedown = function(e) { startDrag(e.clientX, e.clientY); };
    _canvas.onmousemove = function(e) { if(_dragging) doDrag(e.clientX, e.clientY); };
    _canvas.onmouseup = function() { endDrag(); };
    _canvas.onmouseleave = function() { endDrag(); };
    _canvas.ontouchstart = function(e) { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); };
    _canvas.ontouchmove = function(e) { e.preventDefault(); if(_dragging) doDrag(e.touches[0].clientX, e.touches[0].clientY); };
    _canvas.ontouchend = function() { endDrag(); };
    _canvas.onwheel = function(e) {
      e.preventDefault();
      _zoom = Math.max(0.5, Math.min(3, _zoom + (e.deltaY > 0 ? -0.05 : 0.05)));
      render();
    };
  }

  function startDrag(cx, cy) { _dragging=true; _dragStartX=cx; _dragStartY=cy; _dragStartOffsetX=_offsetX; _dragStartOffset=_offsetY; _canvas.style.cursor='grabbing'; }
  function doDrag(cx, cy) {
    var r = _canvas.getBoundingClientRect(), s = WIDTH/r.width;
    _offsetX = _dragStartOffsetX + (cx-_dragStartX)*s;
    _offsetY = _dragStartOffset + (cy-_dragStartY)*s;
    render();
  }
  function endDrag() { _dragging=false; if(_canvas) _canvas.style.cursor='grab'; }

  function setTemplate(n) { _currentTemplate=n; render(); }
  function setPhoto(i) { if(i<0||i>=_photos.length)return; _photoIndex=i; _imgLoaded=false; _offsetX=0; _zoom=1; _img.src=_photos[i]; }
  function nextPhoto() { setPhoto((_photoIndex+1)%_photos.length); }
  function prevPhoto() { setPhoto((_photoIndex-1+_photos.length)%_photos.length); }
  function getPhotoIndex() { return _photoIndex; }
  function getPhotoCount() { return _photos.length; }

  // ── Draw photo with zoom/pan ──
  function drawPhoto(ctx, x, y, w, h) {
    if (!_imgLoaded) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    var scale = (w / _img.width) * _zoom;
    var sw = _img.width * scale;
    var sh = _img.height * scale;
    var ox = _offsetX * (w/WIDTH);
    var oy = _offsetY * (h/HEIGHT);
    var dx = x + ox + (w - sw)/2;
    var dy = y + oy + (h - sh)/2;
    // For full-canvas templates, use raw offsets
    if (w === WIDTH && h === HEIGHT) {
      scale = (WIDTH / _img.width) * _zoom;
      sw = _img.width * scale;
      sh = _img.height * scale;
      dx = _offsetX + (WIDTH - sw)/2;
      dy = _offsetY;
    }
    ctx.drawImage(_img, dx, dy, sw, sh);
    ctx.restore();
  }

  // ── Helper: stats string ──
  function getStats(l) {
    var s = [];
    if (l.type !== 'Land') {
      if (l.beds) s.push(l.beds + ' Bed');
      if (l.baths) s.push(l.baths + ' Bath');
      if (l.sqft) s.push(l.sqft.toLocaleString() + ' SF');
    }
    if (l.lot) s.push(l.lot);
    return s;
  }

  function priceStr(l) { return '$' + (l.price||0).toLocaleString(); }

  // ── Helper: text with drop shadow ──
  function shadowText(ctx, text, x, y, shadowColor, shadowBlur) {
    ctx.save();
    ctx.shadowColor = shadowColor || 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = shadowBlur || 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
    ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
    ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
    ctx.closePath();
  }

  // ── Shared branding section with headshot ──
  function drawBranding(ctx, y, h, style) {
    var isDark = style !== 'light';
    var bgColor = isDark ? '#0C0B09' : '#FFFFFF';
    var nameColor = isDark ? '#F5F0E8' : '#1A1815';
    var firmColor = isDark ? '#C4B08C' : '#8B7748';
    var urlColor = isDark ? 'rgba(245,240,232,0.6)' : 'rgba(0,0,0,0.4)';

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, y, WIDTH, h);

    // Gold accent line at top
    ctx.fillStyle = firmColor;
    ctx.fillRect(0, y, WIDTH, 4);

    // Headshot - large circle
    var circleR = 65;
    var circleX = 60 + circleR;
    var circleY = y + h/2;
    if (_headshotLoaded) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(circleX, circleY, circleR, 0, Math.PI*2);
      ctx.clip();
      var hSize = circleR * 2;
      var hScale = hSize / Math.min(_headshot.width, _headshot.height);
      var hW = _headshot.width * hScale;
      var hH = _headshot.height * hScale;
      ctx.drawImage(_headshot, circleX - hW/2, circleY - hH/2, hW, hH);
      ctx.restore();
      // Gold border
      ctx.strokeStyle = firmColor;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(circleX, circleY, circleR, 0, Math.PI*2);
      ctx.stroke();
    }

    // Name - very large and bold
    var textX = circleX + circleR + 25;
    ctx.textAlign = 'left';
    ctx.font = '700 44px Outfit, sans-serif';
    ctx.fillStyle = nameColor;
    ctx.fillText('Cory Coleman', textX, circleY - 18);

    // Broker title
    ctx.font = '400 22px Outfit, sans-serif';
    ctx.fillStyle = firmColor;
    ctx.fillText('Broker', textX, circleY + 12);

    // Firm name - prominent
    ctx.font = '500 24px Outfit, sans-serif';
    ctx.fillStyle = nameColor;
    ctx.fillText('Keller Williams Great Smokies', textX, circleY + 44);

    // Website + phone
    ctx.font = '400 20px Outfit, sans-serif';
    ctx.fillStyle = firmColor;
    ctx.fillText('coryhelpsyoumove.com  |  (828) 506-6413', textX, circleY + 74);

    ctx.textAlign = 'left';
  }

  function render() {
    if (!_ctx) return;
    var ctx = _ctx;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    var fn = {
      'clean-minimal': renderCleanMinimal,
      'scroll-stopper': renderScrollStopper,
      'split-card': renderSplitCard,
      'corner-badge': renderCornerBadge,
      'magazine': renderMagazine
    }[_currentTemplate] || renderCleanMinimal;

    fn(ctx);
    if (_onUpdate) _onUpdate();
  }

  // ═══ TEMPLATE 1: Clean Minimal ═══
  // Photo dominates. Large price in bottom-left. Tiny address + branding.
  function renderCleanMinimal(ctx) {
    var l = _listing;
    drawPhoto(ctx, 0, 0, WIDTH, HEIGHT);

    // Subtle bottom gradient for text readability
    var grad = ctx.createLinearGradient(0, HEIGHT*0.6, 0, HEIGHT);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Price - large, above branding bar
    ctx.textAlign = 'left';
    ctx.font = '700 72px Georgia, serif';
    ctx.fillStyle = '#FFFFFF';
    shadowText(ctx, priceStr(l), 50, HEIGHT - 300);

    // Address + city
    ctx.font = '400 26px Outfit, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    shadowText(ctx, (l.address||'') + '  |  ' + (l.city||'') + ', NC', 50, HEIGHT - 250);

    // Stats
    ctx.font = '300 20px Outfit, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    shadowText(ctx, getStats(l).join('  \u00B7  '), 50, HEIGHT - 220);

    // Branding bar at bottom
    drawBranding(ctx, HEIGHT - 200, 200, 'dark');
  }

  // ═══ TEMPLATE 2: Scroll Stopper ═══
  // Bold hook text at top, price prominent, designed to stop the scroll
  function renderScrollStopper(ctx) {
    var l = _listing;
    drawPhoto(ctx, 0, 0, WIDTH, HEIGHT);

    // Dark overlay - heavier for text readability
    var grad = ctx.createLinearGradient(0, 0, 0, HEIGHT*0.35);
    grad.addColorStop(0, 'rgba(0,0,0,0.7)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    var grad2 = ctx.createLinearGradient(0, HEIGHT*0.65, 0, HEIGHT);
    grad2.addColorStop(0, 'rgba(0,0,0,0)');
    grad2.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Hook text at top
    ctx.textAlign = 'center';
    var hookText = '';
    if (l.type === 'Land') hookText = l.lot + ' in ' + (l.city||'WNC');
    else if (l.price < 300000) hookText = 'Under $300K in ' + (l.city||'WNC');
    else if (l.price < 500000) hookText = 'Under $500K in ' + (l.city||'WNC');
    else hookText = (l.beds||'') + ' Bed ' + (l.type||'Home') + ' in ' + (l.city||'WNC');
    ctx.font = '700 48px Georgia, serif';
    ctx.fillStyle = '#FFFFFF';
    shadowText(ctx, hookText, WIDTH/2, 80);

    // Price - huge, centered
    ctx.font = '800 96px Georgia, serif';
    ctx.fillStyle = '#C4B08C';
    shadowText(ctx, priceStr(l), WIDTH/2, HEIGHT - 310);

    // Address
    ctx.font = '400 28px Outfit, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    shadowText(ctx, (l.address||'') + ', ' + (l.city||'') + ', NC', WIDTH/2, HEIGHT - 250);

    // Stats
    ctx.font = '300 22px Outfit, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    shadowText(ctx, getStats(l).join('  \u00B7  '), WIDTH/2, HEIGHT - 215);
    ctx.textAlign = 'left';

    // Branding bar
    drawBranding(ctx, HEIGHT - 200, 200, 'dark');
  }

  // ═══ TEMPLATE 3: Split Card ═══
  // Photo top 60%, solid dark card bottom 40%
  function renderSplitCard(ctx) {
    var l = _listing;
    var splitY = Math.round(HEIGHT * 0.48);

    // Photo in top portion
    drawPhoto(ctx, 0, 0, WIDTH, splitY);

    // Solid dark card bottom
    ctx.fillStyle = '#0C0B09';
    ctx.fillRect(0, splitY, WIDTH, HEIGHT - splitY);

    // Gold accent line
    ctx.fillStyle = '#C4B08C';
    ctx.fillRect(0, splitY, WIDTH, 3);

    // NEW LISTING badge on photo
    ctx.fillStyle = '#C4B08C';
    roundRect(ctx, 40, 30, 180, 38, 5);
    ctx.fill();
    ctx.font = '600 14px Outfit, sans-serif';
    ctx.fillStyle = '#0C0B09';
    ctx.textAlign = 'center';
    ctx.fillText('NEW LISTING', 130, 54);

    // Price
    ctx.textAlign = 'left';
    ctx.font = '700 56px Georgia, serif';
    ctx.fillStyle = '#C4B08C';
    ctx.fillText(priceStr(l), 50, splitY + 65);

    // Stats on right of price
    ctx.textAlign = 'right';
    ctx.font = '500 22px Outfit, sans-serif';
    ctx.fillStyle = '#F5F0E8';
    ctx.fillText(getStats(l).join('  |  '), WIDTH - 50, splitY + 50);
    ctx.textAlign = 'left';

    // Address
    ctx.font = '400 28px Outfit, sans-serif';
    ctx.fillStyle = '#F5F0E8';
    ctx.fillText(l.address || '', 50, splitY + 115);

    // City, State
    ctx.font = '300 22px Outfit, sans-serif';
    ctx.fillStyle = '#F5F0E8';
    ctx.fillText((l.city||'') + ', North Carolina', 50, splitY + 150);

    // Branding bar at bottom of card
    drawBranding(ctx, HEIGHT - 200, 200, 'dark');
  }

  // ═══ TEMPLATE 4: Corner Badge ═══
  // Photo fills everything. Just a small price badge in corner. Most organic looking.
  function renderCornerBadge(ctx) {
    var l = _listing;
    drawPhoto(ctx, 0, 0, WIDTH, HEIGHT);

    // Price badge - bottom left corner
    var badgeW = 280;
    var badgeH = 90;
    var badgeX = 0;
    var badgeY = HEIGHT - badgeH;
    ctx.fillStyle = 'rgba(12,11,9,0.85)';
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
    // Gold accent on right edge of badge
    ctx.fillStyle = '#C4B08C';
    ctx.fillRect(badgeW, badgeY, 3, badgeH);

    ctx.textAlign = 'left';
    ctx.font = '700 36px Georgia, serif';
    ctx.fillStyle = '#F5F0E8';
    ctx.fillText(priceStr(l), 25, badgeY + 40);
    ctx.font = '300 16px Outfit, sans-serif';
    ctx.fillStyle = 'rgba(245,240,232,0.7)';
    ctx.fillText((l.city||'') + ', NC  \u00B7  ' + getStats(l).slice(0,2).join(' / '), 25, badgeY + 68);

    // Branding bar at bottom
    drawBranding(ctx, HEIGHT - 200, 200, 'dark');
  }

  // ═══ TEMPLATE 5: Magazine ═══
  // White border, photo inside, elegant serif text below. Premium feel.
  function renderMagazine(ctx) {
    var l = _listing;
    var border = 40;
    var photoH = HEIGHT - 340;

    // White background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Photo with white border
    drawPhoto(ctx, border, border, WIDTH - border*2, photoH - border);

    // Price below photo
    ctx.textAlign = 'left';
    ctx.font = '300 52px Georgia, serif';
    ctx.fillStyle = '#1A1815';
    ctx.fillText(priceStr(l), border + 10, photoH + 45);

    // Stats on right
    ctx.textAlign = 'right';
    ctx.font = '400 20px Outfit, sans-serif';
    ctx.fillStyle = '#666';
    ctx.fillText(getStats(l).join('  |  '), WIDTH - border - 10, photoH + 35);
    ctx.textAlign = 'left';

    // Address
    ctx.font = '400 26px Outfit, sans-serif';
    ctx.fillStyle = '#333';
    ctx.fillText(l.address || '', border + 10, photoH + 90);

    // City
    ctx.font = '300 20px Outfit, sans-serif';
    ctx.fillStyle = '#666';
    ctx.fillText((l.city||'') + ', North Carolina', border + 10, photoH + 120);

    // Branding bar at bottom
    drawBranding(ctx, HEIGHT - 200, 200, 'dark');
  }

  // ── Export ──
  function toBlob(callback) { if(_canvas) _canvas.toBlob(callback, 'image/jpeg', 0.92); }
  function toDataURL() { return _canvas ? _canvas.toDataURL('image/jpeg', 0.92) : ''; }

  // ── Carousel: generate first slide (scroll-stopper) and last slide (CTA) ──
  function generateCarouselSlides(listing, callback) {
    // Returns array of data URLs: [scroll-stopper, ...raw photos..., CTA slide]
    var slides = [];
    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = WIDTH;
    tempCanvas.height = HEIGHT;
    var tempCtx = tempCanvas.getContext('2d');

    // Slide 1: Use current canvas state (whatever template is selected)
    slides.push(_canvas.toDataURL('image/jpeg', 0.92));

    // Middle slides: raw property photos (no overlay)
    // These will be added by the caller from the photos array

    // Last slide: CTA
    tempCtx.fillStyle = '#0C0B09';
    tempCtx.fillRect(0, 0, WIDTH, HEIGHT);

    // Gold accent lines
    tempCtx.strokeStyle = '#C4B08C';
    tempCtx.lineWidth = 2;
    tempCtx.strokeRect(60, 60, WIDTH-120, HEIGHT-120);

    tempCtx.textAlign = 'center';
    tempCtx.font = '300 42px Georgia, serif';
    tempCtx.fillStyle = '#F5F0E8';
    tempCtx.fillText('Interested in this property?', WIDTH/2, HEIGHT/2 - 80);

    tempCtx.font = '400 28px Outfit, sans-serif';
    tempCtx.fillStyle = '#C4B08C';
    tempCtx.fillText('coryhelpsyoumove.com', WIDTH/2, HEIGHT/2 - 20);

    tempCtx.font = '300 22px Outfit, sans-serif';
    tempCtx.fillStyle = '#F5F0E8';
    tempCtx.fillText('(828) 506-6413', WIDTH/2, HEIGHT/2 + 30);

    tempCtx.font = '400 20px Outfit, sans-serif';
    tempCtx.fillStyle = 'rgba(245,240,232,0.5)';
    tempCtx.fillText('Cory Coleman, Broker', WIDTH/2, HEIGHT/2 + 90);
    tempCtx.fillText('Keller Williams Great Smokies', WIDTH/2, HEIGHT/2 + 120);

    var ctaSlide = tempCanvas.toDataURL('image/jpeg', 0.92);

    callback(slides[0], ctaSlide);
  }

  return {
    init: init,
    setTemplate: setTemplate,
    setPhoto: setPhoto,
    nextPhoto: nextPhoto,
    prevPhoto: prevPhoto,
    getPhotoIndex: getPhotoIndex,
    getPhotoCount: getPhotoCount,
    render: render,
    toBlob: toBlob,
    toDataURL: toDataURL,
    generateCarouselSlides: generateCarouselSlides,
    templates: ['clean-minimal', 'scroll-stopper', 'split-card', 'corner-badge', 'magazine'],
    templateLabels: {
      'clean-minimal': 'Clean Minimal',
      'scroll-stopper': 'Scroll Stopper',
      'split-card': 'Split Card',
      'corner-badge': 'Corner Badge',
      'magazine': 'Magazine'
    }
  };
})();
