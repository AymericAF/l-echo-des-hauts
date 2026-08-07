/**
 * Les libelles d interface, par locale.
 *
 * Regle du projet : tout texte visible est en francais, SAUF le miroir `/en/`, qui est
 * en anglais. Un miroir anglais coiffe de libellés francais (« Sommaire », « A lire
 * aussi », « Page 2 sur 3 ») decredibilise une demonstration d i18n en une seconde —
 * c est exactement ce que le §10.4 du plan editorial dit du titre francais dans un bloc
 * anglais, applique a l ossature de la page.
 *
 * Ce module ne fait AUCUNE interpolation implicite : les valeurs a trous sont des
 * fonctions, pour que le test de parite puisse comparer les clés sans se demander si
 * « %s » existe dans les deux langues.
 */
import type { Locale } from '../domaine.ts';

export interface Libelles {
  readonly allerAuContenu: string;
  readonly menuPrincipal: string;
  readonly accueil: string;
  readonly aPropos: string;
  readonly mentionsLegales: string;
  readonly rubriques: string;
  readonly etiquettes: string;
  readonly signePar: string;
  readonly sommaire: string;
  readonly aLireAussi: string;
  readonly dossier: string;
  readonly tempsLecture: (minutes: number) => string;
  readonly aLaUne: string;
  readonly dernieresPublications: string;
  readonly dossiersEnCours: string;
  readonly toutVoir: (quoi: string) => string;
  readonly articlesDeLaRubrique: string;
  readonly articlesDeLEtiquette: string;
  readonly articlesDeLAuteur: string;
  readonly articlesDuDossier: string;
  readonly nombreArticles: (nombre: number) => string;
  readonly navigationPages: string;
  readonly pagePrecedente: string;
  readonly pageSuivante: string;
  readonly pageXsurY: (page: number, total: number) => string;
  readonly langueCourante: string;
  readonly changerDeLangue: string;
  readonly versLangue: (langue: string) => string;
  readonly traductionAbsente: string;
  readonly nomLangue: Record<Locale, string>;
  readonly titre404: string;
  readonly texte404: string;
  readonly retourAccueil: string;
  readonly fluxRss: string;
  readonly mediaFictifTitre: string;
  readonly mediaFictifTexte: string;
}

const FR: Libelles = {
  allerAuContenu: 'Aller au contenu',
  menuPrincipal: 'Navigation principale',
  accueil: 'Accueil',
  aPropos: 'À propos',
  mentionsLegales: 'Mentions légales',
  rubriques: 'Rubriques',
  etiquettes: 'Étiquettes',
  signePar: 'Signé par',
  sommaire: 'Sommaire',
  aLireAussi: 'À lire aussi',
  dossier: 'Dossier',
  tempsLecture: (minutes) => `Lecture : ${minutes} min`,
  aLaUne: 'À la une',
  dernieresPublications: 'Dernières publications',
  dossiersEnCours: 'Dossiers en cours',
  toutVoir: (quoi) => `Tout voir : ${quoi}`,
  articlesDeLaRubrique: 'Articles de la rubrique',
  articlesDeLEtiquette: 'Articles portant cette étiquette',
  articlesDeLAuteur: 'Articles de cet auteur',
  articlesDuDossier: 'Les épisodes du dossier',
  nombreArticles: (nombre) => (nombre > 1 ? `${nombre} articles` : `${nombre} article`),
  navigationPages: 'Pagination',
  pagePrecedente: 'Page précédente',
  pageSuivante: 'Page suivante',
  pageXsurY: (page, total) => `Page ${page} sur ${total}`,
  langueCourante: 'Langue courante',
  changerDeLangue: 'Changer de langue',
  versLangue: (langue) => `Lire en ${langue}`,
  traductionAbsente: "cette page n'est pas disponible en anglais",
  nomLangue: { fr: 'français', en: 'anglais' },
  titre404: 'Cette page n’existe pas',
  texte404:
    "L’adresse demandée ne correspond à aucune page de L’Écho des Hauts. Le lien qui vous a mené ici est peut-être ancien, ou l’article a changé d’adresse.",
  retourAccueil: "Revenir à l’accueil",
  fluxRss: 'Flux RSS de L’Écho des Hauts',
  mediaFictifTitre: 'Un média fictif',
  mediaFictifTexte:
    "L’Écho des Hauts est un média fictif. Ce site est un démonstrateur technique : sa ligne éditoriale, ses articles, ses auteurs et les événements qu’il relate sont inventés. Aucun contenu publié ici ne rapporte de faits réels, et ce site ne constitue en aucun cas un service de presse en ligne.",
};

const EN: Libelles = {
  allerAuContenu: 'Skip to content',
  menuPrincipal: 'Main navigation',
  accueil: 'Home',
  aPropos: 'About',
  mentionsLegales: 'Legal notice',
  rubriques: 'Sections',
  etiquettes: 'Tags',
  signePar: 'Written by',
  sommaire: 'Contents',
  aLireAussi: 'Read next',
  dossier: 'Series',
  tempsLecture: (minutes) => `${minutes} min read`,
  aLaUne: 'Top story',
  dernieresPublications: 'Latest articles',
  dossiersEnCours: 'Ongoing series',
  toutVoir: (quoi) => `See all: ${quoi}`,
  articlesDeLaRubrique: 'Articles in this section',
  articlesDeLEtiquette: 'Articles with this tag',
  articlesDeLAuteur: 'Articles by this author',
  articlesDuDossier: 'Episodes in this series',
  nombreArticles: (nombre) => (nombre > 1 ? `${nombre} articles` : `${nombre} article`),
  navigationPages: 'Pagination',
  pagePrecedente: 'Previous page',
  pageSuivante: 'Next page',
  pageXsurY: (page, total) => `Page ${page} of ${total}`,
  langueCourante: 'Current language',
  changerDeLangue: 'Change language',
  versLangue: (langue) => `Read in ${langue}`,
  traductionAbsente: 'this page is not available in French',
  nomLangue: { fr: 'French', en: 'English' },
  titre404: 'This page does not exist',
  texte404:
    'The address you requested does not match any page of L’Écho des Hauts. The link that brought you here may be outdated, or the article may have moved.',
  retourAccueil: 'Back to the home page',
  fluxRss: 'RSS feed of L’Écho des Hauts',
  mediaFictifTitre: 'A fictional publication',
  mediaFictifTexte:
    'L’Écho des Hauts is a fictional news outlet. This site is a technical demonstrator: its editorial line, its articles, its journalists and the events it reports are invented. Nothing published here reports real facts, and this site is in no way an online press service.',
};

export const LIBELLES: Record<Locale, Libelles> = { fr: FR, en: EN };

export function libelles(locale: Locale): Libelles {
  return LIBELLES[locale];
}
