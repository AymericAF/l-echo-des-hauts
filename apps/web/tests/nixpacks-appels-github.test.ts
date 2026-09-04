/**
 * LA COUCHE NIX DU BUILD FORCE NE DOIT SOLLICITER GITHUB QU UNE FOIS, PAS DEUX.
 *
 * LE FAIT, mesure et non suppose (`docs/echecs-deploiement-echo-site.md`, depot de
 * documentation, commit 5bea5ef). Sur les 49 echecs de deploiement d `echo-site`, UN SEUL
 * porte le `429` GitHub — le `522` du 2026-08-17 — et il ne tombe pas sur l archive nixpkgs
 * mais sur l OVERLAY :
 *
 *     #8 43.25 unpacking 'https://github.com/railwayapp/nix-npm-overlay/archive/main.tar.gz'
 *     #8 55.17 warning: error: unable to download '...': HTTP error 429
 *
 * POURQUOI LA COUCHE EST REJOUEE A CHAQUE PUBLICATION. Le webhook Strapi
 * `publish_to_coolify` code `&force=true` en dur dans son URL, et dans Coolify 4.3.6
 * `force_rebuild` commande DEUX choses a la fois : la desactivation de la deduplication
 * d image — indispensable, le contenu vient de Strapi AU BUILD — et `--no-cache`. Sous
 * `--no-cache` la couche `#8` (`RUN nix-env -if .nixpacks/nixpkgs-<sha>.nix`) repart de zero
 * a chaque fois. Mesure sur le regime courant : 35 builds forces, 35 executions de la couche,
 * 70 sollicitations de GitHub, 1 refus (~2,9 %).
 *
 * NE PAS « CORRIGER » LE FORCAGE : il a ete retire le 2026-08-12 puis REMIS le 2026-08-13
 * (decisions `fae6cd9c` puis `b9b98998`) apres 18 heures pendant lesquelles publier ne
 * mettait plus rien en ligne — et cette panne-la est SILENCIEUSE (200, ligne de deploiement,
 * vert en 9 s, « Build step skipped »). Ce fichier ferme la moitie atteignable du probleme :
 * l appel a l overlay, sans toucher au forcage.
 *
 * CE QU IL NE FERME PAS, ET CE N EST PAS UN OUBLI. La SECONDE sollicitation —
 * `https://github.com/NixOS/nixpkgs/archive/<sha>.tar.gz` — n est PAS supprimable depuis ce
 * depot. L URL est ecrite en dur dans le binaire nixpacks 1.41.0 (celui de
 * `coollabsio/coolify-helper:1.0.16`), seul le `<sha>` est parametrable :
 *
 *     $ strings /usr/local/bin/nixpacks | grep fetchTarball
 *     import (fetchTarball "https://github.com/NixOS/nixpkgs/archive/.tar.gz")
 *     (import (builtins.fetchTarball ""))          <- l overlay, lui, vient de nixOverlays
 *
 * La seule facon de la faire disparaitre serait de ne declarer AUCUN paquet nix — auquel cas
 * nixpacks n emet plus ni le `COPY .nixpacks/*.nix` ni le `RUN nix-env` (verifie le
 * 2026-09-04 sur le banc) — mais l image de base `ghcr.io/railwayapp/nixpacks:ubuntu-1745885067`
 * ne porte NI node NI npm (`node: command not found`, aucun nodejs dans `/nix/store`, aucun
 * canal `<nixpkgs>`), et l Ubuntu 24.04 qu elle embarque n offre que du node 18 quand
 * `engines.node` exige `>= 22.12.0`. Fermer la seconde suppose donc de changer de substrat
 * de construction — image de build dediee, ou bascule sur le build pack Dockerfile — ce qui
 * ne vit plus « a cote de nixpacks.toml » et se decide, pas se glisse.
 *
 * CE QUE CE FICHIER PROUVE, ET CE QU IL NE PROUVE PAS : il juge les DECLARATIONS de
 * nixpacks.toml, pas le journal du build. La preuve terminale reste la lecture d un
 * deploiement force — la couche `#8` ne doit plus emettre qu UNE ligne
 * « unpacking 'https://...' », celle de nixpkgs.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NIXPACKS = path.join(RACINE, 'nixpacks.toml');

/**
 * nixpacks.toml prive de ses commentaires — donc ses seules DECLARATIONS.
 *
 * Le fichier est commente a l exces, et deliberement : ses blocs CITENT les URL GitHub
 * qu ils interdisent. Juger le fichier brut ferait rougir la garde sur sa propre
 * documentation, et la premiere reaction serait d effacer l explication.
 */
function declarations(): string {
  const source = fs.readFileSync(NIXPACKS, 'utf8');
  const sansCommentaires = source
    .split(/\r?\n/)
    .filter((ligne) => !/^\s*#/.test(ligne))
    .join('\n');

  /* Un depouillement trop gourmand rendrait une chaine vide, ou tout passerait en silence —
     le mode d echec ou succes et echec rendent la meme sortie. On exige donc que ce qui
     reste porte encore les deux phases que le fichier declare. */
  assert.match(
    sansCommentaires,
    /\[phases\.setup\][\s\S]*\[phases\.build\]/,
    'le depouillement des commentaires a emporte les declarations elles-memes : la garde '
      + 'jugerait le vide, et rendrait vert quoi qu il arrive.',
  );
  return sansCommentaires;
}

/** Les paquets nix declares par la phase `setup`, ou `null` si la cle est absente. */
function nixPkgs(): string[] | null {
  const bloc = declarations().match(/nixPkgs\s*=\s*\[([^\]]*)\]/);
  if (bloc === null) return null;
  return [...bloc[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

test('aucune DECLARATION de nixpacks.toml ne sollicite github.com', () => {
  /* La garde est ecrite sur l HOTE, pas sur le nom de l overlay : elle attrape aussi bien un
     `nixOverlays` remis en place qu une archive nixpkgs epinglee a la main sur une fourche,
     ou n importe quelle URL GitHub glissee dans une commande de phase. */
  const trouvees = [...declarations().matchAll(/\S*github\.com\S*/g)].map((m) => m[0]);

  assert.deepEqual(
    trouvees,
    [],
    'nixpacks.toml declare une ou plusieurs URL GitHub : '
      + `${trouvees.join(' | ')}. Sous \`force=true\` — que le webhook Strapi code en dur — la `
      + 'couche nix est rejouee A CHAQUE publication, et chaque URL declaree devient une '
      + 'sollicitation de plus sur une limite de debit partagee par IP (1 refus sur 70 mesures).',
  );
});

test('nixOverlays est declare VIDE — l omettre laisse le fournisseur le remettre', () => {
  /* CE N EST PAS EQUIVALENT A NE RIEN ECRIRE, et c est tout l enjeu de ce test. Le fournisseur
     Node de nixpacks injecte `https://github.com/railwayapp/nix-npm-overlay/archive/main.tar.gz`
     de lui-meme des qu il detecte un `package.json` : mesure le 2026-09-04 sur le banc, un
     `nixpacks plan` sans `nixOverlays` rend l overlay, le meme avec `nixOverlays = []` rend une
     liste vide. Retirer la ligne rouvrirait donc l appel sans que rien d autre ne bouge. */
  assert.match(
    declarations(),
    /nixOverlays\s*=\s*\[\s*\]/,
    'nixpacks.toml ne declare pas `nixOverlays = []` : le fournisseur Node reinjecte alors '
      + "l overlay `nix-npm-overlay/archive/main.tar.gz` — une reference MUTABLE (`main`), "
      + 'retelechargee a chaque build force, et celle qui a rendu 429 le 2026-08-17.',
  );
});

test('nixPkgs REMPLACE la liste du fournisseur — le spread reinjecterait npm-9_x', () => {
  /* L INVERSE DE CE QU EXIGEAIT `nixpacks-fontes.test.ts` JUSQU AU 2026-09-04, et pour une
     raison mecanique : `npm-9_x` N EXISTE PAS dans nixpkgs, il est fourni par l overlay. Le
     garder — ce que ferait le spread `'...'` — avec `nixOverlays = []` ferait echouer
     `nix-env` sur un attribut indefini, c est-a-dire casserait TOUS les deploiements. Les
     deux declarations ne se separent pas : elles bougent ensemble ou pas du tout. */
  const declares = nixPkgs();

  assert.notEqual(
    declares,
    null,
    'nixpacks.toml ne declare plus `nixPkgs` : le fournisseur Node reprend la main et remet '
      + '`npm-9_x`, donc l overlay dont il vient.',
  );
  const paquets = declares as string[];

  assert.ok(
    !paquets.includes('...'),
    `nixPkgs porte le spread '...' (${paquets.join(', ')}) : il reinjecte \`npm-9_x\`, qui `
      + "n existe que dans l overlay. Avec `nixOverlays = []`, `nix-env` echouerait sur "
      + '« undefined variable » et AUCUN deploiement ne passerait.',
  );
  const npm = paquets.filter((p) => /^npm/.test(p));
  assert.deepEqual(
    npm,
    [],
    `nixPkgs nomme ${npm.join(', ')}, qui vient de l overlay retire. npm est fourni par la `
      + 'derivation nodejs elle-meme — mesure le 2026-09-04 dans l image de construction : '
      + 'nodejs_22 seul rend node v22.19.0 et npm 10.9.3.',
  );
});

test('nixPkgs nomme le nodejs qui satisfait engines.node', () => {
  /* Ce que le spread protegeait REELLEMENT : que le build ne perde pas node. Remplacer la
     liste du fournisseur, c est reprendre cette charge — donc la prouver ici plutot que de
     s en remettre a une detection qu on vient de desactiver.

     `NIXPACKS_NODE_VERSION=22` que Coolify injecte ne decide plus rien depuis que la liste
     est ecrite a la main : c est CE fichier qui tranche, et le seul contrat qui reste est
     celui de `engines.node`. */
  const engines = JSON.parse(
    fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'),
  ).engines as Record<string, string> | undefined;
  const exigee = engines?.node ?? '';
  const majeure = exigee.match(/(\d+)/)?.[1];

  assert.notEqual(
    majeure,
    undefined,
    `package.json ne declare pas de \`engines.node\` exploitable (« ${exigee} ») : plus rien `
      + 'ne relie la version construite a celle que le code exige.',
  );
  const paquets = nixPkgs() ?? [];
  assert.ok(
    paquets.includes(`nodejs_${majeure}`),
    `nixPkgs ne nomme pas \`nodejs_${majeure}\` (declares : ${paquets.join(', ') || '(aucun)'}) `
      + `alors que engines.node exige « ${exigee} ». Sans lui, la couche nix ne poserait ni node `
      + 'ni npm, et `npm ci` echouerait des la phase install.',
  );
});
