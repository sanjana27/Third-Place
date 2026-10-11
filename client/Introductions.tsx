import { useState } from 'react';
import {
  ArrowRight, Check, CheckCheck, Clock3, Coffee, Heart, Inbox, RefreshCw,
  Send, ShieldCheck, Users, X,
} from 'lucide-react';
import type { IntroductionView, RequestStatus, SessionView } from '../shared/contracts.js';
import { api, errorMessage } from './api.js';
import { Avatar, ErrorNotice, firstName, formatDate, Spinner, type ActionLock } from './ui.js';

export type InboxFilter = 'incoming' | 'outgoing' | 'connected' | 'history';

const statusLabels: Record<RequestStatus, string> = {
  pending: 'Waiting for consent',
  accepted: 'Connected in the demo',
  declined: 'Declined',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export default function Introductions({
  session, requests, filter, loading, loadError, online, lock,
  onFilter, onUpdate, onRefresh, onDiscover, onSwitchIdentity,
}: {
  session: SessionView;
  requests: IntroductionView[];
  filter: InboxFilter;
  loading: boolean;
  loadError: string | null;
  online: boolean;
  lock: ActionLock;
  onFilter: (filter: InboxFilter) => void;
  onUpdate: (request: IntroductionView) => void;
  onRefresh: () => void;
  onDiscover: () => void;
  onSwitchIdentity: (id: string, inbox?: boolean) => Promise<void>;
}) {
  const [responding, setResponding] = useState<{ id: string; action: string } | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const incomingCount = requests.filter((request) => request.direction === 'incoming' && request.status === 'pending').length;
  const outgoingCount = requests.filter((request) => request.direction === 'outgoing' && request.status === 'pending').length;
  const connectedCount = requests.filter((request) => request.status === 'accepted').length;
  const tabs = [
    { id: 'incoming' as const, name: 'Inbox', count: incomingCount, icon: Inbox },
    { id: 'outgoing' as const, name: 'Sent', count: outgoingCount, icon: Send },
    { id: 'connected' as const, name: 'Connected', count: connectedCount, icon: Heart },
    { id: 'history' as const, name: 'History', count: undefined, icon: Clock3 },
  ];
  const visible = requests.filter((request) => {
    if (filter === 'connected') return request.status === 'accepted';
    if (filter === 'history') return request.status !== 'pending';
    return request.direction === filter;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  async function respond(request: IntroductionView, action: 'accept' | 'decline' | 'cancel') {
    if (!online || !lock.begin()) return;
    setError(null);
    setResponding({ id: request.id, action });
    try {
      const result = await api.respond(request.id, action, session.csrfToken);
      onUpdate(result);
      if (result.status === 'accepted') onFilter('connected');
    } catch (issue) {
      setError({ id: request.id, message: errorMessage(issue) });
    } finally {
      setResponding(null);
      lock.end();
    }
  }

  async function switchIdentity(request: IntroductionView) {
    setSwitching(request.id);
    setError(null);
    try {
      await onSwitchIdentity(request.recipient.id, true);
    } catch (issue) {
      setError({ id: request.id, message: errorMessage(issue) });
    } finally {
      setSwitching(null);
    }
  }

  return (
    <section className="introductions" aria-labelledby="introductions-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">A HELLO GOES BOTH WAYS</p>
          <h2 id="introductions-heading">Room for a connection.</h2>
          <p>Requests for <strong>{session.profile.name}</strong>. No pressure, and always your choice.</p>
        </div>
        <button type="button" className="icon-button" aria-label="Refresh saved introductions" onClick={onRefresh} disabled={lock.busy || loading || !online}>
          {loading ? <Spinner /> : <RefreshCw size={17} />}
        </button>
      </div>
      <div className="inbox-tabs" role="tablist" aria-label="Introduction folders">
        {tabs.map(({ id, name, count, icon: Icon }) => (
          <button
            type="button"
            key={id}
            id={`tab-${id}`}
            role="tab"
            aria-selected={filter === id}
            aria-controls="introduction-list"
            tabIndex={filter === id ? 0 : -1}
            className={filter === id ? 'is-active' : ''}
            onClick={() => onFilter(id)}
            onKeyDown={(event) => {
              const current = tabs.findIndex((tab) => tab.id === id);
              const index = event.key === 'ArrowRight' ? (current + 1) % tabs.length
                : event.key === 'ArrowLeft' ? (current - 1 + tabs.length) % tabs.length
                  : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
              const next = tabs[index];
              if (!next) return;
              event.preventDefault();
              onFilter(next.id);
              document.getElementById(`tab-${next.id}`)?.focus();
            }}
          >
            <Icon size={15} /><span>{name}</span>{count !== undefined && <span className="tab-count">{count}</span>}
          </button>
        ))}
      </div>
      <ErrorNotice message={loadError} onRetry={onRefresh} retryLabel="Reload introductions" disabled={loading || lock.busy || !online} />
      {loading ? (
        <div className="thread-loading" role="status"><Spinner /><p>Opening your saved introductions…</p></div>
      ) : (
        <div className="introduction-list" id="introduction-list" role="tabpanel" aria-labelledby={`tab-${filter}`}>
          {visible.length === 0 && !loadError ? (
            <div className="empty-state inbox-empty">
              <span className="empty-icon">{filter === 'connected' ? <Heart size={29} strokeWidth={1.3} /> : <Inbox size={29} strokeWidth={1.3} />}</span>
              <h3>{filter === 'connected' ? 'Every connection begins with a hello.' : filter === 'outgoing' ? 'Your next hello is still unwritten.' : filter === 'history' ? 'A fresh page, for now.' : 'A little space for a new hello.'}</h3>
              <p>{filter === 'incoming'
                ? 'No incoming requests for this fictional profile. Send a request from another identity, then switch here to respond.'
                : filter === 'connected'
                  ? 'When both fictional profiles agree to an introduction, your saved connection will appear here.'
                  : filter === 'history'
                    ? 'Accepted, declined, cancelled, and expired requests will stay here for this demo session.'
                    : 'Find some common ground, review a suggested message, and choose who you’d like to meet.'}</p>
              <button type="button" className="button button--secondary" onClick={onDiscover}>Find my people <ArrowRight size={16} /></button>
            </div>
          ) : visible.map((request) => {
            const other = request.direction === 'incoming' ? request.sender : request.recipient;
            const pending = request.status === 'pending';
            const accepted = request.status === 'accepted';
            return (
              <article className={`request-card${accepted ? ' request-card--connected' : ''}`} key={request.id}>
                <div className="request-top">
                  <div className="request-person">
                    <Avatar initials={other.initials} color={other.color} large />
                    <div>
                      <p className="request-direction">{request.direction === 'incoming' ? 'A HELLO FROM' : 'YOUR HELLO TO'} · FICTIONAL PROFILE</p>
                      <h3>{other.name}</h3>
                      <span><Coffee size={13} />{request.gatheringTitle || request.cafeName}</span>
                    </div>
                  </div>
                  <span className={`status-pill status-pill--${request.status}`}>
                    {accepted ? <CheckCheck size={13} /> : pending ? <Clock3 size={13} /> : <X size={12} />}
                    {statusLabels[request.status]}
                  </span>
                </div>
                <blockquote>{request.message}</blockquote>
                <div className="request-meta">
                  <span>Requested {formatDate(request.createdAt)}</span>
                  {request.respondedAt && <span>{accepted ? 'Connected' : 'Updated'} {formatDate(request.respondedAt)}</span>}
                </div>
                {accepted && (
                  <div className="connection-confirmation" role="status">
                    <span className="connection-heart"><Heart size={20} /></span>
                    <div>
                      <strong>A mutual yes. A new possibility.</strong>
                      <p>Both fictional profiles agreed. This connection is saved; reload to see it again. No contact details have been shared.</p>
                      {request.connectionId && <details><summary>Saved connection reference</summary><code>{request.connectionId}</code></details>}
                    </div>
                  </div>
                )}
                {pending && request.direction === 'incoming' && (
                  <>
                    <div className="request-consent"><ShieldCheck size={15} /><p>Accept only if this feels right. Declining is always okay.</p></div>
                    {!session.profile.introductionsAllowed && <p className="consent-warning">This profile has introduction requests turned off. You can still decline, or enable requests in “Your choices” before accepting.</p>}
                    <div className="request-actions">
                      <button
                        className="button button--primary"
                        type="button"
                        disabled={lock.busy || !online || !session.profile.introductionsAllowed}
                        onClick={() => void respond(request, 'accept')}
                      >
                        {responding?.id === request.id && responding.action === 'accept' ? <Spinner /> : <Check size={16} />} Accept introduction
                      </button>
                      <button className="button button--secondary" type="button" disabled={lock.busy || !online} onClick={() => void respond(request, 'decline')}>
                        {responding?.id === request.id && responding.action === 'decline' ? <Spinner /> : <X size={15} />} Decline
                      </button>
                    </div>
                  </>
                )}
                {pending && request.direction === 'outgoing' && (
                  <div className="outgoing-actions">
                    <div className="try-recipient">
                      <p><Users size={15} /><strong>Try the recipient’s side of the demo.</strong></p>
                      <button className="button button--sage" type="button" disabled={lock.busy || !online} onClick={() => void switchIdentity(request)}>
                        {switching === request.id ? <Spinner /> : <Users size={15} />}
                        Switch to {firstName(request.recipient.name)} to respond <ArrowRight size={15} />
                      </button>
                    </div>
                    <button className="text-button text-button--quiet" type="button" disabled={lock.busy || !online} onClick={() => void respond(request, 'cancel')}>
                      {responding?.id === request.id && responding.action === 'cancel' && <Spinner />} Cancel request
                    </button>
                  </div>
                )}
                {!pending && !accepted && <p className="closed-request-note">No connection was created by this request. Everyone gets to choose.</p>}
                <ErrorNotice message={error?.id === request.id ? error.message : null} />
              </article>
            );
          })}
        </div>
      )}
      <p className="inbox-footer"><ShieldCheck size={14} /> Only your current fictional identity’s requests are shown. Switching identities never grants access to real people.</p>
    </section>
  );
}
