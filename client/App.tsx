import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, CheckCheck, ChevronDown, Code2, Coffee, Heart,
  History, Inbox, MapPin, MessageCircle, Plus, RefreshCw, Settings2,
  ShieldCheck, Sparkles, Sprout, Users, WifiOff, X,
} from 'lucide-react';
import type { DiscoveryView, IntroductionView, PlaceInput, SessionView } from '../shared/contracts.js';
import { goalLabels } from '../shared/contracts.js';
import { api, ApiError, errorMessage, type AssistantToken } from './api.js';
import Conversation, { prompts } from './Conversation.js';
import Introductions, { type InboxFilter } from './Introductions.js';
import { ApiDrawer, HowItWorks, IdentityDialog, PrivacyDialog } from './Panels.js';
import { Avatar, Brand, ErrorNotice, firstName, formatDate, Spinner, Toggle, type ActionLock } from './ui.js';

type View = 'discover' | 'introductions';
type Panel = 'identity' | 'how' | 'privacy' | 'api' | null;

function useActionLock(): ActionLock {
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  const begin = useCallback(() => {
    if (active.current) return false;
    active.current = true;
    setBusy(true);
    return true;
  }, []);
  const end = useCallback(() => {
    active.current = false;
    setBusy(false);
  }, []);
  return { busy, begin, end };
}

function initialFilter(): InboxFilter {
  const value = new URLSearchParams(window.location.search).get('box');
  return value === 'outgoing' || value === 'connected' || value === 'history' ? value : 'incoming';
}

function updateUrl(view: View, filter: InboxFilter) {
  const url = new URL(window.location.href);
  if (view === 'introductions') {
    url.searchParams.set('view', 'introductions');
    url.searchParams.set('box', filter);
  } else {
    url.searchParams.delete('view');
    url.searchParams.delete('box');
  }
  window.history.replaceState(null, '', url);
}

export default function App() {
  const [session, setSession] = useState<SessionView | null>(null);
  const sessionRef = useRef<SessionView | null>(null);
  const [booting, setBooting] = useState(true);
  const [starting, setStarting] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [panel, setPanel] = useState<Panel>(null);
  const [view, setView] = useState<View>(() => new URLSearchParams(window.location.search).get('view') === 'introductions' ? 'introductions' : 'discover');
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>(initialFilter);
  const [discoveries, setDiscoveries] = useState<DiscoveryView[]>([]);
  const [requests, setRequests] = useState<IntroductionView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conversationVersion, setConversationVersion] = useState(0);
  const [initialDraft, setInitialDraft] = useState('');
  const [loadingData, setLoadingData] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [introductionError, setIntroductionError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);
  const [placeChoice, setPlaceChoice] = useState('');
  const [coarseLocation, setCoarseLocation] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [tokens, setTokens] = useState<Record<string, AssistantToken>>({});
  const requestVersion = useRef(0);
  const dataController = useRef<AbortController | null>(null);
  const placeSelect = useRef<HTMLSelectElement>(null);
  const lock = useActionLock();

  const activeDiscovery = discoveries.find((discovery) => discovery.id === selectedId) ?? null;
  const selectedCafe = session?.cafes.find((cafe) => cafe.id === placeChoice);
  const location: PlaceInput = placeChoice === 'coarse'
    ? { coarseLocation: coarseLocation.trim() }
    : { cafeId: placeChoice };
  const locationValid = placeChoice === 'coarse' ? coarseLocation.trim().length >= 2 : Boolean(selectedCafe);
  const locationLabel = placeChoice === 'coarse'
    ? coarseLocation.trim() || 'Choose a neighborhood'
    : selectedCafe?.name || 'Choose a café';
  const incomingCount = requests.filter((request) => request.direction === 'incoming' && request.status === 'pending').length;
  const outgoingCount = requests.filter((request) => request.direction === 'outgoing' && request.status === 'pending').length;
  const connectedCount = requests.filter((request) => request.status === 'accepted').length;

  function changeView(next: View) {
    setView(next);
    updateUrl(next, inboxFilter);
  }

  function changeFilter(next: InboxFilter) {
    setInboxFilter(next);
    updateUrl('introductions', next);
  }

  function openIntroductions(request?: IntroductionView) {
    const next = request
      ? request.status === 'accepted' ? 'connected' : request.direction
      : incomingCount > 0 ? 'incoming' : outgoingCount > 0 ? 'outgoing' : connectedCount > 0 ? 'connected' : 'incoming';
    setInboxFilter(next);
    setView('introductions');
    updateUrl('introductions', next);
  }

  async function loadRecords(selectLatest: boolean) {
    dataController.current?.abort();
    const controller = new AbortController();
    dataController.current = controller;
    const version = ++requestVersion.current;
    setLoadingData(true);
    setDiscoveryError(null);
    setIntroductionError(null);
    const [discoveryResult, introductionResult] = await Promise.allSettled([
      api.discoveries(controller.signal),
      api.introductions(controller.signal),
    ]);
    if (version !== requestVersion.current || controller.signal.aborted) return;
    if (discoveryResult.status === 'fulfilled') {
      const saved = discoveryResult.value.discoveries;
      setDiscoveries(saved);
      if (selectLatest) setSelectedId(saved[0]?.id ?? null);
      else setSelectedId((current) => current && saved.some((item) => item.id === current) ? current : null);
    } else {
      setDiscoveryError(errorMessage(discoveryResult.reason));
    }
    if (introductionResult.status === 'fulfilled') {
      setRequests(introductionResult.value.requests);
    } else {
      setIntroductionError(errorMessage(introductionResult.reason));
    }
    setLoadingData(false);
  }

  async function adoptSession(next: SessionView, reset: boolean) {
    const previous = sessionRef.current;
    sessionRef.current = next;
    setSession(next);
    if (previous && previous.worldId !== next.worldId) setTokens({});
    if (reset) {
      setDiscoveries([]);
      setRequests([]);
      setSelectedId(null);
      setConversationVersion((value) => value + 1);
      setPlaceChoice(next.cafes.some((cafe) => cafe.id === next.profile.cafeId) ? next.profile.cafeId : next.cafes[0]?.id ?? '');
      setCoarseLocation(next.cafes.find((cafe) => cafe.id === next.profile.cafeId)?.city ?? next.cafes[0]?.city ?? '');
      setConsentError(null);
      setShowAllHistory(false);
    }
    await loadRecords(reset);
  }

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    void (async () => {
      try {
        const next = await api.session(controller.signal);
        if (!alive) return;
        await adoptSession(next, true);
      } catch (issue) {
        if (!alive) return;
        if (!(issue instanceof ApiError && issue.status === 401)) setPageError(errorMessage(issue));
      } finally {
        if (alive) setBooting(false);
      }
    })();
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    return () => {
      alive = false;
      controller.abort();
      dataController.current?.abort();
      requestVersion.current += 1;
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
    };
  }, []);

  async function startDemo(prompt = '') {
    if (booting || !online || !lock.begin()) return;
    setStarting(true);
    setPageError(null);
    setPanel(null);
    setInitialDraft(prompt);
    changeView('discover');
    try {
      const next = await api.start();
      await adoptSession(next, true);
      if (prompt) setSelectedId(null);
    } catch (issue) {
      setPageError(errorMessage(issue));
    } finally {
      setStarting(false);
      lock.end();
    }
  }

  async function switchIdentity(id: string, inbox = false) {
    if (!sessionRef.current) throw new Error('Your demo session is unavailable. Reload the page to resume.');
    if (!online) throw new Error('Reconnect before switching demo identities.');
    if (!lock.begin()) throw new Error('Please wait for the current request before switching identities.');
    setPageError(null);
    try {
      const next = await api.identity(id, sessionRef.current.csrfToken);
      setInitialDraft('');
      await adoptSession(next, true);
      if (inbox) {
        setView('introductions');
        setInboxFilter('incoming');
        updateUrl('introductions', 'incoming');
      }
      setPanel(null);
    } finally {
      lock.end();
    }
  }

  async function refresh() {
    if (!online || !lock.begin()) return;
    setPageError(null);
    try {
      const next = await api.session();
      const reset = next.profile.id !== sessionRef.current?.profile.id || next.worldId !== sessionRef.current?.worldId;
      await adoptSession(next, reset);
    } catch (issue) {
      if (issue instanceof ApiError && issue.status === 401) {
        sessionRef.current = null;
        setSession(null);
        setDiscoveries([]);
        setRequests([]);
        setTokens({});
        setPanel(null);
        setPageError('Your fictional demo session has expired. Start again to create a new world.');
      } else setPageError(errorMessage(issue));
    } finally {
      lock.end();
    }
  }

  async function updateConsent(discoverable: boolean, introductionsAllowed: boolean) {
    if (!sessionRef.current || !online || !lock.begin()) return;
    setSavingConsent(true);
    setConsentError(null);
    try {
      const next = await api.consent(discoverable, introductionsAllowed, sessionRef.current.csrfToken);
      sessionRef.current = next;
      setSession(next);
      await loadRecords(false);
    } catch (issue) {
      setConsentError(errorMessage(issue));
    } finally {
      setSavingConsent(false);
      lock.end();
    }
  }

  function newConversation() {
    setSelectedId(null);
    setInitialDraft('');
    setConversationVersion((value) => value + 1);
    setContextOpen(false);
    changeView('discover');
  }

  function saveIntroduction(request: IntroductionView) {
    setRequests((current) => [request, ...current.filter((item) => item.id !== request.id)]);
  }

  function editLocation() {
    setContextOpen(true);
    window.setTimeout(() => placeSelect.current?.focus(), 30);
  }

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="site-header">
        <div className="header-inner">
          <button className="brand-button" type="button" aria-label="Third Place home" onClick={() => session ? changeView('discover') : window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Brand />
          </button>
          <nav className="top-nav" aria-label="Main navigation">
            <button type="button" className={panel === null ? 'is-active' : ''} onClick={() => { setPanel(null); if (session) changeView('discover'); }} aria-current={panel === null ? 'page' : undefined}>The demo</button>
            <button type="button" onClick={() => setPanel('how')}>How it works</button>
            <button type="button" onClick={() => setPanel('api')}>For assistants <ArrowUpRight size={13} /></button>
          </nav>
          {session ? (
            <button className="identity-switcher" type="button" onClick={() => setPanel('identity')} disabled={lock.busy || booting} aria-label={`Active demo identity: ${session.profile.name}. Switch identity.`}>
              <Avatar initials={session.profile.initials} color={session.profile.color} />
              <span><small>EXPLORING AS</small><strong>{firstName(session.profile.name)}</strong></span><ChevronDown size={14} />
            </button>
          ) : (
            <span className="header-note"><Sprout size={14} /> Made for real connection</span>
          )}
        </div>
      </header>
      {!online && (
        <div className="offline-banner" role="status"><WifiOff size={16} /> You’re offline. Reconnect to load saved activity or send a request. No live or sample results will be invented.</div>
      )}

      {!session ? (
        <Landing
          booting={booting}
          starting={starting}
          disabled={lock.busy || booting || !online}
          error={pageError}
          onStart={(prompt) => void startDemo(prompt)}
          onHow={() => setPanel('how')}
          onApi={() => setPanel('api')}
          onPrivacy={() => setPanel('privacy')}
        />
      ) : (
        <main id="main-content" className="workspace">
          <div className="demo-banner">
            <span className="demo-badge"><Sprout size={12} /> A FICTIONAL NEIGHBORHOOD</span>
            <p>Real choices. Fictional people, cafés & sample availability.</p>
            <button type="button" className="text-button" onClick={() => setPanel('how')}>Try both sides <ArrowRight size={13} /></button>
          </div>
          <ErrorNotice message={pageError} onRetry={() => void refresh()} retryLabel="Refresh the demo" disabled={lock.busy || !online} />
          <div className="workspace-toolbar">
            <nav className="workspace-tabs" aria-label="Demo views">
              <button className={view === 'discover' ? 'is-active' : ''} type="button" onClick={() => changeView('discover')} disabled={lock.busy} aria-current={view === 'discover' ? 'page' : undefined}><Sparkles size={16} /> Find your people</button>
              <button className={view === 'introductions' ? 'is-active' : ''} type="button" onClick={() => openIntroductions()} disabled={lock.busy} aria-current={view === 'introductions' ? 'page' : undefined}><Inbox size={16} /> Introductions <span className={`inbox-count${incomingCount ? ' has-incoming' : ''}`} aria-label={introductionError ? 'Introduction count unavailable' : `${incomingCount} pending incoming requests`}>{introductionError ? '—' : incomingCount}</span></button>
            </nav>
            <div className="toolbar-actions">
              {connectedCount > 0 && <button type="button" className="connected-link" onClick={() => { setView('introductions'); changeFilter('connected'); }} disabled={lock.busy}><CheckCheck size={15} /> {connectedCount} connected</button>}
              <button className="mobile-context-button icon-button" type="button" aria-label="Your place and privacy choices" aria-expanded={contextOpen} aria-controls="demo-context" onClick={() => setContextOpen(!contextOpen)}><Settings2 size={19} /></button>
              <button type="button" className="icon-button refresh-button" aria-label="Refresh demo session and saved activity" onClick={() => void refresh()} disabled={lock.busy || loadingData || !online}>{loadingData ? <Spinner /> : <RefreshCw size={16} />}</button>
            </div>
          </div>
          <div className="workspace-body">
            <aside className={`context-sidebar${contextOpen ? ' is-open' : ''}`} id="demo-context" aria-label="Your demo place and choices">
              <div className="mobile-context-heading"><strong>Your place & your choices</strong><button type="button" className="icon-button" onClick={() => setContextOpen(false)} aria-label="Close place and choices"><X size={18} /></button></div>
              <div className="place-card">
                <div className="place-illustration"><img src="/cafe-scene.svg" alt="Illustration of a welcoming café, not an actual venue" /><span className="fictional-place">FICTIONAL DEMO SETTING</span></div>
                <div className="place-card-copy">
                  <p className="eyebrow">A PLACE TO START</p>
                  <h3>{selectedCafe?.name || (placeChoice === 'coarse' ? 'Your neighborhood' : 'Somewhere welcoming')}</h3>
                  <p className="place-neighborhood"><MapPin size={12} />{selectedCafe ? `${selectedCafe.neighborhood}, ${selectedCafe.city}` : 'A broad area, not your precise location'}</p>
                  {selectedCafe && <p className="place-description">{selectedCafe.atmosphere || selectedCafe.description}</p>}
                  <label className="field-label" htmlFor="demo-location">Place for your next request</label>
                  <select id="demo-location" ref={placeSelect} value={placeChoice} onChange={(event) => setPlaceChoice(event.target.value)} disabled={lock.busy || booting}>
                    {!placeChoice && <option value="">Choose a café</option>}
                    {session.cafes.map((cafe) => <option key={cafe.id} value={cafe.id}>{cafe.name} · {cafe.neighborhood}</option>)}
                    <option value="coarse">A neighborhood or city…</option>
                  </select>
                  {placeChoice === 'coarse' && (
                    <div className="coarse-location-field">
                      <label className="field-label" htmlFor="coarse-location">Neighborhood or city</label>
                      <input id="coarse-location" className="field-input" type="text" placeholder="e.g. Hyderabad" maxLength={100} value={coarseLocation} onChange={(event) => setCoarseLocation(event.target.value)} disabled={lock.busy} />
                      <p>No address or GPS needed. At least 2 characters.</p>
                    </div>
                  )}
                </div>
              </div>
              <section className="consent-panel" aria-labelledby="consent-title">
                <div className="sidebar-heading"><h3 id="consent-title"><ShieldCheck size={15} /> Your choices</h3>{savingConsent && <Spinner label="Saving consent settings" />}</div>
                <p>For {firstName(session.profile.name)}’s fictional profile. Never real-world enrollment.</p>
                <Toggle label="Let me be discovered" description="Appear in eligible demo matches." checked={session.profile.discoverable} disabled={lock.busy || !online} onChange={() => void updateConsent(!session.profile.discoverable, session.profile.introductionsAllowed)} />
                <Toggle label="Allow introductions" description="Let others ask to connect." checked={session.profile.introductionsAllowed} disabled={lock.busy || !online} onChange={() => void updateConsent(session.profile.discoverable, !session.profile.introductionsAllowed)} />
                <button type="button" className="text-button" onClick={() => setPanel('privacy')}>What gets shared? <ArrowUpRight size={12} /></button>
                <ErrorNotice message={consentError} />
              </section>
              <section className="history-panel" aria-labelledby="history-title">
                <div className="sidebar-heading"><h3 id="history-title"><History size={14} /> Your conversations</h3><button type="button" className="icon-button" aria-label="Start a new conversation" onClick={newConversation} disabled={lock.busy}><Plus size={17} /></button></div>
                {loadingData ? <p className="sidebar-empty">Loading saved conversations…</p> : discoveries.length ? (
                  <>
                    <div className="history-list">
                      {(showAllHistory ? discoveries : discoveries.slice(0, 3)).map((discovery) => (
                        <button
                          key={discovery.id}
                          type="button"
                          className={selectedId === discovery.id ? 'is-active' : ''}
                          disabled={lock.busy}
                          onClick={() => { setSelectedId(discovery.id); setConversationVersion((value) => value + 1); setInitialDraft(''); changeView('discover'); setContextOpen(false); }}
                        >
                          <MessageCircle size={13} />
                          <span><strong>{discovery.intent.message}</strong><small>{goalLabels[discovery.intent.intent.goal]} · {discovery.matches.length} {discovery.matches.length === 1 ? 'match' : 'matches'}</small></span>
                        </button>
                      ))}
                    </div>
                    {discoveries.length > 3 && <button type="button" className="text-button" onClick={() => setShowAllHistory(!showAllHistory)}>{showAllHistory ? 'Show fewer' : `All ${discoveries.length} conversations`}</button>}
                  </>
                ) : <p className="sidebar-empty">{discoveryError ? 'Saved conversations could not be loaded.' : 'Your discoveries will be saved here. A fresh start, without losing your place.'}</p>}
                <button type="button" className="new-conversation" onClick={newConversation} disabled={lock.busy}><Plus size={14} /> New conversation</button>
              </section>
              <div className="sidebar-footer"><Sprout size={17} /><p>Your assistant.<br />Your people. Your world.</p><small>Demo saved until<br />{formatDate(session.expiresAt)}</small></div>
            </aside>
            <div className="main-panel">
              {introductionError && view === 'discover' && (
                <ErrorNotice message={`Saved introductions could not be loaded. Sending is paused until they can be checked. ${introductionError}`} onRetry={() => void refresh()} retryLabel="Reload saved activity" disabled={lock.busy || !online} />
              )}
              {incomingCount > 0 && view === 'discover' && (
                <button className="incoming-banner" type="button" onClick={() => { setView('introductions'); changeFilter('incoming'); }} disabled={lock.busy}>
                  <span className="incoming-icon"><Inbox size={17} /></span><span><strong>A hello is waiting for you.</strong><small>{incomingCount} pending {incomingCount === 1 ? 'introduction' : 'introductions'} for {firstName(session.profile.name)}</small></span><ArrowRight size={17} />
                </button>
              )}
              <div hidden={view !== 'discover'}>
                <Conversation
                  key={`${session.profile.id}:${selectedId ?? 'new'}:${conversationVersion}`}
                  session={session}
                  discovery={activeDiscovery}
                  requests={requests}
                  location={location}
                  locationLabel={locationLabel}
                  locationValid={locationValid}
                  initialDraft={initialDraft}
                  loading={loadingData}
                  loadError={discoveryError}
                  introductionsLoaded={!loadingData && !introductionError}
                  online={online}
                  lock={lock}
                  onDiscovery={(discovery) => { setDiscoveries((current) => [discovery, ...current.filter((item) => item.id !== discovery.id)]); setSelectedId(discovery.id); setInitialDraft(''); }}
                  onIntroduction={saveIntroduction}
                  onSwitchIdentity={switchIdentity}
                  onOpenIntroductions={openIntroductions}
                  onEditLocation={editLocation}
                  onRefresh={() => void refresh()}
                />
              </div>
              <div hidden={view !== 'introductions'}>
                <Introductions key={session.profile.id} session={session} requests={requests} filter={inboxFilter} loading={loadingData} loadError={introductionError} online={online} lock={lock} onFilter={changeFilter} onUpdate={saveIntroduction} onRefresh={() => void refresh()} onDiscover={newConversation} onSwitchIdentity={switchIdentity} />
              </div>
              <div className="workspace-footnote"><span>THE ASSISTANT IS THE INTERFACE.</span><button type="button" onClick={() => setPanel('api')}>Third Place is the connection infrastructure. <ArrowUpRight size={12} /></button></div>
            </div>
          </div>
        </main>
      )}

      {panel === 'identity' && session && <IdentityDialog session={session} lock={lock} online={online} onSwitch={switchIdentity} onClose={() => setPanel(null)} />}
      {panel === 'how' && <HowItWorks onClose={() => setPanel(null)} onStart={() => void startDemo()} hasSession={Boolean(session)} />}
      {panel === 'privacy' && <PrivacyDialog session={session} onClose={() => setPanel(null)} />}
      {panel === 'api' && <ApiDrawer session={session} token={session ? tokens[session.profile.id] ?? null : null} lock={lock} online={online} onToken={(token) => {
        if (!session) return;
        setTokens((current) => {
          const next = { ...current };
          if (token) next[session.profile.id] = token;
          else delete next[session.profile.id];
          return next;
        });
      }} onClose={() => setPanel(null)} onStart={() => void startDemo()} />}
    </>
  );
}

function Landing({
  booting, starting, disabled, error, onStart, onHow, onApi, onPrivacy,
}: {
  booting: boolean;
  starting: boolean;
  disabled: boolean;
  error: string | null;
  onStart: (prompt?: string) => void;
  onHow: () => void;
  onApi: () => void;
  onPrivacy: () => void;
}) {
  return (
    <main id="main-content" className="landing">
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-eyebrow"><span /><span>LESS SCROLLING. MORE BELONGING.</span></span>
          <h1>Meet people who <em>share your interests,</em> wherever life brings you together.</h1>
          <p className="hero-subtitle">Your assistant. Your people. Your world.</p>
          <p className="hero-description">A coffee. A shared curiosity. A reason to say hello.<br />Find meaningful connections in the places life takes you—with a little help from your assistant.</p>
          <div className="hero-actions">
            <button type="button" className="button button--primary button--hero" onClick={() => onStart()} disabled={disabled}>
              {booting || starting ? <Spinner /> : <Sparkles size={17} />}
              {booting ? 'Finding your saved place…' : starting ? 'Preparing your fictional world…' : 'Try the fictional demo'}
              {!booting && !starting && <ArrowRight size={17} />}
            </button>
            <button type="button" className="hero-how" onClick={onHow}>How it works <ArrowUpRight size={14} /></button>
          </div>
          <p className="hero-disclosure"><ShieldCheck size={14} /> Fictional people & places. No real people or live availability.</p>
          <ErrorNotice message={error} />
          <div className="hero-bottom-note"><span className="tiny-flower">✳</span><span>Not another social network.<br /><strong>A little more life, beyond the screen.</strong></span></div>
        </div>
        <div className="hero-art">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <span className="art-side-label">THERE’S A PLACE FOR YOUR PEOPLE.</span>
          <div className="art-note"><Coffee size={17} /><span>Good coffee.<br /><strong>Even better company.</strong></span><Sparkles size={14} /></div>
          <img src="/cafe-scene.svg" className="hero-cafe" alt="Original illustration of a warm café courtyard with a striped sage awning, plants, and two cups waiting at a table" fetchPriority="high" />
          <div className="art-caption"><span className="caption-mark"><Users size={22} strokeWidth={1.4} /></span><div><p>A seat at the table.</p><span>A possibility, not a promise.</span></div><Heart size={17} strokeWidth={1.5} /></div>
        </div>
      </section>
      <section className="possibilities" aria-labelledby="possibilities-title">
        <div><p className="eyebrow">START WITH A LITTLE CURIOSITY</p><h2 id="possibilities-title">What brings <em>you</em> here?</h2></div>
        <div className="landing-prompts">
          {prompts.slice(0, 3).map(({ label, message, icon: Icon }) => (
            <button key={label} type="button" onClick={() => onStart(message)} disabled={disabled}><Icon size={18} strokeWidth={1.5} /><span>{label}</span><ArrowUpRight size={15} /></button>
          ))}
        </div>
      </section>
      <section className="landing-principles" aria-label="The Third Place approach">
        <article><MessageCircle size={22} strokeWidth={1.4} /><span>01</span><h3>Your words, not a profile.</h3><p>Start with what you’d love to do or talk about. Your intention is enough.</p></article>
        <article><Sprout size={22} strokeWidth={1.4} /><span>02</span><h3>Common ground, thoughtfully found.</h3><p>Understand why a connection might fit—not just a name on a screen.</p></article>
        <article><Heart size={22} strokeWidth={1.4} /><span>03</span><h3>A hello that goes both ways.</h3><p>You ask. They choose. Every introduction starts with mutual consent.</p></article>
      </section>
      <section className="landing-infrastructure">
        <Code2 size={26} strokeWidth={1.4} /><div><h2>The assistant is the interface.<br /><em>Third Place is the connection infrastructure.</em></h2><p>This web experience is a conversation and consent surface. The possibilities go beyond it.</p></div><button type="button" className="button button--secondary" onClick={onApi}>Explore the API <ArrowUpRight size={15} /></button>
      </section>
      <footer className="site-footer"><Brand /><p>A little more in common. A little less alone.</p><button type="button" onClick={onPrivacy}><ShieldCheck size={13} /> Consent & privacy</button></footer>
    </main>
  );
}
