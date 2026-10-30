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

  const css = document.createElement('style');
  css.textContent = `
  .reel-live{display:inline-flex;align-items:center;gap:6px;background:#1f9e5a;color:#fff;font-size:11px;font-weight:700;letter-spacing:.4px;border-radius:99px;padding:3px 8px}
  .reel-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}
  .reel-chart{display:flex;align-items:flex-end;gap:8px;height:120px}
  .reel-bar{flex:1;background:rgba(255,255,255,.35);border-radius:6px 6px 0 0;min-height:4px;position:relative}
  .reel-bar.on{background:#f5c400}
  .reel-h{display:flex;align-items:center;gap:8px;margin:6px 0}
  .reel-h i{display:block;height:8px;background:#f5c400;border-radius:4px}
  .pl-card.reel-in{animation:reelIn .35s var(--ease-spring,ease)}
  @keyframes reelIn{from{transform:translateY(8px);opacity:.4}to{transform:none;opacity:1}}
  .inbox{display:grid;grid-template-columns:220px minmax(0,1fr) minmax(260px,340px);gap:12px;min-width:0}
  .inbox-col{min-width:0;background:var(--glass-bg,rgba(255,255,255,.55));border:1px solid var(--border);border-radius:12px;padding:10px;max-height:calc(100vh - 140px);overflow:auto}
  .folder-tree button{display:flex;width:100%;text-align:left;background:transparent;border:0;color:inherit;padding:6px 8px;border-radius:8px;cursor:pointer}
  .folder-tree button.on{background:rgba(245,196,0,.18)}
  .mail-row{display:grid;grid-template-columns:22px 1fr;gap:6px;padding:8px;border-bottom:1px solid var(--border);cursor:pointer}
  .mail-row.on{background:rgba(245,196,0,.12)}
  .dot{width:8px;height:8px;border-radius:99px;display:inline-block}
  .dot.neu{background:#d63030}.dot.kunde_antwortet{background:#1f9e5a}.dot.beantwortet{background:#9aa0a6}
  .chip{display:inline-flex;align-items:center;gap:4px;border-radius:99px;padding:2px 8px;font-size:11px;background:rgba(245,196,0,.2)}
  .suggest{font-size:12px;margin-top:6px}
  .draft-box{width:100%;min-height:140px;border-radius:8px;border:1px solid var(--border);background:transparent;color:inherit;padding:8px}
  .mail-frame{width:100%;min-height:180px;border:0;background:#fff;border-radius:8px}
  @media(max-width:900px){
    .reel-kpis{grid-template-columns:1fr 1fr}
    .inbox{grid-template-columns:1fr}
    .inbox.detail .inbox-folders,.inbox.detail .inbox-list{display:none}
    .inbox:not(.detail) .inbox-read,.inbox:not(.detail) .inbox-draft{display:none}
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
        <div class="nav-item" onclick="showPage('wissensbasis')" data-page="wissensbasis"><span class="nav-item-icon">📘</span><span class="nav-item-label">Wissensbasis</span></div>
        <div class="nav-item" onclick="showPage('posteingang')" data-page="posteingang"><span class="nav-item-icon">✉</span><span class="nav-item-label">Posteingang</span><span class="nav-item-badge" id="badge-inbox" style="display:none">0</span></div>`;
      if (pipe) pipe.after(...block.children); else nav.prepend(...block.children);
    }
    if (!document.getElementById('page-wissensbasis')) {
      const main = document.getElementById('page-pipeline');
      const hold = document.createElement('div');
      hold.innerHTML = `
        <div class="page" id="page-wissensbasis"><div class="sec-header"><div class="sec-title">Wissensbasis</div><span class="reel-live">LIVE</span></div><p style="font-size:12px;color:var(--muted);margin:0 0 12px">Alle KI-Entwürfe halten sich an diese Regeln. Nichts wird von allein gesendet.</p><div id="wissen-body"></div></div>
        <div class="page" id="page-posteingang"><div class="sec-header"><div class="sec-title">Posteingang</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-ghost btn-sm" onclick="reelSync()">Aktualisieren</button><button class="btn-ghost btn-sm" onclick="reelCompose()">Neue Mail</button><button class="btn-ghost btn-sm" onclick="reelRules()">Regeln</button></div></div><div id="inbox-note" style="font-size:12px;color:var(--muted);margin-bottom:8px"></div><div class="filters-bar" id="inbox-filters"></div><div class="inbox" id="inbox-grid"></div></div>`;
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

  function daysIn(c) {
    const t = c.statusSeit || c.status_seit || c.updatedAt || c.createdAt;
    if (!t) return '';
    const d = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 86400000));
    return 'seit ' + d + (d === 1 ? ' Tag' : ' Tagen') + ' in Phase';
  }
  function cardValue(c) {
    if (c.dealWert != null && c.dealWert !== '' && c.kiOverride) return { n: Number(c.dealWert) || 0, ki: false };
    if (c.kiWert != null && c.kiWert !== '' && !c.dealWert) return { n: Number(c.kiWert) || 0, ki: true };
    return { n: Number(c.dealWert || c.kiWert || 0), ki: !c.dealWert && !!c.kiWert };
  }

  function renderBoard() {
    const board = document.getElementById('pl-board');
    if (!board || typeof DB === 'undefined') return;
    const list = (DB.contacts || []).filter((c) => !c.archiviert);
    board.innerHTML = STAGES.map((st) => {
      const cs = list.filter((c) => (window.normStatus ? normStatus(c.status) : c.status) === st.k);
      const sum = cs.reduce((s, c) => s + cardValue(c).n, 0);
      return `<div class="pl-col" data-stage="${st.k}" ondragover="event.preventDefault()" ondrop="reelDropStage(event,'${st.k}')">
        <div class="pl-col-head"><span class="pl-col-title">${st.l} (${cs.length})</span><span class="pl-col-sum">${Math.round(sum).toLocaleString('de-DE')} €</span></div>
        <div class="pl-cards">${cs.map((c) => {
          const v = cardValue(c);
          return `<div class="pl-card reel-in" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${esc(c.id)}')">
            <div class="pl-card-firma" onclick="openContactDetail('${esc(c.id)}')">${esc(c.firma)}</div>
            <div class="pl-card-meta"><span>${esc((c.notes || c.ana || '').slice(0, 80))}</span></div>
            <div class="pl-card-meta"><b>${v.n ? Math.round(v.n).toLocaleString('de-DE') + ' €' : '–'}</b>${v.ki ? ' <span class="chip">KI-Schätzung</span>' : ''}</div>
            <div class="pl-card-meta">${esc(daysIn(c))}${c.kiGrund ? ' · ' + esc(c.kiGrund) : ''}</div>
            <button class="btn-ghost btn-sm" onclick="event.stopPropagation();reelEstimate('${esc(c.id)}')">KI-Schätzung</button>
          </div>`;
        }).join('') || '<div style="color:var(--muted);font-size:11px;text-align:center;padding:14px 0">–</div>'}</div>
      </div>`;
    }).join('');
  }
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
    let host = document.getElementById('reel-dash');
    if (!host) {
      host = document.createElement('div');
      host.id = 'reel-dash';
      const grid = page.querySelector('.kpi-grid-5');
      if (grid) grid.after(host); else page.prepend(host);
    }
    const contacts = (DB.contacts || []).filter((c) => !c.archiviert);
    const open = contacts.filter((c) => ['lead', 'erstgespraech', 'angebot'].includes(c.status));
    const pipe = open.reduce((s, c) => s + cardValue(c).n, 0);
    const now = new Date();
    const month = (d) => { const x = new Date(d || 0); return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth(); };
    const prev = (d) => { const x = new Date(d || 0); const p = new Date(now.getFullYear(), now.getMonth() - 1, 1); return x.getFullYear() === p.getFullYear() && x.getMonth() === p.getMonth(); };
    const leads = contacts.filter((c) => month(c.createdAt)).length;
    const leadsPrev = contacts.filter((c) => prev(c.createdAt)).length || 0;
    const pct = leadsPrev ? Math.round((leads - leadsPrev) / leadsPrev * 100) : 0;
    const quoted = contacts.filter((c) => ['angebot', 'erstgespraech', 'gewonnen'].includes(c.status)).length;
    const won = contacts.filter((c) => c.status === 'gewonnen').length;
    const quote = quoted ? Math.round(won / quoted * 100) : 0;
    const conv = (DB.conversations || []).filter((c) => c.first_inbound_at && c.first_reply_at);
    const med = median(conv.map((c) => new Date(c.first_reply_at) - new Date(c.first_inbound_at)));
    const waiting = (DB.conversations || []).filter((c) => c.draft_status === 'pending').length;
    const months = reelMonths(host.dataset.span === '12' ? 12 : 6);
    host.innerHTML = `
      <div class="reel-kpis">
        <div class="kpi dash-hit" onclick="showPage('pipeline')"><div class="kpi-label">Pipeline-Wert</div><div class="kpi-val">${Math.round(pipe).toLocaleString('de-DE')} €</div></div>
        <div class="kpi dash-hit" onclick="dashGo && dashGo('contacts')"><div class="kpi-label">Neue Leads diesen Monat</div><div class="kpi-val">${leads}</div><div class="kpi-sub">${pct >= 0 ? '+' : ''}${pct}% zum Vormonat</div></div>
        <div class="kpi dash-hit" onclick="showPage('pipeline')"><div class="kpi-label">Abschlussquote</div><div class="kpi-val">${quote}%</div><div class="kpi-sub">gewonnen von den Angeboten</div></div>
        <div class="kpi dash-hit" onclick="showPage('posteingang')"><div class="kpi-label">Antwortzeit</div><div class="kpi-val">${med == null ? '–' : Math.round(med / 3600000) + ' Std.'}</div><div class="kpi-sub">Median bis zur ersten Antwort</div></div>
      </div>
      <div class="dash-row" style="grid-template-columns:1.2fr .8fr">
        <div class="dash-card"><h3>Umsatz pro Monat <button class="btn-ghost btn-sm" onclick="document.getElementById('reel-dash').dataset.span=document.getElementById('reel-dash').dataset.span==='12'?'6':'12';renderDashExtra()">${host.dataset.span === '12' ? '12' : '6'} Monate</button></h3><div class="reel-chart">${months.map((m) => `<div class="reel-bar ${m.now ? 'on' : ''}" style="height:${m.h}%" title="${esc(m.label)}"></div>`).join('')}</div></div>
        <div class="dash-card dash-hit" onclick="dashGo && dashGo('contacts')"><h3>Woher kommen Leads</h3>${sourceBars(contacts)}</div>
      </div>
      <div class="dash-card dash-hit" onclick="showPage('posteingang')" style="margin-top:12px"><h3>KI wartet auf dich</h3><div>${waiting ? waiting + ' Entwürfe warten auf Senden.' : 'Keine Entwürfe offen.'}</div></div>`;
  }
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
  function sourceBars(contacts) {
    const map = {};
    contacts.forEach((c) => { const k = c.quelle || 'ohne'; map[k] = (map[k] || 0) + 1; });
    const max = Math.max(1, ...Object.values(map));
    return Object.entries(map).map(([k, n]) => `<div class="reel-h"><span style="width:90px">${esc(k)}</span><i style="width:${Math.round(n / max * 100)}%"></i><span>${n}</span></div>`).join('') || '<div style="color:var(--muted)">Noch keine Quellen.</div>';
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

  function tree(folders) {
    const byParent = {};
    folders.forEach((f) => {
      const p = f.parent_path || '';
      (byParent[p] = byParent[p] || []).push(f);
    });
    const walk = (parent, depth) => (byParent[parent] || []).map((f) =>
      `<div style="padding-left:${depth * 12}px"><button type="button" class="${inboxFolder === f.imap_path ? 'on' : ''}" onclick="reelFolder('${esc(f.imap_path)}')" ondragover="event.preventDefault()" ondrop="reelDropFolder(event,'${esc(f.imap_path)}')">${esc(f.name)}</button></div>` + walk(f.imap_path, depth + 1)
    ).join('');
    return `<div class="folder-tree">${walk('', 0) || '<div style="color:var(--muted);font-size:12px">Noch keine Ordner. Nach dem Verbinden erscheinen sie hier.</div>'}</div>
      <button class="btn-ghost btn-sm" onclick="reelMkdir()">Ordner anlegen</button>
      <button class="btn-ghost btn-sm" onclick="reelRenameFolder(inboxFolder)">Umbenennen</button>
      <button class="btn-ghost btn-sm" onclick="reelDeleteFolder(inboxFolder)">Löschen</button>`;
  }
  function renderInbox() {
    const grid = document.getElementById('inbox-grid');
    if (!grid) return;
    const note = document.getElementById('inbox-note');
    if (note) note.textContent = window._currentUser ? '' : 'E-Mail noch nicht verbunden. Website-Anfragen bleiben nutzbar.';
    const filters = document.getElementById('inbox-filters');
    if (filters) filters.innerHTML = [['alle', 'Alle'], ['email', 'E-Mail'], ['website', 'Website-Anfragen']].map(([id, label]) => `<button class="filter-chip ${inboxFilter === id ? 'active' : ''}" onclick="reelFilter('${id}')">${label}</button>`).join('')
      + '<button class="filter-chip" disabled title="bald verfügbar">WhatsApp</button><button class="filter-chip" disabled title="bald verfügbar">Instagram</button>'
      + `<button class="filter-chip ${inboxFilter === 'kunde' ? 'active' : ''}" onclick="reelFilter('kunde')">Nur Kundenmails</button><button class="filter-chip ${inboxFilter === 'ohne' ? 'active' : ''}" onclick="reelFilter('ohne')">Ohne Kunde</button>`;
    const list = mails().filter((c) => {
      if (inboxFilter === 'email' && c.channel !== 'email') return false;
      if (inboxFilter === 'website' && c.channel !== 'website') return false;
      if (inboxFilter === 'kunde' && !c.contact_id) return false;
      if (inboxFilter === 'ohne' && c.contact_id) return false;
      if (c.folder_path && inboxFolder && c.folder_path !== inboxFolder && c.channel === 'email') return false;
      return true;
    });
    const open = list.find((c) => c.id === inboxId) || null;
    grid.classList.toggle('detail', !!open && window.innerWidth < 900);
    grid.innerHTML = `
      <div class="inbox-col inbox-folders">${tree(DB.mailFolders || [])}<button class="btn-ghost btn-sm" onclick="selected.size&&reelMoveDialog()">Auswahl verschieben</button></div>
      <div class="inbox-col inbox-list">${list.map((c) => `<div class="mail-row ${c.id === inboxId ? 'on' : ''}" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${esc(c.id)}')" onclick="reelOpen('${esc(c.id)}')">
        <input type="checkbox" ${selected.has(c.id) ? 'checked' : ''} onclick="event.stopPropagation();reelToggleSelect('${esc(c.id)}',this.checked)">
        <div><span class="dot ${esc(c.status || 'neu')}"></span> <b>${esc(c.subject || '')}</b><div style="font-size:11px;color:var(--muted)">${esc(c.klassifikation || '')} ${chip(c)}</div></div></div>`).join('') || '<div style="color:var(--muted)">Keine Mails in diesem Ordner.</div>'}</div>
      <div class="inbox-col inbox-read">${open ? readPane(open) : ''}</div>`;
    if (open && window.innerWidth >= 900) {
      const draft = document.createElement('div');
      draft.className = 'inbox-col inbox-draft';
      draft.innerHTML = draftPane(open);
      grid.appendChild(draft);
    } else if (open) {
      grid.querySelector('.inbox-read').insertAdjacentHTML('beforeend', draftPane(open));
    }
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
    return `<button class="btn-ghost btn-sm" onclick="reelBack()">Zurück</button>
      <h3>${esc(c.subject || '')}</h3>
      ${contact ? `<div class="chip">${esc(contact.firma)}${contact.kundennummer ? ' · ' + esc(contact.kundennummer) : ''}</div>` : ''}
      ${sug && !contact ? `<div class="suggest">Zu Kunde ${esc(sug.firma)} zuordnen? <button class="btn-yellow btn-sm" onclick="reelAssign('${esc(c.id)}','${esc(sug.id)}',true)">Ja</button> <button class="btn-ghost btn-sm" onclick="reelAssignPick('${esc(c.id)}')">Ändern</button></div>` : ''}
      <div style="margin:8px 0"><button class="btn-ghost btn-sm" onclick="reelMoveDialog('${esc(c.id)}')">Verschieben nach…</button>
      ${c.suggested_folder ? `<button class="btn-ghost btn-sm" onclick="reelMove('${esc(c.id)}','${esc(c.suggested_folder)}')">Nach ${esc(c.suggested_folder)}</button>` : ''}
      <button class="btn-ghost btn-sm" onclick="inboxImages=!inboxImages;renderInbox()">${inboxImages ? 'Bilder aus' : 'Bilder laden'}</button></div>
      ${msgs.map((m) => `<div style="margin:8px 0"><div style="font-size:11px;color:var(--muted)">${esc(m.direction)} · ${esc(m.from_addr || '')}</div>${m.body_html ? `<iframe class="mail-frame" sandbox="" srcdoc="${esc(window.reelSanitize ? reelSanitize(m.body_html, inboxImages) : m.body_text || '')}"></iframe>` : `<div>${esc(m.body_text || '').replace(/\n/g, '<br>')}</div>`}</div>`).join('')}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><button class="btn-ghost btn-sm" onclick="reelCompose('${esc(c.id)}','reply')">Antworten</button><button class="btn-ghost btn-sm" onclick="reelCompose('${esc(c.id)}','all')">Allen antworten</button><button class="btn-ghost btn-sm" onclick="reelCompose('${esc(c.id)}','fwd')">Weiterleiten</button></div>`;
  }
  function draftPane(c) {
    return `<h3>Entwurf</h3><textarea class="draft-box" id="draft-${esc(c.id)}">${esc(c.draft_body || '')}</textarea>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
        <button class="btn-yellow" onclick="reelSend('${esc(c.id)}')">Senden</button>
        <button class="btn-ghost btn-sm" onclick="reelDraft('${esc(c.id)}')">KI-Antwort schreiben</button>
        <button class="btn-ghost btn-sm" onclick="reelRewrite('${esc(c.id)}')">Neu schreiben</button>
        <button class="btn-ghost btn-sm" onclick="reelDropDraft('${esc(c.id)}')">Verwerfen</button>
      </div>`;
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
