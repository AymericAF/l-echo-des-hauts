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
  /**
   * Le compte d EPISODES d un dossier — une serie se compte en episodes, pas en articles.
   *
   * `null` a zero, et c est la partie qui compte : un dossier vide ne dit pas « 0 episode »,
   * il ne dit RIEN. Le registre n emettant pas d index vide (§10.3), ce cas n arrive pas par
   * la page ; il arriverait par un appel venu d ailleurs, et une phrase grammaticalement
   * correcte est exactement ce qui rend une affirmation fausse credible.
   */
  readonly nombreEpisodes: (nombre: number) => string | null;
  readonly navigationPages: string;
  readonly pagePrecedente: string;
  readonly pageSuivante: string;
  readonly pageXsurY: (page: number, total: number) => string;
  readonly langueCourante: string;
  readonly changerDeLangue: string;
  readonly versLangue: (langue: string) => string;
  readonly traductionAbsente: string;
  readonly nomLangue: Record<Locale, string>;
  readonly recherche: string;
  readonly rechercheTitre: string;
  readonly rechercheIntro: string;
  readonly rechercheLabel: string;
  readonly recherchePlaceholder: string;
  readonly rechercheChargement: string;
  readonly rechercheAucunResultat: string;
  readonly rechercheErreur: string;
  readonly rechercheUnResultat: string;
  /**
   * Appele au BUILD avec le gabarit `'%n'`, jamais avec un nombre : le compteur est
   * substitue a l execution, dans la page (`PageRecherche.astro`). D ou le type elargi —
   * il est la pour que le gabarit passe, pas par tolerance.
   */
  readonly rechercheNResultats: (nombre: number | string) => string;
  readonly rechercheSansJs: string;
  readonly titre404: string;
  readonly texte404: string;
  readonly retourAccueil: string;
  readonly fluxRss: string;
  readonly mediaFictifTitre: string;
  readonly mediaFictifTexte: string;
  /**
   * Etiquette accessible du bloc de reseaux du PIED DE PAGE (§3.8). Elle n a rien a voir
   * avec celle des reseaux d un AUTEUR, qui est le nom de l auteur — donc une donnee.
   *
   * ⚠️ Le francais est repris AU CARACTERE PRES de ce qui etait rendu, sans accent :
   * c est le libelle qu Aymeric a valide verbatim le 2026-08-10 (tache de controle
   * `051f77e2` — « c est bien mon LinkedIn, et le libelle me va »). Le passer a
   * « Réseaux du journal » serait une correction orthographique defendable, mais elle
   * changerait la sortie FRANCAISE d une chaine ratifiee la veille : elle se propose,
   * elle ne se prend pas au passage d un correctif d anglais.
   */
  readonly reseauxDuJournal: string;
  /**
   * Le nom affichable de la plateforme `site` — la SEULE des huit de l enum `Plateforme`
   * qui soit un nom commun. Les sept autres sont des marques deposees : elles ne se
   * traduisent pas, et vivent dans `glyphes-sociaux.ts` avec leurs glyphes.
   */
  readonly plateformeSite: string;
  readonly voirLaVideoSur: (fournisseur: string) => string;
  readonly voirLaVideo: string;
  /** Texte accessible du lien video : il est ENTENDU, pas seulement lu (A-04). */
  readonly ouvreNouvelOnglet: string;
  /** La signature du texte alternatif de l image de partage (§5.3). */
  readonly parAuteur: (auteur: string) => string;
  /**
   * Le bandeau de diagnostic affiche quand le Single Type `Configuration` est vide.
   *
   * Il ne devrait jamais atteindre un lecteur — mais s il l atteint, c est bien A LUI
   * qu il parle, sur la page qu il a demandee : il se traduit donc comme le reste. Il
   * s affichait en francais sur les pages anglaises du banc, ce qui est exactement la
   * facon dont ce defaut se decouvre.
   */
  readonly configurationAbsente: (singleType: string) => string;
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
  nombreEpisodes: (nombre) =>
    nombre < 1 ? null : nombre > 1 ? `${nombre} épisodes` : `${nombre} épisode`,
  navigationPages: 'Pagination',
  pagePrecedente: 'Page précédente',
  pageSuivante: 'Page suivante',
  pageXsurY: (page, total) => `Page ${page} sur ${total}`,
  langueCourante: 'Langue courante',
  changerDeLangue: 'Changer de langue',
  versLangue: (langue) => `Lire en ${langue}`,
  traductionAbsente: "cette page n'est pas disponible en anglais",
  nomLangue: { fr: 'français', en: 'anglais' },
  recherche: 'Recherche',
  rechercheTitre: 'Rechercher dans L’Écho des Hauts',
  rechercheIntro:
    'La recherche porte sur le texte intégral des articles publiés, dans la langue de cette page. Les résultats s’affichent au fil de la saisie.',
  rechercheLabel: 'Votre recherche',
  recherchePlaceholder: 'Un mot, un nom, un lieu…',
  rechercheChargement: 'Recherche en cours…',
  rechercheAucunResultat: 'Aucun article ne correspond à cette recherche.',
  rechercheErreur:
    'La recherche est momentanément indisponible. Vous pouvez parcourir les rubriques depuis le menu.',
  rechercheUnResultat: '1 article trouvé',
  rechercheNResultats: (nombre) => `${nombre} articles trouvés`,
  rechercheSansJs:
    'La recherche a besoin de JavaScript pour interroger son index. C’est la seule page du site dans ce cas : tout le reste fonctionne sans. Vous pouvez parcourir les rubriques depuis le menu.',
  titre404: 'Cette page n’existe pas',
  texte404:
    "L’adresse demandée ne correspond à aucune page de L’Écho des Hauts. Le lien qui vous a mené ici est peut-être ancien, ou l’article a changé d’adresse.",
  retourAccueil: "Revenir à l’accueil",
  fluxRss: 'Flux RSS de L’Écho des Hauts',
  mediaFictifTitre: 'Un média fictif',
  mediaFictifTexte:
    "L’Écho des Hauts est un média fictif. Ce site est un démonstrateur technique : sa ligne éditoriale, ses articles, ses auteurs et les événements qu’il relate sont inventés. Aucun contenu publié ici ne rapporte de faits réels, et ce site ne constitue en aucun cas un service de presse en ligne.",
  reseauxDuJournal: 'Reseaux du journal',
  plateformeSite: 'Site web',
  voirLaVideoSur: (fournisseur) => `Voir la video sur ${fournisseur}`,
  voirLaVideo: 'Voir la video',
  ouvreNouvelOnglet: '(s ouvre dans un nouvel onglet)',
  parAuteur: (auteur) => `par ${auteur}`,
  configurationAbsente: (singleType) =>
    `Configuration Strapi absente : le Single Type « ${singleType} » n a aucune entree. Nom du site, logo et description ne peuvent pas etre affiches.`,
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
  /* « episodes », et non « instalments » : la MEME page annonce sa liste par
     `articlesDuDossier` = « Episodes in this series ». Le mot du compte etait le seul
     intrus (arbitrage d Aymeric du 2026-08-20, decision `370dd216`). */
  nombreEpisodes: (nombre) =>
    nombre < 1 ? null : nombre > 1 ? `${nombre} episodes` : `${nombre} episode`,
  navigationPages: 'Pagination',
  pagePrecedente: 'Previous page',
  pageSuivante: 'Next page',
  pageXsurY: (page, total) => `Page ${page} of ${total}`,
  langueCourante: 'Current language',
  changerDeLangue: 'Change language',
  versLangue: (langue) => `Read in ${langue}`,
  traductionAbsente: 'this page is not available in French',
  nomLangue: { fr: 'French', en: 'English' },
  recherche: 'Search',
  rechercheTitre: 'Search L’Écho des Hauts',
  rechercheIntro:
    'The search covers the full text of published articles, in the language of this page. Results appear as you type.',
  rechercheLabel: 'Your search',
  recherchePlaceholder: 'A word, a name, a place…',
  rechercheChargement: 'Searching…',
  rechercheAucunResultat: 'No article matches this search.',
  rechercheErreur:
    'Search is temporarily unavailable. You can browse the sections from the menu.',
  rechercheUnResultat: '1 article found',
  rechercheNResultats: (nombre) => `${nombre} articles found`,
  rechercheSansJs:
    'Search needs JavaScript to query its index. This is the only page on the site in that situation: everything else works without it. You can browse the sections from the menu.',
  titre404: 'This page does not exist',
  texte404:
    'The address you requested does not match any page of L’Écho des Hauts. The link that brought you here may be outdated, or the article may have moved.',
  retourAccueil: 'Back to the home page',
  fluxRss: 'RSS feed of L’Écho des Hauts',
  mediaFictifTitre: 'A fictional publication',
  mediaFictifTexte:
    'L’Écho des Hauts is a fictional news outlet. This site is a technical demonstrator: its editorial line, its articles, its journalists and the events it reports are invented. Nothing published here reports real facts, and this site is in no way an online press service.',
  /* CHOIX EDITORIAL, a trancher par Aymeric s il ne convient pas : « Reseaux du journal »
     annonce les comptes de la REDACTION. Le rendu anglais dit la meme chose, sans reprendre
     « journal » — le mot anglais le plus proche (« newspaper ») designe l objet papier. */
  reseauxDuJournal: 'Follow the newsroom',
  plateformeSite: 'Website',
  voirLaVideoSur: (fournisseur) => `Watch the video on ${fournisseur}`,
  voirLaVideo: 'Watch the video',
  ouvreNouvelOnglet: '(opens in a new tab)',
  parAuteur: (auteur) => `by ${auteur}`,
  configurationAbsente: (singleType) =>
    `Strapi configuration missing: the « ${singleType} » Single Type has no entry. Site name, logo and description cannot be displayed.`,
};

export const LIBELLES: Record<Locale, Libelles> = { fr: FR, en: EN };

export function libelles(locale: Locale): Libelles {
  return LIBELLES[locale];
}
