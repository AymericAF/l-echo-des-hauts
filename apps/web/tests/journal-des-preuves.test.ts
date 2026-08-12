/**
 * UN PAS ROUGE FAIT-IL ENCORE SAUTER LES PREUVES SUIVANTES ?
 *
 * LE DEFAUT MESURE LE 2026-08-12 (tache 772ac0ac), meme forme que les deux autres du
 * jour : une garde qui ne s exerce pas la ou le mal se produit. Ici, elle s exerce — mais
 * une AUTRE l en empeche. GitHub Actions arrete le job au premier pas non nul ; les cinq
 * pas qui jugent dans `sortie` etaient donc en serie, alors qu ils portent sur des objets
 * SANS RAPPORT : `preuve:pagination` construit son propre corpus dans `dist-recette/`, et
 * `preuve:encre-og` ne lit aucune sortie. Un verificateur rouge les faisait sauter tous
 * les deux — et on ne savait plus s ils tournaient encore.
 *
 * DEUX ETAGES D ASSERTIONS, ET ILS NE SE REMPLACENT PAS :
 *
 *   1. La LOGIQUE du verdict, sur des journaux fabriques — elle doit distinguer
 *      l incapacite de l anomalie sans reinventer la convention de `issues.mjs`, et
 *      surtout ne JAMAIS rendre 0 sur une population amputee.
 *   2. La TOPOLOGIE du job, lue dans le workflow — chaque pas qui juge tourne sous
 *      `if: always()`, consigne son code, et un pas final rend le verdict. Sans cet
 *      etage, la logique serait parfaite et le job continuerait de s arreter au premier
 *      rouge : c est le cablage qui est le defaut, pas le calcul.
 *
 * CE QU IL NE PROUVE PAS, assume : il lit un `.yml`. Qu un runner GitHub honore vraiment
 * `if: always()` ne se prouve que par un run — cf. la branche de preuve jetable citee au
 * rapport de la tache.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PAS_HORS_PACKAGE_JSON,
  classer,
  lireJournal,
  pasAttendus,
  pasDuJob,
  preuvesDeclarees,
  verdict,
} from '../scripts/journal-des-preuves.mjs';

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEPOT = path.dirname(path.dirname(RACINE));
const WORKFLOW = path.join(DEPOT, '.github', 'workflows', 'gardes-du-code.yml');

function paquet(): { scripts: Record<string, string> } {
  return JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));
}

function workflow(): string {
  return fs.readFileSync(WORKFLOW, 'utf8');
}

// ── 1. La convention des issues, reprise et non reinventee ────────────────────────────

test('classer suit la convention de issues.mjs : 0 conforme, 2 incapacite, le reste anomalie', () => {
  assert.equal(classer(0), 'conforme');
  assert.equal(classer(1), 'anomalie');
  assert.equal(classer(2), 'incapacite');
  /* Un 127 (commande absente) ou un 137 (tue par l OOM) ne sont pas des incapacites
     DECLAREES : les compter comme telles ferait dire au verdict qu il sait ce qu il ne
     sait pas, et enverrait corriger l environnement sur un plantage du site. */
  assert.equal(classer(127), 'anomalie');
  assert.equal(classer(137), 'anomalie');
});

// ── 2. Le journal, et ce qu il refuse de taire ────────────────────────────────────────

test('lireJournal rend les entrees consignees, dans l ordre', () => {
  const entrees = lireJournal('preuve:rendu 0\nverificateurs-de-sortie 1\n\npreuve:encre-og 2\n');
  assert.deepEqual(entrees, [
    { nom: 'preuve:rendu', code: 0 },
    { nom: 'verificateurs-de-sortie', code: 1 },
    { nom: 'preuve:encre-og', code: 2 },
  ]);
});

test('une ligne illisible ressort en code null, elle n est JAMAIS sautee', () => {
  /* Sauter ce qu on ne comprend pas est la forme la plus discrete du vert sur rien. */
  const entrees = lireJournal('preuve:rendu\n');
  assert.deepEqual(entrees, [{ nom: 'preuve:rendu', code: null }]);
});

// ── 3. Le verdict : agrege sans jamais absoudre ────────────────────────────────────────

const ATTENDUS = ['a', 'b', 'c'];

test('tous conformes : le verdict rend 0 et compte ce qu il a juge', () => {
  const rendu = verdict(lireJournal('a 0\nb 0\nc 0\n'), ATTENDUS);
  assert.equal(rendu.code, 0);
  assert.match(rendu.lignes.join('\n'), /3 pas juges/);
});

test('une anomalie parmi des conformes : rouge, et le SITE est nomme', () => {
  const rendu = verdict(lireJournal('a 0\nb 1\nc 0\n'), ATTENDUS);
  assert.equal(rendu.code, 1);
  assert.match(rendu.lignes.join('\n'), /ONT JUGE, ET TROUVE.+Corriger le SITE.+b/s);
});

test('une incapacite : rouge AUSSI, et c est l ENVIRONNEMENT qui est nomme', () => {
  /* Le verdict ne bouge pas — c est la contrainte dure de docs/ci-incapacite-vs-anomalie.md.
     Un build qui n a rien produit ne passe pas sous pretexte qu on a su le nommer. */
  const rendu = verdict(lireJournal('a 0\nb 2\nc 0\n'), ATTENDUS);
  assert.notEqual(rendu.code, 0);
  assert.match(rendu.lignes.join('\n'), /N ONT PAS PU JUGER.+Corriger l ENVIRONNEMENT.+b/s);
  assert.doesNotMatch(rendu.lignes.join('\n'), /Corriger le SITE/);
});

test('les deux familles cohabitent sans se confondre', () => {
  const rendu = verdict(lireJournal('a 1\nb 2\nc 0\n'), ATTENDUS);
  assert.notEqual(rendu.code, 0);
  const texte = rendu.lignes.join('\n');
  assert.match(texte, /Corriger l ENVIRONNEMENT.*b/);
  assert.match(texte, /Corriger le SITE.*a/);
});

test('un journal VIDE est une incapacite du verdict, jamais un vert', () => {
  /* Le mode d echec ou succes et echec rendent la meme sortie : tous les pas sautes, le
     journal reste vide, et le job sortirait en 0 sans avoir rien juge. */
  const rendu = verdict(lireJournal(''), ATTENDUS);
  assert.equal(rendu.code, 2);
  assert.match(rendu.lignes.join('\n'), /VERDICT IMPOSSIBLE/);
});

test('un pas attendu ABSENT du journal est une incapacite, et il est NOMME', () => {
  /* Le cas qui compte : un pas ajoute au workflow sans etre consigne, ou retire. Un
     verdict rendu sur une population amputee certifie « tout conforme » sur ce qui
     manque — le mode d echec exact du Lot 1 du Rucher. */
  const rendu = verdict(lireJournal('a 0\nc 0\n'), ATTENDUS);
  assert.equal(rendu.code, 2);
  assert.match(rendu.lignes.join('\n'), /ne porte pas b/);
});

test('une ligne illisible fait rendre 2, elle n est pas comptee conforme', () => {
  const rendu = verdict(lireJournal('a 0\nb\nc 0\n'), ATTENDUS);
  assert.equal(rendu.code, 2);
  assert.match(rendu.lignes.join('\n'), /illisible/);
});

// ── 4. La population attendue se DERIVE, elle ne se recopie pas ───────────────────────

test('les preuves attendues viennent de package.json, pas d une liste ecrite ici', () => {
  const declarees = preuvesDeclarees(paquet());
  assert.ok(declarees.length >= 3, `${declarees.length} script(s) preuve:* — la mesure du 2026-08-12 en comptait 3`);
  for (const nom of declarees) assert.ok(pasAttendus(paquet()).includes(nom), `${nom} n est pas attendu`);
});

test('chaque pas hors package.json porte une raison ecrite, pas un nom nu', () => {
  for (const [nom, raison] of Object.entries(PAS_HORS_PACKAGE_JSON)) {
    assert.equal(typeof raison, 'string', `${nom} : declare sans raison`);
    assert.ok(raison.length >= 60, `${nom} : la raison fait ${raison.length} caracteres — trop courte`);
  }
});

// ── 5. L extracteur de topologie, exerce sur du YAML fabrique ─────────────────────────

const YAML_TEMOIN = [
  'jobs:',
  '  demo:',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - name: Premier',
  '        id: un',
  '        run: echo un',
  '      - name: Second',
  '        id: deux',
  "        if: always()",
  '        run: |',
  '          echo deux',
  '          echo encore',
  '  autre:',
  '    steps:',
  '      - name: Ailleurs',
  '        run: echo ailleurs',
].join('\n');

test('pasDuJob lit intitule, id, if et run — et s arrete au job suivant', () => {
  const pas = pasDuJob(YAML_TEMOIN, 'demo');
  assert.deepEqual(
    pas.map((p) => p.nom),
    ['Premier', 'Second'],
    'l extracteur deborde sur le job suivant, ou perd un pas',
  );
  assert.equal(pas[0].id, 'un');
  assert.equal(pas[0].si, null);
  assert.equal(pas[1].si, 'always()');
  assert.match(pas[1].run, /echo deux/);
  assert.match(pas[1].run, /echo encore/);
});

// ── 6. LA TOPOLOGIE REELLE : aucun pas qui juge n en court-circuite un autre ──────────

/** Un pas « juge » s il consigne son code dans le journal des preuves. */
function pasQuiJugent() {
  return pasDuJob(workflow(), 'sortie').filter((p) => p.run.includes('--consigner'));
}

test('les cinq pas qui jugent du job « sortie » consignent bien leur code', () => {
  const noms = pasQuiJugent().map((p) => p.nom);
  assert.ok(
    noms.length >= 5,
    `${noms.length} pas consignent leur code ; le job « sortie » en compte CINQ qui jugent ` +
      '(preuve:rendu, l index de recherche, la boucle des verificateurs, preuve:pagination, ' +
      'preuve:encre-og). Un pas qui juge sans consigner arrete le job et fait sauter les suivants.',
  );
});

test('chaque nom consigne appartient a la population attendue — aucun ne se perd', () => {
  /* Une faute de frappe dans un `--consigner` serait indetectable autrement : le pas
     tournerait, consignerait sous un nom que le verdict n attend pas, et le verdict
     rougirait pour le pas ATTENDU absent — en accusant le mauvais objet. */
  const attendus = new Set(pasAttendus(paquet()));
  for (const pas of pasQuiJugent()) {
    for (const [, nom] of pas.run.matchAll(/--consigner\s+"?([^\s"]+)"?/g)) {
      assert.ok(attendus.has(nom), `« ${nom} » est consigne mais n est attendu par personne`);
    }
  }
});

test('chaque pas ATTENDU est bien consigne par le workflow — le sens que personne ne verifiait', () => {
  /* LE TROU QUE CE TEST FERME, ouvert et referme le 2026-08-12.
     Le test precedent verifie un seul sens : ce qui est consigne est attendu. L autre
     sens ne l etait pas — ce qui est ATTENDU doit etre consigne. Or la population
     attendue se DERIVE de `package.json` : ajouter un script `preuve:<x>` suffit a le
     rendre obligatoire en CI, sans toucher au workflow et sans qu aucun test ne bronche.
     Le verdict rougissait alors en production d integration, en accusant un pas absent
     que personne n avait voulu ajouter.
     C est exactement ce qui s est produit en declarant `preuve:pagination-corpus` : cet
     instrument exige l API Strapi de production, la CI ne peut pas le lancer, et il a
     ete renomme `recette:` — le prefixe dit ce que le mecanisme fait. */
  const consignes = new Set(
    pasQuiJugent().flatMap((pas) => [...pas.run.matchAll(/--consigner\s+"?([^\s"]+)"?/g)].map(([, nom]) => nom)),
  );
  for (const attendu of pasAttendus(paquet())) {
    assert.ok(
      consignes.has(attendu),
      `« ${attendu} » est attendu par le verdict mais AUCUN pas du workflow ne le consigne : ` +
        'le job rougira sur un pas manquant. Soit on le cable au workflow, soit on le sort ' +
        'de la population derivee (un script de recette lance a la main ne se prefixe pas « preuve: »).',
    );
  }
});

test('AUCUN pas qui juge ne depend de celui d avant : tous sous if: always()', () => {
  /* LE CŒUR DE LA TACHE 772ac0ac. Sans `always()`, GitHub saute le pas des qu un
     precedent est rouge — et une garde en court-circuite trois autres. */
  assert.ok(pasQuiJugent().length > 0, 'aucun pas ne juge : cette assertion serait vraie sur du vide');
  for (const pas of pasQuiJugent()) {
    assert.ok(
      pas.si !== null && pas.si.includes('always()'),
      `le pas « ${pas.nom} » n a pas de condition always() : un rouge en amont le fera SAUTER, ` +
        'et son objet ne sera juge par rien dans ce run',
    );
  }
});

test('le verdict est le DERNIER pas du job, et il tourne toujours', () => {
  const pas = pasDuJob(workflow(), 'sortie');
  const dernier = pas[pas.length - 1];
  assert.ok(
    dernier.run.includes('--verdict'),
    `le dernier pas du job est « ${dernier.nom} » et ne rend pas le verdict : les codes ` +
      'consignes ne seraient relus par personne, et le job sortirait VERT sur des pas rouges',
  );
  assert.ok(
    dernier.si !== null && dernier.si.includes('always()'),
    'le verdict est saute des qu un pas amont est rouge — donc exactement quand il sert',
  );
});

test('aucun pas qui juge ne sort en code non nul lui-meme', () => {
  /* Un `exit $code` residuel arreterait le job malgre le `always()` des suivants ? Non —
     mais il ferait passer le pas en ROUGE alors que le verdict est le seul juge, et deux
     verdicts pour un meme fait finissent toujours par se contredire. La consigne est le
     canal unique. */
  for (const pas of pasQuiJugent()) {
    assert.doesNotMatch(
      pas.run,
      /^\s*exit \$/m,
      `le pas « ${pas.nom} » sort encore sur son propre code : il doit CONSIGNER, le verdict tranche`,
    );
  }
});

test('le journal est repropre a chaque run — jamais herite d un cache', () => {
  assert.match(
    workflow(),
    /JOURNAL_DES_PREUVES:/,
    'le workflow ne declare pas ou vit le journal : chaque pas ecrirait ailleurs',
  );
});
