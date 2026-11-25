/* Outreach: Ziele, Freigabe, Postfach. Nichts geht ohne Freigabe raus. */
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ico = (name, size) => (typeof voSvg === 'function' ? voSvg(name, size || 16) : '');
  const STATUS = { entwurf: 'Entwurf', freigegeben: 'Freigegeben', gesendet: 'Gesendet', antwort: 'Antwort', abgemeldet: 'Abgemeldet', abgelehnt: 'Abgelehnt' };
  const ART = { veroeffentlicht: 'Persönlich', generisch: 'Allgemeine Adresse', vermutet: 'Vermutet' };
  const params = new URLSearchParams(location.search);
  const demo = params.get('demo') === 'outreach';

  const state = {
    demo,
    tab: 'ziele',
    targets: [],
    people: [],
    drafts: [],
    messages: [],
    settings: { daily_limit: 50, gap_minutes: 2, guess_emails: false, paused: false, hour_from: 8, hour_to: 18, weekdays: [1, 2, 3, 4, 5], prep_from: 1, prep_until: 7, prep_target: 50, prep_batch: 3, prep_on: true },
    profiles: [],
    areas: [],
    coverage: [],
    pool: 0,
    removedProfiles: [],
    queue: 'offen',
    mailFilter: 'alle',
    q: '',
    picked: {},
    editorId: null,
    threadId: null,
    replyText: '',
    note: '',
    urls: '',
    branche: '',
    region: '',
    loaded: false,
  };

  function signedIn() { return typeof _currentUser !== 'undefined' && !!_currentUser; }
  function workspaceId() {
    if (typeof _currentWorkspace !== 'undefined' && _currentWorkspace && _currentWorkspace.id) return _currentWorkspace.id;
    if (typeof _FALLBACK_WORKSPACE_ID !== 'undefined') return _FALLBACK_WORKSPACE_ID;
    return '';
  }
  function toast(msg, bad) { if (typeof haptikToast === 'function') haptikToast(msg, bad ? 'bad' : undefined); }

  // Geschäftssignatur: gespeicherte Fassung aus den Outreach-Einstellungen, sonst aus den Firmendaten im CRM.
  // Der Versand hängt sie unter jede Mail. Sie zählt nicht zur Wortzahl.
  const IMPRESSUM_URL = 'https://www.viraloutlaws.de/impressum';
  function companySignature() {
    const c = (typeof DB !== 'undefined' && DB && DB.settings) ? DB.settings : {};
    const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
    const kontakt = [clean(c.tel) ? 'Tel. ' + clean(c.tel) : '', clean(c.email)].filter(Boolean).join(' · ');
    return [
      clean(c.inhaber) || 'Kim Lukas Tobler',
      clean(c.name) || 'Viral Outlaws',
      [clean(c.str), clean(c.plz)].filter(Boolean).join(', '),
      kontakt,
      clean(c.web).replace(/^https?:\/\//, ''),
      'Impressum: ' + IMPRESSUM_URL,
    ].filter(Boolean).join('\n');
  }
  function signatureText() {
    const own = String(state.settings.signature || '').trim();
    return own || companySignature();
  }
  function personOf(id) { return state.people.find((p) => p.id === id) || null; }
  function targetOf(id) { return state.targets.find((t) => t.id === id) || null; }
  function draftOf(id) { return state.drafts.find((d) => d.id === id) || null; }

  function seedDemo() {
    state.urls = 'https://musterwerk.example.test\nhttps://beispielhof.example.test';
    state.branche = 'Handwerk';
    state.region = 'Allgäu';
    state.settings.guess_emails = true;
    state.settings.daily_limit = 50;
    state.settings.gap_minutes = 2;
    state.settings.prep_from = 1;
    state.settings.prep_until = 7;
    state.settings.prep_target = 50;
    state.settings.prep_on = true;
    state.profiles = [
      { id: 'pa', name: 'Ärzte und Praxen', region: 'Deutschland', tags: ['amenity=doctors', 'amenity=dentist', 'healthcare=physiotherapist', 'amenity=clinic'], enabled: true, sort: 0 },
      { id: 'pi', name: 'Maschinenbau und Industrie', region: 'Deutschland', tags: ['craft=metal_construction', 'office=engineer', 'man_made=works'], enabled: true, sort: 1 },
      { id: 'ph', name: 'Handwerk', region: 'Deutschland', tags: ['craft=electrician', 'craft=plumber', 'craft=painter', 'craft=roofer', 'craft=hvac', 'shop=car_repair'], enabled: true, sort: 2 },
      { id: 'pg', name: 'Gastronomie', region: 'München', tags: ['amenity=restaurant', 'amenity=cafe'], enabled: false, sort: 3 },
      { id: 'pk', name: 'Kanzleien und Beratung', region: 'Deutschland', tags: ['office=tax_advisor', 'office=lawyer', 'office=estate_agent'], enabled: true, sort: 4 },
      { id: 'ps', name: 'Salon und Fitness', region: 'Deutschland', tags: ['shop=hairdresser', 'shop=beauty', 'leisure=fitness_centre'], enabled: true, sort: 5 },
    ];
    state.areas = [
      { id: 'berlin-mitte', name: 'Berlin-Mitte', sort: 0 },
      { id: 'berlin-kreuzberg', name: 'Berlin-Kreuzberg', sort: 1 },
      { id: 'hh-altona', name: 'Hamburg-Altona', sort: 2 },
    ];
    state.coverage = state.profiles.filter((p) => p.id !== 'pg').map((p) => ({ profile_id: p.id, area_id: 'berlin-mitte', searched_at: '2026-11-25T00:15:00.000Z' }));
    state.pool = 6;
    const obs1 = [
      { kind: 'mobil', text: 'Auf dem Handy wird die Seite winzig dargestellt.', source: 'https://musterwerk.example.test/', tip: 'Die Seite auf die Breite des Handys einstellen.', impact: 'Auf dem Handy wird die Seite winzig dargestellt. Viele Besucher springen da ab.', wert: 'Die Seite auf die Breite des Handys einstellen, damit der erste Blick lesbar ist.' },
      { kind: 'kontakt', text: 'Abends findet man nur eine Telefonnummer.', source: 'https://musterwerk.example.test/', tip: 'Ein kurzes Formular mit Name und Anliegen.', impact: 'Wer abends anfragen will, findet nur eine Telefonnummer.', wert: 'Ein kurzes Formular mit Name und Anliegen fängt die Anfrage auf, auch wenn niemand rangeht.' },
    ];
    const obs2 = [
      { kind: 'kontakt', text: 'Die Anfrage liegt erst auf der Kontaktseite.', source: 'https://beispielhof.example.test/kontakt', tip: 'Telefon und Anfrage in den ersten Blick.', impact: 'Wer anfragen will, muss die Kontaktseite erst suchen.', wert: 'Telefon und den Weg zur Anfrage in den ersten Blick auf dem Handy legen.' },
      { kind: 'seo', text: 'In der Suche fehlt ein Satz zum Hof.', source: 'https://beispielhof.example.test/', tip: 'Einen Satz hinterlegen, was der Hof macht und wo er sitzt.', impact: 'In der Google-Suche fehlt ein Satz, was der Hof macht und wo er sitzt.', wert: 'Diesen einen Satz hinterlegen, damit die Suche nicht nur den Seitentitel zeigt.' },
    ];
    const obs3 = [
      { kind: 'buchung', text: 'Einen Termin kann man auf der Seite nicht hinterlegen.', source: 'https://praxis-vitalis.example.test/', tip: 'Einen Weg Termin anfragen auf die Startseite setzen.', impact: 'Einen Termin kann man auf der Seite nicht hinterlegen.', wert: 'Einen sichtbaren Weg Termin anfragen auf die Startseite setzen.' },
      { kind: 'tempo', text: 'Besucher warten, bevor der Text da ist.', source: 'https://praxis-vitalis.example.test/', tip: 'Schwere Dateien nach hinten schieben.', impact: 'Besucher warten, bevor der Text auf der Seite da ist.', wert: 'Die schweren Dateien nach hinten schieben, damit der Text sofort lesbar ist.' },
    ];
    const mail1 = `Guten Tag Frau Muster,\n\nauf dem Handy wird die Seite von Musterwerk GmbH winzig dargestellt. Wer sie dort nicht lesen kann, geht wieder, ohne anzurufen. Abends findet man nur eine Telefonnummer. Anfragen, die dann kommen, gehen verloren, weil niemand rangeht.\n\nGenau solche Punkte löse ich für Betriebe wie Ihren. Das kann mehr Anfragen bringen, ohne dass jemand dauernd am Telefon sitzt.\n\nDarf ich Ihnen in zehn Minuten zeigen, was das für Ihre Seite heißt?\n\nWenn Sie keine weiteren Nachrichten möchten, antworten Sie kurz mit „Bitte abmelden“.\n\nViele Grüße\nKim\nViral Outlaws`;
    const mail2 = `Guten Tag Herr Beispiel,\n\nwer bei Beispielhof anfragen will, muss die Kontaktseite erst suchen. Manche geben auf, bevor sie dort sind. In der Suche fehlt außerdem ein Satz, was der Hof macht und wo er sitzt. Wer das nicht schon weiß, klickt woanders.\n\nIch schaue mir genau solche Stellen an. Der Unterschied ist oft, dass die Anfrage ankommt, statt unterwegs verloren zu gehen.\n\nSoll ich Ihnen eine kurze Einschätzung schicken, was das bei Ihnen ausmacht?\n\nWenn Sie keine weiteren Nachrichten möchten, antworten Sie kurz mit „Bitte abmelden“.\n\nViele Grüße\nKim\nViral Outlaws`;
    const mail3 = `Guten Tag Frau Holm,\n\neinen Termin kann man auf der Seite der Praxis Vitalis nicht hinterlegen. Wer einen Termin sucht und ihn hier nicht sieht, bucht woanders. Dazu kommt: Besucher warten, bevor der Text da ist, und viele bleiben das nicht.\n\nGenau damit kenne ich mich aus, bei Betrieben in Ihrer Größe. Termine können bei Ihnen landen, statt beim Nächsten.\n\nHaben Sie zehn Minuten, damit ich Ihnen zeige, was das auf Ihrer Seite bedeutet?\n\nWenn Sie keine weiteren Nachrichten möchten, antworten Sie kurz mit „Bitte abmelden“.\n\nViele Grüße\nKim\nViral Outlaws`;
    state.targets = [
      { id: 't1', firma: 'Musterwerk GmbH', web: 'https://musterwerk.example.test', domain: 'musterwerk.example.test', str: 'Hafenstraße 4', plz: '87435', ort: 'Kempten', impressum_url: 'https://musterwerk.example.test/impressum', status: 'recherchiert', skip_reason: '', observations: obs1 },
      { id: 't2', firma: 'Beispielhof', web: 'https://beispielhof.example.test', domain: 'beispielhof.example.test', str: 'Dorfweg 2', plz: '87435', ort: 'Kempten', status: 'recherchiert', skip_reason: '', observations: obs2 },
      { id: 't3', firma: 'Praxis Vitalis', web: 'https://praxis-vitalis.example.test', domain: 'praxis-vitalis.example.test', str: 'Gartenstraße 8', plz: '87435', ort: 'Kempten', branche: 'Physiotherapie', status: 'recherchiert', skip_reason: '', observations: obs3 },
      { id: 't4', firma: 'Bestandskunde Demo AG', web: 'https://demo-ag.example.test', domain: 'demo-ag.example.test', status: 'uebersprungen', skip_reason: 'Bestandskunde', observations: [] },
      { id: 't8', firma: 'Stillstand Demo', web: 'https://stillstand.example.test', domain: 'stillstand.example.test', status: 'duenn', skip_reason: 'zu wenig Substanz', observations: [{ kind: 'social', text: 'Auf den gelesenen Seiten liegt kein Link zu Instagram, Facebook oder LinkedIn.', source: 'https://stillstand.example.test/', tip: '' }] },
    ];
    state.people = [
      { id: 'p1', target_id: 't1', person: 'Lena Muster', rolle: 'Geschäftsführerin', email: 'lena.muster@musterwerk.example.test', email_art: 'veroeffentlicht', hinweis: 'Persönliche Adresse auf der Website', adresse: 'Hafenstraße 4, 87435 Kempten' },
      { id: 'p2', target_id: 't2', person: 'Jonas Beispiel', rolle: 'Inhaber', email: 'info@beispielhof.example.test', email_art: 'generisch', hinweis: 'Nur eine allgemeine Adresse veröffentlicht', adresse: 'Dorfweg 2, 87435 Kempten' },
      { id: 'p3', target_id: 't2', person: 'Jonas Beispiel', rolle: 'Inhaber', email: 'jonas.beispiel@beispielhof.example.test', email_art: 'vermutet', hinweis: 'Vermutet (vorname.nachname), nicht geprüft', adresse: 'Dorfweg 2, 87435 Kempten' },
      { id: 'p4', target_id: 't3', person: 'Mara Holm', rolle: 'Inhaberin', email: 'mara.holm@praxis-vitalis.example.test', email_art: 'veroeffentlicht', hinweis: 'Persönliche Adresse auf der Website', adresse: 'Gartenstraße 8, 87435 Kempten' },
    ];
    state.drafts = [
      { id: 'd1', target_id: 't1', person_id: 'p1', subject: 'Ihre Seite auf dem Handy', body: mail1, observations: obs1, status: 'entwurf', email: 'lena.muster@musterwerk.example.test', email_art: 'veroeffentlicht', guess_ok: false, unread: false },
      { id: 'd2', target_id: 't2', person_id: 'p2', subject: 'Anfragen am Abend', body: mail2, observations: obs2, status: 'freigegeben', email: 'info@beispielhof.example.test', email_art: 'generisch', guess_ok: false, unread: false },
      { id: 'd3', target_id: 't3', person_id: 'p4', subject: 'Termine auf Ihrer Seite', body: mail3, observations: obs3, status: 'entwurf', email: 'mara.holm@praxis-vitalis.example.test', email_art: 'veroeffentlicht', guess_ok: false, unread: false },
      { id: 'd4', target_id: 't5', person_id: 'p5', subject: 'Ihre Seite auf dem Handy', body: mail1.replace('Frau Muster', 'Frau Seenadel').replaceAll('Musterwerk GmbH', 'Seenadel Studio'), observations: [], status: 'gesendet', email: 'ada.seenadel@seenadel.example.test', email_art: 'veroeffentlicht', guess_ok: false, unread: false, contact_id: 'c-demo', kundennummer: 'KD-10001' },
      { id: 'd5', target_id: 't6', person_id: 'p6', subject: 'Anfragen am Abend', body: mail2.replace('Herr Beispiel', 'Herr Klar').replaceAll('Beispielhof', 'Klarwerk OHG'), observations: obs2, status: 'antwort', email: 'noel.klar@klarwerk.example.test', email_art: 'veroeffentlicht', guess_ok: false, unread: true },
      { id: 'd6', target_id: 't7', person_id: 'p7', subject: 'Ihre Seite auf dem Handy', body: mail1.replace('Frau Muster', 'Frau Nord').replaceAll('Musterwerk GmbH', 'Nordlicht Demo'), observations: [], status: 'abgemeldet', email: 'ruth.nord@nordlicht.example.test', email_art: 'veroeffentlicht', guess_ok: false, unread: false },
    ];
    state.targets.push(
      { id: 't5', firma: 'Seenadel Studio', web: 'https://seenadel.example.test', domain: 'seenadel.example.test', status: 'recherchiert' },
      { id: 't6', firma: 'Klarwerk OHG', web: 'https://klarwerk.example.test', domain: 'klarwerk.example.test', status: 'recherchiert' },
      { id: 't7', firma: 'Nordlicht Demo', web: 'https://nordlicht.example.test', domain: 'nordlicht.example.test', status: 'recherchiert' },
    );
    state.people.push(
      { id: 'p5', target_id: 't5', person: 'Ada Seenadel', rolle: 'Geschäftsführerin', email: 'ada.seenadel@seenadel.example.test', email_art: 'veroeffentlicht', hinweis: 'Persönliche Adresse auf der Website' },
      { id: 'p6', target_id: 't6', person: 'Noel Klar', rolle: 'Geschäftsführer', email: 'noel.klar@klarwerk.example.test', email_art: 'veroeffentlicht', hinweis: 'Persönliche Adresse auf der Website' },
      { id: 'p7', target_id: 't7', person: 'Ruth Nord', rolle: 'Inhaberin', email: 'ruth.nord@nordlicht.example.test', email_art: 'veroeffentlicht', hinweis: 'Persönliche Adresse auf der Website' },
    );
    state.messages = [
      { id: 'm1', draft_id: 'd4', direction: 'out', from_addr: 'kim@viraloutlaws.de', subject: 'Ihre Seite auf dem Handy', body_text: mail1.replace('Frau Muster', 'Frau Seenadel').replaceAll('Musterwerk GmbH', 'Seenadel Studio'), created_at: '2026-11-20T09:00:00.000Z' },
      { id: 'm2', draft_id: 'd5', direction: 'out', from_addr: 'kim@viraloutlaws.de', subject: 'Anfragen am Abend', body_text: mail2.replace('Herr Beispiel', 'Herr Klar').replaceAll('Beispielhof', 'Klarwerk OHG'), created_at: '2026-11-18T09:00:00.000Z' },
      { id: 'm3', draft_id: 'd5', direction: 'in', from_addr: 'noel.klar@klarwerk.example.test', subject: 'AW: Anfragen am Abend', body_text: 'Guten Tag Kim,\n\ndanke für die Zeilen. Die Anfragen landen bei mir im Postfach. Können Sie kurz sagen, wie so ein Ablauf bei einem kleinen Betrieb aussieht?\n\nViele Grüße\nNoel Klar', created_at: '2026-11-19T14:12:00.000Z' },
      { id: 'm4', draft_id: 'd6', direction: 'out', from_addr: 'kim@viraloutlaws.de', subject: 'Ihre Seite auf dem Handy', body_text: mail1.replace('Frau Muster', 'Frau Nord').replaceAll('Musterwerk GmbH', 'Nordlicht Demo'), created_at: '2026-11-12T09:00:00.000Z' },
      { id: 'm5', draft_id: 'd6', direction: 'in', from_addr: 'ruth.nord@nordlicht.example.test', subject: 'AW: Nordlicht Demo', body_text: 'Bitte abmelden. Kein Interesse an weiteren Nachrichten.', created_at: '2026-11-12T11:40:00.000Z' },
    ];
    state.note = 'Demo mit erfundenen Firmen. Es wird nichts gelesen und nichts verschickt.';
    const shot = params.get('shot') || '';
    if (shot === 'freigabe' || shot === 'editor') state.tab = 'freigabe';
    if (shot === 'editor') state.editorId = 'd1';
    if (shot === 'postfach') { state.tab = 'postfach'; state.threadId = null; }
    if (shot === 'thread') { state.tab = 'postfach'; state.threadId = 'd5'; state.replyText = ''; }
    state.loaded = true;
  }

  const css = document.createElement('style');
  css.textContent = `
  .outreach-lead{font-size:13px;color:var(--ink2);margin:0 0 12px;max-width:720px}
  .outreach-note{margin-bottom:12px}
  .outreach-grid{display:grid;grid-template-columns:minmax(280px,360px) minmax(0,1fr);gap:12px;align-items:start}
  .outreach-card{padding:16px}
  .outreach-card h3{margin:0 0 8px;font-size:14px}
  .outreach-help{font-size:12px;color:var(--muted);margin:0 0 12px;line-height:1.45}
  .outreach-field{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}
  .outreach-field label{font-size:11px;font-weight:650;color:var(--muted)}
  .outreach-field input,.outreach-field textarea,.outreach-field select,.outreach-search{width:100%;border:1px solid var(--border);border-radius:8px;background:transparent;color:inherit;padding:10px 12px;font:inherit}
  .outreach-field textarea{min-height:96px;resize:vertical}
  .outreach-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .outreach-check{display:flex;gap:8px;align-items:flex-start;font-size:12px;margin:8px 0}
  .outreach-results{display:flex;flex-direction:column;gap:8px}
  .outreach-co{padding:14px 16px}
  .outreach-co-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
  .outreach-co b{font-size:14px}
  .outreach-meta{font-size:12px;color:var(--muted);margin-top:4px}
  .outreach-person{margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
  .pill{display:inline-flex;align-items:center;gap:6px;border-radius:99px;padding:2px 8px;font-size:11px;font-weight:650;background:rgba(245,196,0,.18)}
  .pill.ok{background:#eef8f2;color:#1f7a45}
  .pill.warn{background:#fbf6ea;color:#8a5a00}
  .pill.guess{background:transparent;border:1px dashed var(--yellow2,#e6b800);color:#8a5a00}
  .pill.mute{background:rgba(120,120,120,.12);color:var(--muted)}
  .pill.stop{background:#fbeeee;color:#a32828}
  body.dark-mode .pill.ok{background:#163024;color:#8fd7ad}
  body.dark-mode .pill.warn,body.dark-mode .pill.guess{background:#2a230f;color:#e4c56a}
  body.dark-mode .pill.stop{background:#3a1717;color:#f0a0a0}
  .outreach-list{display:flex;flex-direction:column;gap:8px}
  .outreach-draft{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px 14px;cursor:pointer}
  .outreach-draft:hover{border-color:rgba(245,196,0,.7)}
  .outreach-draft.on{box-shadow:inset 3px 0 0 #f5c400}
  .outreach-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
  .mail-split{display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);gap:12px;min-height:520px}
  .mail-thread{display:flex;flex-direction:column;gap:10px;min-width:0}
  .bubble{padding:12px 14px;border-radius:12px;border:1px solid var(--border);font-size:13px;line-height:1.5;white-space:pre-wrap}
  .bubble.out{border-left:3px solid #f5c400;background:rgba(245,196,0,.06)}
  .bubble.in{background:var(--glass-bg,rgba(255,255,255,.4))}
  .dot-unread{width:8px;height:8px;border-radius:99px;background:#d63030;display:inline-block}
  #outreach-editor.overlay{z-index:600}
  .outreach-sig{white-space:pre-wrap;font-size:12px;line-height:1.5;opacity:.85;border-top:1px dashed rgba(212,175,55,.35);padding-top:8px;margin:6px 0 0}
  .outreach-sig-box textarea{min-height:130px;font-size:13px}
  .outreach-spin{display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:outreach-spin .8s linear infinite;vertical-align:-2px;margin-right:6px}
  @keyframes outreach-spin{to{transform:rotate(360deg)}}
  .outreach-run-result{margin:8px 0 0;font-size:13px}
  .outreach-run-result.bad{color:#ff8a80}
  #outreach-editor .modal{max-width:960px}
  #outreach-editor textarea{min-height:220px}
  .outreach-editor-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start}
  .obs-card{background:rgba(245,196,0,.08);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin:0 0 8px;font-size:12px;line-height:1.45}
  .obs-card a{display:block;margin-top:4px;color:inherit;word-break:break-all}
  .obs-tip{color:var(--ink2);display:block;margin-top:4px}
  .outreach-night{margin:0 0 12px}
  .profile-row{display:grid;grid-template-columns:24px minmax(120px,180px) minmax(110px,150px) minmax(0,1fr) auto;gap:8px;align-items:center;margin:0 0 8px}
  .profile-head{display:grid;grid-template-columns:24px minmax(120px,180px) minmax(110px,150px) minmax(0,1fr) auto;gap:8px;margin:0 0 4px}
  .profile-head span{font-size:11px;font-weight:650;color:var(--muted)}
  .outreach-warn{font-size:12px;line-height:1.45;margin:0 0 12px;padding:8px 10px;border-radius:8px;background:#fbf6ea;color:#8a5a00}
  body.dark-mode .outreach-warn{background:#2a230f;color:#e4c56a}
  .profile-row input{width:100%;border:1px solid var(--border);border-radius:8px;background:transparent;color:inherit;padding:8px 10px;font:inherit}
  @media(max-width:900px){.outreach-editor-grid{grid-template-columns:1fr}}
  @media(max-width:900px){
    .outreach-grid,.mail-split{grid-template-columns:1fr}
    .outreach-draft{grid-template-columns:28px minmax(0,1fr)}
    .outreach-actions{grid-column:1 / -1;justify-content:flex-start}
    .profile-row,.profile-head{grid-template-columns:24px minmax(0,1fr)}
  }`;
  document.head.appendChild(css);

  function artPill(art) {
    const cls = art === 'veroeffentlicht' ? 'ok' : art === 'generisch' ? 'warn' : art === 'vermutet' ? 'guess' : 'mute';
    return `<span class="pill ${cls}">${esc(ART[art] || art || '')}</span>`;
  }
  function statusPill(status) {
    const cls = status === 'abgemeldet' || status === 'abgelehnt' ? 'stop' : status === 'antwort' ? 'ok' : status === 'gesendet' || status === 'freigegeben' ? 'warn' : 'mute';
    return `<span class="pill ${cls}">${esc(STATUS[status] || status)}</span>`;
  }

  function boot() {
    if (typeof PAGE_TITLES === 'object') PAGE_TITLES.outreach = 'Outreach';
    const nav = document.querySelector('#sidebar-nav');
    if (nav && !document.querySelector('[data-page="outreach"]')) {
      const anchor = nav.querySelector('[data-page="wissensbasis"]') || nav.querySelector('[data-page="pipeline"]');
      const item = document.createElement('div');
      item.className = 'nav-item';
      item.setAttribute('data-page', 'outreach');
      item.onclick = () => window.showPage('outreach');
      item.innerHTML = `<span class="nav-item-icon">${ico('mail', 18)}</span><span class="nav-item-label">Outreach</span><span class="nav-item-badge" id="badge-outreach" style="display:none">0</span>`;
      if (anchor) anchor.after(item); else nav.appendChild(item);
    }
    if (!document.getElementById('page-outreach')) {
      const main = document.getElementById('page-pipeline') || document.getElementById('main-content');
      const page = document.createElement('div');
      page.className = 'page';
      page.id = 'page-outreach';
      page.innerHTML = '<div id="outreach-root"></div>';
      if (main && main.parentNode) main.parentNode.insertBefore(page, main);
      else document.getElementById('main-content')?.appendChild(page);
    }
    const prev = window.showPage;
    window.showPage = function (id) {
      if (id === 'posteingang') { state.tab = 'postfach'; id = 'outreach'; }
      if (typeof prev === 'function') prev(id);
      if (id === 'outreach') openOutreach();
    };
    window.outreachOpen = function (tab) {
      state.tab = tab || 'ziele';
      window.showPage('outreach');
    };
    window.outreachWaiting = function () {
      return state.drafts.filter((d) => d.status === 'entwurf').length;
    };
    if (demo) seedDemo();
    const shot = params.get('shot');
    const page = params.get('page');
    if (demo || page === 'outreach') setTimeout(() => window.showPage('outreach'), 40);
    if (demo) {
      const keep = setInterval(unlockDemo, 250);
      setTimeout(() => clearInterval(keep), 15000);
    }
    if (shot === 'ergebnis') setTimeout(() => document.getElementById('outreach-results')?.scrollIntoView({ block: 'start' }), 200);
  }

  function unlockDemo() {
    const ls = document.getElementById('login-screen');
    if (ls) { ls.style.display = 'none'; ls.classList.add('hidden'); }
    document.body.classList.remove('sidebar-open');
  }

  function openOutreach() {
    paintBadge();
    if (!state.loaded && !state.demo && signedIn()) {
      state.loaded = true;
      loadLive().then(render).catch((e) => { state.note = e.message || 'Outreach nicht geladen'; render(); });
      render();
      return;
    }
    render();
  }

  async function loadLive() {
    const sb = await getSupabase();
    const [settings, targets, people, drafts, messages, profiles, areas, coverage, pool] = await Promise.all([
      sb.from('outreach_settings').select('*').eq('workspace_id', workspaceId()).maybeSingle(),
      sb.from('outreach_targets').select('*').order('created_at', { ascending: false }).limit(80),
      sb.from('outreach_people').select('*').limit(240),
      sb.from('outreach_drafts').select('*').order('updated_at', { ascending: false }).limit(160),
      sb.from('outreach_messages').select('*').order('created_at', { ascending: true }).limit(400),
      sb.from('outreach_profiles').select('*').order('sort'),
      sb.from('outreach_areas').select('id, name, state, sort').order('sort'),
      sb.from('outreach_coverage').select('profile_id, area_id, searched_at').limit(5000),
      sb.from('outreach_pool').select('id', { count: 'exact', head: true }),
    ]);
    const err = targets.error || drafts.error || profiles.error || areas.error || coverage.error || pool.error;
    if (err && /outreach_|schema cache|does not exist|PGRST205/i.test(err.message || '')) {
      state.note = 'Die Outreach-Tabellen sind noch nicht migriert. Live-Daten gibt es erst nach der Migration.';
      return;
    }
    if (err) throw new Error(err.message);
    if (settings.data) state.settings = Object.assign(state.settings, settings.data);
    state.targets = targets.data || [];
    state.people = people.data || [];
    state.drafts = drafts.data || [];
    state.messages = messages.data || [];
    state.profiles = profiles.data || [];
    state.areas = areas.data || [];
    state.coverage = coverage.data || [];
    state.pool = pool.count || 0;
    state.removedProfiles = [];
  }

  function paintBadge() {
    const n = state.drafts.filter((d) => d.status === 'entwurf').length + state.drafts.filter((d) => d.unread).length;
    const b = document.getElementById('badge-outreach');
    if (!b) return;
    b.style.display = n ? '' : 'none';
    b.textContent = String(n);
  }

  function render() {
    const root = document.getElementById('outreach-root');
    if (!root) return;
    const tabs = [['ziele', 'Ziele'], ['freigabe', 'Freigabe'], ['postfach', 'Postfach']];
    root.innerHTML = `
      <p class="outreach-lead">Finde Entscheider, lass Entwürfe schreiben und gib jede Mail einzeln frei. Versand läuft nur über dein Postfach und nur nach Freigabe.</p>
      ${state.note ? `<div class="reel-banner outreach-note"><span>${esc(state.note)}</span></div>` : ''}
      <div class="seg" id="outreach-tabs">${tabs.map(([id, label]) => `<button type="button" class="${state.tab === id ? 'on' : ''}" onclick="outreachTab('${id}')">${label}</button>`).join('')}</div>
      <div id="outreach-panel">${state.tab === 'freigabe' ? queueHtml() : state.tab === 'postfach' ? mailHtml() : goalsHtml()}</div>
      ${editorHtml()}`;
    const editor = document.getElementById('outreach-editor');
    if (editor) document.body.appendChild(editor);
    paintBadge();
  }

  const DEFAULT_PROFILES = [
    { name: 'Ärzte und Praxen', tags: ['amenity=doctors', 'amenity=dentist', 'healthcare=physiotherapist', 'amenity=clinic'] },
    { name: 'Maschinenbau und Industrie', tags: ['craft=metal_construction', 'office=engineer', 'man_made=works'] },
    { name: 'Handwerk', tags: ['craft=electrician', 'craft=plumber', 'craft=painter', 'craft=roofer', 'craft=hvac', 'shop=car_repair', 'craft=tiler', 'craft=glaziery'] },
    { name: 'Gastronomie', tags: ['amenity=restaurant', 'amenity=cafe'] },
    { name: 'Kanzleien und Beratung', tags: ['office=tax_advisor', 'office=lawyer', 'office=estate_agent'] },
    { name: 'Salon und Fitness', tags: ['shop=hairdresser', 'shop=beauty', 'leisure=fitness_centre'] },
  ];

  function regionMatches(area, region) {
    const raw = String(region || '').trim().toLowerCase();
    if (!raw || raw === 'deutschland' || raw === 'germany' || raw === 'bundesweit') return true;
    return String(area.name || '').toLowerCase().includes(raw) || String(area.id || '').includes(raw.replace(/\s+/g, '-'));
  }

  function nextPrepCell() {
    const profiles = state.profiles.filter((p) => p.enabled && (p.tags || []).length).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const areas = state.areas.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
    if (!profiles.length || !areas.length) return null;
    const seen = new Map(state.coverage.map((c) => [c.profile_id + '|' + c.area_id, c.searched_at]));
    let oldest = null;
    for (const area of areas) {
      for (const profile of profiles) {
        if (!regionMatches(area, profile.region)) continue;
        const at = seen.get(profile.id + '|' + area.id);
        if (!at) return { profile, area };
        const ms = Date.parse(at);
        if (!oldest || ms < oldest.rank) oldest = { rank: ms, profile, area };
      }
    }
    return oldest;
  }

  function nightHtml() {
    const cell = nextPrepCell();
    const visited = new Set(state.coverage.map((c) => c.area_id)).size;
    const waiting = state.drafts.filter((d) => d.status === 'entwurf').length;
    const next = cell ? `${cell.profile.name} · ${cell.area.name}` : (state.profiles.some((p) => p.enabled) ? 'Gebiete fehlen noch. Der erste Lauf legt sie an.' : 'Kein Profil ist eingeschaltet.');
    const gap = [1, 2, 3, 5].includes(Number(state.settings.gap_minutes)) ? Number(state.settings.gap_minutes) : 2;
    return `<div class="dash-card outreach-card outreach-night" id="outreach-settings">
      <h3>Nachtlauf</h3>
      <p class="outreach-help">Von „Start ab“ bis „Fertig bis“, Zeitzone Berlin, sucht das System in kleinen Schritten und legt Entwürfe mit Status Entwurf an. Standard ist 1 bis 7 Uhr, damit morgens etwa 50 Entwürfe in der Freigabe liegen. Es hört auf, wenn das Ziel erreicht ist, die Kandidaten aus sind, oder die Bis-Stunde da ist. Overpass bekommt nur einen Bezirk oder eine Stadt. Schon besuchte Gebiete bleiben gespeichert. Nichts geht ohne Freigabe raus.</p>
      <div class="outreach-row">
        <div class="outreach-field" style="width:110px"><label>Start ab</label><input id="outreach-prep-from" type="number" min="0" max="23" value="${esc(state.settings.prep_from)}" oninput="outreachSetting('prep_from', this.value)"></div>
        <div class="outreach-field" style="width:120px"><label>Fertig bis</label><input id="outreach-prep-until" type="number" min="1" max="24" value="${esc(state.settings.prep_until)}" oninput="outreachSetting('prep_until', this.value)"></div>
        <div class="outreach-field" style="width:120px"><label>Ziel Entwürfe</label><input id="outreach-prep-target" type="number" min="1" max="200" value="${esc(state.settings.prep_target)}" oninput="outreachSetting('prep_target', this.value)"></div>
        <label class="outreach-check" style="margin:0"><input type="checkbox" ${state.settings.prep_on !== false ? 'checked' : ''} onchange="outreachPrepOn(this.checked)"> Nachtlauf an</label>
      </div>
      <p class="outreach-help" id="outreach-night-status">Offene Entwürfe ${esc(waiting)} von ${esc(state.settings.prep_target)}. Nächste Suche: ${esc(next)}. ${esc(visited)} ${visited === 1 ? 'Gebiet' : 'Gebiete'} schon besucht${state.pool ? ', ' + esc(state.pool) + ' Websites warten noch' : ''}.</p>
      <h3>Suchprofile</h3>
      <div class="profile-head"><span></span><span>Branche</span><span>Ort</span><span>Merkmale</span><span></span></div>
      ${state.profiles.map((p) => `<div class="profile-row">
        <input type="checkbox" ${p.enabled ? 'checked' : ''} aria-label="${esc(p.name)} an" onchange="outreachProfileEnabled('${esc(p.id)}', this.checked)">
        <input value="${esc(p.name)}" aria-label="Branche" oninput="outreachProfileName('${esc(p.id)}', this.value)">
        <input value="${esc(p.region || 'Deutschland')}" aria-label="Ort" oninput="outreachProfileRegion('${esc(p.id)}', this.value)">
        <input value="${esc((p.tags || []).join(', '))}" aria-label="Merkmale" oninput="outreachProfileTags('${esc(p.id)}', this.value)">
        <button type="button" class="btn-ghost btn-sm" onclick="outreachProfileRemove('${esc(p.id)}')">Weg</button>
      </div>`).join('') || '<p class="outreach-help">Noch keine Branchen. Standards laden legt Ärzte, Industrie, Handwerk, Gastronomie, Kanzleien und Salons an, Ort Deutschland.</p>'}
      <h3>Signatur</h3>
      <p class="outreach-help">Steht unter jeder Outreach-Mail und jeder Antwort, mit Adresse und Impressum. Vorbelegt aus deinen Firmendaten. Zählt nicht zur Wortzahl.</p>
      <div class="outreach-field outreach-sig-box"><label>Signatur</label><textarea id="outreach-signature" oninput="outreachSignature(this.value)">${esc(signatureText())}</textarea></div>
      <h3>Versandtempo</h3>
      <div class="outreach-row">
        <div class="outreach-field" style="width:140px"><label>Abstand</label><select id="outreach-gap" onchange="outreachSetting('gap_minutes', this.value)">${[1, 2, 3, 5].map((n) => `<option value="${n}" ${gap === n ? 'selected' : ''}>${n} ${n === 1 ? 'Minute' : 'Minuten'}</option>`).join('')}</select></div>
        <div class="outreach-field" style="width:120px"><label>Tageslimit</label><input id="outreach-daily" type="number" min="1" max="100" value="${esc(state.settings.daily_limit)}" oninput="outreachSetting('daily_limit', this.value)"></div>
      </div>
      <p class="outreach-warn" id="outreach-speed-warn">Schneller Versand über das Hauptpostfach kann als Spam gelten und die Adresse blockieren. Eine Minute ist die schnellste Stufe.</p>
      <div class="outreach-row">
        <button type="button" class="btn-ghost" onclick="outreachProfileAdd()">Branche</button>
        <button type="button" class="btn-ghost" onclick="outreachProfileRestore()">Standards laden</button>
        <button type="button" class="btn-ghost" onclick="outreachSaveSettings()">${ico('save', 14)} Sichern</button>
        <button type="button" class="btn-yellow" id="outreach-run-now" onclick="outreachNightRun()" ${state.nightBusy ? 'disabled aria-busy="true"' : ''}>${state.nightBusy ? '<span class="outreach-spin" aria-hidden="true"></span>Suche läuft …' : 'Einen Suchlauf jetzt'}</button>
      </div>
      ${state.nightBusy ? '<p class="outreach-help outreach-run-result" role="status">Der Suchlauf liest gerade Websites und schreibt Entwürfe. Das dauert meist ein bis zwei Minuten. Es wird nichts verschickt.</p>' : (state.nightResult ? `<p class="outreach-help outreach-run-result ${state.nightResult.bad ? 'bad' : ''}" role="status">${esc(state.nightResult.text)}</p>` : '')}
    </div>`;
  }

  function goalsHtml() {
    const shown = state.demo ? state.targets.filter((t) => ['t1', 't2', 't3', 't4', 't8'].includes(t.id)) : state.targets.filter((t) => !state.drafts.some((d) => d.target_id === t.id && ['gesendet', 'antwort', 'abgemeldet'].includes(d.status)));
    return `${nightHtml()}<div class="outreach-grid">
      <div class="dash-card outreach-card haptik-in" id="outreach-input">
        <h3>Firmen</h3>
        <p class="outreach-help">Eine URL pro Zeile, oder Branche und Region. Es werden nur die öffentliche Website und das Impressum gelesen. Kein LinkedIn, keine bezahlte Suche.</p>
        <div class="outreach-field"><label>Websites</label><textarea id="outreach-urls" oninput="outreachField('urls', this.value)">${esc(state.urls)}</textarea></div>
        <div class="outreach-row">
          <div class="outreach-field" style="flex:1"><label>Branche</label><input id="outreach-branche" value="${esc(state.branche)}" oninput="outreachField('branche', this.value)"></div>
          <div class="outreach-field" style="flex:1"><label>Region</label><input id="outreach-region" value="${esc(state.region)}" oninput="outreachField('region', this.value)"></div>
        </div>
        <label class="outreach-check"><input type="checkbox" ${state.settings.guess_emails ? 'checked' : ''} onchange="outreachGuess(this.checked)"> E-Mail aus dem Muster Vorname.Nachname vermuten und als „vermutet“ markieren</label>
        <div class="outreach-row">
          <button type="button" class="btn-yellow" onclick="outreachResearch()">${ico('search', 14)} Websites lesen</button>
          <button type="button" class="btn-ghost" onclick="outreachDraftNew()">${ico('pencil', 14)} Entwürfe schreiben</button>
        </div>
        <p class="outreach-help" style="margin-top:12px">Versand ${esc(state.settings.hour_from)}–${esc(state.settings.hour_to)} Uhr, Berlin. Die Bis-Stunde ist nicht mehr dabei. Abstand und Tageslimit stehen oben beim Nachtlauf.</p>
        <div class="outreach-row">
          <div class="outreach-field" style="width:80px"><label>Von</label><input type="number" min="0" max="23" value="${esc(state.settings.hour_from)}" oninput="outreachSetting('hour_from', this.value)"></div>
          <div class="outreach-field" style="width:80px"><label>Bis</label><input type="number" min="1" max="24" value="${esc(state.settings.hour_to)}" oninput="outreachSetting('hour_to', this.value)"></div>
        </div>
        <div class="outreach-row" style="margin-bottom:8px">${[[1,'Mo'],[2,'Di'],[3,'Mi'],[4,'Do'],[5,'Fr'],[6,'Sa'],[7,'So']].map(([day, label]) => `<label class="outreach-check" style="margin:0"><input type="checkbox" ${(state.settings.weekdays || []).includes(day) ? 'checked' : ''} onchange="outreachDay(${day}, this.checked)"> ${label}</label>`).join('')}</div>
        <button type="button" class="btn-ghost" onclick="outreachSaveSettings()">${ico('save', 14)} Sichern</button>
      </div>
      <div id="outreach-results" class="outreach-results">${shown.map(companyCard).join('') || '<div class="dash-card outreach-card"><p class="outreach-help">Noch keine Firmen. URLs einfügen oder Branche und Region suchen.</p></div>'}</div>
    </div>`;
  }

  function companyCard(t) {
    const people = state.people.filter((p) => p.target_id === t.id);
    const thin = t.status === 'duenn' || t.skip_reason === 'zu wenig Substanz';
    const skipped = t.status === 'uebersprungen' || t.status === 'fehler' || thin;
    const notes = Array.isArray(t.observations) ? t.observations : [];
    return `<article class="dash-card outreach-co haptik-in">
      <div class="outreach-co-top"><div><b>${esc(t.firma || t.web || 'Unbekannt')}</b><div class="outreach-meta">${esc(t.web || '')}${t.ort ? ' · ' + esc([t.plz, t.ort].filter(Boolean).join(' ')) : ''}</div></div>${skipped ? `<span class="pill stop">${esc(t.skip_reason || t.last_error || 'Übersprungen')}</span>` : '<span class="pill ok">Gelesen</span>'}</div>
      ${notes.slice(0, 3).map((o) => `<div class="outreach-meta">${esc(o.text || '')}</div>`).join('')}
      ${people.map((p) => `<div class="outreach-person"><div><div>${esc(p.person || 'Kein Name')} <span class="outreach-meta">${esc(p.rolle || '')}</span></div><div class="outreach-meta">${esc(p.email || 'keine Adresse')}</div><div class="outreach-meta">${esc(p.hinweis || '')}</div></div><div>${artPill(p.email_art)}${p.email_art === 'vermutet' && !skipped ? `<div style="margin-top:8px"><button type="button" class="btn-ghost btn-sm" onclick="outreachDraftOne('${esc(p.id)}')">Entwurf für Vermutung</button></div>` : ''}</div></div>`).join('')}
      ${!people.length ? `<p class="outreach-help">${esc(t.skip_reason || t.last_error || 'Kein Ansprechpartner gefunden.')}</p>` : ''}
    </article>`;
  }

  function queueHtml() {
    const rows = state.drafts.filter((d) => {
      if (state.queue === 'offen') return d.status === 'entwurf' || d.status === 'freigegeben';
      if (state.queue === 'alle') return true;
      return d.status === state.queue;
    });
    const chips = [['offen', 'Offen'], ['entwurf', 'Entwurf'], ['freigegeben', 'Freigegeben'], ['gesendet', 'Gesendet'], ['antwort', 'Antwort'], ['abgemeldet', 'Abgemeldet'], ['alle', 'Alle']];
    const waiting = state.drafts.filter((d) => d.status === 'freigegeben').length;
    return `<div class="outreach-row" style="margin-bottom:8px">
      <div class="seg">${chips.map(([id, label]) => `<button type="button" class="${state.queue === id ? 'on' : ''}" onclick="outreachQueue('${id}')">${label}</button>`).join('')}</div>
      <button type="button" class="btn-ghost" onclick="outreachApproveMany()">${ico('check', 14)} Ausgewählte freigeben</button>
      <button type="button" class="btn-yellow" onclick="outreachSendQueue()">${ico('mail', 14)} Jetzt eine senden${waiting ? ' (' + waiting + ')' : ''}</button>
      <label class="outreach-check" style="margin:0"><input type="checkbox" ${state.settings.paused ? 'checked' : ''} onchange="outreachPause(this.checked)"> Versand pausieren</label>
    </div>
    <p class="outreach-help">${state.settings.paused ? 'Der Versand ist pausiert. Weder der Knopf noch der Hintergrund schicken etwas.' : 'Freigegebene Mails gehen im Hintergrund raus, auch wenn diese Seite zu ist. Montag bis Freitag, 8 bis 18 Uhr Berlin, Abstand ' + esc(state.settings.gap_minutes) + ' Minuten, höchstens ' + esc(state.settings.daily_limit) + ' am Tag. Vermutete Adressen nur mit Häkchen. Ohne Freigabe geht nichts raus.'}</p>
    <div class="outreach-list" id="outreach-queue">${rows.map(draftRow).join('') || '<div class="dash-card outreach-card"><p class="outreach-help">Keine Entwürfe in dieser Ansicht.</p></div>'}</div>`;
  }

  function draftRow(d) {
    const t = targetOf(d.target_id);
    const p = personOf(d.person_id);
    return `<article class="dash-card outreach-draft ${state.editorId === d.id ? 'on' : ''}" onclick="outreachEdit('${esc(d.id)}')">
      <input type="checkbox" ${state.picked[d.id] ? 'checked' : ''} onclick="event.stopPropagation();outreachPick('${esc(d.id)}', this.checked)" aria-label="Auswählen">
      <div><b>${esc(d.subject || 'Ohne Betreff')}</b><div class="outreach-meta">${esc(t?.firma || '')}${p?.person ? ' · ' + esc(p.person) : ''} · ${esc(d.email || '')}</div></div>
      <div class="outreach-actions">${artPill(d.email_art)}${statusPill(d.status)}</div>
    </article>`;
  }

  function editorHtml() {
    const d = draftOf(state.editorId);
    if (!d || state.tab !== 'freigabe') return '';
    const t = targetOf(d.target_id);
    const guess = d.email_art === 'vermutet';
    const notes = Array.isArray(d.observations) && d.observations.length ? d.observations : (Array.isArray(t?.observations) ? t.observations : []);
    return `<div class="overlay open" id="outreach-editor" onclick="if(event.target===this)outreachCloseEdit()">
      <div class="modal" role="dialog" aria-labelledby="outreach-editor-title">
        <div class="modal-header"><h2 id="outreach-editor-title">Entwurf</h2><button type="button" class="icon-btn" onclick="outreachCloseEdit()" aria-label="Schließen">${ico('x', 16)}</button></div>
        <div style="padding:16px 20px 20px">
          <div class="outreach-editor-grid">
            <div>
              <p class="outreach-help">${esc(t?.firma || '')} · ${esc(d.email || '')} ${artPill(d.email_art)}</p>
              ${d.email_art === 'generisch' ? '<p class="outreach-help">Nur eine allgemeine Adresse. Kein Name an dieser Mail.</p>' : ''}
              ${guess ? `<label class="outreach-check"><input type="checkbox" ${d.guess_ok ? 'checked' : ''} onchange="outreachGuessOk('${esc(d.id)}', this.checked)"> Vermutete Adresse bewusst freigeben. Ohne dieses Häkchen geht die Mail nicht raus.</label>` : ''}
              <div class="outreach-field"><label>Betreff</label><input value="${esc(d.subject || '')}" oninput="outreachEditField('${esc(d.id)}','subject', this.value)"></div>
              <div class="outreach-field"><label>Text</label><textarea oninput="outreachEditField('${esc(d.id)}','body', this.value)">${esc(d.body || '')}</textarea></div>
              <p class="outreach-help" style="margin:0">Wird beim Versand angehängt (änderbar unter Nachtlauf → Signatur):</p>
              <div class="outreach-sig" id="outreach-signature-preview">-- \n${esc(signatureText())}</div>
            </div>
            <aside id="outreach-observations">
              <h3 style="margin:0 0 8px;font-size:14px">Beobachtungen</h3>
              <p class="outreach-help">Nur diese Punkte stehen in der Mail. Die Quelle ist die gelesene Seite.</p>
              ${notes.map((o) => `<div class="obs-card"><b>${esc(o.text || '')}</b><a href="${esc(o.source || '')}">${esc(o.source || '')}</a><span class="obs-tip">${esc(o.tip || '')}</span></div>`).join('') || '<p class="outreach-help">Keine Beobachtungen gespeichert.</p>'}
            </aside>
          </div>
          <div class="outreach-row">
            <button type="button" class="btn-ghost" onclick="outreachSaveDraft('${esc(d.id)}')">${ico('save', 14)} Speichern</button>
            <button type="button" class="btn-yellow" onclick="outreachApprove('${esc(d.id)}')">${ico('check', 14)} Freigeben</button>
            <button type="button" class="btn-ghost" onclick="outreachReject('${esc(d.id)}')">Ablehnen</button>
            <button type="button" class="btn-ghost" onclick="outreachMakeContact('${esc(d.id)}')">${ico('user', 14)} Kontakt anlegen</button>
            <button type="button" class="btn-ghost" onclick="outreachDelete('${esc(d.id)}')">${ico('trash', 14)} Löschen</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  function mailHtml() {
    const q = state.q.trim().toLowerCase();
    const rows = state.drafts.filter((d) => ['gesendet', 'antwort', 'abgemeldet'].includes(d.status)).filter((d) => {
      if (state.mailFilter !== 'alle' && d.status !== state.mailFilter) return false;
      if (!q) return true;
      const t = targetOf(d.target_id);
      const blob = `${d.subject} ${d.email} ${t?.firma || ''}`.toLowerCase();
      return blob.includes(q);
    });
    const chips = [['alle', 'Alle'], ['gesendet', 'Gesendet'], ['antwort', 'Antwort'], ['abgemeldet', 'Abgemeldet']];
    const open = draftOf(state.threadId);
    return `<div class="outreach-row" style="margin-bottom:8px">
      <div class="seg">${chips.map(([id, label]) => `<button type="button" class="${state.mailFilter === id ? 'on' : ''}" onclick="outreachMailFilter('${id}')">${label}</button>`).join('')}</div>
      <input class="outreach-search" style="max-width:240px" placeholder="Suchen" value="${esc(state.q)}" oninput="outreachSearch(this.value)">
    </div>
    <div class="mail-split">
      <div class="outreach-list" id="outreach-mail-list">${rows.map(threadRow).join('') || '<div class="dash-card outreach-card"><p class="outreach-help">Noch keine Outreach-Mails. Andere Post bleibt im Postfach der Mailbox und erscheint hier nicht.</p></div>'}</div>
      <div class="dash-card outreach-card mail-thread" id="outreach-thread">${open ? threadHtml(open) : '<p class="outreach-help">Wähle eine Mail. Hier liegen nur Gespräche aus Outreach, mit der Antwort darüber.</p>'}</div>
    </div>`;
  }

  function threadRow(d) {
    const t = targetOf(d.target_id);
    const p = personOf(d.person_id);
    return `<button type="button" class="dash-card outreach-draft ${state.threadId === d.id ? 'on' : ''}" onclick="outreachThread('${esc(d.id)}')">
      <span>${d.unread ? '<i class="dot-unread" aria-label="Ungelesen"></i>' : ''}</span>
      <span style="text-align:left"><b>${esc(t?.firma || d.email || '')}</b><span class="outreach-meta" style="display:block">${esc(p?.person || '')} · ${esc(d.subject || '')}</span></span>
      ${statusPill(d.status)}
    </button>`;
  }

  function threadHtml(d) {
    const t = targetOf(d.target_id);
    const msgs = state.messages.filter((m) => m.draft_id === d.id);
    const locked = d.status === 'abgemeldet';
    return `<div class="outreach-co-top"><div><b>${esc(t?.firma || d.email)}</b><div class="outreach-meta">${esc(d.email || '')}</div></div>${statusPill(d.status)}</div>
      ${msgs.map((m) => `<div class="bubble ${m.direction === 'out' ? 'out' : 'in'}"><div class="outreach-meta">${m.direction === 'out' ? 'Gesendet' : 'Antwort'} · ${esc(m.from_addr || '')}</div>${esc(m.body_text || '')}</div>`).join('')}
      ${locked ? '<p class="outreach-help">Abgemeldet. Diese Adresse bleibt auf der Sperrliste und wird nicht mehr angeschrieben.</p>' : `
      <div class="outreach-field"><label>Antwort, geht erst mit Senden raus</label><textarea id="outreach-reply" oninput="outreachReplyInput(this.value)">${esc(state.replyText)}</textarea></div>
      <div class="outreach-row">
        <button type="button" class="btn-ghost" onclick="outreachAiReply('${esc(d.id)}')">${ico('light', 14)} KI-Entwurf</button>
        <button type="button" class="btn-yellow" onclick="outreachSendReply('${esc(d.id)}')">${ico('mail', 14)} Senden</button>
      </div>`}`;
  }

  window.outreachTab = function (id) { state.tab = id; render(); };
  window.outreachQueue = function (id) { state.queue = id; render(); };
  window.outreachMailFilter = function (id) { state.mailFilter = id; render(); };
  window.outreachField = function (key, value) { state[key] = value; };
  window.outreachSearch = function (value) { state.q = value; const list = document.getElementById('outreach-mail-list'); if (!list) { render(); return; } render(); };
  window.outreachGuess = function (on) { state.settings.guess_emails = !!on; };
  window.outreachSignature = function (value) { state.settings.signature = String(value || '').slice(0, 800); };
  window.outreachSetting = function (key, value) {
    const n = Number(value);
    if (Number.isFinite(n)) state.settings[key] = n;
  };
  window.outreachPrepOn = function (on) { state.settings.prep_on = !!on; };
  window.outreachProfileEnabled = async function (id, on) {
    const p = state.profiles.find((x) => x.id === id);
    if (!p) return;
    p.enabled = !!on;
    if (state.demo || String(id).startsWith('neu-') || !signedIn()) { render(); return; }
    const sb = await getSupabase();
    const { error } = await sb.from('outreach_profiles').update({ enabled: !!on, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) toast(error.message, true);
    render();
  };
  window.outreachProfileName = function (id, value) {
    const p = state.profiles.find((x) => x.id === id);
    if (p) p.name = value;
  };
  window.outreachProfileRegion = function (id, value) {
    const p = state.profiles.find((x) => x.id === id);
    if (p) p.region = value;
  };
  window.outreachProfileTags = function (id, value) {
    const p = state.profiles.find((x) => x.id === id);
    if (!p) return;
    p.tags = String(value || '').split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    p._tagsChanged = true;
  };
  window.outreachProfileAdd = function () {
    state.profiles.push({ id: 'neu-' + Date.now(), name: 'Neue Branche', region: 'Deutschland', tags: [], enabled: true, sort: state.profiles.length });
    render();
  };
  window.outreachProfileRemove = function (id) {
    state.profiles = state.profiles.filter((p) => p.id !== id);
    if (!String(id).startsWith('neu-')) state.removedProfiles.push(id);
    render();
  };
  window.outreachProfileRestore = function () {
    const have = new Set(state.profiles.map((p) => p.name));
    DEFAULT_PROFILES.forEach((p) => {
      if (have.has(p.name)) return;
      state.profiles.push({ id: 'neu-' + p.name, name: p.name, region: 'Deutschland', tags: p.tags.slice(), enabled: true, sort: state.profiles.length });
    });
    render();
    toast('Fehlende Standards stehen in der Liste. Sichern schreibt sie.');
  };
  async function functionError(error, data) {
    if (data && data.error) return String(data.error);
    try {
      const ctx = error && error.context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.clone().json();
        if (body && (body.error || body.message)) return String(body.error || body.message);
      }
    } catch (_) { /* Antwort ohne JSON */ }
    const msg = String((error && error.message) || '');
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Keine Verbindung zum Server. Bitte Internet prüfen und noch einmal versuchen.';
    if (/non-2xx/i.test(msg)) return 'Der Suchlauf ist mit einem Fehler abgebrochen. Bitte in ein paar Minuten noch einmal versuchen.';
    return msg || 'Der Suchlauf ist fehlgeschlagen.';
  }
  function runSummary(data) {
    if (data && data.skipped) return String(data.skipped);
    const found = Number(data && (data.queried ? data.fresh : data.read)) || 0;
    const drafted = Number(data && data.drafted) || 0;
    const where = data && data.profile ? ` (${data.profile}${data.area ? ' · ' + data.area : ''})` : '';
    let text = `${found} ${found === 1 ? 'Betrieb' : 'Betriebe'} gefunden, ${drafted} ${drafted === 1 ? 'Entwurf' : 'Entwürfe'} angelegt${where}.`;
    if (data && data.queried && Number(data.found) > found) text += ` ${Number(data.found) - found} waren schon bekannt.`;
    if (data && data.read && Number(data.read) < found) text += ` ${data.read} davon gerade gelesen, der Rest wartet auf den nächsten Lauf.`;
    if (!drafted && data && Array.isArray(data.errors) && data.errors.length) text += ' Hinweis: ' + data.errors[0];
    else if (!drafted && data && data.read) text += ' Bei den gelesenen Seiten war nicht genug Konkretes für eine gute Mail.';
    return text + ' Nichts wurde verschickt.';
  }
  window.outreachNightRun = async function () {
    if (state.nightBusy) return;
    if (state.demo) { toast('Demo: es wird nichts gesucht und nichts geschrieben.'); return; }
    if (!signedIn()) { toast('Bitte anmelden.', true); return; }
    state.nightBusy = true;
    state.nightResult = null;
    render();
    let result;
    try {
      const sb = await getSupabase();
      const { data, error } = await sb.functions.invoke('outreach-night', { body: { op: 'run' } });
      if (error || (data && data.error)) result = { bad: true, text: await functionError(error, data) };
      else result = { bad: false, text: runSummary(data || {}) };
    } catch (e) {
      result = { bad: true, text: await functionError(e, null) };
    }
    state.nightBusy = false;
    state.nightResult = result;
    toast(result.text, result.bad);
    try {
      state.loaded = false;
      await loadLive();
    } catch (_) { /* Liste lädt beim nächsten Öffnen */ }
    render();
  };
  window.outreachPick = function (id, on) { state.picked[id] = !!on; };
  window.outreachEdit = function (id) { state.editorId = id; state.tab = 'freigabe'; render(); };
  window.outreachCloseEdit = function () { state.editorId = null; render(); };
  window.outreachEditField = function (id, key, value) { const d = draftOf(id); if (d) { d[key] = value; d._dirty = true; } };
  window.outreachGuessOk = function (id, on) { const d = draftOf(id); if (d) d.guess_ok = !!on; };
  window.outreachReplyInput = function (value) { state.replyText = value; };
  window.outreachThread = async function (id) {
    state.threadId = id;
    state.tab = 'postfach';
    const d = draftOf(id);
    state.replyText = d?.reply_body || '';
    if (d && d.unread) {
      d.unread = false;
      if (!state.demo && signedIn()) {
        const sb = await getSupabase();
        await sb.from('outreach_drafts').update({ unread: false }).eq('id', id);
      }
    }
    render();
  };

  window.outreachResearch = async function () {
    if (state.demo) { toast('Demo: es wird keine Website gelesen.'); return; }
    if (!signedIn()) { toast('Bitte anmelden.', true); return; }
    const urls = state.urls.split(/\s+/).filter((s) => /^https?:\/\//i.test(s));
    const sb = await getSupabase();
    const { data, error } = await sb.functions.invoke('outreach-research', { body: { urls, branche: state.branche, region: state.region, guess: state.settings.guess_emails === true } });
    if (error || (data && data.error && !data.targets)) { toast((data && data.error) || error.message || 'Suche fehlgeschlagen', true); return; }
    if (data && data.error) toast(data.error, true);
    state.loaded = false;
    await loadLive();
    state.tab = 'ziele';
    render();
  };

  window.outreachDraftNew = async function () {
    const ids = state.people.filter((p) => p.email_art !== 'vermutet' && targetOf(p.target_id)?.status === 'recherchiert').map((p) => p.id);
    await makeDrafts(ids, false);
  };
  window.outreachDraftOne = async function (id) { await makeDrafts([id], true); };
  async function makeDrafts(personIds, allowGuess) {
    if (!personIds.length) { toast('Keine veröffentlichte Adresse zum Entwerfen.'); return; }
    if (state.demo) { toast(allowGuess ? 'Demo: Vermutung bleibt ein Entwurf.' : 'Demo: Entwürfe stehen schon in der Freigabe.'); state.tab = 'freigabe'; render(); return; }
    if (!signedIn()) { toast('Bitte anmelden.', true); return; }
    const sb = await getSupabase();
    const { data, error } = await sb.functions.invoke('outreach-draft', { body: { personIds, allowGuess: allowGuess === true } });
    if (error || (data && data.error)) { toast((data && data.error) || error.message, true); return; }
    const n = (data && data.created && data.created.length) || 0;
    toast(n ? n + ' Entwurf bereit.' : 'Kein neuer Entwurf.');
    state.loaded = false;
    await loadLive();
    state.tab = 'freigabe';
    render();
  }

  window.outreachSaveDraft = async function (id) {
    const d = draftOf(id);
    if (!d) return;
    if (d.status === 'freigegeben') d.status = 'entwurf';
    if (state.demo) { toast('Demo: Entwurf gemerkt.'); render(); return; }
    const sb = await getSupabase();
    const { error } = await sb.from('outreach_drafts').update({ subject: d.subject, body: d.body, status: d.status, guess_ok: !!d.guess_ok, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) toast(error.message, true); else toast('Gespeichert.');
    render();
  };
  window.outreachApprove = async function (id) {
    const d = draftOf(id);
    if (!d) return;
    if (d.email_art === 'vermutet' && !d.guess_ok) { toast('Vermutete Adresse zuerst im Entwurf ankreuzen.', true); return; }
    d.status = 'freigegeben';
    d.approved_at = new Date().toISOString();
    if (!state.demo && signedIn()) {
      const sb = await getSupabase();
      const { error } = await sb.from('outreach_drafts').update({ status: 'freigegeben', approved_at: d.approved_at, subject: d.subject, body: d.body, guess_ok: !!d.guess_ok, updated_at: d.approved_at }).eq('id', id);
      if (error) { toast(error.message, true); return; }
    }
    toast('Freigegeben. Noch nicht gesendet.');
    state.editorId = null;
    render();
  };
  window.outreachApproveMany = async function () {
    const ids = Object.keys(state.picked).filter((id) => state.picked[id]);
    let n = 0;
    for (const id of ids) {
      const d = draftOf(id);
      if (!d || d.status !== 'entwurf') continue;
      if (d.email_art === 'vermutet' && !d.guess_ok) continue;
      d.status = 'freigegeben';
      d.approved_at = new Date().toISOString();
      n += 1;
      if (!state.demo && signedIn()) {
        const sb = await getSupabase();
        await sb.from('outreach_drafts').update({ status: 'freigegeben', approved_at: d.approved_at, guess_ok: !!d.guess_ok }).eq('id', id);
      }
    }
    toast(n ? n + ' freigegeben.' : 'Nichts freigegeben. Vermutungen brauchen ein eigenes Häkchen.');
    render();
  };
  window.outreachReject = async function (id) {
    const d = draftOf(id);
    if (!d) return;
    d.status = 'abgelehnt';
    if (!state.demo && signedIn()) {
      const sb = await getSupabase();
      await sb.from('outreach_drafts').update({ status: 'abgelehnt', updated_at: new Date().toISOString() }).eq('id', id);
    }
    state.editorId = null;
    toast('Abgelehnt.');
    render();
  };
  window.outreachDelete = async function (id) {
    state.drafts = state.drafts.filter((d) => d.id !== id);
    state.editorId = null;
    if (!state.demo && signedIn()) {
      const sb = await getSupabase();
      await sb.from('outreach_drafts').delete().eq('id', id);
    }
    toast('Entwurf gelöscht.');
    render();
  };
  window.outreachMakeContact = async function (id) {
    if (state.demo) { toast('Demo: kein Kontakt und keine Kundennummer.'); return; }
    if (!signedIn()) { toast('Bitte anmelden.', true); return; }
    const sb = await getSupabase();
    const { data, error } = await sb.functions.invoke('outreach-send', { body: { op: 'contact', draftId: id } });
    if (error || (data && data.error)) { toast((data && data.error) || error.message, true); return; }
    toast(data && data.kundennummer ? 'Kontakt ' + data.kundennummer : 'Kontakt verknüpft.');
    const d = draftOf(id);
    if (d && data) { d.contact_id = data.contactId; d.kundennummer = data.kundennummer; }
    render();
  };

  window.outreachDay = function (day, on) {
    const set = new Set(state.settings.weekdays || []);
    if (on) set.add(Number(day)); else set.delete(Number(day));
    state.settings.weekdays = [...set].sort((a, b) => a - b);
  };
  window.outreachPause = async function (on) {
    state.settings.paused = !!on;
    await window.outreachSaveSettings();
  };
  window.outreachSendQueue = async function () {
    if (state.demo) { toast('Demo: es wird nichts verschickt.'); return; }
    await sendOne();
  };
  async function sendOne() {
    if (state.demo || !signedIn()) return;
    const sb = await getSupabase();
    const { data, error } = await sb.functions.invoke('outreach-send', { body: { op: 'send' } });
    if (error || (data && data.error)) { toast((data && data.error) || error.message, true); return; }
    if (data && data.sent) {
      toast(data.kundennummer ? 'Gesendet. Kontakt ' + data.kundennummer : 'Gesendet.');
      state.loaded = false;
      await loadLive();
      render();
    } else if (data && data.reason) toast(data.reason);
  }

  window.outreachAiReply = async function (id) {
    if (state.demo) {
      state.replyText = 'Guten Tag Noel,\n\ndanke für die Rückmeldung. Bei einem kleinen Betrieb fangen wir mit der Seite an und schauen danach, welche Anfragen sich automatisch sortieren lassen. Wenn Sie mögen, skizziere ich das an einem Beispiel aus Ihrem Auftritt.\n\nViele Grüße\nKim\nViral Outlaws';
      render();
      toast('Demo: Entwurf liegt im Feld. Nichts ist raus.');
      return;
    }
    if (!signedIn()) { toast('Bitte anmelden.', true); return; }
    const sb = await getSupabase();
    const { data, error } = await sb.functions.invoke('outreach-reply', { body: { op: 'draft', draftId: id } });
    if (error || (data && data.error)) { toast((data && data.error) || error.message, true); return; }
    state.replyText = (data && data.text) || '';
    const d = draftOf(id);
    if (d) d.reply_body = state.replyText;
    render();
    toast('Entwurf liegt im Feld. Nichts ist raus.');
  };
  window.outreachSendReply = async function (id) {
    const text = (document.getElementById('outreach-reply') || {}).value || state.replyText;
    if (!String(text || '').trim()) { toast('Text fehlt.', true); return; }
    if (state.demo) { toast('Demo: die Antwort wird nicht verschickt.'); return; }
    if (!signedIn()) { toast('Bitte anmelden.', true); return; }
    const sb = await getSupabase();
    const { data, error } = await sb.functions.invoke('outreach-reply', { body: { op: 'send', confirm: true, draftId: id, text } });
    if (error || (data && data.error)) { toast((data && (data.error || data.reason)) || error.message, true); return; }
    if (data && data.sent === false) { toast(data.reason || 'Nicht gesendet.', true); return; }
    toast('Antwort ist raus.');
    state.replyText = '';
    state.loaded = false;
    await loadLive();
    render();
  };
  window.outreachSaveSettings = async function () {
    const daily = Math.min(100, Math.max(1, Number(state.settings.daily_limit) || 50));
    const gapChoices = [1, 2, 3, 5];
    const gapRaw = Number(state.settings.gap_minutes);
    const gap = gapChoices.includes(gapRaw) ? gapRaw : gapChoices.reduce((best, n) => Math.abs(n - gapRaw) < Math.abs(best - gapRaw) ? n : best, 2);
    let hourFrom = Math.min(23, Math.max(0, Number(state.settings.hour_from)));
    let hourTo = Math.min(24, Math.max(1, Number(state.settings.hour_to)));
    if (!Number.isFinite(hourFrom)) hourFrom = 8;
    if (!Number.isFinite(hourTo)) hourTo = 18;
    if (hourFrom >= hourTo) { toast('Die Von-Stunde muss vor der Bis-Stunde liegen.', true); return; }
    const weekdays = (state.settings.weekdays || []).map(Number).filter((n) => n >= 1 && n <= 7);
    state.settings.daily_limit = daily;
    state.settings.gap_minutes = gap;
    let prepFrom = Math.min(23, Math.max(0, Number(state.settings.prep_from)));
    let prepUntil = Math.min(24, Math.max(1, Number(state.settings.prep_until)));
    if (!Number.isFinite(prepFrom)) prepFrom = 1;
    if (!Number.isFinite(prepUntil)) prepUntil = 7;
    if (prepFrom >= prepUntil) { toast('Start ab muss vor Fertig bis liegen.', true); return; }
    const prepTarget = Math.min(200, Math.max(1, Number(state.settings.prep_target) || 50));
    const prepBatch = Math.min(4, Math.max(1, Number(state.settings.prep_batch) || 3));
    state.settings.hour_from = hourFrom;
    state.settings.hour_to = hourTo;
    state.settings.weekdays = weekdays.length ? weekdays : [1, 2, 3, 4, 5];
    state.settings.prep_from = prepFrom;
    state.settings.prep_until = prepUntil;
    state.settings.prep_target = prepTarget;
    state.settings.prep_batch = prepBatch;
    const tagOk = /^[a-z][a-z0-9_:-]{0,40}=[a-z0-9_:+-]{1,48}$/i;
    const bannedTag = /carpenter|joiner|cabinet|furniture|kitchen|parquet|schreiner|tischler|möbel|moebel/i;
    let droppedWood = false;
    state.profiles.forEach((p, sort) => {
      const tags = [];
      (p.tags || []).forEach((raw) => {
        const tag = String(raw || '').trim().toLowerCase();
        if (!tag) return;
        if (bannedTag.test(tag)) { droppedWood = true; return; }
        if (!tagOk.test(tag) || tags.includes(tag) || tags.length >= 8) return;
        tags.push(tag);
      });
      p.tags = tags;
      p.sort = sort;
      p.name = String(p.name || '').trim().slice(0, 80) || 'Branche';
      p.region = String(p.region || 'Deutschland').trim().slice(0, 80) || 'Deutschland';
    });
    if (state.demo) {
      toast(droppedWood ? 'Schreinerei und Möbel bleiben draußen.' : 'Demo: Einstellung gemerkt, nichts gespeichert.', droppedWood);
      render();
      return;
    }
    if (!signedIn()) { toast('Bitte anmelden.', true); return; }
    const sb = await getSupabase();
    const { error } = await sb.from('outreach_settings').upsert({
      workspace_id: workspaceId(),
      daily_limit: daily,
      gap_minutes: gap,
      guess_emails: state.settings.guess_emails === true,
      paused: state.settings.paused === true,
      hour_from: hourFrom,
      hour_to: hourTo,
      weekdays: state.settings.weekdays,
      prep_from: prepFrom,
      prep_until: prepUntil,
      prep_target: prepTarget,
      prep_batch: prepBatch,
      prep_on: state.settings.prep_on !== false,
      signature: signatureText().slice(0, 800),
      updated_at: new Date().toISOString(),
    });
    if (error) { toast(error.message, true); return; }
    if (state.removedProfiles.length) {
      const gone = await sb.from('outreach_profiles').delete().in('id', state.removedProfiles);
      if (gone.error) { toast(gone.error.message, true); return; }
      state.removedProfiles = [];
    }
    for (const p of state.profiles) {
      if (String(p.id).startsWith('neu-')) {
        const ins = await sb.from('outreach_profiles').insert({
          workspace_id: workspaceId(),
          name: p.name,
          region: p.region || 'Deutschland',
          tags: p.tags,
          enabled: p.enabled !== false,
          sort: p.sort,
        }).select('id').single();
        if (ins.error) { toast(ins.error.message, true); return; }
        p.id = ins.data.id;
      } else {
        const upd = await sb.from('outreach_profiles').update({
          name: p.name,
          region: p.region || 'Deutschland',
          tags: p.tags,
          enabled: p.enabled !== false,
          sort: p.sort,
          updated_at: new Date().toISOString(),
        }).eq('id', p.id);
        if (upd.error) { toast(upd.error.message, true); return; }
        if (p._tagsChanged) {
          await sb.from('outreach_coverage').delete().eq('profile_id', p.id);
          p._tagsChanged = false;
        }
      }
    }
    const saved = state.settings.paused ? 'Versand pausiert.' : 'Einstellungen gesichert.';
    toast(droppedWood ? 'Schreinerei und Möbel bleiben draußen. ' + saved : saved, droppedWood);
    render();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
