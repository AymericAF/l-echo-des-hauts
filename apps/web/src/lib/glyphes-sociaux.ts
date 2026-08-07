/**
 * Les glyphes de plateforme de `partage.lien-social` (A-30).
 *
 * A-30 tranche le RENDU et rien d autre : « le rendu est une icone SVG inline (zero JS,
 * pas de police d icones, pas de requete reseau) : chaque valeur suppose une icone ecrite
 * a la main. […] Elargir la liste = ajouter une icone dans le meme commit. » Il ne dit
 * rien de la PROVENANCE du dessin — c est la question que ce fichier tranche, et sa
 * reponse tient en une phrase : **aucun chemin n est dessine ici**. Chaque `d` est copie
 * du fichier vectoriel publie par la plateforme elle-meme, dans ses ressources de marque,
 * et `source` dit lequel. Un logo approximatif passerait pour la marque sans en etre :
 * faux a l ecran, et discutable en droit — pire que le nom en toutes lettres, parce qu il
 * a l air fini.
 *
 * `autorisation` porte la clause CONSTATEE le jour du releve, pas une impression : les
 * regles de marque changent, et la seule facon de rejouer le raisonnement est de savoir
 * ce qui etait ecrit. Les tests de `tests/glyphes-sociaux.test.ts` refusent un glyphe qui
 * n a ni source ni autorisation.
 *
 * Toutes les encres sont des variantes PUBLIEES par la plateforme (noir / blanc, ou
 * l « Almost Black » de YouTube) : la forme n est jamais retouchee, seule la couleur
 * bascule avec `prefers-color-scheme` — A-35, meme mecanique que les deux logos du site.
 */
import type { Plateforme } from './domaine.ts';

export interface GlypheSocial {
  /** Repris tel quel du fichier officiel : recadrer changerait les proportions du signe. */
  readonly viewBox: string;
  readonly d: string;
  /** Present quand le fichier officiel en porte un — il fait partie du dessin. */
  readonly transform?: string;
  /** Le fichier PRECIS a l interieur de la ressource, quand elle en contient plusieurs. */
  readonly fichier?: string;
  /** Variante de couleur publiee par la plateforme, pour fond clair. */
  readonly encre: string;
  /** Idem, pour fond sombre. */
  readonly encreSombre: string;
  /** URL EXACTE de la ressource de marque d ou vient `d`. Sans elle, pas de glyphe. */
  readonly source: string;
  /** La clause qui autorise l usage de renvoi, citee. */
  readonly autorisation: string;
  /** Date du releve de cette clause. */
  readonly releve: string;
}

/** Le nom affichable. Il sert de texte accessible quand un glyphe le remplace a l ecran. */
export const LIBELLES: Record<Plateforme, string> = {
  linkedin: 'LinkedIn',
  x: 'X',
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  site: 'Site web',
};

export const GLYPHES: Partial<Record<Plateforme, GlypheSocial>> = {
  linkedin: {
    viewBox: '0 0 48 48',
    d: 'm44.4 0h-40.9c-1.9 0-3.5 1.5-3.5 3.5v41.1c0 1.9 1.6 3.4 3.5 3.4h40.9c1.9 0 3.5-1.5 3.6-3.5v-41c0-2-1.6-3.5-3.6-3.5zm-30.2 40.9h-7.1v-22.9h7.1v22.9zm-3.5-26c-2.3 0-4.1-1.8-4.1-4.1s1.8-4.1 4.1-4.1 4.1 1.8 4.1 4.1c0 2.2-1.8 4.1-4.1 4.1zm30.2 26h-7.1v-11.1c0-2.7 0-6.1-3.7-6.1s-4.3 2.9-4.3 5.9v11.3h-7.1v-22.9h6.8v3.1h0.1c1-1.8 3.3-3.7 6.7-3.7 7.2 0 8.5 4.7 8.5 10.9v12.6z',
    fichier: 'symbole SVG inline « inbug-blue-48 » de la page (le pack telechargeable ne contient que des PNG)',
    encre: '#000000',
    encreSombre: '#ffffff',
    source: 'https://brand.linkedin.com/in-logo',
    autorisation:
      'LinkedIn Brand Guidelines, « [in] Logo — Acceptable use » : « As a hyperlink to your LinkedIn profile, company page, and/or group page » et « In a series of social media icons showing your participation in those sites ». Couleurs : « LinkedIn members may only use the [in] Logo in three color variations: blue, black, and white » — noir et blanc retenus, forme inchangee.',
    releve: '2026-08-07',
  },
  x: {
    viewBox: '0 0 1200 1227',
    d: 'M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z',
    fichier: 'logo.svg (« X Alpha Logo .svg (transparent) » du toolkit)',
    encre: '#000000',
    encreSombre: '#ffffff',
    source: 'https://about.x.com/content/dam/about-twitter/x/brand-toolkit/x-logo.zip',
    autorisation:
      'X Brand Quick Guide (aout 2023, v1.0) : « We know many partners use our logos in a variety of places to help signpost where your audience can find you. » Couleurs : « The X logo is black or white. It must be legible and maintain the integrity of its form », avec l exception « the logo should be white on darker backgrounds and black on lighter backgrounds ».',
    releve: '2026-08-07',
  },
  bluesky: {
    viewBox: '0 0 568 501',
    d: 'M123.121 33.6637C188.241 82.5526 258.281 181.681 284 234.873C309.719 181.681 379.759 82.5526 444.879 33.6637C491.866 -1.61183 568 -28.9064 568 57.9464C568 75.2916 558.055 203.659 552.222 224.501C531.947 296.954 458.067 315.434 392.347 304.249C507.222 323.8 536.444 388.56 473.333 453.32C353.473 576.312 301.061 422.461 287.631 383.039C285.169 375.812 284.017 372.431 284 375.306C283.983 372.431 282.831 375.812 280.369 383.039C266.939 422.461 214.527 576.312 94.6667 453.32C31.5556 388.56 60.7778 323.8 175.653 304.249C109.933 315.434 36.0535 296.954 15.7778 224.501C9.94525 203.659 0 75.2916 0 57.9464C0 -28.9064 76.1345 -1.61183 123.121 33.6637Z',
    encre: '#000000',
    encreSombre: '#ffffff',
    source: 'https://bsky.social/about/brand-assets/butterfly/bluesky_media_kit_logo_transparent_4.svg',
    autorisation:
      'Bluesky Trademark Policy (15 mai 2026), §4.1 « Social media identification » — usage permis SANS autorisation prealable : « Using the Bluesky butterfly logo as a social media icon to link to your Bluesky profile on a website », a condition que le logo soit dans sa forme officielle et serve de lien. Variantes officielles noire (4) et blanche (3) : chemin identique, verifie.',
    releve: '2026-08-07',
  },
  mastodon: {
    viewBox: '0 0 74 79',
    d: 'M73.7014 17.4323C72.5616 9.05152 65.1774 2.4469 56.424 1.1671C54.9472 0.950843 49.3518 0.163818 36.3901 0.163818H36.2933C23.3281 0.163818 20.5465 0.950843 19.0697 1.1671C10.56 2.41145 2.78877 8.34604 0.903306 16.826C-0.00357854 21.0022 -0.100361 25.6322 0.068112 29.8793C0.308275 35.9699 0.354874 42.0498 0.91406 48.1156C1.30064 52.1448 1.97502 56.1419 2.93215 60.0769C4.72441 67.3445 11.9795 73.3925 19.0876 75.86C26.6979 78.4332 34.8821 78.8603 42.724 77.0937C43.5866 76.8952 44.4398 76.6647 45.2833 76.4024C47.1867 75.8033 49.4199 75.1332 51.0616 73.9562C51.0841 73.9397 51.1026 73.9184 51.1156 73.8938C51.1286 73.8693 51.1359 73.8421 51.1368 73.8144V67.9366C51.1364 67.9107 51.1302 67.8852 51.1186 67.862C51.1069 67.8388 51.0902 67.8184 51.0695 67.8025C51.0489 67.7865 51.0249 67.7753 50.9994 67.7696C50.9738 67.764 50.9473 67.7641 50.9218 67.7699C45.8976 68.9569 40.7491 69.5519 35.5836 69.5425C26.694 69.5425 24.3031 65.3699 23.6184 63.6327C23.0681 62.1314 22.7186 60.5654 22.5789 58.9744C22.5775 58.9477 22.5825 58.921 22.5934 58.8965C22.6043 58.8721 22.621 58.8505 22.6419 58.8336C22.6629 58.8167 22.6876 58.8049 22.714 58.7992C22.7404 58.7934 22.7678 58.794 22.794 58.8007C27.7345 59.9796 32.799 60.5746 37.8813 60.5733C39.1036 60.5733 40.3223 60.5733 41.5447 60.5414C46.6562 60.3996 52.0437 60.1408 57.0728 59.1694C57.1983 59.1446 57.3237 59.1233 57.4313 59.0914C65.3638 57.5847 72.9128 52.8555 73.6799 40.8799C73.7086 40.4084 73.7803 35.9415 73.7803 35.4523C73.7839 33.7896 74.3216 23.6576 73.7014 17.4323ZM61.4925 47.3144H53.1514V27.107C53.1514 22.8528 51.3591 20.6832 47.7136 20.6832C43.7061 20.6832 41.6988 23.2499 41.6988 28.3194V39.3803H33.4078V28.3194C33.4078 23.2499 31.3969 20.6832 27.3894 20.6832C23.7654 20.6832 21.9552 22.8528 21.9516 27.107V47.3144H13.6176V26.4937C13.6176 22.2395 14.7157 18.8598 16.9118 16.3545C19.1772 13.8552 22.1488 12.5719 25.8373 12.5719C30.1064 12.5719 33.3325 14.1955 35.4832 17.4394L37.5587 20.8853L39.6377 17.4394C41.7884 14.1955 45.0145 12.5719 49.2765 12.5719C52.9614 12.5719 55.9329 13.8552 58.2055 16.3545C60.4017 18.8574 61.4997 22.2371 61.4997 26.4937L61.4925 47.3144Z',
    encre: '#000000',
    encreSombre: '#ffffff',
    source: 'https://joinmastodon.org/logos/logo-black.svg',
    autorisation:
      'Mastodon Brand Toolkit : « download our logos and icons […] for your projects » ; variante « Mark only » prevue quand « space is limited », et « one color black or white version » explicitement offerte. Trademark Policy : « Do not change or modify the Mastodon marks » — forme inchangee, seule l encre bascule entre les deux variantes publiees.',
    releve: '2026-08-07',
  },
  instagram: {
    viewBox: '0 0 1000 1000',
    d: 'M295.42,6c-53.2,2.51-89.53,11-121.29,23.48-32.87,12.81-60.73,30-88.45,57.82S40.89,143,28.17,175.92c-12.31,31.83-20.65,68.19-23,121.42S2.3,367.68,2.56,503.46,3.42,656.26,6,709.6c2.54,53.19,11,89.51,23.48,121.28,12.83,32.87,30,60.72,57.83,88.45S143,964.09,176,976.83c31.8,12.29,68.17,20.67,121.39,23s70.35,2.87,206.09,2.61,152.83-.86,206.16-3.39S799.1,988,830.88,975.58c32.87-12.86,60.74-30,88.45-57.84S964.1,862,976.81,829.06c12.32-31.8,20.69-68.17,23-121.35,2.33-53.37,2.88-70.41,2.62-206.17s-.87-152.78-3.4-206.1-11-89.53-23.47-121.32c-12.85-32.87-30-60.7-57.82-88.45S862,40.87,829.07,28.19c-31.82-12.31-68.17-20.7-121.39-23S637.33,2.3,501.54,2.56,348.75,3.4,295.42,6m5.84,903.88c-48.75-2.12-75.22-10.22-92.86-17-23.36-9-40-19.88-57.58-37.29s-28.38-34.11-37.5-57.42c-6.85-17.64-15.1-44.08-17.38-92.83-2.48-52.69-3-68.51-3.29-202s.22-149.29,2.53-202c2.08-48.71,10.23-75.21,17-92.84,9-23.39,19.84-40,37.29-57.57s34.1-28.39,57.43-37.51c17.62-6.88,44.06-15.06,92.79-17.38,52.73-2.5,68.53-3,202-3.29s149.31.21,202.06,2.53c48.71,2.12,75.22,10.19,92.83,17,23.37,9,40,19.81,57.57,37.29s28.4,34.07,37.52,57.45c6.89,17.57,15.07,44,17.37,92.76,2.51,52.73,3.08,68.54,3.32,202s-.23,149.31-2.54,202c-2.13,48.75-10.21,75.23-17,92.89-9,23.35-19.85,40-37.31,57.56s-34.09,28.38-57.43,37.5c-17.6,6.87-44.07,15.07-92.76,17.39-52.73,2.48-68.53,3-202.05,3.29s-149.27-.25-202-2.53m407.6-674.61a60,60,0,1,0,59.88-60.1,60,60,0,0,0-59.88,60.1M245.77,503c.28,141.8,115.44,256.49,257.21,256.22S759.52,643.8,759.25,502,643.79,245.48,502,245.76,245.5,361.22,245.77,503m90.06-.18a166.67,166.67,0,1,1,167,166.34,166.65,166.65,0,0,1-167-166.34',
    transform: 'translate(-2.5 -2.5)',
    fichier: 'pack « Logo pack » > 01 Static Glyph/03 Black Glyph/Instagram_Glyph_Black.svg',
    encre: '#000000',
    encreSombre: '#ffffff',
    source: 'https://www.meta.com/brand/resources/instagram/instagram-brand/',
    autorisation:
      'Instagram brand guidelines (Meta Brand Resource Center) : « Anyone using Instagram’s assets should only use the logos and screenshots found on our Brand Resource Center site » — c est le cas ici. « Only those planning to use Instagram’s assets in any broadcast, radio, out-of-home advertising or print larger than 8.5 x 11 inches need to request permission » : un usage web n en releve pas. Glyphes noir et blanc officiels, chemin identique, verifie.',
    releve: '2026-08-07',
  },
  youtube: {
    viewBox: '0 0 396.532 277.776',
    d: 'M261.556 198.411L261.556 317.457L364.383 258.079ZM490.961 353.374C486.326 370.463 473.292 383.788 455.913 388.422C425.209 396.822 300.949 396.822 300.949 396.822C300.949 396.822 176.979 396.822 146.276 388.422C129.186 383.788 115.862 370.463 110.938 353.374C102.828 322.671 102.828 258.079 102.828 258.079C102.828 258.079 102.828 193.487 110.938 162.493C115.862 145.694 129.186 132.08 146.276 127.446C176.979 119.046 300.949 119.046 300.949 119.046C300.949 119.046 425.209 119.046 455.913 127.446C473.292 132.08 486.326 145.694 490.961 162.493C499.36 193.487 499.36 258.079 499.36 258.079C499.36 258.079 499.36 322.671 490.961 353.374',
    transform: 'translate(-102.828 396.822) scale(1 -1)',
    fichier: 'lien « Download » de https://brand.youtube/youtube-logo/ > YouTube_Icon/Digital/02 Almost Black/yt_icon_almostblack_digital.ai (chemins extraits mecaniquement du flux PDF du .ai, aucun retrace)',
    encre: '#212121',
    encreSombre: '#ffffff',
    source: 'https://www.gstatic.com/marketing-cms/89/d9/cf95c4f345709f4998dc581221b0/youtube-icon.zip',
    autorisation:
      'YouTube API Services Branding Guidelines : « You should use a YouTube Icon in a panel of social media icons » et « any YouTube logo used within an application must link back to YouTube content […] such as a page on the YouTube website ». « You […] cannot change YouTube branding images » : l encre claire est l « Almost Black » officiel (#212121, releve dans le PNG du pack), l encre sombre la variante « White » du meme pack.',
    releve: '2026-08-07',
  },
  site: {
    viewBox: '0 0 24 24',
    d: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z',
    encre: '#000000',
    encreSombre: '#ffffff',
    source: 'https://raw.githubusercontent.com/google/material-design-icons/master/src/action/language/materialicons/24px.svg',
    autorisation:
      'Material Design Icons, licence Apache 2.0 (fichier LICENSE du depot google/material-design-icons) : reproduction et redistribution autorisees. Ce n est pas une marque de plateforme — `site` designe le site personnel d un auteur (A-30), aucun tiers n est represente.',
    releve: '2026-08-07',
  },
};

/**
 * Les plateformes qui restent en toutes lettres, et POURQUOI.
 *
 * Une plateforme absente des deux tables ne casserait rien : elle rendrait un lien nu.
 * D ou le test qui exige que la reunion couvre l enum.
 */
export const RAISONS_SANS_GLYPHE: Partial<Record<Plateforme, string>> = {
  facebook:
    'Meta ne publie le logo Facebook qu en PNG et en .ai (pack « Facebook Brand Asset Pack ») — aucun SVG, donc aucun chemin officiel a poser inline. Et ses regles ferment les portes de sortie : « DON’T change the color of the logo », « DON’T use just the ‘f’ from our logo », « DON’T outline the logo ». Un glyphe monochrome serait donc une infraction, et un chemin redessine serait un faux. Le nom en toutes lettres reste (constat du 2026-08-07).',
};

export function glypheDe(plateforme: Plateforme): GlypheSocial | null {
  return GLYPHES[plateforme] ?? null;
}
