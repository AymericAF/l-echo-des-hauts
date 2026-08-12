/**
 * LE REGISTRE DES CREDITS — condition 1 de la garde du §6.7, et le `CREDITS.md`
 * que le meme paragraphe demande a la racine du depot.
 *
 * CE QUI MANQUAIT, ET CE QUI NE MANQUAIT PAS. La condition 1 dit : le build
 * echoue si un media reference par une entree publiee « n'a pas de ligne dans
 * `docs/credits-images.md` ». Le MECANISME existait deja — `chargerCorpus` leve
 * sur un media cite qui n'est pas au manifeste, et sur un media au manifeste que
 * personne n'emploie. Ce qui manquait est le REGISTRE LUI-MEME : le depot de
 * code n'en portait aucun, et le lecteur du depot n'avait nulle part ou lire
 * d'ou viennent les images.
 *
 * IL SE DERIVE, IL NE SE REMPLIT PAS. Une table tenue a la main a cote du
 * manifeste serait une seconde copie de la licence, de l'alternative et du
 * credit — et deux copies d'une meme valeur finissent toujours par diverger.
 * C'est le defaut que ce depot corrige partout, et il n'y a aucune raison de le
 * reintroduire par le registre. `CREDITS.md` est donc PRODUIT depuis le corpus
 * charge, et `tests/seed-registre.test.ts` echoue si le fichier versionne cesse
 * d'etre celui que le corpus produit.
 *
 * OU VIT LA SOURCE. Le `docs/credits-images.md` du plan editorial vit dans le
 * depot PRIVE de documentation ; les fichiers, eux, vivent ici. La ligne de
 * registre du §6.7 est donc rendue ICI, ou la donnee est. Recopier la meme table
 * dans les deux depots la ferait diverger le jour ou l'un des deux bouge.
 *
 * CE QUI EST DERIVABLE, ET CE QUI NE L'EST PAS. Six des dix colonnes du §6.7
 * viennent du manifeste ou du corpus (fichier, entites, voie, licence,
 * alternativeText, caption). Les quatre autres — source precise, URL permanente,
 * date de relevee, qui a releve — ne DECRIVENT rien pour un fichier dont nous
 * sommes l'ayant droit : il n'y a pas eu de relevee, et ecrire une date la
 * inventerait une diligence qui n'a pas eu lieu. Elles sont donc rendues « — »
 * en voie B, et lues dans le SIDECAR pour les voies A, C et D — la ou la
 * relevee existe reellement et ou la garde l'exige deja (conditions 6 et 7).
 */
import fs from 'node:fs';

import type { Corpus, MediaCorpus } from './corpus.ts';
import { cheminSidecar, type Voie } from './voies.ts';

/** Ce que le registre affiche quand la colonne n'a pas d'objet. */
const NEANT = '—';

/**
 * La source « precise » d'un media dont nous sommes l'ayant droit : le fichier
 * versionne lui-meme. Il n'y a rien d'autre a nommer, et surtout pas une URL.
 */
const SOURCE_PROJET = 'source versionnee dans ce depot';

type LigneRegistre = {
  fichier: string;
  entites: string;
  voie: Voie;
  source: string;
  licence: string;
  url: string;
  dateReleve: string;
  parQui: string;
  alternativeText: string;
  caption: string;
};

function lireReleve(racineMedias: string, media: MediaCorpus): Record<string, unknown> {
  if (media.voie === 'B') return {};
  const chemin = cheminSidecar(racineMedias, media.cle);
  if (!fs.existsSync(chemin)) return {};
  try {
    const donnees = JSON.parse(fs.readFileSync(chemin, 'utf8'));
    return donnees !== null && typeof donnees === 'object' ? donnees : {};
  } catch {
    // Un sidecar illisible est deja refuse par les conditions 6 et 7. Ici on ne
    // juge pas, on rend : le registre ne doit pas devenir une seconde garde qui
    // dirait autre chose que la premiere.
    return {};
  }
}

const ou = (v: unknown, defaut: string): string =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : defaut;

export function lignesRegistre(corpus: Corpus): LigneRegistre[] {
  const racineMedias = `${corpus.racine}/medias`;
  return [...corpus.medias]
    .sort((a, b) => a.cle.localeCompare(b.cle, 'fr'))
    .map((media) => {
      const releve = lireReleve(racineMedias, media);
      return {
        fichier: media.cle,
        entites: media.emplois.join(', '),
        voie: media.voie,
        source: media.voie === 'B' ? `${media.ayantDroit} — ${SOURCE_PROJET}` : ou(releve.urlFichier, NEANT),
        licence: media.licence,
        url: ou(releve.urlPage, NEANT),
        dateReleve: ou(releve.dateReleve, NEANT),
        parQui: ou(releve.parQui, NEANT),
        alternativeText: media.alternativeText,
        caption: media.caption,
      };
    });
}

/** Echappe ce qui casserait une cellule de table Markdown. */
const cellule = (v: string): string => v.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * Rend le `CREDITS.md` de la racine, au format du §6.7 — dix colonnes, une
 * ligne par fichier. Deterministe : trie sur la cle, aucune date d'execution,
 * aucun compteur qui bougerait sans que le corpus bouge. Une sortie qui change
 * toute seule ferait rougir sa propre garde et on la desarmerait.
 */
export function composerRegistre(corpus: Corpus): string {
  const lignes = lignesRegistre(corpus);
  const parVoie = new Map<Voie, number>();
  for (const l of lignes) parVoie.set(l.voie, (parVoie.get(l.voie) ?? 0) + 1);

  const entete = [
    '# Credits des images',
    '',
    '> **Fichier PRODUIT — ne pas modifier a la main.**',
    '> Il se derive du corpus versionne : `npm run credits --prefix apps/cms`.',
    '> `apps/cms/tests/seed-registre.test.ts` echoue si cette copie cesse d etre celle',
    '> que le corpus produit. Une table tenue a la main a cote du manifeste serait une',
    '> seconde copie de la licence, a diverger.',
    '',
    'Registre du plan editorial §6.7 — une ligne par fichier media, dans l ordre de la',
    'cle du manifeste. La colonne **voie** est celle du §6.3 : **B** est l œuvre du',
    'projet (aucune attribution tierce, aucune relevee a faire), **A** une photographie',
    'd Aymeric, **C** un document du domaine public, **D** un portrait sous licence',
    'tierce. Les colonnes de relevee (URL, date, releveur) sont sans objet en voie B et',
    'proviennent du sidecar `data/medias/sources/<fichier>.json` pour les autres.',
    '',
    `**${lignes.length} fichiers** — ` +
      (['A', 'B', 'C', 'D'] as const)
        .filter((v) => parVoie.has(v))
        .map((v) => `voie ${v} : ${parVoie.get(v)}`)
        .join(', ') +
      '.',
    '',
    '| Fichier | Entite(s) | Voie | Source precise | Licence | URL permanente relevee | Date de relevee | Releve par | alternativeText | caption |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];

  const corps = lignes.map((l) =>
    [
      `\`${l.fichier}\``,
      l.entites,
      l.voie,
      l.source,
      l.licence,
      l.url,
      l.dateReleve,
      l.parQui,
      l.alternativeText,
      l.caption,
    ]
      .map(cellule)
      .join(' | ')
  );

  return [...entete, ...corps.map((c) => `| ${c} |`), ''].join('\n');
}
