/**
 * LES MENTIONS LEGALES N ONT PLUS QU UNE SEULE SOURCE — et cette garde le tient.
 *
 * CE QU ELLE FERME, mesure et non suppose (decision `ed69d5bf`, branche A). Deux textes
 * de mentions legales coexistaient et AUCUN SEGMENT ne leur etait commun :
 *
 *   - le texte EN DUR de `PageMentions.astro` portait l editeur (raison sociale, adresse),
 *     le directeur de la publication, le contact, l hebergeur, et la clause « ce site ne
 *     constitue en aucun cas un service de presse en ligne » ;
 *   - le champ Strapi `configuration.mentionsLegales` — REQUIS par le mapping, demande au
 *     populate, seede dans les deux locales — portait la provenance des images et la clause
 *     « aucune personne reelle identifiable n est nommee », et n etait RENDU PAR RIEN.
 *
 * Le champ fait desormais foi. Ce fichier est ce qui empeche l un des deux textes de
 * reprendre l ascendant en silence : il exige que le CHAMP porte les huit clauses de la
 * comparaison, dans les DEUX locales, et que la PAGE RENDUE les serve toutes.
 *
 * IL SE PROUVE EN CASSANT. Chaque mention retiree du seed doit faire rougir la garde EN LA
 * NOMMANT — l hebergeur en premier, parce que c est celui dont l effacement etait le plus
 * probable : basculer sur le champ tel qu il etait aurait retire du site l entite juridique
 * confirmee sur facture le 2026-08-07.
 *
 * CE QU IL NE PROUVE PAS : que ces mentions correspondent a la situation reelle d Aymeric
 * Filliot. Aucune machine ne peut le dire. Il prouve qu aucune ne DISPARAIT.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ISSUES } from '../scripts/issues.mjs';
import {
  MENTIONS_DE_LA_PAGE,
  MENTIONS_DU_CHAMP,
  clesObligatoires,
  inspecterMentionsRendues,
  manquementsDuChamp,
  normaliserTexteLegal,
  texteDesBlocks,
} from '../scripts/mentions-obligatoires.mjs';

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SEED = path.join(path.dirname(RACINE), 'cms', 'data', 'configuration.json');
const FIXTURES = path.join(RACINE, 'tests', 'fixtures');
const LOCALES = ['fr', 'en'] as const;

/** Le texte du champ `mentionsLegales` du SEED versionne, pour une locale. */
function champDuSeed(locale: string): string {
  return JSON.parse(fs.readFileSync(SEED, 'utf8'))[locale].mentionsLegales;
}

/** Le champ `mentionsLegales` de la FIXTURE de Strapi, deja au format Blocks. */
function champDeLaFixture(locale: string): unknown[] {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, `configuration-${locale}.json`), 'utf8'))
    .data.mentionsLegales;
}

function distFactice(fichiers: Record<string, string>): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-mentions-'));
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const complet = path.join(racine, relatif);
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, contenu, 'utf8');
  }
  return racine;
}

/** Une page de mentions legales telle que le site l emet : le champ, puis la date. */
function pageMentions(locale: string, corps: string, date = '2026-08-11'): string {
  const maj = locale === 'fr' ? 'Dernière mise à jour' : 'Last updated';
  return (
    `<!doctype html><html lang="${locale}"><head><title>t</title></head><body>` +
    `<div class="mentions"><h1>Mentions</h1>${corps}` +
    `<p class="mentions__maj"><small>${maj} : ${date}</small></p></div></body></html>`
  );
}

/** La sortie complete des deux locales, alimentee par le texte du seed. */
function distDuSeed(date = '2026-08-11'): string {
  return distFactice({
    'mentions-legales/index.html': pageMentions('fr', `<p>${champDuSeed('fr')}</p>`, date),
    'en/mentions-legales/index.html': pageMentions('en', `<p>${champDuSeed('en')}</p>`, date),
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════
 * 1. LE CHAMP SEEDE PORTE TOUT — dans les deux locales
 * ═══════════════════════════════════════════════════════════════════════════════════════ */

for (const locale of LOCALES) {
  test(`[${locale}] le seed du champ mentionsLegales porte les huit clauses de la comparaison`, () => {
    assert.deepEqual(
      manquementsDuChamp(champDuSeed(locale), locale),
      [],
      'une clause a disparu du seed : le site la perdra a la prochaine publication',
    );
  });

  test(`[${locale}] la fixture de Strapi porte les memes clauses que le seed`, () => {
    /* La fixture est le Strapi de substitution des builds de preuve. Si elle diverge du
       seed, `preuve:rendu` certifie « conforme » sur un texte que personne ne publiera —
       le mode d echec exact du Lot 1 du Rucher, transpose ici. */
    assert.deepEqual(manquementsDuChamp(texteDesBlocks(champDeLaFixture(locale)), locale), []);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════
 * 2. LA PREUVE EN CASSANT — chaque clause retiree doit faire rougir, ET ETRE NOMMEE
 * ═══════════════════════════════════════════════════════════════════════════════════════ */

for (const locale of LOCALES) {
  for (const mention of MENTIONS_DU_CHAMP[locale]) {
    test(`[${locale}] preuve en cassant : « ${mention.cle} » retiree du seed fait rougir`, () => {
      const ampute = normaliserTexteLegal(champDuSeed(locale)).replace(mention.motif, '');
      assert.notEqual(
        ampute,
        normaliserTexteLegal(champDuSeed(locale)),
        `le motif de « ${mention.cle} » ne trouve rien dans le seed : la garde est aveugle, ` +
          'elle ne rougirait jamais — un motif qui ne matche pas passe pour un texte conforme',
      );
      const manquements = manquementsDuChamp(ampute, locale);
      assert.ok(
        manquements.some((m) => m.includes(mention.cle)),
        `« ${mention.cle} » retiree, la garde ne l accuse pas : ${manquements.join(' | ') || 'aucun manquement'}`,
      );
    });
  }
}

test('CAS FONDATEUR : l hebergeur retire du seed fait rougir les deux locales', () => {
  /* Basculer sur le champ tel qu il etait aurait EFFACE du site HOSTINGER INTERNATIONAL
     LTD — l entite confirmee sur la facture le 2026-08-07 (result de `dd9b814a`). C est la
     mention dont la disparition etait la plus probable et la plus couteuse : LCEN art. 6
     III 2°. Ce test-ci la nomme, pour qu un rouge futur dise POURQUOI il est rouge. */
  for (const locale of LOCALES) {
    const complet = normaliserTexteLegal(champDuSeed(locale));
    const sansHebergeur = complet.replace(
      /Site (?:hébergé par|hosted by) HOSTINGER INTERNATIONAL LTD[^.]*\./,
      '',
    );
    assert.notEqual(
      sansHebergeur,
      complet,
      `[${locale}] rien n a ete retire : ce test passerait a vide, il ne prouverait rien`,
    );
    const manquements = manquementsDuChamp(sansHebergeur, locale);
    assert.ok(
      manquements.some((m) => m.includes('hebergeur')),
      `[${locale}] hebergeur retire, la garde reste verte`,
    );
  }
});

/* ═══════════════════════════════════════════════════════════════════════════════════════
 * 3. LES DEUX TEXTES D AVANT L ARBITRAGE ECHOUENT — chacun sur SES trous
 * ═══════════════════════════════════════════════════════════════════════════════════════ */

/** Le texte EN DUR servi par `PageMentions.astro` jusqu au 2026-08-11, verbatim. */
const TEXTE_EN_DUR_FR =
  "L'Écho des Hauts est un média fictif. Ce site est un démonstrateur technique : sa ligne " +
  'éditoriale, ses articles, ses auteurs et les événements qu’il relate sont inventés. Aucun ' +
  'contenu publié ici ne rapporte de faits réels, et ce site ne constitue en aucun cas un ' +
  'service de presse en ligne. ' +
  'Monsieur Aymeric Filliot EI, 230 rue Eloi Morel, 80000 Amiens. ' +
  'Directeur de la publication : Aymeric Filliot. Contact : contact@echo.ayfiweb.fr ' +
  'Site hébergé par HOSTINGER INTERNATIONAL LTD, 61 Lordou Vironos Street, 6023 Larnaca, Chypre.';

/** Le champ Strapi tel qu il etait AVANT completion, verbatim de la comparaison. */
const CHAMP_AVANT_FR =
  "« L'Écho des Hauts » n'existe pas. Ce site est un démonstrateur technique : il montre ce " +
  "qu'un magazine éditorial local peut être quand il est servi en pur statique, sans rendu " +
  'serveur et sans JavaScript. Aucun média local réel ne publie ces articles. ' +
  "Le plateau des Hauts, ses 14 communes, ses entreprises, ses associations et tous les " +
  'chiffres cités sont inventés pour cette démonstration. Les cinq signatures de la rédaction ' +
  "sont des personnages : leurs noms, parcours et biographies sont fictifs. Aucune personne " +
  "réelle identifiable n'est nommée, citée ni photographiée dans le contenu du magazine, et " +
  "aucune entreprise, collectivité ou association réelle n'y est mise en scène. " +
  'Tous les visuels sont des œuvres du projet, générées ou composées pour ce démonstrateur. ' +
  "Aucune image ne présente un lieu réel comme étant le plateau des Hauts. " +
  'Démonstrateur réalisé par Aymeric Filliot. Le code est public ; le contenu est fictif.';

test('le texte EN DUR d avant l arbitrage ne passe pas la garde : il perd images et non-diffamation', () => {
  const manquements = manquementsDuChamp(TEXTE_EN_DUR_FR, 'fr');
  const cles = manquements.map((m) => m.split(' ')[0]);
  assert.ok(cles.includes('images-provenance'), `attendu images-provenance : ${cles.join(', ')}`);
  assert.ok(cles.includes('aucune-personne-reelle'), `attendu aucune-personne-reelle : ${cles.join(', ')}`);
});

test('le champ d AVANT completion ne passe pas la garde : il perd les cinq mentions LCEN', () => {
  const cles = manquementsDuChamp(CHAMP_AVANT_FR, 'fr').map((m) => m.split(' ')[0]);
  for (const attendue of [
    'editeur-raison-sociale',
    'editeur-adresse',
    'directeur-publication',
    'contact',
    'hebergeur',
    'pas-service-de-presse',
  ]) {
    assert.ok(cles.includes(attendue), `attendu ${attendue} : ${cles.join(', ')}`);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════════════════
 * 4. LA TABLE ELLE-MEME — ce qui est obligatoire ne se degrade pas en silence
 * ═══════════════════════════════════════════════════════════════════════════════════════ */

test('les cinq mentions obligatoires de la LCEN sont declarees obligatoires, et les memes aux deux locales', () => {
  const attendues = [
    'contact',
    'directeur-publication',
    'editeur-adresse',
    'editeur-raison-sociale',
    'hebergeur',
  ];
  for (const locale of LOCALES) {
    assert.deepEqual(
      clesObligatoires(locale),
      attendues,
      `[${locale}] la liste des mentions obligatoires a bouge : c est un arbitrage juridique, ` +
        'pas un reglage de garde',
    );
  }
});

test('chaque mention nomme sa source — sinon la garde est une opinion', () => {
  for (const locale of LOCALES) {
    for (const mention of MENTIONS_DU_CHAMP[locale]) {
      assert.ok(mention.source.length >= 10, `[${locale}] ${mention.cle} : source trop courte`);
      assert.ok(mention.intitule.length >= 10, `[${locale}] ${mention.cle} : intitule trop court`);
    }
  }
});

/* ═══════════════════════════════════════════════════════════════════════════════════════
 * 5. LA PAGE RENDUE — les huit clauses, la date comprise
 * ═══════════════════════════════════════════════════════════════════════════════════════ */

test('la page rendue depuis le champ porte les huit clauses, dans les deux locales', () => {
  const rapport = inspecterMentionsRendues(distDuSeed());
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.issue, ISSUES.CONFORME);
  assert.equal(rapport.pages, 2);
});

test('la huitieme clause — la date de derniere mise a jour — est exigee de la PAGE, pas du champ', () => {
  /* Elle vit dans le composant (constante), pas dans le champ : Aymeric n a pas tranche ce
     point dans son `result`, et le comportement en place est conserve. La garde exige donc
     sa presence sur la PAGE, et son ABSENCE du champ — pour qu on ne se retrouve pas avec
     deux dates qui divergent, ce que toute cette tache existe pour supprimer. */
  for (const locale of LOCALES) {
    assert.ok(MENTIONS_DE_LA_PAGE[locale].some((m) => m.cle === 'derniere-mise-a-jour'));
    assert.doesNotMatch(
      normaliserTexteLegal(champDuSeed(locale)),
      locale === 'fr' ? /Dernière mise à jour/ : /Last updated/,
      `[${locale}] le champ porte une date : elle ferait une SECONDE source face au composant`,
    );
  }
});

test('une page rendue sans la ligne de date est une anomalie', () => {
  const dist = distFactice({
    'mentions-legales/index.html':
      `<!doctype html><html lang="fr"><body><p>${champDuSeed('fr')}</p></body></html>`,
    'en/mentions-legales/index.html': pageMentions('en', `<p>${champDuSeed('en')}</p>`),
  });
  const rapport = inspecterMentionsRendues(dist);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.ok(rapport.manquements.some((m) => m.includes('derniere-mise-a-jour')));
});

test('une page rendue sans hebergeur est une ANOMALIE (1), jamais un vert', () => {
  const ampute = normaliserTexteLegal(champDuSeed('fr')).replace(
    /Site hébergé par HOSTINGER INTERNATIONAL LTD[^.]*\./,
    '',
  );
  const dist = distFactice({
    'mentions-legales/index.html': pageMentions('fr', `<p>${ampute}</p>`),
    'en/mentions-legales/index.html': pageMentions('en', `<p>${champDuSeed('en')}</p>`),
  });
  const rapport = inspecterMentionsRendues(dist);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.ok(rapport.manquements.some((m) => m.includes('hebergeur')));
});

test('une locale dont la page de mentions manque est une INCAPACITE (2), jamais un vert', () => {
  /* « Je n ai rien pu verifier » ne doit pas rendre le code de « j ai tout verifie ». Une
     page legale absente de la sortie n est pas un defaut de REDACTION : c est un defaut de
     construction, et les deux n envoient pas au meme endroit. */
  const dist = distFactice({
    'mentions-legales/index.html': pageMentions('fr', `<p>${champDuSeed('fr')}</p>`),
    'index.html': '<!doctype html><html lang="fr"><body><p>accueil</p></body></html>',
  });
  const rapport = inspecterMentionsRendues(dist);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.ok(rapport.manquements.some((m) => /en\/mentions-legales/.test(m)));
});

test('une sortie absente est une INCAPACITE, et elle NOMME le chemin', () => {
  const rapport = inspecterMentionsRendues(path.join(os.tmpdir(), 'echo-dist-qui-n-existe-pas'));
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.ok(rapport.manquements.some((m) => m.includes('echo-dist-qui-n-existe-pas')));
});

/* ═══════════════════════════════════════════════════════════════════════════════════════
 * 6. UNE SEULE SOURCE — le composant n ecrit plus aucun fait juridique
 * ═══════════════════════════════════════════════════════════════════════════════════════ */

const COMPOSANT = path.join(RACINE, 'src', 'components', 'pages', 'PageMentions.astro');

test('PageMentions.astro n ecrit plus aucun fait juridique en dur', () => {
  const source = fs.readFileSync(COMPOSANT, 'utf8');
  for (const enDur of [
    'HOSTINGER',
    '230 rue Eloi Morel',
    'contact@echo.ayfiweb.fr',
    'Monsieur Aymeric Filliot EI',
    'Directeur de la publication',
    'A VERIFIER SUR LA FACTURE',
  ]) {
    assert.ok(
      !source.includes(enDur),
      `« ${enDur} » est revenu en dur dans PageMentions.astro : la double source est de retour, ` +
        'et les deux copies divergeront comme elles l ont deja fait',
    );
  }
});

test('PageMentions.astro rend le CHAMP, par RichTexte', () => {
  /* `assert.ok(regex.test(...))` et non `assert.match(source, ...)` : le second imprime le
     FICHIER ENTIER dans le rapport d echec. Un rouge illisible se corrige moins vite. */
  const source = fs.readFileSync(COMPOSANT, 'utf8');
  assert.ok(/configuration\.mentionsLegales/.test(source), 'le champ n est plus rendu');
  assert.ok(/import RichTexte from/.test(source), 'RichTexte n est plus importe');
});

test('PageMentions.astro echoue plutot que de servir une page legale muette', () => {
  /* Succes et echec ne doivent pas rendre la meme sortie : une Configuration absente
     produirait un titre, une date, et AUCUNE mention legale — une page qui a l air d une
     page. Le composant leve, le build echoue, personne ne publie ce vide-la. */
  const source = fs.readFileSync(COMPOSANT, 'utf8');
  assert.ok(
    /throw new Error/.test(source),
    'PageMentions.astro ne leve plus : une Configuration absente servirait une page legale vide',
  );
});
