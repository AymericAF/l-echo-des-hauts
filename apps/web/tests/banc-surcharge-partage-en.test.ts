/**
 * LE BANC EXERCE-T-IL SEULEMENT LE CAS ANGLAIS SURCHARGE ? (ajout du 2026-08-19)
 *
 * Jusqu ici, NON. `fixtures/articles-en.json` portait `seo.alternativePartage: null` et
 * `seo.imagePartage: null` — il n existait donc AUCUNE page anglaise surchargee a juger
 * dans tout le banc. Un defaut qui n aurait touche QUE ce cas serait reste vert partout :
 * c est la moitie aval du trou par lequel le defaut d `alternativePartage` a vecu (l autre
 * moitie etant la garde structurelle du CMS, qui ne lisait que `src/components/bloc/`).
 *
 * ⚠️ CE QUE LE COMMENTAIRE DE `fixtures-locales` DIT, ET POURQUOI ON NE LE CONTREDIT PAS.
 * Il justifie le vide des `alternative*` : « c est le corpus versionne, pas les fixtures,
 * qui porte les alternatives anglaises ». Cet argument tient pour l EXIGENCE D ECART que
 * `fixtures-locales` impose champ par champ — on ne la change pas, `seo` reste dans son
 * `sansEcart`. Il ne tient PAS comme raison de n avoir nulle part une page anglaise
 * surchargee : le banc doit pouvoir montrer ce que le site SERT quand la surcharge existe,
 * sinon plus rien ne distingue « la surcharge est honoree » de « la surcharge est ignoree ».
 *
 * LE CAS EST CELUI DU 2026-08-14, a l identique : une carte de partage UNIQUE (un fichier,
 * donc un seul `alternativeText`, en francais) et une alternative SURCHARGEE par locale.
 * Ignorer la surcharge fait servir le francais sur la page anglaise — ce qu un lecteur
 * d ecran annonce.
 *
 * ⚠️ CE QUE CE FICHIER NE PROUVE PAS, ET QUI LE PROUVE DEPUIS (amende le 2026-08-20).
 *
 * `ogImageAlt` ci-dessous REJOUE A LA MAIN la cascade de `src/layouts/Base.astro` : il
 * reconstruit `imageSurchargee`, pose `article: null`, et appelle `metadonneesSeo`
 * lui-meme — parce qu un gabarit ne s importe pas depuis `node --test`. **Une cascade
 * rejouee derive.** Mesure du 2026-08-20 : la copie ci-dessous ecrit
 * `url: seo.imagePartage.url` la ou le gabarit ecrit `url: urlMedia(seo.imagePartage)`.
 * Deux jours d existence ont suffi.
 *
 * Et surtout : MESURE EN CASSANT, le 2026-08-20. Inverser la cascade du gabarit en
 * `imageGeneree ?? imageSurchargee ?? imageDefaut` — donc faire servir a la page anglaise
 * le texte de la carte GENEREE au lieu de la surcharge editoriale — laisse les 1802 tests
 * de `npm test` INTEGRALEMENT VERTS, ceux de ce fichier compris. Ce qui rougit alors est
 * `npm run preuve:rendu`, qui lit le HTML CONSTRUIT.
 *
 * Ce fichier reste, et il est utile : il tient le maillon MAPPING + `metadonneesSeo` sans
 * construire le site (~1 ms contre ~12 s), et il garde la fixture anglaise surchargee
 * vivante. Il ne tient PAS le maillon du gabarit — celui-la est tenu par
 * `scripts/alternative-partage-servie.mjs`, branche dans `scripts/preuve-rendu.mjs` et
 * exerce par `tests/alternative-partage-servie.test.ts`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mapperArticle } from '../src/lib/strapi/mapping.ts';
import { metadonneesSeo } from '../src/lib/seo/metadonnees.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const ORIGINE = 'https://echo.test';

function fixture(nom: string): any {
  return JSON.parse(fs.readFileSync(path.join(ICI, 'fixtures', `${nom}.json`), 'utf8'));
}

/** L article anglais du banc qui SURCHARGE son alternative de partage. */
function brutEn(retouche: (seo: any) => void = () => {}): any {
  const brut = JSON.parse(
    JSON.stringify(fixture('articles-en').data.find((a: any) => a.documentId === 'art0000000000000000001'))
  );
  retouche(brut.seo);
  return brut;
}

/**
 * Ce que `mapperArticle` + `metadonneesSeo` rendent quand on les cable COMME LE GABARIT
 * les cable — et non « ce que le layout sert », que cette fonction ne peut pas savoir : le
 * cablage est ici une COPIE, et une copie ne prouve rien de l original (cf. l en-tete).
 */
function ogImageAlt(brut: any, locale: 'fr' | 'en'): string | undefined {
  const article = mapperArticle(brut, 'articles-en[0]');
  const seo = article.seo;
  const image = seo?.imagePartage
    ? {
        url: seo.imagePartage.url,
        largeur: seo.imagePartage.largeur,
        hauteur: seo.imagePartage.hauteur,
        alternative: seo.imagePartage.alternative,
        mime: seo.imagePartage.mime,
      }
    : null;
  const meta = metadonneesSeo({
    locale,
    titre: article.titre,
    description: article.chapo,
    nomSite: 'The Highland Echo',
    descriptionDefaut: 'A local editorial magazine',
    seo,
    origine: ORIGINE,
    chemin: `/en/article/${article.slug}`,
    contrepartie: null,
    imagePartage: image,
    article: null,
  });
  return meta.og.find((o) => o.property === 'og:image:alt')?.content;
}

test('LA FIXTURE EXISTE : une page anglaise du banc surcharge bien son alternative de partage', () => {
  /* Sans cette assertion, remettre la fixture a `null` rendrait les deux tests suivants
     verts en ne jugeant plus rien — succes et echec rendraient la meme sortie. */
  const seo = brutEn().seo;
  assert.ok(seo.imagePartage, 'l article EN du banc doit porter une carte de partage');
  assert.equal(
    seo.imagePartage.alternativeText,
    'Carte de partage : le viaduc rouvert, vu depuis la rive',
    'le media doit porter UN alternativeText, en francais — c est le point du cas (A-04)'
  );
  assert.equal(seo.alternativePartage, 'Sharing card: the reopened viaduct, seen from the riverbank');
});

test('cable comme le gabarit, l article anglais rend l alternative anglaise, pas celle du fichier', () => {
  assert.equal(ogImageAlt(brutEn(), 'en'), 'Sharing card: the reopened viaduct, seen from the riverbank');
});

test('LA FIXTURE MORD : surcharge ignoree, la page anglaise servirait le FRANCAIS du fichier', () => {
  /* Le mode d echec exact du 2026-08-14, rejoue : on retire la seule surcharge et on
     constate ce que la page servirait alors. Si ce test rendait la meme valeur que le
     precedent, c est que la fixture serait DECORATIVE — presente, jamais exercee. */
  const servi = ogImageAlt(brutEn((seo) => { seo.alternativePartage = null; }), 'en');

  assert.equal(servi, 'Carte de partage : le viaduc rouvert, vu depuis la rive');
  assert.notEqual(servi, ogImageAlt(brutEn(), 'en'));
});
