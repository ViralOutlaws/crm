/* Wissensbasis, Pipeline-Kanban, Dashboard und Posteingang. */
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const STAGES = [
    { k: 'lead', l: 'Neue Anfrage' },
    { k: 'angebot', l: 'Angebot gesendet' },
    { k: 'erstgespraech', l: 'Verhandlung' },
    { k: 'gewonnen', l: 'Gewonnen' },
    { k: 'verloren', l: 'Verloren' },
  ];
  const SECTIONS = [
    { k: 'ton', l: 'So klingst du' },
    { k: 'begruessung', l: 'Begrüßung' },
    { k: 'niemals', l: 'Niemals' },
    { k: 'preise', l: 'Preise & Pakete' },
  ];
  const DEFAULTS = {
    ton: 'Klar, freundlich, auf Deutsch. Wir sind eine Webdesign- und KI-Agentur. Kurze Absätze.',
    begruessung: 'Guten Tag, oder den Vornamen. Abschluss: Viele Grüße, Kim, Viral Outlaws.',
    niemals: 'Erfinde nie Preise, Termine oder Referenzen. Schicke nie Zahlungslinks. Warte, bis Kim auf Senden drückt. Lösche nie etwas von allein.',
    preise: 'Preise nur aus den Paketen. Steht dort nichts, sag das.',
  };

  const ico = (name, size) => (typeof voSvg === 'function' ? voSvg(name, size || 16) : '');
  const css = document.createElement('style');
  css.textContent = `
  .reel-live{display:inline-flex;align-items:center;gap:8px;background:#1f9e5a;color:#fff;font-size:11px;font-weight:700;letter-spacing:.4px;border-radius:99px;padding:4px 8px}
  .reel-top-kpis{grid-template-columns:repeat(6,minmax(0,1fr)) !important;gap:8px}
  .reel-top-kpis .kpi{min-height:104px}
  .reel-panels{display:grid;grid-template-columns:1.3fr .7fr;gap:8px;margin-top:8px;align-items:stretch}
  .reel-panels .dash-card{margin:0;min-height:220px}
  .reel-chart{display:flex;align-items:flex-end;gap:8px;height:128px;padding-top:8px}
  .reel-bar-col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;min-width:0}
  .reel-bar{width:100%;background:rgba(120,120,120,.28);border-radius:4px 4px 0 0;min-height:6px}
  .reel-bar.on{background:#f5c400}
  .reel-bar-label{font-size:10px;color:var(--muted);margin-top:4px}
  .reel-seg{display:inline-flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-left:8px}
  .reel-seg button{border:0;background:transparent;color:inherit;padding:4px 8px;font-size:11px;cursor:pointer}
  .reel-seg button.on{background:#f5c400;color:#111}
  .reel-h{display:grid;grid-template-columns:88px 1fr 24px;align-items:center;gap:8px;margin:8px 0;font-size:12px}
  .reel-h i{display:block;height:4px;background:#f5c400;border-radius:4px}
  .reel-wait{display:flex;align-items:center;gap:16px;padding:8px}
  .reel-wait b{font-size:32px;line-height:1}
  .reel-feed{display:flex;flex-direction:column;gap:8px}
  .reel-feed-row{display:grid;grid-template-columns:18px 1fr auto;gap:8px;align-items:center;font-size:12px}
  .pl-card.reel-card{padding:16px;display:flex;flex-direction:column;gap:8px}
  .reel-card-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
  .reel-name{font-weight:700;font-size:13px}
  .reel-val{font-weight:700;white-space:nowrap;text-align:right}
  .reel-req{font-size:12px;color:var(--ink2,var(--muted));display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:32px}
  .reel-foot{font-size:11px;color:var(--muted);margin-top:auto}
  .reel-foot.late{color:#d97706}
  #page-pipeline .pl-board{align-items:stretch}
  @media(min-width:901px){
    #page-pipeline .pl-board{height:calc(100vh - 148px);align-items:stretch}
    #page-pipeline .pl-col{height:100%;min-height:0}
  }
  .pl-col.drag-over{box-shadow:inset 0 0 0 2px #f5c400}
  .inbox{display:grid;grid-template-columns:200px minmax(280px,.9fr) minmax(380px,1.15fr);gap:8px;height:calc(100vh - 168px);min-height:420px}
  .inbox-col{min-width:0;height:100%;overflow:auto;background:var(--glass-bg,rgba(255,255,255,.55));border:1px solid var(--border);border-radius:12px;padding:8px}
  .folder-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;position:relative}
  .folder-pop{position:absolute;right:0;top:28px;z-index:5;background:var(--paper);border:1px solid var(--border);border-radius:8px;padding:4px;min-width:160px;box-shadow:var(--shadow)}
  .folder-pop button{display:block;width:100%;text-align:left;background:transparent;border:0;color:inherit;padding:8px;border-radius:6px;cursor:pointer}
  .folder-tree button.fld{display:flex;width:100%;text-align:left;background:transparent;border:0;color:inherit;padding:6px 8px;border-radius:8px;cursor:pointer}
  .folder-tree button.fld.on,.folder-tree button.fld:hover{background:rgba(245,196,0,.16)}
  .mail-row{display:grid;grid-template-columns:16px 1fr;gap:8px;padding:10px 8px;border-radius:8px;cursor:pointer;position:relative}
  .mail-row:hover,.mail-row.on{background:rgba(245,196,0,.12)}
  .mail-row input{opacity:0}
  .mail-row:hover input,.mail-row.on input,.inbox.selecting .mail-row input{opacity:1}
  .mail-top{display:flex;justify-content:space-between;gap:8px;font-size:12px}
  .mail-sub{font-weight:650;font-size:13px;margin:2px 0}
  .mail-snip{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dot{width:8px;height:8px;border-radius:99px;display:inline-block;flex:0 0 8px}
  .dot.neu{background:#d63030}.dot.kunde_antwortet{background:#1f9e5a}.dot.beantwortet{background:#9aa0a6}
  .chip{display:inline-flex;align-items:center;gap:4px;border-radius:99px;padding:2px 8px;font-size:11px;background:rgba(245,196,0,.22);margin-right:4px}
  .chip.muted{background:rgba(120,120,120,.12)}
  .suggest{font-size:12px;margin-top:8px}
  .read-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
  .icon-actions{display:flex;gap:4px}
  .icon-actions button{width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:transparent;color:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
  .draft-card{margin-top:16px;padding:16px;border-radius:12px;border:1px solid var(--border);border-left:3px solid #f5c400;background:rgba(245,196,0,.06)}
  .draft-box{width:100%;min-height:160px;border-radius:8px;border:1px solid var(--border);background:transparent;color:inherit;padding:12px;margin:8px 0}
  .reel-banner{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border-radius:8px;background:rgba(120,120,120,.08);font-size:12px;color:var(--muted);margin-bottom:8px}
  .seg{display:flex;flex-wrap:wrap;gap:0;border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:8px}
  .seg button{border:0;background:transparent;color:inherit;padding:8px 12px;font-size:12px;cursor:pointer}
  .seg button.on{background:#f5c400;color:#111}
  .seg button:disabled{opacity:.45;cursor:default}
  .reel-back{display:none}
  .reel-folder-select{display:none;width:100%;margin-bottom:8px}
  body.dark-mode .draft-card{background:rgba(245,196,0,.08)}
  body.dark-mode .reel-bar{background:rgba(255,255,255,.12)}
  @media(max-width:900px){
    .reel-top-kpis{grid-template-columns:1fr 1fr !important}
    .reel-panels{grid-template-columns:1fr}
    .inbox{grid-template-columns:1fr;height:auto}
    .inbox-folders{display:none}
    .reel-folder-select{display:block}
    .inbox.detail .inbox-list,.inbox.detail .reel-folder-select{display:none}
    .inbox:not(.detail) .inbox-read{display:none}
    .reel-back{display:inline-flex}
  }`;
  document.head.appendChild(css);

  function boot() {
    if (typeof PAGE_TITLES === 'object') {
      PAGE_TITLES.wissensbasis = 'Wissensbasis';
      PAGE_TITLES.posteingang = 'Posteingang';
    }
    const nav = document.querySelector('#sidebar-nav');
    if (nav && !document.querySelector('[data-page="posteingang"]')) {
      const pipe = nav.querySelector('[data-page="pipeline"]');
      const block = document.createElement('div');
      block.innerHTML = `
        <div class="nav-item" onclick="showPage('wissensbasis')" data-page="wissensbasis"><span class="nav-item-icon">${ico('book', 18)}</span><span class="nav-item-label">Wissensbasis</span></div>
        <div class="nav-item" onclick="showPage('posteingang')" data-page="posteingang"><span class="nav-item-icon">${ico('mail', 18)}</span><span class="nav-item-label">Posteingang</span><span class="nav-item-badge" id="badge-inbox" style="display:none">0</span></div>`;
      if (pipe) pipe.after(...block.children); else nav.prepend(...block.children);
    }
    if (!document.getElementById('page-wissensbasis')) {
      const main = document.getElementById('page-pipeline');
      const hold = document.createElement('div');
      hold.innerHTML = `
        <div class="page" id="page-wissensbasis"><div class="sec-header"><div class="sec-title">Wissensbasis</div><span class="reel-live">LIVE</span></div><p style="font-size:12px;color:var(--muted);margin:0 0 12px">Alle KI-Entwürfe halten sich an diese Regeln. Nichts wird von allein gesendet.</p><div id="wissen-body"></div></div>
        <div class="page" id="page-posteingang"><div class="sec-header"><div class="sec-title">Posteingang</div><div style="display:flex;gap:8px"><button class="btn-ghost btn-sm" onclick="reelSync()">Aktualisieren</button><button class="btn-ghost btn-sm" onclick="reelCompose()">Neue Mail</button><button class="btn-ghost btn-sm" onclick="reelRules()">Regeln</button></div></div><div id="inbox-note"></div><div id="inbox-filters"></div><div class="inbox" id="inbox-grid"></div></div>`;
      main.parentNode.insertBefore(hold, main);
      while (hold.firstChild) main.parentNode.insertBefore(hold.firstChild, main);
      hold.remove();
    }
    const orig = window.showPage;
    window.showPage = function (id) {
      orig(id);
      if (id === 'wissensbasis') renderWissen();
      if (id === 'posteingang') renderInbox();
      if (id === 'dashboard') renderDashExtra();
      if (id === 'pipeline') renderBoard();
      paintBadge();
    };
    const origPipe = window.renderPipeline;
    window.renderPipeline = function () { if (origPipe) origPipe(); renderBoard(); };
    const origDash = window.renderDashboard;
    window.renderDashboard = function () { if (origDash) origDash(); renderDashExtra(); };
    const origDetail = window.renderContactDetail;
    if (typeof origDetail === 'function') {
      window.renderContactDetail = function (cid) { origDetail(cid); appendTimeline(cid); };
    }
    const q = new URLSearchParams(location.search).get('page');
    if (q) setTimeout(() => window.showPage(q), 30);
    paintBadge();
  }

  function daysCount(c) {
    const t = c.statusSeit || c.status_seit || c.updatedAt || c.createdAt;
    if (!t) return 0;
    return Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 86400000));
  }
  function cardValue(c) {
    const n = typeof dealShown === 'function' ? dealShown(c) : (Number(c.dealWert || c.kiWert) || 0);
    const ki = (c.dealWert == null || c.dealWert === '') && n > 0 && c.kiWert != null;
    return { n, ki };
  }
  function openPipeline() {
    const open = (DB.contacts || []).filter((c) => !c.archiviert && ['lead', 'erstgespraech', 'angebot'].includes(c.status));
    const sum = open.reduce((s, c) => s + cardValue(c).n, 0);
    const won = (DB.contacts || []).filter((c) => !c.archiviert && c.status === 'gewonnen');
    const avg = won.length ? Math.round(won.reduce((s, c) => {
      const start = new Date(c.createdAt || 0).getTime();
      const end = new Date(c.statusSeit || c.status_seit || c.updatedAt || Date.now()).getTime();
      return s + (start ? Math.max(0, Math.round((end - start) / 86400000)) : 0);
    }, 0) / won.length) : 0;
    return { sum, count: open.length, avg };
  }

  function renderBoard() {
    const board = document.getElementById('pl-board');
    if (!board || typeof DB === 'undefined') return;
    const strip = document.querySelector('#page-pipeline .area-kpis');
    if (strip) strip.remove();
    const pipe = openPipeline();
    const tot = document.getElementById('pl-total');
    if (tot) tot.textContent = 'Offene Pipeline ' + eur(pipe.sum) + ' · ' + pipe.count + ' Deals · Ø ' + pipe.avg + ' Tage bis Abschluss';
    const list = (DB.contacts || []).filter((c) => !c.archiviert);
    board.innerHTML = STAGES.map((st) => {
      const cs = list.filter((c) => (window.normStatus ? normStatus(c.status) : c.status) === st.k);
      const sum = cs.reduce((s, c) => s + cardValue(c).n, 0);
      return `<div class="pl-col" data-stage="${st.k}" ondragover="reelDragOver(event)" ondragleave="reelDragLeave(event)" ondrop="reelDropStage(event,'${st.k}')">
        <div class="pl-col-head"><span class="pl-col-title">${st.l} (${cs.length})</span><span class="pl-col-sum">${eur(sum)}</span></div>
        <div class="pl-cards">${cs.map((c) => {
          const v = cardValue(c);
          const days = daysCount(c);
          const req = c.ana || c.notes || '';
          return `<div class="pl-card reel-card" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${esc(c.id)}')">
            <div class="reel-card-top"><div class="reel-name" onclick="openContactDetail('${esc(c.id)}')">${esc(c.firma)}</div><div class="reel-val">${v.n ? eur(v.n) : '–'}${v.ki ? ` <span class="chip" title="${esc(c.kiGrund || 'KI-Schätzung')}">KI-Schätzung</span>` : ''}</div></div>
            <div class="reel-req">${esc(req)}</div>
            <div class="reel-foot ${days >= 14 ? 'late' : ''}">seit ${days} ${days === 1 ? 'Tag' : 'Tagen'}</div>
          </div>`;
        }).join('') || '<div style="color:var(--muted);font-size:12px;text-align:center;padding:16px 0">Leer</div>'}</div>
      </div>`;
    }).join('');
  }
  function eur(n) { return Math.round(n || 0).toLocaleString('de-DE') + ' €'; }
  window.reelDragOver = function (ev) { ev.preventDefault(); ev.currentTarget.classList.add('drag-over'); };
  window.reelDragLeave = function (ev) { ev.currentTarget.classList.remove('drag-over'); };
  window.reelDropStage = function (ev, stage) {
    ev.preventDefault();
    const id = ev.dataTransfer.getData('text/plain');
    const c = (DB.contacts || []).find((x) => x.id === id);
    if (!c || c.status === stage) return;
    c.statusSeit = new Date().toISOString();
    if (typeof plMove === 'function') plMove(id, stage);
    else { c.status = stage; if (typeof save === 'function') save(); }
    renderBoard();
  };
  window.reelEstimate = async function (id) {
    const c = (DB.contacts || []).find((x) => x.id === id);
    if (!c) return;
    if (window._currentUser && typeof getSupabase === 'function') {
      try {
        const sb = await getSupabase();
        const { data } = await sb.functions.invoke('deal-estimate', { body: { contactId: id } });
        if (data && data.wert) { c.kiWert = data.wert; c.kiPaket = data.paket; c.kiGrund = data.grund; c.kiOverride = false; }
      } catch (e) { /* lokale Schätzung bleibt */ }
    }
    if (!c.kiWert) { c.kiWert = 4800; c.kiPaket = 'Website'; c.kiGrund = 'Paket Website, ohne erfundene Extras.'; }
    if (typeof save === 'function') save();
    renderBoard();
  };

  function renderDashExtra() {
    const page = document.getElementById('page-dashboard');
    if (!page || typeof DB === 'undefined') return;
    const grid = page.querySelector('.kpi-grid-5');
    const pipe = openPipeline();
    const year = new Date().getFullYear();
    const paid = (DB.rechnungen || []).filter((r) => r.status === 'bezahlt' && String(r.datum || '').startsWith(String(year)));
    const umsatz = paid.reduce((s, r) => s + (typeof sumPositions === 'function' ? sumPositions(r.positions).brutto : 0), 0);
    const offeneRg = (DB.rechnungen || []).filter((r) => typeof isOpenRechnung === 'function' ? isOpenRechnung(r) : (r.status === 'offen-rg' || r.status === 'ueberfaellig'));
    const offen = offeneRg.reduce((s, r) => s + (typeof sumPositions === 'function' ? sumPositions(r.positions).brutto : 0), 0);
    const contacts = (DB.contacts || []).filter((c) => !c.archiviert);
    const now = new Date();
    const inMonth = (d, shift) => { const x = new Date(d || 0); const p = new Date(now.getFullYear(), now.getMonth() - (shift || 0), 1); return x.getFullYear() === p.getFullYear() && x.getMonth() === p.getMonth(); };
    const leads = contacts.filter((c) => inMonth(c.createdAt, 0)).length;
    const leadsPrev = contacts.filter((c) => inMonth(c.createdAt, 1)).length;
    const pct = leadsPrev ? Math.round((leads - leadsPrev) / leadsPrev * 100) : 0;
    const quoted = contacts.filter((c) => ['angebot', 'erstgespraech', 'gewonnen'].includes(c.status)).length;
    const won = contacts.filter((c) => c.status === 'gewonnen').length;
    const quote = quoted ? Math.round(won / quoted * 100) : 0;
    const pairs = (DB.conversations || []).filter((c) => c.first_inbound_at && c.first_reply_at && new Date(c.first_reply_at) > new Date(c.first_inbound_at));
    const med = median(pairs.map((c) => new Date(c.first_reply_at) - new Date(c.first_inbound_at)));
    const waiting = (DB.conversations || []).filter((c) => c.draft_status === 'pending').length;
    const mrr = (DB.retainer || []).filter((r) => r.status === 'aktiv').reduce((s, r) => s + (Number(r.betrag) || 0), 0);
    if (grid) {
      grid.classList.add('reel-top-kpis');
      const cards = [
        ['Umsatz (bezahlt, Jahr)', eur(umsatz), paid.length + ' Rechnungen', "dashKpi('umsatz')"],
        ['Pipeline-Wert', eur(pipe.sum), pipe.count + ' offene Deals', "showPage('pipeline')"],
        ['Offen / Überfällig', eur(offen), offeneRg.length + ' Rechnungen', "dashKpi('offen')"],
        ['Neue Leads', String(leads), (pct >= 0 ? '+' : '') + pct + ' % zum Vormonat', "dashGo('contacts')"],
        ['Abschlussquote', quote + ' %', 'gewonnen von den Angeboten', "showPage('pipeline')"],
        ['Antwortzeit', med == null ? '–' : Math.round(med / 3600000) + ' Std.', med == null ? 'noch keine Daten' : 'Median bis zur ersten Antwort', "showPage('posteingang')"],
      ];
      if (mrr > 0) cards.push(['MRR', eur(mrr), 'aktive Retainer', "dashKpi('mrr')"]);
      grid.innerHTML = cards.map(([label, val, sub, go]) => `<div class="kpi dash-hit" role="button" tabindex="0" onclick="${go}"><div class="kpi-label">${label}</div><div class="kpi-val">${val}</div><div class="kpi-sub">${sub}</div></div>`).join('');
    }
    let host = document.getElementById('reel-dash');
    if (!host) {
      host = document.createElement('div');
      host.id = 'reel-dash';
      if (grid) grid.after(host); else page.prepend(host);
    }
    const span = host.dataset.span === '12' ? 12 : 6;
    const months = reelMonths(span);
    const oldFeed = document.getElementById('dash-activity');
    if (oldFeed) oldFeed.innerHTML = feedItems();
    host.innerHTML = `
      <div class="reel-panels">
        <div class="dash-card"><h3>Umsatz pro Monat <span class="reel-seg"><button type="button" class="${span === 6 ? 'on' : ''}" onclick="reelSpan(6)">6</button><button type="button" class="${span === 12 ? 'on' : ''}" onclick="reelSpan(12)">12</button></span></h3><div class="reel-chart">${months.map((m) => `<div class="reel-bar-col"><div class="reel-bar ${m.now ? 'on' : ''}" style="height:${Math.max(m.h, 8)}%" title="${esc(m.label)} ${eur(m.sum)}"></div><div class="reel-bar-label">${esc(m.label)}</div></div>`).join('')}</div></div>
        <div class="dash-card dash-hit" onclick="dashGo('contacts')"><h3>Woher kommen Leads</h3>${sourceBars(contacts)}</div>
      </div>
      <div class="reel-panels" style="margin-top:8px">
        <div class="dash-card"><div class="reel-wait"><span>${ico('star', 22)}</span><div><b>${waiting}</b><div>Entwürfe warten auf Senden</div></div><button class="btn-yellow" onclick="event.stopPropagation();reelDrafts()">Prüfen</button></div></div>
        <div class="dash-card"><h3>Aktivität</h3><div class="reel-feed">${feedItems()}</div></div>
      </div>`;
  }
  window.reelSpan = function (n) { const host = document.getElementById('reel-dash'); if (host) host.dataset.span = String(n); renderDashExtra(); };
  window.reelDrafts = function () { inboxFilter = 'entwurf'; showPage('posteingang'); };
  function median(ns) {
    const a = ns.filter((n) => n >= 0).sort((x, y) => x - y);
    if (!a.length) return null;
    return a[Math.floor(a.length / 2)];
  }
  function reelMonths(n) {
    const now = new Date();
    const rows = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const sum = (DB.rechnungen || []).filter((r) => r.status === 'bezahlt' && r.datum && new Date(r.datum).getMonth() === d.getMonth() && new Date(r.datum).getFullYear() === d.getFullYear())
        .reduce((s, r) => s + (typeof sumPositions === 'function' ? sumPositions(r.positions).brutto : 0), 0);
      rows.push({ sum, now: i === 0, label: d.toLocaleString('de-DE', { month: 'short' }) });
    }
    const max = Math.max(1, ...rows.map((r) => r.sum));
    return rows.map((r) => ({ ...r, h: Math.round(r.sum / max * 100) }));
  }
  const QUELLE = { website: 'Website', empfehlung: 'Empfehlung', google: 'Google', instagram: 'Instagram', 'ki-check': 'KI-Check', kaltakquise: 'Kaltakquise', sonstiges: 'Sonstiges', ohne: 'Ohne Quelle', email: 'E-Mail' };
  function sourceBars(contacts) {
    const map = {};
    contacts.forEach((c) => { const k = QUELLE[c.quelle] || (c.quelle ? c.quelle.charAt(0).toUpperCase() + c.quelle.slice(1) : 'Ohne Quelle'); map[k] = (map[k] || 0) + 1; });
    const max = Math.max(1, ...Object.values(map));
    return Object.entries(map).map(([k, n]) => `<div class="reel-h"><span>${esc(k)}</span><i style="width:${Math.round(n / max * 100)}%"></i><span>${n}</span></div>`).join('') || '<div style="color:var(--muted)">Noch keine Quellen.</div>';
  }
  function relTime(d) {
    const ms = Date.now() - new Date(d).getTime();
    const h = Math.round(ms / 3600000);
    if (h < 24) return h <= 1 ? 'gerade eben' : 'vor ' + h + ' Std.';
    const days = Math.floor(h / 24);
    if (days < 1) return 'heute';
    return days === 1 ? 'gestern' : 'vor ' + days + ' Tagen';
  }
  function feedItems() {
    const items = [];
    (DB.contacts || []).forEach((c) => { if (c.createdAt) items.push({ t: c.createdAt, icon: 'user', text: esc(c.firma) + ' angelegt' }); });
    (DB.rechnungen || []).filter((r) => r.status === 'bezahlt').forEach((r) => items.push({ t: r.datum, icon: 'check', text: 'Rechnung ' + esc(r.nr || '') + ' bezahlt' }));
    (DB.messages || []).filter((m) => m.direction === 'out').forEach((m) => items.push({ t: m.created_at, icon: 'mail', text: 'Mail gesendet' }));
    items.sort((a, b) => new Date(b.t) - new Date(a.t));
    return items.slice(0, 6).map((i) => `<div class="reel-feed-row"><span>${ico(i.icon, 16)}</span><span>${i.text}</span><span style="color:var(--muted)">${relTime(i.t)}</span></div>`).join('') || '<div style="color:var(--muted);font-size:12px">Noch keine Aktivität.</div>';
  }
  window.renderDashExtra = renderDashExtra;

  function wissenList() {
    DB.wissensbasis = DB.wissensbasis || SECTIONS.map((s) => ({ section: s.k, content: DEFAULTS[s.k] }));
    return DB.wissensbasis;
  }
  function renderWissen() {
    const host = document.getElementById('wissen-body');
    if (!host) return;
    const rows = wissenList();
    host.innerHTML = SECTIONS.map((s) => {
      const row = rows.find((r) => r.section === s.k) || { content: DEFAULTS[s.k] };
      return `<div class="dash-card" style="margin-bottom:12px"><h3>${s.l}</h3><textarea id="wissen-${s.k}" rows="4" style="width:100%">${esc(row.content || '')}</textarea>${s.k === 'preise' ? '<div style="font-size:12px;margin-top:6px"><a href="#" onclick="event.preventDefault();showPage(\'konfigurator\')">Pakete im Konfigurator</a></div>' : ''}<button class="btn-yellow" style="margin-top:8px" onclick="reelSaveWissen('${s.k}')">Speichern</button></div>`;
    }).join('');
  }
  window.reelSaveWissen = async function (section) {
    const content = document.getElementById('wissen-' + section).value;
    const rows = wissenList();
    const row = rows.find((r) => r.section === section);
    if (row) row.content = content; else rows.push({ section, content });
    if (window._currentUser && typeof getSupabase === 'function') {
      const sb = await getSupabase();
      const ws = _currentWorkspace?.id || window._FALLBACK_WORKSPACE_ID;
      await sb.from('wissensbasis').upsert({ workspace_id: ws, section, content, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id,section' });
    }
    if (typeof save === 'function') save();
    if (typeof haptikToast === 'function') haptikToast('Wissensbasis gespeichert');
  };

  function mails() { DB.conversations = DB.conversations || []; DB.messages = DB.messages || []; DB.mailFolders = DB.mailFolders || []; DB.mailRules = DB.mailRules || []; return DB.conversations; }
  function paintBadge() {
    const n = mails().filter((c) => c.status === 'neu' || c.draft_status === 'pending').length;
    const b = document.getElementById('badge-inbox');
    if (!b) return;
    b.style.display = n ? '' : 'none';
    b.textContent = String(n);
  }
  let inboxFolder = 'INBOX';
  let inboxFilter = 'alle';
  let inboxId = null;
  let inboxImages = false;
  const selected = new Set();

  let inboxSelect = false;
  function tree(folders) {
    const byParent = {};
    folders.forEach((f) => { const p = f.parent_path || ''; (byParent[p] = byParent[p] || []).push(f); });
    const walk = (parent, depth) => (byParent[parent] || []).map((f) =>
      `<div style="padding-left:${depth * 12}px"><button type="button" class="fld ${inboxFolder === f.imap_path ? 'on' : ''}" onclick="reelFolder('${esc(f.imap_path)}')" ondragover="event.preventDefault()" ondrop="reelDropFolder(event,'${esc(f.imap_path)}')">${esc(f.name)}</button></div>` + walk(f.imap_path, depth + 1)
    ).join('');
    return `<div class="folder-head"><span style="font-size:12px;font-weight:700">Ordner</span><button class="icon-actions" title="Ordneraktionen" aria-label="Ordneraktionen" onclick="reelFolderMenu(event)" style="border:0;background:transparent;color:inherit;cursor:pointer">${ico('more', 16)}</button><div class="folder-pop" id="folder-pop" hidden><button type="button" onclick="reelMkdir()">Ordner anlegen</button><button type="button" onclick="reelRenameFolder(inboxFolder)">Umbenennen</button><button type="button" onclick="reelDeleteFolder(inboxFolder)">Löschen</button></div></div>
      <div class="folder-tree">${walk('', 0) || '<div style="color:var(--muted);font-size:12px">Noch keine Ordner.</div>'}</div>`;
  }
  window.reelFolderMenu = function (ev) {
    ev.stopPropagation();
    const pop = document.getElementById('folder-pop');
    if (pop) pop.hidden = !pop.hidden;
  };
  document.addEventListener('click', () => { const pop = document.getElementById('folder-pop'); if (pop) pop.hidden = true; });
  function renderInbox() {
    const grid = document.getElementById('inbox-grid');
    if (!grid) return;
    const note = document.getElementById('inbox-note');
    if (note) {
      note.className = window._currentUser ? '' : 'reel-banner';
      note.innerHTML = window._currentUser ? '' : '<span>E-Mail noch nicht verbunden. Website-Anfragen bleiben nutzbar.</span><button class="btn-ghost btn-sm" onclick="this.previousElementSibling.textContent=\'Die Verbindung richtet Webby über die Mail-Secrets ein.\'">Verbinden</button>';
    }
    const filters = document.getElementById('inbox-filters');
    const segs = [['alle', 'Alle'], ['email', 'E-Mail'], ['website', 'Website'], ['kunde', 'Nur Kundenmails'], ['ohne', 'Ohne Kunde'], ['entwurf', 'Entwürfe']];
    if (filters) filters.innerHTML = '<div class="seg">' + segs.map(([id, label]) => `<button type="button" class="${inboxFilter === id ? 'on' : ''}" onclick="reelFilter('${id}')">${label}</button>`).join('') + '<button type="button" disabled title="bald verfügbar">WhatsApp</button><button type="button" disabled title="bald verfügbar">Instagram</button></div>';
    const list = mails().filter((c) => {
      if (inboxFilter === 'entwurf') return c.draft_status === 'pending';
      if (inboxFilter === 'email' && c.channel !== 'email') return false;
      if (inboxFilter === 'website' && c.channel !== 'website') return false;
      if (inboxFilter === 'kunde' && !c.contact_id) return false;
      if (inboxFilter === 'ohne' && c.contact_id) return false;
      if (inboxFilter !== 'entwurf' && c.folder_path && inboxFolder && c.channel === 'email' && c.folder_path !== inboxFolder) return false;
      return true;
    });
    const open = mails().find((c) => c.id === inboxId) || null;
    grid.classList.toggle('detail', !!open && window.innerWidth < 900);
    grid.classList.toggle('selecting', inboxSelect || selected.size > 0);
    const options = (DB.mailFolders || []).map((f) => `<option value="${esc(f.imap_path)}" ${f.imap_path === inboxFolder ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
    grid.innerHTML = `
      <div class="inbox-col inbox-folders">${tree(DB.mailFolders || [])}</div>
      <div class="inbox-col inbox-list"><select class="reel-folder-select" onchange="reelFolder(this.value)">${options}</select>${selected.size ? `<button class="btn-ghost btn-sm" onclick="reelMoveDialog()">Auswahl verschieben</button>` : ''}${list.map((c) => mailRow(c)).join('') || '<div style="color:var(--muted);padding:16px">Keine Mails.</div>'}</div>
      <div class="inbox-col inbox-read">${open ? readPane(open) : '<div style="color:var(--muted);padding:24px">Wähle eine Nachricht.</div>'}</div>`;
  }
  function mailRow(c) {
    const msg = (DB.messages || []).find((m) => m.conversation_id === c.id);
    const who = (msg && msg.from_addr) || c.channel || '';
    const when = msg && msg.created_at ? relTime(msg.created_at) : '';
    return `<div class="mail-row ${c.id === inboxId ? 'on' : ''}" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${esc(c.id)}')" onclick="reelOpen('${esc(c.id)}')">
      <input type="checkbox" ${selected.has(c.id) ? 'checked' : ''} onclick="event.stopPropagation();reelToggleSelect('${esc(c.id)}',this.checked)">
      <div><div class="mail-top"><span><span class="dot ${esc(c.status || 'neu')}"></span> ${esc(who.replace(/<[^>]+>/g, '').trim())}</span><span style="color:var(--muted)">${esc(when)}</span></div>
      <div class="mail-sub">${esc(c.subject || '')}</div>
      <div class="mail-snip">${esc((msg && msg.body_text) || '')}</div>
      <div style="margin-top:4px"><span class="chip muted">${esc(labelOf(c.klassifikation))}</span>${chip(c)}</div></div></div>`;
  }
  function labelOf(k) {
    return { anfrage: 'Anfrage', kunde: 'Kunde', rechnung: 'Rechnung', newsletter: 'Newsletter', sonstiges: 'Sonstiges' }[k] || k || 'Mail';
  }
  function chip(c) {
    const contact = (DB.contacts || []).find((x) => x.id === c.contact_id);
    if (contact) return `<span class="chip">${esc(contact.firma)}</span>`;
    const sug = (DB.contacts || []).find((x) => x.id === c.suggested_contact_id);
    if (sug) return `<span class="suggest">Zu Kunde ${esc(sug.firma)} zuordnen?</span>`;
    return '';
  }
  function readPane(c) {
    const msgs = (DB.messages || []).filter((m) => m.conversation_id === c.id);
    const contact = (DB.contacts || []).find((x) => x.id === c.contact_id);
    const sug = (DB.contacts || []).find((x) => x.id === c.suggested_contact_id);
    const from = (msgs[0] && msgs[0].from_addr) || '';
    return `<div class="read-head"><div><button class="btn-ghost btn-sm reel-back" onclick="reelBack()">Zurück</button><h3 style="margin:8px 0">${esc(c.subject || '')}</h3><div style="font-size:12px;color:var(--muted)">${esc(from)}</div>${contact ? `<div class="chip" style="margin-top:8px">${esc(contact.firma)}${contact.kundennummer ? ' · ' + esc(contact.kundennummer) : ''}</div>` : ''}</div>
      <div class="icon-actions">
        <button type="button" title="Antworten" aria-label="Antworten" onclick="reelCompose('${esc(c.id)}','reply')">${ico('back', 16)}</button>
        <button type="button" title="Allen antworten" aria-label="Allen antworten" onclick="reelCompose('${esc(c.id)}','all')">${ico('users', 16)}</button>
        <button type="button" title="Weiterleiten" aria-label="Weiterleiten" onclick="reelCompose('${esc(c.id)}','fwd')">${ico('arrow', 16)}</button>
        <button type="button" title="Verschieben nach" aria-label="Verschieben nach" onclick="reelMoveDialog('${esc(c.id)}')">${ico('archive', 16)}</button>
        <button type="button" title="Bilder laden" aria-label="Bilder laden" onclick="inboxImages=!inboxImages;renderInbox()">${ico('image', 16)}</button>
      </div></div>
      ${sug && !contact ? `<div class="suggest">Zu Kunde ${esc(sug.firma)} zuordnen? <button class="btn-yellow btn-sm" onclick="reelAssign('${esc(c.id)}','${esc(sug.id)}',true)">Ja</button> <button class="btn-ghost btn-sm" onclick="reelAssignPick('${esc(c.id)}')">Ändern</button></div>` : ''}
      ${c.suggested_folder ? `<div class="suggest"><button class="btn-ghost btn-sm" onclick="reelMove('${esc(c.id)}','${esc(c.suggested_folder)}')">Nach ${esc(c.suggested_folder)}</button></div>` : ''}
      <div style="margin-top:16px">${msgs.map((m) => `<div style="margin:0 0 16px"><div style="font-size:12px;color:var(--muted);margin-bottom:4px">${esc(m.from_addr || m.direction || '')}</div><div style="line-height:1.5">${esc(m.body_text || '').replace(/\n/g, '<br>')}</div></div>`).join('')}</div>
      ${draftPane(c)}`;
  }
  function draftPane(c) {
    if (c.draft_status === 'discarded') return '';
    return `<div class="draft-card"><div style="font-size:11px;font-weight:700;letter-spacing:.4px">KI-Entwurf</div>
      <textarea class="draft-box" id="draft-${esc(c.id)}">${esc(c.draft_body || '')}</textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="btn-yellow" onclick="reelSend('${esc(c.id)}')">Senden</button>
        <button class="btn-ghost btn-sm" onclick="reelRewrite('${esc(c.id)}')">Neu schreiben</button>
        <button class="btn-ghost btn-sm" onclick="reelDropDraft('${esc(c.id)}')">Verwerfen</button>
        <button class="btn-ghost btn-sm" onclick="reelDraft('${esc(c.id)}')">KI-Antwort schreiben</button>
      </div></div>`;
  }
  window.reelSanitize = function (html, images) {
    return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+=/gi, ' data-x=');
  };
  window.reelFolder = function (path) { inboxFolder = path; inboxId = null; renderInbox(); };
  window.reelFilter = function (id) { inboxFilter = id; renderInbox(); };
  window.reelOpen = function (id) { inboxId = id; const c = mails().find((x) => x.id === id); if (c) c.unread = false; renderInbox(); };
  window.reelBack = function () { inboxId = null; renderInbox(); };
  window.reelToggleSelect = function (id, on) { if (on) selected.add(id); else selected.delete(id); };
  window.reelSync = async function () {
    if (!(window._currentUser && typeof getSupabase === 'function')) {
      const note = document.getElementById('inbox-note');
      if (note) note.textContent = 'E-Mail noch nicht verbunden. Website-Anfragen bleiben nutzbar.';
      return;
    }
    const sb = await getSupabase();
    const { data, error } = await sb.functions.invoke('mail-sync', { body: { op: 'sync' } });
    const note = document.getElementById('inbox-note');
    if (note) note.textContent = (data && data.message) || (error && error.message) || 'Aktualisiert.';
    renderInbox();
  };
  window.reelMoveDialog = function (id) {
    const ids = id ? [id] : [...selected];
    if (!ids.length) return;
    const folders = DB.mailFolders || [];
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
    window._reelMoveIds = ids;
    box.innerHTML = `<div class="dash-card" style="max-width:420px;width:100%"><h3>Verschieben nach…</h3>${folders.map((f) => `<button class="btn-ghost" style="display:block;width:100%;text-align:left;margin:4px 0" data-path="${esc(f.imap_path)}" onclick="reelMoveMany(window._reelMoveIds, this.dataset.path);this.closest('[style*=fixed]').remove()">${esc(f.name)}</button>`).join('')}<button class="btn-ghost" onclick="this.closest('[style*=fixed]').remove()">Abbrechen</button></div>`;
    document.body.appendChild(box);
  };
  window.reelMoveMany = function (ids, path) { ids.forEach((id) => reelMove(id, path, true)); offerRule(ids[0], path); renderInbox(); };
  window.reelMove = async function (id, path, quiet) {
    const c = mails().find((x) => x.id === id);
    if (!c) return;
    const from = c.folder_path || 'INBOX';
    c.folder_path = path;
    const msg = (DB.messages || []).find((m) => m.conversation_id === id && m.imap_uid);
    if (window._currentUser && typeof getSupabase === 'function' && msg) {
      const sb = await getSupabase();
      await sb.functions.invoke('mail-sync', { body: { op: 'move', from, to: path, uid: msg.imap_uid, conversationId: id } });
    }
    if (!quiet) { offerRule(id, path); renderInbox(); }
    if (typeof save === 'function') save();
  };
  window.reelDropFolder = function (ev, path) {
    ev.preventDefault();
    const id = ev.dataTransfer.getData('text/plain');
    if (id) reelMove(id, path);
  };
  function offerRule(id, path) {
    const c = mails().find((x) => x.id === id);
    const msg = (DB.messages || []).find((m) => m.conversation_id === id);
    const from = (msg && msg.from_addr) || '';
    if (!c || c.contact_id) return;
    if (!confirm('Immer so sortieren?\nAbsender enthält ' + from + ' → ' + path)) return;
    DB.mailRules.push({ id: 'rule-' + Date.now(), field: 'from', contains: from, target_path: path });
    if (typeof save === 'function') save();
  }
  window.reelMkdir = async function () {
    const path = prompt('Ordnername oder Pfad, zum Beispiel Kunden/Web');
    if (!path) return;
    DB.mailFolders.push({ imap_path: path, name: path.split('/').pop(), parent_path: path.includes('/') ? path.split('/').slice(0, -1).join('/') : null, delimiter: '/' });
    if (window._currentUser && typeof getSupabase === 'function') {
      const sb = await getSupabase();
      await sb.functions.invoke('mail-sync', { body: { op: 'mkdir', path } });
    }
    if (typeof save === 'function') save();
    renderInbox();
  };
  window.reelRenameFolder = async function (path) {
    const to = prompt('Neuer Name', path);
    if (!to || to === path) return;
    if (window._currentUser && typeof getSupabase === 'function') {
      const sb = await getSupabase();
      await sb.functions.invoke('mail-sync', { body: { op: 'rename', from: path, to } });
    }
  };
  window.reelDeleteFolder = async function (path) {
    if (!confirm('Ordner „' + path + '“ wirklich löschen?')) return;
    DB.mailFolders = DB.mailFolders.filter((f) => f.imap_path !== path);
    if (window._currentUser && typeof getSupabase === 'function') {
      const sb = await getSupabase();
      await sb.functions.invoke('mail-sync', { body: { op: 'deleteFolder', path, confirm: true } });
    }
    if (typeof save === 'function') save();
    renderInbox();
  };
  window.reelRules = function () {
    const rules = DB.mailRules || [];
    alert('Regeln\n' + (rules.map((r) => r.field + ' enthält ' + r.contains + ' → ' + r.target_path).join('\n') || 'Noch keine.') + '\n\nNeue Regel nach dem Verschieben mit „Immer so sortieren?“.');
  };
  window.reelAssign = function (convId, contactId, remember) {
    const c = mails().find((x) => x.id === convId);
    const contact = (DB.contacts || []).find((x) => x.id === contactId);
    if (!c || !contact) return;
    c.contact_id = contactId;
    c.suggested_contact_id = null;
    if (remember) {
      const msg = (DB.messages || []).find((m) => m.conversation_id === convId);
      const email = ((msg && msg.from_addr) || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (email) {
        DB.contactEmails = DB.contactEmails || [];
        DB.contactEmails.push({ contact_id: contactId, email: email[0].toLowerCase() });
      }
    }
    if (typeof save === 'function') save();
    renderInbox();
  };
  window.reelAssignPick = function (convId) {
    const name = prompt('Firma des Kunden');
    const contact = (DB.contacts || []).find((c) => (c.firma || '').toLowerCase() === String(name || '').toLowerCase());
    if (contact) reelAssign(convId, contact.id, true);
  };
  window.reelDraft = function (id) {
    const c = mails().find((x) => x.id === id);
    if (!c) return;
    c.draft_status = 'pending';
    c.draft_body = c.draft_body || 'Guten Tag,\n\nvielen Dank für Ihre Nachricht. Ich schaue es mir an und melde mich.\n\nViele Grüße\nKim\nViral Outlaws';
    if (typeof save === 'function') save();
    renderInbox();
  };
  window.reelRewrite = function (id) { const c = mails().find((x) => x.id === id); if (c) { c.draft_body = ''; renderInbox(); } };
  window.reelDropDraft = function (id) { const c = mails().find((x) => x.id === id); if (c) { c.draft_status = 'discarded'; c.draft_body = ''; if (typeof save === 'function') save(); renderInbox(); } };
  window.reelSend = async function (id) {
    const c = mails().find((x) => x.id === id);
    if (!c) return;
    const text = (document.getElementById('draft-' + id) || {}).value || c.draft_body || '';
    const msg = (DB.messages || []).find((m) => m.conversation_id === id);
    const to = (msg && msg.from_addr) || '';
    if (window._currentUser && typeof getSupabase === 'function') {
      const sb = await getSupabase();
      const { data, error } = await sb.functions.invoke('mail-send', { body: { conversationId: id, to, subject: c.subject, text } });
      if (error || (data && data.error)) { alert((data && data.error) || error.message); return; }
      if (data && data.warning && typeof haptikToast === 'function') haptikToast(data.warning);
    }
    c.status = 'beantwortet';
    c.draft_status = 'sent';
    c.first_reply_at = c.first_reply_at || new Date().toISOString();
    DB.messages.push({ id: 'local-' + Date.now(), conversation_id: id, direction: 'out', from_addr: 'ich', body_text: text, created_at: new Date().toISOString() });
    const contact = (DB.contacts || []).find((x) => x.id === c.contact_id);
    if (contact && contact.status === 'lead') { contact.status = 'angebot'; contact.statusSeit = new Date().toISOString(); }
    if (typeof save === 'function') save();
    renderInbox();
    paintBadge();
  };
  window.reelCompose = function (id, mode) {
    const c = id ? mails().find((x) => x.id === id) : null;
    const subject = c ? ((mode === 'fwd' ? 'Fwd: ' : 'Re: ') + (c.subject || '')) : prompt('Betreff') || '';
    if (!c && !subject) return;
    const row = { id: 'new-' + Date.now(), channel: 'email', subject, status: 'beantwortet', folder_path: inboxFolder, draft_body: '', draft_status: 'pending' };
    mails().unshift(row);
    inboxId = row.id;
    renderInbox();
  };

  function appendTimeline(cid) {
    const host = document.getElementById('contact-detail-content');
    if (!host || host.querySelector('.reel-timeline')) return;
    const rows = mails().filter((c) => c.contact_id === cid);
    if (!rows.length) return;
    const card = document.createElement('div');
    card.className = 'dash-card reel-timeline';
    card.innerHTML = '<h3>E-Mails</h3>' + rows.map((c) => `<div style="padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="showPage('posteingang');reelOpen('${esc(c.id)}')">${esc(c.subject || '')}</div>`).join('');
    host.appendChild(card);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
