/**
 * Tests de `astro.config.mjs` — le fichier qui GOUVERNE la sortie n etait couvert par rien.
 *
 * LE CONSTAT, ANNONCE PAR LE CROCHET LUI-MEME le 2026-08-10 : « aucun test ne couvre
 * apps/web/astro.config.mjs — 0 test lance ». Or ce fichier decide du mode de production,
 * du reglage qui sort le style du HTML, et de l ORDRE des integrations.
 *
 * CE QUI REND LE TROU PARTICULIER : les gardes de sortie ne s executent QUE TANT QU ELLES
 * SONT BRANCHEES ICI. En retirer une ne casse rien — ni test, ni build — tant qu aucun
 * defaut ne coexiste. Le mode d echec a ete PROUVE le 2026-08-10 pendant la tache
 * 23987d69 : un defaut REEL plus le debranchement de sa garde ont rendu 566 tests VERTS et
 * un build VERT. Seule une verification lancee separement l a vu.
 *
 * CE QU IL N ASSERTE PAS, ET POURQUOI. Il ne recopie PAS la liste des sept integrations.
 * Un test qui la recopie doit etre modifie a chaque ajout legitime ; il finit donc mis a
 * jour sans reflechir, et le jour ou la modification est un RETRAIT, elle passe par le
 * meme geste. Ce qui est asserte ici est ce qui doit rester vrai quel que soit le nombre
 * d integrations :
 *
 *   1. RIEN NE DISPARAIT — toute integration livree dans `integrations/` est branchee.
 *      C est la garde du debranchement : le module reste sur le disque, le test le NOMME.
 *   2. L ORDRE TIENT — un depot d octets precede toute garde qui verifie qu une reference
 *      aboutit. La dependance n est pas devinee d apres les noms : chaque module la
 *      DECLARE (`ROLE_SORTIE`), a cote de la preuve qui la justifie.
 *   3. AJOUTER RESTE UN GESTE NORMAL — une integration de plus, branchee, sans role
 *      declare, ne fait rougir aucun des deux points ci-dessus.
 *
 * POURQUOI UNE DECLARATION PLUTOT QU UNE DEDUCTION. « Lit la sortie » ne suffit pas : les
 * cinq gardes lisent `dist/`, mais seules trois y verifient qu une REFERENCE aboutit
 * (`garde-origine-medias`, `garde-liens`, `garde-seo` — mesure du 2026-08-10 : chacune
 * pousse un manquement de la forme « absent de dist/ »). Deduire la contrainte de la
 * lecture la rendrait plus large que la realite, donc fausse — et une contrainte fausse se
 * desactive.
 *
 * CE QU IL NE COUVRE PAS. Une integration NOUVELLE qui verifierait des references sans
 * declarer son role serait libre de se placer n importe ou : la declaration vit ou vit la
 * connaissance, et personne ne peut la deviner a sa place. Ce residu est assume ; il est
 * rattrape a l etage suivant, `.github/workflows/gardes-du-code.yml`, dont le pas
 * « sortie » construit pour de vrai.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import configuration from '../astro.config.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_INTEGRATIONS = path.join(RACINE, 'integrations');

/** Les roles reconnus. Un `ROLE_SORTIE` absent vaut « aucune contrainte d ordre ». */
const DEPOSE = 'depose-des-octets';
const VERIFIE = 'verifie-que-les-references-aboutissent';
const LIBRE = 'sans-contrainte-d-ordre';
const ROLES = new Set([DEPOSE, VERIFIE, LIBRE]);

type Livree = { fichier: string; nom: string; role: string | null };

/**
 * Les integrations LIVREES : les modules de `integrations/` qui produisent bien un objet
 * d integration Astro. Le dossier est parcouru, jamais enumere a la main — c est ce qui
 * fait qu un ajout ne demande aucune retouche ici, et qu un retrait du tableau se voit.
 */
async function integrationsLivrees(): Promise<Livree[]> {
  const livrees: Livree[] = [];
  const fichiers = fs
    .readdirSync(DOSSIER_INTEGRATIONS)
    .filter((f) => f.endsWith('.mjs'))
    .sort();

  for (const fichier of fichiers) {
    const module = await import(pathToFileURL(path.join(DOSSIER_INTEGRATIONS, fichier)).href);
    if (typeof module.default !== 'function') continue;

    let instance: unknown;
    try {
      instance = module.default();
    } catch {
      continue; // Un module qui exige des arguments n est pas une integration branchable telle quelle.
    }
    if (instance === null || typeof instance !== 'object') continue;
    const candidate = instance as { name?: unknown; hooks?: unknown };
    if (typeof candidate.name !== 'string' || typeof candidate.hooks !== 'object') continue;

    livrees.push({
      fichier: `integrations/${fichier}`,
      nom: candidate.name,
      role: typeof module.ROLE_SORTIE === 'string' ? module.ROLE_SORTIE : null,
    });
  }
  return livrees;
}

/** Les noms des integrations branchees, dans l ordre ou Astro les appellera. */
function branchees(): string[] {
  const liste = configuration.integrations;
  assert.ok(Array.isArray(liste), 'astro.config.mjs ne declare aucun tableau `integrations`');
  return liste.map((i: { name?: string }, rang: number) => {
    assert.equal(
      typeof i?.name,
      'string',
      `astro.config.mjs : l integration en position ${rang + 1} n a pas de \`name\``,
    );
    return i.name as string;
  });
}

test('la sortie reste statique et le style reste hors du HTML', () => {
  // Les deux reglages que ce fichier gouverne seul. Ils ont chacun leur garde de build
  // (T-09, styles en ligne) — mais ces gardes ne tournent QUE si elles sont branchees,
  // et c est justement ce que ce fichier peut leur retirer. Les lire ici coute 0 ms.
  assert.equal(
    configuration.output,
    'static',
    "astro.config.mjs : `output` doit rester 'static' (§4.1 du cahier : aucune route serveur)",
  );
  assert.equal(
    configuration.build?.inlineStylesheets,
    'never',
    "astro.config.mjs : `build.inlineStylesheets` doit rester 'never' — au defaut 'auto', " +
      "Astro remonte les petites feuilles dans un <style> du <head>, que `style-src 'self'` " +
      'REFUSE (defaut constate le 2026-08-09 sur 65 des 86 pages)',
  );
});

test('toute integration livree est branchee — debrancher une garde ne peut plus passer inapercu', async () => {
  const livrees = await integrationsLivrees();
  assert.ok(
    livrees.length > 0,
    'aucune integration lisible dans integrations/ : le test ne prouverait rien',
  );

  const posees = new Set(branchees());
  const absentes = livrees.filter((l) => !posees.has(l.nom));

  assert.deepEqual(
    absentes.map((a) => `${a.nom} (${a.fichier})`),
    [],
    'astro.config.mjs ne branche PAS une integration pourtant livree.\n' +
      absentes
        .map(
          (a) =>
            `  - ${a.nom} — le module ${a.fichier} existe toujours, mais rien ne l appelle :\n` +
            '    sa verification ne s execute plus, et NI les tests NI le build ne le disent.',
        )
        .join('\n') +
      '\n  Si le retrait est voulu, supprime aussi le module — un fichier qui reste est une' +
      '\n  garde qu on croit posee. Si ce n est pas voulu, remets-le dans `integrations:`.',
  );
});

test('un role declare est un role connu — une faute de frappe ne neutralise pas la contrainte', async () => {
  const livrees = await integrationsLivrees();
  const inconnus = livrees.filter((l) => l.role !== null && !ROLES.has(l.role));

  assert.deepEqual(
    inconnus.map((i) => `${i.fichier} : ROLE_SORTIE = « ${i.role} »`),
    [],
    'ROLE_SORTIE inconnu — sans ce controle, une valeur mal orthographiee vaudrait' +
      `\n  « aucune contrainte », en silence. Valeurs admises : ${[...ROLES].join(', ')}` +
      '\n  (ou aucune declaration du tout, qui vaut explicitement « aucune contrainte »).',
  );
});

test('un depot d octets precede toute garde qui verifie qu une reference aboutit', async () => {
  const livrees = await integrationsLivrees();
  const role = new Map(livrees.map((l) => [l.nom, l]));
  const ordre = branchees();

  const rangs = new Map(ordre.map((nom, rang) => [nom, rang]));
  const depots = ordre.filter((nom) => role.get(nom)?.role === DEPOSE);
  const verificateurs = ordre.filter((nom) => role.get(nom)?.role === VERIFIE);

  const fautes: string[] = [];
  for (const depot of depots) {
    for (const verificateur of verificateurs) {
      if ((rangs.get(verificateur) as number) < (rangs.get(depot) as number)) {
        fautes.push(
          `${verificateur} (position ${(rangs.get(verificateur) as number) + 1}) s execute AVANT ` +
            `${depot} (position ${(rangs.get(depot) as number) + 1})`,
        );
      }
    }
  }

  assert.deepEqual(
    fautes,
    [],
    'astro.config.mjs : ordre des integrations FAUX.\n' +
      fautes.map((f) => `  - ${f}`).join('\n') +
      '\n  Toutes accrochent `astro:build:done`, ou Astro les appelle dans l ordre du' +
      '\n  tableau. Une garde qui verifie qu une reference aboutit dans dist/ doit passer' +
      '\n  APRES l integration qui y depose les octets, sinon elle rougit sur un site SAIN' +
      '\n  — et on la desactive pour une cause qui n existe pas.' +
      '\n  Le role de chaque module est declare par son export `ROLE_SORTIE`.',
  );
});
