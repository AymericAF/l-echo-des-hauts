/**
 * L ORIGINE PAR DEFAUT N A QU UN DOMICILE — et ce fichier rougit quand une neuvieme copie
 * apparait.
 *
 * CE QUI A ETE MESURE AVANT D ECRIRE CE FICHIER (2026-08-12, sur le depot a c35e7d5). La
 * chaine `https://echo.ayfiweb.fr` etait ecrite EN DUR, comme REPLI DE L ORIGINE DU SITE,
 * dans huit fichiers :
 *
 *     astro.config.mjs:51                    site: process.env.ECHO_SITE_URL ?? '…'
 *     src/lib/seo/origine-site.ts:95         export const ORIGINE_PAR_DEFAUT = '…'
 *     integrations/garde-seo.mjs:51          process.env.ECHO_SITE_URL ?? '…'
 *     integrations/garde-origine-medias.mjs:62          idem
 *     integrations/garde-liens.mjs:53                   idem
 *     scripts/verifier-liens.mjs:197         argv[3] ?? process.env.ECHO_SITE_URL ?? '…'
 *     scripts/verifier-origine-medias.mjs:264           idem
 *     scripts/verifier-seo.mjs:697                      idem
 *
 * plus deux replis de meme nature dans les preuves, qui epinglent l origine du build
 * hermetique qu elles lancent (`scripts/preuve-rendu.mjs:135`, `scripts/preuve-pagination.mjs:38`).
 * AUCUNE garde ne comparait ces copies entre elles : la premiere oubliee divergeait en
 * silence, et un build aurait pu publier des canoniques sur un domaine que les
 * verificateurs auraient continue de juger « externe ».
 *
 * CE QUE CE FICHIER GARDE, ET CE QU IL NE GARDE PAS. Il ne verifie pas que les dix sites
 * d appel « se comportent bien » : ils importent desormais la meme constante, ce que les
 * autres tests exercent deja par leurs sorties. Il verifie la seule chose qu aucun d eux ne
 * peut voir depuis sa place — QU AUCUN NE REECRIT LA VALEUR. C est la classe de defaut, pas
 * le cas.
 *
 * DEUX VALEURS IDENTIQUES NE SONT PAS LA MEME VALEUR. `scripts/verifier-en-tetes.mjs` porte
 * `BASE_PAR_DEFAUT`, egale a la meme chaine aujourd hui, et elle reste DEHORS — la raison
 * est ecrite dans `AUTRES_DOMICILES` ci-dessous, et la fondre creerait un couplage faux.
 *
 * PORTEE DU BALAYAGE : le code qui FABRIQUE ou JUGE des adresses (`astro.config.mjs`,
 * `integrations/`, `scripts/`, `src/`). `tests/` est dehors, et delibrement : la valeur y
 * est une DONNEE de banc, et `tests/origine-producteur.test.ts` doit pouvoir epingler la
 * chaine litterale — sans quoi plus rien au monde ne fixerait le domaine reel, et la
 * constante ne serait comparee qu a elle-meme.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { ORIGINE_PAR_DEFAUT } from '../scripts/origine.mjs';
import { ORIGINE_PAR_DEFAUT as REEXPORTEE } from '../src/lib/seo/origine-site.ts';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Le seul fichier autorise a ECRIRE la chaine : celui qui la declare. */
const DOMICILE = 'scripts/origine.mjs';

/**
 * LES AUTRES DOMICILES LEGITIMES, ET POURQUOI — a lire AVANT de « finir le travail » en
 * les fondant dans `ORIGINE_PAR_DEFAUT`. Une valeur egale n est pas une valeur commune :
 * ce qui compte est ce qui la ferait CHANGER.
 */
const AUTRES_DOMICILES: Record<string, string> = {
  'scripts/verifier-en-tetes.mjs':
    'BASE_PAR_DEFAUT est l ADRESSE OU LA PRODUCTION EST DEPLOYEE, interrogee sur le reseau — ' +
    'pas le repli d une variable de build. Les deux sont egales aujourd hui par coincidence : ' +
    'le site se publie la ou il est deploye. Les fondre ferait qu un changement de repli de ' +
    'BUILD (une valeur de code, changeable pour un aperçu, un fork MIT, un sous-domaine) ' +
    'REPOINTERAIT EN SILENCE la sonde reseau qui existe pour constater la disparition des ' +
    'en-tetes de securite sur la production — elle mesurerait un autre hote, et resterait ' +
    'verte. Ce verificateur ne lit d ailleurs jamais ECHO_SITE_URL : sa seule autre porte est ' +
    'process.argv[2].',
};

/** Les fichiers balayes : ceux qui fabriquent ou jugent des adresses. */
function fichiersBalayes(): string[] {
  const trouves: string[] = ['astro.config.mjs'];
  for (const dossier of ['integrations', 'scripts', 'src']) {
    const pile = [path.join(RACINE, dossier)];
    while (pile.length > 0) {
      const courant = pile.pop() as string;
      for (const entree of fs.readdirSync(courant, { withFileTypes: true })) {
        const absolu = path.join(courant, entree.name);
        if (entree.isDirectory()) {
          pile.push(absolu);
          continue;
        }
        if (!/\.(mjs|cjs|js|ts|astro)$/.test(entree.name)) continue;
        trouves.push(path.relative(RACINE, absolu).split(path.sep).join('/'));
      }
    }
  }
  return trouves.sort();
}

/**
 * Le source PRIVE DE SES COMMENTAIRES — une mention en prose n est pas une copie.
 *
 * DEUX PROPRIETES VOULUES, et toutes deux exercees plus bas parce qu un depouilleur trop
 * gourmand rendrait cette garde VERTE SUR UN DEPOT FAUTIF :
 *
 *   - un bloc `/*` JAMAIS FERME ne depouille RIEN (le motif exige son `*` + `/`), donc ne
 *     peut pas avaler la fin du fichier ;
 *   - `//` ne coupe que precede d autre chose qu un deux-points : sans cela `https://…`
 *     serait lu comme un debut de commentaire, et TOUTE occurrence disparaitrait.
 */
export function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('la chaine litterale ne subsiste que dans son domicile et les exceptions declarees', () => {
  const fautifs: string[] = [];

  for (const relatif of fichiersBalayes()) {
    if (relatif === DOMICILE) continue;
    const code = sansCommentaires(fs.readFileSync(path.join(RACINE, relatif), 'utf8'));
    const occurrences = code.split(ORIGINE_PAR_DEFAUT).length - 1;
    if (occurrences === 0) continue;
    if (relatif in AUTRES_DOMICILES) continue;
    fautifs.push(`${relatif} : ${occurrences} occurrence(s) litterale(s) de ${ORIGINE_PAR_DEFAUT}`);
  }

  assert.deepEqual(
    fautifs,
    [],
    `L origine par defaut est RECOPIEE hors de ${DOMICILE} :\n  - ${fautifs.join('\n  - ')}\n` +
      `  Importe ORIGINE_PAR_DEFAUT depuis ${DOMICILE}. Si cette occurrence-la n est PAS le repli\n` +
      "  de l origine du site mais une AUTRE valeur qui lui ressemble, declare-la dans\n" +
      '  AUTRES_DOMICILES avec la raison qui la ferait changer independamment.',
  );
});

test('le domicile declare bien la constante, et le producteur la REEXPORTE sans la reecrire', () => {
  assert.equal(typeof ORIGINE_PAR_DEFAUT, 'string');
  assert.equal(REEXPORTEE, ORIGINE_PAR_DEFAUT);

  const producteur = fs.readFileSync(path.join(RACINE, 'src/lib/seo/origine-site.ts'), 'utf8');
  assert.match(
    sansCommentaires(producteur),
    /export\s*\{[^}]*ORIGINE_PAR_DEFAUT/,
    'origine-site.ts doit REEXPORTER la constante, pas la redeclarer : ses importateurs ' +
      'existants (tests, contexte-site.ts) ne doivent pas bouger.',
  );
});

test('chaque exception declaree porte encore la chaine — sinon la declaration est perimee', () => {
  for (const [relatif, raison] of Object.entries(AUTRES_DOMICILES)) {
    const source = sansCommentaires(fs.readFileSync(path.join(RACINE, relatif), 'utf8'));
    assert.ok(
      source.includes(ORIGINE_PAR_DEFAUT),
      `${relatif} ne porte plus la chaine : retire son entree de AUTRES_DOMICILES. Une ` +
        'exception perimee est un laissez-passer qui attend un futur fichier.',
    );
    assert.ok(raison.length > 80, `${relatif} : la raison doit dire ce qui la ferait changer seule.`);
  }
});

// ── Le depouilleur lui-meme : une garde qui depouille trop est verte sur un depot fautif ──

test('sansCommentaires ne prend PAS `https://` pour un debut de commentaire', () => {
  assert.equal(sansCommentaires("const a = 'https://echo.ayfiweb.fr';"), "const a = 'https://echo.ayfiweb.fr';");
  assert.equal(sansCommentaires('const a = 1; // https://echo.ayfiweb.fr'), 'const a = 1; ');
});

test('un bloc de commentaire JAMAIS FERME ne depouille rien', () => {
  const source = "/* ouvert et jamais ferme\nconst a = 'https://echo.ayfiweb.fr';";
  assert.ok(sansCommentaires(source).includes('https://echo.ayfiweb.fr'));
});

test('un bloc ferme est depouille, et seulement lui', () => {
  const source = "/* mention https://echo.ayfiweb.fr */\nconst a = 'https://echo.ayfiweb.fr';";
  assert.equal(sansCommentaires(source).split('https://echo.ayfiweb.fr').length - 1, 1);
});
