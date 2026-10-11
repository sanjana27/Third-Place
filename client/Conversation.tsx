import { useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight, ArrowUp, BookOpen, Check, CheckCheck, ChevronDown, Clock3,
  Coffee, Heart, Lightbulb, MapPin, MessageCircle, ShieldCheck, Sparkles,
  Sprout, Users, WandSparkles,
} from 'lucide-react';
import {
  goalLabels, goals, kindLabels,
  type DiscoveryView, type Goal, type IntroductionView, type IntentView,
  type MatchCard, type PlaceInput, type SessionView,
} from '../shared/contracts.js';
import { api, errorMessage } from './api.js';
import { Avatar, Brand, Dialog, ErrorNotice, firstName, formatDate, Spinner, type ActionLock } from './ui.js';

export const prompts = [
  { label: 'Coffee & big ideas', message: 'I’d love to talk about AI and startups over coffee this afternoon.', icon: Coffee },
  { label: 'New city, new friends', message: 'I’m new to Hyderabad and would love to meet people who enjoy running.', icon: Heart },
  { label: 'Books & deeper conversations', message: 'Find a small group to talk about books and philosophy this afternoon.', icon: BookOpen },
  { label: 'Meet fellow builders', message: 'I’m at a cafe and want to meet startup builders to collaborate on an idea.', icon: Lightbulb },
  { label: 'A little café community', message: 'I’d like to join a community event at a cafe and meet new people.', icon: Users },
];

const goalIcons = {
  exchange_ideas: Lightbulb,
  make_friends: Heart,
  collaborate: Sprout,
  shared_activity: Coffee,
};

interface ConversationProps {
  session: SessionView;
  discovery: DiscoveryView | null;
  requests: IntroductionView[];
  location: PlaceInput;
  locationLabel: string;
  locationValid: boolean;
  initialDraft: string;
  loading: boolean;
  loadError: string | null;
  introductionsLoaded: boolean;
  online: boolean;
  lock: ActionLock;
  onDiscovery: (discovery: DiscoveryView) => void;
  onIntroduction: (introduction: IntroductionView) => void;
  onSwitchIdentity: (id: string, inbox?: boolean) => Promise<void>;
  onOpenIntroductions: (request?: IntroductionView) => void;
  onEditLocation: () => void;
  onRefresh: () => void;
}

export default function Conversation({
  session, discovery, requests, location, locationLabel, locationValid, initialDraft,
  loading, loadError, introductionsLoaded, online, lock, onDiscovery, onIntroduction, onSwitchIdentity,
  onOpenIntroductions, onEditLocation, onRefresh,
}: ConversationProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [submitted, setSubmitted] = useState('');
  const [intent, setIntent] = useState<IntentView | null>(null);
  const [goal, setGoal] = useState<Goal>('exchange_ideas');
  const [parsing, setParsing] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<MatchCard | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const visibleIntent = intent ?? discovery?.intent;
  const message = parsing ? submitted : visibleIntent?.message;
  const disabled = lock.busy || !online || loading;

  async function parse(event: FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (disabled || value.length < 8 || !locationValid || !lock.begin()) return;
    setError(null);
    setSubmitted(value);
    setParsing(true);
    try {
      const result = await api.intent(value, location, undefined, session.csrfToken);
      setIntent(result);
      setGoal(result.intent.goal);
      setDraft('');
      if (composer.current) composer.current.style.height = '';
      window.setTimeout(() => confirmation.current?.focus({ preventScroll: false }), 40);
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setParsing(false);
      lock.end();
    }
  }

  async function discover() {
    if (disabled || !intent || !lock.begin()) return;
    setDiscovering(true);
    setError(null);
    try {
      const result = await api.discover(intent.id, goal, session.csrfToken);
      onDiscovery(result);
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setDiscovering(false);
      lock.end();
    }
  }

  function choosePrompt(value: string) {
    setDraft(value);
    composer.current?.focus();
  }

  return (
    <div className="conversation">
      <div className="conversation-topline">
        <span><Brand compact /> YOUR CONNECTION COMPANION</span>
        <span className="quiet-label"><ShieldCheck size={13} /> Consent comes first</span>
      </div>

      {loading ? (
        <div className="thread-loading" role="status" aria-live="polite">
          <Spinner label="Loading saved conversations" />
          <p>Finding where you left off…</p>
          <span>Your conversations are loaded from your saved demo world.</span>
        </div>
      ) : (
        <div className="chat-thread">
          <ErrorNotice message={loadError} onRetry={onRefresh} retryLabel="Reload saved conversations" disabled={disabled} />
          {!message && (
            <div className="welcome-message">
              <span className="welcome-spark"><Sparkles size={24} strokeWidth={1.4} /></span>
              <p className="eyebrow">A SMALL HELLO. A WORLD OF POSSIBILITY.</p>
              <h2>Your people.<br /><em>A little closer.</em></h2>
              <p className="welcome-copy">
                Hi {firstName(session.profile.name)}. What would you love to do—or talk about?
                Let’s find a little common ground.
              </p>
              <div className="prompt-grid" aria-label="Conversation starters">
                {prompts.map(({ label, message: example, icon: Icon }) => (
                  <button
                    key={label}
                    type="button"
                    className="prompt-card"
                    onClick={() => choosePrompt(example)}
                    disabled={disabled}
                  >
                    <Icon size={18} strokeWidth={1.6} />
                    <span>{label}</span>
                    <ArrowUp size={14} className="prompt-arrow" />
                  </button>
                ))}
              </div>
              <p className="welcome-note">Not a feed. Not a friend count. Just a reason to connect.</p>
            </div>
          )}

          {message && (
            <div className="user-turn">
              <div className="user-bubble">
                <p>{message}</p>
                <span>{parsing ? locationLabel : visibleIntent?.locationLabel}<MapPin size={11} /></span>
              </div>
              <Avatar initials={session.profile.initials} color={session.profile.color} />
            </div>
          )}

          {parsing && (
            <div className="assistant-turn assistant-working" role="status" aria-live="polite">
              <Brand compact />
              <div><span className="thinking-dots"><i /><i /><i /></span><p>Finding the intention in your words…</p></div>
            </div>
          )}

          {!parsing && intent && (
            <div className="assistant-turn">
              <Brand compact />
              <div className="intent-card" tabIndex={-1} ref={confirmation}>
                <span className="eyebrow">LET’S MAKE SURE WE’RE ON THE SAME PAGE</span>
                <h3>Here’s what I heard.</h3>
                <p className="muted">A starting point for a connection that feels like you.</p>
                <div className="intent-topics">
                  {intent.intent.topics.length > 0 ? intent.intent.topics.map((topic) => (
                    <span className="topic-tag" key={topic}>{topic}</span>
                  )) : <span className="topic-tag">Open conversation</span>}
                </div>
                <div className="intent-facts">
                  <span><MapPin size={15} />{intent.locationLabel}</span>
                  <span title={`${formatDate(intent.intent.startsAt)} – ${formatDate(intent.intent.endsAt)}`}>
                    <Clock3 size={15} />{intent.intent.timeLabel}
                  </span>
                  <span><Coffee size={15} />{intent.intent.activity === 'any' ? 'Open to any activity' : intent.intent.activity}</span>
                  <span><Users size={15} />{kindLabels[intent.intent.kind]}</span>
                </div>
                <fieldset className="goal-picker">
                  <legend>What would make this a good connection?</legend>
                  <div className="goal-options">
                    {goals.map((value) => {
                      const Icon = goalIcons[value];
                      return (
                        <label key={value} className={`goal-choice${goal === value ? ' is-selected' : ''}`}>
                          <input
                            type="radio"
                            name={`goal-${intent.id}`}
                            value={value}
                            checked={goal === value}
                            onChange={() => setGoal(value)}
                            disabled={disabled}
                          />
                          <Icon size={16} />
                          <span>{goalLabels[value]}</span>
                          {goal === value && <Check size={14} />}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <p className="intent-model"><Sparkles size={12} /> Interpreted with {intent.model}</p>
                <div className="intent-actions">
                  <button className="button button--primary" type="button" onClick={() => void discover()} disabled={disabled}>
                    {discovering ? <Spinner /> : <Sparkles size={16} />}
                    {discovering ? 'Looking for common ground…' : 'Find my people'}
                    {!discovering && <ArrowRight size={16} />}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={disabled}
                    onClick={() => choosePrompt(intent.message)}
                  >
                    Edit my request
                  </button>
                </div>
                <p className="privacy-micro"><ShieldCheck size={12} /> Discovery never sends an introduction.</p>
              </div>
            </div>
          )}

          {!parsing && !intent && discovery && (
            <div className="discovery-result">
              <div className="assistant-turn">
                <Brand compact />
                <div className="discovery-intro">
                  <span className="eyebrow">A LITTLE COMMON GROUND</span>
                  <h3>{discovery.matches.length ? 'Good company could start here.' : 'A different path might open a door.'}</h3>
                  <p>{discovery.summary}</p>
                  <div className="discovery-context">
                    <span><Lightbulb size={13} /> {goalLabels[discovery.intent.intent.goal]}</span>
                    <span><Clock3 size={13} /> {discovery.intent.intent.timeLabel}</span>
                    <button
                      type="button"
                      className="text-button"
                      disabled={disabled}
                      onClick={() => {
                        setIntent(discovery.intent);
                        setGoal(discovery.intent.intent.goal);
                        setError(null);
                      }}
                    >
                      Change goal
                    </button>
                  </div>
                  <p className="provenance">
                    <Sparkles size={12} /> {discovery.model}
                    <span>·</span><CheckCheck size={13} /> Saved {formatDate(discovery.createdAt)}
                  </p>
                </div>
              </div>

              <div className="results-disclosure"><Sprout size={15} /><span>Fictional people, places & gatherings. Sample availability—not who’s here now.</span></div>

              {discovery.matches.length === 0 ? (
                <div className="empty-state">
                  <Coffee size={33} strokeWidth={1.3} />
                  <h3>No eligible demo matches this time.</h3>
                  <p>Try another topic, a broader neighborhood, or a different time. We won’t fill the space with invented matches.</p>
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={disabled}
                    onClick={() => choosePrompt('I’d like to meet someone for coffee and conversation this afternoon.')}
                  >
                    Try a broader request <ArrowRight size={15} />
                  </button>
                </div>
              ) : (
                <div className="match-grid">
                  {discovery.matches.map((match) => {
                    const existing = requests.find((request) =>
                      (request.status === 'pending' || request.status === 'accepted') &&
                      (request.sender.id === match.profileId || request.recipient.id === match.profileId),
                    );
                    return (
                      <Match
                        key={match.id}
                        match={match}
                        existing={existing}
                        disabled={disabled || !introductionsLoaded}
                        consentAllowed={session.profile.introductionsAllowed}
                        onIntroduce={() => setSelectedMatch(match)}
                        onOpenIntroductions={onOpenIntroductions}
                      />
                    );
                  })}
                </div>
              )}
              <div className="results-footer">
                <ShieldCheck size={16} />
                <p>You choose who to approach. They choose whether to connect.<br /><strong>A match is a possibility, never a promise.</strong></p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="composer-area">
        <ErrorNotice message={error} />
        {!online && <p className="offline-composer">You’re offline. Your draft stays here; reconnect before sending.</p>}
        <form onSubmit={(event) => void parse(event)} className="composer-form">
          <label className="sr-only" htmlFor="connection-message">What would you like to do or talk about?</label>
          <textarea
            ref={composer}
            id="connection-message"
            placeholder={message ? 'Another idea? Tell me what you have in mind…' : '“I’d love to talk startups over a coffee…”'}
            value={draft}
            minLength={8}
            maxLength={600}
            rows={2}
            disabled={lock.busy || loading}
            aria-describedby="composer-hint"
            onChange={(event) => setDraft(event.target.value)}
            onInput={(event) => {
              event.currentTarget.style.height = 'auto';
              event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 150)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="composer-bottom">
            <button type="button" className="composer-place" onClick={onEditLocation} disabled={lock.busy}>
              <MapPin size={14} /><span>{locationValid ? locationLabel : 'Choose a place'}</span><ChevronDown size={12} />
            </button>
            <div className="composer-send">
              {draft.length > 450 && <span className="character-count">{draft.length}/600</span>}
              <button
                type="submit"
                className="send-button"
                aria-label="Send message to Third Place"
                disabled={disabled || draft.trim().length < 8 || !locationValid}
              >
                {parsing ? <Spinner /> : <ArrowUp size={22} />}
              </button>
            </div>
          </div>
        </form>
        <p className="composer-hint" id="composer-hint">
          <ShieldCheck size={11} /> Fictional demo only. Nothing is sent to another profile without your confirmation.
        </p>
      </div>

      {selectedMatch && discovery && (
        <IntroductionDialog
          match={selectedMatch}
          discoveryId={discovery.id}
          session={session}
          lock={lock}
          online={online}
          onClose={() => setSelectedMatch(null)}
          onIntroduction={onIntroduction}
          onSwitchIdentity={onSwitchIdentity}
        />
      )}
    </div>
  );
}

function Match({
  match, existing, disabled, consentAllowed, onIntroduce, onOpenIntroductions,
}: {
  match: MatchCard;
  existing?: IntroductionView;
  disabled: boolean;
  consentAllowed: boolean;
  onIntroduce: () => void;
  onOpenIntroductions: (request?: IntroductionView) => void;
}) {
  const group = match.kind !== 'one_to_one';
  const full = match.seatsRemaining !== null && match.seatsRemaining <= 0;
  return (
    <article className={`match-card${group ? ' match-card--group' : ''}`}>
      <div className="match-kind">
        <span>{group ? <Users size={13} /> : <MessageCircle size={13} />}{kindLabels[match.kind]}</span>
        <span className="fictional-label">FICTIONAL</span>
      </div>
      <div className="match-person">
        <Avatar initials={match.initials} color={match.color} large />
        <div>
          <h3>{match.gatheringTitle || match.name}</h3>
          {match.gatheringTitle && <p className="host-label">Hosted by {match.name}</p>}
          <p>{match.bio}</p>
        </div>
      </div>
      <div className="match-place"><Coffee size={14} /><strong>{match.cafeName}</strong><span>· {match.location}</span></div>
      <div className="shared-topics">
        {match.sharedTopics.map((topic) => <span className="topic-tag" key={topic}>{topic}</span>)}
      </div>
      <p className="match-explanation">{match.explanation}</p>
      <details className="match-evidence">
        <summary><ShieldCheck size={13} /> Why this match? <span>View recorded facts</span><ChevronDown size={13} /></summary>
        <div>
          <p>Grounded in stored fictional demo records, not inferred personal traits.</p>
          {match.evidence.length ? (
            <ul>{match.evidence.map((fact) => <li key={fact.id}>{fact.text}</li>)}</ul>
          ) : <p>No additional evidence was provided for this match.</p>}
        </div>
      </details>
      <div className="match-availability">
        <Clock3 size={14} />
        <div><span>{match.availability}</span><small>Sample availability · not live</small></div>
      </div>
      {group && (
        <div className="gathering-meta">
          {match.gatheringTime && <span><Clock3 size={13} />{formatDate(match.gatheringTime)}</span>}
          {match.seatsRemaining !== null && <span><Users size={13} />{match.seatsRemaining} demo {match.seatsRemaining === 1 ? 'seat' : 'seats'} remaining</span>}
        </div>
      )}
      <div className="icebreaker">
        <span><WandSparkles size={13} /> A LITTLE HELP WITH HELLO</span>
        <p>“{match.icebreaker}”</p>
      </div>
      {existing ? (
        <button type="button" className={`button button--wide ${existing.status === 'accepted' ? 'button--sage' : 'button--secondary'}`} onClick={() => onOpenIntroductions(existing)} disabled={disabled}>
          {existing.status === 'accepted' ? <CheckCheck size={16} /> : <Clock3 size={16} />}
          {existing.status === 'accepted' ? 'Connected in the demo' : existing.direction === 'incoming' ? 'Respond in your inbox' : 'Introduction pending'}
          <ArrowRight size={15} />
        </button>
      ) : (
        <button type="button" className="button button--primary button--wide" onClick={onIntroduce} disabled={disabled || !consentAllowed || full}>
          {full ? 'Demo gathering is full' : 'Ask for an introduction'}{!full && <ArrowUp size={15} className="diagonal-arrow" />}
        </button>
      )}
      {!consentAllowed && !existing && <p className="consent-warning">Enable introduction requests in “Your choices” to take this step.</p>}
    </article>
  );
}

function IntroductionDialog({
  match, discoveryId, session, lock, online, onClose, onIntroduction, onSwitchIdentity,
}: {
  match: MatchCard;
  discoveryId: string;
  session: SessionView;
  lock: ActionLock;
  online: boolean;
  onClose: () => void;
  onIntroduction: (introduction: IntroductionView) => void;
  onSwitchIdentity: (id: string, inbox?: boolean) => Promise<void>;
}) {
  const [message, setMessage] = useState(match.icebreaker.slice(0, 400));
  const [sent, setSent] = useState<IntroductionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [switching, setSwitching] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!online || !message.trim() || !lock.begin()) return;
    setSending(true);
    setError(null);
    try {
      const result = await api.introduce(discoveryId, match.id, message.trim(), session.csrfToken);
      onIntroduction(result);
      setSent(result);
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setSending(false);
      lock.end();
    }
  }

  async function switchToRecipient() {
    if (!sent) return;
    setSwitching(true);
    setError(null);
    try {
      await onSwitchIdentity(sent.recipient.id, true);
      onClose();
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setSwitching(false);
    }
  }

  return (
    <Dialog title={sent ? 'A hello is on its way.' : 'A hello, with your say-so.'} eyebrow="A MUTUAL INTRODUCTION" onClose={onClose} busy={lock.busy}>
      {sent ? (
        <div className="sent-confirmation">
          <span className="success-emblem"><Check size={26} /></span>
          <p className="status-pill status-pill--pending"><Clock3 size={13} /> Pending their consent</p>
          <p>Your introduction request to <strong>{sent.recipient.name}</strong> is saved. A connection is created only if they accept.</p>
          <blockquote>{sent.message}</blockquote>
          <div className="judge-guidance">
            <span className="eyebrow">TRY THE OTHER SIDE OF THE HELLO</span>
            <p>In this fictional world, you can switch to the recipient and choose whether to accept. Then reload to see your saved connection.</p>
            <button type="button" className="button button--primary button--wide" onClick={() => void switchToRecipient()} disabled={lock.busy || !online}>
              {switching ? <Spinner /> : <Users size={16} />}
              Switch to {firstName(sent.recipient.name)} to respond
              <ArrowRight size={16} />
            </button>
          </div>
          <button type="button" className="text-button" onClick={onClose} disabled={lock.busy}>Stay as {firstName(session.profile.name)}</button>
        </div>
      ) : (
        <form onSubmit={(event) => void send(event)}>
          <p className="dialog-copy">A small note can be the start of something good. Make this one yours before sending.</p>
          <div className="intro-recipient">
            <Avatar initials={match.initials} color={match.color} />
            <div><strong>To {match.name}</strong><span>{match.gatheringTitle || match.cafeName} · Fictional demo</span></div>
          </div>
          <label className="field-label" htmlFor="introduction-message">Your introduction, as {session.profile.name}</label>
          <textarea id="introduction-message" className="field-textarea" rows={5} maxLength={400} required value={message} onChange={(event) => setMessage(event.target.value)} disabled={lock.busy} />
          <p className="field-counter">{message.length}/400</p>
          <div className="consent-callout"><ShieldCheck size={20} /><p>This sends a <strong>request</strong>, not a connection. {firstName(match.name)} must accept. No contact details are shared.</p></div>
          <div className="dialog-actions">
            <button className="button button--secondary" type="button" onClick={onClose} disabled={lock.busy}>Not yet</button>
            <button className="button button--primary" type="submit" disabled={lock.busy || !online || !message.trim()}>
              {sending ? <Spinner /> : <ArrowUp size={16} className="diagonal-arrow" />}{sending ? 'Sending your request…' : 'Send introduction'}
            </button>
          </div>
        </form>
      )}
      <ErrorNotice message={error} />
    </Dialog>
  );
}
