# Maps and their rights / Cartes et leurs droits

English first, version française plus bas.

## English

The widget never stores any map: each map is loaded directly from its provider server when it is displayed. The attribution shown at the bottom right of the map is the one written for each entry in `js/catalog.js`; keep it visible. This page lists the maps shipped in the catalogue, their provider and what is known about their terms. It is information, not legal advice: the providers own the terms, and they can change. Check them before publishing a document or a widget that uses a map.

Rule used to build the catalogue: a map is shipped only when its provider terms were read and allow this use. A map whose terms could not be confirmed is left out (see "Not included").

### Maps in the catalogue

| Map in the widget | Provider | What the provider says | Attribution displayed |
|---|---|---|---|
| OpenStreetMap Standard | OpenStreetMap Foundation | Data under the ODbL licence: the credit "OpenStreetMap contributors" is required. The tile server has a [tile usage policy](https://operations.osmfoundation.org/policies/tiles/): heavy use needs prior permission, prefetching is blocked, and access can be blocked without notice. Sources: [copyright page](https://www.openstreetmap.org/copyright), [tile policy](https://operations.osmfoundation.org/policies/tiles/). | OpenStreetMap contributors (link to the copyright page) |
| CyclOSM | CyclOSM project, served by OpenStreetMap France | The CyclOSM site describes its tile service as fair use, and the tiles follow the general OpenStreetMap tile usage policy. Source: [cyclosm.org](https://cyclosm.org/). | CyclOSM and OpenStreetMap contributors |
| OpenTopoMap | OpenTopoMap | Tiles under CC-BY-SA 3.0: the licence must be followed and opentopomap.org credited; larger projects should contact the maintainers first. Source: [OpenStreetMap wiki](https://wiki.openstreetmap.org/wiki/OpenTopoMap). | OpenStreetMap contributors and OpenTopoMap (CC-BY-SA) |
| IGN layers (Géoplateforme), 21 listed below | IGN, service `data.geopf.fr` | The WMTS service declares itself "Public" with fees "none", under the terms of [cartes.gouv.fr/cgu](https://cartes.gouv.fr/cgu) (read in its GetCapabilities document). The layers come from many producers (IGN, BRGM, INSEE, ADEME, ONF, INRAE and others): each dataset has its own page, linked from the attribution of the map, with its own licence. Reports say public IGN data has been under the Etalab open licence since 2021, but scans and third-party data can have other terms. | &copy; IGN / Géoplateforme (link to the dataset page) |
| Maps added with "Other..." | The provider you choose | The widget cannot know the terms of a map you add. You are responsible for them. | The copyright text you type, shown as plain text |

For the IGN layers, check the licence of each dataset on its page before using it in a published document: the service is public, but the datasets behind it do not all have the same terms.

The 21 layers: Plan IGN, Photographies aériennes, Parcelles cadastrales, Limites administratives, Plan IGN HD, Plan IGN J+1, Photographies aériennes 1950-1965 and 1965-1980, Parcelles cadastrales 2013-2018 and 2008-2013, Carte 1950 (SCAN 50), Carte de l'état-major, Carte de Cassini, Routes, Relief du terrain (MNT BD ALTI), Courbes de niveau, Carte des pentes, Carte littorale, Réseau hydrographique, Carte forestière (BD Forêt V2) and Forêts publiques.

### Not included

- Esri maps (Street Map, World Imagery, World Topo Map): I could not confirm that anonymous use of their tile servers is allowed for any use. Left out.
- OpenStreetMap France, Humanitarian (HOT) and Waymarked Trails: the terms of these tile servers could not be read. Left out.
- CARTO maps (Positron, Dark Matter, Voyager), Thunderforest and Tracestrack: they need a key or have their own conditions. Left out. You can add them with "Other..." and your own key.
- The other IGN layers (about 650): they were in an earlier version of the catalogue, but many do not work in this widget. Left out. Add one with "Other..." if you need it.
- IGN TOPO 25, "Cartes IGN", OACI-VFR map, noise exposure plan, linear hedges, PCRS and geographical names: they are not in the public Géoplateforme WMTS service read for this widget (they come from a service that needs a key or from another provider). Left out. If you hold the rights, add them with "Other...".

### Notes for people who publish this widget

- Each map provider sees the IP address of the users, the displayed area and the site that shows the map. No table data is ever sent.
- An API key typed in the "Other" dialog is stored in the widget options, so people with access to the document can read it. Restrict such a key to a domain at the provider.
- The list of IGN layers was read from the service on 2026-10-20 (see `data/README.md`). Layers can appear, change or disappear: an unavailable layer shows no tiles.

## Français

Le widget ne conserve aucune carte : chaque carte est chargée directement depuis le serveur de son fournisseur au moment de l'affichage. La mention de droits affichée en bas à droite de la carte est celle écrite pour chaque entrée dans `js/catalog.js` ; elle doit rester visible. Cette page liste les cartes du catalogue, leur fournisseur et ce que l'on sait de leurs conditions. Elle donne une information et non un avis juridique : les conditions appartiennent aux fournisseurs et peuvent changer. Vérifiez-les avant de publier un document ou un widget qui utilise une carte.

Règle suivie pour construire le catalogue : une carte n'est incluse que si les conditions de son fournisseur ont été lues et autorisent cet usage. Une carte dont les conditions n'ont pas pu être confirmées est écartée (voir « Cartes non incluses »).

### Cartes du catalogue

- OpenStreetMap Standard : données sous licence ODbL, mention « OpenStreetMap contributors » obligatoire. Le serveur de tuiles a une politique d'usage : l'usage intensif demande une autorisation préalable, le préchargement est bloqué et l'accès peut être coupé sans préavis. Sources : page de droits d'auteur d'OpenStreetMap et politique d'usage des tuiles.
- CyclOSM : le site du projet décrit son service de tuiles comme un usage raisonnable, et les tuiles suivent la politique générale d'usage des tuiles OpenStreetMap. Source : cyclosm.org.
- OpenTopoMap : tuiles sous licence CC-BY-SA 3.0, avec mention de opentopomap.org ; contacter les mainteneurs pour un projet important. Source : wiki OpenStreetMap.
- Couches de l'IGN (Géoplateforme), 21 couches : le service WMTS se déclare « Public » et sans frais, sous les conditions de cartes.gouv.fr/cgu (lu dans son document GetCapabilities). Les couches viennent de nombreux producteurs (IGN, BRGM, INSEE, ADEME, ONF, INRAE et autres) : chaque jeu de données a sa page, accessible depuis la mention de droits de la carte, avec sa licence. Les données publiques de l'IGN seraient sous Licence Ouverte Etalab depuis 2021, mais les scans et les données de tiers peuvent avoir d'autres conditions. Vérifiez la licence de chaque jeu de données avant de l'utiliser dans un document publié.
- Cartes ajoutées par « Autre… » : vous en êtes responsable.

Les 21 couches : Plan IGN, Photographies aériennes, Parcelles cadastrales, Limites administratives, Plan IGN HD, Plan IGN J+1, Photographies aériennes 1950-1965 et 1965-1980, Parcelles cadastrales 2013-2018 et 2008-2013, Carte 1950 (SCAN 50), Carte de l'état-major, Carte de Cassini, Routes, Relief du terrain (MNT BD ALTI), Courbes de niveau, Carte des pentes, Carte littorale, Réseau hydrographique, Carte forestière (BD Forêt V2) et Forêts publiques.

### Cartes non incluses

- Cartes Esri (Street Map, World Imagery, World Topo Map) : je n'ai pas pu confirmer que l'accès anonyme à leurs serveurs de tuiles est autorisé pour tout usage. Écartées.
- OpenStreetMap France, Humanitaire (HOT) et Waymarked Trails : les conditions de ces serveurs n'ont pas pu être lues. Écartées.
- Cartes CARTO (Positron, Dark Matter, Voyager), Thunderforest et Tracestrack : elles demandent une clé ou ont leurs propres conditions. Écartées. Vous pouvez les ajouter avec « Autre… » et votre propre clé.
- Les autres couches de l'IGN (environ 650) : elles figuraient dans une version précédente du catalogue, mais beaucoup ne fonctionnent pas dans ce widget. Écartées. Ajoutez-en une avec « Autre… » au besoin.
- IGN TOPO 25, « Cartes IGN », carte OACI-VFR, plan d'exposition au bruit, haies linéaires, PCRS et dénominations géographiques : elles ne figurent pas dans le service WMTS public de la Géoplateforme lu pour ce widget (elles viennent d'un service à clé ou d'un autre fournisseur). Écartées. Si vous détenez les droits, ajoutez-les avec « Autre… ».

### Pour les personnes qui publient ce widget

Chaque fournisseur voit l'adresse IP des utilisateurs, la zone affichée et le site qui affiche la carte, mais jamais les données du tableau. Une clé API saisie dans la fenêtre « Autre » est enregistrée dans les options du widget, donc lisible par les personnes qui ont accès au document : restreignez-la à un domaine chez le fournisseur. La liste des couches IGN a été lue sur le service le 20 octobre 2026 (voir `data/README.md`) ; une couche indisponible n'affiche aucune tuile.
