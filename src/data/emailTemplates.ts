/**
 * Email routing templates shown in Settings → Email Templates.
 *
 * Sourced from the operations "Templates" document. Placeholders in
 * [square brackets] or XX form are filled in by the operator when composing.
 *
 * Voyage-aware auto tokens use double braces, e.g. {{vessel}} / {{portTo}}.
 * These are substituted with the selected voyage's live data when composing
 * from the header "Generate Comms" dialog (see {@link applyVoyageTokens}).
 */

import type { Voyage } from './voyages';
import { VOYAGES } from './voyages';
import { ACCOUNT_TYPES, SERVICE_PROVIDER_TYPES, loadClients } from './clients';
import { getAccountTxns } from './accounts';
import { getBunkerRequirements } from './bunker';
import { loadOpsRecap } from './opsRecap';
import { loadEmissionsDoc } from './emissions';

/**
 * A recipient type kept in a template's To / CC field. One of:
 * - 'Account' — the voyage's account / charterer
 * - 'Vessel'  — the vessel (master)
 * - a service-provider type sourced from the Service Provider Details.
 */
export type EmailRecipientType = string;
export const EMAIL_RECIPIENT_TYPES: EmailRecipientType[] = [
  'Account',
  'Vessel',
  ...SERVICE_PROVIDER_TYPES,
];

/** A file attached to a template (stored inline as a base64 data URL). */
export interface EmailAttachment {
  name: string;
  type: string;
  dataUrl: string;
}

export interface EmailTemplate {
  id: string;
  /** Main category (required). */
  category: string;
  /** Sub category — empty string means "None" (fall back to main category). */
  subCategory?: string;
  /** Sub-sub category — empty string means "None". */
  subSubCategory?: string;
  /** Recipient types kept in the "To" field (Account / Vessel / service-provider type). */
  to?: EmailRecipientType[];
  /** Recipient types to keep in copy (CC). */
  cc?: EmailRecipientType[];
  /** Files sent as attachments when composing from this template. */
  attachments?: EmailAttachment[];
  title: string;
  /** Email subject line (supports {{tokens}}); falls back to vessel + title. */
  subject?: string;
  /** Email body — HTML (rich text). Legacy templates may hold plain text. */
  body: string;
}

export interface EmailDistributionList {
  id: string;
  name: string;
  recipients: { company: string; email: string }[];
}

const DISTRIBUTION_LISTS_KEY = 'fv.emailDistributionLists';

export function loadEmailDistributionLists(): EmailDistributionList[] {
  try {
    const raw = window.localStorage.getItem(DISTRIBUTION_LISTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (typeof item !== 'object' || item === null || typeof (item as EmailDistributionList).id !== 'string') return [];
      const value = item as Partial<EmailDistributionList> & { company?: string; emails?: string[] };
      if (typeof value.name === 'string' && Array.isArray(value.recipients)) return [{ id: value.id!, name: value.name, recipients: value.recipients.filter((r) => typeof r?.company === 'string' && typeof r?.email === 'string') }];
      if (typeof value.company === 'string' && Array.isArray(value.emails)) return [{ id: value.id!, name: value.company, recipients: value.emails.filter((email) => typeof email === 'string').map((email) => ({ company: '', email })) }];
      return [];
    });
  } catch {
    return [];
  }
}

export function saveEmailDistributionLists(lists: EmailDistributionList[]): void {
  try { window.localStorage.setItem(DISTRIBUTION_LISTS_KEY, JSON.stringify(lists)); } catch { /* ignore */ }
}

export function newDistributionListId(): string {
  return `dist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const EMAIL_TEMPLATE_CATEGORIES = [
  'Voyage Ops',
  'Deferrals',
  'Monitoring & Suggestions',
  'Navwarning',
  'AIS & Position',
  'Constraints (RTA / Speed / MCR)',
  'Route & Deviation',
  'Weather Synopsis',
  'Ice',
] as const;

/** Main-category options for email templates (same as {@link EMAIL_TEMPLATE_CATEGORIES}). */
export const EMAIL_MAIN_CATEGORIES = EMAIL_TEMPLATE_CATEGORIES;

/** Sub-category options. Detailed list to be provided later; '' = None. */
export const EMAIL_SUB_CATEGORIES: string[] = [];

/** Sub-sub-category options. Detailed list to be provided later; '' = None. */
export const EMAIL_SUB_SUB_CATEGORIES: string[] = [];

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  // --- Voyage Ops (voyage-aware examples using {{tokens}}) -------------------
  {
    id: 'voy-noon-request',
    category: 'Voyage Ops',
    subCategory: 'Reports',
    subSubCategory: 'Noon Report',
    to: ['Vessel'],
    title: 'Noon Report Request',
    subject: '{{vessel}} — Noon Report Request (Voyage {{voyageNo}})',
    body:
      'Dear Master,\n\nGood day from ODAS routing desk.\n\nKindly send today\u2019s noon report for {{vessel}} (IMO {{imo}}) on voyage {{voyageNo}} from {{portFrom}} to {{portTo}}.\n\nCurrent ETA {{portTo}}: {{eta}}.\n\nBest regards,\nODAS Operations',
  },
  {
    id: 'voy-eta-update',
    category: 'Voyage Ops',
    subCategory: 'Charterer Updates',
    subSubCategory: 'ETA Update',
    to: ['Account'],
    title: 'ETA Update to Charterer',
    subject: '{{vessel}} — ETA {{portTo}}: {{eta}}',
    body:
      'Dear Charterer,\n\nPlease find the latest voyage update for {{vessel}} ({{vesselType}}, {{dwt}}).\n\nRoute: {{route}}\nCurrent ETA {{portTo}}: {{eta}}\nLast noon report: {{lastNoon}}\n\nWe will continue to keep you advised.\n\nRegards,\n{{pic}}\nODAS Operations',
  },
  {
    id: 'voy-agent-appointment',
    category: 'Voyage Ops',
    subCategory: 'Agency',
    subSubCategory: 'Appointment',
    to: ['Account'],
    title: 'Agent / Service Appointment',
    subject: '{{vessel}} — Appointment at {{portTo}} (Voyage {{voyageNo}})',
    body:
      'Dear Sirs,\n\nWe confirm the appointment for {{vessel}} (IMO {{imo}}) calling {{portTo}} on voyage {{voyageNo}}.\n\nETA {{portTo}}: {{eta}}\n\nKindly acknowledge and advise berthing prospects.\n\nBest regards,\n{{pic}}\nODAS Operations',
  },

  // --- Deferrals -------------------------------------------------------------
  {
    id: 'defer-blowers',
    category: 'Deferrals',
    title: 'Defer to your Expertise: Blowers turning on/off',
    body:
      'We continue to defer to your expertise to adjust the settings +/- 1rpm above to avoid blowers turning on/off',
  },
  {
    id: 'defer-heavy-wx',
    category: 'Deferrals',
    title: 'Defer to your Expertise: Heavy WX',
    body:
      'We defer to your expertise to adjust speed and course for best handling and safety of crew and cargo during this time.',
  },
  {
    id: 'defer-maneuvering',
    category: 'Deferrals',
    title: 'Defer to your Expertise: Maneuvering',
    body:
      'Please note that we defer to your expertise, especially in the following areas: marine traffic avoidance, object avoidance in accordance with nautical charts (wrecks, dump ground sites, etc.) and vessel maneuvering.',
  },
  {
    id: 'defer-speed-test',
    category: 'Deferrals',
    title: 'Defer to Captain setting RPM for speed test',
    body:
      'Please note: We understand vessel is performing speed test. We defer to your expertise to adjust RPM in order to perform speed test. Please kindly confirm once speed test is complete.',
  },

  // --- Monitoring & Suggestions ---------------------------------------------
  {
    id: 'monitor-long-range',
    category: 'Monitoring & Suggestions',
    title: 'Monitor long range forecast',
    body:
      'Synopsis: Relatively light to moderate conditions expected over the next several days. Then we will monitor the longer range forecast and will keep you advised with updates as confidence continues to increase.',
  },
  {
    id: 'continue-monitor',
    category: 'Monitoring & Suggestions',
    title: 'We will continue to monitor',
    body:
      'We will continue to monitor the forecast over the coming days and keep you well informed with updates.',
  },
  {
    id: 'route-ahead-9am',
    category: 'Monitoring & Suggestions',
    title: 'Suggesting Route ahead of 9amLT',
    body:
      'We are sending route suggestion to your good vessel ahead of 9amLT for your earlier review.',
  },
  {
    id: 'suggestion',
    category: 'Monitoring & Suggestions',
    title: 'Suggestion',
    body:
      'Synopsis:\n\nPlease use the link below to view a comparison in ODAS:\nStem COMPARISON LINK',
  },
  {
    id: 'followed-yesterday',
    category: 'Monitoring & Suggestions',
    title: "Followed yesterday's suggestion",
    body:
      "Synopsis: Many thanks for following yesterday's route suggestion. We continue to suggest this route in order to position vessel [DIRECTION] of heavier weather associated with [SYSTEM].",
  },
  {
    id: 'substitute-9am',
    category: 'Monitoring & Suggestions',
    title: 'This will substitute 9am guidance',
    body:
      "This will substitute regular guidance if vessel's 9am LT is in less than 8 hours.",
  },
  {
    id: 'speed-trials-window',
    category: 'Monitoring & Suggestions',
    title: 'Optimal timeframe for speed trials',
    body:
      'Based on the latest forecast, the optimal timeframe to perform speed trials are from [date/time] to [date/time].',
  },

  // --- Navwarning ------------------------------------------------------------
  {
    id: 'navwarning-active',
    category: 'Navwarning',
    title: 'Advisory: Navwarning along Active route / 72-24 hours out',
    body:
      'Advisory: Your route converges with [navwarning type] Navwarning [Navwarning Number] on [convergence date]. We defer to your expertise for avoidance and kindly ask you update your route in ODAS if required.\nIf no response to this advisory received, will assume sailing through Navwarning is acceptable.',
  },
  {
    id: 'navwarning-suggested',
    category: 'Navwarning',
    title: 'Advisory: Navwarning along Suggested route / 72-24 hours out',
    body:
      'Advisory: Our suggested route converges with [Navwarning type] Navwarning [Navwarning Number] on [convergence date]. If you intend to follow our suggested route, but sailing through Navwarning is unacceptable, we defer to your expertise to adjust our suggested route to avoid Navwarning area as needed.\nIf no response to this advisory received, will assume sailing through Navwarning is acceptable.',
  },
  {
    id: 'navwarning-ecdis',
    category: 'Navwarning',
    title: 'ECDIS navwarnings marginally different from ODAS',
    body:
      'Good Day Captain,\n\nMany thanks for your feedback, it will be used to improve navwarnings in ODAS.\n\nOur navwarnings are meant to supplement navwarnings found in your onboard ECDIS, as our navwarnings do not include information from Navtex. Should discrepancies exist between navwarnings in ODAS and navwarnings in your onboard ECDIS, navwarnings in your onboard ECDIS should be treated as a source of truth.\n\nWe will always defer to your expertise to determine what navwarnings are not safe to sail and to adjust course for avoidance as necessary. We welcome any questions or concerns you may have.',
  },
  {
    id: 'ngz-callout',
    category: 'Navwarning',
    title: 'NGZ Callout',
    body:
      'Advisory: We note that present route converges with MOL No-Go Zone: [Name of NGZ]. Please kindly confirm vessel intends to sail via this area or provide updated intentions as needed. If no response to this advisory is received, will assume No-Go Zone is not a factor and vessel intends to continue sailing along present route.',
  },

  // --- AIS & Position --------------------------------------------------------
  {
    id: 'ais-gap',
    category: 'AIS & Position',
    title: 'AIS Gap Callout / Position Request',
    body:
      "We note that vessel AIS positions are not updated on our system for your good vessel. Kindly confirm AIS operational status or if you are facing any limitations. Due to this, please be informed there may be discrepancy between forecasted weather.\n\nRegret the inconvenience and request to kindly provide the following for us to update the vessel's latest position. Date/Time, lat/long and Course/Speed.",
  },
  {
    id: 'position-request-ais-ok',
    category: 'AIS & Position',
    title: 'Position Request - Capt confirmed their AIS is working',
    body:
      "Many thanks for your confirmation that your AIS system is working in good order. Note that vessel's latest position has not yet updated within our system and kindly request you to provide the following for us to update the vessel's position within ODAS:\n\nUTC Date/Time -\nlat/long -\nCourse/Speed -",
  },
  {
    id: 'persian-gulf-ais',
    category: 'AIS & Position',
    title: 'Persian Gulf AIS/GPS Issues',
    body:
      'Due to ongoing heightened security risks and persistent GPS spoofing/interference in the Persian Gulf, Straits of Hormuz, and Gulf of Oman, optimization opportunities in this region are limited.\nDue to potential AIS unreliability, noon positions reported by the vessel will be prioritized during this leg.\n\nWe defer to your expertise and any instructions from operators for safe operational settings and navigational requirements for vessel safety and security in the region. Please keep us well advised of your sailing intentions so that we can best support your vessel.\nRouting optimization will resume after clearing the high-risk zone, typically once the vessel has entered the Arabian Sea.',
  },

  // --- Constraints (RTA / Speed / MCR) --------------------------------------
  {
    id: 'rta-email',
    category: 'Constraints (RTA / Speed / MCR)',
    title: 'RTA updated by Capt by email',
    body:
      'Well noted your updated RTA of XXXX. We have input this RTA into ODAS on your behalf. Please see below fresh guidance for your reference:',
  },
  {
    id: 'rta-wf',
    category: 'Constraints (RTA / Speed / MCR)',
    title: 'RTA updated by Capt in WF',
    body:
      'Well noted that RTA of XXXX has been updated in ODAS. Below guidance and guidance generated hereafter will apply this RTA unless otherwise advised. Operators RIC, please be advised.',
  },
  {
    id: 'speedcons-email',
    category: 'Constraints (RTA / Speed / MCR)',
    title: 'Speed/Cons updated by Capt in email',
    body:
      'Well noted your updated speed and consumption constraint of XXkts and XXmt. We have input this constraint into ODAS on your behalf. Please see below fresh guidance for your reference:',
  },
  {
    id: 'speedcons-wf',
    category: 'Constraints (RTA / Speed / MCR)',
    title: 'Speed/Cons updated by Capt in WF',
    body:
      'Well noted that speed and consumption constraint of XXkts and XXmt have been updated in ODAS. Below guidance and guidance generated hereafter will apply this constraint unless otherwise advised. Operators RIC, please be advised.',
  },
  {
    id: 'shoreside-removes-rta',
    category: 'Constraints (RTA / Speed / MCR)',
    title: 'Shoreside Removes RTA',
    body:
      "Please note that ODAS's RTA has been removed by operators. Below guidance and guidance generated hereafter will apply no constraints unless otherwise advised by operators.",
  },
  {
    id: 'assumed-rta',
    category: 'Constraints (RTA / Speed / MCR)',
    title: 'Assumed RTA constraint',
    body:
      'Please Note: We have applied vessel\u2019s ETA from route import of [DATE/TIME] as an RTA, as no RTA or speed constraint has been input into ODAS. Below and future guidance will be generated to make this RTA unless otherwise advised. Please kindly confirm all is in good order.',
  },
  {
    id: 'rta-cant-be-met-cons',
    category: 'Constraints (RTA / Speed / MCR)',
    title: "RTA Can't be met due to Consumption constraint",
    body:
      'Operator in Copy:\nPlease be advised that RTA cannot be met due to consumption constraint of xx mt. Please kindly confirm if RTA or consumption constraints should be amended.',
  },
  {
    id: 'blower-range-mcr',
    category: 'Constraints (RTA / Speed / MCR)',
    title: "Can't sail instructed MCR due to blower on/off range",
    body:
      'Please note:\nInstructed MCR of XX% cannot be reached as this correlates with an RPM in your blower on/off range we have on file of XX-XX RPM. Therefore, we have provided guidance below this range at XX RPM. Please kindly review and confirm your blower on/off range or MCR instruction.',
  },

  // --- Route & Deviation -----------------------------------------------------
  {
    id: 'assumed-track',
    category: 'Route & Deviation',
    title: 'Assumed track, Adjusted route',
    body:
      "We note vessel is sailing [direction] of expected track. We have adjusted the route in ODAS along an assumed track. This is not a route suggestion and we kindly ask you import an updated route if your intended route differs greatly from the assumed route in ODAS.\n\nIf having connectivity issues and can\u2019t access ODAS, please provide your latest route file in email and we will input into ODAS on your behalf.",
  },
  {
    id: 'noted-deviation',
    category: 'Route & Deviation',
    title: 'Noted a Deviation, Please Import',
    body:
      'We have noticed a [add direction] deviation from your active route as it exists in ODAS. Although ODAS shows a tentative re-entry path to that original route, we defer to your expertise in regards to hazard avoidance and general vessel maneuvering.\n\nIf your intended route has significantly changed, please kindly import your newest intentions into ODAS so that we may provide the most accurate weather and route guidance.',
  },
  {
    id: 'alt-route-unacceptable-wx',
    category: 'Route & Deviation',
    title: 'Alt Route if wx is unacceptable',
    body:
      'If these conditions are deemed unacceptable, vessel could sail via an alternative route displayed in below comparison link. Please kindly review and confirm your sailing intentions with any questions or comments.\n\nStem COMPARISON LINK',
  },
  {
    id: 'multiple-options',
    category: 'Route & Deviation',
    title: 'Multiple Options Presented',
    body:
      'Please see the ODAS COMPARISON LINK displaying our updated analysis for possible avoidance strategies with below descriptions. Please review and advise your preference as well as any questions or comments.\n\nPresent Route (Black): route description\nAlternate Route 1 (Orange): route description\nAlternate Route 2 (Green): route description\nAlternate Route 3 (Purple): route description',
  },

  // --- Weather Synopsis ------------------------------------------------------
  {
    id: 'heavy-weather-advisory',
    category: 'Weather Synopsis',
    title: 'Heavy Weather Advisory',
    body:
      "Synopsis: A developing [low pressure system/frontal activity/monsoon influence] over [area] is currently generating [strong winds/high seas/heavy swell] affecting the vessel's intended route. The most adverse conditions are forecast around [location] during [time period], with conditions expected to remain [moderate/severe] due to [reason]. Improvement is anticipated after [time/date] as the weather system progresses away from the area and seas gradually subside. Kindly adjust speed/course as appropriate for the safety of crew and cargo. We remain closely monitoring the weather and will keep you advised of any further developments.",
  },
  {
    id: 'moderate-weather-short',
    category: 'Weather Synopsis',
    title: 'Moderate weather for short duration',
    body:
      "Based on the latest forecast, conditions are expected to briefly intensify around tomorrow evening, with significant wave heights forecast to reach approximately 4m.\nHowever, these enhanced conditions are presently expected to persist only for a relatively short duration of approximately 6-8 hours, following which conditions are forecast to gradually ease again as the low-pressure system progresses further away from the region.\n\nWe defer to your expertise to adjust speed and/or course as necessary to minimize the risk of rolling and positioning the vessel to ensure the crew's and cargo's safety.\n\nWe remain closely monitoring forecast developments and will continue to keep you well advised.",
  },
  {
    id: 'route-optimization-advisory',
    category: 'Weather Synopsis',
    title: 'Route Optimization Advisory',
    body:
      'Synopsis: Following latest voyage and weather assessment, a revised routing option via [route/waypoints] is recommended to optimize overall passage efficiency and commercial performance. The adjusted route is expected to reduce exposure to [adverse weather/current influence/congestion] near [location] during [time period], while providing comparatively favorable conditions along the transit.\nBased on present calculations, the revised routing may result in improved fuel efficiency and enhanced ETA reliability, with estimated savings of approximately [X MT fuel/X hours] subject to prevailing conditions and vessel performance.',
  },
  {
    id: 'routing-weather-synopsis',
    category: 'Weather Synopsis',
    title: 'Routing Weather Synopsis',
    body:
      'Synopsis:\nCurrent observations indicate [winds/seas/swell/weather] affecting the area between [locations/coordinates] due to [weather system]. The vessel is expected to encounter the most unfavorable conditions near [area] during [timeframe], after which weather and sea conditions are forecast to improve gradually upon entering [area]. The deterioration is mainly associated with [reason], while improvement is expected as [system movement/change]. We are continuously monitoring the latest forecasts and will provide further advisory should any significant changes impact the voyage.',
  },

  // --- Ice -------------------------------------------------------------------
  {
    id: 'ack-mi-through-ice',
    category: 'Ice',
    title: 'Ack MI through Ice',
    body:
      'Well noted your intentions with regards to icebergs and confirm we will comply with your intended route at this time for the safety of your vessel. We will also reach out to operators to clarify procedures for navigation within these areas going forward.',
  },
  {
    id: 'ice-accretion-risk',
    category: 'Ice',
    title: 'Ice Accretion Risk',
    body:
      "Forecast conditions along the intended route indicate a risk of [Severity: Light / Moderate / Heavy / Extreme] ice accretion, along the route from [start date/time] to [end date/time], due to low air temperatures and freezing spray. We recommend maintaining heightened awareness for potential ice buildup on exposed decks and superstructure.\nWe defer to Master's expertise in taking precautions in line with Company SOPs, including monitoring vessel maneuverability, ensuring critical equipment remains clear of ice, and adjusting speed and/or heading where practicable to limit ice accumulation.",
  },
  {
    id: 'iceberg-comms',
    category: 'Ice',
    title: 'Iceberg/Sea Ice Comms',
    body:
      'Advisory: Your route converges with region of potential known [icebergs or sea ice] on [convergence date]. Please see attached ice chart and bulletin for your reference.\n\nWe defer to your expertise for adjusting course and speed as needed to avoid any [icebergs or sea ice]. If this route is unacceptable, we kindly ask you import an updated route into ODAS.\nIf no response to this advisory received, we will assume sailing along present route is acceptable.',
  },
];

// --- Persistence -------------------------------------------------------------
// User edits (add / update / delete) are stored in localStorage and layered
// over the built-in defaults above, so the seed list can grow over time.

const STORAGE_KEY = 'fv.emailTemplates';

export function loadEmailTemplates(): EmailTemplate[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...EMAIL_TEMPLATES];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(isEmailTemplate)) {
      return (parsed as EmailTemplate[]).map((t) => {
        // Migrate legacy single `recipient` → `to[]`, and 'Master' → 'Vessel'.
        const legacyRecipient = (t as { recipient?: string }).recipient;
        return {
          ...t,
          subCategory: t.subCategory ?? '',
          subSubCategory: t.subSubCategory ?? '',
          to: normalizeRecipientList(t.to ?? (legacyRecipient ? [legacyRecipient] : [])),
          cc: normalizeRecipientList(t.cc ?? []),
        };
      });
    }
  } catch {
    /* fall back to defaults */
  }
  return [...EMAIL_TEMPLATES];
}

export function saveEmailTemplates(templates: EmailTemplate[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    /* storage unavailable — ignore */
  }
}

export function resetEmailTemplates(): EmailTemplate[] {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return [...EMAIL_TEMPLATES];
}

export function newTemplateId(): string {
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// --- Shared module auto-tokens ----------------------------------------------
// These fields are available to templates generated from any module. The
// module prefix in each label keeps similarly named fields distinguishable.
const MODULE_EMAIL_TOKENS: [string, string][] = [
  ...[
    ['{{voyageId}}', 'Voyage: internal ID'], ['{{vesselName}}', 'Operations: vessel name'], ['{{vesselEmail}}', 'Operations: vessel email'],
    ['{{voyageFixType}}', 'Operations: voyage fix type'], ['{{owners}}', 'Operations: owners'], ['{{cpDate}}', 'Operations: CP date'],
    ['{{laycanStart}}', 'Operations: laycan start'], ['{{laycanEnd}}', 'Operations: laycan end'], ['{{ownersBroker}}', 'Operations: owners broker'],
    ['{{hirePerDay}}', 'Operations: hire per day'], ['{{charterers}}', 'Operations: charterers'], ['{{charterersCpDate}}', 'Operations: charterers CP date'],
    ['{{charterersLaycanStart}}', 'Operations: charterers laycan start'], ['{{charterersLaycanEnd}}', 'Operations: charterers laycan end'], ['{{charterersBroker}}', 'Operations: charterers broker'],
    ['{{freightPerMt}}', 'Operations: freight per MT'], ['{{demDespatch}}', 'Operations: demurrage / despatch'], ['{{deliveryPort}}', 'Operations: delivery port'],
    ['{{deliveryDateTime}}', 'Operations: delivery date/time'], ['{{redeliveryPort}}', 'Operations: redelivery port'], ['{{redeliveryDateTime}}', 'Operations: redelivery date/time'],
    ['{{cargoName}}', 'Operations: cargo name'], ['{{cpQuantity}}', 'Operations: CP quantity'], ['{{finalQtyLoaded}}', 'Operations: final quantity loaded'],
    ['{{loadPort}}', 'Operations: load port'], ['{{loadRate}}', 'Operations: load rate'], ['{{dischargePort}}', 'Operations: discharge port'],
    ['{{dischRate}}', 'Operations: discharge rate'], ['{{frtPaymentTerms}}', 'Operations: freight payment terms'], ['{{loiStatus}}', 'Operations: LOI status'],
    ['{{foCons}}', 'Operations: FO consumption'], ['{{foPrice}}', 'Operations: FO price'], ['{{doCons}}', 'Operations: DO consumption'],
    ['{{doPrice}}', 'Operations: DO price'], ['{{portDaLoad}}', 'Operations: load port DA'], ['{{portDaDisch}}', 'Operations: discharge port DA'],
    ['{{otherCost}}', 'Operations: other cost'], ['{{miscIncome}}', 'Operations: miscellaneous income'], ['{{actualSpeed}}', 'Operations: actual speed'],
    ['{{actualFoPerDay}}', 'Operations: actual FO per day'], ['{{actualDoPerDay}}', 'Operations: actual DO per day'], ['{{charterHirePerDay}}', 'Operations: charter hire per day'],
    ['{{freightPaymentDays}}', 'Operations: freight payment days'], ['{{freightPaymentBasis}}', 'Operations: freight payment basis'], ['{{bunkerSpecs}}', 'Operations: bunker specifications'], ['{{notes}}', 'Operations: notes'],
  ] as [string, string][],
  ...[
    ['{{accountId}}', 'Accounts: transaction ID'], ['{{accountKind}}', 'Accounts: payable / receivable'], ['{{accountCategory}}', 'Accounts: category'],
    ['{{accountModule}}', 'Accounts: source module'], ['{{accountCompany}}', 'Accounts: company'], ['{{accountReference}}', 'Accounts: reference'],
    ['{{counterparty}}', 'Accounts: counterparty'], ['{{invoiceNo}}', 'Accounts: invoice number'], ['{{currency}}', 'Accounts: currency'],
    ['{{amount}}', 'Accounts: amount'], ['{{exchangeRate}}', 'Accounts: exchange rate'], ['{{invoiceDate}}', 'Accounts: invoice date'],
    ['{{dueDate}}', 'Accounts: due date'], ['{{accountStatus}}', 'Accounts: payment status'], ['{{approvalStatus}}', 'Accounts: approval status'],
    ['{{accountPriority}}', 'Accounts: priority'], ['{{bank}}', 'Accounts: bank'], ['{{paymentMethod}}', 'Accounts: payment method'],
    ['{{paymentDate}}', 'Accounts: payment date'], ['{{paymentReference}}', 'Accounts: payment reference'], ['{{accountRemarks}}', 'Accounts: remarks'],
  ] as [string, string][],
  ...[
    ['{{bunkerId}}', 'Bunker: requirement ID'], ['{{bunkerStatus}}', 'Bunker: requirement status'], ['{{bunkerReference}}', 'Bunker: reference'],
    ['{{bunkerLeg}}', 'Bunker: leg'], ['{{bunkerRoute}}', 'Bunker: route'], ['{{bunkerPort}}', 'Bunker: bunker port'], ['{{bunkerEta}}', 'Bunker: ETA'],
    ['{{requiredOn}}', 'Bunker: required on'], ['{{fuelType}}', 'Bunker: fuel type'], ['{{fuelGrade}}', 'Bunker: fuel grade'], ['{{bunkerQuantity}}', 'Bunker: quantity'],
    ['{{robArrival}}', 'Bunker: ROB on arrival'], ['{{expectedCons}}', 'Bunker: expected consumption'], ['{{supplier}}', 'Bunker: supplier'], ['{{pricePerMt}}', 'Bunker: price per MT'],
    ['{{totalCost}}', 'Bunker: total cost'], ['{{poNo}}', 'Bunker: purchase order number'], ['{{contractRef}}', 'Bunker: contract reference'], ['{{suppliedQty}}', 'Bunker: supplied quantity'],
    ['{{deliveredQty}}', 'Bunker: delivered quantity'], ['{{supplyDateTime}}', 'Bunker: supply date/time'], ['{{bunkerInvoiceNo}}', 'Bunker: invoice number'], ['{{bunkerInvoiceAmount}}', 'Bunker: invoice amount'],
    ['{{paymentTerms}}', 'Bunker: payment terms'], ['{{bunkerDueDate}}', 'Bunker: due date'], ['{{amountPaid}}', 'Bunker: amount paid'], ['{{bunkerPaymentRef}}', 'Bunker: payment reference'],
    ['{{bunkerPaymentDate}}', 'Bunker: payment date'], ['{{bunkerApprovalStatus}}', 'Bunker: approval status'], ['{{bunkerPaymentStatus}}', 'Bunker: payment status'],
  ] as [string, string][],
  ...[
    ['{{cargoId}}', 'Chartering Cargo Book: cargo ID'], ['{{commodity}}', 'Chartering Cargo Book: commodity'], ['{{cargoType}}', 'Chartering Cargo Book: cargo type'],
    ['{{cargoQuantity}}', 'Chartering Cargo Book: quantity'], ['{{cargoTolerance}}', 'Chartering Cargo Book: tolerance'], ['{{cargoLoadPort}}', 'Chartering Cargo Book: load port'],
    ['{{cargoDischargePort}}', 'Chartering Cargo Book: discharge port'], ['{{cargoLoadRate}}', 'Chartering Cargo Book: load rate'], ['{{cargoDischargeRate}}', 'Chartering Cargo Book: discharge rate'],
    ['{{cargoTerms}}', 'Chartering Cargo Book: terms'], ['{{cargoLaycanStart}}', 'Chartering Cargo Book: laycan start'], ['{{cargoLaycanEnd}}', 'Chartering Cargo Book: laycan end'],
    ['{{cargoNominationDeadline}}', 'Chartering Cargo Book: nomination deadline'], ['{{cargoStatus}}', 'Chartering Cargo Book: cargo status'], ['{{commercialStatus}}', 'Chartering: commercial status'],
    ['{{cargoAccount}}', 'Chartering Cargo Book: account'], ['{{cargoRemarks}}', 'Chartering Cargo Book: remarks'], ['{{tonnageId}}', 'Chartering Tonnage Book: tonnage ID'],
    ['{{tonnageVessel}}', 'Chartering Tonnage Book: vessel'], ['{{tonnageImo}}', 'Chartering Tonnage Book: IMO'], ['{{tonnageVesselType}}', 'Chartering Tonnage Book: vessel type'],
    ['{{tonnageDwt}}', 'Chartering Tonnage Book: DWT'], ['{{tonnageFlag}}', 'Chartering Tonnage Book: flag'], ['{{openArea}}', 'Chartering Tonnage Book: open area'],
    ['{{openPort}}', 'Chartering Tonnage Book: open port'], ['{{openDate}}', 'Chartering Tonnage Book: open date'], ['{{earliestOpen}}', 'Chartering Tonnage Book: earliest open'],
    ['{{latestOpen}}', 'Chartering Tonnage Book: latest open'], ['{{tonnageVoyageType}}', 'Chartering Tonnage Book: voyage type'], ['{{tonnageSource}}', 'Chartering Tonnage Book: source'], ['{{owner}}', 'Chartering Tonnage Book: owner'],
  ] as [string, string][],
  ...[
    ['{{reportId}}', 'Performance: report ID'], ['{{nextPort}}', 'Performance: next port'], ['{{reportType}}', 'Performance: report type'], ['{{reportDate}}', 'Performance: report date'],
    ['{{reportTime}}', 'Performance: report time'], ['{{reportHours}}', 'Performance: steaming hours'], ['{{latitude}}', 'Performance: latitude'], ['{{longitude}}', 'Performance: longitude'],
    ['{{vlsfoRob}}', 'Performance: VLSFO ROB'], ['{{vlsfoBunkered}}', 'Performance: VLSFO bunkered'], ['{{lsmgoRob}}', 'Performance: LSMGO ROB'], ['{{lsmgoBunkered}}', 'Performance: LSMGO bunkered'],
    ['{{distanceReported}}', 'Performance: distance reported'], ['{{distanceObserved}}', 'Performance: distance observed'], ['{{distanceToGo}}', 'Performance: distance to go'],
    ['{{averageSpeed}}', 'Performance: average speed'], ['{{rpm}}', 'Performance: RPM'], ['{{enginePower}}', 'Performance: engine power'], ['{{slip}}', 'Performance: slip'],
    ['{{course}}', 'Performance: course'], ['{{cargoAmount}}', 'Performance: cargo amount'], ['{{vesselWeather}}', 'Performance: vessel weather'], ['{{windFactor}}', 'Performance: wind factor'],
    ['{{waveFactor}}', 'Performance: wave factor'], ['{{currentFactor}}', 'Performance: current factor'], ['{{averageWeatherFactor}}', 'Performance: average weather factor'],
  ] as [string, string][],
  ...[
    ['{{complianceYear}}', 'Emissions: compliance year'], ['{{trade}}', 'Emissions: trade'], ['{{euaPriceEur}}', 'Emissions: EUA price'], ['{{co2AdjustmentT}}', 'Emissions: CO2 adjustment'],
    ['{{emissionsApprovedBy}}', 'Emissions: approved by'], ['{{emissionsApprovedDate}}', 'Emissions: approved date'], ['{{co2}}', 'Emissions: CO2'], ['{{co2e}}', 'Emissions: CO2e'],
    ['{{co2PerDay}}', 'Emissions: CO2 per day'], ['{{co2PerNm}}', 'Emissions: CO2 per nautical mile'], ['{{co2PerCargo}}', 'Emissions: CO2 per cargo tonne'],
    ['{{euasRequired}}', 'Emissions: EUAs required'], ['{{euaBalance}}', 'Emissions: EUA balance'], ['{{carbonCost}}', 'Emissions: carbon cost'], ['{{aer}}', 'Emissions: AER'],
    ['{{eeoi}}', 'Emissions: EEOI'], ['{{ghgIntensity}}', 'Emissions: GHG intensity'], ['{{fuelEuTarget}}', 'Emissions: FuelEU target'], ['{{complianceBalanceT}}', 'Emissions: compliance balance'], ['{{emissionsStatus}}', 'Emissions: compliance status'],
  ] as [string, string][],
];

// --- Voyage auto-tokens ------------------------------------------------------
// Templates can embed {{token}} placeholders that are replaced with the
// selected voyage's live data when composing.

/** Reference list of the auto tokens available in template bodies / titles. */
export const EMAIL_TOKENS: { token: string; label: string }[] = [
  { token: '{{vessel}}', label: 'Vessel name' },
  { token: '{{imo}}', label: 'IMO number' },
  { token: '{{voyageNo}}', label: 'Voyage / order no.' },
  { token: '{{vesselType}}', label: 'Vessel type' },
  { token: '{{flag}}', label: 'Flag' },
  { token: '{{dwt}}', label: 'Deadweight (DWT)' },
  { token: '{{client}}', label: 'Account / charterer' },
  { token: '{{pic}}', label: 'PIC (person in charge)' },
  { token: '{{portFrom}}', label: 'Departure port' },
  { token: '{{portTo}}', label: 'Arrival port' },
  { token: '{{route}}', label: 'Route (from → to)' },
  { token: '{{eta}}', label: 'ETA' },
  { token: '{{etd}}', label: 'ETD' },
  { token: '{{lastNoon}}', label: 'Last noon report time' },
  { token: '{{today}}', label: "Today's date" },
  { token: '{{priority}}', label: 'Priority' },
  { token: '{{dueLt}}', label: 'Due LT' },
  { token: '{{dueUtc}}', label: 'Due UTC' },
  { token: '{{remaining}}', label: 'Remaining time' },
  { token: '{{service}}', label: 'Service' },
  { token: '{{status}}', label: 'Voyage status' },
  { token: '{{wx}}', label: 'Weather status' },
  { token: '{{int}}', label: 'Interim status' },
  { token: '{{eov}}', label: 'End of voyage' },
  { token: '{{opt}}', label: 'Optimization status' },
  { token: '{{openTasks}}', label: 'Open tasks' },
  { token: '{{tags}}', label: 'Voyage tags' },
  { token: '{{aiAlert}}', label: 'AI alert' },
  { token: '{{health}}', label: 'Vessel health' },
  { token: '{{handoverNote}}', label: 'Handover note' },
  { token: '{{open}}', label: 'Open status' },
  { token: '{{built}}', label: 'Year built' },
  { token: '{{loa}}', label: 'Length overall' },
  { token: '{{beam}}', label: 'Beam' },
  { token: '{{enginePower}}', label: 'Engine power' },
  { token: '{{clientEmail}}', label: 'Account email' },
  { token: '{{price}}', label: 'Freight price' },
  { token: '{{pricingBasis}}', label: 'Pricing basis' },
  { token: '{{ecdisModel}}', label: 'ECDIS model' },
  { token: '{{interimPort}}', label: 'Interim port' },
  { token: '{{etdDisplay}}', label: 'ETD display' },
  { token: '{{etdIso}}', label: 'ETD ISO' },
  { token: '{{routeRef}}', label: 'Route reference' },
  { token: '{{cpSpeed}}', label: 'CP speed' },
  { token: '{{cpCons}}', label: 'CP consumption' },
  { token: '{{instSpeed}}', label: 'Instruction speed' },
  { token: '{{instCons}}', label: 'Instruction consumption' },
  { token: '{{costPerDay}}', label: 'Cost per day' },
  { token: '{{foCost}}', label: 'FO cost' },
  { token: '{{goCost}}', label: 'GO cost' },
  { token: '{{euaCost}}', label: 'EUA cost' },
  { token: '{{seed}}', label: 'Voyage seed' },
  ...MODULE_EMAIL_TOKENS.map(([token, label]) => ({ token, label })),
];

function storedBookRows(key: string): Record<string, unknown>[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object')) : [];
  } catch {
    return [];
  }
}

function stringRecord(value: Record<string, unknown> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(value ?? {}).map(([key, item]) => [key, String(item ?? '')]));
}

/** Merge the current voyage's persisted module records into email token data. */
function moduleTokenValues(voyage: Voyage | undefined): Record<string, string> {
  if (!voyage) return {};
  const recap = loadOpsRecap(voyage.id);
  const emissions = loadEmissionsDoc(voyage.id);
  const account = getAccountTxns().filter((item) => item.vessel === voyage.vessel || item.voyage === voyage.id).sort((a, b) => b.dueIso.localeCompare(a.dueIso))[0];
  const bunker = getBunkerRequirements().filter((item) => item.vessel === voyage.vessel || item.reference === voyage.id).sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated))[0];
  const cargo = storedBookRows('fv.chartering.cargoBook').find((item) => item.account === voyage.client || item.loadPort === voyage.portFrom || item.dischargePort === voyage.portTo);
  const tonnage = storedBookRows('fv.chartering.tonnageBook').find((item) => item.vessel === voyage.vessel || item.imo === voyage.imo);
  const values: Record<string, string> = {};
  const add = (prefix: string, record: Record<string, unknown> | undefined) => Object.entries(stringRecord(record)).forEach(([key, value]) => { values[`${prefix}${key[0].toUpperCase()}${key.slice(1)}`] = value; });
  add('', recap);
  add('emissions', emissions as unknown as Record<string, unknown> | undefined);
  add('account', account as unknown as Record<string, unknown> | undefined);
  add('bunker', bunker as unknown as Record<string, unknown> | undefined);
  add('cargo', cargo);
  add('tonnage', tonnage);
  values.complianceYear = values.emissionsComplianceYear ?? '';
  values.trade = values.emissionsTrade ?? '';
  values.euaPriceEur = values.emissionsEuaPriceEur ?? '';
  values.co2AdjustmentT = values.emissionsCo2AdjustmentT ?? '';
  values.emissionsApprovedBy = values.emissionsApprovedBy ?? '';
  values.emissionsApprovedDate = values.emissionsApprovedDate ?? '';
  return values;
}

/** Replace {{token}} placeholders in `text` with the voyage's live values. */
export function applyVoyageTokens(text: string, voyage?: Voyage): string {
  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const voyageFields: Record<string, string> = Object.fromEntries(
    Object.entries(voyage ?? {}).map(([key, value]) => [key, String(value ?? '')]),
  );
  const map: Record<string, string> = {
    ...moduleTokenValues(voyage),
    ...voyageFields,
    vessel: voyage?.vessel ?? '',
    vesselName: voyage?.vessel ?? '',
    imo: voyage?.imo ?? '',
    voyageNo: voyage?.id ?? '',
    voyageId: voyage?.id ?? '',
    vesselType: voyage?.vesselType ?? '',
    flag: voyage?.flag ?? '',
    dwt: voyage?.dwt ?? '',
    client: voyage?.client ?? '',
    pic: voyage?.pic ?? '',
    portFrom: voyage?.portFrom ?? '',
    portTo: voyage?.portTo ?? '',
    cargoLoadPort: voyage?.portFrom ?? '',
    cargoDischargePort: voyage?.portTo ?? '',
    cargoAccount: voyage?.client ?? '',
    tonnageVessel: voyage?.vessel ?? '',
    tonnageImo: voyage?.imo ?? '',
    tonnageVesselType: voyage?.vesselType ?? '',
    tonnageDwt: voyage?.dwt ?? '',
    tonnageFlag: voyage?.flag ?? '',
    route: voyage ? `${voyage.portFrom} → ${voyage.portTo}` : '',
    eta: voyage?.eta ?? '',
    etd: voyage?.etdDisplay ?? '',
    lastNoon: voyage?.lastNoon ?? '',
    today,
  };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) =>
    key in map ? map[key] : whole,
  );
}

/** Resolve the email for a recipient type from the voyage + directory data. */
export function resolveRecipientEmail(
  type: EmailRecipientType | undefined,
  voyage: Voyage | undefined,
): string {
  if (!voyage || !type) return '';
  if (type === 'Account') return voyage.clientEmail ?? '';
  if (type === 'Vessel' || type === 'Master') {
    const slug = voyage.vessel
      .toLowerCase()
      .replace(/^m[.\s]*v[.\s]+/, '')
      .replace(/[^a-z0-9]+/g, '');
    return slug ? `${slug}@vessel.email` : '';
  }
  if (type === 'Service Provider') {
    const p = loadClients().find((c) => c.kind === 'Service Provider' && c.email);
    return p?.email ?? '';
  }
  // Otherwise it is an account / service-provider category — match it in the directory.
  const match = loadClients().find((c) => c.email && c.category === type);
  return match?.email ?? '';
}

/** Resolve a comma-joined recipient line from a list of recipient types. */
export function resolveRecipientsLine(
  types: EmailRecipientType[] | undefined,
  voyage: Voyage | undefined,
): string {
  if (!types || types.length === 0 || !voyage) return '';
  const emails = types.map((t) => resolveRecipientEmail(t, voyage)).filter(Boolean);
  return Array.from(new Set(emails)).join(', ');
}

/** A named group of recipient types shown in the To / CC dropdowns. */
export interface RecipientTypeGroup {
  group: string;
  types: EmailRecipientType[];
}

/**
 * Build the To / CC recipient-type options. Standard account / service-provider
 * types are always listed, unioned with any custom categories found in the
 * directory so newly added entries appear automatically.
 */
export function getRecipientTypeOptions(): RecipientTypeGroup[] {
  const clients = loadClients();
  const distinct = (kind: 'Account' | 'Service Provider') =>
    clients
      .filter((c) => c.kind === kind && c.category && c.category.trim())
      .map((c) => c.category.trim());
  const accounts = Array.from(new Set([...ACCOUNT_TYPES, ...distinct('Account')])).sort((a, b) =>
    a.localeCompare(b),
  );
  const providers = Array.from(
    new Set([...SERVICE_PROVIDER_TYPES, ...distinct('Service Provider')]),
  ).sort((a, b) => a.localeCompare(b));
  return [
    { group: 'Accounts', types: ['Account', ...accounts] },
    { group: 'Vessel', types: ['Vessel'] },
    { group: 'Service Providers', types: providers },
  ];
}


/** Normalise a stored recipient-type list (drop blanks, map legacy 'Master'). */
function normalizeRecipientList(list: unknown): EmailRecipientType[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => (x === 'Master' ? 'Vessel' : x));
}

// --- Rich-text / plain-text helpers -----------------------------------------
// Bodies are stored as HTML going forward; legacy seed bodies are plain text.

/** True when a string already contains HTML markup. */
export function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

/** Escape plain text and turn newlines into <br> for the rich editor. */
export function plainToHtml(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\n/g, '<br>');
}

/** Return an HTML representation of a body (plain-text bodies are converted). */
export function ensureHtml(body: string): string {
  return looksLikeHtml(body) ? body : plainToHtml(body);
}

/** Flatten HTML to plain text (for mailto bodies and clipboard). */
export function htmlToPlain(html: string): string {
  if (!looksLikeHtml(html)) return html;
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  div.querySelectorAll('p, div, li').forEach((el) => el.append('\n'));
  return (div.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Resolve the subject line for a template, applying voyage tokens. */
export function resolveSubject(tpl: EmailTemplate, voyage: Voyage | undefined): string {
  const raw = (tpl.subject ?? '').trim() || tpl.title;
  return applyVoyageTokens(raw, voyage).trim();
}

/** Representative voyage used to preview templates in the admin editor. */
export const SAMPLE_VOYAGE: Voyage | undefined = VOYAGES[0];

function isEmailTemplate(v: unknown): v is EmailTemplate {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as EmailTemplate).id === 'string' &&
    typeof (v as EmailTemplate).title === 'string' &&
    typeof (v as EmailTemplate).body === 'string' &&
    typeof (v as EmailTemplate).category === 'string'
  );
}

