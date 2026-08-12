import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { loadOpsRecap } from '../data/opsRecap';
import { loadVessels } from '../data/vessels';
import type { Recap } from './OperationsPage';

/* ---------------------------------------------------------------- types */

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  ts: string;
}

interface AiContext {
  vesselName: string;
  imo: string;
  vesselType: string;
  dwt: number;
  loadPort: string;
  dischargePort: string;
  deliveryPort: string;
  redeliveryPort: string;
  cpSpeed: string;
  cpCons: string;
  cargoName: string;
  cpQuantity: string;
  hirePerDay: string;
  freightPerMt: string;
  deliveryDateTime: string;
  redeliveryDateTime: string;
  bunkers: { fuel: string; bod: string; masterReq: string }[];
  eta: string;
  owners: string;
  charterers: string;
  voyageFixType: string;
}

/* ---------------------------------------------------------------- utils */

function num(v: string | undefined): number {
  return parseFloat((v ?? '').replace(/,/g, '')) || 0;
}

function fmt1(n: number): string { return n.toFixed(1); }
function fmt0(n: number): string { return Math.round(n).toLocaleString(); }

function stamp(): string {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/* ---------------------------------------------------------------- AI engine */

/** Minimal local AI — derives answers from live voyage data. No external API needed. */
function answerQuestion(q: string, ctx: AiContext): string {
  const lq = q.toLowerCase();

  /* ---- ETA / speed recalculation ---- */
  const etaSpeedMatch = lq.match(/(\d+(?:\.\d+)?)\s*(?:kts?|knots?)/);
  if (etaSpeedMatch && (lq.includes('eta') || lq.includes('speed') || lq.includes('arrive') || lq.includes('sail'))) {
    const newSpeed = parseFloat(etaSpeedMatch[1]);
    const cpSpeed = num(ctx.cpSpeed);
    if (cpSpeed > 0 && newSpeed > 0) {
      // Approximate ratio-based ETA shift
      const ratio = cpSpeed / newSpeed;
      const sign = ratio < 1 ? 'earlier' : 'later';
      const pct = Math.abs((1 - ratio) * 100).toFixed(0);
      const cpConsNum = num(ctx.cpCons);
      const newCons = cpConsNum > 0 ? (cpConsNum * Math.pow(newSpeed / cpSpeed, 3)).toFixed(2) : 'unknown';
      return `At **${newSpeed} kts** vs the CP speed of **${cpSpeed} kts**:\n\n` +
        `• Voyage time changes by ~**${pct}%** — you'd arrive **${sign}** than the current ETA.\n` +
        `• Fuel consumption changes cubically: estimated **${newCons} MT/day** (${cpSpeed} kts = ${ctx.cpCons} MT/day).\n` +
        `• Always check against Laycan window at ${ctx.dischargePort || ctx.deliveryPort} before changing speed.\n\n` +
        `For an exact ETA recalculation, update the speed in the **ETA & Bunker** tab → it will reproject the full itinerary.`;
    }
    return `To recalculate ETA at ${newSpeed} kts, go to the **ETA & Bunker** tab and update the instructed speed. The tab will reproject the full itinerary instantly.`;
  }

  /* ---- Bunker / max cargo optimisation ---- */
  if (lq.includes('bunker') && (lq.includes('where') || lq.includes('which port') || lq.includes('best') || lq.includes('max cargo') || lq.includes('load more') || lq.includes('overload'))) {
    const dwtNum = ctx.dwt || 0;
    const cargo = num(ctx.cpQuantity.replace(/[^\d.,]/g, ''));
    const fuelRobs = ctx.bunkers.filter(b => b.masterReq || b.bod).map(b => ({
      fuel: b.fuel,
      req: num(b.masterReq || b.bod),
    }));
    const totalFuelMt = fuelRobs.reduce((s, b) => s + b.req, 0);
    const fuelLine = fuelRobs.map(b => `${b.fuel} ${fmt0(b.req)} MT`).join(', ');
    const available = dwtNum > 0 ? dwtNum - cargo - totalFuelMt : null;

    let response = `**Bunker port strategy to maximise cargo:**\n\n`;
    if (dwtNum > 0) {
      response += `• **DWT**: ${fmt0(dwtNum)} MT\n`;
      response += `• **CP Cargo**: ${fmt0(cargo)} MT\n`;
      if (fuelLine) response += `• **Fuel on board**: ${fuelLine} = ${fmt0(totalFuelMt)} MT\n`;
      if (available !== null) response += `• **Available margin**: ~${fmt0(available)} MT\n\n`;
    }
    response += `**Strategy options:**\n`;
    response += `1. **Load port bunkering (${ctx.loadPort || 'load port'})** — bunker before loading; reduces available cargo space but avoids a deviation.\n`;
    response += `2. **Intermediate port bunker** — if the route passes a major hub (e.g. Singapore, Fujairah, Rotterdam), a small bunkering stop preserves max cargo intake at load port.\n`;
    response += `3. **Discharge port bunkering** — bunker after discharge; maximises cargo uplift but you must carry enough ROB to reach there.\n\n`;
    response += `**Recommendation**: Use the **ETA & Bunker** tab → Supply column to enter quantities at each port. The tab calculates ROB at each call so you can see exactly how much cargo margin you have.\n\n`;
    response += `💡 *For regulations, always verify port density (tropical/summer zone) and draft restrictions at ${ctx.loadPort}.*`;
    return response;
  }

  /* ---- Fuel consumption / ROB questions ---- */
  if (lq.includes('rob') || lq.includes('fuel') && (lq.includes('how much') || lq.includes('consumption') || lq.includes('remaining'))) {
    const items = ctx.bunkers.filter(b => b.bod || b.masterReq);
    if (items.length) {
      const lines = items.map(b => `• **${b.fuel}**: BOD ${b.bod || '—'} MT | Master Req ${b.masterReq || '—'} MT`).join('\n');
      return `**Current bunker figures for ${ctx.vesselName}:**\n\n${lines}\n\nCP consumption: **${ctx.cpCons} MT/day** at **${ctx.cpSpeed} kts**.\n\nFor projected ROBs at each port, check the **ETA & Bunker** tab — it calculates consumption leg by leg.`;
    }
    return `No bunker figures entered yet. Fill in BOD quantities in the **Voyage Details → Bunkers** section and ETA tab to see projected ROBs along the route.`;
  }

  /* ---- Hire / freight financials ---- */
  if (lq.includes('hire') || lq.includes('freight') || lq.includes('revenue') || lq.includes('profit') || lq.includes('earn')) {
    const hire = num(ctx.hirePerDay);
    const frt = num(ctx.freightPerMt);
    const cq = num(ctx.cpQuantity.replace(/[^\d.,]/g, ''));
    let response = `**Commercial summary for ${ctx.vesselName}:**\n\n`;
    if (hire > 0) response += `• Daily hire: **${fmt0(hire)} USD/day** (${ctx.voyageFixType})\n`;
    if (frt > 0 && cq > 0) response += `• Freight: **${fmt0(frt * cq)} USD** (${fmt1(frt)} USD/MT × ${fmt0(cq)} MT)\n`;
    response += `\nFor the full P&L breakdown including bunker costs, port DAs and commissions, see the **Live P&L** tab in Operations.`;
    return response;
  }

  /* ---- Voyage overview ---- */
  if (lq.includes('voyage') && (lq.includes('summary') || lq.includes('overview') || lq.includes('status') || lq.includes('tell me') || lq.includes('what is'))) {
    return `**${ctx.vesselName} — Voyage Overview**\n\n` +
      `• **Route**: ${ctx.loadPort || ctx.deliveryPort || '—'} → ${ctx.dischargePort || ctx.redeliveryPort || '—'}\n` +
      `• **Fix type**: ${ctx.voyageFixType}\n` +
      `• **Owners**: ${ctx.owners || '—'} | **Charterers**: ${ctx.charterers || '—'}\n` +
      `• **CP Speed**: ${ctx.cpSpeed} kts | **CP Cons**: ${ctx.cpCons} MT/day\n` +
      `${ctx.cargoName ? `• **Cargo**: ${ctx.cpQuantity} — ${ctx.cargoName}\n` : ''}` +
      `\nAsk me anything specific about ETA, fuel, cargo loading, financials or charter terms.`;
  }

  /* ---- CP / charter terms ---- */
  if (lq.includes('charter') || lq.includes('cp date') || lq.includes('laycan') || lq.includes('terms')) {
    return `**Charter party details for ${ctx.vesselName}:**\n\n` +
      `• **Owners**: ${ctx.owners || '—'}\n` +
      `• **Charterers**: ${ctx.charterers || '—'}\n` +
      `• **Fix type**: ${ctx.voyageFixType}\n` +
      `• **Delivery port**: ${ctx.deliveryPort || '—'} | **Redelivery**: ${ctx.redeliveryPort || '—'}\n` +
      `• **Delivery**: ${ctx.deliveryDateTime || '—'} | **Redelivery**: ${ctx.redeliveryDateTime || '—'}\n\n` +
      `For full CP details including hire payment terms, laytime and NOR conditions, see the **Voyage Details** tab.`;
  }

  /* ---- Port / distance questions ---- */
  if (lq.includes('distance') || lq.includes('how far') || lq.includes('nm') || lq.includes('nautical')) {
    return `For port-to-port distances, use the **Route Editing** module or the **Route Explorer** — they calculate great-circle and rhumb-line distances with canal/routing options.\n\nFor this voyage (${ctx.loadPort || '—'} → ${ctx.dischargePort || '—'}), the ETA & Bunker itinerary shows the projected distance per leg based on the waypoints entered.`;
  }

  /* ---- Suggestions / what can you do ---- */
  if (lq.includes('help') || lq.includes('what can') || lq.includes('example') || lq.includes('question') || lq.match(/^hi\b|^hello\b|^hey\b/)) {
    return `I'm your **Voyage AI Assistant** — I can answer questions about this voyage using live data from Operations.\n\n**Try asking:**\n• *"What would the ETA be if we sail at 12.5 knots?"*\n• *"Where should we bunker to maximise cargo?"*\n• *"How much fuel do we have on board?"*\n• *"Give me a voyage summary"*\n• *"What are the charter party terms?"*\n• *"What's the expected freight revenue?"*\n\nI work best when the voyage has been set up in the **Voyage Details** and **ETA & Bunker** tabs.`;
  }

  /* ---- Fallback ---- */
  return `I don't have a specific answer for that yet, but here's what I can help with for **${ctx.vesselName || 'this voyage'}**:\n\n` +
    `• ETA recalculation at different speeds\n` +
    `• Bunker port strategy and cargo maximisation\n` +
    `• Fuel ROB projections\n` +
    `• Charter party and commercial terms\n` +
    `• Voyage summary and status\n\n` +
    `Try rephrasing your question with specific numbers (e.g. "ETA if we do 13 knots") or check the relevant tab directly in Operations.`;
}

/* ---------------------------------------------------------------- panel */

interface Props {
  onClose: () => void;
}

export function AiAssistantPanel({ onClose }: Props) {
  const voyage = useSelectedVoyage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build context from live voyage + recap data.
  const ctx = useMemo<AiContext>(() => {
    if (!voyage) return {
      vesselName: '', imo: '', vesselType: '', dwt: 0, loadPort: '', dischargePort: '',
      deliveryPort: '', redeliveryPort: '', cpSpeed: '', cpCons: '', cargoName: '',
      cpQuantity: '', hirePerDay: '', freightPerMt: '', deliveryDateTime: '', redeliveryDateTime: '',
      bunkers: [], eta: '', owners: '', charterers: '', voyageFixType: '',
    };
    const recap = (loadOpsRecap(voyage.id) ?? {}) as Partial<Recap>;
    const vessel = loadVessels().find(v => v.name.trim().toLowerCase() === (recap.vesselName ?? voyage.vessel).trim().toLowerCase());
    return {
      vesselName: recap.vesselName || voyage.vessel || '',
      imo: voyage.imo || '',
      vesselType: vessel?.vesselType || voyage.vesselType || '',
      dwt: parseFloat(vessel?.deadweight || '0') || 0,
      loadPort: recap.loadPort || voyage.portFrom || '',
      dischargePort: recap.dischargePort || voyage.portTo || '',
      deliveryPort: recap.deliveryPort || '',
      redeliveryPort: recap.redeliveryPort || '',
      cpSpeed: recap.cpSpeed || '',
      cpCons: recap.cpCons || '',
      cargoName: recap.cargoName || '',
      cpQuantity: recap.cpQuantity || '',
      hirePerDay: recap.hirePerDay || '',
      freightPerMt: recap.freightPerMt || '',
      deliveryDateTime: recap.deliveryDateTime || '',
      redeliveryDateTime: recap.redeliveryDateTime || '',
      bunkers: (recap.bunkers ?? []).map((b: { fuel: string; bod?: string; masterReq?: string }) => ({ fuel: b.fuel, bod: b.bod || '', masterReq: b.masterReq || '' })),
      eta: voyage.eta || '',
      owners: recap.owners || '',
      charterers: recap.charterers || '',
      voyageFixType: recap.voyageFixType || '',
    };
  }, [voyage?.id]);

  // Greeting on open.
  useEffect(() => {
    const hasVoyage = !!(voyage && ctx.vesselName);
    const voyageLine = hasVoyage
      ? `I can see you're working on **${ctx.vesselName}**${ctx.loadPort ? ` (${ctx.loadPort} → ${ctx.dischargePort})` : ''}. I have access to the voyage data entered in Operations.\n\n`
      : `Select a voyage from the left menu and I'll have full access to its data — vessel specs, itinerary, cargo, bunkers and commercial terms.\n\n`;
    setMessages([{
      id: 'init',
      role: 'assistant',
      text: `Hi! I'm your **Voyage AI Assistant**.\n\n${voyageLine}You can ask me things like:\n• *"What would the ETA be at 12.5 knots?"*\n• *"Where should we bunker to maximise cargo?"*\n• *"What's the expected fuel consumption?"*\n• *"Give me a voyage summary"*`,
      ts: stamp(),
    }]);
  }, [voyage?.id]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const send = () => {
    const q = input.trim();
    if (!q) return;
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text: q, ts: stamp() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setThinking(true);

    // Simulate a brief thinking delay then respond.
    setTimeout(() => {
      const answer = answerQuestion(q, ctx);
      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: answer, ts: stamp() }]);
      setThinking(false);
    }, 600 + Math.random() * 400);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fv-ai__overlay" onClick={onClose}>
      <div className="fv-ai__panel" role="dialog" aria-label="Voyage AI Assistant" onClick={e => e.stopPropagation()}>
        <div className="fv-ai__head">
          <div className="fv-ai__head-left">
            <span className="fv-ai__head-icon"><i className="fas fa-robot" aria-hidden="true" /></span>
            <div>
              <span className="fv-ai__head-title">Voyage AI Assistant</span>
              {ctx.vesselName && <span className="fv-ai__head-sub">{ctx.vesselName}{ctx.loadPort ? ` · ${ctx.loadPort} → ${ctx.dischargePort}` : ''}</span>}
            </div>
          </div>
          <button type="button" className="fv-ai__close" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" /></button>
        </div>

        <div className="fv-ai__body" ref={bodyRef}>
          {messages.map(m => (
            <div key={m.id} className={`fv-ai__msg fv-ai__msg--${m.role}`}>
              {m.role === 'assistant' && <span className="fv-ai__avatar"><i className="fas fa-robot" /></span>}
              <div className="fv-ai__bubble">
                <AiText text={m.text} />
                <span className="fv-ai__ts">{m.ts}</span>
              </div>
            </div>
          ))}
          {thinking && (
            <div className="fv-ai__msg fv-ai__msg--assistant">
              <span className="fv-ai__avatar"><i className="fas fa-robot" /></span>
              <div className="fv-ai__bubble fv-ai__thinking">
                <span /><span /><span />
              </div>
            </div>
          )}
        </div>

        <div className="fv-ai__suggestions">
          {['ETA at 12.5 kts?', 'Best bunker port?', 'Voyage summary', 'Fuel on board?'].map(s => (
            <button key={s} type="button" className="fv-ai__chip" onClick={() => { setInput(s); inputRef.current?.focus(); }}>{s}</button>
          ))}
        </div>

        <div className="fv-ai__footer">
          <input
            ref={inputRef}
            className="fv-ai__input"
            value={input}
            placeholder="Ask about ETA, bunkers, cargo, charter terms…"
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            autoFocus
          />
          <button type="button" className="fv-ai__send" disabled={!input.trim() || thinking} onClick={send} aria-label="Send">
            <i className="fas fa-paper-plane" aria-hidden="true" />
          </button>
        </div>
        <div className="fv-ai__disclaimer">AI answers are based on voyage data entered in Operations. Always verify with official sources.</div>
      </div>
    </div>
  );
}

/** Render simple markdown-lite: **bold**, bullet lists, line breaks. */
function AiText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="fv-ai__text">
      {lines.map((line, i) => {
        if (!line.trim()) return <br key={i} />;
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={j}>{p.slice(2, -2)}</strong>
            : <span key={j}>{p}</span>
        );
        if (line.trimStart().startsWith('•')) return <div key={i} className="fv-ai__bullet">{parts}</div>;
        return <div key={i}>{parts}</div>;
      })}
    </div>
  );
}
