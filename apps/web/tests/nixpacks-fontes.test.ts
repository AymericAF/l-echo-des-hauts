/**
 * L environnement de CONSTRUCTION doit porter une fonte que la pile du gabarit OG nomme.
 *
 * MESURE DU 2026-08-07, sur l instance : l image de base de Nixpacks
 * (`ghcr.io/railwayapp/nixpacks:ubuntu-1745885067`) ne porte AUCUNE fonte —
 * `fc-list | wc -l` rend `0` et `/usr/share/fonts` n existe meme pas. `sharp` embarque
 * fontconfig, pas de fontes : le SVG du gabarit se rasterise donc SANS UN GLYPHE, et le
 * PNG produit est un aplat. Mesure de l encre de la bande de titre sur la meme image :
 * **7,53** dans le conteneur de construction contre **69,55** sur le poste.
 *
 * Ce test ne remplace pas la garde d encre de `scripts/verifier-seo.mjs` — il la double
 * en amont, sur la CAUSE plutot que sur le symptome. La garde d encre lit un PNG deja
 * produit et ne dit pas pourquoi il est vide ; ce test lit la declaration de build et
 * echoue avant meme qu une image soit rendue.
 *
 * Ce qu il ne prouve pas : que le paquet declare s installe reellement, ni que
 * fontconfig le trouve. Seul un build le prouve, et c est la garde d encre qui le voit.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NIXPACKS = path.join(RACINE, 'nixpacks.toml');

/**
 * Familles fournies par un paquet apt, et le paquet qui les fournit.
 *
 * Les familles absentes de cette table (Georgia, Times New Roman, Segoe UI, Roboto,
 * Helvetica, Arial) sont des fontes proprietaires de systemes de bureau : elles ne se
 * declarent pas dans une image de construction, et la pile ne compte pas dessus.
 */
const FOURNIES_PAR = new Map([
  ['DejaVu Serif', 'fonts-dejavu-core'],
  ['DejaVu Sans', 'fonts-dejavu-core'],
  ['Liberation Serif', 'fonts-liberation'],
  ['Liberation Sans', 'fonts-liberation'],
]);

function sourceGabarit(): string {
  return fs.readFileSync(path.join(RACINE, 'src/lib/seo/gabarit-og.ts'), 'utf8');
}

/** Les familles nommees par une constante de pile, dans l ordre de la pile. */
function pile(nomConstante: string): string[] {
  const source = sourceGabarit();
  const debut = source.indexOf(`const ${nomConstante} `);
  assert.notEqual(debut, -1, `constante ${nomConstante} introuvable dans gabarit-og.ts`);
  const fin = source.indexOf(';', debut);
  const declaration = source.slice(debut, fin);
  /* On decoupe sur les VIRGULES, pas sur les guillemets : une expression reguliere qui
     apparie des paires de guillemets consomme le guillemet FERMANT d une famille comme
     guillemet OUVRANT de la suivante, et ne rend qu une famille sur deux. Le defaut
     passait inapercu — le test rougissait, mais pour la mauvaise raison. */
  const litteral = declaration.slice(declaration.indexOf('=') + 1).trim();
  return litteral
    .replace(/^["']|["']$/g, '')
    .split(',')
    .map((f) => f.trim().replace(/^['"]|['"]$/g, ''))
    .filter((f) => f.length > 0 && !['serif', 'sans-serif', 'monospace'].includes(f));
}

/** Les paquets apt declares par la phase `setup` de nixpacks.toml. */
function aptPkgs(): string[] {
  const source = fs.readFileSync(NIXPACKS, 'utf8');
  const bloc = source.match(/aptPkgs\s*=\s*\[([^\]]*)\]/);
  assert.notEqual(bloc, null, 'nixpacks.toml ne declare aucun aptPkgs');
  return [...(bloc as RegExpMatchArray)[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

test('nixpacks.toml existe a la racine de la Base Directory du build', () => {
  assert.equal(
    fs.existsSync(NIXPACKS),
    true,
    'nixpacks.toml doit vivre dans apps/web : c est la `Base Directory` de l application ' +
      'Coolify `echo-site`, donc le seul endroit ou Nixpacks le lit.',
  );
});

test('la phase setup est declaree et ne remplace pas les nixPkgs du fournisseur', () => {
  const source = fs.readFileSync(NIXPACKS, 'utf8');
  assert.match(source, /\[phases\.setup\]/, 'la phase setup doit etre declaree');
  const nixPkgs = source.match(/nixPkgs\s*=\s*\[([^\]]*)\]/);
  if (nixPkgs !== null) {
    assert.match(
      nixPkgs[1],
      /['"]\.\.\.['"]/,
      "declarer nixPkgs sans le spread '...' ECRASE les paquets detectes par le " +
        'fournisseur Node — le build perdrait node et npm.',
    );
  }
});

for (const [constante, genre] of [
  ['POLICE_TITRE', 'titre'],
  ['POLICE_LABEL', 'label'],
] as const) {
  test(`la pile du ${genre} se termine sur une fonte reellement installee au build`, () => {
    const familles = pile(constante);
    const installables = familles.filter((f) => FOURNIES_PAR.has(f));

    assert.notEqual(
      installables.length,
      0,
      `la pile ${constante} ne nomme aucune famille fournissable par un paquet apt ` +
        `(${familles.join(', ')}) : dans un conteneur sans fonte, elle ne peut que ` +
        'retomber sur le generique, que fontconfig ne resout pas non plus.',
    );

    const declares = aptPkgs();
    const couverte = installables.find((f) => declares.includes(FOURNIES_PAR.get(f) as string));

    assert.notEqual(
      couverte,
      undefined,
      `aucun paquet de nixpacks.toml ne fournit une famille de ${constante}. ` +
        `Attendu l un de : ${[...new Set(installables.map((f) => FOURNIES_PAR.get(f)))].join(', ')}. ` +
        `Declares : ${declares.join(', ') || '(aucun)'}.`,
    );
  });
}

test('fontconfig est declare : sans lui, sharp ne CHERCHE aucune fonte', () => {
  assert.equal(
    aptPkgs().includes('fontconfig'),
    true,
    'installer des fichiers de fonte sans fontconfig ne suffit pas : c est fontconfig ' +
      'qui construit le cache que sharp interroge pour resoudre `font-family`.',
  );
});
