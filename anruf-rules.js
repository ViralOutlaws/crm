/* Reine Regeln für das Anruf-Cockpit. Kein DOM, kein Netzwerk. */
(function (root) {
  'use strict';
  var RESULTS = ['Termin', 'Rückruf', 'Kein Interesse', 'Mailbox/nicht erreicht', 'Sperre'];
  var DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

  function validDate(value) {
    var m = DATE.exec(String(value || ''));
    if (!m) return false;
    var y = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
    var dt = new Date(Date.UTC(y, month - 1, day));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
  }
  function clampMax(value) {
    var n = parseInt(value, 10);
    return n === 3 || n === 4 || n === 5 ? n : 5;
  }
  function attemptLabel(count, max) {
    var n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    return 'Versuch ' + n + ' von ' + clampMax(max);
  }
  function normTel(input) {
    var digits = String(input || '').replace(/\D/g, '');
    if (digits.indexOf('0049') === 0) digits = '0' + digits.slice(4);
    else if (digits.indexOf('49') === 0 && digits.length > 10) digits = '0' + digits.slice(2);
    return digits;
  }
  function sameTel(a, b) {
    var x = normTel(a), y = normTel(b);
    if (x.length < 6 || y.length < 6) return false;
    return x === y || (x.length >= 8 && y.length >= 8 && x.slice(-8) === y.slice(-8));
  }
  function normName(input) {
    return String(input || '').trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ');
  }
  function matchOpenLead(candidate, leads) {
    var open = (leads || []).filter(function (row) { return row && !row.convertedContactId && !row.converted_contact_id; });
    if (candidate.tel) {
      for (var i = 0; i < open.length; i++) {
        if (open[i].tel && sameTel(candidate.tel, open[i].tel)) return open[i].id;
      }
    }
    var firma = normName(candidate.firma);
    var person = normName(candidate.person || '');
    if (!candidate.tel && firma) {
      for (var j = 0; j < open.length; j++) {
        if (normName(open[j].firma || '') === firma && normName(open[j].person || '') === person) return open[j].id;
      }
    }
    return null;
  }
  function defaultNextStep(result) {
    if (result === 'Termin') return 'Entwurf zeigen';
    if (result === 'Rückruf') return 'Rückruf';
    if (result === 'Mailbox/nicht erreicht') return 'Erneut anrufen';
    if (result === 'Sperre') return 'Nicht mehr anrufen';
    return 'Kein Interesse';
  }
  function planSave(input) {
    var result = input && input.result;
    if (RESULTS.indexOf(result) < 0) return { ok: false, error: 'Ergebnis unbekannt.' };
    if (!input.hasTarget) {
      if (!String(input.firma || '').trim()) return { ok: false, error: 'Bitte die Firma eintragen.' };
    }
    var date = String(input.nextDate || '').trim();
    if (date && !validDate(date)) return { ok: false, error: 'Datum ungültig.' };
    var zeit = String(input.zeit || '').trim();
    if (zeit && !ZEIT.test(zeit)) return { ok: false, error: 'Uhrzeit ungültig.' };
    if ((result === 'Termin' || result === 'Rückruf') && !date) {
      return { ok: false, error: result === 'Termin' ? 'Für einen Termin brauchen Sie ein Datum.' : 'Für einen Rückruf brauchen Sie ein Datum.' };
    }
    var email = String(input.email || '').trim();
    if (email && email.indexOf('@') < 0) return { ok: false, error: 'E-Mail ungültig.' };
    return {
      ok: true,
      sperre: result === 'Sperre',
      nextStep: defaultNextStep(result),
      nextDate: date || null,
      zeit: zeit || null,
      wiedervorlage: result === 'Rückruf' ? { datum: date } : null,
      termin: result === 'Termin' ? { datum: date, zeit: zeit || null } : null
    };
  }
  function wiedervorlageText(firma, person) {
    var who = person ? firma + ' · ' + person : firma;
    return ('Rückruf: ' + who).slice(0, 400);
  }
  function terminTitel(firma) {
    return ('Entwurf zeigen: ' + firma).slice(0, 200);
  }
  function mailDraft(contact, call, settingsTel) {
    var person = (contact && (contact.person || contact.firma)) || 'Guten Tag';
    var slot = [call && call.slot1, call && call.nextDate].filter(Boolean).join(', ') || 'dem vereinbarten Termin';
    var tel = settingsTel || '0163 9047958';
    if (call && call.result === 'Termin') {
      return {
        subject: 'Ihr Homepage-Entwurf – ' + slot,
        body: 'Guten Tag ' + person + ',\n\ndanke für das nette Gespräch eben. Wie besprochen zeige ich Ihnen am ' + slot + ' in 15 Minuten den Entwurf für Ihre neue Homepage. Zum Termin einfach auf diesen Link klicken: [Link].\n\nFalls etwas dazwischenkommt, erreichen Sie mich unter ' + tel + '.\n\nViele Grüße\nKim-Lukas Tobler · Viral Outlaws'
      };
    }
    return {
      subject: 'Kurz zu Ihrer Homepage – ' + ((contact && contact.firma) || ''),
      body: 'Guten Tag ' + person + ',\n\nwie besprochen sende ich Ihnen die kurze Info zu Ihrer Homepage.\n\nViele Grüße\nKim-Lukas Tobler · Viral Outlaws'
    };
  }

  root.AnrufRules = {
    RESULTS: RESULTS,
    validDate: validDate,
    clampMax: clampMax,
    attemptLabel: attemptLabel,
    normTel: normTel,
    sameTel: sameTel,
    matchOpenLead: matchOpenLead,
    planSave: planSave,
    wiedervorlageText: wiedervorlageText,
    terminTitel: terminTitel,
    mailDraft: mailDraft,
    defaultNextStep: defaultNextStep
  };
})(typeof window !== 'undefined' ? window : globalThis);
