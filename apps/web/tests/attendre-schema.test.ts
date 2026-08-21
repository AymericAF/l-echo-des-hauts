/**
 * LA SONDE DE SCHEMA — elle doit ATTENDRE le CMS, et NOMMER le champ quand elle abandonne.
 *
 * LE DEFAUT QU ELLE FERME, mesure et non suppose (dossier `docs/course-schema-cms-vs-build-site.md`,
 * depot de documentation, commit 767a82c). Un push qui touche les deux arbres met les deux
 * applications Coolify en file A LA MEME SECONDE (`concurrent_builds = 2`). Le build statique du
 * site interroge alors le Strapi de PRODUCTION pendant que celui-ci redemarre encore avec l ANCIEN
 * schema : il demande un champ que l ancien ne connait pas, recoit un `400 ValidationError`, et
 * sort en 1. Trois occurrences, avec l ecart mesure entre l echec du site et le CMS pret :
 *
 *   | queue site | commit    | champ refuse                       | ecart a combler |
 *   | 455 (14/08)| 3a8ad72   | Invalid key alternativeCouverture   | 189 s           |
 *   | 501 (17/08)| dadef1d   | Invalid key alternativePartage      |  86 s           |
 *   | 506 (17/08)| 3c7a2fc   | Invalid key alternatives at contenu | 275 s           |
 *
 * CE QUE CE FICHIER TIENT, et c est l invariant plutot que le cas :
 *
 *   1. la sonde rejoue LES REQUETES DECLAREES — `fields` + `populate` de `requete.ts`, celles-la
 *      memes que le build emettra. C est la section la plus importante du fichier : une sonde qui
 *      demanderait `/api/articles` tout nu recevrait `200` de l ANCIEN Strapi, rendrait la main, et
 *      le build echouerait juste apres. Elle serait VERTE sur la mauvaise sortie
 *      ([[preuve-doit-exercer-critere-acceptation]]) ;
 *   2. schema en retard -> elle BOUCLE, et elle le DIT. « la sonde n a pas echoue » et « la sonde
 *      n est jamais entree en attente » produisent la meme observation — un succes. Le rapport
 *      porte donc le nombre de passes et le temps attendu, et le banc verifie que le serveur a
 *      REELLEMENT servi un 400 avant son 200 ;
 *   3. plafond atteint -> elle echoue en NOMMANT le champ, et le nom vient du CORPS que le CMS a
 *      rendu, jamais d une constante du depot (deux scenarios, deux champs differents) ;
 *   4. schema pret -> une seule passe, aucune attente : elle n allonge pas le build ;
 *   5. le plafond de PRODUCTION ne bouge pas parce qu un banc va vite (10 min / 5 s) ;
 *   6. une cause qui ne se resorbera JAMAIS (jeton refuse) l arrete tout de suite — dix minutes
 *      d attente ne fabriquent pas un jeton — et les variables qu elle lit sont CELLES DU BUILD,
 *      pas une seconde resolution qui sonderait une instance et laisserait construire contre
 *      une autre.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';

import {
  EN_TETE_EMPREINTE,
  INTERVALLE_PAR_DEFAUT_MS,
  PLAFOND_PAR_DEFAUT_MS,
  attendreSchema,
  classerReponse,
  empreinteDuBuild,
  lireEmpreinte,
  parametresDeSonde,
  urlDeSonde,
  VERDICTS,
} from '../scripts/attendre-schema.mjs';
import { ISSUES } from '../scripts/issues.mjs';
import { REQUETES, serialiserParametres } from '../src/lib/strapi/requete.ts';

const JETON = 'jeton-de-banc';

/** Le corps EXACT d un refus de cle par Strapi 5 — celui qu ont rendu les queues 455, 501 et 506. */
function refusDeCle(champ: string): string {
  return JSON.stringify({
    data: null,
    error: {
      status: 400,
      name: 'ValidationError',
      message: `Invalid key ${champ}`,
      details: { key: champ, path: champ, source: 'query' },
    },
  });
}

interface Banc {
  base: string;
  /** Nombre d appels recus, tous chemins confondus. */
  appels: () => number;
  /** Les URL vues par le serveur, dans l ordre. */
  urls: () => string[];
  /** Nombre de refus 400 REELLEMENT servis — c est lui qui distingue « a attendu » de « a reussi ». */
  refus: () => number;
  fermer: () => Promise<void>;
}

/**
 * Un Strapi de substitution dont le SCHEMA evolue — c est tout l objet du banc.
 *
 * @param decider Recoit le numero d appel (1, 2, ...) et l URL ; rend `null` pour `200`, ou le nom
 *   du champ a refuser en `400`. C est ainsi qu on fabrique un CMS qui rattrape son retard.
 * @param empreinteDe Ce que le conteneur DIT de sa version, appel par appel — `null` pour ne poser
 *   AUCUN en-tete (c est le CMS d avant le 2026-08-19, et le developpement local). C est ainsi
 *   qu on fabrique un proxy qui bascule de l ancien conteneur au nouveau AU MILIEU d une passe.
 */
function strapiQuiRattrape(
  decider: (appel: number, url: string) => string | null,
  empreinteDe: (appel: number, url: string) => string | null = () => null,
): Promise<Banc> {
  let appels = 0;
  let refus = 0;
  const urls: string[] = [];

  const serveur = http.createServer((requete, reponse) => {
    appels += 1;
    urls.push(requete.url ?? '');
    const empreinte = empreinteDe(appels, requete.url ?? '');
    const entetes: Record<string, string> = { 'content-type': 'application/json' };
    if (empreinte !== null) entetes[EN_TETE_EMPREINTE] = empreinte;
    const champ = decider(appels, requete.url ?? '');
    if (champ === null) {
      reponse
        .writeHead(200, entetes)
        .end(JSON.stringify({ data: [], meta: { pagination: { page: 1, pageCount: 1 } } }));
      return;
    }
    refus += 1;
    reponse.writeHead(400, entetes).end(refusDeCle(champ));
  });

  return new Promise<Banc>((ok) => {
    serveur.listen(0, '127.0.0.1', () => {
      const adresse = serveur.address() as { port: number };
      ok({
        base: `http://127.0.0.1:${adresse.port}`,
        appels: () => appels,
        urls: () => urls,
        refus: () => refus,
        fermer: () => new Promise<void>((ferme) => serveur.close(() => ferme())),
      });
    });
  });
}

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 1. LA SONDE REJOUE LES REQUETES DECLAREES — sans quoi son vert ne vaut rien
 * ════════════════════════════════════════════════════════════════════════════════════ */

test('1. chaque requete declaree de requete.ts est sondee — aucune ne manque', () => {
  const noms = Object.keys(REQUETES).sort();
  const sondees = Object.keys(parametresDeSonde('fr')).sort();
  assert.deepEqual(
    sondees,
    noms,
    'une requete que le build emet et que la sonde ne joue pas est un trou : le CMS peut la ' +
      'refuser en 400 sans que la sonde le voie.',
  );
});

test('1 bis. la sonde ne differe de la requete declaree QUE par sa pagination', () => {
  /* LE PIEGE EXACT que cette section ferme : une sonde allegee — `/api/articles` tout nu, ou un
     `fields` reduit — recoit `200` de l ANCIEN Strapi. Elle rendrait la main sur un CMS qui va
     faire echouer le build a la seconde suivante. Le `populate` est donc COMPARE, cle a cle, a
     celui que le build emettra. */
  for (const [nom, requete] of Object.entries(REQUETES)) {
    const sonde = parametresDeSonde('fr')[nom] as Record<string, unknown>;
    assert.deepEqual(
      sonde.fields,
      requete.fields,
      `${nom} : la sonde n a pas les memes champs que la requete du build`,
    );
    assert.deepEqual(
      sonde.populate,
      (requete as { populate?: unknown }).populate,
      `${nom} : la sonde n a pas le meme populate que la requete du build`,
    );
  }
});

test('1 ter. le champ qui a fait echouer les trois deploiements est bien dans l URL sondee', () => {
  /* Les trois occurrences reelles, nommees. Si l une d elles cessait d apparaitre dans l URL de
     sonde, la course qu on ferme se rouvrirait sans que rien ne rougisse.

     LA TROISIEME A CHANGE DE NOM le 2026-08-19, pas de nature : le 400 « Invalid key
     alternatives at contenu » du 17/08 venait de la table d appariement `alternatives`, qui
     n existe plus. Le champ qui court exactement le meme risque aujourd hui est
     l `alternative` de chaque entree de `images` — un champ de composant IMBRIQUE, donc
     absent de l ancien Strapi tant que le CMS n a pas redemarre. On verifie son CHEMIN
     COMPLET et non le mot seul : « alternative » est un prefixe d `alternativeCouverture`,
     et passerait vert meme si la galerie disparaissait entierement de la sonde. */
  const url = decodeURIComponent(urlDeSonde('https://cms.test', 'articles', 'fr'));
  const chemins = [
    'alternativeCouverture',
    'alternativePartage',
    'populate[contenu][on][bloc.galerie][populate][images][fields][0]=alternative',
  ];
  for (const champ of chemins) {
    assert.ok(
      url.includes(champ),
      `« ${champ} » a fait echouer un deploiement reel et n est pas demande par la sonde`,
    );
  }
});

test('1 quater. la sonde allege la PAGINATION, et rien d autre', () => {
  /* Un `pageSize` reduit ne change pas ce que Strapi VALIDE — la validation des cles est
     independante de la pagination — mais evite de ramener 50 entrees toutes les 5 secondes
     pendant dix minutes. C est la seule difference admise, et elle est verrouillee ici. */
  const sonde = parametresDeSonde('fr').articles as { pagination?: { pageSize: number } };
  assert.equal(sonde.pagination?.pageSize, 1);
  assert.notEqual(REQUETES.articles.pagination.pageSize, 1, 'le banc ne mesurerait rien');

  /* Le single type `configuration` n a PAS de pagination declaree : lui en inventer une ferait
     sonder autre chose que ce que le build emet. */
  const single = parametresDeSonde('fr').configuration as { pagination?: unknown };
  assert.equal(single.pagination, undefined);
});

test('1 quinquies. l URL sondee est celle que le build construirait', () => {
  const url = urlDeSonde('https://cms.test/', 'auteurs', 'en');
  assert.ok(url.startsWith('https://cms.test/api/auteurs?'), url);
  const attendue = serialiserParametres(parametresDeSonde('en').auteurs as Record<string, unknown>);
  assert.equal(url, `https://cms.test/api/auteurs?${attendue}`);
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 2. SCHEMA EN RETARD — ELLE BOUCLE, PUIS REND LA MAIN. Et elle le DIT.
 * ════════════════════════════════════════════════════════════════════════════════════ */

test('2. le CMS rattrape son retard : la sonde ATTEND, puis rend 0', async () => {
  const requetes = Object.keys(REQUETES).length;
  /* Les deux premieres passes sont refusees sur `articles`, comme les queues 455/501/506 ; la
     troisieme passe, le CMS a fini de redemarrer. */
  const passesRefusees = 2;
  const banc = await strapiQuiRattrape((appel, url) => {
    const passe = Math.ceil(appel / requetes);
    return passe <= passesRefusees && url.includes('/api/articles') ? 'alternativePartage' : null;
  });

  try {
    const rapport = await attendreSchema({
      baseUrl: banc.base,
      jeton: JETON,
      plafondMs: 5_000,
      intervalleMs: 10,
    });

    assert.equal(rapport.issue, ISSUES.CONFORME, JSON.stringify(rapport, null, 2));

    /* CE QUI DISTINGUE « a attendu » de « a reussi du premier coup » — les deux rendent 0. */
    assert.equal(
      rapport.passes,
      passesRefusees + 1,
      'la sonde doit avoir rejoue ses requetes a chaque passe, pas une seule fois',
    );
    assert.ok(rapport.attentes > 0, 'la sonde n est jamais entree en attente : elle ne prouve rien');
    assert.ok(rapport.attenduMs > 0, 'la sonde rend une attente nulle : elle n a pas boucle');
    assert.equal(
      banc.refus(),
      passesRefusees,
      'le CMS n a servi AUCUN 400 : le banc ne fabrique pas le cas qu il pretend fabriquer',
    );
    /* Elle raconte son attente : sans cette phrase, le journal de build ne distingue pas non plus. */
    assert.match(rapport.recit, /d attente et \d+ passe/i);
    assert.match(rapport.recit, /alternativePartage/);
  } finally {
    await banc.fermer();
  }
});

test('2 ter. chaque attente laisse une LIGNE dans le journal du build, qui nomme le champ', async () => {
  /* Sur un deploiement reel, personne ne lit le rapport : on lit le journal Coolify. Si l attente
     n y laisse aucune trace, « elle a attendu puis reussi » et « elle a reussi tout de suite »
     redeviennent indiscernables — le piege exact de ce lot. Et un journal muet pendant dix
     minutes se lit comme un build fige. */
  const requetes = Object.keys(REQUETES).length;
  const banc = await strapiQuiRattrape((appel, url) =>
    Math.ceil(appel / requetes) <= 2 && url.includes('/api/articles') ? 'alternativePartage' : null,
  );
  const journal: string[] = [];

  try {
    const rapport = await attendreSchema({
      baseUrl: banc.base,
      jeton: JETON,
      plafondMs: 5_000,
      intervalleMs: 10,
      journaliser: (ligne) => journal.push(ligne),
    });

    /* AMENDE LE 2026-08-19 : le journal porte desormais DEUX natures de lignes — celles de
       l attente, une par attente, et celles de l empreinte, une par PASSE (section 8). On les
       separe par leur prefixe plutot que de relacher le compte : « une ligne par attente » est
       l invariant qui distingue « elle a attendu puis reussi » de « elle a reussi tout de
       suite », et le diluer dans un total ferait exactement perdre ce que ce test garde. */
    const attentes = journal.filter((ligne) => !ligne.startsWith('empreinte'));
    const empreintes = journal.filter((ligne) => ligne.startsWith('empreinte'));

    assert.equal(rapport.issue, ISSUES.CONFORME);
    assert.equal(attentes.length, rapport.attentes, 'une ligne par attente, ni plus ni moins');
    assert.equal(attentes.length, 2);
    assert.equal(empreintes.length, rapport.passes, 'une ligne d empreinte par PASSE');
    for (const ligne of attentes) assert.match(ligne, /alternativePartage/);
    assert.match(attentes[0], /plafond/);
  } finally {
    await banc.fermer();
  }
});

test('2 bis. la sonde exige que TOUTES les requetes passent dans la MEME passe', async () => {
  /* Sans cela, un CMS qui bascule au milieu d une passe laisserait un vert compose de deux
     schemas differents — le vert du build, lui, n est jamais compose. */
  const requetes = Object.keys(REQUETES).length;
  const banc = await strapiQuiRattrape((appel, url) => {
    const passe = Math.ceil(appel / requetes);
    /* Passe 1 : seul `articles` est refuse. Passe 2 : seul `dossiers` l est. Passe 3 : tout passe.
       Une sonde qui MEMORISERAIT les verts d une passe sur l autre s arreterait a la passe 2. */
    if (passe === 1 && url.includes('/api/articles')) return 'alternativePartage';
    if (passe === 2 && url.includes('/api/dossiers')) return 'alternativeHero';
    return null;
  });

  try {
    const rapport = await attendreSchema({
      baseUrl: banc.base,
      jeton: JETON,
      plafondMs: 5_000,
      intervalleMs: 10,
    });
    assert.equal(rapport.issue, ISSUES.CONFORME);
    assert.equal(rapport.passes, 3, 'la sonde a garde le vert d une passe precedente');
  } finally {
    await banc.fermer();
  }
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 3. PLAFOND ATTEINT — ELLE ECHOUE EN NOMMANT LE CHAMP
 * ════════════════════════════════════════════════════════════════════════════════════ */

test('3. le CMS ne rattrape jamais : la sonde abandonne en NOMMANT le champ', async () => {
  const banc = await strapiQuiRattrape((_appel, url) =>
    url.includes('/api/articles') ? 'alternativePartage' : null,
  );

  try {
    const rapport = await attendreSchema({
      baseUrl: banc.base,
      jeton: JETON,
      plafondMs: 120,
      intervalleMs: 10,
    });

    assert.equal(
      rapport.issue,
      ISSUES.VERIFICATION_IMPOSSIBLE,
      'un CMS qui ne sert jamais le schema n est pas un site fautif (1) : c est une ' +
        'verification impossible (2), et le build doit echouer avec.',
    );
    assert.equal(rapport.obstacle?.champ, 'alternativePartage');
    assert.equal(rapport.obstacle?.requete, 'articles');
    /* LE GAIN PRINCIPAL DE TOUTE LA PISTE : un 400 illisible devient un verdict lisible. */
    assert.match(rapport.recit, /alternativePartage/);
    assert.match(rapport.recit, /400/);
    assert.ok(rapport.passes > 1, 'elle a abandonne sans avoir boucle');
  } finally {
    await banc.fermer();
  }
});

test('3 bis. le champ nomme vient du CORPS rendu par le CMS, jamais d une constante', async () => {
  /* Le meme banc avec un AUTRE champ — celui de la queue 506, imbrique. Une sonde qui recopierait
     un nom en dur passerait le test precedent et rougirait ici. */
  const banc = await strapiQuiRattrape((_appel, url) =>
    url.includes('/api/articles') ? 'alternatives at contenu' : null,
  );

  try {
    const rapport = await attendreSchema({
      baseUrl: banc.base,
      jeton: JETON,
      plafondMs: 120,
      intervalleMs: 10,
    });
    assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
    assert.equal(rapport.obstacle?.champ, 'alternatives at contenu');
    assert.match(rapport.recit, /alternatives at contenu/);
    assert.doesNotMatch(rapport.recit, /alternativePartage/);
  } finally {
    await banc.fermer();
  }
});

test('3 ter. un CMS injoignable fait ATTENDRE, et son abandon dit la panne — pas un champ', async () => {
  /* Un conteneur qui redemarre ne repond pas 400 : il ne repond RIEN. C est le meme motif de
     course, et il doit produire la meme attente — puis un abandon qui envoie chercher au bon
     endroit, c est-a-dire pas dans le populate. */
  const rapport = await attendreSchema({
    /* Port ferme sur la boucle locale : ECONNREFUSED immediat, sans traversee reseau. */
    baseUrl: 'http://127.0.0.1:1',
    jeton: JETON,
    plafondMs: 120,
    intervalleMs: 10,
  });

  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.equal(rapport.obstacle?.champ, null, 'aucun champ n a ete refuse : n en invente pas un');
  assert.ok(rapport.passes > 1, 'une panne reseau doit faire attendre, pas abandonner tout de suite');
  assert.match(rapport.recit, /injoignable|ECONNREFUSED|fetch/i);
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 4. SCHEMA PRET — UNE PASSE, AUCUNE ATTENTE
 * ════════════════════════════════════════════════════════════════════════════════════ */

test('4. le cas courant ne coute rien : une passe, zero attente', async () => {
  const banc = await strapiQuiRattrape(() => null);

  try {
    const rapport = await attendreSchema({
      baseUrl: banc.base,
      jeton: JETON,
      plafondMs: 5_000,
      intervalleMs: 10_000 /* volontairement enorme : s il attend une seule fois, le test le dit */,
    });

    assert.equal(rapport.issue, ISSUES.CONFORME);
    assert.equal(rapport.passes, 1);
    assert.equal(rapport.attentes, 0, 'la sonde a attendu alors que le schema etait deja pret');
    assert.equal(banc.appels(), Object.keys(REQUETES).length);
    assert.match(rapport.recit, /premiere passe/i);
  } finally {
    await banc.fermer();
  }
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 5. LE PLAFOND DE PRODUCTION NE BOUGE PAS PARCE QUE LE BANC VA VITE
 * ════════════════════════════════════════════════════════════════════════════════════ */

test('5. le plafond est de 10 minutes et l intervalle de 5 s — dimensionnes sur le PIRE cas', () => {
  /* Le pire ecart mesure est de 275 s (queue 506) et le pire deploiement `echo-strapi` de 547 s.
     Le plafond n est donc PAS un reglage a optimiser parce que les essais passent vite : le
     raccourcir rouvrirait la course sur le cas long, celui-la meme qu on ferme. Les bancs ci-dessus
     injectent leurs propres valeurs — ce test verrouille celles que la PRODUCTION emploie. */
  assert.equal(PLAFOND_PAR_DEFAUT_MS, 10 * 60 * 1000);
  assert.equal(INTERVALLE_PAR_DEFAUT_MS, 5 * 1000);
  assert.ok(PLAFOND_PAR_DEFAUT_MS >= 547_000, 'le plafond passe sous le pire deploiement CMS mesure');
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 6. CLASSER UNE REPONSE — la frontiere entre « j attends » et « c est fini »
 * ════════════════════════════════════════════════════════════════════════════════════ */

test('6. un 200 est le seul vert', () => {
  assert.equal(classerReponse(200, '{"data":[]}').verdict, VERDICTS.PRETE);
});

test('6 bis. un 400 ValidationError nomme le champ et fait ATTENDRE', () => {
  const verdict = classerReponse(400, refusDeCle('alternativePartage'));
  assert.equal(verdict.verdict, VERDICTS.SCHEMA_EN_RETARD);
  assert.equal(verdict.champ, 'alternativePartage');
});

test('6 ter. un 400 dont le corps n est PAS du JSON reste lisible', () => {
  /* Un proxy peut rendre une page d erreur en HTML. La sonde ne doit ni exploser ni rendre un
     champ fabrique : elle attend, et elle recopie ce qu elle a recu. */
  const verdict = classerReponse(400, '<html>Bad Request</html>');
  assert.equal(verdict.verdict, VERDICTS.SCHEMA_EN_RETARD);
  assert.equal(verdict.champ, null);
  assert.match(verdict.precision, /Bad Request/);
});

test('6 quater. un 401/403 ne s attend PAS : dix minutes ne fabriquent pas un jeton', () => {
  for (const statut of [401, 403]) {
    assert.equal(classerReponse(statut, '{"error":{"status":401}}').verdict, VERDICTS.REFUSEE);
  }
});

test('6 quinquies. un 502/503 fait attendre — c est le conteneur qui redemarre', () => {
  for (const statut of [502, 503, 504]) {
    assert.equal(classerReponse(statut, 'Bad Gateway').verdict, VERDICTS.INDISPONIBLE);
  }
});

test('6 sexies. un 404 est un VERT — la sonde ne peut pas etre plus stricte que le build', () => {
  /* `src/lib/strapi/client.ts` rend `null` sur 404 sans lever : le single type `Configuration`
     repond 404 tant qu aucune entree n a ete creee (releve du 2026-08-07 sur l instance). Une
     sonde qui attendrait la-dessus bloquerait dix minutes puis ferait echouer un deploiement que
     le build, lui, aurait mene a son terme. */
  assert.equal(classerReponse(404, '').verdict, VERDICTS.PRETE);
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 7. CE QUI NE SE RESORBERA JAMAIS N EST PAS ATTENDU — et les variables sont celles du build
 * ════════════════════════════════════════════════════════════════════════════════════ */

test('7 bis. la sonde lit les variables du BUILD, elle n en resout pas une seconde fois', async () => {
  /* Deux resolutions de `ECHO_STRAPI_URL` feraient sonder une instance et construire contre une
     autre — deux fois 200, donc un build VERT sur la mauvaise cible. C est la classe de defaut
     fermee le 2026-08-11 sur `ECHO_SITE_URL` (commit b6805ac), et le seul moyen de ne pas la
     rouvrir est de n avoir qu un domicile. */
  const source = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('../scripts/attendre-schema.mjs', import.meta.url), 'utf8'),
  );
  assert.match(
    source,
    /import \{ lireConfiguration \} from '\.\.\/src\/lib\/strapi\/client\.ts'/,
    'la sonde doit importer lireConfiguration de client.ts, jamais relire process.env pour son compte',
  );
  assert.doesNotMatch(
    source.replace(/\/\*[\s\S]*?\*\//g, ' '),
    /process\.env\.ECHO_/,
    'la sonde relit une variable ECHO_ pour son compte : un seul domicile',
  );
});

test('7. un jeton refuse arrete la sonde tout de suite, sans consommer le plafond', async () => {
  const banc = await strapiQuiRattrape(() => null);
  /* Un serveur qui refuse le jeton : attendre n y changera jamais rien. */
  await banc.fermer();
  const refusant = http.createServer((_requete, reponse) => {
    reponse.writeHead(403, { 'content-type': 'application/json' }).end('{"error":{"status":403}}');
  });
  await new Promise<void>((ok) => refusant.listen(0, '127.0.0.1', () => ok()));
  const port = (refusant.address() as { port: number }).port;

  try {
    const debut = Date.now();
    const rapport = await attendreSchema({
      baseUrl: `http://127.0.0.1:${port}`,
      jeton: 'jeton-faux',
      plafondMs: 5_000,
      intervalleMs: 1_000,
    });
    assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
    assert.equal(rapport.passes, 1, 'elle a boucle sur un refus qui ne se resorbera jamais');
    assert.ok(Date.now() - debut < 2_000, 'elle a consomme du plafond pour rien');
    assert.match(rapport.recit, /jeton|403/i);
  } finally {
    await new Promise<void>((ok) => refusant.close(() => ok()));
  }
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 8. L EMPREINTE DU CMS — elle est LUE et JOURNALISEE, elle ne BLOQUE JAMAIS
 *
 * LE DEFAUT QUE CETTE SECTION REND OBSERVABLE, sans pretendre le corriger. Le 2026-08-19
 * (tache `d0e0df3b`, commit c951b25, queues 529 et 530), la sonde a rendu « PRET a la premiere
 * passe » a 08:03:46.41 alors que le conteneur CMS NEUF n est devenu sain qu a 08:03:49.67 :
 * elle a donc valide sur l ANCIEN, encore route par le proxy. Sur un vrai changement de schema,
 * elle validerait sur l ancien et le build partirait — il casserait, ou PIRE il reussirait sur
 * l ancien schema en publiant un site perime, sans aucun signal.
 *
 * ⚠️ CE QUE CETTE SECTION VERROUILLE AVANT TOUT — LE NON-BLOCAGE. Le CMS et le site ne portent
 * le meme SHA que sur un push touchant LES DEUX arbres : `watch_paths` ne reveille le CMS que
 * sur `apps/cms/**`, si bien qu il tourne couramment sur un commit plus recent que le site. Une
 * empreinte absente, vide, divergente ou INEGALE a celle du build est donc un etat NORMAL. Une
 * garde d egalite stricte planterait sur tous les deploiements ne touchant que le site
 * ([[garde-en-ferme-dans-un-build-transforme-l-incapacite-en-panne]]). C est pourquoi le verrou
 * de la section balaie tous ces cas et exige `issue` INCHANGEE.
 *
 * ET C EST POURQUOI ON NE MULTIPLIE PAS LES PASSES : sans identification de version, N passes
 * vertes sur l ancien conteneur restent N mensonges. Le remede est que le CMS PARLE
 * (`apps/cms/src/middlewares/empreinte-commit.ts`), pas que la sonde insiste.
 * ════════════════════════════════════════════════════════════════════════════════════ */

const SHA_ANCIEN = '3c7a2fca11d0f4b2e8a7c6d5e4f3a2b1c0d9e8f7';
const SHA_NOUVEAU = '38cf02318f8aac153fb44a5e7fb39ff1769360ee';

/** Les lignes que la sonde a ecrites AU SUJET de l empreinte. */
function lignesEmpreinte(journal: string[]): string[] {
  return journal.filter((ligne) => ligne.startsWith('empreinte'));
}

test('8. la sonde LIT l en-tete servi par le CMS et le rapporte, passe par passe', async () => {
  const banc = await strapiQuiRattrape(
    () => null,
    () => SHA_NOUVEAU,
  );
  const journal: string[] = [];

  try {
    const rapport = await attendreSchema({
      baseUrl: banc.base,
      jeton: JETON,
      plafondMs: 5_000,
      intervalleMs: 10,
      journaliser: (ligne) => journal.push(ligne),
    });

    assert.equal(rapport.issue, ISSUES.CONFORME);
    assert.deepEqual(rapport.empreintes, [SHA_NOUVEAU]);
    assert.equal(rapport.empreinteFinale, SHA_NOUVEAU);
    assert.equal(lignesEmpreinte(journal).length, 1, 'une ligne par passe, meme sans attente');
    assert.match(lignesEmpreinte(journal)[0], new RegExp(SHA_NOUVEAU));
    /* Le recit du rapport la porte aussi : c est lui que le journal de build imprime en dernier. */
    assert.match(rapport.recit, new RegExp(SHA_NOUVEAU));
  } finally {
    await banc.fermer();
  }
});

test('8 bis. NON BLOQUANT — aucun en-tete : la sonde le DIT, et rend 0 quand meme', async () => {
  /* C est l etat du CMS avant le 2026-08-19, et celui de tout developpement local. Une sonde qui
     exigerait l empreinte ferait echouer un deploiement que le CMS honore parfaitement. */
  const banc = await strapiQuiRattrape(() => null);
  const journal: string[] = [];

  try {
    const rapport = await attendreSchema({
      baseUrl: banc.base,
      jeton: JETON,
      plafondMs: 5_000,
      intervalleMs: 10,
      journaliser: (ligne) => journal.push(ligne),
    });

    assert.equal(rapport.issue, ISSUES.CONFORME, 'une empreinte absente NE DOIT PAS bloquer');
    assert.deepEqual(rapport.empreintes, []);
    assert.equal(rapport.empreinteFinale, null);
    assert.match(lignesEmpreinte(journal)[0], /ABSENTE/i);
    assert.ok(
      rapport.avertissements.some((a: string) => /ABSENTE/i.test(a)),
      'le rapport doit AVOUER qu il n a rien pu identifier : un silence se lirait comme un vert',
    );
  } finally {
    await banc.fermer();
  }
});

test('8 ter. NON BLOQUANT — un en-tete VIDE vaut ABSENT, jamais une valeur', async () => {
  /* Deux conteneurs qui ignorent leur version rendraient tous deux la chaine vide, et une
     comparaison naive les declarerait EGAUX : un vert fabrique a partir de deux ignorances. */
  const banc = await strapiQuiRattrape(
    () => null,
    () => '   ',
  );

  try {
    const rapport = await attendreSchema({
      baseUrl: banc.base,
      jeton: JETON,
      plafondMs: 5_000,
      intervalleMs: 10,
    });

    assert.equal(rapport.issue, ISSUES.CONFORME);
    assert.deepEqual(rapport.empreintes, [], 'une chaine vide n est pas une empreinte');
    assert.equal(rapport.empreinteFinale, null);
  } finally {
    await banc.fermer();
  }
});

test('8 quater. NON BLOQUANT — l empreinte CHANGE entre deux passes : les deux sont rapportees', async () => {
  /* LE CAS FONDATEUR, rejoue : le proxy sert l ANCIEN conteneur, puis le NOUVEAU. Sans cette
     lecture, les deux passes rendent « 200 » et rien ne distingue le CMS d avant de celui
     d apres. */
  const requetes = Object.keys(REQUETES).length;
  const banc = await strapiQuiRattrape(
    (appel, url) =>
      Math.ceil(appel / requetes) === 1 && url.includes('/api/articles')
        ? 'alternativePartage'
        : null,
    (appel) => (Math.ceil(appel / requetes) === 1 ? SHA_ANCIEN : SHA_NOUVEAU),
  );
  const journal: string[] = [];

  try {
    const rapport = await attendreSchema({
      baseUrl: banc.base,
      jeton: JETON,
      plafondMs: 5_000,
      intervalleMs: 10,
      journaliser: (ligne) => journal.push(ligne),
    });

    assert.equal(rapport.issue, ISSUES.CONFORME);
    assert.deepEqual(
      rapport.empreintes,
      [SHA_ANCIEN, SHA_NOUVEAU],
      'les empreintes vues doivent l etre DANS L ORDRE : c est le basculement lui-meme',
    );
    assert.equal(rapport.empreinteFinale, SHA_NOUVEAU, 'la derniere passe fait foi');
    assert.match(lignesEmpreinte(journal)[0], new RegExp(SHA_ANCIEN));
    assert.match(lignesEmpreinte(journal)[1], new RegExp(SHA_NOUVEAU));
  } finally {
    await banc.fermer();
  }
});

test('8 quinquies. NON BLOQUANT — deux empreintes DANS LA MEME passe : la bascule est nommee', async () => {
  /* Le proxy bascule AU MILIEU d une passe : les requetes ne sont plus servies par le meme
     conteneur. Le vert de cette passe est alors COMPOSE de deux versions — c est precisement ce
     qu on veut voir ecrit, et jamais ce qu on veut faire echouer. */
  const requetes = Object.keys(REQUETES).length;
  const banc = await strapiQuiRattrape(
    () => null,
    (appel) => (appel <= Math.floor(requetes / 2) ? SHA_ANCIEN : SHA_NOUVEAU),
  );
  const journal: string[] = [];

  try {
    const rapport = await attendreSchema({
      baseUrl: banc.base,
      jeton: JETON,
      plafondMs: 5_000,
      intervalleMs: 10,
      journaliser: (ligne) => journal.push(ligne),
    });

    assert.equal(rapport.issue, ISSUES.CONFORME);
    assert.deepEqual([...rapport.empreintes].sort(), [SHA_NOUVEAU, SHA_ANCIEN].sort());
    assert.equal(
      rapport.empreinteFinale,
      null,
      'une passe servie par DEUX conteneurs ne designe aucune version : ne pas en elire une',
    );
    assert.match(lignesEmpreinte(journal)[0], /DIVERGENTES/i);
    assert.ok(rapport.avertissements.some((a: string) => /plusieurs|divergent/i.test(a)));
  } finally {
    await banc.fermer();
  }
});

test('8 sexies. NON BLOQUANT — une empreinte INEGALE a celle du build est un AVERTISSEMENT', async () => {
  /* LE CAS QU IL NE FAUT SURTOUT PAS RENDRE BLOQUANT. Un push qui ne touche que `apps/web/**` ne
     reveille pas le CMS : le site se deploie sur son commit, le CMS reste sur le sien, les deux
     empreintes DIFFERENT, et tout est parfaitement normal. */
  const banc = await strapiQuiRattrape(
    () => null,
    () => SHA_ANCIEN,
  );

  try {
    const rapport = await attendreSchema({
      baseUrl: banc.base,
      jeton: JETON,
      plafondMs: 5_000,
      intervalleMs: 10,
      empreinteAttendue: SHA_NOUVEAU,
    });

    assert.equal(rapport.issue, ISSUES.CONFORME, 'l inegalite NE DOIT PAS faire echouer le build');
    assert.ok(
      rapport.avertissements.some((a: string) => a.includes(SHA_ANCIEN) && a.includes(SHA_NOUVEAU)),
      'l avertissement doit NOMMER les deux empreintes, sinon il n envoie chercher nulle part',
    );
  } finally {
    await banc.fermer();
  }
});

test('8 septies. LE TEMOIN — empreintes egales : plus aucun avertissement d inegalite', async () => {
  const banc = await strapiQuiRattrape(
    () => null,
    () => SHA_NOUVEAU,
  );

  try {
    const rapport = await attendreSchema({
      baseUrl: banc.base,
      jeton: JETON,
      plafondMs: 5_000,
      intervalleMs: 10,
      empreinteAttendue: SHA_NOUVEAU,
    });

    assert.equal(rapport.issue, ISSUES.CONFORME);
    assert.equal(
      rapport.avertissements.filter((a: string) => /differe|inegal/i.test(a)).length,
      0,
      'le test precedent ne prouverait rien si cet avertissement tombait aussi sur l egalite',
    );
  } finally {
    await banc.fermer();
  }
});

test('8 octies. LE MODE DEGRADE EST AVOUE — le build ignore aujourd hui sa propre empreinte', async () => {
  /* `include_source_commit_in_build` vaut `false` sur les trois applications Coolify : le build du
     site ne connait PAS son SHA, et ne peut donc rien comparer. Le taire laisserait lire les
     lignes d empreinte comme une verification ; ce n est qu une observation. */
  const banc = await strapiQuiRattrape(
    () => null,
    () => SHA_NOUVEAU,
  );

  try {
    const rapport = await attendreSchema({
      baseUrl: banc.base,
      jeton: JETON,
      plafondMs: 5_000,
      intervalleMs: 10,
    });

    assert.ok(
      rapport.avertissements.some((a: string) => /degrade/i.test(a)),
      'sans empreinte attendue, le rapport doit dire qu il n a RIEN compare',
    );
  } finally {
    await banc.fermer();
  }
});

test('8 nonies. VERROU — aucune configuration d empreinte ne change l issue de la sonde', async () => {
  /* LE GARDE-FOU PRINCIPAL DU LOT, et il est ecrit pour le lecteur d apres. La tentation naturelle
     est de « finir le travail » en faisant echouer la sonde sur une empreinte inegale. Ce test
     l interdit : les deux applications ne partagent leur SHA que sur un push touchant les deux
     arbres, et un build qui echouerait sur ce motif serait rouge la plupart du temps.

     On balaie les six etats possibles de l empreinte contre le MEME schema (toujours pret) et on
     exige la MEME issue. Le temoin est en fin de test : le schema, lui, fait toujours echouer. */
  const cas: Array<[string, (appel: number) => string | null, string | undefined]> = [
    ['absente', () => null, undefined],
    ['vide', () => '', undefined],
    ['stable', () => SHA_ANCIEN, undefined],
    ['divergente dans la passe', (appel) => (appel % 2 === 0 ? SHA_ANCIEN : SHA_NOUVEAU), undefined],
    ['inegale au build', () => SHA_ANCIEN, SHA_NOUVEAU],
    ['egale au build', () => SHA_NOUVEAU, SHA_NOUVEAU],
  ];

  for (const [nom, empreinteDe, attendue] of cas) {
    const banc = await strapiQuiRattrape(() => null, empreinteDe);
    try {
      const rapport = await attendreSchema({
        baseUrl: banc.base,
        jeton: JETON,
        plafondMs: 5_000,
        intervalleMs: 10,
        empreinteAttendue: attendue,
      });
      assert.equal(rapport.issue, ISSUES.CONFORME, `empreinte ${nom} : la sonde a BLOQUE`);
      assert.equal(rapport.passes, 1, `empreinte ${nom} : la sonde a boucle sur une empreinte`);
    } finally {
      await banc.fermer();
    }
  }

  /* LE TEMOIN. Le SCHEMA, lui, fait toujours echouer — sans quoi les six verts ci-dessus
     prouveraient seulement que cette sonde ne sait plus echouer du tout. */
  const casse = await strapiQuiRattrape(
    (_appel, url) => (url.includes('/api/articles') ? 'alternativePartage' : null),
    () => SHA_NOUVEAU,
  );
  try {
    const rapport = await attendreSchema({
      baseUrl: casse.base,
      jeton: JETON,
      plafondMs: 120,
      intervalleMs: 10,
      empreinteAttendue: SHA_NOUVEAU,
    });
    assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
    assert.equal(rapport.obstacle?.champ, 'alternativePartage');
  } finally {
    await casse.fermer();
  }
});

test('8 decies. lireEmpreinte lit l en-tete sans se soucier de la casse, et refuse le vide', () => {
  /* Les noms d en-tete HTTP sont insensibles a la casse (RFC 9110) : un proxy peut les
     renormaliser. `headers.get` s en charge — ce test verrouille qu on ne l a pas remplace par un
     acces direct a une cle en dur, qui rendrait `null` sur un proxy poli. */
  assert.equal(lireEmpreinte(new Headers({ 'X-ECHO-COMMIT': SHA_NOUVEAU })), SHA_NOUVEAU);
  assert.equal(lireEmpreinte(new Headers({ 'x-echo-commit': `  ${SHA_NOUVEAU}  ` })), SHA_NOUVEAU);
  assert.equal(lireEmpreinte(new Headers({})), null);
  assert.equal(lireEmpreinte(new Headers({ 'x-echo-commit': '   ' })), null);
  assert.equal(lireEmpreinte(null), null, 'une reponse sans en-tetes ne doit pas faire lever');
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 8 bis. L EMPREINTE DU BUILD LUI-MEME — elle se LIT, et surtout elle se DIT
 *
 * LE DEFAUT QUE CETTE SOUS-SECTION FERME, et il est celui du LECTEUR D APRES. Jusqu ici, la seule
 * trace de l empreinte du SITE dans un journal de build etait son ABSENCE : le mode DEGRADE. Le
 * jour ou Coolify la livre, cette ligne disparait — et RIEN ne la remplace. « le build connait son
 * SHA » et « la ligne a ete supprimee du code » produisent alors exactement le meme journal :
 * c est le mode d echec ou succes et echec rendent la meme sortie
 * ([[quand-succes-et-echec-rendent-la-meme-sortie]]). Une empreinte connue doit donc s ECRIRE,
 * positivement, en nommant le SHA.
 *
 * ⚠️ ELLE NE DEVIENT JAMAIS BLOQUANTE, et le VERROU de `8 nonies` le balaie deja sur les six
 * etats. Une empreinte absente vaut « je ne sais pas » : c est le cas du developpement local et de
 * tout banc, et une garde qui planterait la planterait TOUTES les constructions
 * ([[garde-en-ferme-dans-un-build-transforme-l-incapacite-en-panne]]).
 * ════════════════════════════════════════════════════════════════════════════════════ */

/** Les lignes que la sonde a ecrites au sujet de l empreinte DU BUILD — pas de celle du CMS. */
function lignesEmpreinteDuBuild(journal: string[]): string[] {
  return journal.filter((ligne) => ligne.startsWith('empreinte du BUILD'));
}

/** Pose `SOURCE_COMMIT` le temps d un appel, et la restaure — `undefined` = variable absente. */
function avecSourceCommit<T>(valeur: string | undefined, faire: () => T): T {
  const avant = process.env.SOURCE_COMMIT;
  if (valeur === undefined) delete process.env.SOURCE_COMMIT;
  else process.env.SOURCE_COMMIT = valeur;
  try {
    return faire();
  } finally {
    if (avant === undefined) delete process.env.SOURCE_COMMIT;
    else process.env.SOURCE_COMMIT = avant;
  }
}

test('8 undecies. empreinteDuBuild LIT `SOURCE_COMMIT` quand elle arrive, et rend null sinon', () => {
  /* LES DEUX SENS, sur la MEME fonction. Le sens « presente » est celui qu allumera le reglage
     Coolify `include_source_commit_in_build` sur `echo-site` ; le sens « absente » est l etat
     d aujourd hui, celui du developpement local, et celui de toute image de construction ou la
     variable n est pas injectee. Aucun des deux ne leve. */
  assert.equal(avecSourceCommit(SHA_NOUVEAU, empreinteDuBuild), SHA_NOUVEAU);
  assert.equal(
    avecSourceCommit(`  ${SHA_NOUVEAU}\n`, empreinteDuBuild),
    SHA_NOUVEAU,
    'une valeur bordee d espaces vient d un shell, pas d une intention : elle se rogne',
  );
  assert.equal(avecSourceCommit(undefined, empreinteDuBuild), null);
  assert.equal(
    avecSourceCommit('   ', empreinteDuBuild),
    null,
    'une variable BLANCHE est une ignorance, pas une version : la traiter en SHA fabriquerait ' +
      'une comparaison entre deux vides',
  );
});

test('8 duodecies. empreinte du BUILD CONNUE : elle est JOURNALISEE, et le mode DEGRADE se tait', async () => {
  const banc = await strapiQuiRattrape(
    () => null,
    () => SHA_NOUVEAU,
  );
  const journal: string[] = [];

  try {
    const rapport = await attendreSchema({
      baseUrl: banc.base,
      jeton: JETON,
      plafondMs: 5_000,
      intervalleMs: 10,
      empreinteAttendue: SHA_NOUVEAU,
      journaliser: (ligne) => journal.push(ligne),
    });

    /* LE COMPTE D ABORD. Une extraction qui ne trouverait plus rien rendrait un tableau vide, et
       un `match` sur `[0]` leverait au lieu de rougir proprement — pire, une assertion ecrite
       « au moins une » virerait au vert par disette le jour ou la ligne changerait de prefixe. */
    const lignes = lignesEmpreinteDuBuild(journal);
    assert.equal(lignes.length, 1, 'l empreinte du build s ecrit UNE fois, pas une par passe');
    assert.match(lignes[0], new RegExp(SHA_NOUVEAU), 'la ligne doit NOMMER le SHA, pas l evoquer');

    assert.equal(
      rapport.avertissements.filter((a: string) => /degrade/i.test(a)).length,
      0,
      'le build connait son empreinte : annoncer le mode DEGRADE serait un mensonge',
    );
    assert.equal(rapport.issue, ISSUES.CONFORME);
  } finally {
    await banc.fermer();
  }
});

test('8 terdecies. empreinte du BUILD ABSENTE : mode DEGRADE annonce, et JAMAIS un echec', async () => {
  /* L AUTRE SENS, et c est la regle non negociable du lot : zero empreinte vaut « je ne sais
     pas ». Aucune ligne ne pretend alors connaitre le SHA du site — l inventer, ne serait-ce
     qu en ecrivant « empreinte du BUILD : inconnue », ferait grep-er une valeur qui n existe pas. */
  const banc = await strapiQuiRattrape(
    () => null,
    () => SHA_NOUVEAU,
  );
  const journal: string[] = [];

  try {
    const rapport = await attendreSchema({
      baseUrl: banc.base,
      jeton: JETON,
      plafondMs: 5_000,
      intervalleMs: 10,
      journaliser: (ligne) => journal.push(ligne),
    });

    assert.equal(
      lignesEmpreinteDuBuild(journal).length,
      0,
      'sans SOURCE_COMMIT, il n y a aucune empreinte du build a journaliser',
    );
    assert.ok(
      rapport.avertissements.some((a: string) => /degrade/i.test(a)),
      'et le rapport doit AVOUER qu il n a rien compare',
    );
    assert.equal(rapport.issue, ISSUES.CONFORME, 'une empreinte absente n echoue JAMAIS');
  } finally {
    await banc.fermer();
  }
});
