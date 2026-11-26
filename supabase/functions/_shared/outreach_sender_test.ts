import { assertEquals } from "jsr:@std/assert";
import { replyPlan, senderMatchesDraft } from "./outreach.ts";

Deno.test("Absender: exakte Adresse und gleiche Firmen-Domain", () => {
  assertEquals(senderMatchesDraft("info@schalander-kempten.de", "info@schalander-kempten.de"), true);
  assertEquals(senderMatchesDraft("chef@schalander-kempten.de", "info@schalander-kempten.de"), true);
  assertEquals(senderMatchesDraft("newsletter@shop.de", "info@schalander-kempten.de"), false);
  assertEquals(senderMatchesDraft("max@gmail.com", "anna@gmail.com"), false);
  assertEquals(senderMatchesDraft("anna@gmail.com", "anna@gmail.com"), true);
});

Deno.test("Fremder Absender mit Message-ID-Bezug landet nicht im CRM", () => {
  const drafts = [{ id: "d1", email: "info@firma.de", subject: "Anfragen über firma.de", messageId: "<outreach.d1.1@viraloutlaws.de>", status: "gesendet", contactId: null }];
  const header = "In-Reply-To: <outreach.d1.1@viraloutlaws.de>\r\n";
  assertEquals(replyPlan({ fromEmail: "kunde@anders.de", subject: "Re: Anfragen über firma.de", text: "x", header, drafts }), null);
  assertEquals(replyPlan({ fromEmail: "info@firma.de", subject: "Re: Anfragen über firma.de", text: "Gerne", header, drafts })?.draftId, "d1");
});
