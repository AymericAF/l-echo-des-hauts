/**
 * LA GARDE DE LANGUE, PROUVEE EN LA CASSANT — dans les deux sens, et aux deux etages.
 *
 * CE QU ELLE FERME (tache `ba63557e`, 2026-08-11). Le 2026-08-10, deux chaines francaises
 * sont apparues sur les pages ANGLAISES, dans le pied de page : l etiquette d accessibilite
 * du bloc de reseaux (« Reseaux du journal ») et le nom de la plateforme `site`
 * (« Site web »). Elles n avaient pas ete introduites ce jour-la — elles dataient du socle
 * (`d2e7b75`) et dormaient invisibles parce que les pages anglaises ne rendaient PAS ce
 * bloc ; le commit `e9dc7c0`, en donnant au banc ses six fixtures anglaises, l a rendu, et
 * a montre ce qui dormait. L inventaire de la sortie en a trouve trois autres du meme
 * genre : le libelle du lien video et sa mention d ouverture, la signature du texte
 * alternatif de l image de partage, et le complement de la bascule FR/EN — celui-la etait
 * pourtant DEJA localise, c est sa declaration `lang=` qui mentait.
 *
 * DEUX ETAGES, ET ILS NE SE REMPLACENT PAS.
 *
 *   1. LA SORTIE (`scripts/verifier-langue.mjs`). Il confronte ce que le lecteur RECOIT au
 *      vocabulaire derive de `src/lib/i18n/libelles.ts`. Il voit tout ce qui est passe par
 *      le dictionnaire, et RIEN de ce qui ne l est pas — une chaine ecrite en dur n a rien
 *      a quoi se comparer. C est exactement l etat des quatre defauts AVANT correction.
 *   2. LA SOURCE (famille « litteraux » plus bas). Elle refuse un texte litteral dans le
 *      gabarit d un composant : c est la FORME qu avait `intitule="Reseaux du journal"`.
 *      Elle attrape donc ce que l etage 1 ne peut pas voir, et reciproquement.
 *
 * CE QUE NI L UN NI L AUTRE NE VOIT, ecrit plutot que tu : une chaine calculee dans le
 * frontmatter d un composant ou dans un module `.ts`, et absente du dictionnaire. C etait
 * le cas de « Voir la video sur … ». Rien ici ne l attraperait ; ce qui l attrape est que
 * son domicile soit desormais le dictionnaire, d ou l etage 1 le voit.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ISSUES } from '../scripts/issues.mjs';
import {
  chainesDe,
  inspecterLangue,
  langueDuDocument,
  LONGUEUR_MINIMALE,
  vocabulaireExclusif,
} from '../scripts/verifier-langue.mjs';
import { LIBELLES } from '../src/lib/i18n/libelles.ts';

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const COMPOSANTS = path.join(RACINE, 'src', 'components');

function distFactice(fichiers: Record<string, string>): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-langue-'));
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const complet = path.join(racine, relatif);
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, contenu, 'utf8');
  }
  return racine;
}

function page(lang: string, corps: string): string {
  return `<!doctype html><html lang="${lang}"><head><title>t</title></head><body>${corps}</body></html>`;
}

// ── 1. Le vocabulaire se DERIVE du dictionnaire, il ne se recopie pas ─────────────────

test('le vocabulaire exclusif sort du dictionnaire, locale par locale', () => {
  const exclusif = vocabulaireExclusif();
  assert.deepEqual([...exclusif.keys()].sort(), Object.keys(LIBELLES).sort());

  /* Les quatre chaines rapatriees le 2026-08-11 doivent y etre : sans elles, la garde
     serait verte sur le defaut precis qu elle existe pour attraper. */
  assert.ok(exclusif.get('fr')!.includes('Reseaux du journal'));
  assert.ok(exclusif.get('fr')!.includes('Site web'));
  assert.ok(exclusif.get('fr')!.includes('Voir la video sur'));
  assert.ok(exclusif.get('fr')!.includes('(s ouvre dans un nouvel onglet)'));
  assert.ok(exclusif.get('en')!.includes('(opens in a new tab)'));

  /* « Website » (7 caracteres) n y est PAS, et c est le seuil qui le veut. La garde de
     sortie est donc asymetrique sur ce libelle-la : elle attrape « Site web » sur une page
     anglaise — le defaut reel du 2026-08-10 — mais pas « Website » sur une page francaise.
     Ce sens-la est tenu par le test unitaire de `libelleDePlateforme`, qui exerce les deux
     locales. Ecrit ici plutot que tu : une garde dont on ignore la portee finit par se
     voir preter une couverture qu elle n a pas. */
  assert.ok(!exclusif.get('en')!.includes('Website'));
  assert.ok('Website'.length < LONGUEUR_MINIMALE);
});

test('une valeur IDENTIQUE dans les deux locales n entre dans aucun vocabulaire', () => {
  /* « Pagination » se dit Pagination des deux cotes. Le retenir ferait rougir chaque page
     anglaise sur une chaine parfaitement correcte — et une garde rouge en permanence est
     une garde morte. L exclusion se DERIVE, elle n est pas une liste d exceptions. */
  assert.equal(LIBELLES.fr.navigationPages, LIBELLES.en.navigationPages);
  for (const fragments of vocabulaireExclusif().values()) {
    assert.equal(fragments.includes('Pagination'), false);
  }
});

test('les fragments trop courts sont ecartes, et ce seuil est ce qui evite les faux', () => {
  for (const fragments of vocabulaireExclusif().values()) {
    for (const fragment of fragments) {
      assert.ok(fragment.length >= LONGUEUR_MINIMALE, `« ${fragment} » est trop court`);
    }
  }
  /* « par » et « sur » sont des parties fixes de vrais libelles ; ils se retrouvent dans
     « separate » ou « compare » et ne prouveraient rien. */
  for (const fragments of vocabulaireExclusif().values()) {
    assert.equal(fragments.includes('par'), false);
    assert.equal(fragments.includes('sur'), false);
  }
});

test('un dictionnaire de banc suffit : rien n est cable sur FR et EN', () => {
  const banc = {
    fr: { bonjour: 'Bonjour le monde', commun: 'Pagination' },
    de: { bonjour: 'Guten Tag Welt', commun: 'Pagination' },
  };
  const exclusif = vocabulaireExclusif(banc);
  assert.deepEqual(exclusif.get('fr'), ['Bonjour le monde']);
  assert.deepEqual(exclusif.get('de'), ['Guten Tag Welt']);
});

// ── 2. La pile des langues : le verdict se rend sur l ELEMENT, pas sur la page ────────

test('la langue d un element se transmet a ses descendants, et se surcharge', () => {
  const trouvees = chainesDe(
    '<html lang="en"><body><p>Latest articles here</p>' +
      '<a lang="fr"><span>Lire en francais aussi</span></a></body></html>',
  );
  const parLangue = Object.fromEntries(trouvees.map((c) => [c.texte, c.lang]));
  assert.equal(parLangue['Latest articles here'], 'en');
  assert.equal(parLangue['Lire en francais aussi'], 'fr');
});

test('le contenu d un script ou d un style n est pas du texte adresse au lecteur', () => {
  const trouvees = chainesDe(
    page('en', '<script type="application/ld+json">{"name":"Reseaux du journal"}</script>' +
      '<style>.a{content:"Reseaux du journal"}</style><p>After the script</p>'),
  );
  assert.equal(trouvees.some((c) => c.texte.includes('Reseaux du journal')), false);
  assert.ok(trouvees.some((c) => c.texte === 'After the script'));
});

test('les attributs parlants sont lus, et rattaches a la langue de LEUR element', () => {
  const trouvees = chainesDe(page('en', '<nav aria-label="Reseaux du journal"></nav>'));
  const trouve = trouvees.find((c) => c.source === 'aria-label');
  assert.equal(trouve?.texte, 'Reseaux du journal');
  assert.equal(trouve?.lang, 'en');
});

test('langueDuDocument lit le lang du document, et rend null quand il n y en a pas', () => {
  assert.equal(langueDuDocument('<html lang="en"><body></body></html>'), 'en');
  assert.equal(langueDuDocument('<html><body></body></html>'), null);
});

// ── 3. PROUVEE EN CASSANT — le defaut du 2026-08-10, reconstitue ─────────────────────

/**
 * LE CAS FONDATEUR, TEL QU IL ETAIT. Chacun de ces quatre extraits est la sortie REELLE
 * mesuree avant correction sur `dist/en/index.html` et sur la page article anglaise.
 */
const DEFAUTS_DU_2026_08_10: { nom: string; corps: string; fragment: string }[] = [
  {
    nom: 'l etiquette du bloc de reseaux du pied de page',
    corps: '<nav class="liens-sociaux" aria-label="Reseaux du journal"><ul></ul></nav>',
    fragment: 'Reseaux du journal',
  },
  {
    nom: 'le nom de la plateforme `site`',
    corps: '<a href="https://exemple.invalid"><span class="liens-sociaux__nom--masque">Site web</span></a>',
    fragment: 'Site web',
  },
  {
    nom: 'le libelle du lien video',
    corps: '<a href="https://exemple.invalid"><span class="bloc-video__libelle">Voir la video sur YouTube</span></a>',
    fragment: 'Voir la video sur',
  },
  {
    nom: 'la mention d ouverture du lien video, texte ACCESSIBLE',
    corps: '<span class="hors-ecran"> (s ouvre dans un nouvel onglet)</span>',
    fragment: '(s ouvre dans un nouvel onglet)',
  },
];

for (const defaut of DEFAUTS_DU_2026_08_10) {
  test(`ROUGE sur une page anglaise portant ${defaut.nom}`, () => {
    const dist = distFactice({ 'en/index.html': page('en', defaut.corps) });
    const rapport = inspecterLangue(dist);
    assert.equal(rapport.issue, ISSUES.ANOMALIE, JSON.stringify(rapport));
    assert.equal(rapport.manquements.length, 1);
    assert.ok(rapport.manquements[0].includes(defaut.fragment));
    assert.ok(rapport.manquements[0].includes('en/index.html'));
    fs.rmSync(dist, { recursive: true, force: true });
  });
}

test('VERT sur la meme page une fois la chaine traduite — la garde ne rougit pas par principe', () => {
  const dist = distFactice({
    'en/index.html': page(
      'en',
      '<nav class="liens-sociaux" aria-label="Follow the newsroom"><ul>' +
        '<li><a href="https://exemple.invalid"><span class="liens-sociaux__nom--masque">Website</span></a></li>' +
        '</ul></nav>' +
        '<a href="https://exemple.invalid"><span class="bloc-video__libelle">Watch the video on YouTube' +
        '<span class="hors-ecran"> (opens in a new tab)</span></span></a>',
    ),
  });
  const rapport = inspecterLangue(dist);
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.issue, ISSUES.CONFORME);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('SYMETRIQUE : une chaine anglaise sur une page francaise rougit aussi', () => {
  /* Le miroir compte autant : la garde n est pas « pas de francais en anglais », elle est
     « la langue de l element ». Un dispositif a moitie oriente laisserait croire la regle
     appliquee partout. */
  const dist = distFactice({ 'index.html': page('fr', '<nav aria-label="Follow the newsroom"></nav>') });
  const rapport = inspecterLangue(dist);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.ok(rapport.manquements[0].includes('Follow the newsroom'));
  fs.rmSync(dist, { recursive: true, force: true });
});

test('LA BASCULE FR/EN RESTE VERTE : un libelle declare dans SA langue est correct', () => {
  /* T-04 : le libelle du lien est ecrit dans la langue de DESTINATION, et porte `lang`.
     Une garde qui jugerait a la page ferait rougir le comportement voulu, et se ferait
     desarmer dans la semaine. C est la seule exemption, et elle est MECANIQUE — elle ne
     nomme aucune chaine. */
  const dist = distFactice({
    'en/index.html': page(
      'en',
      '<a hreflang="fr" lang="fr">FR<span class="hors-ecran">— Lire en français</span></a>',
    ),
  });
  const rapport = inspecterLangue(dist);
  assert.deepEqual(rapport.manquements, []);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('LE DEFAUT TROUVE PAR LA GARDE ELLE-MEME : un complement francais sous lang="en"', () => {
  /* Il vivait dans `BasculeLangue.astro` : les DEUX moities du libelle accessible etaient
     concatenees dans un `<span>` porte par le `<a lang={cible.locale}>`. Le texte etait
     localise ; c est sa DECLARATION qui mentait, et un lecteur d ecran annoncait la phrase
     francaise avec la phonetique anglaise. Aucune relecture ne l avait vu — la sortie, si. */
  const avant = distFactice({
    'index.html': page(
      'fr',
      '<a hreflang="en" lang="en">EN<span class="hors-ecran">— Read in English — ' +
        "cette page n'est pas disponible en anglais</span></a>",
    ),
  });
  assert.equal(inspecterLangue(avant).issue, ISSUES.ANOMALIE);
  fs.rmSync(avant, { recursive: true, force: true });

  const apres = distFactice({
    'index.html': page(
      'fr',
      '<a hreflang="en" lang="en">EN<span class="hors-ecran">— Read in English — ' +
        "<span lang=\"fr\">cette page n'est pas disponible en anglais</span></span></a>",
    ),
  });
  assert.deepEqual(inspecterLangue(apres).manquements, []);
  fs.rmSync(apres, { recursive: true, force: true });
});

test('le texte alternatif de l image de partage est juge, parce qu il est ENTENDU', () => {
  const dist = distFactice({
    'en/index.html':
      '<!doctype html><html lang="en"><head><title>t</title>' +
      '<meta property="og:image:alt" content="A title — A section, par Camille Ferrand">' +
      '</head><body></body></html>',
  });
  /* « par » seul est trop court pour prouver quoi que ce soit — c est assume, et c est
     pourquoi la localisation de `texteAlternatifOg` est tenue par son propre test unitaire
     (`tests/seo-gabarit-og.test.ts`). Ce que la garde voit ici est le reste de la page. */
  const rapport = inspecterLangue(dist);
  assert.equal(rapport.issue, ISSUES.CONFORME);
  assert.ok(rapport.chaines > 0, 'le meta doit bien avoir ete lu');
  fs.rmSync(dist, { recursive: true, force: true });
});

// ── 4. La reserve sur `alt` : signalee, jamais comptee comme manquement ───────────────

test('un alt francais sur une page anglaise est une RESERVE, pas un manquement', () => {
  /* `alternativeText` est un champ NON localise de la mediatheque (A-06) : les textes de
     remplacement sont francais sur les pages anglaises par construction du MODELE. Le
     faire rougir a chaque build sans pouvoir le corriger ici tuerait la garde ; le taire
     serait pire. Il est donc COMPTE et dit dans le compte rendu. */
  const dist = distFactice({
    'en/index.html': page('en', '<img src="/a.png" alt="Une grue au-dessus des toits gelés" width="1" height="1">'),
  });
  const rapport = inspecterLangue(dist);
  assert.equal(rapport.issue, ISSUES.CONFORME);
  assert.equal(rapport.altsNonLocalises, 1);
  fs.rmSync(dist, { recursive: true, force: true });
});

// ── 5. LES LITTERAUX A LA SOURCE — l autre etage, celui qui voit ce que la sortie ne dit pas

/**
 * LA REGLE : le GABARIT d un composant ne porte aucun texte litteral adresse au lecteur.
 *
 * Elle vise la FORME EXACTE du defaut fondateur — `intitule="Reseaux du journal"` ecrit
 * dans `PiedDePage.astro`, et ` (s ouvre dans un nouvel onglet)` ecrit dans `BlocVideo`.
 * Un texte qui vient de `libelles(locale)` passe par `{…}` : il n est donc jamais un
 * litteral de gabarit. Ce que la regle laisse passer est la ponctuation et les separateurs,
 * qui n ont pas de langue.
 *
 * ELLE NE REGARDE PAS LE FRONTMATTER, et c est un choix : c est la que vivent les tables
 * `{ fr: …, en: … }` des pages « A propos » et « Mentions legales », qui sont la bonne
 * facon d ecrire du texte de page. Les distinguer lexicalement d un litteral egare
 * demanderait de suivre les accolades, pour une precision qui ne vaut pas sa fragilite.
 */
const SANS_LANGUE = /^[\s\p{P}\p{S}\d]*$/u;

/**
 * LES LITTERAUX ADMIS, ET LEUR RAISON — la seule porte de sortie, et elle est ecrite.
 *
 * Rien d autre ne doit y entrer sans une raison qui tienne en une phrase et qui explique
 * pourquoi la chaine ne se traduit PAS. « C est plus simple » n en est pas une.
 */
const LITTERAUX_ADMIS: Record<string, string> = {
  /* VIDE DEPUIS LE TRAIN DU 2026-08-12, et c est la garde ci-dessous qui l a exige.
     Les quatre entrees d ici — raison sociale et adresse de l editeur, nom du directeur
     de la publication, adresse de l hebergeur, adresse electronique — vivaient toutes EN
     DUR dans `PageMentions.astro`. `p2/wt-f866e743` a ramene ce texte a une source unique,
     le champ `configuration.mentionsLegales` : plus aucun gabarit ne les porte.

     Les laisser aurait elargi le trou en silence, ce que le cas « aucun ne survit a sa
     disparition » interdit precisement : le jour ou un composant reprend l une de ces
     chaines, elle serait entree par une porte restee ouverte pour un texte qui avait
     demenage. Le texte legal n est pas moins garde pour autant — il l est ailleurs et
     mieux, par `scripts/mentions-obligatoires.mjs`, qui l exige DANS LA SORTIE, aux deux
     locales, plutot que de tolerer sa presence dans un gabarit. */
};

/** Le gabarit d un composant `.astro` : ce qui suit le second `---`. */
function gabaritDe(source: string): string {
  const premier = source.indexOf('---');
  if (premier !== 0) return source;
  const second = source.indexOf('\n---', premier + 3);
  return second === -1 ? '' : source.slice(second + 4);
}

/** Attributs dont une valeur ECRITE EN CLAIR est du texte adresse au lecteur. */
const ATTRIBUTS_PARLANTS_ASTRO = /^(aria-label|title|placeholder|intitule|alt|label|legende)$/;

/** Elements dont le contenu n est pas du gabarit : il ne se lit pas comme du texte. */
const NON_GABARIT = new Set(['script', 'style']);

/** La contre-oblique, ecrite ainsi pour qu aucune relecture n ait a compter ses doubles. */
const ECHAPPEMENT = String.fromCharCode(92);

/**
 * Les textes litteraux d un gabarit : noeuds de texte, et valeurs d attributs parlants.
 *
 * LE DECOUPAGE EST UN PARCOURS, PAS UNE SUITE DE REGEX. Un gabarit Astro melange trois
 * langages : du balisage, des expressions `{...}` qui peuvent contenir des accolades, des
 * chevrons et des chaines, et — sur `/recherche` — un `<script is:inline>` entier. Une
 * regex qui retire `\{[^{}]*\}` laisse tomber le `switch` de `RichTexte.astro` dans le
 * texte, et le test rougit alors sur du JavaScript qu il prend pour de la prose. Mesure du
 * 2026-08-11, premiere ecriture de ce test : douze faux positifs, onze dans deux fichiers.
 */
/**
 * Le texte et les attributs parlants du BALISAGE contenu dans une expression Astro.
 *
 * `{configuration && (<LiensSociaux intitule="…" />)}` est du gabarit, pas du code — et
 * c est la forme sous laquelle le defaut fondateur a ete reintroduit pour prouver cette
 * garde en la cassant. Le decoupage reste volontairement etroit : une valeur d attribut
 * parlant, et un texte entre deux chevrons sans accolade ni chevron. Ce qui ressemble a du
 * code (`=>`, une comparaison) ne rend que de la ponctuation, ecartee par `SANS_LANGUE`.
 */
function jsxDansUneExpression(expression: string): string[] {
  const trouves: string[] = [];
  for (const trouve of expression.matchAll(/([a-zA-Z:-]+)\s*=\s*"([^"]*)"/g)) {
    if (ATTRIBUTS_PARLANTS_ASTRO.test(trouve[1])) trouves.push(trouve[2].trim());
  }
  for (const trouve of expression.matchAll(/>([^<>{}]+)</g)) {
    const texte = trouve[1].replace(/\s+/g, ' ').trim();
    /* Un `>` peut aussi etre une comparaison (`>=`) ou la fleche d une lambda : ce qui
       suit est alors du JavaScript, pas de la prose. Deux marques suffisent a le dire —
       une affectation ou un point-virgule dans le morceau, ou un morceau qui commence par
       la fermeture d une parenthese. Elles n apparaissent dans aucun texte de page. */
    if (/[;=]/.test(texte) || /^[),]/.test(texte)) continue;
    trouves.push(texte);
  }
  return trouves.filter((t) => t.length > 0);
}

function litterauxDe(gabarit: string): string[] {
  const trouves: string[] = [];
  let texte = '';
  let i = 0;

  const vider = () => {
    const propre = texte.replace(/\s+/g, ' ').trim();
    if (propre.length > 0) trouves.push(propre);
    texte = '';
  };

  while (i < gabarit.length) {
    const c = gabarit[i];

    if (c === '{') {
      /* Expression Astro. Son CODE est saute — accolades imbriquees et chaines comprises,
         sinon le `switch` de `RichTexte.astro` se lirait comme de la prose. Mais une
         expression contient souvent du BALISAGE (`{cond && (<p>…</p>)}`), et c est meme la
         que vit la moitie des gabarits de ce depot : son contenu est donc repris ensuite
         par `jsxDansUneExpression`. Sauter l expression entiere laissait passer le defaut
         fondateur lui-meme — mesure du 2026-08-11, en le reintroduisant. */
      vider();
      const debutExpression = i;
      let profondeur = 0;
      let quote: string | null = null;
      while (i < gabarit.length) {
        const d = gabarit[i];
        if (quote !== null) {
          if (d === ECHAPPEMENT) i += 1;
          else if (d === quote) quote = null;
        } else if (d === '"' || d === "'" || d === '`') quote = d;
        else if (d === '{') profondeur += 1;
        else if (d === '}') {
          profondeur -= 1;
          if (profondeur === 0) {
            i += 1;
            break;
          }
        }
        i += 1;
      }
      trouves.push(...jsxDansUneExpression(gabarit.slice(debutExpression, i)));
      continue;
    }

    if (c === '<') {
      vider();
      const nom = /^<\/?([a-zA-Z][a-zA-Z0-9.:-]*)/.exec(gabarit.slice(i, i + 64));
      // Fin de la balise, en sautant par-dessus les valeurs entre guillemets.
      let j = i + 1;
      let quote: string | null = null;
      while (j < gabarit.length) {
        const d = gabarit[j];
        if (quote !== null) {
          if (d === quote) quote = null;
        } else if (d === '"' || d === "'") quote = d;
        else if (d === '>') break;
        j += 1;
      }
      const balise = gabarit.slice(i, j + 1);

      for (const trouve of balise.matchAll(/([a-zA-Z:-]+)\s*=\s*"([^"]*)"/g)) {
        if (ATTRIBUTS_PARLANTS_ASTRO.test(trouve[1])) trouves.push(trouve[2].trim());
      }

      const nomBas = nom === null ? '' : nom[1].toLowerCase();
      if (NON_GABARIT.has(nomBas) && !balise.startsWith('</')) {
        const ferme = gabarit.toLowerCase().indexOf(`</${nomBas}`, j);
        if (ferme === -1) break;
        const finFermante = gabarit.indexOf('>', ferme);
        i = finFermante === -1 ? gabarit.length : finFermante + 1;
        continue;
      }

      i = j + 1;
      continue;
    }

    texte += c;
    i += 1;
  }
  vider();

  return trouves.filter((t) => t.length > 0);
}

function composants(dossier: string, trouves: string[] = []): string[] {
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) composants(complet, trouves);
    else if (entree.name.endsWith('.astro')) trouves.push(complet);
  }
  return trouves;
}

test('aucun gabarit de composant ne porte de texte litteral non declare', () => {
  const fautifs: string[] = [];
  for (const fichier of composants(COMPOSANTS)) {
    const relatif = path.relative(RACINE, fichier).split(path.sep).join('/');
    for (const litteral of litterauxDe(gabaritDe(fs.readFileSync(fichier, 'utf8')))) {
      if (SANS_LANGUE.test(litteral)) continue;
      if (LITTERAUX_ADMIS[litteral] !== undefined) continue;
      fautifs.push(`${relatif} → « ${litteral} »`);
    }
  }
  assert.deepEqual(
    fautifs,
    [],
    'Un texte ecrit dans le gabarit d un composant sort dans TOUTES les locales : c est la ' +
      'forme exacte de `intitule="Reseaux du journal"`. Fais-le venir de `libelles(locale)` ' +
      '— ou, si la chaine ne se traduit reellement pas, declare-la dans LITTERAUX_ADMIS ' +
      'AVEC SA RAISON.',
  );
});

test('la regle attrape bien le defaut fondateur, et laisse passer la ponctuation', () => {
  /* Prouvee en cassant, sur un gabarit fabrique : sans cela on ne saurait pas si le test
     ci-dessus est vert parce que le depot est propre ou parce que la regle ne voit rien. */
  const fautif = '---\nconst x = 1;\n---\n<nav intitule="Reseaux du journal"><p>Un texte ecrit ici</p></nav>\n';
  const litteraux = litterauxDe(gabaritDe(fautif));
  assert.ok(litteraux.includes('Reseaux du journal'));
  assert.ok(litteraux.includes('Un texte ecrit ici'));

  const sain = '---\nconst mots = 1;\n---\n<nav aria-label={mots.x}><p>{mots.y} — {mots.z}</p></nav>\n';
  for (const litteral of litterauxDe(gabaritDe(sain))) {
    assert.ok(SANS_LANGUE.test(litteral), `« ${litteral} » aurait du etre ecarte`);
  }
});

test('chaque litteral admis porte une raison ecrite, et aucun ne survit a sa disparition', () => {
  const tous = new Set<string>();
  for (const fichier of composants(COMPOSANTS)) {
    for (const litteral of litterauxDe(gabaritDe(fs.readFileSync(fichier, 'utf8')))) {
      tous.add(litteral);
    }
  }
  for (const [litteral, raison] of Object.entries(LITTERAUX_ADMIS)) {
    assert.ok(raison.length >= 40, `« ${litteral} » : raison trop courte pour dire POURQUOI`);
    /* Une exception qui survit a sa cible elargit le trou en silence : le jour ou un
       composant reprend cette chaine, elle entre par la porte laissee ouverte. */
    assert.ok(tous.has(litteral), `« ${litteral} » est admis mais n existe plus dans aucun gabarit`);
  }
});
