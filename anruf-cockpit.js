/* Anruf-Cockpit im CRM. Hängt sich an die vorhandenen Funktionen, ohne den Import anzufassen. */
(function () {
  'use strict';
  var R = window.AnrufRules;
  if (!R) { console.warn('Anruf-Regeln fehlen.'); return; }

  var PHASES = [
    { id: 'vorbereitung', num: '1', label: 'Vorbereitung' },
    { id: 'vorzimmer', num: '2', label: 'Vorzimmer' },
    { id: 'einstieg', num: '3', label: 'Einstieg' },
    { id: 'bedarf', num: '4', label: 'Bedarf' },
    { id: 'nutzen', num: '5', label: 'Nutzen' },
    { id: 'termin', num: '6', label: 'Termin' },
    { id: 'mailbox', num: '7', label: 'Mailbox' },
    { id: 'abschluss', num: '8', label: 'Abschluss' }
  ];
  var OBJECTIONS = [
    { id: 'kein-interesse', key: 'I', label: 'Kein Interesse', search: 'kein interesse' },
    { id: 'seite-reicht', key: 'R', label: 'Seite reicht', search: 'seite reicht zufrieden homepage' },
    { id: 'mail-schicken', key: 'M', label: 'Schicken Sie was', search: 'mail link unterlagen schicken' },
    { id: 'webdesigner', key: 'W', label: 'Haben Webdesigner', search: 'webdesigner agentur' },
    { id: 'neffe', key: 'N', label: 'Neffe macht das', search: 'neffe sohn bekannter' },
    { id: 'keine-zeit', key: 'Z', label: 'Keine Zeit', search: 'keine zeit kurz' },
    { id: 'keine-zeit-projekt', key: 'J', label: 'Keine Zeit für Projekt', search: 'projekt aufwand' },
    { id: 'kosten', key: 'C', label: 'Was kostet das?', search: 'preis kosten' },
    { id: 'teuer', key: 'T', label: 'Zu teuer', search: 'teuer budget' },
    { id: 'empfehlungen', key: 'E', label: 'Genug Empfehlungen', search: 'empfehlung mundpropaganda' },
    { id: 'woher-nummer', key: 'O', label: 'Woher Nummer?', search: 'nummer impressum wer sind sie' },
    { id: 'spaeter', key: 'L', label: 'Später nochmal', search: 'später monate wiedervorlage' },
    { id: 'social', key: 'F', label: 'Facebook / Instagram', search: 'facebook instagram social' },
    { id: 'nicht-mehr', key: 'X', label: 'Nicht mehr anrufen', search: 'nicht mehr anrufen sperre widerspruch', danger: true }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ico(name) { return typeof voSvg === 'function' ? voSvg(name, 16) : ''; }
  function script(inner) { return '<div class="anruf-script">' + inner + '</div>'; }
  function p(t) { return '<p>' + t + '</p>'; }
  function hint(t) { return '<p class="anruf-hint">' + t + '</p>'; }
  function ifThen(t) { return '<p class="anruf-if">' + t + '</p>'; }
  function token(fields, key, fallback) {
    var v = String(fields[key] || '').trim();
    if (v) return '<mark class="filled">' + esc(v) + '</mark>';
    return '<mark>[' + esc(fallback) + ']</mark>';
  }
  function fill(html, fields) {
    return html
      .replace(/\{\{ap\}\}/g, token(fields, 'person', 'Ansprechpartner'))
      .replace(/\{\{befund\}\}/g, token(fields, 'befund', 'Befund'))
      .replace(/\{\{slot1\}\}/g, token(fields, 'slot1', 'Slot 1'))
      .replace(/\{\{slot2\}\}/g, token(fields, 'slot2', 'Slot 2'))
      .replace(/\{\{firma\}\}/g, token(fields, 'firma', 'Firma'));
  }

  var CONTENT = {
    vorbereitung: {
      title: 'Vorbereitung', kicker: 'Phase 1 · vor dem Wählen',
      tabs: [
        { id: 'check', label: 'Checkliste', html: function () {
          return '<ul class="anruf-check"><li><strong>Name</strong> des Inhabers, Aussprache, Frau oder Herr</li><li><strong>Befund und Folge</strong> in einem Satz, Feld oben</li><li><strong>Kompliment</strong>, nur wenn es echt ist</li><li><strong>Referenz</strong> aus der gleichen Branche</li><li><strong>Entwurf-Link</strong> und Meet oder Zoom offen</li><li><strong>Zwei Slots</strong> oben eintragen</li></ul>' + hint('<strong>Ziel:</strong> 15-Minuten-Video. Am Telefon verkaufen Sie nur den Termin.');
        }},
        { id: 'anlass', label: 'Starker Anlass?', html: function () {
          return '<ul class="anruf-check"><li><strong>Anrufen:</strong> Formular defekt, „Nicht sicher“, Handy unbedienbar, veraltete Daten, Stelle ohne Bewerbungsweg</li><li><strong>Lieber nicht:</strong> nur „sieht alt aus“, Branche passt grob, Nummer ohne Blick auf die Seite</li></ul>' + hint('Im Stehen telefonieren. Die Rufnummer wird angezeigt, nicht unterdrückt.');
        }}
      ]
    },
    vorzimmer: {
      title: 'Vorzimmer', kicker: 'Phase 2 · Wegweiser, kein Hindernis',
      tabs: [
        { id: 'standard', label: 'Begrüßung', html: function () {
          return script(p('Guten Tag, Kim-Lukas Tobler von Viral Outlaws, ich bin Webdesigner. Ich rufe wegen Ihrer Homepage an. Mir ist aufgefallen, dass {{befund}}. Wer kümmert sich bei Ihnen um die Website, ist das {{ap}} selbst?')) + hint('Name des Vorzimmers, beste Zeit und Durchwahl in die Notiz.');
        }},
        { id: 'worum', label: 'Worum geht’s?', html: function () {
          return script(p('Ich habe mir die Seite angeschaut und für {{ap}} einen konkreten Verbesserungsvorschlag vorbereitet. Das sind zwei Minuten, dann kann er selbst entscheiden. Wann erreiche ich ihn am besten, eher morgens um acht oder am späten Nachmittag?')) + hint('Zwei Zeiten anbieten.');
        }},
        { id: 'mail', label: 'Schicken Sie eine Mail', html: function () {
          return script(p('Mache ich gern. An welche Adresse? Und an welchem Tag rufe ich dann nochmal kurz durch, damit es nicht untergeht?')) + hint('Die Mail ist dann angefordert. Unten als Rückruf mit Datum speichern.');
        }}
      ]
    },
    einstieg: {
      title: 'Einstieg', kicker: 'Phase 3 · erste 10–30 Sekunden',
      tabs: [
        { id: 'standard', label: 'Einstieg', html: function () {
          return script(p('Guten Tag, {{ap}}, hier ist Kim-Lukas Tobler, ich bin selbstständiger Webdesigner aus Woringen. Ich rufe Sie unangekündigt an, deshalb sage ich Ihnen gleich, warum: Ich bin bei einer Online-Recherche auf Ihre Homepage gestoßen, und mir ist aufgefallen, dass {{befund}}.') + p('Deshalb habe ich Ihnen einen Entwurf für eine neue Homepage gemacht, den ich Ihnen in zwei Minuten zeigen kann. Darf ich Ihnen kurz zwei Fragen dazu stellen?')) + hint('Nicht „Störe ich gerade?“ und nicht „Haben Sie kurz Zeit?“. „Um die Ecke“ nur bei echten Regionalkunden.');
        }},
        { id: 'verkaufen', label: 'Was wollen Sie verkaufen?', html: function () {
          return script(p('Ehrlich gesagt: Ich möchte Ihnen den Entwurf zeigen. Ob Sie dann etwas machen wollen, entscheiden Sie. Vorher eine Frage:')) + hint('Direkt weiter zu Bedarf, Taste 4.');
        }}
      ]
    },
    bedarf: {
      title: 'Bedarf', kicker: 'Phase 4 · zwei bis drei Fragen, dann zuhören',
      tabs: [
        { id: 'kern', label: 'Kernfragen', html: function () {
          return script(p('Wie kommen neue Kunden heute zu Ihnen: Empfehlung, Google oder Homepage?') + p('Haben Sie Ihre Seite mal auf dem Handy angeschaut?') + p('Wenn Sie eine Sache an der Homepage sofort ändern könnten, welche wäre das?')) + ifThen('Danach zusammenfassen') + script(p('Wenn ich Sie richtig verstehe, …')) + hint('Höchstens zwei bis drei Fragen. Er soll das Problem selbst aussprechen.');
        }},
        { id: 'weitere', label: 'Weitere Fragen', html: function () {
          return script(p('Wie viele Anfragen kommen ungefähr über die Website, im Vergleich zum Telefon?') + p('Wenn Sie „[Leistung] [Ort]“ googeln, wo tauchen Sie auf?') + p('Wer hat die Seite damals gemacht, und wer pflegt sie heute?')) + hint('Nur nehmen, wenn der Befund dazu passt.');
        }}
      ]
    },
    nutzen: {
      title: 'Nutzen', kicker: 'Phase 5 · 15–20 Sekunden',
      tabs: [
        { id: 'standard', label: 'Pitch', html: function () {
          return script(p('Genau dafür habe ich den Entwurf gebaut: [gelöster Befund]. Ähnlich habe ich das für eine Referenz aus der gleichen Branche gemacht. Alles persönlich aus einer Hand, ohne Baukasten.')) + hint('An seine Antwort anknüpfen, nicht an die Leistungsliste.');
        }}
      ]
    },
    termin: {
      title: 'Termin', kicker: 'Phase 6 · zwei Zeiten anbieten',
      tabs: [
        { id: 'fragen', label: 'Termin fragen', html: function () {
          return script(p('Am einfachsten zeige ich Ihnen den Entwurf kurz am Bildschirm, das dauert 15 Minuten. Sie müssen nichts vorbereiten, nur einen Link anklicken. Passt Ihnen eher {{slot1}} oder {{slot2}}?')) + hint('Den Entwurf nicht ohne Termin verschicken.');
        }},
        { id: 'zusage', label: 'Er sagt zu', html: function () {
          return script(p('Perfekt, [gewählte Zeit]. Ich schicke Ihnen gleich eine kurze Mail mit dem Link. An welche Adresse geht das am besten, und erreiche ich Sie unter dieser Nummer, falls etwas dazwischenkommt?')) + hint('Sofort bestätigen. Unten Termin mit Datum speichern. Die Mail geht erst, wenn Sie auf Mail senden tippen.');
        }},
        { id: 'jetzt', label: 'Jetzt gleich schauen', html: function () {
          return script(p('Sehr gern. Ich schicke Ihnen den Link per Mail oder WhatsApp, und wir schauen ihn gemeinsam an, während wir telefonieren.')) + hint('Link schicken und gemeinsam durchgehen.');
        }}
      ]
    },
    mailbox: {
      title: 'Mailbox', kicker: 'Phase 7 · ab Versuch 2, 20–30 Sekunden',
      tabs: [
        { id: 'erste', label: '1. Nachricht', html: function () {
          return script(p('Guten Tag, {{ap}}, hier ist Kim-Lukas Tobler, Webdesigner aus Woringen. Ich rufe an, weil mir auf Ihrer Homepage aufgefallen ist, dass {{befund}}. Ich habe Ihnen dazu einen Entwurf gemacht, den ich Ihnen in zwei Minuten zeigen kann. Sie erreichen mich unter 0163 – 904 – 79 – 58, ich wiederhole: 0163 – 904 – 79 – 58. Ich versuche es sonst am {{slot1}} noch einmal.')) + hint('Beim ersten Versuch eher auflegen. Nummer langsam und zweimal. Keine Mail ankündigen.');
        }},
        { id: 'zweite', label: '2. Nachricht', html: function () {
          return script(p('Guten Tag, {{ap}}, Kim-Lukas Tobler, ich hatte Ihnen wegen Ihrer Homepage aufs Band gesprochen. Der Entwurf ist fertig. Ich schlage 15 Minuten am {{slot1}} oder {{slot2}} vor. 0163 – 904 – 79 – 58, nochmal: 0163 – 904 – 79 – 58.')) + hint('Höchstens zwei Nachrichten. Unten als Mailbox speichern.');
        }}
      ]
    },
    abschluss: {
      title: 'Abschluss', kicker: 'Phase 8 · sofort nachlegen',
      tabs: [
        { id: 'check', label: 'Checkliste', html: function () {
          return '<ul class="anruf-check"><li><strong>Termin:</strong> Datum unten wählen, Einladung danach selbst senden</li><li><strong>Rückruf:</strong> Datum wählen, die Wiedervorlage entsteht dazu</li><li><strong>Sperre:</strong> sofort, dann nicht wieder anrufen</li><li><strong>Lead:</strong> bleibt ohne Kontakt, bis Sie übernehmen</li></ul>' + hint('Die Mail wird nie von allein verschickt.');
        }},
        { id: 'mail', label: 'Bestätigungsmail', html: function () {
          return ifThen('Nur vorbereiten, wenn der Termin steht oder die Mail angefordert ist') + '<div class="anruf-mail" id="anruf-mailtext"></div><button type="button" class="btn-ghost" id="anruf-copy-mail">Mailtext kopieren</button>' + hint('Der Text landet in der Zwischenablage. Senden passiert erst im Mailfenster.');
        }},
        { id: 'kein', label: 'Kein Interesse, höflich', html: function () {
          return script(p('Verstanden, danke für Ihre Zeit. Darf ich mich in sechs Monaten nochmal melden?')) + hint('Keinen Druck. Wiedervorlage nur, wenn Sie unten Rückruf mit Datum wählen.');
        }}
      ]
    }
  };

  var OBJ = {
    'kein-interesse': { title: 'Kein Interesse', html: function () {
      return script(p('Verstehe, Sie kennen mich ja auch noch nicht. Darf ich nur eine Frage stellen: Haben Sie das mit {{befund}} schon auf dem Schirm, oder hat die Website gerade einfach keine Priorität?')) + ifThen('Wenn er antwortet') + script(p('Der Entwurf ist ja schon fertig. Wenn er Ihnen nach zwei Minuten nicht gefällt, haben Sie nichts verloren. {{slot1}} oder {{slot2}}?')) + hint('Zustimmen, beim Befund bleiben, Frage, noch einmal der Termin.');
    }},
    'seite-reicht': { title: 'Seite reicht', html: function () {
      return script(p('Das ist gut, dann gibt es ja eine Basis. Darf ich fragen, woran Sie festmachen, dass sie reicht? Kommen darüber regelmäßig Anfragen rein?')) + ifThen('Wenn nein oder er es nicht weiß') + script(p('Genau da setzt der Entwurf an. Ich zeige Ihnen einfach den Vergleich. Wenn Ihre jetzige Seite danach immer noch reicht, sage ich Ihnen das ehrlich.'));
    }},
    'mail-schicken': { title: 'Schicken Sie mir was', html: function () {
      return script(p('Mache ich gern. Am meisten bringt der Entwurf, wenn ich Ihnen in zwei Minuten zeige, was ich warum geändert habe. Wir können ihn jetzt gleich zusammen anschauen. Oder lieber morgen früh in Ruhe?')) + ifThen('Besteht er auf der Mail') + script(p('In Ordnung. An welche Adresse? Ich schicke ihn heute noch. Wann rufe ich Sie kurz an, {{slot1}} oder {{slot2}}?')) + hint('Unten Rückruf mit dem vereinbarten Datum speichern. Die Mail senden Sie selbst.');
    }},
    webdesigner: { title: 'Wir haben schon einen Webdesigner', html: function () {
      return script(p('Gut, dann wissen Sie, wie wichtig das Thema ist. Ich will den gar nicht schlechtmachen. Darf ich fragen: Wann hat er die Seite zuletzt überarbeitet? Und wenn Sie eine Sache ändern könnten, welche wäre das?')) + script(p('Schauen Sie sich den Entwurf als zweite Meinung an. Kostet Sie 15 Minuten, und vielleicht ist eine Idee dabei, die Sie auch Ihrem Webdesigner geben können.'));
    }},
    neffe: { title: 'Neffe, Sohn oder Bekannter', html: function () {
      return script(p('Das ist praktisch, und günstiger geht’s kaum. Ehrliche Frage: Wie schnell bekommen Sie heute eine Änderung, wenn Sie zum Beispiel neue Öffnungszeiten brauchen?')) + script(p('Bei mir ist das mein Hauptgeschäft, ich antworte innerhalb von 24 Stunden. Schauen Sie sich den Entwurf trotzdem einfach an. Ob Sie ihn dann mit mir oder mit Ihrem Neffen umsetzen, entscheiden Sie.'));
    }},
    'keine-zeit': { title: 'Keine Zeit', html: function () {
      return script(p('Verstehe, Sie sind im Tagesgeschäft, deshalb halte ich es kurz. Wann passt es Ihnen diese Woche für 15 Minuten, eher früh um 7:30 Uhr oder am späten Nachmittag?'));
    }},
    'keine-zeit-projekt': { title: 'Keine Zeit für das Projekt', html: function () {
      return script(p('Das höre ich oft, und genau deshalb habe ich den Entwurf schon gemacht. Ihr Aufwand ist: einmal draufschauen, sagen was passt, ein paar Fotos schicken. Den Rest mache ich. Die meisten Seiten sind in etwa 2 bis 4 Wochen online. Wollen wir uns die 15 Minuten nehmen?'));
    }},
    kosten: { title: 'Was kostet das?', html: function () {
      return script(p('Das hängt vom Umfang ab, deshalb nenne ich ungern einen Fantasiepreis am Telefon. Im Termin zeige ich den Entwurf, danach bekommen Sie ein verbindliches Festpreis-Angebot, ohne Baukasten-Abo. Was wäre Ihnen wichtig, eher eine schlanke Seite oder etwas mit Terminbuchung?')) + hint('Keine Preisspanne am Telefon.');
    }},
    teuer: { title: 'Zu teuer / kein Budget', html: function () {
      return script(p('Verstehe. Darf ich fragen, verglichen womit? Mit einem Baukasten oder mit einem früheren Angebot?')) + script(p('Heute geht es nur um 15 Minuten. Wenn sich eine neue Seite für Sie nicht rechnet, sage ich Ihnen das ehrlich. Was ist Ihnen ein neuer Kunde ungefähr wert?')) + hint('Digitalbonus nur bei bayerischen Gewerbebetrieben erwähnen, nie als garantiert.');
    }},
    empfehlungen: { title: 'Genug Empfehlungen', html: function () {
      return script(p('Das ist das beste Zeichen für gute Arbeit. Was passiert, wenn jemand Sie empfohlen bekommt? Die meisten googeln Sie zuerst. Und dort sieht man gerade {{befund}}. Die Website ist die Visitenkarte für genau diese Empfehlungen.')) + script(p('Ich zeige Ihnen gern, wie das aussehen kann. {{slot1}} oder {{slot2}}?'));
    }},
    'woher-nummer': { title: 'Wer sind Sie? / Woher die Nummer?', html: function () {
      return script(p('Berechtigte Frage. Ich bin Kim-Lukas Tobler, selbstständiger Webdesigner, mein Büro ist in Woringen im Allgäu. Ihre Nummer steht im Impressum Ihrer Homepage. Ich rufe an, weil mir auf Ihrer Seite {{befund}} aufgefallen ist. Wenn Sie keine Anrufe wünschen, trage ich das sofort ein, dann hören Sie nichts mehr von mir.')) + hint('Bei einem klaren Nein unten auf Sperre.');
    }},
    spaeter: { title: 'In ein paar Monaten', html: function () {
      return script(p('Mache ich gern. Was ändert sich denn bis dahin bei Ihnen? Gut, dann melde ich mich am [Datum]. Darf ich Ihnen bis dahin den Link schicken?')) + hint('Unten Rückruf und das Datum eintragen.');
    }},
    social: { title: 'Wir sind auf Facebook oder Instagram', html: function () {
      return script(p('Social Media ist super für Bilder. Wenn aber jemand „[Leistung] [Ort]“ googelt, zeigt Google vor allem Websites und Google-Profile. Ich zeige Ihnen gern, wie eine schlanke Seite Ihre Bilder einbinden kann. Schauen wir es uns kurz an?'));
    }},
    'nicht-mehr': { title: 'Bitte nicht mehr anrufen', html: function () {
      return script(p('Verstanden, ich trage das ein, Sie hören nicht mehr von mir. Schönen Tag noch.')) + hint('Sofort unten auf Sperre. Das setzt den Sperrvermerk.');
    }}
  };

  var state = emptyState();
  function emptyState() {
    return {
      kind: 'new', contactId: null, leadId: null, override: false,
      view: { type: 'phase', id: 'einstieg' }, lastPhase: 'einstieg', tab: {}, objection: null,
      fields: { firma: '', person: '', tel: '', email: '', note: '', befund: '', slot1: '', slot2: '' }
    };
  }

  function ensure() {
    if (typeof DB === 'undefined') return;
    if (!Array.isArray(DB.anrufe)) DB.anrufe = [];
    if (!Array.isArray(DB.callLeads)) DB.callLeads = [];
    if (!DB.settings) DB.settings = {};
  }
  function cloudOn() {
    return !window.__ANRUF_DEMO && typeof _currentUser !== 'undefined' && _currentUser && !!ws();
  }
  function ws() {
    if (typeof _currentWorkspace !== 'undefined' && _currentWorkspace && _currentWorkspace.id) return _currentWorkspace.id;
    return typeof _FALLBACK_WORKSPACE_ID !== 'undefined' ? _FALLBACK_WORKSPACE_ID : null;
  }
  function maxAttempts() { ensure(); return R.clampMax(DB.settings && DB.settings.anrufMax); }
  function contactById(id) { ensure(); return (DB.contacts || []).find(function (c) { return c.id === id; }) || null; }
  function leadById(id) { ensure(); return (DB.callLeads || []).find(function (l) { return l.id === id; }) || null; }
  function callsOfContact(id) { ensure(); return DB.anrufe.filter(function (a) { return a.contactId === id; }); }
  function callsOfLead(id) { ensure(); return DB.anrufe.filter(function (a) { return a.leadId === id; }); }
  function latest(list) {
    return list.slice().sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); })[0] || null;
  }
  function when(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return String(iso); }
  }
  function resultBadge(result) {
    var cls = { 'Termin': 'badge-termin', 'Rückruf': 'badge-kontakt', 'Kein Interesse': 'badge-absage', 'Mailbox/nicht erreicht': 'badge-offen', 'Sperre': 'badge-absage' }[result] || 'badge-offen';
    return '<span class="badge ' + cls + '">' + esc(result || '') + '</span>';
  }
  function historyHtml(list) {
    if (!list.length) return '<div class="anruf-empty">Noch kein Anruf.</div>';
    return '<ul class="anruf-history">' + list.slice().sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); }).slice(0, 8).map(function (a) {
      return '<li><span>' + esc(when(a.createdAt)) + '</span> ' + resultBadge(a.result) +
        (a.objection ? '<em>' + esc(a.objection) + '</em>' : '') +
        (a.note ? '<p>' + esc(a.note) + '</p>' : '') +
        (a.nextDate ? '<small>Nächster Schritt ' + esc(typeof fmtDate === 'function' ? fmtDate(a.nextDate) : a.nextDate) + (a.zeit ? ' · ' + esc(a.zeit) : '') + '</small>' : '') +
        '</li>';
    }).join('') + '</ul>';
  }
  function counterHtml(count) {
    var max = maxAttempts();
    var hot = count >= max ? ' anruf-count-hot' : '';
    return '<span class="anruf-count' + hot + '">' + esc(R.attemptLabel(count, max)) + '</span>';
  }

  function mapCall(r) {
    return {
      id: r.id, contactId: r.contact_id || null, leadId: r.lead_id || null, createdAt: r.created_at,
      result: r.result, objection: r.objection || '', note: r.note || '', nextStep: r.next_step || '',
      nextDate: r.next_date || '', befund: r.befund || '', slot1: r.slot1 || '', slot2: r.slot2 || '',
      zeit: r.zeit || '', wiedervorlageId: r.wiedervorlage_id || null, kalEventId: r.kal_event_id || null
    };
  }
  function mapLead(r) {
    return {
      id: r.id, firma: r.firma || '', person: r.person || '', tel: r.tel || '', email: r.email || '',
      note: r.note || '', doNotCall: !!r.do_not_call, sperreSeit: r.sperre_seit || null,
      convertedContactId: r.converted_contact_id || null, createdAt: r.created_at
    };
  }
  function rowCall(a) {
    return {
      id: a.id, workspace_id: ws(), contact_id: a.contactId || null, lead_id: a.leadId || null,
      created_at: a.createdAt, result: a.result, objection: a.objection || null, note: a.note || null,
      next_step: a.nextStep || null, next_date: a.nextDate || null, befund: a.befund || null,
      slot1: a.slot1 || null, slot2: a.slot2 || null, zeit: a.zeit || null,
      wiedervorlage_id: a.wiedervorlageId || null, kal_event_id: a.kalEventId || null
    };
  }
  function rowLead(l) {
    return {
      id: l.id, workspace_id: ws(), firma: l.firma, person: l.person || null, tel: l.tel || null,
      email: l.email || null, note: l.note || null, do_not_call: !!l.doNotCall,
      sperre_seit: l.sperreSeit || null, converted_contact_id: l.convertedContactId || null,
      updated_at: new Date().toISOString()
    };
  }
  async function cloudUpsert(table, row) {
    if (!cloudOn() || typeof getSupabase !== 'function') return true;
    try {
      var sb = await getSupabase();
      var res = await sb.from(table).upsert(row);
      if (res.error) {
        console.warn(table, res.error.message);
        if (typeof haptikToast === 'function') haptikToast(table === 'anrufe' ? 'Anruf lokal, Datenbank noch ohne Tabelle' : 'Speichern unvollständig', 'bad');
        return false;
      }
      return true;
    } catch (e) { console.warn(e); return false; }
  }
  async function anrufPull() {
    ensure();
    if (!cloudOn() || typeof getSupabase !== 'function' || !ws()) return;
    try {
      var sb = await getSupabase();
      var calls = await sb.from('anrufe').select('*').eq('workspace_id', ws()).order('created_at', { ascending: false }).limit(1000);
      var leads = await sb.from('call_leads').select('*').eq('workspace_id', ws()).order('created_at', { ascending: false }).limit(1000);
      if (!calls.error && Array.isArray(calls.data)) {
        var seen = {};
        DB.anrufe = calls.data.map(mapCall);
        DB.anrufe.forEach(function (a) { seen[a.id] = 1; });
      }
      if (!leads.error && Array.isArray(leads.data)) DB.callLeads = leads.data.map(mapLead);
      try { localStorage.setItem('vo_crm', JSON.stringify(DB)); } catch (e) {}
    } catch (e) { console.warn('anrufPull', e); }
  }

  function openLeads() {
    ensure();
    return DB.callLeads.filter(function (l) { return !l.convertedContactId; }).sort(function (a, b) {
      var at = latest(callsOfLead(a.id)), bt = latest(callsOfLead(b.id));
      var aHot = at && at.result === 'Termin' ? 1 : 0;
      var bHot = bt && bt.result === 'Termin' ? 1 : 0;
      if (aHot !== bHot) return bHot - aHot;
      return String((bt && bt.createdAt) || b.createdAt || '').localeCompare(String((at && at.createdAt) || a.createdAt || ''));
    });
  }

  function renderBoard() {
    ensure();
    var host = document.getElementById('anruf-lead-list');
    var maxSel = document.getElementById('anruf-max');
    if (maxSel) maxSel.value = String(maxAttempts());
    if (!host) return;
    var leads = openLeads();
    if (!leads.length) {
      host.innerHTML = '<div class="empty-state dash-card"><p>Noch keine Anrufe ohne Kontakt.</p><p>Mit „Neuer Anruf“ erfassen Sie Firma, Person, Telefon und E-Mail. Daraus wird kein Kontakt, bis Sie übernehmen.</p></div>';
      return;
    }
    host.innerHTML = leads.map(function (l) {
      var calls = callsOfLead(l.id);
      var last = latest(calls);
      var termin = last && last.result === 'Termin';
      var hot = termin ? ' anruf-promote-hot' : '';
      return '<article class="dash-card anruf-lead' + (termin ? ' is-termin' : '') + (l.doNotCall ? ' is-sperre' : '') + '" data-lead="' + esc(l.id) + '">' +
        '<div class="anruf-lead-top"><div><strong>' + esc(l.firma) + '</strong> ' + counterHtml(calls.length) +
        (l.doNotCall ? ' <span class="badge badge-absage">Sperre</span>' : '') +
        (last ? ' ' + resultBadge(last.result) : '') +
        '</div><div class="anruf-meta">' + esc([l.person, l.tel, l.email].filter(Boolean).join(' · ')) + '</div>' +
        (l.note ? '<p class="anruf-note">' + esc(l.note) + '</p>' : '') +
        '</div>' + historyHtml(calls) +
        '<div class="anruf-lead-actions">' +
        '<button type="button" class="' + (termin ? 'btn-yellow' : 'btn-ghost') + hot + '" data-act="promote">' + ico('user') + '<span>Als Kontakt übernehmen</span></button>' +
        '<button type="button" class="btn-ghost" data-act="mail">' + ico('mail') + '<span>Mail senden</span></button>' +
        '<button type="button" class="btn-ghost" data-act="call">' + ico('call') + '<span>Anruf starten</span></button>' +
        '</div></article>';
    }).join('');
  }

  function mountContact(cid) {
    var host = document.getElementById('contact-detail-content');
    var c = contactById(cid);
    if (!host || !c) return;
    host.querySelectorAll('.anruf-history-card,.anruf-start-btn,.anruf-sperre-inline').forEach(function (n) { n.remove(); });
    var calls = callsOfContact(cid);
    var card = document.createElement('div');
    card.className = 'dash-card anruf-history-card';
    card.innerHTML = '<div class="anruf-lead-top"><h3>Anrufe</h3><div>' + counterHtml(calls.length) +
      (c.doNotCall ? ' <span class="badge badge-absage">Sperre' + (c.sperreSeit && typeof fmtDate === 'function' ? ' seit ' + esc(fmtDate(c.sperreSeit)) : '') + '</span>' : '') +
      '</div></div>' + historyHtml(calls) +
      '<div class="anruf-lead-actions"><button type="button" class="btn-yellow anruf-start-btn" data-act="call">' + ico('call') + '<span>Anruf starten</span></button></div>';
    card.querySelector('[data-act="call"]').onclick = function () { openContact(cid); };
    var grid = host.querySelector('div[style*="grid-template-columns"]');
    var left = grid && grid.firstElementChild;
    if (left) {
      var header = left.querySelector('.dash-card');
      if (header) header.insertAdjacentElement('afterend', card);
      else left.prepend(card);
    } else host.prepend(card);
    var editBtn = left && [...left.querySelectorAll('.dash-card button')].find(function (b) { return /openContactModal/.test(b.getAttribute('onclick') || ''); });
    var actions = editBtn && editBtn.parentElement;
    if (actions && window.innerWidth > 800 && !actions.querySelector('.anruf-start-btn')) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-yellow btn-sm anruf-start-btn';
      btn.innerHTML = ico('call') + '<span>Anruf</span>';
      btn.onclick = function () { openContact(cid); };
      actions.prepend(btn);
    }
    if (c.doNotCall) {
      var badgeHost = left && left.querySelector('.dash-card div[style*="flex-wrap"]');
      if (badgeHost && !badgeHost.querySelector('.anruf-sperre-inline')) {
        var b = document.createElement('span');
        b.className = 'badge badge-absage anruf-sperre-inline';
        b.textContent = 'Sperre';
        badgeHost.prepend(b);
      }
    }
  }

  function markRows() {
    ensure();
    (DB.contacts || []).forEach(function (c) {
      if (!c.doNotCall) return;
      var tr;
      try { tr = document.querySelector('#contacts-tbody tr[onclick*="' + CSS.escape(String(c.id)) + '"]'); }
      catch (e) { tr = null; }
      if (!tr || tr.querySelector('.anruf-sperre-badge')) return;
      var cell = tr.querySelector('td[data-label="Firma"]');
      if (!cell) return;
      var b = document.createElement('span');
      b.className = 'badge badge-absage anruf-sperre-badge';
      b.textContent = 'Sperre';
      b.style.marginLeft = '6px';
      cell.appendChild(b);
    });
  }

  function gate(entity) {
    if (!entity || !entity.doNotCall) return true;
    var since = entity.sperreSeit && typeof fmtDate === 'function' ? ' seit ' + fmtDate(entity.sperreSeit) : '';
    return confirm('Sperre' + since + '. Dieser Betrieb möchte nicht angerufen werden. Cockpit trotzdem öffnen?');
  }

  function lastFields(calls, base) {
    var last = latest(calls);
    return {
      firma: base.firma || '',
      person: base.person || '',
      tel: base.tel || '',
      email: base.email || '',
      note: base.note || '',
      befund: (last && last.befund) || base.befund || '',
      slot1: (last && last.slot1) || '',
      slot2: (last && last.slot2) || ''
    };
  }

  function openContact(id) {
    var c = contactById(id);
    if (!c) return;
    if (!gate(c)) return;
    state = emptyState();
    state.kind = 'contact';
    state.contactId = id;
    state.override = !!c.doNotCall;
    state.fields = lastFields(callsOfContact(id), c);
    showCockpit();
  }
  function openLead(id) {
    var l = leadById(id);
    if (!l || l.convertedContactId) {
      if (l && l.convertedContactId) openContact(l.convertedContactId);
      return;
    }
    if (!gate(l)) return;
    state = emptyState();
    state.kind = 'lead';
    state.leadId = id;
    state.override = !!l.doNotCall;
    state.fields = lastFields(callsOfLead(id), l);
    showCockpit();
  }
  function openNew() {
    state = emptyState();
    state.kind = 'new';
    showCockpit();
  }

  function shell() {
    if (document.getElementById('anruf-cockpit')) return;
    var el = document.createElement('div');
    el.id = 'anruf-cockpit';
    el.hidden = true;
    el.innerHTML = '<header class="anruf-top"><div class="anruf-top-row"><button type="button" class="btn-ghost" id="anruf-back">' + ico('back') + '<span>Zurück</span></button><div class="anruf-brand"><div class="anruf-kicker">Viral Outlaws</div><div id="anruf-live"></div></div><a id="anruf-dial" class="btn-yellow" hidden>' + ico('call') + '<span>Wählen</span></a><div id="anruf-count"></div></div><div id="anruf-banner" class="anruf-banner" hidden></div><div class="anruf-fields" id="anruf-fields"></div><div class="anruf-phases" id="anruf-phases"></div><p class="anruf-keys">Tasten 1–8 Phasen · Buchstabe Einwand · / Suche</p></header><div class="anruf-body"><article class="dash-card anruf-card" id="anruf-card"></article><aside class="dash-card anruf-side"><label class="anruf-search-label" for="anruf-search">Einwand</label><input id="anruf-search" type="search" placeholder="Suchen, Taste /" autocomplete="off"><div id="anruf-objs"></div><button type="button" class="btn-ghost" id="anruf-obj-back" hidden>' + ico('back') + '<span>Zurück zum Gespräch</span></button></aside></div><footer class="anruf-foot dash-card"><div id="anruf-after" hidden></div><div id="anruf-log"><input id="anruf-call-note" type="text" placeholder="Kurze Notiz zu diesem Anruf" autocomplete="off"><div class="anruf-when"><label>Datum<input id="anruf-date" type="date"></label><label>Uhrzeit<input id="anruf-time" type="time"></label></div><div class="anruf-results" id="anruf-results"></div></div></footer>';
    document.body.appendChild(el);
    el.querySelector('#anruf-back').onclick = closeCockpit;
    el.querySelector('#anruf-phases').innerHTML = PHASES.map(function (ph) {
      return '<button type="button" class="anruf-phase" data-phase="' + ph.id + '"><kbd>' + ph.num + '</kbd>' + esc(ph.label) + '</button>';
    }).join('');
    el.querySelector('#anruf-objs').innerHTML = OBJECTIONS.map(function (o) {
      return '<button type="button" class="anruf-obj' + (o.danger ? ' danger' : '') + '" data-obj="' + o.id + '" data-search="' + esc(o.search + ' ' + o.label) + '"><kbd>' + o.key + '</kbd>' + esc(o.label) + '</button>';
    }).join('');
    el.querySelector('#anruf-results').innerHTML = R.RESULTS.map(function (name) {
      var cls = name === 'Sperre' ? 'btn-danger' : (name === 'Termin' ? 'btn-yellow' : 'btn-ghost');
      return '<button type="button" class="' + cls + '" data-result="' + esc(name) + '">' + esc(name) + '</button>';
    }).join('');
    el.addEventListener('click', onCockpitClick);
    el.addEventListener('input', onCockpitInput);
    el.querySelector('#anruf-obj-back').onclick = function () { goPhase(state.lastPhase || 'einstieg'); };
  }

  function showCockpit() {
    shell();
    var root = document.getElementById('anruf-cockpit');
    root.hidden = false;
    document.body.classList.add('anruf-open');
    paintFields();
    paintCard();
    var banner = document.getElementById('anruf-banner');
    if (state.override) {
      banner.hidden = false;
      banner.textContent = 'Sperre ist gesetzt. Sie haben das Öffnen bestätigt.';
    } else banner.hidden = true;
    document.getElementById('anruf-after').hidden = true;
    document.getElementById('anruf-log').hidden = false;
  }
  function closeCockpit() {
    var root = document.getElementById('anruf-cockpit');
    if (root) root.hidden = true;
    document.body.classList.remove('anruf-open');
    if (document.getElementById('page-telefon') && document.getElementById('page-telefon').classList.contains('active')) renderBoard();
    if (state.contactId && document.getElementById('page-contact-detail') && document.getElementById('page-contact-detail').classList.contains('active') && typeof renderContactDetail === 'function') {
      renderContactDetail(state.contactId);
    }
  }

  function paintFields() {
    var f = state.fields;
    var locked = state.kind === 'contact';
    var html = '';
    if (locked) {
      html += '<div class="anruf-id"><strong>' + esc(f.firma) + '</strong><span>' + esc(f.person) + '</span><span>' + esc(f.email) + '</span></div>';
    } else {
      html += field('Firma', 'firma', f.firma, 'text') + field('Ansprechpartner', 'person', f.person, 'text') + field('Telefon', 'tel', f.tel, 'tel') + field('E-Mail', 'email', f.email, 'email');
    }
    html += '<label class="anruf-field anruf-field-wide">Befund<textarea id="anruf-f-befund" rows="2">' + esc(f.befund) + '</textarea></label>';
    html += field('Slot 1', 'slot1', f.slot1, 'text') + field('Slot 2', 'slot2', f.slot2, 'text');
    if (!locked) html += '<label class="anruf-field anruf-field-wide">Notiz zum Betrieb<textarea id="anruf-f-note" rows="2">' + esc(f.note) + '</textarea></label>';
    document.getElementById('anruf-fields').innerHTML = html;
    var live = [f.firma, f.person].filter(Boolean).join(' · ');
    document.getElementById('anruf-live').textContent = live || 'Neuer Anruf, noch kein Kontakt';
    var dial = document.getElementById('anruf-dial');
    if (f.tel) { dial.hidden = false; dial.href = 'tel:' + f.tel; }
    else dial.hidden = true;
    var count = state.contactId ? callsOfContact(state.contactId).length : (state.leadId ? callsOfLead(state.leadId).length : 0);
    document.getElementById('anruf-count').innerHTML = counterHtml(count);
  }
  function field(label, key, value, type) {
    return '<label class="anruf-field">' + esc(label) + '<input id="anruf-f-' + key + '" type="' + type + '" value="' + esc(value) + '"></label>';
  }
  function readFields() {
    ['firma', 'person', 'tel', 'email', 'slot1', 'slot2'].forEach(function (key) {
      var el = document.getElementById('anruf-f-' + key);
      if (el) state.fields[key] = el.value;
    });
    var befund = document.getElementById('anruf-f-befund');
    var note = document.getElementById('anruf-f-note');
    if (befund) state.fields.befund = befund.value;
    if (note) state.fields.note = note.value;
    var live = [state.fields.firma, state.fields.person].filter(Boolean).join(' · ');
    var liveEl = document.getElementById('anruf-live');
    if (liveEl) liveEl.textContent = live || (state.kind === 'contact' ? '' : 'Neuer Anruf, noch kein Kontakt');
  }

  function paintCard() {
    readFields();
    var card = document.getElementById('anruf-card');
    var back = document.getElementById('anruf-obj-back');
    if (!card) return;
    var html;
    if (state.view.type === 'objection') {
      back.hidden = false;
      var obj = OBJ[state.view.id];
      html = '<div class="anruf-card-head"><span>Einwand</span><h2>' + esc(obj.title) + '</h2></div>' + fill(obj.html(), state.fields);
    } else {
      back.hidden = true;
      var phase = CONTENT[state.view.id];
      var tabs = phase.tabs;
      var tabId = state.tab[state.view.id] || tabs[0].id;
      var tab = tabs.filter(function (t) { return t.id === tabId; })[0] || tabs[0];
      var tabBar = tabs.length > 1 ? '<div class="anruf-tabs">' + tabs.map(function (t) {
        return '<button type="button" class="anruf-tab' + (t.id === tab.id ? ' active' : '') + '" data-tab="' + t.id + '">' + esc(t.label) + '</button>';
      }).join('') + '</div>' : '';
      html = '<div class="anruf-card-head"><span>' + esc(phase.kicker) + '</span><h2>' + esc(phase.title) + '</h2></div>' + tabBar + fill(tab.html(), state.fields);
    }
    card.innerHTML = html;
    document.querySelectorAll('#anruf-phases .anruf-phase').forEach(function (b) {
      b.classList.toggle('active', state.view.type === 'phase' && b.getAttribute('data-phase') === state.view.id);
    });
    document.querySelectorAll('#anruf-objs .anruf-obj').forEach(function (b) {
      b.classList.toggle('active', state.view.type === 'objection' && b.getAttribute('data-obj') === state.view.id);
    });
    var mail = document.getElementById('anruf-mailtext');
    if (mail) {
      var draft = R.mailDraft({ firma: state.fields.firma, person: state.fields.person }, {
        result: 'Termin', slot1: state.fields.slot1, nextDate: document.getElementById('anruf-date') ? document.getElementById('anruf-date').value : ''
      }, (DB.settings && DB.settings.tel) || '');
      mail.textContent = 'Betreff: ' + draft.subject + '\n\n' + draft.body;
    }
    var copy = document.getElementById('anruf-copy-mail');
    if (copy) copy.onclick = function () {
      var text = document.getElementById('anruf-mailtext').textContent;
      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
      if (typeof haptikToast === 'function') haptikToast('Mailtext kopiert');
    };
  }
  function goPhase(id) {
    state.view = { type: 'phase', id: id };
    state.lastPhase = id;
    paintCard();
    var stage = document.querySelector('.anruf-body');
    if (stage) stage.scrollTop = 0;
  }
  function goObj(id) {
    if (state.view.type === 'phase') state.lastPhase = state.view.id;
    state.view = { type: 'objection', id: id };
    var meta = OBJECTIONS.filter(function (o) { return o.id === id; })[0];
    state.objection = meta ? meta.label : id;
    paintCard();
    var stage = document.querySelector('.anruf-body');
    if (stage) stage.scrollTop = 0;
  }

  function onCockpitClick(e) {
    var phase = e.target.closest('[data-phase]');
    if (phase) { goPhase(phase.getAttribute('data-phase')); return; }
    var obj = e.target.closest('[data-obj]');
    if (obj) { goObj(obj.getAttribute('data-obj')); return; }
    var tab = e.target.closest('[data-tab]');
    if (tab && state.view.type === 'phase') { state.tab[state.view.id] = tab.getAttribute('data-tab'); paintCard(); return; }
    var result = e.target.closest('[data-result]');
    if (result) saveResult(result.getAttribute('data-result'));
  }
  function onCockpitInput(e) {
    if (e.target.id === 'anruf-search') { filterObj(e.target.value); return; }
    readFields();
    if (state.view.type === 'phase' || state.view.type === 'objection') paintCard();
  }
  function filterObj(q) {
    q = String(q || '').trim().toLowerCase();
    document.querySelectorAll('#anruf-objs .anruf-obj').forEach(function (b) {
      var hay = (b.getAttribute('data-search') || '').toLowerCase();
      b.hidden = !!(q && hay.indexOf(q) < 0);
    });
  }

  function typing(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
  }
  function onKey(e) {
    var root = document.getElementById('anruf-cockpit');
    if (!root || root.hidden) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var search = document.getElementById('anruf-search');
    var inSearch = document.activeElement === search;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (inSearch && search.value) { search.value = ''; filterObj(''); return; }
      if (typing(document.activeElement)) { document.activeElement.blur(); return; }
      if (state.view.type === 'objection') goPhase(state.lastPhase || 'einstieg');
      return;
    }
    if (!typing(document.activeElement) && e.key === '/') {
      e.preventDefault();
      search.focus();
      search.select();
      return;
    }
    if (inSearch && e.key === 'Enter') {
      e.preventDefault();
      var first = document.querySelector('#anruf-objs .anruf-obj:not([hidden])');
      if (first) { search.blur(); search.value = ''; filterObj(''); goObj(first.getAttribute('data-obj')); }
      return;
    }
    if (typing(document.activeElement)) return;
    if (e.key >= '1' && e.key <= '8') {
      e.preventDefault();
      var phase = PHASES[parseInt(e.key, 10) - 1];
      if (phase) goPhase(phase.id);
      return;
    }
    if (e.key.length === 1) {
      var hit = OBJECTIONS.filter(function (o) { return o.key === e.key.toUpperCase(); })[0];
      if (hit) { e.preventDefault(); goObj(hit.id); }
    }
  }

  async function saveResult(result) {
    readFields();
    if (result === 'Sperre' && !confirm('Sperre setzen? Dieser Betrieb wird nicht mehr angerufen.')) return;
    var plan = R.planSave({
      result: result,
      hasTarget: state.kind === 'contact' || !!String(state.fields.firma || '').trim(),
      firma: state.fields.firma,
      email: state.kind === 'contact' ? '' : state.fields.email,
      nextDate: document.getElementById('anruf-date').value,
      zeit: document.getElementById('anruf-time').value
    });
    if (!plan.ok) { alert(plan.error); return; }
    ensure();
    var contact = state.contactId ? contactById(state.contactId) : null;
    var lead = state.leadId ? leadById(state.leadId) : null;
    if (!contact) {
      if (!lead) {
        var match = R.matchOpenLead(state.fields, DB.callLeads);
        if (match) {
          lead = leadById(match);
          if (lead && lead.doNotCall && !state.override && !gate(lead)) return;
          state.leadId = lead.id;
          state.kind = 'lead';
          if (typeof haptikToast === 'function') haptikToast('Dem bestehenden Lead zugeordnet');
        } else {
          lead = {
            id: uid(), firma: state.fields.firma.trim(), person: state.fields.person.trim(),
            tel: state.fields.tel.trim(), email: state.fields.email.trim(), note: state.fields.note.trim(),
            doNotCall: false, sperreSeit: null, convertedContactId: null, createdAt: new Date().toISOString()
          };
          DB.callLeads.unshift(lead);
          state.leadId = lead.id;
          state.kind = 'lead';
        }
      }
      lead.firma = state.fields.firma.trim() || lead.firma;
      lead.person = state.fields.person.trim();
      lead.tel = state.fields.tel.trim();
      lead.email = state.fields.email.trim();
      lead.note = state.fields.note.trim();
    }
    var callNote = document.getElementById('anruf-call-note').value.trim();
    var call = {
      id: uid(),
      contactId: contact ? contact.id : null,
      leadId: contact ? null : lead.id,
      createdAt: new Date().toISOString(),
      result: result,
      objection: state.objection || '',
      note: callNote,
      nextStep: plan.nextStep,
      nextDate: plan.nextDate || '',
      befund: state.fields.befund.trim(),
      slot1: state.fields.slot1.trim(),
      slot2: state.fields.slot2.trim(),
      zeit: plan.zeit || '',
      wiedervorlageId: null,
      kalEventId: null
    };
    var firma = contact ? contact.firma : lead.firma;
    var person = contact ? contact.person : lead.person;
    if (plan.wiedervorlage) {
      if (!DB.wiedervorlagen) DB.wiedervorlagen = [];
      var wv = { id: uid(), kontaktId: contact ? contact.id : null, text: R.wiedervorlageText(firma, person), datum: plan.wiedervorlage.datum, typ: 'anruf', done: false, createdAt: new Date().toISOString() };
      DB.wiedervorlagen.push(wv);
      call.wiedervorlageId = wv.id;
      if (typeof sbSaveWv === 'function') sbSaveWv(wv);
    }
    if (plan.termin) {
      if (!DB.kalEvents) DB.kalEvents = [];
      var ev = { id: uid(), titel: R.terminTitel(firma), datum: plan.termin.datum, zeit: plan.termin.zeit || '', bis: '', typ: 'termin', kontaktId: contact ? contact.id : null, notiz: state.fields.befund.trim(), reminder: false };
      DB.kalEvents.push(ev);
      call.kalEventId = ev.id;
      if (typeof sbSaveKalEvent === 'function') sbSaveKalEvent(ev);
      if (typeof renderKalender === 'function') { try { renderKalender(); } catch (e) {} }
    }
    if (plan.sperre) {
      var since = new Date().toISOString();
      if (contact) { contact.doNotCall = true; contact.sperreSeit = since; contact.updatedAt = since; if (typeof sbSaveContact === 'function') sbSaveContact(contact); }
      if (lead) { lead.doNotCall = true; lead.sperreSeit = since; }
    }
    if (contact && (plan.termin || plan.wiedervorlage)) {
      contact.naechsterSchritt = (plan.termin || plan.wiedervorlage).datum;
      contact.naechsterSchrittText = plan.nextStep;
      if (plan.termin && contact.status === 'lead') contact.status = 'erstgespraech';
      contact.updatedAt = new Date().toISOString();
      if (typeof sbSaveContact === 'function') sbSaveContact(contact);
    }
    DB.anrufe.unshift(call);
    if (lead) await cloudUpsert('call_leads', rowLead(lead));
    await cloudUpsert('anrufe', rowCall(call));
    if (typeof save === 'function') save();
    if (typeof addActivity === 'function') addActivity('Anruf ' + result + ' · ' + firma, plan.sperre ? 'red' : 'yellow');
    document.getElementById('anruf-call-note').value = '';
    paintFields();
    if (!contact && result === 'Termin') showAfter(lead, call);
    else {
      if (typeof haptikToast === 'function') haptikToast(result + ' gespeichert');
      closeCockpit();
      if (!contact && typeof showPage === 'function') showPage('telefon');
    }
  }

  function showAfter(lead, call) {
    var box = document.getElementById('anruf-after');
    document.getElementById('anruf-log').hidden = true;
    box.hidden = false;
    box.innerHTML = '<p><strong>Termin gespeichert.</strong> ' + esc(lead.firma) + ' ist noch kein Kontakt.</p><div class="anruf-lead-actions"><button type="button" class="btn-yellow anruf-promote-hot" id="anruf-after-promote">' + ico('user') + '<span>Als Kontakt übernehmen</span></button><button type="button" class="btn-ghost" id="anruf-after-mail">' + ico('mail') + '<span>Mail senden</span></button><button type="button" class="btn-ghost" id="anruf-after-done">Später</button></div>';
    document.getElementById('anruf-after-promote').onclick = function () { promote(lead.id, null); };
    document.getElementById('anruf-after-mail').onclick = function () { promote(lead.id, call); };
    document.getElementById('anruf-after-done').onclick = function () {
      closeCockpit();
      if (typeof showPage === 'function') showPage('telefon');
    };
  }

  async function promote(leadId, mailCall) {
    ensure();
    var lead = leadById(leadId);
    if (!lead) return null;
    var contact = lead.convertedContactId ? contactById(lead.convertedContactId) : null;
    if (!contact) {
      contact = {
        id: uid(), firma: lead.firma, person: lead.person || '', tel: lead.tel || '', email: lead.email || '',
        str: '', plz: '', ort: '', web: '', instagram: '', facebook: '', gbusiness: '', branche: '',
        status: 'lead', quelle: 'kaltakquise', notes: lead.note || '', ana: '', photo: '',
        notizen: [], dokumente: [], checks: [], archiviert: false,
        doNotCall: !!lead.doNotCall, sperreSeit: lead.sperreSeit || null,
        naechsterSchritt: null, naechsterSchrittText: '',
        updatedAt: new Date().toISOString(), createdAt: new Date().toISOString()
      };
      DB.contacts.unshift(contact);
      if (typeof sbSaveContact === 'function') await sbSaveContact(contact);
      lead.convertedContactId = contact.id;
      var calls = callsOfLead(lead.id);
      calls.forEach(function (a) { a.contactId = contact.id; });
      for (var i = 0; i < calls.length; i++) {
        var a = calls[i];
        if (a.wiedervorlageId && DB.wiedervorlagen) {
          var w = DB.wiedervorlagen.find(function (x) { return x.id === a.wiedervorlageId; });
          if (w) { w.kontaktId = contact.id; if (typeof sbSaveWv === 'function') sbSaveWv(w); }
        }
        if (a.kalEventId && DB.kalEvents) {
          var ev = DB.kalEvents.find(function (x) { return x.id === a.kalEventId; });
          if (ev) { ev.kontaktId = contact.id; if (typeof sbSaveKalEvent === 'function') sbSaveKalEvent(ev); }
        }
        await cloudUpsert('anrufe', rowCall(a));
      }
      await cloudUpsert('call_leads', rowLead(lead));
      if (typeof save === 'function') save();
      if (typeof addActivity === 'function') addActivity('Kontakt aus Anruf übernommen: ' + contact.firma, 'blue');
    }
    closeCockpit();
    if (mailCall) openMail(contact, mailCall);
    else if (typeof openContactDetail === 'function') openContactDetail(contact.id);
    if (typeof haptikToast === 'function') haptikToast(mailCall ? 'Kontakt verknüpft, Mail liegt bereit' : 'Als Kontakt übernommen');
    return contact;
  }

  function openMail(contact, call) {
    if (typeof openEmailCompose !== 'function') return;
    openEmailCompose(contact.id);
    var draft = R.mailDraft(contact, call || latest(callsOfContact(contact.id)) || {}, (DB.settings && DB.settings.tel) || '');
    var to = document.getElementById('em-to');
    var sub = document.getElementById('em-subject');
    var body = document.getElementById('em-body');
    if (to && !to.value) to.value = contact.email || '';
    if (sub) sub.value = draft.subject;
    if (body) body.value = draft.body;
  }

  function injectChrome() {
    if (!document.getElementById('page-telefon')) {
      var page = document.createElement('div');
      page.className = 'page';
      page.id = 'page-telefon';
      page.innerHTML = '<div class="dash-card anruf-board-head"><div><h3>Telefon</h3><p>Anrufe ohne Kontakt bleiben hier. Ein Kontakt entsteht erst mit „Als Kontakt übernehmen“ oder „Mail senden“.</p></div><label class="anruf-field">Max. Versuche<select id="anruf-max"><option>3</option><option>4</option><option>5</option></select></label><button type="button" class="btn-yellow" id="anruf-new">' + ico('plus') + '<span>Neuer Anruf</span></button></div><div id="anruf-lead-list"></div>';
      var main = document.getElementById('main-content');
      if (main) main.appendChild(page);
    }
    var contactsNav = document.querySelector('.nav-item[data-page="contacts"]');
    if (contactsNav && !document.querySelector('.nav-item[data-page="telefon"]')) {
      var nav = document.createElement('div');
      nav.className = 'nav-item';
      nav.setAttribute('data-page', 'telefon');
      nav.innerHTML = '<span class="nav-item-icon">📞</span><span class="nav-item-label">Telefon</span>';
      nav.onclick = function () { if (typeof showPage === 'function') showPage('telefon'); };
      contactsNav.insertAdjacentElement('afterend', nav);
    }
    var pageEl = document.getElementById('page-telefon');
    var neu = document.getElementById('anruf-new');
    if (neu) neu.onclick = openNew;
    var maxSel = document.getElementById('anruf-max');
    if (maxSel) maxSel.onchange = function () {
      ensure();
      DB.settings.anrufMax = R.clampMax(maxSel.value);
      if (typeof save === 'function') save();
      if (typeof sbSaveSettings === 'function') sbSaveSettings(DB.settings);
      renderBoard();
    };
    if (pageEl) pageEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var card = btn.closest('[data-lead]');
      if (!card) return;
      var id = card.getAttribute('data-lead');
      var act = btn.getAttribute('data-act');
      if (act === 'call') openLead(id);
      if (act === 'promote') promote(id, null);
      if (act === 'mail') {
        var lead = leadById(id);
        var call = lead ? latest(callsOfLead(id)) : null;
        promote(id, call || { result: 'Rückruf' });
      }
    });
  }

  function injectStyle() {
    if (document.getElementById('anruf-style')) return;
    var style = document.createElement('style');
    style.id = 'anruf-style';
    style.textContent = [
      '#anruf-cockpit{position:fixed;inset:0;z-index:640;display:flex;flex-direction:column;height:100dvh;overflow:hidden;background:rgba(244,242,238,.78);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);color:var(--ink)}',
      '#anruf-cockpit[hidden]{display:none !important}',
      'body.dark-mode #anruf-cockpit{background:rgba(7,7,7,.82)}',
      'body.anruf-open{overflow:hidden}',
      '.anruf-top,.anruf-foot{margin:10px 12px 0;padding:12px 14px;border-radius:12px}',
      '.anruf-top{flex:0 0 auto}',
      '.anruf-foot{flex:0 0 auto;margin:0 12px 12px;background:var(--paper) !important;position:relative;z-index:2}',
      '.anruf-top-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.anruf-brand{flex:1 1 180px;min-width:160px}',
      '.anruf-kicker{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);white-space:nowrap;word-break:normal;max-width:none}',
      '#anruf-live{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;word-break:normal;max-width:none}',
      '#anruf-count{text-align:right}',
      '.anruf-count{display:inline-flex;align-items:center;font-size:12px;font-weight:600;padding:4px 8px;border-radius:999px;background:rgba(245,196,0,.18);color:var(--ink)}',
      '.anruf-count-hot{background:var(--red-bg);color:var(--red)}',
      '#anruf-count small{display:block;font-size:11px;font-weight:500;color:var(--muted);margin-top:2px}',
      '.anruf-banner{margin-top:8px;padding:8px 10px;border-radius:8px;background:var(--red-bg);color:var(--red);font-size:13px;font-weight:600}',
      '.anruf-fields{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-top:10px}',
      '.anruf-field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--ink2);font-weight:500}',
      '.anruf-field input,.anruf-field textarea,.anruf-field select{width:100%;border:1px solid var(--border);border-radius:8px;background:var(--paper);color:var(--ink);padding:8px 10px;font:inherit;font-size:14px}',
      '.anruf-field textarea{min-height:58px;resize:vertical}',
      '.anruf-field-wide{grid-column:1 / -1}',
      '.anruf-id{grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:8px 14px;align-items:baseline;font-size:14px}',
      '.anruf-id strong{font-size:16px}',
      '.anruf-phases{display:flex;gap:6px;overflow-x:auto;padding:10px 0 0;flex-wrap:nowrap}',
      '.anruf-phase,.anruf-obj,.anruf-tab{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;max-width:none;white-space:nowrap;word-break:normal;border:1px solid var(--border);background:var(--paper);color:var(--ink);border-radius:8px;min-height:36px;padding:4px 10px;font:inherit;font-size:13px;cursor:pointer}',
      '.anruf-phase.active,.anruf-obj.active,.anruf-tab.active{background:#111;color:#fff;border-color:#111}',
      'body.dark-mode .anruf-phase.active,body.dark-mode .anruf-obj.active,body.dark-mode .anruf-tab.active{background:#f4f1ea;color:#111;border-color:#f4f1ea}',
      '.anruf-phase kbd,.anruf-obj kbd{font-size:11px;font-weight:700;border:1px solid rgba(245,196,0,.95);border-radius:4px;padding:2px 4px;color:#9a7800}',
      '.anruf-phase.active kbd,.anruf-obj.active kbd{color:#f5c400}',
      'body.dark-mode .anruf-phase.active kbd,body.dark-mode .anruf-obj.active kbd{color:#8a6500}',
      '.anruf-obj.danger{border-color:var(--red);color:var(--red)}',
      '.anruf-obj.danger.active{background:var(--red);color:#fff;border-color:var(--red)}',
      '.anruf-keys{margin:6px 0 0;font-size:11px;color:var(--muted)}',
      '.anruf-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.5fr) minmax(260px,.8fr);gap:12px;padding:12px;overflow:auto}',
      '.anruf-script p{font-size:16px;line-height:1.45;margin:0 0 10px}',
      '.anruf-hint,.anruf-if{font-size:13px;color:var(--ink2);margin:8px 0}',
      '.anruf-if{font-weight:600}',
      '.anruf-check{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:14px}',
      '.anruf-cockpit mark,.anruf-card mark{background:var(--yellow);color:var(--ink);padding:0 .22em;border-radius:4px}',
      '.anruf-card mark.filled{box-shadow:inset 0 -2px 0 #111}',
      '.anruf-card-head span{font-size:12px;color:var(--muted)}',
      '.anruf-card-head h2{font-size:20px;font-weight:600;letter-spacing:-.02em;margin:2px 0 10px}',
      '.anruf-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}',
      '.anruf-side{display:flex;flex-direction:column;gap:8px}',
      '.anruf-search-label{font-size:12px;color:var(--ink2)}',
      '#anruf-search{width:100%;border:1px solid var(--border);border-radius:8px;background:var(--paper);color:var(--ink);padding:8px 10px;font:inherit}',
      '#anruf-objs{display:flex;flex-wrap:wrap;gap:6px}',
      '.anruf-mail{white-space:pre-wrap;font-size:13px;line-height:1.45;background:var(--bg);border-radius:8px;padding:10px;margin-bottom:8px}',
      '.anruf-when{display:flex;gap:8px;margin:8px 0}',
      '.anruf-when label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--ink2)}',
      '.anruf-when input{border:1px solid var(--border);border-radius:8px;background:var(--paper);color:var(--ink);padding:8px 10px;font:inherit}',
      '.anruf-results,.anruf-lead-actions{display:flex;flex-wrap:wrap;gap:8px}',
      '.anruf-results button,.anruf-lead-actions button{min-height:40px}',
      '.anruf-board-head{display:flex;gap:16px;align-items:flex-end;justify-content:space-between;margin-bottom:14px}',
      '.anruf-board-head p{color:var(--muted);font-size:13px;margin-top:4px;max-width:62ch}',
      '.anruf-lead{margin-bottom:12px}',
      '.anruf-lead.is-termin{box-shadow:0 0 0 2px rgba(245,196,0,.9), var(--shadow-lg)}',
      '.anruf-promote-hot{box-shadow:0 0 0 3px rgba(245,196,0,.45)}',
      '.anruf-lead-top{display:flex;flex-direction:column;gap:4px;margin-bottom:8px}',
      '.anruf-lead-top h3{margin:0}',
      '.anruf-meta,.anruf-note{font-size:13px;color:var(--ink2)}',
      '.anruf-history{list-style:none;display:flex;flex-direction:column;gap:8px;margin:8px 0}',
      '.anruf-history li{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding-bottom:8px;border-bottom:1px solid var(--border);font-size:13px}',
      '.anruf-history p,.anruf-history small,.anruf-history em{flex-basis:100%;font-style:normal;color:var(--ink2)}',
      '.anruf-empty{color:var(--muted);font-size:13px;padding:6px 0}',
      '#anruf-after p{margin-bottom:8px}',
      '@media(max-width:800px){.anruf-fields{grid-template-columns:1fr 1fr}.anruf-body{grid-template-columns:1fr;min-height:0}.anruf-board-head{flex-direction:column;align-items:stretch}.anruf-phase,.anruf-obj,.anruf-results button,.anruf-lead-actions button{min-height:44px}#contact-detail-content > div > div:first-child > .dash-card:first-child{flex-wrap:wrap !important}#contact-detail-content > div > div:first-child > .dash-card:first-child > div:nth-child(2){flex:1 1 calc(100% - 80px);min-width:200px;word-break:normal}}',
      '@media(prefers-reduced-motion:reduce){#anruf-cockpit,.anruf-phase,.anruf-obj{transition:none}}'
    ].join('');
    document.head.appendChild(style);
  }
  function boot() {
    ensure();
    injectStyle();
    injectChrome();
    shell();
    if (typeof PAGE_TITLES === 'object' && PAGE_TITLES) PAGE_TITLES.telefon = 'Telefon';
    if (typeof renderContactDetail === 'function') {
      var prevDetail = renderContactDetail;
      window.renderContactDetail = function (cid) {
        var r = prevDetail.apply(this, arguments);
        try { mountContact(cid); } catch (e) { console.warn(e); }
        return r;
      };
    }
    if (typeof renderContacts === 'function') {
      var prevContacts = renderContacts;
      window.renderContacts = function () {
        var r = prevContacts.apply(this, arguments);
        try { markRows(); } catch (e) {}
        return r;
      };
    }
    if (typeof showPage === 'function') {
      var prevPage = showPage;
      window.showPage = function (id) {
        var r = prevPage.apply(this, arguments);
        if (id === 'telefon') { try { renderBoard(); } catch (e) { console.warn(e); } }
        return r;
      };
    }
    if (typeof loadAllFromSupabase === 'function') {
      var prevLoad = loadAllFromSupabase;
      window.loadAllFromSupabase = async function () {
        var r = await prevLoad.apply(this, arguments);
        try { await anrufPull(); } catch (e) { console.warn(e); }
        return r;
      };
    }
    if (typeof sbLoadContacts === 'function') {
      var prevLoadC = sbLoadContacts;
      window.sbLoadContacts = async function () {
        var rows = await prevLoadC.apply(this, arguments);
        if (!cloudOn() || !Array.isArray(rows) || !rows.length || typeof getSupabase !== 'function') return rows;
        try {
          var sb = await getSupabase();
          var res = await sb.from('contacts').select('id, do_not_call, sperre_seit').eq('workspace_id', ws());
          if (res.error || !res.data) return rows;
          var by = {};
          res.data.forEach(function (row) { by[row.id] = row; });
          rows.forEach(function (c) {
            var row = by[c.id];
            if (!row) return;
            c.doNotCall = !!row.do_not_call;
            c.sperreSeit = row.sperre_seit || null;
          });
        } catch (e) {}
        return rows;
      };
    }
    if (typeof sbSaveContact === 'function') {
      var prevSave = sbSaveContact;
      var warned = false;
      window.sbSaveContact = async function (contact) {
        var r = await prevSave.apply(this, arguments);
        if (!cloudOn() || !contact || !contact.id) return r;
        if (contact.doNotCall == null && !contact.sperreSeit) return r;
        try {
          var sb = await getSupabase();
          var res = await sb.from('contacts').update({
            do_not_call: !!contact.doNotCall,
            sperre_seit: contact.doNotCall ? (contact.sperreSeit || new Date().toISOString()) : null
          }).eq('id', contact.id);
          if (res.error && !warned) { warned = true; console.warn('Sperre', res.error.message); }
        } catch (e) {}
        return r;
      };
    }
    if (typeof window.dsgvoDelete === 'function') {
      var prevDel = window.dsgvoDelete;
      window.dsgvoDelete = async function (id) {
        var r = await prevDel.apply(this, arguments);
        ensure();
        if ((DB.contacts || []).some(function (c) { return c.id === id; })) return r;
        DB.anrufe = DB.anrufe.filter(function (a) { return a.contactId !== id; });
        DB.callLeads = DB.callLeads.filter(function (l) { return l.convertedContactId !== id; });
        try { if (typeof save === 'function') save(); } catch (e) {}
        return r;
      };
    }
    document.addEventListener('keydown', onKey, true);
    setTimeout(function () { enrichFlags(); }, 1600);
    window.anrufOpenContact = openContact;
    window.anrufOpenLead = openLead;
    window.anrufOpenNew = openNew;
    window.anrufRenderBoard = renderBoard;
  }

  async function enrichFlags() {
    if (!cloudOn() || typeof getSupabase !== 'function') return;
    try {
      var sb = await getSupabase();
      var res = await sb.from('contacts').select('id, do_not_call, sperre_seit').eq('workspace_id', ws());
      if (!res.error && res.data) {
        res.data.forEach(function (row) {
          var c = contactById(row.id);
          if (!c) return;
          c.doNotCall = !!row.do_not_call;
          c.sperreSeit = row.sperre_seit || null;
        });
      }
    } catch (e) {}
    try { await anrufPull(); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
