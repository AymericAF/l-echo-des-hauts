/**
 * LA SURCHARGE `partage.seo` SE PROUVE AU BUILD DE PRODUCTION, ET NULLE PART AILLEURS.
 *
 * POURQUOI CE FICHIER EXISTE — l arbitrage du 2026-08-14 (tache `b2682fc0`, session
 * supervisee). `scripts/preuve-surcharge-seo.mjs` croise DEUX sources : le corpus
 * versionne (`apps/cms/data`) et le `dist/` construit. Il n existe qu UN SEUL endroit
 * ou les deux sont reelles en meme temps, et ce n est pas l integration continue :
 *
 *   - le job `sortie` construit contre le Strapi de SUBSTITUTION (3 fixtures) — aucune
 *     page du corpus n y est, la preuve rend `2` (mesure : trois pushes rouges d affilee) ;
 *   - il n existe AUCUN job de mesure : aucun workflow des deux depots ne porte de
 *     secret ni ne joint l instance (verifie le 2026-08-14) ;
 *   - le build Coolify, lui, clone le depot — donc le corpus — ET construit contre
 *     l instance reelle. Les deux extremites y sont, sans banc a ecrire.
 *
 * CE QUI A ETE ECARTE, et ce n est pas un detail de cout : un banc qui SERVIRAIT le
 * corpus obligerait a reimplementer le seed (relations, blocs, `localizations`, et le
 * RENOMMAGE des medias a l upload). La preuve tournerait alors contre ce generateur —
 * c est-a-dire contre du code ecrit pour l occasion — et cesserait de couvrir les deux
 * maillons qui ont REELLEMENT casse : le seed qui n envoyait pas le champ (2026-08-12)
 * et le renommage que le controle ignorait (2026-08-14, commit `46ee744`).
 *
 * CE QUE CE TEST NE PROUVE PAS : que Coolify lit bien ce fichier, ni que le corpus est
 * dans le contexte de construction. Seul un deploiement le dit — et s il ne l est pas,
 * la preuve rend `2` en NOMMANT le chemin cherche (`preuve-surcharge-seo.test.ts`), donc
 * le build echoue en envoyant corriger l ENVIRONNEMENT, jamais le site.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NIXPACKS = path.join(RACINE, 'nixpacks.toml');
const PREUVE = 'preuve-surcharge-seo.mjs';

/** Les commandes de la phase `build` de nixpacks.toml, dans leur ordre de declaration. */
function commandesDeBuild(): string[] {
  const source = fs.readFileSync(NIXPACKS, 'utf8');
  const phase = source.match(/\[phases\.build\][\s\S]*?cmds\s*=\s*\[([\s\S]*?)\]/);
  assert.notEqual(
    phase,
    null,
    'nixpacks.toml ne declare aucune phase `build` avec des `cmds` : la preuve de ' +
      "surcharge n a alors AUCUN endroit ou tourner sur les deux sources reelles.",
  );
  return [...(phase as RegExpMatchArray)[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

test('la phase build lance la preuve de surcharge SEO', () => {
  const cmds = commandesDeBuild();
  assert.ok(
    cmds.some((c) => c.includes(PREUVE)),
    `aucune commande de la phase build ne lance ${PREUVE}. Declarees : ` +
      `${cmds.join(' | ') || '(aucune)'}.`,
  );
});

test('elle CONSTRUIT avant de juger — sinon elle jugerait un dist qui n existe pas', () => {
  /* Declarer `cmds` REMPLACE la commande detectee par le fournisseur Node. Une phase qui
     ne porterait que la preuve supprimerait le build lui-meme : le deploiement servirait
     une sortie vide, et la preuve rendrait `2` sur le vide qu elle vient de causer. */
  const cmds = commandesDeBuild();
  const construction = cmds.findIndex((c) => /npm (run )?build/.test(c));
  const jugement = cmds.findIndex((c) => c.includes(PREUVE));

  assert.notEqual(construction, -1, 'la phase build doit porter la construction elle-meme');
  assert.ok(
    construction < jugement,
    `la construction (position ${construction}) doit preceder la preuve (position ${jugement})`,
  );
});

test('le script npm `build` ne porte PAS la preuve — la CI construit sur fixtures', () => {
  /* LA FRONTIERE, ET C EST ELLE QUI TIENT TOUT LE CABLAGE. Le job `sortie` lance
     `npm run build` (via `preuve:rendu`) contre le Strapi de substitution. Y glisser la
     preuve la ferait rendre `2` a chaque run — le rouge exact qu on vient de retirer —
     et on la desactiverait pour de bon. Elle vit dans nixpacks.toml PRECISEMENT parce
     que ce fichier n est lu que par le build de production. */
  const scripts = JSON.parse(
    fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'),
  ).scripts as Record<string, string>;

  assert.ok(
    !scripts.build.includes(PREUVE),
    'le script `build` doit rester celui que la CI peut lancer sur fixtures',
  );
  assert.equal(
    scripts['recette:surcharge-seo'],
    `node scripts/${PREUVE}`,
    'la preuve reste lancable A LA MAIN sous son nom de recette : le cablage au build de ' +
      'production ne remplace pas le geste de recette, il le double la ou il est vrai.',
  );
});

test('le fichier que la phase build nomme existe reellement', () => {
  /* Un chemin faux dans nixpacks.toml ne se voit qu au deploiement, et il s y voit sous
     la forme la plus couteuse : un build casse en production. */
  const commande = commandesDeBuild().find((c) => c.includes(PREUVE)) as string;
  const chemin = (commande.match(/(scripts\/[\w-]+\.mjs)/) as RegExpMatchArray)[1];

  assert.equal(
    fs.existsSync(path.join(RACINE, chemin)),
    true,
    `nixpacks.toml lance ${chemin}, qui n existe pas sous apps/web`,
  );
});
