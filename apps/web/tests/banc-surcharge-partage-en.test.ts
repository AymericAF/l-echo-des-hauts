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

/** Ce que le layout sert vraiment : la surcharge editoriale prime sur tout le reste (A-28). */
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

test('la page anglaise SERT l alternative anglaise, pas celle du fichier', () => {
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
