import { api } from './client';

export interface BackendSetting {
  key: string;
  valueJson: string;
  updatedAt: string;
}

export interface ImoShipData {
  imo?: string;
  name?: string;
  vesselType?: string;
  statcode5?: string;
  statcode5Desc?: string;
  builderName?: string;
  builderCountry?: string;
  builtYear?: string;
  gt?: string;
  lengthBp?: string;
  lengthOverall?: string;
  depth?: string;
  breadthMoulded?: string;
  deadweight?: string;
  displacement?: string;
  draught?: string;
  hullType?: string;
  holds?: string;
  teu?: string;
  gasCapacity?: string;
  engineBuilder?: string;
  engineDesign?: string;
  engineModel?: string;
  enginesRpm?: string;
  totalKwMainEng?: string;
  fuelConsMainEng?: string;
  auxEngineTotalKw?: string;
  generatorsKw?: string;
  classSociety?: string;
  flag?: string;
  owner?: string;
  operator?: string;
}

export interface PortData {
  portName?: string;
  portCode?: string;
  unLocode?: string;
  country?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  portType?: string;
  isRiver?: boolean;
  isCanalEntrance?: boolean;
  facilities?: string;
  remarks?: string;
}

export const settingsApi = {
  get: (key: string) => api.get<BackendSetting>(`/api/settings/${encodeURIComponent(key)}`),
  put: (key: string, value: unknown) =>
    api.put<BackendSetting>(`/api/settings/${encodeURIComponent(key)}`, { valueJson: JSON.stringify(value) }),
  saveImoShips: (ships: ImoShipData[]) =>
    api.post<{ success: boolean; message: string; data: number }>('/api/settings/master-data/imo-ships', { ships }),
  savePorts: (ports: PortData[]) =>
    api.post<{ success: boolean; message: string; data: number }>('/api/settings/master-data/ports', { ports }),
};

const LOCAL_SETTING_MIGRATIONS: Array<[string, string]> = [
  ['fv.emailTemplates', 'emailTemplates'],
  ['fv.emailDistributionLists', 'emailDistributionLists'],
  ['fv.estimationOptions', 'estimationOptions'],
  ['fv.savedPorts', 'savedPorts'],
  ['fv.savedPassages', 'savedPassages'],
  ['fv.cargoMaster', 'cargoMaster'],
  ['fv.areaConstraints.deleted', 'areaConstraints.deleted'],
];

async function defaultSettingValue(settingKey: string): Promise<unknown> {
  if (settingKey === 'emailTemplates') return (await import('../data/emailTemplates')).loadEmailTemplates();
  if (settingKey === 'estimationOptions') return (await import('../data/estimationOptions')).getEstimationOptions();
  if (settingKey === 'cargoMaster') return (await import('../data/cargoMaster')).getCargoMaster();
  if (settingKey === 'savedPassages') return (await import('../data/savedPassages')).loadBundledSavedPassages();
  return [];
}

/** Move legacy local settings into the authenticated tenant database once. */
export async function migrateLocalSettingsToDatabase(): Promise<void> {
  for (const [localKey, settingKey] of LOCAL_SETTING_MIGRATIONS) {
    const raw = window.localStorage.getItem(localKey);
    try {
      await settingsApi.get(settingKey);
    } catch {
      try {
        await settingsApi.put(settingKey, raw ? JSON.parse(raw) : await defaultSettingValue(settingKey));
      } catch {
        // Keep local data when the API is unavailable.
      }
    }
  }
}
