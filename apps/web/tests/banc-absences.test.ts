/**
 * UNE ABSENCE DE DONNEE DE BANC N EST PAS UNE DONNEE.
 *
 * CE QUE CE FICHIER FERME, ET LA MESURE QUI L A OUVERT. Au 2026-08-10,
 * `scripts/preuve-pagination.mjs` lisait la Configuration de la locale demandee ainsi :
 *
 *     fs.existsSync(propre) ? propre : `tests/fixtures/configuration-fr.json`
 *
 * Constat fait EN LE DECLENCHANT, avant toute correction : `configuration-en.json`
 * ecarte du banc, `npm run preuve:pagination` a rendu EXACTEMENT la meme sortie qu avec —
 * « 57 constats verts », code de sortie 0 — pendant que `dist-recette/en/index.html`
 * portait le pied de page FRANCAIS (« Demonstrateur technique. Media fictif. ») la ou la
 * fixture anglaise dit « Technical demonstrator. Fictional outlet. ». Une absence servie
 * comme une reponse d une autre langue, et une preuve verte par-dessus.
 *
 * CE QUI RENDAIT LE CAS SOURNOIS : le repli etait MORT, la fixture existant. Il ne se
 * manifestait pas, rien ne le signalait, et il attendait qu un fichier disparaisse.
 *
 * LA REGLE QUI EN SORT, ET SA FRONTIERE. Un fichier de fixture absent pour une locale du
 * SITE est une INCAPACITE du banc — jamais un fait editorial. Les asymetries qui vivent
 * DANS les fixtures (un article francais sans jumelle anglaise, une rubrique sans
 * contrepartie, une collection anglaise legitimement vide) restent intactes : le cahier
 * les prevoit, et les supprimer rendrait la preuve rouge en permanence, donc desarmee.
 * Le critere n est pas « il y a un repli » mais « ce repli fait-il passer une absence
 * pour une reponse ».
 *
 * TROIS ISSUES, reprises du parc (`~/.claude/.githooks/verifier-alignement.mjs`) plutot
 * qu inventees ici : 0 verifie et conforme, 1 verifie et anomalie, 2 verification
 * impossible. La troisieme est la raison d etre de la convention — sans elle, « je n ai
 * rien pu verifier » rend le meme code que « j ai tout verifie, tout va bien ».
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COLLECTIONS,
  FIXTURES,
  ISSUES,
  absencesDeBanc,
  cheminAffiche,
  fixturesDuBanc,
  messageVerificationImpossible,
  reponseDeFixture,
} from '../scripts/serveur-fixtures.mjs';
import { configurationRecette, corpusRecette, entreesDuCorpus } from '../scripts/corpus-recette.mjs';
import { LOCALES_SITE } from '../src/lib/routes/registre.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));

/** Un banc de fixtures qui ne porte QUE le francais — l anglais y a disparu. */
function bancSansAnglais(): string {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-sans-anglais-'));
  for (const nom of fixturesDuBanc(['fr'])) {
    fs.copyFileSync(path.join(FIXTURES, `${nom}.json`), path.join(dossier, `${nom}.json`));
  }
  return dossier;
}

// ---------------------------------------------------------------------------
// 1. Ce que le banc EXIGE, et ce qu il sait dire quand ca manque
// ---------------------------------------------------------------------------

test('les trois issues du parc sont reprises telles quelles : 0 conforme, 1 anomalie, 2 impossible', () => {
  assert.equal(ISSUES.CONFORME, 0);
  assert.equal(ISSUES.ANOMALIE, 1);
  assert.equal(ISSUES.VERIFICATION_IMPOSSIBLE, 2);
});

test('le banc exige une fixture par collection ET par locale du site, Configuration comprise', () => {
  const exigees = fixturesDuBanc([...LOCALES_SITE]);
  for (const locale of LOCALES_SITE) {
    assert.ok(exigees.includes(`configuration-${locale}`), `configuration-${locale} non exigee`);
    for (const collection of COLLECTIONS) {
      assert.ok(exigees.includes(`${collection}-${locale}`), `${collection}-${locale} non exigee`);
    }
  }
  assert.equal(exigees.length, LOCALES_SITE.length * (COLLECTIONS.length + 1));
});

test('le banc reel les porte toutes — la preuve normale n a rien a declarer', () => {
  assert.deepEqual(absencesDeBanc(fixturesDuBanc([...LOCALES_SITE])), []);
});

test('une fixture absente est NOMMEE, pas comblee', () => {
  const dossier = bancSansAnglais();
  try {
    const absentes = absencesDeBanc(fixturesDuBanc([...LOCALES_SITE]), dossier);
    assert.deepEqual(absentes, fixturesDuBanc(['en']));
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});

test('le message de la 3e issue nomme chaque fichier absent et dit qu il n a rien substitue', () => {
  const message = messageVerificationImpossible('preuve des bornes', ['configuration-en']);
  assert.match(message, /VERIFICATION IMPOSSIBLE/);
  assert.match(message, /preuve des bornes/);
  assert.match(message, /tests\/fixtures\/configuration-en\.json/);
  // Le point entier : dire qu AUCUNE autre locale n a pris la place de l absente.
  assert.match(message, /aucune donnee d une autre locale/i);
});

// ---------------------------------------------------------------------------
// 2. Le Strapi de substitution ne substitue plus rien
// ---------------------------------------------------------------------------

test('le banc reel se sert normalement, locale par locale — le cas normal reste vert', () => {
  for (const locale of LOCALES_SITE) {
    const config = reponseDeFixture('configuration', locale);
    assert.equal(config.incapacite, undefined);
    assert.equal(config.corps.data.locale, locale);
    for (const collection of COLLECTIONS) {
      const reponse = reponseDeFixture(collection, locale);
      assert.equal(reponse.incapacite, undefined, `${collection}-${locale}`);
      assert.ok(Array.isArray(reponse.corps.data), `${collection}-${locale} : data`);
    }
  }
});

test('Configuration anglaise absente : INCAPACITE nommee, et jamais la Configuration francaise', () => {
  const dossier = bancSansAnglais();
  try {
    const reponse = reponseDeFixture('configuration', 'en', dossier);
    /* CE QUE CETTE LIGNE ASSERTAIT AVANT LE 2026-08-12, et pourquoi c etait faux : elle
       exigeait `'tests/fixtures/configuration-en.json'` alors que le dossier passe est un
       `mkdtemp` d ou le fichier a ete RETIRE. Le message envoyait donc le lecteur vers le
       banc PAR DEFAUT, ou `configuration-en.json` existe — le test verrouillait un
       mensonge. Il nomme desormais le dossier reellement consulte (tache 66fc4e4c). */
    assert.equal(reponse.incapacite, cheminAffiche('configuration-en', dossier));
    assert.equal(reponse.corps, undefined, 'un corps a ete servi a la place de l absence');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});

test('collection anglaise absente : INCAPACITE nommee, et jamais une collection vide plausible', () => {
  const dossier = bancSansAnglais();
  try {
    for (const collection of COLLECTIONS) {
      const reponse = reponseDeFixture(collection, 'en', dossier);
      assert.equal(reponse.incapacite, cheminAffiche(`${collection}-en`, dossier));
      assert.equal(
        reponse.corps,
        undefined,
        `${collection}-en : une collection VIDE a ete servie a la place de l absence`,
      );
    }
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});

test('ce qui n est pas du banc reste hors perimetre — le serveur ne se met pas a tout accuser', () => {
  assert.equal(reponseDeFixture('inconnue', 'fr').hors, true);
});

// ---------------------------------------------------------------------------
// 3. Le corpus de recette : la Configuration de LA locale, ou rien
// ---------------------------------------------------------------------------

test('la Configuration de recette prend le texte de SA locale, pas celui du francais', () => {
  const fr = configurationRecette('fr');
  const en = configurationRecette('en');
  assert.equal(fr.data.locale, 'fr');
  assert.equal(en.data.locale, 'en');
  assert.notDeepEqual(
    en.data.texteFooter,
    fr.data.texteFooter,
    'le pied de page anglais du corpus de recette est du francais sous une etiquette anglaise',
  );
});

test('Configuration de la locale absente : la recette DECLARE, elle ne replie pas sur le francais', () => {
  const dossier = bancSansAnglais();
  const francais = JSON.stringify(configurationRecette('fr', dossier));
  try {
    assert.throws(
      () => configurationRecette('en', dossier),
      (erreur: Error) => {
        assert.match(erreur.message, /VERIFICATION IMPOSSIBLE/);
        // Le dossier REELLEMENT consulte, pas le banc par defaut ou la fixture existe.
        assert.ok(erreur.message.includes(cheminAffiche('configuration-en', dossier)));
        assert.doesNotMatch(erreur.message, /tests\/fixtures\/configuration-en\.json/);
        // Et surtout : rien du francais n a ete rendu au passage.
        assert.doesNotMatch(erreur.message, new RegExp(francais.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        return true;
      },
    );
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4. Le corpus lui-meme : une locale inconnue n est pas « une locale vide »
// ---------------------------------------------------------------------------

test('le corpus de recette declare les DEUX locales du site sur chacune de ses collections', () => {
  const corpus = corpusRecette();
  for (const [nom, parLocale] of Object.entries(corpus)) {
    for (const locale of LOCALES_SITE) {
      assert.ok(
        Array.isArray((parLocale as Record<string, unknown>)[locale]),
        `${nom} : la locale « ${locale} » n est pas declaree par le corpus`,
      );
    }
  }
});

test('le manque LEGITIME reste : au moins une collection anglaise du corpus est vide, et c est juste', () => {
  // `dossiers` n a aucune entree, dans aucune locale, et `categories.en` en porte moins
  // que le francais : ce sont des faits du corpus (T-05, §10.3), pas des absences de
  // banc. Les confondre rendrait la preuve rouge en permanence, donc desarmee.
  const corpus = corpusRecette();
  assert.equal(entreesDuCorpus(corpus, 'dossiers', 'en').length, 0);
  assert.ok(entreesDuCorpus(corpus, 'categories', 'en').length < entreesDuCorpus(corpus, 'categories', 'fr').length);
});

test('une locale que le corpus ne declare pas est une INCAPACITE, pas une liste vide', () => {
  const corpus = corpusRecette();
  assert.throws(
    () => entreesDuCorpus(corpus, 'articles', 'de'),
    (erreur: Error) => {
      assert.match(erreur.message, /VERIFICATION IMPOSSIBLE/);
      assert.match(erreur.message, /articles/);
      assert.match(erreur.message, /\bde\b/);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// 5. Le repli mesure ne peut plus revenir par la porte du code
// ---------------------------------------------------------------------------

test('aucune preuve ne lit une fixture de locale FIXE quand elle en sert une autre', () => {
  // Garde de source, assumee comme telle : elle ne remplace pas la preuve en cassant
  // (faite a la main, sortie citee en tete de fichier), elle empeche la RECHUTE — le
  // repli exact qui vient d etre retire etait une ligne de trois mots.
  const source = fs.readFileSync(path.join(ICI, '..', 'scripts', 'preuve-pagination.mjs'), 'utf8');
  assert.doesNotMatch(
    source,
    /configuration-fr/,
    'preuve-pagination.mjs nomme encore la fixture francaise : une locale ne se lit pas dans le fichier d une autre',
  );
});
