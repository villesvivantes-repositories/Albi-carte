/* Albi — visionneuse Deep Zoom, sans nouvelle correction des couleurs. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.ALBI_CONFIG || {};
  let viewer, metadata, ready = false, automaticFrame = true;
  let waiting;
  function fail(error) {
    clearTimeout(waiting);
    $('status').hidden = true;
    $('error').hidden = false;
    console.warn('Carte Albi :', error?.message || error);
  }
  function validate(m) {
    if (m.schema !== 'vv.isomap.web/1' || m.city !== 'Albi') throw Error('Métadonnées de carte non reconnues.');
    for (const key of ['width','height']) {
      if (!Number.isInteger(m[key]) || m[key] < 1 || m[key] > 100000) throw Error('Dimensions invalides.');
    }
    if (m.tileSize !== 512 || m.overlap !== 1 || m.format !== 'webp' || m.tilePath !== 'map_files/') throw Error('Format de tuiles non reconnu.');
    if (!Array.isArray(m.credits) || m.credits.some(v => typeof v !== 'string')) throw Error('Crédits invalides.');
    return m;
  }
  function frame(immediate = false, whole = false) {
    if (!ready || !viewer.world.getItemCount()) return;
    const b = viewer.world.getItemAt(0).getBounds();
    if (whole) { viewer.viewport.fitBounds(b, immediate); return; }
    const aspect = $('viewer').clientWidth / Math.max(1, $('viewer').clientHeight);
    const home = cfg.home || {};
    const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
    const width = Math.min(b.width * clamp(Number(home.width) || .62,.1,1), b.height * aspect * .85);
    const height = width / aspect;
    const cx = clamp(b.x + b.width * (Number(home.x) || .53), b.x + width/2, b.x + b.width - width/2);
    const cy = clamp(b.y + b.height * (Number(home.y) || .49), b.y + height/2, b.y + b.height - height/2);
    viewer.viewport.fitBounds(new OpenSeadragon.Rect(cx-width/2,cy-height/2,width,height),immediate);
  }
  async function start() {
    const base = new URL(cfg.tileBaseUrl, location.href);
    if (!['https:','http:'].includes(base.protocol) || !base.pathname.endsWith('/')) throw Error('Adresse CDN invalide.');
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(),20000);
    try {
      const response = await fetch(new URL('map.json',base), {signal:abort.signal,credentials:'omit',cache:'no-cache'});
      if (!response.ok) throw Error('Métadonnées indisponibles : HTTP '+response.status);
      metadata = validate(await response.json());
    } finally { clearTimeout(timeout); }
    $('source-credits').textContent = [...new Set(metadata.credits)].join('\n');
    viewer = OpenSeadragon({
      id:'viewer',drawer:'canvas',showNavigationControl:false,showNavigator:false,
      showSequenceControl:false,animationTime:matchMedia('(prefers-reduced-motion: reduce)').matches?0:.45,
      blendTime:.12,imageLoaderLimit:6,maxImageCacheCount:180,maxZoomPixelRatio:2,
      minZoomImageRatio:.65,visibilityRatio:.7,constrainDuringPan:true,zoomPerScroll:1.15,
      crossOriginPolicy:'Anonymous',ajaxWithCredentials:false,loadTilesWithAjax:false,
      gestureSettingsMouse:{clickToZoom:false,dblClickToZoom:true,scrollToZoom:true},
      gestureSettingsTouch:{pinchToZoom:true,flickEnabled:true},
      timeout:20000,tileRetryMax:2,tileRetryDelay:1500
    });
    viewer.addHandler('open',() => { ready=true;frame(true); });
    viewer.addHandler('tile-loaded',() => { clearTimeout(waiting);$('status').hidden=true;$('error').hidden=true; });
    viewer.addHandler('open-failed',e => fail(e.message));
    viewer.addHandler('tile-load-failed',e => fail(e.message || 'Une image ne peut pas être chargée.'));
    viewer.addHandler('resize',() => { if(automaticFrame) frame(true); });
    ['canvas-drag','canvas-scroll','canvas-pinch','canvas-double-click'].forEach(name => viewer.addHandler(name,() => {automaticFrame=false;}));
    viewer.open({Image:{xmlns:'http://schemas.microsoft.com/deepzoom/2008',
      Url:new URL(metadata.tilePath,base).href,Format:metadata.format,Overlap:metadata.overlap,
      TileSize:metadata.tileSize,Size:{Width:metadata.width,Height:metadata.height}}});
    waiting=setTimeout(() => fail('Le chargement des images prend trop longtemps.'),30000);
  }
  const closeCredits=() => { $('credits').hidden=true;$('credits-toggle').setAttribute('aria-expanded','false'); };
  $('credits-toggle').onclick=() => { const open=$('credits').hidden;$('credits').hidden=!open;$('credits-toggle').setAttribute('aria-expanded',String(open)); };
  $('credits-close').onclick=() => {closeCredits();$('credits-toggle').focus();};
  $('retry').onclick=() => location.reload();
  document.addEventListener('keydown',async e => {
    if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
    if(e.key==='Escape') closeCredits();
    if(!ready) return;
    if(e.key==='0'||e.key==='Home'){e.preventDefault();automaticFrame=true;frame(false,e.key==='Home');}
    if(['+','=','-'].includes(e.key)){e.preventDefault();automaticFrame=false;viewer.viewport.zoomBy(e.key==='-'?1/1.5:1.5);viewer.viewport.applyConstraints();}
    if(e.key.toLowerCase()==='f'){
      e.preventDefault();
      try { if(document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { /* La carte remplit déjà la fenêtre. */ }
    }
  });
  start().catch(fail);
})();
