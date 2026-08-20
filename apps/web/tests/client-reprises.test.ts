/**
 * LE BUILD RESISTE A LA FENETRE DE BASCULE DU CMS — il ne devine plus, il REESSAIE.
 *
 * LE DEFAUT QUE CE FICHIER FERME, mesure et non suppose (tache `d0e0df3b`, journaux Coolify du
 * commit c951b25, 2026-08-19). `scripts/attendre-schema.mjs` sonde le CMS AVANT la construction :
 * elle mesure donc a un INSTANT, quand le build, lui, consomme le CMS pendant les trente secondes
 * qui suivent. Rien ne couvrait cet intervalle. Chronologie a la seconde, recoupee entre le
 * deploiement du CMS (queue 529) et celui du site (queue 530) :
 *
 *   08:03:07.68  CMS   Rolling update started.
 *   08:03:45.47  SITE  [attendre-schema] sonde 6 requete(s) declaree(s) — plafond 600,0 s.
 *   08:03:46.41  SITE  [attendre-schema] schema PRET a la premiere passe (aucune attente).
 *   08:03:49.67  CMS   « healthy »            <- 3,2 s APRES le vert de la sonde
 *   08:03:49.95  CMS   Removing old containers.
 *   08:03:50.11  SITE  npm run build : Strapi a repondu 502 sur /api/articles?… : Bad Gateway
 *   08:03:51.03  SITE  ERROR: process « npm run build » did not complete successfully: exit code: 1
 *   08:03:52.64  CMS   Rolling update completed.
 *
 * LA PANNE TIENT DANS L INSTANT OU LE PROXY RETIRE L ANCIEN CONTENEUR : le `502` tombe 160 ms
 * apres `Removing old containers`. Aucune attente prealable, si longue soit-elle, ne peut couvrir
 * un instant qui tombe APRES elle : c est au build de le traverser. Le plafond de la sonde n a
 * d ailleurs jamais ete atteint — elle a rendu la main en 0,9 s — donc l allonger n aurait rien
 * change ([[preuve-doit-exercer-critere-acceptation]]).
 *
 * ⚠️ CE FICHIER A DIT, JUSQU AU 2026-08-20, QUE « LA FENETRE MESUREE FAIT ~4 s ». C etait l ecart
 * entre deux evenements d une seule queue, pas la largeur d une fenetre — faux d un facteur sept.
 * Mesure sur 54 bascules (tache `a1d26d8e`) : la bascule dure 30,3 s en mediane (14,5 a 35,9 s,
 * 54 sur 54), et pendant tout ce temps les DEUX conteneurs sont sains et repondent `200`. LES
 * REPRISES NE S Y DECLENCHENT DONC JAMAIS, ET C EST NORMAL : il n y a rien a reprendre quand le
 * corps est valide. Ce que ce fichier verrouille est le BORD de cette fenetre — le retrait — et
 * rien d autre. Le doublon de trente secondes releve de l EMPREINTE de commit servie par le CMS
 * (`apps/cms/src/middlewares/empreinte-commit.ts`), pas d un reglage de delai ici.
 *
 * ⚠️ POURQUOI UNE RECETTE « PUSH CROISE » NE PROUVE PRESQUE RIEN, ET POURQUOI CE BANC EST LA SEULE
 * PREUVE FIABLE. Un push qui touche les deux arbres met bien les deux applications en file a la
 * MEME seconde, mais cela ne fait pas se rencontrer le retrait et la lecture : sur 199
 * constructions mesurees depuis le 2026-08-03, TROIS ont chevauche une fenetre (queues 263, 504,
 * 530). Mesure du 2026-08-19, faite pour ce correctif — push croise sur `24608fe`, queues 534 et
 * 535 creees a 12:06:34 :
 *
 *   12:08:29.38  CMS   Removing old containers.
 *   12:08:30.56  CMS   Rolling update completed.
 *   12:08:57     SITE  [strapi:articles] 48 entree(s) chargee(s)   <- 26 s APRES le retrait
 *
 * Le deploiement du site est passe VERT sans qu une seule reprise ne se declenche : la fenetre
 * etait refermee depuis vingt-six secondes. Une recette qui n exerce pas la fenetre ne dit rien
 * du remede — elle dit seulement que le hasard a bien voulu ([[controle-jamais-execute-
 * reellement-nest-pas-vert]]). Exercer le bord DEMANDE de rendre le CMS injoignable PENDANT la
 * lecture ; c est ce que fait ce banc a chaque execution, et c est pourquoi il ne se remplace pas
 * par une observation de production.
 *
 * CE QUE CE FICHIER TIENT, et c est l invariant plutot que le cas :
 *
 *   1. le CMS momentanement absent (502/503/504, connexion refusee) fait REESSAYER, et le banc
 *      verifie qu il a REELLEMENT servi son refus avant son 200 : « il a repris » et « il n a
 *      jamais eu a reprendre » produisent autrement la meme observation — un build vert ;
 *   2. le premier reessai part en MOINS D UNE SECONDE. Le retrait a dure moins d une seconde : un
 *      intervalle taille sur celui de la sonde (5 s) ferait perdre cinq secondes de build pour
 *      rien ;
 *   3. ce qui ne se resorbera JAMAIS ne s attend PAS — 400, 401, 403, 500 sortent a la PREMIERE
 *      requete. Un `400 ValidationError` est l affaire de la sonde, qui le nomme ; le reprendre
 *      seize fois ne ferait qu ajouter dix minutes a un build qui va echouer ;
 *   4. au plafond, l echec DIT ce qu il a tente — nombre de reprises, temps consomme, statut ;
 *   5. les reprises sont REELLEMENT CABLEES sur les deux entrees du build (`chargerCollection`,
 *      `chargerConfiguration`), pagination comprise : un correctif qui vivrait a cote du chemin
 *      emprunte serait vert sans rien garder ([[controle-jamais-execute-reellement-nest-pas-vert]]) ;
 *   6. une page 2 en 502 est reprise et le corpus n est PAS ampute — une liste amputee se recette
 *      « conforme » sur ce qui manque.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';

import {
  DELAIS_DE_REPRISE_MS,
  PLAFOND_DE_REPRISE_MS,
  STATUTS_REPRIS,
  appelerAvecReprises,
  chargerCollection,
  chargerConfiguration,
} from '../src/lib/strapi/client.ts';

const JETON = 'jeton-de-banc';

interface Banc {
  base: string;
  /** Nombre d appels recus, tous chemins confondus. */
  appels: () => number;
  /** Nombre de refus REELLEMENT servis — c est lui qui distingue « a repris » de « a reussi ». */
  refus: () => number;
  fermer: () => Promise<void>;
}

/**
 * Un CMS de substitution qui BASCULE — c est tout l objet du banc.
 *
 * @param decider Recoit le numero d appel (1, 2, …) et l URL ; rend `null` pour servir la reponse
 *   normale, ou un statut a refuser. C est ainsi qu on fabrique la fenetre de bascule.
 * @param corps Ce que rend un appel accepte. Par defaut, une collection vide d une seule page.
 */
function cmsQuiBascule(
  decider: (appel: number, url: string) => number | null,
  corps: (url: string) => unknown = () => ({ data: [], meta: { pagination: { page: 1, pageCount: 1 } } }),
): Promise<Banc> {
  let appels = 0;
  let refus = 0;

  const serveur = http.createServer((requete, reponse) => {
    appels += 1;
    const statut = decider(appels, requete.url ?? '');
    if (statut === null) {
      reponse
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify(corps(requete.url ?? '')));
      return;
    }
    refus += 1;
    reponse
      .writeHead(statut, { 'content-type': 'text/html' })
      .end('<html><head><title>Bad Gateway</title></head><body>Bad Gateway</body></html>');
  });

  return new Promise<Banc>((ok) => {
    serveur.listen(0, '127.0.0.1', () => {
      const adresse = serveur.address() as { port: number };
      ok({
        base: `http://127.0.0.1:${adresse.port}`,
        appels: () => appels,
        refus: () => refus,
        fermer: () => new Promise<void>((ferme) => serveur.close(() => ferme())),
      });
    });
  });
}

/** Des reprises de banc : meme logique, sans les secondes reelles. */
function repriseInstantanee(surcharge: Record<string, unknown> = {}) {
  const attentes: number[] = [];
  const lignes: string[] = [];
  let horodatage = 0;
  return {
    attentes,
    lignes,
    options: {
      patienter: async (ms: number) => {
        attentes.push(ms);
        horodatage += ms;
      },
      horloge: () => horodatage,
      journaliser: (ligne: string) => lignes.push(ligne),
      ...surcharge,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 1. LA FENETRE DE BASCULE SE TRAVERSE — et le banc prouve qu elle a bien ete servie
 * ════════════════════════════════════════════════════════════════════════════════════ */

for (const statut of [502, 503, 504]) {
  test(`1. un ${statut} pendant la bascule est REPRIS, et le build aboutit`, async () => {
    const banc = await cmsQuiBascule((appel) => (appel === 1 ? statut : null));
    const reprise = repriseInstantanee();

    try {
      const reponse = await appelerAvecReprises(`${banc.base}/api/articles`, JETON, reprise.options);
      assert.deepEqual(reponse, { data: [], meta: { pagination: { page: 1, pageCount: 1 } } });
      assert.equal(banc.refus(), 1, `le banc doit avoir REELLEMENT servi un ${statut}`);
      assert.equal(banc.appels(), 2, 'une reprise, donc deux requetes');
    } finally {
      await banc.fermer();
    }
  });
}

test('1 bis. un CMS INJOIGNABLE est repris comme un 502 — c est la meme fenetre', async () => {
  /* Le conteneur a disparu et le suivant n a pas encore pris la main : la requete ne recoit
     aucun statut, elle est REFUSEE au niveau TCP. Un correctif qui ne couvrirait que les codes
     HTTP laisserait passer la moitie de la fenetre. On ouvre un banc pour obtenir un port libre,
     puis on le ferme : plus rien n ecoute derriere. */
  const banc = await cmsQuiBascule(() => null);
  const base = banc.base;
  await banc.fermer();

  const reprise = repriseInstantanee();

  await assert.rejects(
    () =>
      appelerAvecReprises(`${base}/api/articles`, JETON, {
        ...reprise.options,
        plafondMs: 3_000,
      }),
    (erreur: Error) => {
      assert.match(erreur.message, /injoignable/i, 'l echec doit dire que le CMS ne repond pas');
      assert.match(erreur.message, /\/api\/articles/, 'et sur quelle requete');
      return true;
    },
  );
  assert.ok(
    reprise.attentes.length >= 1,
    'une erreur reseau doit consommer des reprises, pas sortir a la premiere',
  );
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 2. LE PREMIER REESSAI PART EN MOINS D UNE SECONDE — le retrait ne dure pas une seconde
 * ════════════════════════════════════════════════════════════════════════════════════ */

test('2. le premier reessai part sous la seconde, puis les delais montent', async () => {
  assert.ok(
    DELAIS_DE_REPRISE_MS[0] < 1_000,
    `le premier delai vaut ${DELAIS_DE_REPRISE_MS[0]} ms : la bascule mesuree (08:03:49,95 -> ` +
      '08:03:50,11) se manquerait avec un intervalle taille sur la sonde (5 000 ms)',
  );
  for (let index = 1; index < DELAIS_DE_REPRISE_MS.length; index += 1) {
    assert.ok(
      DELAIS_DE_REPRISE_MS[index] >= DELAIS_DE_REPRISE_MS[index - 1],
      'les delais ne doivent jamais redescendre : une panne longue ne se martele pas',
    );
  }
});

test('2 bis. les delais REELLEMENT observes sont ceux qui sont declares', async () => {
  const banc = await cmsQuiBascule((appel) => (appel <= 3 ? 502 : null));
  const reprise = repriseInstantanee();

  try {
    await appelerAvecReprises(`${banc.base}/api/articles`, JETON, reprise.options);
    assert.deepEqual(reprise.attentes, DELAIS_DE_REPRISE_MS.slice(0, 3));
  } finally {
    await banc.fermer();
  }
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 3. CE QUI NE SE RESORBERA JAMAIS NE S ATTEND PAS — une seule requete, et on sort
 * ════════════════════════════════════════════════════════════════════════════════════ */

for (const statut of [400, 401, 403, 500]) {
  test(`3. un ${statut} sort a la PREMIERE requete — le reprendre n ajouterait que du delai`, async () => {
    const banc = await cmsQuiBascule(() => statut);
    const reprise = repriseInstantanee();

    try {
      await assert.rejects(() =>
        appelerAvecReprises(`${banc.base}/api/articles`, JETON, reprise.options),
      );
      assert.equal(banc.appels(), 1, `un ${statut} ne doit JAMAIS etre repris`);
      assert.deepEqual(reprise.attentes, [], 'aucune attente ne doit avoir ete consommee');
    } finally {
      await banc.fermer();
    }
  });
}

test('3 bis. les statuts repris sont exactement ceux de la bascule du proxy', () => {
  assert.deepEqual([...STATUTS_REPRIS].sort(), [502, 503, 504]);
});

test('3 ter. un 404 reste un « rien a lire », sans reprise ni erreur', async () => {
  const banc = await cmsQuiBascule(() => 404);
  const reprise = repriseInstantanee();

  try {
    const reponse = await appelerAvecReprises(`${banc.base}/api/configuration`, JETON, reprise.options);
    assert.equal(reponse, null, 'le 404 du single type reste un null, comme avant');
    assert.equal(banc.appels(), 1);
  } finally {
    await banc.fermer();
  }
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 4. AU PLAFOND, L ECHEC DIT CE QU IL A TENTE — sinon il se lit comme un CMS casse
 * ════════════════════════════════════════════════════════════════════════════════════ */

test('4. un CMS qui ne revient pas fait echouer le build en NOMMANT ce qui a ete tente', async () => {
  const banc = await cmsQuiBascule(() => 502);
  const reprise = repriseInstantanee();

  try {
    await assert.rejects(
      () =>
        appelerAvecReprises(`${banc.base}/api/articles`, JETON, {
          ...reprise.options,
          plafondMs: 30_000,
        }),
      (erreur: Error) => {
        assert.match(erreur.message, /502/, 'le statut doit rester dans le message');
        assert.match(erreur.message, /reprise/i, 'le message doit dire qu il a repris');
        assert.match(erreur.message, /\/api\/articles/, 'et sur quelle requete');
        return true;
      },
    );
    assert.ok(banc.appels() >= 3, `le plafond doit avoir ete consomme (${banc.appels()} appels)`);
  } finally {
    await banc.fermer();
  }
});

test('4 bis. le plafond de PRODUCTION couvre la bascule sans qu un banc rapide le raccourcisse', () => {
  assert.equal(PLAFOND_DE_REPRISE_MS, 10 * 60 * 1000);
});

test('4 ter. chaque reprise laisse UNE ligne au journal du build', async () => {
  const banc = await cmsQuiBascule((appel) => (appel <= 2 ? 503 : null));
  const reprise = repriseInstantanee();

  try {
    await appelerAvecReprises(`${banc.base}/api/articles`, JETON, reprise.options);
    assert.equal(reprise.lignes.length, 2, 'un journal muet ne distingue pas « a repris » de « a reussi »');
    assert.match(reprise.lignes[0], /503/);
  } finally {
    await banc.fermer();
  }
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 5. LE CABLAGE — les reprises vivent SUR le chemin du build, pas a cote
 * ════════════════════════════════════════════════════════════════════════════════════ */

test('5. `chargerCollection` traverse la bascule', async () => {
  const banc = await cmsQuiBascule((appel) => (appel === 1 ? 502 : null), () => ({
    data: [{ id: 1 }],
    meta: { pagination: { page: 1, pageCount: 1 } },
  }));
  const reprise = repriseInstantanee();

  try {
    const entrees = await chargerCollection(
      { baseUrl: banc.base, jeton: JETON, reprises: reprise.options },
      'articles',
      'fr',
    );
    assert.equal(banc.refus(), 1, 'le banc doit avoir REELLEMENT servi le 502');
    assert.deepEqual(entrees, [{ id: 1 }]);
  } finally {
    await banc.fermer();
  }
});

test('5 bis. `chargerConfiguration` traverse la bascule', async () => {
  const banc = await cmsQuiBascule((appel) => (appel === 1 ? 504 : null), () => ({
    data: { nomSite: 'L Echo des Hauts' },
  }));
  const reprise = repriseInstantanee();

  try {
    const configuration = await chargerConfiguration(
      { baseUrl: banc.base, jeton: JETON, reprises: reprise.options },
      'fr',
    );
    assert.equal(banc.refus(), 1);
    assert.deepEqual(configuration, { nomSite: 'L Echo des Hauts' });
  } finally {
    await banc.fermer();
  }
});

test('5 ter. une PAGE 2 en 502 est reprise — le corpus n est pas ampute', async () => {
  /* La bascule ne choisit pas son moment : elle peut tomber entre deux pages d une meme
     collection. Sans reprise ici, le build ne s arreterait meme pas — il rendrait une liste
     amputee, qui se recette « conforme » sur ce qui manque. */
  let refusServi = false;
  const banc = await cmsQuiBascule(
    (_appel, url) => {
      if (/page%5D=2/.test(url) && !refusServi) {
        refusServi = true;
        return 502;
      }
      return null;
    },
    (url) => ({
      data: [{ page: /page%5D=2/.test(url) ? 2 : 1 }],
      meta: { pagination: { page: /page%5D=2/.test(url) ? 2 : 1, pageCount: 2 } },
    }),
  );
  const reprise = repriseInstantanee();

  try {
    const entrees = await chargerCollection(
      { baseUrl: banc.base, jeton: JETON, reprises: reprise.options },
      'articles',
      'fr',
    );
    assert.ok(refusServi, 'le banc doit avoir REELLEMENT refuse la page 2');
    assert.deepEqual(entrees, [{ page: 1 }, { page: 2 }], 'les deux pages doivent etre la');
  } finally {
    await banc.fermer();
  }
});
