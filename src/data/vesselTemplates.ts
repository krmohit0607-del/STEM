/**
 * Standard vessel-size templates for voyage estimation. Selecting a template
 * fills in the Vessel Particular (DWT / draft / TPC / type) and the
 * performance profile (speeds + fuel consumption) with typical figures for
 * that class. The numbers are indicative market averages — the estimator can
 * fine-tune them after inserting.
 */

export interface VesselTemplate {
  id: string;
  name: string;
  /** Matches the Vessel Particular "Type" dropdown (VESSEL_TYPE_OPTIONS). */
  type: string;
  dwt: number;
  draft: number;
  tpc: number;
  /** Sea speeds (knots). */
  fullBallast: number;
  fullLaden: number;
  ecoBallast: number;
  ecoLaden: number;
  /** Main-engine consumption (MT/day). */
  mainBallast: number;
  mainLaden: number;
  mainIdle: number;
  mainWork: number;
  /** Auxiliary / generator consumption (MT/day). */
  subSea: number;
  subIdle: number;
  subWork: number;
}

/** Short blurb per size for the picker cards. */
export const VESSEL_TEMPLATES: VesselTemplate[] = [
  {
    id: 'mini-bulk', name: 'Mini Bulk / Coaster', type: 'Bulk Carrier',
    dwt: 10_000, draft: 7.5, tpc: 18,
    fullBallast: 12, fullLaden: 11.5, ecoBallast: 10.5, ecoLaden: 10,
    mainBallast: 9, mainLaden: 10, mainIdle: 1, mainWork: 1.8,
    subSea: 0.1, subIdle: 0.6, subWork: 1.2,
  },
  {
    id: 'handysize', name: 'Handysize', type: 'Handy',
    dwt: 32_000, draft: 10.0, tpc: 35,
    fullBallast: 13, fullLaden: 13, ecoBallast: 11.5, ecoLaden: 11,
    mainBallast: 18, mainLaden: 20, mainIdle: 2, mainWork: 3.5,
    subSea: 0.1, subIdle: 1.2, subWork: 2.2,
  },
  {
    id: 'handymax', name: 'Handymax', type: 'Handymax',
    dwt: 45_000, draft: 11.5, tpc: 48,
    fullBallast: 14, fullLaden: 14, ecoBallast: 12, ecoLaden: 11.5,
    mainBallast: 24, mainLaden: 27, mainIdle: 2.2, mainWork: 4,
    subSea: 0.1, subIdle: 1.5, subWork: 2.6,
  },
  {
    id: 'supramax', name: 'Supramax', type: 'Supramax',
    dwt: 57_000, draft: 12.8, tpc: 58,
    fullBallast: 14, fullLaden: 14, ecoBallast: 12, ecoLaden: 11.5,
    mainBallast: 29, mainLaden: 33, mainIdle: 2.5, mainWork: 5,
    subSea: 0.1, subIdle: 1.6, subWork: 2.8,
  },
  {
    id: 'ultramax', name: 'Ultramax', type: 'Ultramax',
    dwt: 63_500, draft: 13.3, tpc: 62,
    fullBallast: 14.5, fullLaden: 14, ecoBallast: 12.5, ecoLaden: 12,
    mainBallast: 30, mainLaden: 34, mainIdle: 2.6, mainWork: 5,
    subSea: 0.1, subIdle: 1.6, subWork: 2.9,
  },
  {
    id: 'panamax', name: 'Panamax', type: 'Panamax',
    dwt: 74_000, draft: 14.0, tpc: 70,
    fullBallast: 14, fullLaden: 14, ecoBallast: 12, ecoLaden: 11.5,
    mainBallast: 33, mainLaden: 36, mainIdle: 2.8, mainWork: 5.5,
    subSea: 0.1, subIdle: 1.8, subWork: 3,
  },
  {
    id: 'kamsarmax', name: 'Kamsarmax', type: 'Kamsarmax',
    dwt: 82_000, draft: 14.4, tpc: 75,
    fullBallast: 14, fullLaden: 14, ecoBallast: 12, ecoLaden: 11.5,
    mainBallast: 34, mainLaden: 38, mainIdle: 3, mainWork: 6,
    subSea: 0.1, subIdle: 1.9, subWork: 3.2,
  },
  {
    id: 'post-panamax', name: 'Post-Panamax', type: 'Bulk Carrier',
    dwt: 95_000, draft: 14.5, tpc: 82,
    fullBallast: 14, fullLaden: 14, ecoBallast: 12, ecoLaden: 11.5,
    mainBallast: 38, mainLaden: 43, mainIdle: 3.2, mainWork: 6.5,
    subSea: 0.1, subIdle: 2, subWork: 3.4,
  },
  {
    id: 'capesize', name: 'Capesize', type: 'Capesize',
    dwt: 180_000, draft: 18.2, tpc: 130,
    fullBallast: 14.5, fullLaden: 14, ecoBallast: 12, ecoLaden: 11.5,
    mainBallast: 48, mainLaden: 56, mainIdle: 4, mainWork: 8,
    subSea: 0.15, subIdle: 2.5, subWork: 4,
  },
  {
    id: 'newcastlemax', name: 'Newcastlemax', type: 'Newcastlemax',
    dwt: 185_000, draft: 18.5, tpc: 132,
    fullBallast: 14.5, fullLaden: 14, ecoBallast: 12, ecoLaden: 11.5,
    mainBallast: 50, mainLaden: 58, mainIdle: 4, mainWork: 8,
    subSea: 0.15, subIdle: 2.5, subWork: 4,
  },
  {
    id: 'vloc', name: 'VLOC (Very Large Ore Carrier)', type: 'VLOC',
    dwt: 325_000, draft: 23.0, tpc: 180,
    fullBallast: 14.5, fullLaden: 13.5, ecoBallast: 11.5, ecoLaden: 11,
    mainBallast: 62, mainLaden: 74, mainIdle: 5, mainWork: 10,
    subSea: 0.2, subIdle: 3, subWork: 5,
  },
];
