import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { assistantApi, type AssistantAction, type AssistantDocumentContext } from '../api/assistantApi';
import { AiChatHistory } from './AiChatHistory';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { loadOpsRecap, patchOpsRecap } from '../data/opsRecap';
import { useVessels } from '../data/vessels';
import { useVoyages } from '../data/voyages';
import { readInvoiceDocument } from '../data/invoiceDocuments';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  ts: string;
  actions?: AssistantAction[];
}

interface AttachedDocument extends AssistantDocumentContext {
  id: string;
}

const MAX_DOCUMENT_TEXT = 100_000;
const MAX_SINGLE_DOCUMENT_TEXT = 60_000;
const ALLOWED_ACTION_ROUTES = new Set([
  '/operations', '/chartering', '/reports/performance', '/bunker',
  '/postfix', '/emissions', '/accounts', '/voyage',
]);
const ALLOWED_OPERATION_FIELDS = new Set([
  'loadPort', 'dischargePort', 'deliveryPort', 'redeliveryPort', 'cargoName',
  'cpQuantity', 'cpSpeed', 'cpCons', 'hirePerDay', 'freightPerMt', 'voyageFixType',
]);

function stamp(): string {
  const date = new Date();
  const twoDigits = (value: number) => String(value).padStart(2, '0');
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

function sanitizeAssistantContext(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAssistantContext);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !/(email|phone|mobile|password|token|secret|history)/i.test(key))
      .map(([key, nested]) => [key, sanitizeAssistantContext(nested)]),
  );
}

export function AiAssistantPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const voyage = useSelectedVoyage();
  const vessels = useVessels();
  const voyages = useVoyages();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [documents, setDocuments] = useState<AttachedDocument[]>([]);
  const [documentStatus, setDocumentStatus] = useState('');
  const [readingDocument, setReadingDocument] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [loadingChat, setLoadingChat] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const recap = voyage ? loadOpsRecap(voyage.id) ?? {} : {};
  const activeVesselName = String(recap.vesselName ?? voyage?.vessel ?? '');
  const activeVessel = vessels.find((vessel) =>
    vessel.name.trim().toLowerCase() === activeVesselName.trim().toLowerCase() ||
    (!!voyage?.imo && vessel.imo === voyage.imo),
  );
  const context = sanitizeAssistantContext({
    currentModule: 'Voyage Operations',
    activeVoyage: voyage ? { ...voyage, operations: recap } : null,
    activeVessel: activeVessel ?? null,
    voyages: voyages.slice(0, 100).map((row) => ({
      id: row.id,
      vessel: row.vessel,
      imo: row.imo,
      vesselType: row.vesselType,
      status: row.status,
      client: row.client,
      portFrom: row.portFrom,
      portTo: row.portTo,
      eta: row.eta,
      cpSpeed: row.cpSpeed,
      cpCons: row.cpCons,
    })),
    vessels: vessels.slice(0, 100),
    fleetContextTruncated: voyages.length > 100 || vessels.length > 100,
  });

  const greeting = (): Message => {
    const voyageName = activeVesselName || 'your fleet';
    return {
      id: 'init',
      role: 'assistant',
      text: `Hi, I'm your **Voyage AI Agent**. I can answer shipping questions, look up voyages, vessels, bunkers, accounts, claims, performance, emissions and chartering records, calculate ETA, fuel and cargo margins, and read attached PDF, Word, Excel, CSV, image and text documents.\n\n${voyage ? `Active voyage: **${voyageName}**${voyage.portFrom ? ` · ${voyage.portFrom} → ${voyage.portTo}` : ''}.` : 'I can search fleet records even when no voyage is selected.'}\n\nI can also open a relevant module when you ask. Operational changes are not applied without your review.`,
      ts: stamp(),
    };
  };

  const resetChat = () => {
    setMessages([greeting()]);
    setConversationId(null);
    setDocuments([]);
    setDocumentStatus('');
    setInput('');
  };

  const startNewChat = () => {
    if (thinking) return;
    resetChat();
    setShowHistory(false);
    inputRef.current?.focus();
  };

  const openConversation = async (id: string) => {
    if (thinking) return;
    setLoadingChat(true);
    try {
      const detail = await assistantApi.getConversation(id);
      setMessages(detail.messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.content,
        ts: new Date(message.createdAtUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actions: message.actions.filter((action) => !!action.route && ALLOWED_ACTION_ROUTES.has(action.route)),
      })));
      setConversationId(detail.id);
      setDocuments([]);
      setDocumentStatus('');
      setShowHistory(false);
    } catch (error) {
      setDocumentStatus(`Could not open that chat: ${errorMessage(error)}`);
    } finally {
      setLoadingChat(false);
    }
  };

  useEffect(() => {
    resetChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyage?.id]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const send = async () => {
    const question = input.trim();
    if (!question || thinking || readingDocument) return;
    setMessages((previous) => [...previous, { id: `u-${Date.now()}`, role: 'user', text: question, ts: stamp() }]);
    setInput('');
    setThinking(true);
    try {
      const response = await assistantApi.chat({
        message: question,
        history: messages.filter((message) => message.id !== 'init').slice(-18).map(({ role, text }) => ({ role, content: text })),
        context,
        documents: documents.map(({ name, text }) => ({ name, text })),
        conversationId,
      });
      if (response.conversationId) {
        setConversationId(response.conversationId);
        setHistoryKey((key) => key + 1);
      }
      const actions = (response.actions ?? []).filter((action) => action.kind === 'confirm'
        ? !!action.actionId
        : action.kind === 'recapUpdate'
        ? !!voyage && action.voyageId === voyage.id && !!action.field && ALLOWED_OPERATION_FIELDS.has(action.field) && typeof action.value === 'string'
        : !!action.route && ALLOWED_ACTION_ROUTES.has(action.route));
      setMessages((previous) => [...previous, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: response.reply,
        ts: stamp(),
        actions,
      }]);
    } catch (error) {
      setMessages((previous) => [...previous, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: `I couldn't reach the configured AI agent: ${errorMessage(error)}`,
        ts: stamp(),
      }]);
    } finally {
      setThinking(false);
    }
  };

  const addDocuments = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setReadingDocument(true);
    setDocumentStatus('Reading documents locally…');
    try {
      const added: AttachedDocument[] = [];
      let characterCount = documents.reduce((total, document) => total + document.text.length, 0);
      for (const file of files) {
        const text = await readInvoiceDocument(file, setDocumentStatus);
        const cleanedText = text.trim();
        if (!cleanedText) throw new Error(`${file.name}: no readable text was found.`);
        if (cleanedText.length > MAX_SINGLE_DOCUMENT_TEXT) throw new Error(`${file.name}: extracted text exceeds the 60,000-character per-file limit.`);
        characterCount += cleanedText.length;
        if (characterCount > MAX_DOCUMENT_TEXT) throw new Error('Attached documents exceed the 100,000-character total limit. Remove a document and try again.');
        added.push({ id: `${Date.now()}-${Math.random()}`, name: file.name, text: cleanedText });
      }
      setDocuments((previous) => [...previous, ...added]);
      setDocumentStatus(`${added.length} document${added.length === 1 ? '' : 's'} ready for questions.`);
    } catch (error) {
      setDocumentStatus(errorMessage(error));
    } finally {
      setReadingDocument(false);
    }
  };

  const removeDocument = (id: string) => {
    setDocuments((previous) => previous.filter((document) => document.id !== id));
  };

  const updateAction = (action: AssistantAction, patch: Partial<AssistantAction>) => {
    setMessages((previous) => previous.map((message) => ({
      ...message,
      actions: message.actions?.map((candidate) => candidate === action ? { ...candidate, ...patch } : candidate),
    })));
  };

  const resolveProposal = async (action: AssistantAction, confirm: boolean) => {
    if (!action.actionId || action.busy) return;
    updateAction(action, { busy: true });
    let note: string;
    let done = false;
    try {
      const result = confirm ? await assistantApi.confirmAction(action.actionId) : await assistantApi.cancelAction(action.actionId);
      done = result.success;
      note = result.success && confirm ? `${result.message} Open screens may need a refresh to show the change.` : result.message;
    } catch (error) {
      note = `The change was not applied: ${errorMessage(error)}`;
    }
    updateAction(action, confirm ? { busy: false, completed: done } : { busy: false, dismissed: done });
    setMessages((previous) => [...previous, { id: `a-${Date.now()}`, role: 'assistant', text: note, ts: stamp() }]);
  };

  const openAction = (action: AssistantAction) => {
    if (action.kind === 'confirm') {
      void resolveProposal(action, true);
      return;
    }
    if (action.kind === 'recapUpdate') {
      if (!voyage || action.voyageId !== voyage.id || !action.field || !ALLOWED_OPERATION_FIELDS.has(action.field) || typeof action.value !== 'string') return;
      if (!window.confirm(`Apply this change to the active voyage?\n\n${action.label}`)) return;
      patchOpsRecap(voyage.id, { [action.field]: action.value });
      setMessages((previous) => previous.map((message) => ({
        ...message,
        actions: message.actions?.map((candidate) => candidate === action ? { ...candidate, completed: true } : candidate),
      })));
      return;
    }
    if (!action.route || !ALLOWED_ACTION_ROUTES.has(action.route)) return;
    navigate(action.route);
    onClose();
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); }
    if (event.key === 'Escape') onClose();
  };

  return createPortal(
    <div className="fv-ai__overlay" onClick={onClose}>
      <div className="fv-ai__panel" role="dialog" aria-label="Voyage AI Agent" onClick={(event) => event.stopPropagation()}>
        <div className="fv-ai__head">
          <div className="fv-ai__head-left">
            <span className="fv-ai__head-icon"><i className="fas fa-robot" aria-hidden="true" /></span>
            <div>
              <span className="fv-ai__head-title">Voyage AI Agent</span>
              <span className="fv-ai__head-sub">{voyage ? `${activeVesselName || voyage.vessel}${voyage.portFrom ? ` · ${voyage.portFrom} → ${voyage.portTo}` : ''}` : 'Fleet-wide shipping and operations assistant'}</span>
            </div>
          </div>
          <div className="fv-ai__head-actions">
            <button type="button" className="fv-ai__close" onClick={startNewChat} disabled={thinking} aria-label="New chat" title="New chat">
              <i className="fas fa-pen-to-square" aria-hidden="true" />
            </button>
            <button type="button" className="fv-ai__close" onClick={() => setShowHistory((open) => !open)} aria-label="Chat history" title="Chat history" aria-pressed={showHistory}>
              <i className="fas fa-clock-rotate-left" aria-hidden="true" />
            </button>
            <button type="button" className="fv-ai__close" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" aria-hidden="true" /></button>
          </div>
        </div>

        <div className="fv-ai__body" ref={bodyRef}>
          {messages.map((message) => (
            <div key={message.id} className={`fv-ai__msg fv-ai__msg--${message.role}`}>
              {message.role === 'assistant' && <span className="fv-ai__avatar"><i className="fas fa-robot" aria-hidden="true" /></span>}
              <div className="fv-ai__bubble">
                <AiText text={message.text} />
                {message.actions?.map((action) => (
                  <span key={action.kind === 'confirm' ? action.actionId : action.kind === 'recapUpdate' ? `${action.voyageId}-${action.field}` : action.route} className="fv-ai__action-row">
                    <button
                      type="button"
                      className="fv-ai__action"
                      onClick={() => openAction(action)}
                      disabled={action.completed || action.dismissed || action.busy}
                    >
                      <i className={`fas ${action.completed ? 'fa-check' : action.dismissed ? 'fa-ban' : action.kind === 'recapUpdate' || action.kind === 'confirm' ? 'fa-pen-to-square' : 'fa-arrow-up-right-from-square'}`} aria-hidden="true" /> {action.completed ? 'Applied' : action.dismissed ? 'Discarded' : action.kind === 'confirm' ? `Confirm: ${action.label}` : action.label}
                    </button>
                    {action.kind === 'confirm' && !action.completed && !action.dismissed && (
                      <button type="button" className="fv-ai__action" onClick={() => { void resolveProposal(action, false); }} disabled={action.busy}>
                        <i className="fas fa-xmark" aria-hidden="true" /> Discard
                      </button>
                    )}
                  </span>
                ))}
                <span className="fv-ai__ts">{message.ts}</span>
              </div>
            </div>
          ))}
          {thinking && (
            <div className="fv-ai__msg fv-ai__msg--assistant">
              <span className="fv-ai__avatar"><i className="fas fa-robot" aria-hidden="true" /></span>
              <div className="fv-ai__bubble fv-ai__thinking"><span /><span /><span /></div>
            </div>
          )}
        </div>

        {documents.length > 0 && (
          <div className="fv-ai__documents" aria-label="Attached documents">
            {documents.map((document) => (
              <span key={document.id} className="fv-ai__document">
                <i className="fas fa-file-lines" aria-hidden="true" /> {document.name}
                <button type="button" onClick={() => removeDocument(document.id)} aria-label={`Remove ${document.name}`} disabled={thinking}>
                  <i className="fas fa-xmark" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
        {documentStatus && <div className="fv-ai__document-status" role="status">{documentStatus}</div>}

        <div className="fv-ai__suggestions">
          {['Summarize this voyage', 'Which payables are overdue?', 'Show open bunker requirements', 'How did this voyage perform?'].map((suggestion) => (
            <button key={suggestion} type="button" className="fv-ai__chip" onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}>{suggestion}</button>
          ))}
        </div>

        <div className="fv-ai__footer">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.text,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,image/*"
            multiple
            onChange={(event) => { void addDocuments(event); }}
            hidden
          />
          <button type="button" className="fv-ai__attach" onClick={() => fileRef.current?.click()} disabled={thinking || readingDocument} title="Attach PDF, Word, Excel, CSV, image or text document" aria-label="Attach document">
            <i className="fas fa-paperclip" aria-hidden="true" />
          </button>
          <input
            ref={inputRef}
            className="fv-ai__input"
            value={input}
            placeholder={documents.length ? 'Ask a question about your documents…' : 'Ask about vessels, voyages, shipping or operations…'}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKey}
            autoFocus
          />
          <button type="button" className="fv-ai__send" disabled={!input.trim() || thinking || readingDocument} onClick={() => { void send(); }} aria-label="Send">
            <i className="fas fa-paper-plane" aria-hidden="true" />
          </button>
        </div>
        <div className="fv-ai__disclaimer">Extracted text and voyage context are sent to your configured AI provider. Verify advice against official sources; the agent never changes data without your confirmation.</div>
        {showHistory && (
          <AiChatHistory
            activeId={conversationId}
            refreshKey={historyKey}
            onSelect={(id) => { void openConversation(id); }}
            onNewChat={startNewChat}
            onDeleted={(id) => { if (id === 'all' || id === conversationId) resetChat(); }}
            onClose={() => setShowHistory(false)}
          />
        )}
        {loadingChat && <div className="fv-ai__loading" role="status">Opening chat…</div>}
      </div>
    </div>,
    document.body,
  );
}

function AiText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="fv-ai__text">
      {lines.map((line, index) => {
        if (!line.trim()) return <br key={index} />;
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={partIndex}>{part.slice(2, -2)}</strong>
            : <span key={partIndex}>{part}</span>,
        );
        if (line.trimStart().startsWith('•') || line.trimStart().startsWith('- ')) return <div key={index} className="fv-ai__bullet">{parts}</div>;
        return <div key={index}>{parts}</div>;
      })}
    </div>
  );
}
