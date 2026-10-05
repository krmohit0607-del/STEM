/**
 * Master Data Sync — saves bundled IMO ship database and World Port Index
 * from JSON files to the backend database for persistence and multi-tenant
 * sharing.
 *
 * Call this once per tenant to populate the backend with reference data.
 */

import { settingsApi, type ImoShipData, type PortData } from '../api/settingsApi';
import { loadImoDatabase } from './imoShipDatabase';
import { loadPortIndex } from './portIndex';

export interface MasterDataSyncResult {
  imoShipsCount: number;
  portsCount: number;
  errors: string[];
}

/**
 * Transform IMO database rows into DTOs for backend storage.
 */
async function extractImoShips(): Promise<ImoShipData[]> {
  try {
    const db = await loadImoDatabase();
    if (!db || !db.rows) return [];

    const fieldMap: { [key: string]: number } = {};
    db.fields.forEach((field: string, idx: number) => {
      fieldMap[field.toLowerCase()] = idx;
    });

    return db.rows.slice(0, 1000).map((row: string[]) => ({
      imo: row[fieldMap['imo'] ?? 0],
      name: row[fieldMap['name'] ?? 1],
      vesselType: row[fieldMap['vesseltype'] ?? fieldMap['type'] ?? 2],
      statcode5: row[fieldMap['statcode5'] ?? 3],
      statcode5Desc: row[fieldMap['statcode5desc'] ?? 4],
      builderName: row[fieldMap['buildername'] ?? 5],
      builderCountry: row[fieldMap['buildercountry'] ?? 6],
      builtYear: row[fieldMap['builtyear'] ?? 7],
      gt: row[fieldMap['gt'] ?? 8],
      lengthBp: row[fieldMap['lengthbp'] ?? 9],
      lengthOverall: row[fieldMap['lengtho'] ?? 10],
      depth: row[fieldMap['depth'] ?? 11],
      breadthMoulded: row[fieldMap['breadth'] ?? 12],
      deadweight: row[fieldMap['deadweight'] ?? fieldMap['dwt'] ?? 13],
      displacement: row[fieldMap['displacement'] ?? 14],
      draught: row[fieldMap['draught'] ?? 15],
      hullType: row[fieldMap['hulltype'] ?? 16],
      holds: row[fieldMap['holds'] ?? 17],
      teu: row[fieldMap['teu'] ?? 18],
      gasCapacity: row[fieldMap['gascapacity'] ?? 19],
      engineBuilder: row[fieldMap['enginebuilder'] ?? 20],
      engineDesign: row[fieldMap['enginedesign'] ?? 21],
      engineModel: row[fieldMap['enginemodel'] ?? 22],
      enginesRpm: row[fieldMap['enginesrpm'] ?? 23],
      totalKwMainEng: row[fieldMap['totalkwmaineeng'] ?? 24],
      fuelConsMainEng: row[fieldMap['fuelconsmaineeng'] ?? 25],
      auxEngineTotalKw: row[fieldMap['auxenginetotalkw'] ?? 26],
      generatorsKw: row[fieldMap['generatorskw'] ?? 27],
      classSociety: row[fieldMap['classsociety'] ?? 28],
      flag: row[fieldMap['flag'] ?? 29],
      owner: row[fieldMap['owner'] ?? 30],
      operator: row[fieldMap['operator'] ?? 31],
    }));
  } catch (err) {
    console.error('Failed to extract IMO ships:', err);
    return [];
  }
}

/**
 * Transform port index rows into DTOs for backend storage.
 */
async function extractPorts(): Promise<PortData[]> {
  try {
    const db = await loadPortIndex();
    if (!db || !db.rows) return [];

    const fieldMap: { [key: string]: number } = {};
    db.fields.forEach((field: string, idx: number) => {
      fieldMap[field.toLowerCase()] = idx;
    });

    return db.rows.slice(0, 1000).map((row: string[]) => ({
      portName: row[fieldMap['portname'] ?? fieldMap['name'] ?? 0],
      portCode: row[fieldMap['portcode'] ?? fieldMap['code'] ?? 1],
      unLocode: row[fieldMap['unlocode'] ?? 2],
      country: row[fieldMap['country'] ?? 3],
      region: row[fieldMap['region'] ?? 4],
      latitude: row[fieldMap['latitude'] ?? 5] ? parseFloat(row[fieldMap['latitude'] ?? 5]) : undefined,
      longitude: row[fieldMap['longitude'] ?? 6] ? parseFloat(row[fieldMap['longitude'] ?? 6]) : undefined,
      portType: row[fieldMap['porttype'] ?? 7],
      isRiver: row[fieldMap['isriver'] ?? 8] === 'true' || row[fieldMap['isriver'] ?? 8] === '1',
      isCanalEntrance: row[fieldMap['iscanalentrance'] ?? 9] === 'true' || row[fieldMap['iscanalentrance'] ?? 9] === '1',
      facilities: row[fieldMap['facilities'] ?? 10],
      remarks: row[fieldMap['remarks'] ?? 11],
    }));
  } catch (err) {
    console.error('Failed to extract ports:', err);
    return [];
  }
}

/**
 * Sync master data from bundled JSON files to backend database.
 * Returns count of records saved and any errors encountered.
 */
export async function syncMasterDataToBackend(): Promise<MasterDataSyncResult> {
  const errors: string[] = [];
  let imoShipsCount = 0;
  let portsCount = 0;

  try {
    // Extract and save IMO ships
    const imoShips = await extractImoShips();
    if (imoShips.length > 0) {
      try {
        const response = await settingsApi.saveImoShips(imoShips);
        if (typeof response.data === 'number') {
          imoShipsCount = response.data;
        } else {
          errors.push('Failed to save IMO ships: unexpected response format');
        }
      } catch (err: any) {
        errors.push(`Failed to save IMO ships: ${err?.message || String(err)}`);
      }
    } else {
      errors.push('No IMO ships found to save');
    }

    // Extract and save ports
    const ports = await extractPorts();
    if (ports.length > 0) {
      try {
        const response = await settingsApi.savePorts(ports);
        if (typeof response.data === 'number') {
          portsCount = response.data;
        } else {
          errors.push('Failed to save ports: unexpected response format');
        }
      } catch (err: any) {
        errors.push(`Failed to save ports: ${err?.message || String(err)}`);
      }
    } else {
      errors.push('No ports found to save');
    }
  } catch (err: any) {
    errors.push(`Master data sync failed: ${err?.message || String(err)}`);
  }

  return { imoShipsCount, portsCount, errors };
}


