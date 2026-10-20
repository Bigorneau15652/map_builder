// IGN layers of the Géoplateforme WMTS service shown in the catalogue (no key needed).
// Source: GetCapabilities of https://data.geopf.fr/wmts read on 2026-10-20 (service flagged Public, fees none).
// Row: [layer id, title, format (j = jpeg, p = png), min zoom, max zoom, style id, dataset id].
window.MAPBUILDER_IGN_LAYERS = [
  [`GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2`, `Plan IGN`, `p`, 0, 19, `normal`, `IGNF_PLAN-IGN`],
  [`ORTHOIMAGERY.ORTHOPHOTOS`, `Photographies aériennes`, `j`, 0, 19, `normal`, `IGNF_BD-ORTHO`],
  [`CADASTRALPARCELS.PARCELLAIRE_EXPRESS`, `Parcelles cadastrales`, `p`, 0, 19, `normal`, `IGNF_PARCELLAIRE-EXPRESS-PCI`],
  [`ADMINEXPRESS-COG-CARTO.LATEST`, `Limites administratives (Admin Express)`, `p`, 6, 16, `normal`, `IGNF_ADMIN-EXPRESS`],
  [`IGNF_PLAN-IGN-HD`, `Plan IGN HD`, `j`, 6, 18, `PLAN-IGN-HD`, `IGNF_PLAN-IGN-HD`],
  [`GEOGRAPHICALGRIDSYSTEMS.MAPS.BDUNI.J1`, `Plan IGN J+1`, `p`, 0, 18, `normal`, ``],
  [`ORTHOIMAGERY.ORTHOPHOTOS.1950-1965`, `Photographies aériennes historiques 1950-1965`, `p`, 0, 18, `BDORTHOHISTORIQUE`, `IGNF_BD-ORTHO-HISTO`],
  [`ORTHOIMAGERY.ORTHOPHOTOS.1965-1980`, `Photographies aériennes 1965-1980`, `p`, 3, 18, `BDORTHOHISTORIQUE`, `IGNF_BD-ORTHO-HISTO`],
  [`CADASTRALPARCELS.PARCELS`, `Parcelles cadastrales (2013-2018)`, `p`, 0, 20, `bdparcellaire`, `IGNF_BD-PARCELLAIRE`],
  [`CADASTRALPARCELS.HISTO.2008-2013.PARCELS`, `Parcelles cadastrales 2008-2013`, `p`, 0, 20, `bdparcellaire`, `IGNF_BD-PARCELLAIRE`],
  [`GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN50.1950`, `Carte 1950 (SCAN 50®)`, `j`, 3, 15, `SCAN50_1950`, `IGNF_SCAN-50-HISTO`],
  [`GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40`, `Carte de l'état-major (1820-1866)`, `j`, 6, 15, `normal`, `IGNF_SCAN-EM-40K`],
  [`BNF-IGNF_GEOGRAPHICALGRIDSYSTEMS.CASSINI`, `Carte de Cassini`, `p`, 6, 14, `normal`, `BNF_CASSINI-MARIE-ANTOINETTE`],
  [`TRANSPORTNETWORKS.ROADS`, `Routes`, `p`, 6, 18, `normal`, `IGNF_BD-TOPO`],
  [`ELEVATION.SLOPES`, `Relief du terrain (MNT BD ALTI®)`, `j`, 6, 14, `normal`, `IGNF_BD-ALTI`],
  [`ELEVATION.CONTOUR.LINE`, `Courbes de niveau`, `p`, 6, 18, `normal`, `IGNF_COURBES-DE-NIVEAU`],
  [`GEOGRAPHICALGRIDSYSTEMS.SLOPES.MOUNTAIN`, `Carte des pentes`, `p`, 0, 17, `normal`, ``],
  [`GEOGRAPHICALGRIDSYSTEMS.COASTALMAPS`, `Carte littorale`, `p`, 6, 16, `normal`, ``],
  [`HYDROGRAPHY.HYDROGRAPHY`, `Réseau hydrographique`, `p`, 6, 18, `normal`, `IGNF_BD-TOPO`],
  [`LANDCOVER.FORESTINVENTORY.V2`, `Carte forestière (BD Forêt® V2)`, `p`, 6, 16, `normal`, `IGNF_BD-FORET`],
  [`FORETS.PUBLIQUES`, `Forêts publiques`, `p`, 3, 16, `FORETS PUBLIQUES ONF`, `ONF_FORETS-PUBLIQUES`],
];
