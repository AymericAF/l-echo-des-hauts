/**
 * Ce que `bloc.video` peut dire de son URL SANS toucher au reseau.
 *
 * T-01 (`docs/arbitrages-techniques.md`) exige « un libelle texte visible dans le
 * lien » : §9 demande que le site reste lisible avec les images bloquees, et un lien
 * dont le seul contenu est une vignette disparait purement et simplement dans ce mode.
 * Nommer la destination (« Voir la video sur YouTube ») vaut mieux qu un « Voir la
 * video » nu : le lecteur sait ou il part avant de cliquer, ce qui est aussi une regle
 * d accessibilite pour un lien ouvrant un onglet.
 *
 * Ce module lit un HOTE, rien de plus. Il ne derive AUCUNE vignette : la derivation de
 * T-02 (identifiant fournisseur, telechargement de la miniature, controle de dimension)
 * est un mecanisme de build a dependance reseau, hors du perimetre de ce composant.
 */

const FOURNISSEURS: ReadonlyArray<{ nom: string; hotes: readonly string[] }> = [
  { nom: 'YouTube', hotes: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'] },
  { nom: 'Vimeo', hotes: ['vimeo.com'] },
];

/** Le nom affichable du fournisseur, ou `null` si l hote n en designe aucun de connu. */
export function nomFournisseurVideo(url: string): string | null {
  let hote: string;
  try {
    hote = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    // Le champ est valide par une regex `^https?://` cote Strapi (§3.6) ; si une URL
    // illisible arrive quand meme, le bloc se rend en lien nu plutot qu en echec de build.
    return null;
  }

  const trouve = FOURNISSEURS.find((fournisseur) =>
    fournisseur.hotes.some((connu) => hote === connu || hote.endsWith(`.${connu}`)),
  );
  return trouve?.nom ?? null;
}
