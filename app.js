/* Shared renderer for independent HTML pages. No fetch, build step, tracking or external libraries. */
(() => {
  'use strict';
  const data = window.PORTFOLIO_DATA;
  const app = document.getElementById('app');
  if (!data || !Array.isArray(data.projects)) {
    app.innerHTML = '<main class="load-error"><h1>設定ファイルを読み込めませんでした</h1><p>ZIPをすべて展開し、content.js と app.js を移動せずに開いてください。</p></main>';
    return;
  }
  const site = data.site || {};
  const preview = Boolean(window.PORTFOLIO_PREVIEW);
  const root = document.body.dataset.root || '';
  const knownPages = new Set(['slime','failure','collectiall','marble','slime-run','funnel','space','td2','hop-step','spider']);
  const list = x => Array.isArray(x) ? x : [];
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const projects = data.projects.filter(p => p && p.visible !== false && /^[A-Za-z0-9_-]+$/.test(p.id || ''));
  const byId = id => projects.find(p => p.id === id);
  const category = p => ({solo:'個人制作',team:'チーム制作'}[p.category] || '制作作品');
  const arrow = '<span class="arrow" aria-hidden="true">→</span>';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (q, scope = document) => scope.querySelector(q);
  let route, currentGallery = [], galleryIndex = 0, zoomIndex = 0, zoomFocus = null, pdfBlob = '';
  let lastHash = location.hash;
  const previewScroll = new Map();

  function safeUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    const raw = value.trim();
    if (raw.startsWith('//') || raw.includes('\\') || /[\u0000-\u001f\u007f]/.test(raw)) return '';
    try {
      const u = new URL(raw, 'https://portfolio.invalid/site/');
      return ['http:','https:'].includes(u.protocol) && !u.username && !u.password ? raw : '';
    } catch { return ''; }
  }
  function siteUrl(value) {
    const valid = safeUrl(value);
    if (!valid) return '';
    return /^(?:https?:|\/|#)/i.test(valid) ? valid : root + valid;
  }
  function imageUrl(src) {
    const value = (window.PORTFOLIO_ASSETS || {})[src] || src;
    if (typeof value === 'string' && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
    return siteUrl(value);
  }
  function image(src, alt, eager = false) {
    const url = imageUrl(src);
    return url ? `<img src="${esc(url)}" alt="${esc(alt)}" decoding="async" ${eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'}>` : `<div class="blank-image">${esc(alt || '作品画像')}</div>`;
  }
  function href(view, id = '', section = '') {
    if (preview) return '#/' + view + (id ? '/' + encodeURIComponent(id) : '') + (section ? '?section=' + encodeURIComponent(section) : '');
    let path = ({home:'index.html',works:'works.html',downloads:'downloads.html',profile:'profile.html',resources:'resources.html'})[view];
    if (view === 'project') path = knownPages.has(id) ? 'projects/' + id + '.html' : 'project.html?id=' + encodeURIComponent(id);
    return root + (path || 'index.html') + (section ? '#' + encodeURIComponent(section) : '');
  }
  const toProject = (p, section = '') => href('project',p.id,section);
  function sectionHref(id) { return preview ? href(route.view,route.id,id) : '#' + id; }
  function externalLink(raw, label, cls = 'button', download = false) {
    const u = siteUrl(raw);
    if (!u || u.startsWith('#')) return '';
    let dl = '';
    try { if (download && (new URL(u,location.href).origin === location.origin)) dl = ' download'; } catch { /* normal link */ }
    const pdf = preview && typeof raw === 'string' && /^documents\/portfolio\.pdf(?:#.*)?$/.test(raw) && window.PORTFOLIO_ASSETS?.['documents/portfolio.pdf'];
    return `<a class="${esc(cls)}" href="${esc(u)}" target="_blank" rel="noopener noreferrer"${dl}${pdf ? ` data-preview-pdf="${esc(raw)}"${download ? ' data-save-pdf="true"' : ''}` : ''}>${esc(label)} <span class="arrow" aria-hidden="true">${download ? '↓' : '↗'}</span></a>`;
  }
  function parseVideo(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    let raw = value.trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return {type:'youtube',id:raw,url:'https://www.youtube.com/watch?v='+raw};
    if (/^(?:www\.)?(youtube\.com|youtu\.be)\//i.test(raw)) raw = 'https://'+raw;
    if (!safeUrl(raw)) return null;
    try {
      const u = new URL(raw,'https://portfolio.invalid/site/');
      let id='';
      if (['youtu.be','www.youtu.be'].includes(u.hostname)) id=u.pathname.split('/')[1] || '';
      else if (['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(u.hostname)) {
        id=u.searchParams.get('v') || '';
        const path=u.pathname.split('/').filter(Boolean);
        if (!id && ['embed','shorts','live'].includes(path[0])) id=path[1] || '';
      }
      if (/^[A-Za-z0-9_-]{11}$/.test(id)) return {type:'youtube',id,url:'https://www.youtube.com/watch?v='+id};
      if (/\.(mp4|webm|ogv)$/i.test(u.pathname)) return {type:'file',url:raw};
    } catch { /* unknown provider or invalid URL stays hidden */ }
    return null;
  }
  function getDownload(p) {
    const url = safeUrl(p?.downloadUrl);
    return p && p.showDownload !== false && url && !url.startsWith('#') ? {url,mode:p.downloadMode === 'file' ? 'file' : 'page'} : null;
  }
  function downloadButton(p, cls = 'button primary') {
    const d=getDownload(p);
    return d ? externalLink(d.url,d.mode === 'file' ? 'ゲームをダウンロード' : '配布ページを開く',cls,d.mode === 'file') : '';
  }
  function state(p) { return getDownload(p) ? '<span class="state-label ready">配布リンクあり</span>' : '<span class="state-label">配布準備中</span>'; }
  function role(p, compact = false) {
    const value = compact ? p.roleSummary || p.role : p.role;
    return value === '全部' ? '全般（個人制作）' : value || '';
  }
  function roleTags(p) { return role(p).split(/[・、\n]/).map(x=>x.trim()).filter(Boolean).map(x=>`<span class="role-tag">${esc(x)}</span>`).join(''); }
  function pdfUrl(p) {
    const base = safeUrl(site.documentUrl);
    const page = Number(p?.pdfPage);
    return base && Number.isInteger(page) && page > 0 ? base.split('#')[0] + '#page=' + page : '';
  }
  function nav(active, cls = 'nav') {
    return `<nav class="${cls}" ${cls==='mobile-nav' ? 'id="mobile-nav" hidden' : ''} aria-label="${cls==='mobile-nav' ? 'モバイルメニュー' : 'メインメニュー'}">${[['works','制作作品'],['downloads','ダウンロード'],['profile','プロフィール'],['resources','作品資料']].map(([v,t])=>`<a href="${href(v)}"${active===v ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>`;
  }
  function header(active) {
    return `${preview ? '<div class="preview-note">確認用HTML ／ 公開用ZIPでは、各作品が独立したページになっています。</div>' : ''}<a class="skip" href="${sectionHref('main')}">本文へスキップ</a><header class="site-header"><div class="wrap header-inner"><a class="brand" href="${href('home')}" aria-label="トップへ"><span class="brand-mark" aria-hidden="true">&lt;/&gt;</span><span><strong>${esc(site.name || '作品紹介')}</strong><small>${esc(site.role || 'ゲームプログラマー志望')}</small></span></a>${nav(active)}<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="メニューを開く"><span>メニュー</span><span class="menu-lines" aria-hidden="true"><i></i><i></i></span></button></div>${nav(active,'mobile-nav')}</header>`;
  }
  function footer() {
    return `<footer class="site-footer"><div class="wrap"><div class="footer-top"><a href="${href('home')}" class="footer-brand">${esc(site.name || '作品紹介')}</a><nav class="footer-links" aria-label="フッターメニュー"><a href="${href('works')}">制作作品</a><a href="${href('downloads')}">ダウンロード</a><a href="${href('profile')}">プロフィール</a><a href="${href('resources')}">作品資料</a></nav></div><div class="footer-bottom"><p>掲載しているゲーム画面・素材の権利は、それぞれの権利者に帰属します。</p><span>GAME DEVELOPMENT / PORTFOLIO</span></div></div></footer>`;
  }
  function breadcrumbs(label, project = false) {
    return `<nav class="breadcrumbs" aria-label="現在位置"><a href="${href('home')}">トップ</a><i aria-hidden="true">/</i>${project ? `<a href="${href('works')}">制作作品</a><i aria-hidden="true">/</i>` : ''}<b aria-current="page">${esc(label)}</b></nav>`;
  }
  function pageTop(title, lead = '') {
    return `<div class="wrap page-top">${breadcrumbs(title)}<h1 class="page-heading">${esc(title)}</h1>${lead ? `<p class="page-lead">${esc(lead)}</p>` : ''}</div>`;
  }
  function featured(p, i) {
    return `<article class="feature"><a class="feature-media" href="${toProject(p)}" aria-label="${esc(p.title)}の作品詳細を見る">${image(p.cover,p.title+'のゲーム画面',i===0)}<span class="image-arrow" aria-hidden="true">→</span></a><div class="feature-copy"><div class="feature-meta"><span class="kind">${category(p)}</span><span>${[p.team,p.period].filter(Boolean).map(esc).join(' / ')}</span></div><h3><a href="${toProject(p)}">${esc(p.title)}</a></h3><p class="feature-summary">${esc(p.tagline || p.summary)}</p>${p.role ? `<div class="feature-role"><span class="role-label">担当箇所</span><div class="stack">${roleTags(p)}</div></div>` : ''}${p.genre || p.engine ? `<div class="stack tags">${[p.genre,p.engine].filter(Boolean).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}<div class="feature-foot"><a class="button primary" href="${toProject(p)}">作品詳細を見る ${arrow}</a>${parseVideo(p.videoUrl) ? `<a class="text-link" href="${toProject(p,'video')}">動画</a>` : ''}${getDownload(p) ? `<a class="text-link" href="${toProject(p,'download')}">ダウンロード ↓</a>` : ''}</div></div></article>`;
  }
  function card(p) {
    return `<article class="project-card" data-project-id="${esc(p.id)}"><a class="card-image" href="${toProject(p)}" aria-label="${esc(p.title)}の作品詳細を見る">${image(p.cover,p.title+'のゲーム画面')}<span class="image-arrow" aria-hidden="true">→</span></a><div class="card-content"><div class="card-kicker"><span class="kind">${category(p)}</span><span>${esc(p.period)}</span></div><h3><a href="${toProject(p)}">${esc(p.title)}</a></h3><p class="card-summary">${esc(p.tagline || p.summary)}</p>${p.role ? `<p class="card-role"><b>担当</b><span>${esc(role(p,true))}</span></p>` : ''}<a class="card-more" href="${toProject(p)}" aria-label="${esc(p.title)}の作品詳細を見る">作品詳細を見る ${arrow}</a></div></article>`;
  }
  function renderHome() {
    const picks=[...new Set(list(site.spotlightProjects))].map(byId).filter(Boolean).slice(0,2);
    const others=projects.filter(p=>!picks.includes(p) && p.showcase!==false);
    return `<main class="wrap fade-in" id="main" tabindex="-1"><section class="home-intro" aria-labelledby="home-title"><div><p class="eyebrow">GAME PROGRAMMER</p><h1 id="home-title">${list(site.heroLines).map(esc).join('<br>') || '制作作品'}</h1><p class="lead preline">${esc(site.intro)}</p></div><div class="intro-aside"><p class="label">使用言語・制作環境</p><div class="stack">${list(site.coreSkills).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><a class="text-link" href="${href('profile')}">プロフィール ${arrow}</a></div></section>${picks.length ? `<section aria-labelledby="featured-title" id="featured"><div class="section-head"><h2 class="section-label" id="featured-title">代表作品</h2><p>作品概要と担当箇所</p></div><div class="featured-list">${picks.map(featured).join('')}</div></section>` : ''}<section class="other-section" aria-labelledby="other-title"><div class="section-head"><h2 id="other-title">${picks.length ? 'その他の制作作品' : '制作作品'}</h2><a class="text-link" href="${href('works')}">すべての作品（${projects.length}） ${arrow}</a></div><div class="project-grid home-project-grid">${others.map(card).join('') || '<p class="muted">作品一覧から、掲載中の作品をご覧いただけます。</p>'}</div></section><div class="home-bottom"><p>動画・配布情報は、各作品の詳細ページに掲載しています。</p><div class="actions"><a class="text-link" href="${href('downloads')}">ダウンロード一覧 ${arrow}</a><a class="text-link" href="${href('resources')}">作品資料 ${arrow}</a></div></div></main>`;
  }
  function renderWorks() {
    return `<main id="main" class="fade-in" tabindex="-1">${pageTop('制作作品','個人制作・チーム制作のゲームをまとめています。作品を選ぶと、概要と担当箇所を確認できます。')}<section class="wrap catalog" aria-label="作品一覧"><div class="catalog-toolbar"><div class="filters" role="group" aria-label="制作形態で絞り込み">${[['all','すべて'],['solo','個人制作'],['team','チーム制作']].map(([v,t])=>`<button class="filter" type="button" data-filter="${v}" aria-pressed="${v==='all'}">${t}</button>`).join('')}</div><div class="catalog-controls"><label class="search-box"><span aria-hidden="true">⌕</span><input type="search" id="work-search" aria-label="作品名・担当箇所で検索" placeholder="作品名・担当箇所で検索"></label><p id="result-count" class="result-count" role="status">${projects.length}作品</p></div></div><div class="project-grid" id="catalog-grid">${projects.map(card).join('')}</div></section></main>`;
  }
  function gallery(p) {
    const shots=list(p.gallery).filter(g=>g && imageUrl(g.src));
    return shots.length ? shots : imageUrl(p.cover) ? [{src:p.cover,caption:p.title+'のゲーム画面'}] : [];
  }
  function galleryHTML(p) {
    const shots=gallery(p);
    if (!shots.length) return '';
    const g=shots[0];
    return `<section class="project-gallery" id="screenshots" aria-label="スクリーンショット"><div class="gallery-main"><button class="gallery-photo" id="gallery-photo" type="button" data-zoom="0" aria-label="作品画像を拡大する">${image(g.src,g.caption,true)}<span class="zoom-label">画像を拡大 ↗</span></button><div class="gallery-caption"><span id="gallery-caption">${esc(g.caption)}</span><span id="gallery-number">01 / ${String(shots.length).padStart(2,'0')}</span></div></div>${shots.length>1 ? `<div class="gallery-thumbs" role="group" aria-label="作品画像を選ぶ">${shots.map((g,i)=>`<button class="gallery-thumb" type="button" data-gallery="${i}" aria-label="${esc(g.caption)}を表示" aria-pressed="${i===0}">${image(g.src,g.caption)}</button>`).join('')}</div>` : ''}</section>`;
  }
  function downloadSpecs(p) {
    const entries=[['対応環境',p.downloadPlatform],['バージョン',p.downloadVersion],['容量',p.downloadSize],['更新日',p.downloadUpdated]].filter(([,v])=>typeof v==='string'&&v.trim());
    return entries.length ? `<dl class="download-specs">${entries.map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : '';
  }
  function downloadPanel(p) {
    if (p.showDownload===false) return '';
    const d=getDownload(p);
    return `<section class="download-panel" id="download" aria-labelledby="download-title"><div class="download-header"><h2 id="download-title">ゲームのダウンロード</h2>${state(p)}</div><p>${d ? '対応環境と起動方法をご確認のうえ、配布先からダウンロードしてください。' : '現在、ゲーム本体の配布リンクは掲載していません。'}</p>${downloadSpecs(p)}${d ? `<div class="actions">${downloadButton(p)}</div>` : ''}${p.controls ? `<div class="download-note"><h3>操作方法</h3><p>${esc(p.controls)}</p></div>` : ''}${p.downloadNotes ? `<div class="download-note"><h3>起動方法・注意事項</h3><p>${esc(p.downloadNotes)}</p></div>` : ''}</section>`;
  }
  function movieHTML(p) {
    const v=parseVideo(p.videoUrl);
    if (!v) return '';
    return `<section class="detail-section" id="video" aria-labelledby="video-title"><h2 id="video-title">プレイ動画</h2><div class="movie-stage" id="movie-stage">${image(p.cover,p.title+'のゲーム画面')}<div class="movie-shade"><button class="play-button" type="button" data-play="${esc(p.id)}" aria-label="${esc(p.title)}のプレイ動画を再生">▶</button><small>${v.type==='youtube' ? '再生時にYouTubeのプレーヤーを読み込みます。' : 'プレイ動画を再生'}</small></div></div><div class="movie-external"><p>再生できない場合は、動画リンクからご覧ください。</p>${externalLink(v.url,v.type==='youtube' ? 'YouTubeで見る' : '動画ファイルを開く','text-link')}</div></section>`;
  }
  function projectResources(p) {
    const pdf=pdfUrl(p);
    const links=[externalLink(p.documentUrl,'作品の関連資料','button ghost'),externalLink(p.sourceUrl,'ソースコード','button ghost'),externalLink(pdf,`ポートフォリオPDF（${p.pdfPage}ページ）`,'button ghost')].filter(Boolean);
    return links.length ? `<section class="detail-section project-resources" id="documents"><h2>作品資料</h2><div class="actions">${links.join('')}</div></section>` : '';
  }
  function renderProject(p) {
    const shots=gallery(p), records=list(p.recordImages).filter(g=>g&&imageUrl(g.src));
    currentGallery=[...shots,...records];galleryIndex=0;
    const v=parseVideo(p.videoUrl), pdf=pdfUrl(p);
    const info=[['ジャンル',p.genre],['開発環境',p.engine],['開発期間',p.period],['開発人数',p.team]].filter(([,v])=>v);
    const note=p.learning || list(p.highlights).length;
    const resourceHTML=projectResources(p);
    const toc=[['screenshots','スクリーンショット'],['overview','ゲーム概要'],...(note ? [['learning','取り組みと学び']] : []),...(v ? [['video','プレイ動画']] : []),...(p.showDownload!==false ? [['download','ゲームのダウンロード']] : []),...(resourceHTML ? [['documents','作品資料']] : [])];
    const next=projects[(projects.indexOf(p)+1)%projects.length];
    return `<main id="main" class="fade-in" tabindex="-1"><div class="wrap page-top project-top">${breadcrumbs(p.title,true)}<div class="project-title-row"><div><span class="kind">${category(p)}</span><h1>${esc(p.title)}</h1><p class="sub-meta">${[p.genre,p.engine].filter(Boolean).map(esc).join(' / ')}</p></div><div class="actions">${v ? `<a href="${sectionHref('video')}" class="button primary">動画を見る <span aria-hidden="true">▷</span></a>` : ''}${getDownload(p) ? `<a class="button ghost" href="${sectionHref('download')}">ダウンロード ↓</a>` : ''}</div></div></div><div class="wrap project-layout"><div class="project-body">${galleryHTML(p)}<section class="detail-section" id="overview"><h2>ゲーム概要</h2><p>${esc(p.summary)}</p></section>${note ? `<section class="detail-section" id="learning"><h2>取り組みと学び</h2>${p.learning ? `<p>${esc(p.learning)}</p>` : ''}${list(p.highlights).length ? `<ul>${p.highlights.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>` : ''}${records.length ? `<div class="record-grid">${records.map((g,i)=>`<figure class="record-shot"><button type="button" data-zoom="${shots.length+i}" aria-label="${esc(g.caption)}を拡大する">${image(g.src,g.caption)}</button><figcaption>${esc(g.caption)}</figcaption></figure>`).join('')}</div>` : ''}</section>` : ''}${movieHTML(p)}${downloadPanel(p)}${resourceHTML}</div><aside class="project-sidebar" aria-label="制作情報"><div class="side-info"><h2>担当箇所</h2><div class="stack">${roleTags(p) || '<span class="muted small">記載なし</span>'}</div><dl class="meta-list">${info.map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div><nav class="toc" aria-label="このページの内容"><p>このページの内容</p>${toc.map(([i,t])=>`<a href="${sectionHref(i)}">${t}</a>`).join('')}</nav><div class="sidebar-links"><a href="${href('works')}" class="text-link">← 制作作品一覧に戻る</a></div></aside></div><div class="wrap project-bottom-nav"><a class="text-link" href="${href('works')}">← 制作作品一覧に戻る</a>${next && next!==p ? `<a class="next-project" href="${toProject(next)}"><span>次の作品</span>${esc(next.title)} →</a>` : ''}</div></main>`;
  }
  function renderDownloads() {
    const ps=projects.filter(p=>p.showDownload!==false), ready=ps.filter(getDownload).length;
    return `<main id="main" class="fade-in" tabindex="-1">${pageTop('ゲームのダウンロード','各作品の配布状況と、対応環境・起動方法を確認できます。')}<section class="wrap download-list-page" aria-label="ゲームの配布一覧"><div class="download-list-summary"><p>${ready ? '起動方法と注意事項は、各作品の詳細ページをご覧ください。' : '現在、ゲーム本体の配布リンクは準備中です。作品紹介は引き続きご覧いただけます。'}</p><strong>配布リンク：${ready}作品</strong></div>${ps.map(p=>`<article class="download-row"><a class="download-row-cover" href="${toProject(p)}" aria-label="${esc(p.title)}の作品詳細を見る">${image(p.cover,p.title+'のゲーム画面')}</a><div><span class="kind">${category(p)}</span><h2><a href="${toProject(p)}">${esc(p.title)}</a></h2><p class="download-row-info">${[p.downloadPlatform,p.downloadVersion ? 'Version '+p.downloadVersion : '',p.downloadSize].filter(Boolean).map(esc).join(' / ') || esc(p.genre || p.engine || '')}</p></div><div class="download-row-action">${getDownload(p) ? downloadButton(p,'button primary sm') : state(p)}<a class="text-link" href="${toProject(p,'download')}">作品詳細を見る ${arrow}</a></div></article>`).join('') || '<p class="empty-note">現在、ダウンロード情報を掲載している作品はありません。</p>'}</section></main>`;
  }
  function renderProfile() {
    const allSkills=list(site.skills), langs=allSkills.filter(x=>['C++','C#'].includes(x)), graphics=allSkills.filter(x=>x==='DirectX 12'), tools=allSkills.filter(x=>!langs.includes(x)&&!graphics.includes(x));
    const email=typeof site.email==='string' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(site.email) ? site.email : '';
    return `<main id="main" class="fade-in" tabindex="-1">${pageTop('プロフィール')}<div class="wrap profile-layout"><div><section class="profile-block">${site.name ? `<h2 class="profile-name">${esc(site.name)}</h2>` : ''}<p class="profile-role">${esc(site.role || 'ゲームプログラマー志望')}</p>${site.school ? `<p class="profile-school preline">${esc(site.school)}</p>` : ''}<h2>制作で意識していること</h2><p class="profile-text preline">${esc(site.about)}</p></section><section class="profile-block"><h2>使用言語・制作環境</h2>${[['言語',langs],['グラフィックス',graphics],['ツール',tools]].filter(([,v])=>v.length).map(([t,ss])=>`<div class="skill-category"><h3>${t}</h3><div class="stack">${ss.map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div></div>`).join('')}</section>${safeUrl(site.github)||email ? `<section class="profile-block"><h2>連絡先・リンク</h2><div class="actions">${externalLink(site.github,'GitHub','button ghost')}${email ? `<a class="text-link" href="mailto:${esc(email)}">${esc(email)} ↗</a>` : ''}</div></section>` : ''}</div><aside class="profile-aside"><h2>制作作品と担当箇所</h2><p>ゲームの内容と、各作品で取り組んだ実装を作品別のページに掲載しています。</p><div class="actions"><a class="button primary" href="${href('works')}">制作作品を見る ${arrow}</a><a class="text-link" href="${href('resources')}">作品資料を見る ${arrow}</a></div></aside></div></main>`;
  }
  function renderResources() {
    const hasPDF=Boolean(safeUrl(site.documentUrl));
    const specific=projects.filter(p=>safeUrl(p.documentUrl)||safeUrl(p.sourceUrl));
    return `<main id="main" class="fade-in" tabindex="-1">${pageTop('作品資料','制作作品と担当箇所をまとめた資料、公開しているソースコードへのリンクです。')}<div class="wrap document-section">${hasPDF ? `<article class="document-card"><div class="document-art">${image('assets/portfolio-cover.webp','ポートフォリオPDFの表紙')}</div><div><span class="eyebrow">PORTFOLIO / PDF</span><h2>ポートフォリオ</h2><p>自己紹介、個人制作作品、チーム制作作品をまとめた資料です。</p><p>Webサイトとは別に、PDF形式で閲覧・保存できます。</p><div class="actions">${externalLink(site.documentUrl,'PDFを開く','button primary')}${externalLink(site.documentUrl,'PDFを保存','button ghost',true)}</div></div></article>` : '<p class="empty-note">現在、ポートフォリオ資料のリンクは掲載していません。</p>'}${specific.length ? `<section class="resource-group"><h2>作品ごとの関連資料</h2>${specific.map(p=>`<article class="resource-row"><div><h3>${esc(p.title)}</h3><p>${esc(role(p,true))}</p></div><div class="actions">${externalLink(p.documentUrl,'資料','button ghost sm')}${externalLink(p.sourceUrl,'コード','button ghost sm')}</div></article>`).join('')}</section>` : ''}${safeUrl(site.github) ? `<section class="resource-group"><h2>公開リンク</h2><div class="resource-row"><div><h3>GitHub</h3><p>公開しているリポジトリ</p></div>${externalLink(site.github,'GitHubを開く','button ghost')}</div></section>` : ''}</div></main>`;
  }
  function renderNotFound() { return `<main id="main" class="wrap page-top" tabindex="-1">${breadcrumbs('作品が見つかりません')}<h1>作品が見つかりません</h1><p class="page-lead">指定した作品は現在掲載されていません。制作作品一覧からご確認ください。</p><p style="margin:30px 0 70px"><a class="button primary" href="${href('works')}">制作作品一覧 ${arrow}</a></p></main>`; }
  function lightboxHTML() { return '<dialog class="lightbox" id="lightbox" aria-labelledby="lightbox-caption"><div class="lightbox-toolbar"><span id="lightbox-count" class="eyebrow"></span><button type="button" class="close-button" data-close-zoom aria-label="拡大画像を閉じる">閉じる ×</button></div><div id="lightbox-image" class="lightbox-image"></div><div class="lightbox-bottom"><button class="icon-button" type="button" data-zoom-prev aria-label="前の画像">←</button><p id="lightbox-caption"></p><button class="icon-button" type="button" data-zoom-next aria-label="次の画像">→</button></div></dialog>'; }
  function getRoute() {
    if (preview) {
      const hash=location.hash.replace(/^#\//,'').split('?');
      const parts=hash[0].split('/');
      const view=['home','works','project','downloads','profile','resources'].includes(parts[0]) ? parts[0] : 'home';
      return {view,id:parts[1]||'',section:new URLSearchParams(hash[1]||'').get('section')||''};
    }
    return {view:document.body.dataset.page || 'home',id:document.body.dataset.project || new URLSearchParams(location.search).get('id') || '',section:location.hash.slice(1)};
  }
  function render() {
    route=getRoute();
    let view=route.view, content='', title='';currentGallery=[];
    if (view==='home') {content=renderHome();title=site.title || '制作作品';}
    else if (view==='works') {content=renderWorks();title='制作作品一覧';}
    else if (view==='downloads') {content=renderDownloads();title='ゲームのダウンロード';}
    else if (view==='profile') {content=renderProfile();title='プロフィール';}
    else if (view==='resources') {content=renderResources();title='作品資料';}
    else if (view==='project' && byId(route.id)) {content=renderProject(byId(route.id));title=byId(route.id).title;}
    else {content=renderNotFound();title='作品が見つかりません';}
    document.title=view==='home' ? title : title+' | '+(site.name || '作品紹介');
    const desc=$('meta[name="description"]');if(desc)desc.content=view==='project' ? byId(route.id)?.summary || '' : site.description || '';
    app.innerHTML=header(['home','project'].includes(view)?'works':view)+content+footer()+lightboxHTML();
    const box=$('#lightbox');
    box.addEventListener('cancel',e=>{e.preventDefault();closeZoom();});
    box.addEventListener('click',e=>{if(e.target!==box)return;const r=box.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeZoom();});
    if(view==='works')$('#work-search').addEventListener('input',filterWorks);
  }
  function filterWorks() {
    const kind=$('.filter[aria-pressed="true"]')?.dataset.filter || 'all';
    const needle=($('#work-search')?.value||'').trim().toLocaleLowerCase();
    const ps=projects.filter(p=>(kind==='all'||p.category===kind) && [p.title,p.role,p.roleSummary,p.summary,p.engine,...list(p.tags)].join(' ').toLocaleLowerCase().includes(needle));
    $('#catalog-grid').innerHTML=ps.map(card).join('') || '<p class="catalog-empty">条件に一致する作品はありません。</p>';
    $('#result-count').textContent=ps.length+'作品';
  }
  function selectGallery(i) {
    const p=byId(route.id), shots=p ? gallery(p) : [];
    if(!Number.isInteger(i)||!shots[i])return;
    galleryIndex=i;
    const g=shots[i],photo=$('#gallery-photo');
    photo.innerHTML=image(g.src,g.caption,true)+'<span class="zoom-label">画像を拡大 ↗</span>';photo.dataset.zoom=String(i);
    $('#gallery-caption').textContent=g.caption || '';
    $('#gallery-number').textContent=String(i+1).padStart(2,'0')+' / '+String(shots.length).padStart(2,'0');
    document.querySelectorAll('[data-gallery]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.gallery)===i)));
  }
  function updateZoom(i) {
    if(!currentGallery.length)return;
    zoomIndex=(i+currentGallery.length)%currentGallery.length;
    const g=currentGallery[zoomIndex];
    $('#lightbox-image').innerHTML=image(g.src,g.caption,true);
    $('#lightbox-caption').textContent=g.caption || '';
    $('#lightbox-count').textContent=(zoomIndex+1)+' / '+currentGallery.length;
    $('[data-zoom-prev]').disabled=$('[data-zoom-next]').disabled=currentGallery.length<2;
  }
  function openZoom(i) {
    if(!currentGallery[i])return;
    const box=$('#lightbox');zoomFocus=document.activeElement;updateZoom(i);box.showModal();$('[data-close-zoom]').focus({preventScroll:true});
  }
  function closeZoom() {
    const box=$('#lightbox');if(!box?.open)return;box.close();$('#lightbox-image').replaceChildren();if(zoomFocus?.isConnected)zoomFocus.focus({preventScroll:true});
  }
  function menu(open) {const b=$('.menu-toggle');if(!b)return;b.setAttribute('aria-expanded',String(open));b.setAttribute('aria-label',open?'メニューを閉じる':'メニューを開く');$('#mobile-nav').hidden=!open;}
  function playVideo(p) {
    const video=parseVideo(p?.videoUrl),stage=$('#movie-stage');if(!video||!stage)return;
    if(video.type==='youtube' && location.protocol==='file:') {
      window.open(video.url,'_blank','noopener,noreferrer');const note=$('small',stage);if(note)note.textContent='ローカルではYouTubeで開きます。公開後はページ内で再生できます。';return;
    }
    stage.replaceChildren();
    if(video.type==='youtube') {
      const f=document.createElement('iframe');f.title=p.title+' プレイ動画';f.src='https://www.youtube-nocookie.com/embed/'+video.id+'?autoplay=1&rel=0&playsinline=1';f.allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share';f.allowFullscreen=true;f.referrerPolicy='strict-origin-when-cross-origin';stage.append(f);f.focus();
    } else {
      const v=document.createElement('video');v.controls=true;v.playsInline=true;v.preload='metadata';v.src=siteUrl(video.url);v.poster=imageUrl(p.cover);v.setAttribute('aria-label',p.title+' プレイ動画');
      v.addEventListener('error',()=>{stage.innerHTML='<div class="movie-shade"><p>動画を読み込めませんでした。</p>'+externalLink(video.url,'動画ファイルを開く','button ghost')+'</div>';},{once:true});
      stage.append(v);v.play().catch(()=>{});
    }
  }
  function openPreviewPdf(a) {
    const raw=window.PORTFOLIO_ASSETS?.['documents/portfolio.pdf'];if(!raw)return;
    if(!pdfBlob){const bytes=Uint8Array.from(atob(raw.split(',')[1]),c=>c.charCodeAt(0));pdfBlob=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));}
    if(a.dataset.savePdf){const link=document.createElement('a');link.href=pdfBlob;link.download='portfolio.pdf';document.body.append(link);link.click();link.remove();}
    else window.open(pdfBlob+(a.dataset.previewPdf.includes('#')?'#'+a.dataset.previewPdf.split('#')[1]:''),'_blank','noopener');
  }
  document.addEventListener('click',e=>{
    if(!(e.target instanceof Element))return;
    const menuButton=e.target.closest('.menu-toggle');if(menuButton){menu(menuButton.getAttribute('aria-expanded')!=='true');return;}
    if(e.target.closest('#mobile-nav a'))menu(false);
    const f=e.target.closest('[data-filter]');if(f){document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===f)));filterWorks();return;}
    const g=e.target.closest('[data-gallery]');if(g){selectGallery(Number(g.dataset.gallery));return;}
    const z=e.target.closest('[data-zoom]');if(z){openZoom(Number(z.dataset.zoom));return;}
    if(e.target.closest('[data-close-zoom]')){closeZoom();return;}
    if(e.target.closest('[data-zoom-prev]')){updateZoom(zoomIndex-1);return;}
    if(e.target.closest('[data-zoom-next]')){updateZoom(zoomIndex+1);return;}
    const play=e.target.closest('[data-play]');if(play){playVideo(byId(play.dataset.play));return;}
    const pdf=e.target.closest('[data-preview-pdf]');if(pdf){e.preventDefault();openPreviewPdf(pdf);return;}
    const a=e.target.closest('a[href]');
    if(preview && a?.getAttribute('href')?.startsWith('#/') && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button===0){previewScroll.set(lastHash,window.scrollY);if(a.getAttribute('href')===location.hash && !route.section)window.scrollTo({top:0,behavior:reduced.matches?'auto':'smooth'});}
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){menu(false);return;}
    if($('#lightbox')?.open && ['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();updateZoom(zoomIndex+(e.key==='ArrowLeft'?-1:1));}
  });
  document.addEventListener('error',e=>{
    if(!(e.target instanceof HTMLImageElement))return;
    const fallback=document.createElement('div');fallback.className='blank-image';fallback.textContent='画像を読み込めませんでした';e.target.replaceWith(fallback);
  },true);
  window.addEventListener('resize',()=>{if(innerWidth>700)menu(false);});
  function scrollToSection() {if(!route.section)return false;const target=document.getElementById(route.section);if(target){target.scrollIntoView({block:'start',behavior:'auto'});if(route.section==='main')target.focus({preventScroll:true});return true;}return false;}
  window.addEventListener('hashchange',()=>{
    if(!preview)return;
    // Changing preview sections doesn't recreate the media player or image gallery.
    const next=getRoute();
    if(next.view===route.view&&next.id===route.id){route=next;if(!scrollToSection())window.scrollTo(0,previewScroll.get(location.hash)||0);lastHash=location.hash;return;}
    render();if(!scrollToSection())window.scrollTo(0,previewScroll.get(location.hash)||0);$('#main')?.focus({preventScroll:true});lastHash=location.hash;
  });
  if(!preview && (document.body.dataset.page||'home')==='home') {
    const old=location.hash;
    const match=/^#project-([A-Za-z0-9_-]+)$/.exec(old);
    if(match&&byId(match[1])){location.replace(href('project',match[1]));return;}
    const legacy={'#about':'profile','#resources':'resources','#downloads':'downloads','#works':'works'};
    if(legacy[old]){location.replace(href(legacy[old]));return;}
  }
  render();
  requestAnimationFrame(()=>requestAnimationFrame(scrollToSection));
  // Pure utilities are exposed for local QA, not for network calls.
  window.PortfolioUtils=Object.freeze({safeUrl,parseVideo,getDownload,siteUrl});
})();
