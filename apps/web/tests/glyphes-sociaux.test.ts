/**
 * Le registre des glyphes de plateforme (A-30).
 *
 * A-30 ferme l enum `plateforme` parce que « le rendu est une icone SVG inline (zero JS,
 * pas de police d icones, pas de requete reseau) : chaque valeur suppose une icone ».
 * Il ne dit RIEN de la provenance du dessin — et c est la seule question qui compte ici :
 * un chemin SVG ecrit de memoire produit un logo FAUX qui passe pour la marque. Pire que
 * le nom en toutes lettres, parce qu il a l air fini.
 *
 * Ces tests ne verifient donc pas un rendu, ils verifient une DISCIPLINE DE PROVENANCE,
 * la seule chose qu une relecture humaine laisse passer :
 *   - tout glyphe nomme la ressource de marque officielle d ou son chemin est tire ;
 *   - toute plateforme sans glyphe dit POURQUOI, en une phrase opposable ;
 *   - aucune plateforme ne peut disparaitre entre les deux (la reunion couvre l enum).
 * Sans le troisieme, une plateforme oubliee ne casserait rien : elle rendrait un lien nu.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PLATEFORMES } from '../src/lib/domaine.ts';
import { GLYPHES, LIBELLES, RAISONS_SANS_GLYPHE, glypheDe } from '../src/lib/glyphes-sociaux.ts';

test('chaque plateforme de l enum porte un libelle affichable', () => {
  for (const plateforme of PLATEFORMES) {
    assert.equal(typeof LIBELLES[plateforme], 'string', plateforme);
    assert.ok(LIBELLES[plateforme].length > 0, plateforme);
  }
});

test('chaque plateforme a SOIT un glyphe SOIT une raison de ne pas en avoir, jamais ni l un ni l autre', () => {
  for (const plateforme of PLATEFORMES) {
    const aGlyphe = GLYPHES[plateforme] !== undefined;
    const aRaison = RAISONS_SANS_GLYPHE[plateforme] !== undefined;
    assert.notEqual(aGlyphe, aRaison, `${plateforme} : il en faut exactement un des deux`);
  }
});

test('aucun glyphe ne peut exister sans nommer sa source et son autorisation', () => {
  // C est la garde centrale de cette tache : un chemin dont on ne sait pas d ou il vient
  // ne doit pas pouvoir entrer dans le registre.
  for (const [plateforme, glyphe] of Object.entries(GLYPHES)) {
    assert.match(glyphe.source, /^https:\/\/\S+$/, `${plateforme} : source absente ou non absolue`);
    assert.ok(glyphe.autorisation.length > 20, `${plateforme} : autorisation non constatee`);
  }
});

test('un chemin de glyphe ne contient que des commandes de trace — aucun renvoi exterieur', () => {
  // Un `url(...)`, un `href` ou une balise dans le `d` ferait sortir une requete reseau
  // de la page, ce que la contrainte zero-JS et le budget de requetes interdisent.
  for (const [plateforme, glyphe] of Object.entries(GLYPHES)) {
    assert.match(glyphe.d, /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+-]+$/, `${plateforme} : chemin impur`);
    assert.match(glyphe.viewBox, /^[\d.\s-]+$/, `${plateforme} : viewBox impur`);
  }
});

test('chaque glyphe porte ses deux encres officielles, en hexadecimal', () => {
  for (const [plateforme, glyphe] of Object.entries(GLYPHES)) {
    assert.match(glyphe.encre, /^#[0-9a-f]{6}$/, `${plateforme} : encre claire`);
    assert.match(glyphe.encreSombre, /^#[0-9a-f]{6}$/, `${plateforme} : encre sombre`);
  }
});

test('Facebook reste en toutes lettres — constat du 2026-08-07, a ne pas defaire par inadvertance', () => {
  // Meta ne publie le logo Facebook qu en PNG et en .ai, jamais en SVG, et interdit
  // explicitement de le recolorer, de n en prendre que le « f » ou de le detourer. Il n y
  // a donc aucun chemin officiel a poser. Si ce test tombe un jour, c est que quelqu un
  // en a dessine un : c est exactement ce qu il faut empecher.
  assert.equal(GLYPHES.facebook, undefined);
  assert.match(RAISONS_SANS_GLYPHE.facebook ?? '', /SVG/);
});

test('glypheDe rend le glyphe quand il existe, et null sinon', () => {
  assert.equal(glypheDe('facebook'), null);
  assert.equal(glypheDe('mastodon'), GLYPHES.mastodon);
});

// --- L encre passe du document a la feuille : la recopie est TENUE, pas surveillee -----

/**
 * Les encres etaient posees jusqu au 2026-08-10 en attribut `style="--encre:…"` sur chaque
 * lien, donc DANS le document — ce que `style-src 'self'` (§5.5) refuse : les 86 pages du
 * site en portaient un, et aucun glyphe ne recevait sa couleur. Elles vivent desormais dans
 * le `<style>` de `LiensSociaux.astro`, qui sort en fichier servi.
 *
 * Une feuille de style ne sait pas importer un module TypeScript : la valeur est donc
 * ECRITE DEUX FOIS, dans le registre et dans la regle. C est exactement le motif de derive
 * que ce projet corrige partout (« pointer, jamais dupliquer ») — la duplication est ici
 * inevitable, alors ce test la rend mecanique : tout ecart casse, et toute plateforme qui
 * entrerait au registre sans sa classe casse aussi.
 */
const COMPOSANT = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'LiensSociaux.astro'),
  'utf8',
);

/** Les deux encres declarees par la regle `.liens-sociaux__lien--<plateforme>`. */
function encresDeLaRegle(plateforme: string): { encre?: string; encreSombre?: string } | null {
  const regle = new RegExp(`\\.liens-sociaux__lien--${plateforme}\\s*\\{([^}]*)\\}`).exec(COMPOSANT);
  if (regle === null) return null;
  const corps = regle[1];
  return {
    encre: /--encre:\s*(#[0-9a-fA-F]{3,8})/.exec(corps)?.[1]?.toLowerCase(),
    encreSombre: /--encre-sombre:\s*(#[0-9a-fA-F]{3,8})/.exec(corps)?.[1]?.toLowerCase(),
  };
}

test('aucun attribut style= ne subsiste dans LiensSociaux : la CSP le refuserait', () => {
  // Le composant etait le SEUL du depot a en ecrire un. Ce test garde la porte par ou le
  // defaut est entre ; `garde-styles-en-ligne` tient la sortie entiere, y compris celle-ci.
  assert.doesNotMatch(COMPOSANT, /\sstyle=/);
});

test('chaque glyphe du registre a sa classe d encre dans la feuille du composant', () => {
  for (const plateforme of Object.keys(GLYPHES)) {
    assert.notEqual(
      encresDeLaRegle(plateforme),
      null,
      `${plateforme} : aucune regle .liens-sociaux__lien--${plateforme} — le glyphe rendrait sans encre`,
    );
  }
});

test('les encres de la feuille sont EXACTEMENT celles du registre, sans une nuance d ecart', () => {
  for (const [plateforme, glyphe] of Object.entries(GLYPHES)) {
    const regle = encresDeLaRegle(plateforme);
    assert.equal(regle?.encre, glyphe.encre, `${plateforme} : --encre`);
    assert.equal(regle?.encreSombre, glyphe.encreSombre, `${plateforme} : --encre-sombre`);
  }
});

test('aucune classe d encre orpheline : une regle sans glyphe au registre est un residu', () => {
  const classes = [...COMPOSANT.matchAll(/\.liens-sociaux__lien--([a-z]+)\s*\{/g)]
    .map((m) => m[1])
    .filter((nom) => nom !== 'glyphe');
  for (const nom of classes) {
    assert.ok(GLYPHES[nom as keyof typeof GLYPHES] !== undefined, `${nom} : classe sans glyphe`);
  }
});
