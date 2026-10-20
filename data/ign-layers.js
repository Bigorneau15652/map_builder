// IGN layers of the Géoplateforme WMTS service shown in the catalogue (no key needed).
// Source: GetCapabilities of https://data.geopf.fr/wmts read on 2026-10-20 (service flagged Public, fees none).
// Row: [layer id, title, format (j = jpeg, p = png), min zoom, max zoom, style id, dataset id].
window.MAPBUILDER_IGN_LAYERS = [
  [`GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2`, `Plan IGN`, `p`, 0, 19, `normal`, `IGNF_PLAN-IGN`],
  [`ORTHOIMAGERY.ORTHOPHOTOS`, `Photographies aériennes`, `j`, 0, 19, `normal`, `IGNF_BD-ORTHO`],
  [`IGNF_PLAN-IGN-HD`, `Plan IGN HD`, `j`, 6, 18, `PLAN-IGN-HD`, `IGNF_PLAN-IGN-HD`],
  [`GEOGRAPHICALGRIDSYSTEMS.MAPS.BDUNI.J1`, `Plan IGN J+1`, `p`, 0, 18, `normal`, ``],
  [`ORTHOIMAGERY.ORTHOPHOTOS.1950-1965`, `Photographies aériennes historiques 1950-1965`, `p`, 0, 18, `BDORTHOHISTORIQUE`, `IGNF_BD-ORTHO-HISTO`],
  [`ORTHOIMAGERY.ORTHOPHOTOS.1965-1980`, `Photographies aériennes 1965-1980`, `p`, 3, 18, `BDORTHOHISTORIQUE`, `IGNF_BD-ORTHO-HISTO`],
  [`GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN50.1950`, `Carte 1950 (SCAN 50®)`, `j`, 3, 15, `SCAN50_1950`, `IGNF_SCAN-50-HISTO`],
  [`GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40`, `Carte de l'état-major (1820-1866)`, `j`, 6, 15, `normal`, `IGNF_SCAN-EM-40K`],
  [`BNF-IGNF_GEOGRAPHICALGRIDSYSTEMS.CASSINI`, `Carte de Cassini`, `p`, 6, 14, `normal`, `BNF_CASSINI-MARIE-ANTOINETTE`],
  [`ELEVATION.SLOPES`, `Relief du terrain (MNT BD ALTI®)`, `j`, 6, 14, `normal`, `IGNF_BD-ALTI`],
  [`GEOGRAPHICALGRIDSYSTEMS.COASTALMAPS`, `Carte littorale`, `p`, 6, 16, `normal`, ``],
];
