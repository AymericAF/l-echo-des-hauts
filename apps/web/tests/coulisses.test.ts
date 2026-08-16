/**
 * LA PAGE « COULISSES » NE PEUT PLUS REVENDIQUER CE QUE LE PROJET N A PAS.
 *
 * POURQUOI CETTE GARDE EXISTE, et pourquoi elle porte sur du VOCABULAIRE plutôt que sur du
 * rendu. Cette page est un document commercial autant que technique : c est celle qu on
 * montre. Or le brief lui interdit nommément deux familles de mots, et l interdiction ne
 * vient pas d une préférence de style — elle vient de deux avenants qui ont retiré au projet
 * ce que ces mots affirment :
 *
 *   - **avenant A3 (2026-07-31)** — Cloudflare sort du périmètre ; tout tient sur le VPS
 *     Hostinger. Le brief §7.4 en tire la conséquence, au mot près : « Les mots "CDN",
 *     "edge" et "réseau de diffusion" ne doivent plus figurer sur la page "Coulisses", ni
 *     dans aucun argumentaire tiré de ce projet. » Servir un site depuis une machine unique
 *     n est pas le servir depuis un réseau de diffusion, et l écrire serait vendre une
 *     propriété que l architecture n a pas.
 *   - **avenant A10 (2026-08-12)** — la catégorie SEO se lit désormais sur une campagne
 *     PageSpeed Insights, exécutée depuis les centres de données de Google. La formule
 *     « 100/100/100/100 depuis une machine unique en Europe » cesse donc d être exacte :
 *     les quatre scores ne viennent plus d un seul point de vue. Le brief écrit qu elle
 *     « ne se recopie plus telle quelle ».
 *
 * CE QUE CETTE GARDE PROUVE, ET CE QU ELLE NE PROUVE PAS. Elle prouve qu aucune de ces
 * affirmations ne peut revenir en silence dans le texte de la page — y compris par
 * inadvertance, des mois après que l avenant a été oublié. Elle ne prouve pas que la page
 * dit vrai sur le reste : aucune machine ne peut le dire. Elle tient la seule chose qui se
 * tienne mécaniquement — l absence de ce qui a été explicitement retiré.
 *
 * LES DEUX LOCALES SONT JUGÉES SÉPARÉMENT, et c est nécessaire : « CDN » traverse les
 * langues à l identique, mais « réseau de diffusion » a un équivalent anglais (« content
 * delivery network », « edge network ») qu une garde écrite pour le seul français
 * laisserait passer. Une interdiction qui ne vaudrait que dans une langue ne vaudrait rien.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const COMPOSANT = path.join(RACINE, 'src', 'components', 'pages', 'PageCoulisses.astro');
const PAGE_FR = path.join(RACINE, 'src', 'pages', 'coulisses.astro');
const PAGE_EN = path.join(RACINE, 'src', 'pages', 'en', 'coulisses.astro');
const CHEMINS = path.join(RACINE, 'src', 'lib', 'routes', 'chemins.ts');

const lire = (p: string) => fs.readFileSync(p, 'utf8');

/**
 * Le texte VISIBLE du composant, commentaires retirés.
 *
 * Sans ce nettoyage, la garde jugerait sa propre documentation : ce fichier-ci comme le
 * composant EXPLIQUENT pourquoi « CDN » est proscrit, donc le mot y figure légitimement.
 * Une garde qui rougirait sur l explication de sa propre raison d être serait ininstallable
 * — et on la désarmerait, ce qui est le pire des deux maux.
 */
function texteVisible(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

/** Le bloc de textes d une locale, tel que le composant le porte en dur. */
function blocLocale(source: string, locale: 'fr' | 'en'): string {
  const debut = source.indexOf(`  ${locale}: {`);
  assert.notEqual(debut, -1, `le composant ne porte pas de bloc de textes « ${locale} »`);
  const suite = source.slice(debut + 1);
  const fin = suite.indexOf('\n  },');
  assert.notEqual(fin, -1, `le bloc « ${locale} » n est pas refermé`);
  return suite.slice(0, fin);
}

/* ------------------------------------------------------------------ */
/* 1. LA PAGE EXISTE, DANS LES DEUX LANGUES                             */
/* ------------------------------------------------------------------ */

test('1. la page Coulisses existe en français et en anglais, et passe par un composant unique', () => {
  for (const p of [COMPOSANT, PAGE_FR, PAGE_EN]) {
    assert.ok(fs.existsSync(p), `manquant : ${path.relative(RACINE, p)}`);
  }
  assert.match(lire(PAGE_FR), /PageCoulisses/, 'la page française doit rendre le composant');
  assert.match(lire(PAGE_EN), /PageCoulisses/, 'la page anglaise doit rendre le composant');
  assert.match(lire(PAGE_EN), /locale="en"/, 'la page anglaise doit passer la locale en');
});

test('1 bis. « coulisses » est déclarée dans PAGES_STATIQUES', () => {
  // Sans cette déclaration, la page vit mais reste invisible aux mécanismes qui énumèrent
  // les pages statiques — sitemap et bascule de langue en tête.
  assert.match(lire(CHEMINS), /PAGES_STATIQUES[\s\S]{0,200}'coulisses'/);
});

/* ------------------------------------------------------------------ */
/* 2. LE VOCABULAIRE RETIRÉ PAR LES AVENANTS NE REVIENT PAS             */
/* ------------------------------------------------------------------ */

const PROSCRITS: Array<{ motif: RegExp; nom: string; pourquoi: string }> = [
  {
    motif: /\bCDN\b/i,
    nom: 'CDN',
    pourquoi: 'avenant A3 : Cloudflare est sorti du périmètre, tout tient sur un VPS unique',
  },
  {
    motif: /\bedge\b/i,
    nom: 'edge',
    pourquoi: 'avenant A3 : il n y a aucun point de présence réparti à revendiquer',
  },
  {
    motif: /réseaux?\s+de\s+diffusion/i,
    nom: 'réseau de diffusion',
    pourquoi: 'avenant A3 : une machine unique n est pas un réseau de diffusion',
  },
  {
    motif: /content\s+delivery\s+network/i,
    nom: 'content delivery network',
    pourquoi: 'avenant A3, version anglaise du même interdit',
  },
];

for (const locale of ['fr', 'en'] as const) {
  test(`2. aucun mot proscrit par l avenant A3 dans le texte ${locale}`, () => {
    const bloc = texteVisible(blocLocale(lire(COMPOSANT), locale));
    for (const { motif, nom, pourquoi } of PROSCRITS) {
      assert.equal(
        motif.test(bloc),
        false,
        `« ${nom} » figure dans le texte ${locale} de la page Coulisses — ${pourquoi}`,
      );
    }
  });
}

test('3. la formule des quatre scores n est pas recopiée telle quelle', () => {
  // L avenant A10 n interdit pas de citer les scores : il interdit de les attribuer TOUS
  // a un point de vue unique, puisque le SEO se lit desormais sur une campagne PSI.
  const visible = texteVisible(lire(COMPOSANT));
  assert.equal(
    /100\s*\/\s*100\s*\/\s*100\s*\/\s*100[^.]{0,80}(machine unique|single machine)/i.test(visible),
    false,
    'la formule « 100/100/100/100 depuis une machine unique » est périmée depuis l avenant A10 : '
      + 'les quatre scores ne viennent plus d un seul point de vue',
  );
});

/* ------------------------------------------------------------------ */
/* 4. CE QUE LA PAGE DOIT PORTER                                        */
/* ------------------------------------------------------------------ */

test('4. le caractère de démonstration est écrit, dans les deux langues', () => {
  const source = lire(COMPOSANT);
  assert.match(texteVisible(blocLocale(source, 'fr')), /démonstrateur|démonstration/i);
  assert.match(texteVisible(blocLocale(source, 'en')), /demonstrat/i);
});

test('5. la page nomme des options ÉCARTÉES, pas seulement ce qui a été retenu', () => {
  // Exigence explicite de la tâche : « y compris ce qui a été écarté et pourquoi ». Une
  // page qui n expose que les décisions retenues raconte un chemin sans embranchement —
  // ce qui est précisément ce qu un lecteur technique ne croit pas.
  const source = lire(COMPOSANT);
  assert.match(texteVisible(blocLocale(source, 'fr')), /écarté|renoncé|abandonn/i);
  assert.match(texteVisible(blocLocale(source, 'en')), /ruled out|rejected|discarded|set aside/i);
});

test('6. les deux locales portent chacune leur texte — aucune n est le calque de l autre', () => {
  const source = lire(COMPOSANT);
  const fr = texteVisible(blocLocale(source, 'fr')).replace(/\s+/g, ' ').trim();
  const en = texteVisible(blocLocale(source, 'en')).replace(/\s+/g, ' ').trim();
  assert.ok(fr.length > 400, 'le texte français est trop court pour un document de présentation');
  assert.ok(en.length > 400, 'le texte anglais est trop court pour un document de présentation');
  assert.notEqual(fr, en, 'les deux blocs sont identiques : une locale n a pas été traduite');
});
