/**
 * The mailbox domains `suggest()` corrects TOWARD, and the few it corrects
 * FROM by name.
 *
 * Rules for this file (they are what keeps a suggestion trustworthy):
 *   1. A provider domain is listed only when people really hold mailboxes on
 *      it AND `scripts/verify-domains.mjs` reports it `deliverable` (an MX
 *      record, checked live). Deliverable does not prove the provider still
 *      opens NEW accounts there (Microsoft no longer does on most hotmail.*
 *      country domains); existing mailboxes are reason enough to recognise it.
 *   2. A lookalike (a domain people type for a provider, which is NOT that
 *      provider's mailbox domain) is listed only when the same script reports
 *      it NOT deliverable. A lookalike that gains a mail server stops being
 *      safe to rewrite, and the script fails until it is removed.
 *   3. Never list a domain on a guess. Every entry was checked on the date
 *      in `VERIFIED_ON`; re-run the script before adding one.
 *
 * Seeds came from mailcheck (MIT, Received Inc), @zootools/email-spell-checker
 * (MIT, ZooTools, Inc.) and email-misspelled (MIT, Julien Amblard); see
 * NOTICE. Every seed was re-checked live before it stayed.
 */

/** When the lists below were last checked against live DNS. */
export const VERIFIED_ON = "2026-10-21";

/** Mailbox domains of the big providers, globally and per European country. */
export const PROVIDER_DOMAINS: readonly string[] = [
  // Google
  "gmail.com",
  "googlemail.com",
  "google.com",
  // Yahoo (yahoo.com, its other brands, and the country domains with live MX)
  "yahoo.com",
  "ymail.com",
  "rocketmail.com",
  "yahoo.co.uk",
  "yahoo.fr",
  "yahoo.de",
  "yahoo.it",
  "yahoo.es",
  "yahoo.ie",
  "yahoo.gr",
  "yahoo.se",
  "yahoo.dk",
  "yahoo.no",
  "yahoo.fi",
  "yahoo.nl",
  "yahoo.be",
  "yahoo.at",
  "yahoo.pl",
  "yahoo.pt",
  "yahoo.ro",
  "yahoo.ca",
  "yahoo.com.au",
  "yahoo.com.br",
  "yahoo.com.mx",
  "yahoo.com.ar",
  "yahoo.co.in",
  "yahoo.co.jp",
  // Microsoft
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "hotmail.co.uk",
  "hotmail.fr",
  "hotmail.de",
  "hotmail.it",
  "hotmail.es",
  "hotmail.nl",
  "hotmail.be",
  "hotmail.gr",
  "hotmail.se",
  "hotmail.dk",
  "hotmail.no",
  "hotmail.fi",
  "hotmail.cz",
  "hotmail.hu",
  "hotmail.sk",
  "hotmail.ca",
  "hotmail.com.br",
  "hotmail.com.ar",
  "hotmail.com.au",
  "outlook.fr",
  "outlook.de",
  "outlook.it",
  "outlook.es",
  "outlook.at",
  "outlook.be",
  "outlook.cz",
  "outlook.dk",
  "outlook.ie",
  "outlook.pt",
  "outlook.sk",
  "outlook.hu",
  "outlook.com.gr",
  "outlook.com.br",
  "outlook.com.ar",
  "outlook.com.au",
  "live.co.uk",
  "live.fr",
  "live.de",
  "live.it",
  "live.nl",
  "live.be",
  "live.at",
  "live.se",
  "live.dk",
  "live.no",
  "live.ie",
  "live.ca",
  "live.com.au",
  "live.com.pt",
  "live.com.mx",
  // Apple
  "icloud.com",
  "me.com",
  "mac.com",
  // Proton
  "proton.me",
  "protonmail.com",
  "protonmail.ch",
  "pm.me",
  // AOL
  "aol.com",
  "aol.co.uk",
  "aol.de",
  "aol.fr",
  "aim.com",
  // Germany, Austria, Switzerland
  "gmx.de",
  "gmx.net",
  "gmx.at",
  "gmx.ch",
  "gmx.com",
  "gmx.fr",
  "web.de",
  "t-online.de",
  "freenet.de",
  "posteo.de",
  "mailbox.org",
  "bluewin.ch",
  // France
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "laposte.net",
  "sfr.fr",
  "neuf.fr",
  // Italy
  "libero.it",
  "virgilio.it",
  "alice.it",
  "tim.it",
  "tiscali.it",
  "email.it",
  // Czechia, Slovakia
  "seznam.cz",
  "email.cz",
  "centrum.cz",
  "post.cz",
  "azet.sk",
  // Poland
  "wp.pl",
  "o2.pl",
  "interia.pl",
  "onet.pl",
  "op.pl",
  "gazeta.pl",
  // Belgium, Netherlands
  "telenet.be",
  "skynet.be",
  "ziggo.nl",
  "kpnmail.nl",
  // Spain, Portugal, Greece
  "telefonica.net",
  "sapo.pt",
  "otenet.gr",
  // Bulgaria, Hungary, Baltics, Nordics
  "abv.bg",
  "mail.bg",
  "freemail.hu",
  "citromail.hu",
  "inbox.lv",
  "online.no",
  "telia.com",
  // United Kingdom, Ireland
  "btinternet.com",
  "sky.com",
  "virginmedia.com",
  "talktalk.net",
  "eircom.net",
  // Russia and neighbours
  "mail.ru",
  "bk.ru",
  "list.ru",
  "inbox.ru",
  "yandex.ru",
  "yandex.com",
  "ya.ru",
  "rambler.ru",
  // Independent providers
  "zoho.com",
  "zohomail.com",
  "zohomail.eu",
  "fastmail.com",
  "fastmail.fm",
  "hey.com",
  "tuta.com",
  "tutanota.com",
  "tutanota.de",
  "tutamail.com",
  "tuta.io",
  "mail.com",
  "email.com",
  // North America
  "comcast.net",
  "optonline.net",
  "verizon.net",
  "att.net",
  "sbcglobal.net",
  "cox.net",
  "bellsouth.net",
  "charter.net",
  "earthlink.net",
  "shaw.ca",
  "rogers.com",
  "sympatico.ca",
  "telus.net",
  // Asia, Oceania
  "qq.com",
  "163.com",
  "126.com",
  "optusnet.com.au",
  "bigpond.com",
  "xtra.co.nz",
];

/**
 * Domains within `suggest()`'s reach of a provider that belong to someone else
 * with a real mail service of their own: never "corrected". Each is
 * deliverable, and each was found or confirmed by the false-positive sweep
 * (`scripts/verify-domains.mjs --neighbours`), reviewed by hand.
 */
export const NOT_TYPOS: readonly string[] = [
  "wahoo.com",
  "gmx.com",
  "mail.com",
  "email.com",
  "ymail.com",
  "grail.com",
  "libro.it",
  "mymail.com",
  // The 2026-10-21 sweep over the Tranco top million: real sites with mail of
  // their own one edit from a provider. Where unsure (yahmo.com, 5ymail.com,
  // zahoo.com) the domain is listed here: the safe direction.
  "5ymail.com",
  "atinternet.com",
  "bqinternet.com",
  "candex.com",
  "charper.net",
  "cloud.com",
  "e-mail.com",
  "emailr.com",
  "emaily.it",
  "emall.com",
  "exail.com",
  "fptonline.net",
  "gambler.ru",
  "hostmail.com",
  "invbox.ru",
  "k-online.de",
  "landex.com",
  "libera.it",
  "melia.com",
  "memail.com",
  "oenet.gr",
  "pcloud.com",
  "pinbox.ru",
  "roger.com",
  "ropers.com",
  "royers.com",
  "teklia.com",
  "tela.com",
  "teliax.com",
  "telit.com",
  "tella.com",
  "telos.net",
  "tels.net",
  "telva.com",
  "tplus.net",
  "tz-online.de",
  "yahmo.com",
  "yaldex.com",
  "ycloud.com",
  "zahoo.com",
];

/**
 * Domains the sweep found with an MX of their own that were reviewed and ARE
 * typo squats (a self-hosted catch-all on a provider misspelling, or a mail
 * host shared with other typo domains), so the hint stays. Moving one to
 * `NOT_TYPOS` is always the safe direction.
 */
export const REVIEWED_TYPO_DOMAINS: readonly string[] = [
  "gamil.com",
  "gnail.com",
  "gmsil.com",
  "hotmai.com",
  "hotnail.com",
  "ayndex.ru",
  "yandez.ru",
  "ticsali.it",
];

/**
 * MX host suffixes seen serving typo domains of providers (mail catchers and
 * parking services). A swept domain whose MX points here is not flagged.
 * Each was the mail host of many one-edit provider typos in the 2026-10-21
 * sweep (count beside it) and of no top site we could tell was a business.
 */
export const TYPO_CATCHER_MX: readonly string[] = [
  "above.com", // 162, domain parking (gmuil.com, gmajl.com)
  "mail-vert.fr", // 108 (ahoo.fr, tahoo.fr)
  "yurtmail.com", // 87 (ywhoo.de, yahlo.de)
  "blackhole.mx", // 74
  "hostedmxserver.com", // 45
  "aftermarket.pl", // 41, domain marketplace
  "bestinv.org", // 39
  "parktons.com", // 37
  "h-email.net", // 31 (gmai.com, gmeil.com)
  "yul.zone", // 30
  "stememail.com", // 29 (rocketmai.com)
  "mailerhost.net", // 26
  "recoverhost.com", // 24
  "virusfree.cz", // 21 (sdznam.cz, seznaj.cz)
  "outsideserver.com", // 20
  "darkprobe.com", // 16
  "mb1p.com", // 14
  "mb5p.com", // 13
  "smtpreply.com", // 11
  "infinitegravity.ca", // 11
  "arrivalserver.com", // 10
  "inquirymailer.com", // 999gmail.com
  "yaxmail.net", // gmil.com, hotmil.com
];

/**
 * A domain people type for a provider that is not that provider's mailbox
 * domain, mapped to the provider. Only domains the live check reports as NOT
 * deliverable (rule 2 above), so rewriting one can never move a working
 * address.
 */
export const LOOKALIKE_DOMAINS: Readonly<Record<string, string>> = {
  "gmail.ro": "gmail.com",
  "gmail.de": "gmail.com",
  "gmail.fr": "gmail.com",
  "gmail.es": "gmail.com",
  "gmail.co.uk": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmail.org": "gmail.com",
  "yahoo.co": "yahoo.com",
  "yahoo.cm": "yahoo.com",
  "yahoo.om": "yahoo.com",
  "hotmail.co": "hotmail.com",
  "icloud.ro": "icloud.com",
};
