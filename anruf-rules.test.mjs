import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sandbox = {};
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(new URL('./anruf-rules.js', import.meta.url), 'utf8'), sandbox);
const R = sandbox.AnrufRules;

const lead = { firma: 'Nordstern Muster GmbH', person: 'Lea Beispiel', tel: '0800 1112233', email: 'lea@example.test' };

assert.equal(R.planSave({ result: 'Mailbox/nicht erreicht', firma: lead.firma }).ok, true);
assert.equal(R.planSave({ result: 'Termin', hasTarget: true }).error, 'Für einen Termin brauchen Sie ein Datum.');
assert.equal(R.planSave({ result: 'Rückruf', hasTarget: true, nextDate: '2026-02-31' }).error, 'Datum ungültig.');

const termin = R.planSave({ result: 'Termin', hasTarget: true, nextDate: '2026-11-12', zeit: '08:30' });
assert.equal(termin.ok, true);
assert.equal(JSON.stringify(termin.termin), JSON.stringify({ datum: '2026-11-12', zeit: '08:30' }));
assert.equal(termin.wiedervorlage, null);
assert.equal(termin.nextStep, 'Entwurf zeigen');

const rueck = R.planSave({ result: 'Rückruf', firma: lead.firma, nextDate: '2026-11-13' });
assert.equal(rueck.wiedervorlage.datum, '2026-11-13');
assert.equal(R.planSave({ result: 'Sperre', firma: lead.firma }).sperre, true);
assert.equal(R.planSave({ result: 'Sperre' }).error, 'Bitte die Firma eintragen.');
assert.equal(R.planSave({ result: 'Kein Interesse', firma: 'A', email: 'keine' }).error, 'E-Mail ungültig.');

assert.equal(R.matchOpenLead(lead, [
  { id: 'offen', firma: 'Andere', tel: '+49 800 1112233', convertedContactId: null },
  { id: 'weg', firma: lead.firma, person: lead.person, tel: lead.tel, convertedContactId: 'kontakt' }
]), 'offen');
assert.equal(R.attemptLabel(2, 5), 'Versuch 2 von 5');
assert.equal(R.attemptLabel(0, 9), 'Versuch 0 von 5');
assert.equal(R.wiedervorlageText(lead.firma, lead.person), 'Rückruf: Nordstern Muster GmbH · Lea Beispiel');
assert.equal(R.terminTitel(lead.firma), 'Entwurf zeigen: Nordstern Muster GmbH');
const mail = R.mailDraft({ firma: lead.firma, person: lead.person }, { result: 'Termin', slot1: 'Do 8:30', nextDate: '2026-11-12' }, '0800 000');
assert.match(mail.subject, /Homepage-Entwurf/);
assert.match(mail.body, /0800 000/);
assert.doesNotMatch(mail.body, /senden/i);

console.log('anruf-rules ok');
