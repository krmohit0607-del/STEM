/**
 * Email routing templates shown in Settings → Email Templates.
 *
 * Sourced from the operations "Templates" document. Placeholders in
 * [square brackets] or XX form are filled in by the operator when composing.
 */

export interface EmailTemplate {
  id: string;
  category: string;
  title: string;
  body: string;
}

export const EMAIL_TEMPLATE_CATEGORIES = [
  'Deferrals',
  'Monitoring & Suggestions',
  'Navwarning',
  'AIS & Position',
  'Constraints (RTA / Speed / MCR)',
  'Route & Deviation',
  'Weather Synopsis',
  'Ice',
] as const;

export const EMAIL_TEMPLATES: EmailTemplate[] = [
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
      'Synopsis:\n\nPlease use the link below to view a comparison in Stem:\nStem COMPARISON LINK',
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
      'Advisory: Your route converges with [navwarning type] Navwarning [Navwarning Number] on [convergence date]. We defer to your expertise for avoidance and kindly ask you update your route in Stem if required.\nIf no response to this advisory received, will assume sailing through Navwarning is acceptable.',
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
    title: 'ECDIS navwarnings marginally different from Stem',
    body:
      'Good Day Captain,\n\nMany thanks for your feedback, it will be used to improve navwarnings in Stem.\n\nOur navwarnings are meant to supplement navwarnings found in your onboard ECDIS, as our navwarnings do not include information from Navtex. Should discrepancies exist between navwarnings in Stem and navwarnings in your onboard ECDIS, navwarnings in your onboard ECDIS should be treated as a source of truth.\n\nWe will always defer to your expertise to determine what navwarnings are not safe to sail and to adjust course for avoidance as necessary. We welcome any questions or concerns you may have.',
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
      "Many thanks for your confirmation that your AIS system is working in good order. Note that vessel's latest position has not yet updated within our system and kindly request you to provide the following for us to update the vessel's position within Stem:\n\nUTC Date/Time -\nlat/long -\nCourse/Speed -",
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
      'Well noted your updated RTA of XXXX. We have input this RTA into Stem on your behalf. Please see below fresh guidance for your reference:',
  },
  {
    id: 'rta-wf',
    category: 'Constraints (RTA / Speed / MCR)',
    title: 'RTA updated by Capt in WF',
    body:
      'Well noted that RTA of XXXX has been updated in Stem. Below guidance and guidance generated hereafter will apply this RTA unless otherwise advised. Operators RIC, please be advised.',
  },
  {
    id: 'speedcons-email',
    category: 'Constraints (RTA / Speed / MCR)',
    title: 'Speed/Cons updated by Capt in email',
    body:
      'Well noted your updated speed and consumption constraint of XXkts and XXmt. We have input this constraint into Stem on your behalf. Please see below fresh guidance for your reference:',
  },
  {
    id: 'speedcons-wf',
    category: 'Constraints (RTA / Speed / MCR)',
    title: 'Speed/Cons updated by Capt in WF',
    body:
      'Well noted that speed and consumption constraint of XXkts and XXmt have been updated in Stem. Below guidance and guidance generated hereafter will apply this constraint unless otherwise advised. Operators RIC, please be advised.',
  },
  {
    id: 'shoreside-removes-rta',
    category: 'Constraints (RTA / Speed / MCR)',
    title: 'Shoreside Removes RTA',
    body:
      "Please note that Stem's RTA has been removed by operators. Below guidance and guidance generated hereafter will apply no constraints unless otherwise advised by operators.",
  },
  {
    id: 'assumed-rta',
    category: 'Constraints (RTA / Speed / MCR)',
    title: 'Assumed RTA constraint',
    body:
      'Please Note: We have applied vessel\u2019s ETA from route import of [DATE/TIME] as an RTA, as no RTA or speed constraint has been input into Stem. Below and future guidance will be generated to make this RTA unless otherwise advised. Please kindly confirm all is in good order.',
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
      "We note vessel is sailing [direction] of expected track. We have adjusted the route in Stem along an assumed track. This is not a route suggestion and we kindly ask you import an updated route if your intended route differs greatly from the assumed route in Stem.\n\nIf having connectivity issues and can\u2019t access Stem, please provide your latest route file in email and we will input into Stem on your behalf.",
  },
  {
    id: 'noted-deviation',
    category: 'Route & Deviation',
    title: 'Noted a Deviation, Please Import',
    body:
      'We have noticed a [add direction] deviation from your active route as it exists in Stem. Although Stem shows a tentative re-entry path to that original route, we defer to your expertise in regards to hazard avoidance and general vessel maneuvering.\n\nIf your intended route has significantly changed, please kindly import your newest intentions into Stem so that we may provide the most accurate weather and route guidance.',
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
      'Please see the Stem COMPARISON LINK displaying our updated analysis for possible avoidance strategies with below descriptions. Please review and advise your preference as well as any questions or comments.\n\nPresent Route (Black): route description\nAlternate Route 1 (Orange): route description\nAlternate Route 2 (Green): route description\nAlternate Route 3 (Purple): route description',
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
      'Advisory: Your route converges with region of potential known [icebergs or sea ice] on [convergence date]. Please see attached ice chart and bulletin for your reference.\n\nWe defer to your expertise for adjusting course and speed as needed to avoid any [icebergs or sea ice]. If this route is unacceptable, we kindly ask you import an updated route into Stem.\nIf no response to this advisory received, we will assume sailing along present route is acceptable.',
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
      return parsed as EmailTemplate[];
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

