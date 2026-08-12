/**
 * LA VOIE D'ACQUISITION d'un media — et les quatre conditions de la garde de
 * build du §6.7 qu'elle rend exprimables.
 *
 * POURQUOI CE MODULE EXISTE. Le plan editorial §6.7 pose SEPT conditions ; le
 * depot n'en tenait que trois — texte alternatif non vide, format du credit,
 * liste blanche des licences. Les quatre autres ne manquaient pas par oubli :
 * elles etaient INEXPRIMABLES. Le manifeste ne portait aucun champ de VOIE, or
 * c'est la voie qui declenche des obligations differentes :
 *
 *   - la voie C (document du domaine public) est interdite en couverture et en
 *     galerie — deux placements ou le modele ne sait afficher AUCUN credit
 *     (§6.1 point 4, §6.3 voie C) — et exige un sidecar de relevee ;
 *   - la voie D (portrait sous licence tierce) exige, EN PLUS de la licence,
 *     un second relevee qui n'existe nulle part ailleurs : celui de la personne
 *     REPRESENTEE (§6.3, D.1 et D.2). Une licence CC0 est necessaire et non
 *     suffisante — elle est cedee par le photographe, jamais par le sujet.
 *
 * LA VOIE SE DERIVE, ELLE NE SE RESSAISIT PAS. Une saisie a la main sur 94
 * entrees derive : c'est le defaut que ce depot corrige partout. Le seul fait
 * DEJA su du manifeste qui determine une voie sans ambiguite est l'ayant droit :
 * « Œuvre du projet » veut dire que nous sommes l'ayant droit, donc voie B. Tout
 * le reste — A, C, D — se DECLARE, et c'est voulu : ce sont exactement les voies
 * qui portent des obligations, et une obligation deduite est une obligation
 * qu'on peut perdre par inadvertance. Resultat mesure : ZERO saisie sur les 94
 * medias versionnes, et aucun fichier tiers ne peut entrer sans dire d'ou il
 * vient.
 *
 * CE QUE CE MODULE NE PEUT PAS FAIRE, et il faut l'ecrire plutot que de le
 * laisser croire : il ne detecte pas un MENSONGE. Declarer « Œuvre du projet »
 * sur un fichier repris ailleurs eteint les conditions 5, 6 et 7 sans qu'aucune
 * garde ne bronche. C'est le §6.8 qui tient ce bout-la — la licence se releve a
 * la source, par la personne qui televerse — et aucun mecanisme du depot ne
 * peut s'y substituer.
 */
import fs from 'node:fs';
import path from 'node:path';

/* ------------------------------------------------------------------ */
/* Vocabulaire du cadrage                                              */
/* ------------------------------------------------------------------ */

/** Les quatre voies retenues du §6.3. Il n'y en a pas de cinquieme. */
export const VOIES = ['A', 'B', 'C', 'D'] as const;
export type Voie = (typeof VOIES)[number];

/** Le STATUT d'ayant droit du §6.2 — c'est lui, et lui seul, qui derive la voie B. */
export const AYANT_DROIT_PROJET = 'Œuvre du projet';

/**
 * Les licences admises EN VOIE D — §6.3, D.3, table « Statut en voie D ».
 *
 * Elle est PLUS ETROITE que la liste blanche generale du §6.2, et les deux se
 * cumulent sans se remplacer (§6.7, dernier paragraphe) : la 4 oppose le §6.2 a
 * tous les medias, la 7 oppose au seul portrait cette liste-ci.
 *
 * CC BY 4.0 y figure DEPUIS LE 2026-08-03 : la question de D.4 est tranchee —
 * `/auteur/[slug]` affiche le `caption` sous le portrait, donc l'attribution est
 * visible. Le §6.7 ecrit « ce qui, aujourd'hui, veut dire : autre chose que
 * domaine public, Public Domain Mark ou CC0 » : cette glose est ANTERIEURE a
 * l'arbitrage, et la condition, elle, POINTE D.3. On suit la source pointee, pas
 * sa recopie datee — c'est la regle « pointer, jamais dupliquer » du depot.
 */
export const LICENCES_VOIE_D = [
  'Domaine public',
  'Public Domain Mark 1.0',
  'CC0 1.0',
  'CC BY 4.0',
] as const;

/** Les trois qualifications de la personne representee — §6.3, D.2. */
export const QUALIFICATIONS = ['Q1', 'Q2', 'Q3'] as const;
export type Qualification = (typeof QUALIFICATIONS)[number];

/**
 * OU un media est employe, DERIVE de l'emploi reel dans le corpus et jamais du
 * chemin du fichier. Un prefixe de dossier est une convention : le renommer
 * eteindrait la garde en silence. L'emploi, lui, est ce que le seed televerse.
 */
export type Placement =
  | 'couverture'
  | 'galerie'
  | 'image-legendee'
  | 'video-vignette'
  | 'auteur-photo'
  | 'hero-categorie'
  | 'hero-dossier'
  /**
   * Carte de partage SURCHARGEE par la redaction (`partage.seo.imagePartage`),
   * distincte de `configuration` — qui, elle, designe le repli servi a tout le site.
   * Les deux se ressemblent au fichier et ne disent pas la meme chose au registre :
   * l une est un choix editorial porte par UNE entree, l autre un defaut global.
   */
  | 'partage-seo'
  | 'configuration';

/** Les deux placements interdits a la voie C — §6.7, condition 5. */
export const PLACEMENTS_INTERDITS_VOIE_C: readonly Placement[] = ['couverture', 'galerie'];

export type Verdict = { conforme: true } | { conforme: false; motif: string };

const CONFORME: Verdict = { conforme: true };
const refus = (motif: string): Verdict => ({ conforme: false, motif });

const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/* ------------------------------------------------------------------ */
/* La voie                                                             */
/* ------------------------------------------------------------------ */

export type SourceVoie = { ayantDroit?: unknown; licence?: unknown; voie?: unknown };

/**
 * Rend la voie d'acquisition d'un media, DERIVEE quand elle l'est, DECLAREE
 * sinon. Leve en NOMMANT le media : une erreur qui ne dit pas sur quel fichier
 * elle porte oblige a chercher, sur une centaine d'entrees.
 */
export function deriverVoie(source: SourceVoie, cle: string): Voie {
  const echec = (motif: string): never => {
    throw new Error(`manifeste des medias, "${cle}" : ${motif}`);
  };

  const ayantDroit = txt(source?.ayantDroit);
  const estDuProjet = ayantDroit === AYANT_DROIT_PROJET;
  const declaree = source?.voie;

  if (declaree === undefined || declaree === null) {
    if (estDuProjet) return 'B';
    return echec(
      `voie d acquisition indeterminee. Elle ne se DERIVE que pour les medias dont ` +
        `nous sommes l ayant droit (\`ayantDroit\` = « ${AYANT_DROIT_PROJET} » ⇒ voie B).\n` +
        `  Ici l ayant droit est « ${ayantDroit || '(vide)'} » : declarez le champ \`voie\` — ` +
        `"A" (photographie d Aymeric), "C" (document du domaine public) ou "D" (portrait ` +
        `sous licence tierce), §6.3.\n` +
        `  Elle ne se devine pas : c est elle qui declenche les conditions 5, 6 et 7 du §6.7.`
    );
  }

  if (typeof declaree !== 'string' || !(VOIES as readonly string[]).includes(declaree)) {
    return echec(
      `voie "${String(declaree)}" inconnue. Les quatre voies du §6.3 sont ${VOIES.join(', ')} — ` +
        `il n y en a pas de cinquieme.`
    );
  }
  const voie = declaree as Voie;

  // La coherence est exigee DANS LES DEUX SENS. Se declarer tiers en etant
  // l ayant droit imposerait des relevees qui n existent pas ; se declarer du
  // projet en ne l etant pas ETEINDRAIT les conditions 5, 6 et 7 — c est le sens
  // qui coute cher.
  if (voie === 'B' && !estDuProjet) {
    return echec(
      `voie "B" declaree, mais l ayant droit est « ${ayantDroit || '(vide)'} ». ` +
        `La voie B est l œuvre du projet : elle exige \`ayantDroit\` = « ${AYANT_DROIT_PROJET} ».`
    );
  }
  if (voie !== 'B' && estDuProjet) {
    return echec(
      `voie "${voie}" declaree, mais l ayant droit est « ${AYANT_DROIT_PROJET} ». ` +
        `Un fichier dont nous sommes l ayant droit est de voie B ; les voies A, C et D ` +
        `designent une source dont nous ne le sommes pas.`
    );
  }

  return voie;
}

/* ------------------------------------------------------------------ */
/* Le sidecar de relevee — §6.7 et §6.3, D.7                           */
/* ------------------------------------------------------------------ */

/**
 * Le sidecar du §6.7 : `assets/sources/<fichier>.json` du plan, qui vit ici
 * sous la racine des medias du corpus versionne (`data/medias/sources/`).
 * Le nom est celui du FICHIER, pas la cle du manifeste : c'est deja la cle de
 * rapprochement dans la mediatheque, et `corpus.ts` en garantit l unicite.
 */
export function cheminSidecar(racineMedias: string, cle: string): string {
  return path.join(racineMedias, 'sources', `${path.basename(cle)}.json`);
}

type LectureSidecar =
  | { present: false; chemin: string }
  | { present: true; chemin: string; erreur: string }
  | { present: true; chemin: string; donnees: Record<string, unknown> };

function lireSidecar(racineMedias: string, cle: string): LectureSidecar {
  const chemin = cheminSidecar(racineMedias, cle);
  if (!fs.existsSync(chemin)) return { present: false, chemin };
  try {
    const donnees = JSON.parse(fs.readFileSync(chemin, 'utf8'));
    if (donnees === null || typeof donnees !== 'object' || Array.isArray(donnees)) {
      return { present: true, chemin, erreur: 'le sidecar doit etre un objet JSON' };
    }
    return { present: true, chemin, donnees: donnees as Record<string, unknown> };
  } catch (e) {
    return { present: true, chemin, erreur: `JSON invalide — ${(e as Error).message}` };
  }
}

/** Les champs que le §6.7 nomme dans le sidecar d'un fichier releve. */
const CHAMPS_SIDECAR: { champ: string; quoi: string }[] = [
  { champ: 'urlFichier', quoi: 'URL du fichier relevee' },
  { champ: 'urlPage', quoi: 'URL de la page de description' },
  { champ: 'licence', quoi: 'identifiant exact de la licence' },
  { champ: 'sha256', quoi: 'empreinte SHA-256 du fichier telecharge' },
];

/* ------------------------------------------------------------------ */
/* CONDITION 5 — voie C en couverture ou en galerie                    */
/* ------------------------------------------------------------------ */

const POURQUOI_C = {
  couverture:
    'une couverture n a AUCUN champ de credit (§6.1 point 4), et l image Open Graph ' +
    'generee par-dessus ne pourrait pas porter l attribution',
  galerie:
    '`bloc.galerie` n a qu une `legende` pour toute la galerie et AUCUN champ de credit ' +
    '(A-22) : crediter des documents distincts y est impossible',
} as const;

export function verifierPlacementVoieC(
  voie: Voie,
  placements: readonly Placement[],
  cle: string
): Verdict {
  if (voie !== 'C') return CONFORME;
  const fautifs = PLACEMENTS_INTERDITS_VOIE_C.filter((p) => placements.includes(p));
  if (fautifs.length === 0) return CONFORME;
  return refus(
    `"${cle}" est de voie C et employe en ${fautifs.map((p) => `\`${p}\``).join(' et en ')} — ` +
      `placement(s) interdit(s) par le §6.3, voie C.\n` +
      fautifs.map((p) => `  ${p} : ${POURQUOI_C[p as 'couverture' | 'galerie']}.`).join('\n') +
      `\n  Une voie C ne s emploie QUE dans \`bloc.image-legendee\`. Repli : voie B4, sans discussion.`
  );
}

/* ------------------------------------------------------------------ */
/* CONDITION 6 — voie C sans sidecar                                   */
/* ------------------------------------------------------------------ */

export function verifierSidecarVoieC(
  voie: Voie,
  cle: string,
  racineMedias: string,
  licenceManifeste: string
): Verdict {
  if (voie !== 'C') return CONFORME;
  return verifierRelevee(cle, racineMedias, licenceManifeste, 'voie C');
}

/** Le tronc commun des conditions 6 et 7b : le sidecar existe et il est complet. */
function verifierRelevee(
  cle: string,
  racineMedias: string,
  licenceManifeste: string,
  contexte: string
): Verdict {
  const lu = lireSidecar(racineMedias, cle);
  const relatif = path.relative(racineMedias, lu.chemin) || lu.chemin;

  if (!lu.present) {
    return refus(
      `"${cle}" est de ${contexte} et n a pas de sidecar de relevee.\n` +
        `  Attendu : ${relatif} (§6.7, condition 6 ; §6.3 D.7).\n` +
        `  Il porte ce qui ne survit pas au fichier seul : ` +
        `${CHAMPS_SIDECAR.map((c) => `\`${c.champ}\` (${c.quoi})`).join(', ')}.`
    );
  }
  if ('erreur' in lu) {
    return refus(`"${cle}" : sidecar ${relatif} illisible — ${lu.erreur}`);
  }

  const manquants = CHAMPS_SIDECAR.filter((c) => txt(lu.donnees[c.champ]) === '');
  if (manquants.length > 0) {
    return refus(
      `"${cle}" : sidecar ${relatif} incomplet — ` +
        `${manquants.map((c) => `\`${c.champ}\` (${c.quoi})`).join(', ')} vide ou absent.`
    );
  }

  // La licence vit a DEUX endroits — le manifeste la publie, le sidecar la
  // prouve. Deux copies d une meme valeur finissent toujours par diverger : on
  // les confronte plutot que de choisir laquelle croire.
  const licenceRelevee = txt(lu.donnees.licence);
  if (licenceRelevee !== txt(licenceManifeste)) {
    return refus(
      `"${cle}" : le sidecar releve la licence "${licenceRelevee}" quand le manifeste ` +
        `publie "${txt(licenceManifeste)}". La ligne de credit publiee ne serait pas celle ` +
        `qui a ete relevee a la source (§6.8).`
    );
  }

  return CONFORME;
}

/* ------------------------------------------------------------------ */
/* CONDITION 7 — le portrait d auteur                                  */
/* ------------------------------------------------------------------ */

export function verifierPortraitAuteur(
  voie: Voie,
  licence: string,
  placements: readonly Placement[],
  cle: string,
  racineMedias: string
): Verdict {
  if (!placements.includes('auteur-photo')) return CONFORME;

  // L EXEMPTION EST ECRITE DANS LE PLAN, et elle porte sur la VOIE, pas sur le
  // dossier ni sur le nom : « un avatar genere de repli (voie B) satisfait cette
  // condition par construction […] et la garde le reconnait a sa voie » (§6.7).
  // Il n y a aucune personne representee : il n y a rien a qualifier.
  if (voie === 'B') return CONFORME;

  // 7a — la liste PLUS ETROITE de D.3, qui ne remplace pas la liste blanche du
  // §6.2 opposee par la condition 4 : les deux se cumulent.
  if (!(LICENCES_VOIE_D as readonly string[]).includes(txt(licence))) {
    return refus(
      `"${cle}" est un portrait d auteur de voie ${voie} sous licence ` +
        `"${txt(licence) || '(vide)'}", absente des licences admises en voie D (§6.3, D.3).\n` +
        `  Admises : ${LICENCES_VOIE_D.join(', ')}.\n` +
        `  La condition 4 (liste blanche generale du §6.2) ne la remplace pas : elles se cumulent.`
    );
  }

  // 7b — le sidecar, comme en voie C.
  const relevee = verifierRelevee(cle, racineMedias, licence, `voie ${voie} en portrait d auteur`);
  if (!relevee.conforme) return relevee;

  // 7c — la QUALIFICATION de la personne representee, et ce qui la prouve.
  // C est le seul relevee que les six autres conditions ne couvrent pas : une
  // licence est cedee par le PHOTOGRAPHE et ne transfere jamais le droit de la
  // personne sur son image (§6.3, D.1).
  const lu = lireSidecar(racineMedias, cle);
  const donnees = 'donnees' in lu ? lu.donnees : {};
  const relatif = path.relative(racineMedias, lu.chemin) || lu.chemin;

  const qualification = txt(donnees.qualification);
  if (!(QUALIFICATIONS as readonly string[]).includes(qualification)) {
    return refus(
      `"${cle}" : sidecar ${relatif} sans qualification valide de la personne representee — ` +
        `lu "${qualification || '(vide ou absent)'}".\n` +
        `  Les trois seules valeurs sont ${QUALIFICATIONS.join(', ')} (§6.3, D.2). ` +
        `Il n existe PAS de valeur « non applicable » : ` +
        `une licence est cedee par le photographe, jamais par le sujet (D.1).`
    );
  }
  if (txt(donnees.preuve) === '') {
    return refus(
      `"${cle}" : sidecar ${relatif} annonce la qualification ${qualification} sans ` +
        `\`preuve\`. La condition exige la qualification ET CE QUI LA PROUVE (§6.7, condition 7) — ` +
        `le fichier regarde en pleine resolution pour Q1, la notice de l institution pour Q2, ` +
        `le texte de l autorisation pour Q3.`
    );
  }

  return CONFORME;
}
