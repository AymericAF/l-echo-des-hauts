/**
 * L ALPHABET DES BLANCS VIT A DEUX ENDROITS — ce test est ce qui rend la copie acceptable.
 *
 * LE DEFAUT D ORIGINE, constate le 2026-08-11 (tache `63012582`, signale plutot que contourne).
 * Le message du commit `54567ba` affirmait que la garde de corpus du seed refusait un
 * `alternativeText` blanc « sur le MEME alphabet » que la lecture. C etait faux au caractere
 * pres : `corpus.ts` testait `.trim()`, qui couvre l espace insecable U+00A0 mais LAISSE PASSER
 * les caracteres de largeur nulle — U+200B, U+200C, U+200D, U+2060. Un `alternativeText` fait
 * d un seul U+200B entrait au corpus sans un mot. Le site restait correct (la lecture le
 * normalise en absent), mais le corpus portait une valeur invisible que rien n avait signalee
 * a l ECRITURE.
 *
 * POURQUOI LA COPIE PLUTOT QU UN MODULE PARTAGE — la question que la tache posait, tranchee par
 * un fait et non par un gout. Les deux applications NE PEUVENT PAS s importer : le depot n a
 * aucun `package.json` a sa racine ni aucun `workspaces`, et chaque application est construite
 * par Coolify depuis sa PROPRE `Base Directory` (`/apps/web`, `/apps/cms`). Un `import` de l une
 * vers l autre casserait le build — la seconde n existe pas dans l arbre de la premiere. La voie
 * « module partage » et la voie « le seed importe depuis apps/web » sont donc structurellement
 * fermees, pas seulement discutables.
 *
 * CE QUE CE TEST PEUT ET QUE LE BUILD NE PEUT PAS : lire d une application a l autre. Il tourne
 * dans le depot ENTIER, pas depuis une `Base Directory`. C est ce decalage qui permet de garder
 * une copie sans la subir — la duplication devient VISIBLE et surveillee au lieu d etre
 * silencieuse, ce qui est exactement ce que ce depot corrige partout ailleurs.
 *
 * ⚠️ CE TEST DOIT SE DECLENCHER QUAND `apps/web` BOUGE. Il lit un fichier PAR CHEMIN, ce que le
 * graphe d imports ne peut pas voir : sa lecture est donc declaree dans `LECTURES` de
 * `outils/gardes-au-commit.js`. Sans cette declaration, editer l alphabet cote web ne
 * declencherait rien, et la divergence reviendrait par la porte que ce test ferme.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { estBlanc } from '../scripts/seed/corpus.ts';

const RACINE_DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SOURCE_WEB = path.join(RACINE_DEPOT, 'apps', 'web', 'src', 'lib', 'strapi', 'lecture.ts');
const SOURCE_CMS = path.join(RACINE_DEPOT, 'apps', 'cms', 'scripts', 'seed', 'corpus.ts');

/**
 * L alphabet tel qu il est ECRIT dans un fichier source.
 *
 * On lit le TEXTE plutot que d importer la constante : elle n est pas exportee cote web, et
 * surtout c est la LITTERALITE qui doit concorder. Deux expressions differentes qui couvriraient
 * le meme ensemble resteraient deux choses a maintenir.
 */
function alphabetEcrit(fichier: string): string {
  const source = fs.readFileSync(fichier, 'utf8');
  const m = source.match(/const BLANCS_INVISIBLES\s*=\s*\n?\s*'([^']*)'/);
  assert.ok(
    m,
    `${path.relative(RACINE_DEPOT, fichier)} : aucune constante \`BLANCS_INVISIBLES\` trouvee. ` +
      "Si elle a ete renommee ou reecrite, ce test ne garde plus rien — c'est une incapacite, " +
      'pas un vert : corrige le motif de lecture en meme temps que le renommage.',
  );
  return m![1];
}

test("l'alphabet des blancs est IDENTIQUE, caractere pour caractere, dans les deux applications", () => {
  const web = alphabetEcrit(SOURCE_WEB);
  const cms = alphabetEcrit(SOURCE_CMS);
  assert.equal(
    cms,
    web,
    'les deux alphabets ont divergé. Ils sont volontairement dupliqués — les deux applications ne ' +
      "peuvent pas s'importer (aucun workspace, une Base Directory Coolify par application) — et " +
      'ce test est la seule chose qui empêche la copie de dériver. Réaligne, ne supprime pas ce test.',
  );
});

test("l'alphabet couvre les caractères de LARGEUR NULLE, ceux que `.trim()` laisse passer", () => {
  /* Le défaut d'origine, en un test : ce sont exactement ces quatre-là qui entraient au corpus
     sans un mot. Sans ce cas, un retour à `.trim()` passerait inaperçu — les deux fichiers
     resteraient identiques, et le premier test resterait vert. */
  for (const invisible of ['​', '‌', '‍', '⁠']) {
    const point = `U+${invisible.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
    assert.equal(invisible.trim(), invisible, `${point} : ce test suppose que .trim() ne le retire PAS`);
    assert.ok(estBlanc(invisible), `${point} doit être reconnu blanc par le seed`);
  }
});

test("l'alphabet couvre aussi les blancs que `.trim()` retirait déjà — aucune régression", () => {
  for (const blanc of [' ', '\t', '\n', '\r', ' ', '　', '﻿']) {
    assert.ok(estBlanc(blanc), `${JSON.stringify(blanc)} doit être reconnu blanc`);
  }
  assert.ok(estBlanc(''), 'la chaîne vide est blanche');
  assert.ok(estBlanc('​  \t'), 'un mélange de blancs reste blanc');
});

test('un texte porteur n est JAMAIS pris pour un blanc', () => {
  /* La contre-épreuve obligatoire : un alphabet trop large refuserait du contenu légitime, et
     c'est le genre de garde qu'on désactive à la première fausse alerte. */
  for (const porteur of ['a', ' a ', '​mot', 'Composition graphique', '0', '—']) {
    assert.equal(estBlanc(porteur), false, `${JSON.stringify(porteur)} porte quelque chose`);
  }
});
