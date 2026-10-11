import { useState } from 'react';
import {
  ArrowRight, BookOpen, Check, Code2, Copy, ExternalLink, Eye, EyeOff,
  Heart, KeyRound, MessageCircle, ShieldCheck, Sparkles, Trash2, Users,
} from 'lucide-react';
import type { SessionView } from '../shared/contracts.js';
import { api, errorMessage, type AssistantToken } from './api.js';
import { Avatar, Dialog, ErrorNotice, formatDate, Spinner, type ActionLock } from './ui.js';

export function IdentityDialog({
  session, lock, online, onSwitch, onClose,
}: {
  session: SessionView;
  lock: ActionLock;
  online: boolean;
  onSwitch: (id: string, inbox?: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function select(id: string) {
    if (id === session.profile.id) { onClose(); return; }
    setSwitching(id);
    setError(null);
    try {
      await onSwitch(id);
      onClose();
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setSwitching(null);
    }
  }
  return (
    <Dialog title="A different seat at the table." eyebrow="EXPLORE YOUR FICTIONAL WORLD" onClose={onClose} busy={lock.busy}>
      <p className="dialog-copy">Try both sides of an introduction. Each fictional identity has its own saved searches, requests, and consent settings.</p>
      <div className="identity-list">
        {session.profiles.map((profile) => (
          <button type="button" key={profile.id} className={`identity-option${profile.id === session.profile.id ? ' is-selected' : ''}`} onClick={() => void select(profile.id)} disabled={lock.busy || !online}>
            <Avatar initials={profile.initials} color={profile.color} />
            <span className="identity-details">
              <strong>{profile.name}</strong><span>{profile.bio}</span>
              <small>{!profile.discoverable ? 'Discovery off' : 'Discovery on'} · {!profile.introductionsAllowed ? 'Introductions off' : 'Introductions on'}</small>
            </span>
            {switching === profile.id ? <Spinner /> : profile.id === session.profile.id ? <span className="current-identity"><Check size={14} /> You</span> : <ArrowRight size={16} />}
          </button>
        ))}
      </div>
      <p className="privacy-micro"><ShieldCheck size={13} /> These are demo fixtures, not real or currently available people. Some profiles intentionally have no eligible availability.</p>
      <ErrorNotice message={error} />
    </Dialog>
  );
}

export function HowItWorks({ onClose, onStart, hasSession }: {
  onClose: () => void;
  onStart: () => void;
  hasSession: boolean;
}) {
  return (
    <Dialog title="Less scrolling. More belonging." eyebrow="HOW THIRD PLACE WORKS" onClose={onClose} drawer>
      <p className="dialog-copy">A thought becomes an intention. A shared interest becomes a possibility. A mutual yes becomes a connection.</p>
      <ol className="how-steps">
        <li><span><MessageCircle size={21} /></span><div><h3>Start with what’s on your mind.</h3><p>Use natural language—coffee and AI, a running companion, or a small book group. Confirm the topics, time, and kind of connection.</p></div></li>
        <li><span><Sparkles size={21} /></span><div><h3>Find some common ground.</h3><p>Review eligible fictional profiles and gatherings. See the stored facts behind each match and a personalized way to break the ice.</p></div></li>
        <li><span><Heart size={21} /></span><div><h3>Make the hello mutual.</h3><p>Edit the introduction and choose to send it. Nothing connects until the recipient accepts. No contact details are revealed.</p></div></li>
      </ol>
      <div className="judge-guidance">
        <p className="eyebrow">THE TWO-SIDED DEMO, IN A MINUTE</p>
        <p>Send an introduction → choose <strong>“Switch to the recipient to respond”</strong> → open the inbox → accept → reload. The connected state is saved, not simulated in your browser.</p>
      </div>
      <div className="infrastructure-note">
        <Code2 size={20} /><h3>The assistant is the interface.<br />Third Place is the connection infrastructure.</h3>
        <p>This web conversation is a demo and consent surface, not a new social network. The API is designed for user-authorized assistants, without claiming official integrations.</p>
      </div>
      <button type="button" className="button button--primary button--wide" onClick={hasSession ? onClose : onStart}>
        {hasSession ? 'Back to my people' : 'Try the fictional demo'}<ArrowRight size={16} />
      </button>
    </Dialog>
  );
}

export function PrivacyDialog({ session, onClose }: { session: SessionView | null; onClose: () => void }) {
  return (
    <Dialog title="Your world. Your say." eyebrow="CONSENT IS THE STARTING POINT" onClose={onClose} drawer>
      <p className="dialog-copy">A meaningful connection should feel welcome on both sides. Here’s what that means in this demo.</p>
      <div className="privacy-principles">
        <article><ShieldCheck size={23} /><div><h3>Opt in, not swept in.</h3><p>“Your choices” controls whether the active fictional profile can be discovered and receive introductions. These settings never enroll your real identity.</p></div></article>
        <article><Users size={23} /><div><h3>A match isn’t permission.</h3><p>You review and explicitly send each request. The recipient chooses whether to accept or decline. A pending request is not a connection.</p></div></article>
        <article><Eye size={23} /><div><h3>Context, not contact details.</h3><p>Cards show fictional interests, cafés, explanations, and sample availability. Even an accepted introduction does not expose a phone number, email address, or precise real location.</p></div></article>
        <article><BookOpen size={23} /><div><h3>Saved, not made up on refresh.</h3><p>Your fictional world, completed discoveries, and requests are stored by the demo backend. Errors are shown explicitly; the browser never substitutes fabricated results.</p></div></article>
        <article><KeyRound size={23} /><div><h3>Assistant access is your decision.</h3><p>A demo API token is created only on your explicit authorization, bound to the active fictional identity, and revocable. This is not production OAuth.</p></div></article>
      </div>
      {session && <p className="session-expiry">This fictional demo session expires {formatDate(session.expiresAt)}.</p>}
    </Dialog>
  );
}

export function ApiDrawer({
  session, token, lock, online, onToken, onClose, onStart,
}: {
  session: SessionView | null;
  token: AssistantToken | null;
  lock: ActionLock;
  online: boolean;
  onToken: (token: AssistantToken | null) => void;
  onClose: () => void;
  onStart: () => void;
}) {
  const [label, setLabel] = useState('My assistant demo');
  const [revealed, setRevealed] = useState(false);
  const [includeToken, setIncludeToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<'mint' | 'revoke' | null>(null);
  const [copied, setCopied] = useState<'token' | 'curl' | null>(null);
  const example = `curl "${window.location.origin}/api/v1/me" \\\n  -H "Authorization: Bearer ${includeToken && token ? token.token : 'YOUR_DEMO_TOKEN'}"`;

  async function create() {
    if (!session || !label.trim() || !online || !lock.begin()) return;
    setWorking('mint');
    setError(null);
    try {
      onToken(await api.token(label.trim(), session.csrfToken));
      setRevealed(false);
      setCopied(null);
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setWorking(null);
      lock.end();
    }
  }

  async function revoke() {
    if (!session || !token || !online || !lock.begin()) return;
    setWorking('revoke');
    setError(null);
    try {
      await api.revokeToken(token.id, session.csrfToken);
      onToken(null);
      setIncludeToken(false);
      setCopied(null);
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setWorking(null);
      lock.end();
    }
  }

  async function copy(value: string, kind: 'token' | 'curl') {
    setError(null);
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      setError('Your browser blocked clipboard access. Select the example to copy it manually, or reveal and select the token.');
    }
  }

  return (
    <Dialog title="Your assistant. Our connection layer." eyebrow="BUILT TO WORK BEYOND THIS WINDOW" drawer onClose={onClose} busy={lock.busy}>
      <p className="dialog-copy">A conversation can begin in any assistant. Third Place provides the intent, discovery, and mutual-introduction API behind it.</p>
      <div className="api-flow"><span>Understand</span><ArrowRight size={14} /><span>Discover</span><ArrowRight size={14} /><span>Ask & accept</span></div>
      <div className="api-endpoints">
        <div><code>POST /api/v1/intents</code><span>Turn a message into a confirmed intention.</span></div>
        <div><code>POST /api/v1/discoveries</code><span>Find eligible, explainable demo matches.</span></div>
        <div><code>POST /api/v1/introductions</code><span>Request a connection, with permission.</span></div>
      </div>
      <a className="button button--secondary button--wide" href="/openapi.json" target="_blank" rel="noreferrer">
        <Code2 size={16} /> Open API specification <ExternalLink size={14} />
      </a>
      <section className="token-panel" aria-labelledby="token-heading">
        <span className="eyebrow">EXPLICIT, IDENTITY-BOUND AUTHORIZATION</span>
        <h3 id="token-heading">Invite your assistant in.</h3>
        <p>A short-lived demo token authorizes access only as your current fictional identity. It is not OAuth, a production credential, or an official third-party integration.</p>
        {session ? (
          <>
            <div className="token-identity"><Avatar initials={session.profile.initials} color={session.profile.color} /><span>Authorize as <strong>{session.profile.name}</strong><small>Fictional demo identity only</small></span></div>
            {token ? (
              <>
                <label className="field-label" htmlFor="assistant-secret">Your demo bearer token</label>
                <div className="secret-field">
                  <input id="assistant-secret" type={revealed ? 'text' : 'password'} value={token.token} readOnly autoComplete="off" spellCheck={false} onFocus={(event) => event.currentTarget.select()} />
                  <button className="icon-button" type="button" aria-label={revealed ? 'Hide token' : 'Reveal token'} onClick={() => setRevealed(!revealed)}>{revealed ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                  <button className="icon-button" type="button" aria-label="Copy demo token" onClick={() => void copy(token.token, 'token')}>{copied === 'token' ? <Check size={17} /> : <Copy size={17} />}</button>
                </div>
                <p className="token-expiry">Expires {formatDate(token.expiresAt)}. Kept only in this tab’s memory; reloading hides the secret.</p>
                <button className="text-button text-button--danger" type="button" onClick={() => void revoke()} disabled={lock.busy || !online}>
                  {working === 'revoke' ? <Spinner /> : <Trash2 size={14} />} Revoke this token
                </button>
              </>
            ) : (
              <>
                <label className="field-label" htmlFor="token-label">A label for this authorization</label>
                <input id="token-label" className="field-input" value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} disabled={lock.busy} />
                <button className="button button--primary button--wide" type="button" onClick={() => void create()} disabled={lock.busy || !online || !label.trim()}>
                  {working === 'mint' ? <Spinner /> : <KeyRound size={16} />} Authorize & create demo token
                </button>
              </>
            )}
          </>
        ) : (
          <button className="button button--primary button--wide" type="button" onClick={onStart} disabled={lock.busy || !online}>Try the demo before authorizing <ArrowRight size={16} /></button>
        )}
      </section>
      <div className="code-heading"><span>TRY AN AUTHENTICATED REQUEST</span><button type="button" className="icon-button" aria-label="Copy curl example" onClick={() => void copy(example, 'curl')}>{copied === 'curl' ? <Check size={15} /> : <Copy size={15} />}</button></div>
      <pre className="code-example"><code>{example}</code></pre>
      {token && (
        <label className="checkbox-label"><input type="checkbox" checked={includeToken} onChange={(event) => { setIncludeToken(event.target.checked); setCopied(null); }} />Include my authorized token in this example</label>
      )}
      <p className="privacy-micro"><ShieldCheck size={13} /> Tokens are never logged or saved to browser storage. Treat a copied token as a secret until it expires or you revoke it.</p>
      {copied && <p className="copy-confirmation" role="status"><Check size={13} /> {copied === 'token' ? 'Demo token' : 'Example'} copied to clipboard.</p>}
      <ErrorNotice message={error} />
    </Dialog>
  );
}
