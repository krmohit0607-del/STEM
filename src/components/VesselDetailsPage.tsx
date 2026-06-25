import { useSelectedVoyage } from '../data/selectedVoyage';
import { getVesselDetails } from '../data/voyageDetails';
import { DetailCard, DetailPage, Info, NoVoyage } from './DetailPrimitives';

/**
 * Vessel Details page — `/vessel`.
 *
 * Shows all particulars for the vessel on the currently open voyage:
 * identity, dimensions, machinery and compliance. Data is derived from the
 * selected `Voyage` so it stays consistent with the Voyage / Client /
 * Email / Passage detail pages.
 */
export function VesselDetailsPage() {
  const voyage = useSelectedVoyage();

  if (!voyage) {
    return (
      <DetailPage icon="fa-ship" title="Vessel Details" current="/vessel">
        <NoVoyage voyage={voyage} />
      </DetailPage>
    );
  }

  const v = getVesselDetails(voyage);

  return (
    <DetailPage icon="fa-ship" title="Vessel Details" current="/vessel">
      <DetailCard number={1} title="IDENTIFICATION">
        <div className="fv-voyage__grid fv-voyage__grid--3">
          <Info label="Vessel Name" value={v.vesselName} />
          <Info label="IMO Number" value={v.imo} />
          <Info label="MMSI" value={v.mmsi} />
          <Info label="Call Sign" value={v.callSign} />
          <Info label="Vessel Type" value={v.vesselType} />
          <Info label="Flag" value={v.flag} />
          <Info label="Port of Registry" value={v.portOfRegistry} />
          <Info label="Class Society" value={v.classSociety} />
          <Info label="AIS Provider" value={v.aisProvider} />
        </div>
      </DetailCard>

      <DetailCard number={2} title="OWNERSHIP & BUILD">
        <div className="fv-voyage__grid fv-voyage__grid--3">
          <Info label="Registered Owner" value={v.owner} />
          <Info label="Technical Manager" value={v.manager} />
          <Info label="Builder" value={v.builder} />
          <Info label="Year Built" value={v.built} />
        </div>
      </DetailCard>

      <DetailCard number={3} title="DIMENSIONS & TONNAGE">
        <div className="fv-voyage__grid fv-voyage__grid--3">
          <Info label="DWT" value={v.dwt} />
          <Info label="Gross Tonnage" value={v.gt} />
          <Info label="Net Tonnage" value={v.nrt} />
          <Info label="LOA" value={v.loa} />
          <Info label="Beam" value={v.beam} />
          <Info label="Summer Draft" value={v.summerDraft} />
        </div>
      </DetailCard>

      <DetailCard number={4} title="MACHINERY & COMPLIANCE">
        <div className="fv-voyage__grid fv-voyage__grid--3">
          <Info label="Main Engine" value={v.meType} />
          <Info label="Engine Power" value={v.enginePower} />
          <Info label="ECDIS Model" value={v.ecdisModel} />
          <Info label="Scrubber Fitted" value={v.scrubber} />
          <Info label="EGCS Type" value={v.egcsType} />
          <Info label="CII Rating" value={v.ciiRating} />
        </div>
      </DetailCard>
    </DetailPage>
  );
}
