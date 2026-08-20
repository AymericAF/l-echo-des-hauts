/**
 * UNE CONSTRUCTION QUI A LU DEUX EMPREINTES EST REFUSEE — et une qui n en a lu AUCUNE passe.
 *
 * LE DEFAUT QUE CE FICHIER FERME, mesure et non suppose (taches `a1d26d8e` puis `298d4c27`,
 * decision `982567fa` approuvee le 2026-08-20). Pendant la bascule du CMS, DEUX conteneurs sont
 * vivants, sains, et portent des etiquettes Traefik IDENTIQUES au caractere pres : `echoback.
 * ayfiweb.fr` a deux amonts servant deux commits, et TOUS DEUX repondent `200` avec un corps
 * valide. Mesure sur 54 bascules depuis le 2026-08-03 : la fenetre dure 30,3 s en mediane
 * (14,5 a 35,9 s, 54 sur 54).
 *
 * ⚠️ LE CHIFFRE DE « ~4 s » QUI A CIRCULE EST FAUX D UN FACTEUR SEPT. C etait l ecart entre deux
 * evenements d une seule queue, pas la largeur d une fenetre. Ne pas le reintroduire.
 *
 * POURQUOI AUCUN AUTRE REMEDE N ATTRAPE CELA. Les reprises de `client.ts` couvrent 502/503/504 :
 * elles ne se declenchent JAMAIS ici, parce qu il n y a rien a reprendre — les deux reponses sont
 * des `200` valides. La sonde `attendre-schema.mjs` rend la main a sa premiere passe (~1 s) quand
 * la construction, elle, s execute APRES, pendant 2 a 30 s. Ce que ce fichier garde est le seul
 * fait observable depuis le build : DEUX VERSIONS ONT REPONDU A LA MEME CONSTRUCTION.
 *
 * LA REGLE, ET ELLE N EST PAS NEGOCIABLE :
 *
 *   ZERO empreinte vue vaut « je ne sais pas », et n echoue JAMAIS.
 *   Seules DEUX empreintes DISTINCTES pendant une meme construction font refuser.
 *
 * Une garde qui echouerait sur une empreinte ABSENTE planterait TOUTES les constructions, y
 * compris celles qui n ont aucune course a rattraper — le developpement local, ou `SOURCE_COMMIT`
 * n existe pas, en tete. C est le mode d echec documente en tete de `apps/web/nixpacks.toml` :
 * une incapacite transformee en panne ([[garde-en-ferme-dans-un-build-transforme-l-incapacite-en-panne]]).
 *
 * ⚠️ CE QU IL NE FAUT PAS ESSAYER DE FAIRE — comparer l empreinte du CMS a celle du BUILD. Le
 * build IGNORE la sienne : `include_source_commit_in_build` vaut `false` sur les trois
 * applications, et Coolify efface `.git` avant de construire. Seul un CHANGEMENT pendant la
 * construction est detectable, et c est ce qui est detecte ici.
 *
 * CE QUE CE FICHIER PROUVE, EN LE CASSANT, DANS LES QUATRE SENS — sans le quatrieme, les trois
 * verts prouveraient seulement que la garde est MUETTE ([[un-controle-se-prouve-en-cassant-ce-qu-il-protege]]) :
 *
 *   1. DEUX empreintes distinctes  -> la construction ROUGIT, en nommant les deux ;
 *   2. UNE seule empreinte         -> elle PASSE ;
 *   3. AUCUNE empreinte            -> elle PASSE, et le verdict AVERTIT ;
 *   4. TEMOIN                      -> une construction sait ENCORE echouer pour une autre raison.
 *
 * MODE D ECHEC ASSUME : refuser une construction qui n avait rien compose — un push touchant les
 * DEUX arbres redeploie le CMS pendant que le site construit, et la bascule est alors legitime.
 * Le prix est un redeploiement, contre une erreur inverse qui, elle, est SILENCIEUSE.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  EN_TETE_EMPREINTE,
  creerRegistre,
  inscrire,
  lireEmpreinte,
  verdict,
} from '../src/lib/strapi/empreintes.ts';
import {
  appelerAvecReprises,
  chargerCollection,
  chargerConfiguration,
  registreDesEmpreintes,
  reinitialiserRegistreDesEmpreintes,
} from '../src/lib/strapi/client.ts';

const JETON = 'jeton-de-banc';
const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

interface Banc {
  base: string;
  appels: () => number;
  fermer: () => Promise<void>;
}

/**
 * Un CMS de substitution qui peut CHANGER DE VERSION en cours de route — c est tout l objet du
 * banc. `empreinteDe` rend la valeur de l en-tete pour l appel n, ou `null` pour n en poser AUCUN
 * (le cas du developpement local, ou `SOURCE_COMMIT` n existe pas).
 */
function cmsQuiChangeDeVersion(
  empreinteDe: (appel: number, url: string) => string | null,
  statutDe: (appel: number, url: string) => number = () => 200,
  corps: (url: string) => unknown = () => ({
    data: [],
    meta: { pagination: { page: 1, pageCount: 1 } },
  }),
): Promise<Banc> {
  let appels = 0;

  const serveur = http.createServer((requete, reponse) => {
    appels += 1;
    const url = requete.url ?? '';
    const empreinte = empreinteDe(appels, url);
    const entetes: Record<string, string> = { 'content-type': 'application/json' };
    /* L en-tete est pose sur TOUTES les reponses, erreurs comprises : c est ce que fait le
       middleware du CMS, qui le pose AVANT `next()`. */
    if (empreinte !== null) entetes[EN_TETE_EMPREINTE] = empreinte;
    reponse.writeHead(statutDe(appels, url), entetes).end(JSON.stringify(corps(url)));
  });

  return new Promise<Banc>((ok) => {
    serveur.listen(0, '127.0.0.1', () => {
      const adresse = serveur.address() as { port: number };
      ok({
        base: `http://127.0.0.1:${adresse.port}`,
        appels: () => appels,
        fermer: () => new Promise<void>((ferme) => serveur.close(() => ferme())),
      });
    });
  });
}

/** Le registre est un etat de PROCESSUS : sans remise a zero, le banc n° 2 herite du banc n° 1. */
test.beforeEach(() => reinitialiserRegistreDesEmpreintes());

/* ══════════════════════════════════════════════════════════════════════════════════════
 * SENS 1 — DEUX EMPREINTES DISTINCTES FONT ROUGIR LA CONSTRUCTION
 * ════════════════════════════════════════════════════════════════════════════════════ */

test('1. deux empreintes distinctes pendant une meme construction : la construction ROUGIT', async () => {
  const banc = await cmsQuiChangeDeVersion((appel) => (appel === 1 ? 'aaaa111' : 'bbbb222'));

  try {
    await appelerAvecReprises(`${banc.base}/api/articles`, JETON);
    const erreur = await appelerAvecReprises(`${banc.base}/api/auteurs`, JETON).then(
      () => null,
      (e: Error) => e,
    );

    assert.ok(erreur, 'la SECONDE empreinte doit faire echouer l appel');
    assert.match(erreur.message, /aaaa111/, 'le refus doit NOMMER la premiere empreinte');
    assert.match(erreur.message, /bbbb222/, 'le refus doit NOMMER la seconde');
    assert.match(
      erreur.message,
      /api\/auteurs/,
      'le refus doit dire OU la bascule a ete vue, sinon il n y a rien a rejouer',
    );
  } finally {
    await banc.fermer();
  }
});

test('1 bis. la bascule est vue meme au MILIEU d une collection paginee — pas seulement au 1er appel', async () => {
  /* Le corpus se charge page par page. Une bascule qui frapperait la page 2 et qui ne serait pas
     vue publierait un site COMPOSE de deux versions — le mode d echec ou succes et echec rendent
     la meme sortie ([[quand-succes-et-echec-rendent-la-meme-sortie]]). */
  const banc = await cmsQuiChangeDeVersion(
    (appel) => (appel === 1 ? 'aaaa111' : 'bbbb222'),
    () => 200,
    (url) => ({
      data: [{ documentId: 'x' }],
      meta: { pagination: { page: /page%5D=2/.test(url) ? 2 : 1, pageCount: 2 } },
    }),
  );

  try {
    const erreur = await chargerCollection(
      { baseUrl: banc.base, jeton: JETON },
      'articles',
      'fr',
    ).then(
      () => null,
      (e: Error) => e,
    );

    assert.ok(erreur, 'une bascule en page 2 doit faire echouer le chargement');
    assert.equal(banc.appels(), 2, 'le banc doit avoir REELLEMENT servi deux pages');
    assert.match(erreur.message, /bbbb222/);
  } finally {
    await banc.fermer();
  }
});

test('1 ter. `chargerConfiguration` passe par la MEME garde — aucune entree du build ne la contourne', async () => {
  /* Un correctif qui vivrait a cote du chemin emprunte serait vert sans rien garder
     ([[controle-jamais-execute-reellement-nest-pas-vert]]). */
  const banc = await cmsQuiChangeDeVersion((appel) => (appel === 1 ? 'aaaa111' : 'bbbb222'));
  const client = { baseUrl: banc.base, jeton: JETON };

  try {
    await chargerConfiguration(client, 'fr');
    const erreur = await chargerConfiguration(client, 'en').then(
      () => null,
      (e: Error) => e,
    );
    assert.ok(erreur, 'la seconde locale doit buter sur la bascule');
    assert.match(erreur.message, /aaaa111/);
  } finally {
    await banc.fermer();
  }
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * SENS 2 — UNE SEULE EMPREINTE PASSE
 * ════════════════════════════════════════════════════════════════════════════════════ */

test('2. une seule empreinte, repetee sur tous les appels : la construction PASSE', async () => {
  const banc = await cmsQuiChangeDeVersion(() => 'aaaa111');

  try {
    for (const chemin of ['articles', 'auteurs', 'categories', 'tags', 'dossiers']) {
      const reponse = await appelerAvecReprises(`${banc.base}/api/${chemin}`, JETON);
      assert.ok(reponse, `l appel ${chemin} doit aboutir`);
    }
    assert.equal(banc.appels(), 5, 'les cinq appels doivent avoir ete REELLEMENT servis');

    const registre = registreDesEmpreintes();
    assert.deepEqual(registre.vues, ['aaaa111']);
    assert.equal(verdict(registre).sorte, 'unique');
  } finally {
    await banc.fermer();
  }
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * SENS 3 — AUCUNE EMPREINTE PASSE, ET AVERTIT
 * ════════════════════════════════════════════════════════════════════════════════════ */

test('3. AUCUNE empreinte : la construction PASSE, et le verdict AVERTIT', async () => {
  /* C est le cas du developpement local et de tout banc : `SOURCE_COMMIT` n existe pas, le CMS ne
     pose donc aucun en-tete. Echouer ici planterait TOUTES ces constructions. */
  const banc = await cmsQuiChangeDeVersion(() => null);

  try {
    for (const chemin of ['articles', 'auteurs']) {
      await appelerAvecReprises(`${banc.base}/api/${chemin}`, JETON);
    }

    const registre = registreDesEmpreintes();
    assert.deepEqual(registre.vues, [], 'aucune empreinte ne doit avoir ete retenue');
    assert.equal(registre.reponses, 2, 'les deux reponses doivent avoir ete COMPTEES');

    const v = verdict(registre);
    assert.equal(v.sorte, 'muet');
    assert.match(v.message, /je ne sais pas/i, 'le verdict doit dire l IGNORANCE, pas un vert');
    assert.doesNotMatch(v.message, /REFUS/, 'ignorer n est pas refuser');
  } finally {
    await banc.fermer();
  }
});

test('3 bis. une empreinte VIDE ou blanche se lit comme ABSENTE, jamais comme une version', async () => {
  /* Deux conteneurs qui ignorent tous deux leur version rendraient la MEME chaine vide, et toute
     comparaison les declarerait EGAUX : un vert fabrique a partir de deux ignorances. */
  const banc = await cmsQuiChangeDeVersion((appel) => (appel === 1 ? '   ' : 'aaaa111'));

  try {
    await appelerAvecReprises(`${banc.base}/api/articles`, JETON);
    await appelerAvecReprises(`${banc.base}/api/auteurs`, JETON);

    const registre = registreDesEmpreintes();
    assert.deepEqual(registre.vues, ['aaaa111'], 'la chaine blanche ne doit PAS compter');
    assert.equal(verdict(registre).sorte, 'unique');
  } finally {
    await banc.fermer();
  }
});

test('3 ter. une absence ENTRE deux presences de la MEME empreinte ne fabrique pas une rupture', async () => {
  const banc = await cmsQuiChangeDeVersion((appel) => (appel === 2 ? null : 'aaaa111'));

  try {
    for (const chemin of ['articles', 'auteurs', 'categories']) {
      await appelerAvecReprises(`${banc.base}/api/${chemin}`, JETON);
    }
    assert.deepEqual(registreDesEmpreintes().vues, ['aaaa111']);
  } finally {
    await banc.fermer();
  }
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * SENS 4 — LE TEMOIN : la construction sait ENCORE echouer pour une autre raison
 * ════════════════════════════════════════════════════════════════════════════════════ */

test('4. TEMOIN — un 400 fait toujours echouer la construction, empreinte UNIQUE ou pas', async () => {
  /* Sans ce cas, les trois verts ci-dessus prouveraient seulement que la garde est MUETTE : une
     garde qui aurait avale les erreurs rendrait exactement les memes observations. */
  const banc = await cmsQuiChangeDeVersion(
    () => 'aaaa111',
    () => 400,
  );

  try {
    const erreur = await appelerAvecReprises(`${banc.base}/api/articles`, JETON).then(
      () => null,
      (e: Error) => e,
    );

    assert.ok(erreur, 'un 400 doit TOUJOURS faire echouer la construction');
    assert.match(erreur.message, /Strapi a repondu 400/, 'et pour SA raison, pas pour l empreinte');
    assert.doesNotMatch(
      erreur.message,
      /empreinte/i,
      'le message d un 400 ne doit pas etre maquille en rupture d empreinte',
    );
    assert.deepEqual(
      registreDesEmpreintes().vues,
      ['aaaa111'],
      'l empreinte d une reponse d ERREUR est lue elle aussi — c est la seule reponse qu il soit vraiment utile d identifier',
    );
  } finally {
    await banc.fermer();
  }
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * LA REGLE ELLE-MEME, exercee sans reseau — l invariant plutot que le cas
 * ════════════════════════════════════════════════════════════════════════════════════ */

test('5. `inscrire` ne refuse QU A la seconde empreinte DISTINCTE — jamais avant', () => {
  const registre = creerRegistre();

  assert.equal(inscrire(registre, null, '/api/x'), null, 'absente : jamais un refus');
  assert.equal(inscrire(registre, 'aaaa111', '/api/x'), null, 'la premiere ne refuse pas');
  assert.equal(inscrire(registre, 'aaaa111', '/api/y'), null, 'la MEME, repetee, ne refuse pas');
  assert.equal(inscrire(registre, null, '/api/z'), null, 'une absence apres une presence non plus');

  const refus = inscrire(registre, 'bbbb222', '/api/w');
  assert.ok(refus, 'la SECONDE distincte refuse');
  assert.match(refus, /aaaa111/);
  assert.match(refus, /bbbb222/);

  assert.equal(registre.reponses, 5, 'toutes les reponses sont comptees, porteuses ou non');
  assert.equal(registre.porteuses, 3);
});

test('5 bis. `lireEmpreinte` est insensible a la casse de l en-tete', () => {
  /* Un proxy poli renormalise le nom. Un acces a une cle en dur rendrait `null` — un silence qui
     se lirait exactement comme « le CMS ne dit pas sa version ». */
  const entetes = new Headers({ 'x-echo-commit': 'aaaa111' });
  assert.equal(lireEmpreinte(entetes), 'aaaa111');
  assert.equal(lireEmpreinte(new Headers()), null);
  assert.equal(lireEmpreinte(undefined), null);
});

test('6. le nom de l en-tete n a qu UN domicile dans `apps/web`', () => {
  /* Une seconde copie divergerait en silence, et la garde se tairait sans que rien ne rougisse
     ([[garantie-par-mecanisme-pas-convention]]). `tests/` est dehors : la valeur y est une DONNEE
     de banc. */
  const domiciles: string[] = [];
  const balayer = (dossier: string) => {
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
      const complet = path.join(dossier, entree.name);
      if (entree.isDirectory()) {
        if (entree.name === 'node_modules' || entree.name === 'dist') continue;
        balayer(complet);
      } else if (/\.(ts|mjs|js)$/.test(entree.name)) {
        if (/['"]X-Echo-Commit['"]/i.test(fs.readFileSync(complet, 'utf8'))) {
          domiciles.push(path.relative(RACINE, complet).replace(/\\/g, '/'));
        }
      }
    }
  };
  for (const racine of ['src', 'scripts', 'integrations']) {
    const complet = path.join(RACINE, racine);
    if (fs.existsSync(complet)) balayer(complet);
  }

  assert.deepEqual(
    domiciles,
    ['src/lib/strapi/empreintes.ts'],
    'la chaine litterale ne doit vivre QUE dans son domicile — ailleurs, on l IMPORTE',
  );
});
