/**
 * Un Strapi de substitution, servi depuis les fixtures de `tests/fixtures/`.
 *
 * POURQUOI il existe. Le build n a pas de mode degrade — c est voulu (`client.ts`). Or au
 * 2026-08-07 la base de `echoback.ayfiweb.fr` est VIDE : un build reel produit un site
 * sans article, et ne prouve donc rien sur le rendu d une page article. Ce serveur
 * repond exactement ce que Strapi repondrait, avec les memes fixtures que le harnais de
 * mapping, ce qui permet de CONSTRUIRE une page article et d inspecter la sortie.
 *
 * CE QU IL PROUVE, ET CE QU IL NE PROUVE PAS. Il exerce la chaine entiere — client →
 * mapping → corpus → loader → page → `dist/` → garde T-09 — sur des donnees de forme
 * Strapi. Il ne prouve RIEN sur l instance reelle : ni les permissions, ni le populate
 * accepte par la version en place, ni le contenu du seed. Le jour ou la base sera
 * garnie, la preuve se refait sur elle, et celle-ci ne la remplace pas.
 *
 * Il ne sert JAMAIS en production : aucun code de `src/` ne l importe.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(RACINE, 'tests', 'fixtures');

const COLLECTIONS = ['articles', 'auteurs', 'categories', 'tags', 'dossiers'];

/**
 * Un media de substitution, servi sur `/uploads/…` comme le provider local de Strapi.
 *
 * IL N EST PAS DECORATIF. Depuis T-01, le build TELECHARGE les medias qu il reference et
 * les depose dans la sortie (`integrations/medias-locaux.mjs`) : un Strapi de
 * substitution qui ne servirait pas `/uploads/` ferait echouer tout build sur fixtures,
 * et surtout laisserait le telechargement hors de portee des preuves hors ligne. Les
 * octets importent peu, l aboutissement de la requete est ce qui est exerce.
 */
const MEDIA = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9" viewBox="0 0 16 9">' +
    '<rect width="16" height="9" fill="#d9d4c8"/></svg>',
);

function fixture(nom) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, `${nom}.json`), 'utf8'));
}

const VIDE = { data: [], meta: { pagination: { page: 1, pageSize: 25, pageCount: 1, total: 0 } } };

/**
 * Les fixtures ne portent que le francais. La locale `en` rend donc une collection vide
 * et un 404 sur le Single Type — exactement ce que Strapi repond quand aucune
 * localisation n existe, et ce que `corpus.ts` sait deja traiter.
 */
function reponse(chemin, locale) {
  if (chemin === 'configuration') {
    return locale === 'fr' ? fixture('configuration-fr') : null;
  }
  if (!COLLECTIONS.includes(chemin)) return null;
  return locale === 'fr' ? fixture(`${chemin}-fr`) : VIDE;
}

export function demarrerServeurFixtures(port = 0) {
  const serveur = http.createServer((requete, reponseHttp) => {
    const url = new URL(requete.url ?? '/', 'http://localhost');

    if (url.pathname.startsWith('/uploads/')) {
      reponseHttp.writeHead(200, { 'content-type': 'image/svg+xml' });
      reponseHttp.end(MEDIA);
      return;
    }

    const chemin = url.pathname.replace(/^\/api\//, '');
    const locale = url.searchParams.get('locale') ?? 'fr';
    const corps = reponse(chemin, locale);

    if (corps === null) {
      reponseHttp.writeHead(404, { 'content-type': 'application/json' });
      reponseHttp.end(JSON.stringify({ error: { status: 404, name: 'NotFoundError' } }));
      return;
    }

    reponseHttp.writeHead(200, { 'content-type': 'application/json' });
    reponseHttp.end(JSON.stringify(corps));
  });

  return new Promise((resoudre) => {
    serveur.listen(port, '127.0.0.1', () => {
      const { port: reel } = serveur.address();
      resoudre({ url: `http://127.0.0.1:${reel}`, arreter: () => new Promise((f) => serveur.close(f)) });
    });
  });
}
