import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api';
import './departmentDashboardTypography.css';

function readTaskState(storageKey) {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey) || '{}');
  } catch {
    return {};
  }
}

export default function DashboardFrame({
  user, config, onLogout, children, isIT = false, notifications = [],
  notificationCount = 0, notificationError = '', onNotificationReply,
}) {
  const [activeView, setActiveView] = useState('dashboard');
  const [activity, setActivity] = useState({ status: 'idle', items: [], error: '' });
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyError, setReplyError] = useState('');
  const [customReplies, setCustomReplies] = useState({});
  const taskStorageKey = `rodas-system:tasks:${config.title}:${user.id || user.email}`;
  const [completedTasks, setCompletedTasks] = useState(() => readTaskState(taskStorageKey));

  useEffect(() => {
    try {
      window.localStorage.setItem(taskStorageKey, JSON.stringify(completedTasks));
    } catch {}
  }, [completedTasks, taskStorageKey]);

  useEffect(() => {
    if (activeView !== 'activity') return undefined;

    let isCurrent = true;
    apiRequest('/support-requests/mine')
      .then((items) => {
        if (!isCurrent) return;
        setActivity({ status: 'ready', items, error: '' });
      })
      .catch((error) => {
        if (isCurrent) setActivity({ status: 'error', items: [], error: error.message });
      });

    return () => { isCurrent = false; };
  }, [activeView, user.id]);

  const completedCount = config.duties.filter((task) => completedTasks[task]).length;
  const sendNotificationReply = async (request, responseType, message) => {
    setReplyingTo(request.id);
    setReplyError('');
    try {
      await onNotificationReply(request, responseType, message);
      return true;
    } catch (error) {
      setReplyError(error.message || 'The reply could not be sent.');
      return false;
    } finally {
      setReplyingTo(null);
    }
  };
  const responseOptions = [
    { type: 'available', label: 'Available now', message: 'IT is free and available to take this request now.', tone: 'available' },
    { type: 'busy', label: 'Busy · queued', message: 'IT is currently busy with active work. Your request is queued, and we will update you as soon as possible.', tone: 'busy' },
    { type: 'delayed', label: 'Delayed', message: 'There is a delay in addressing this request. We will share an updated timeline as soon as one is available.', tone: 'delayed' },
    { type: 'ready', label: 'Ready to assist', message: 'IT is ready to assist. Please coordinate with the IT team.', tone: 'ready' },
    { type: 'need_info', label: 'Need more details', message: 'We need more information to investigate this request. Please add the relevant details or contact IT.', tone: 'info' },
  ];
  const views = [
    { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
    { id: 'activity', label: isIT ? 'Activities' : 'My activity', icon: '◷' },
    { id: 'tasks', label: 'Department tasks', icon: '▦' },
  ];

  return (
    <main className={`department-workspace${config.title === 'IT Operations' ? ' it-workspace' : ''}`} style={styles.page}>
      <header style={styles.topbar}>
        <button type="button" style={styles.menuButton} aria-label="Toggle navigation">☰</button>
        <strong style={styles.brand}>RODAS SYSTEM</strong>
        <div style={styles.store}>Department workspace</div>
        <div style={styles.topActions}>
          {isIT ? (
            <button
              type="button"
              className="it-notification-trigger"
              aria-label={`Open IT notifications${notificationCount ? `, ${notificationCount} requests need attention` : ''}`}
              aria-current={activeView === 'notifications' ? 'page' : undefined}
              onClick={() => setActiveView('notifications')}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M10 21h4" />
              </svg>
              {notificationCount > 0 && <span className="it-notification-count">{notificationCount > 99 ? '99+' : notificationCount}</span>}
            </button>
          ) : <span className="department-bell" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg></span>}
          <span style={styles.topAvatar}>{config.initials}</span>
        </div>
      </header>
      <div className={isIT ? 'department-layout it-layout' : 'department-layout'} style={styles.layout}>
        <aside className={isIT ? 'department-sidebar it-sidebar' : 'department-sidebar'} style={styles.sidebar}>
          <div style={styles.profile}>
            <div style={{ ...styles.profileAvatar, background: config.accent }}>{config.initials}</div>
            <div><strong style={styles.profileName}>{user.email?.split('@')[0]}</strong><span style={styles.profileRole}>{config.title}</span></div>
          </div>
          <nav style={styles.nav}>
            {views.map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => {
                  setActiveView(view.id);
                  if (view.id === 'activity') setActivity({ status: 'loading', items: [], error: '' });
                }}
                aria-current={activeView === view.id ? 'page' : undefined}
                style={activeView === view.id ? styles.navActive : styles.navItem}
              >
                <span aria-hidden="true">{view.icon}</span><span>{view.label}</span>
              </button>
            ))}
          </nav>
          <div style={styles.sidebarFooter}>
            <div style={styles.sidebarNote}>Need help?<br /><strong>Send a request to IT</strong></div>
            <button type="button" onClick={onLogout} style={styles.sidebarLogout}>
              <span aria-hidden="true">↪</span> Log Out
            </button>
          </div>
        </aside>
        <section className={isIT ? 'department-main it-main' : 'department-main'} style={styles.content}>
          {activeView === 'dashboard' && children}
          {activeView === 'activity' && (
            <section className={`department-content-view${isIT ? ' it-department-view' : ''}`} style={{ ...styles.view, '--department-accent': config.accent }}>
              <header className="department-content-heading" style={styles.viewHeader}>
                <p style={styles.viewKicker}>{config.title}</p>
                <h1 style={styles.viewTitle}>{isIT ? 'Activities' : 'My activity'}</h1>
                <p style={styles.viewCopy}>{isIT ? 'IT team responsibilities and your recent support request history.' : 'Your recent support requests and their current status.'}</p>
              </header>
              {isIT && (
                <section className="it-activities-panel">
                  <header><div><h2>IT team activities</h2><p>Core responsibilities for the service desk team</p></div><span>{config.activities.length} activities</span></header>
                  <div className="it-activities-list">
                    {config.activities.map((activity, index) => (
                      <article key={activity}>
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        <p>{activity}</p>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              {activity.status === 'loading' && <p style={styles.stateMessage}>Loading your activity...</p>}
              {activity.status === 'error' && <p role="alert" style={styles.errorMessage}>{activity.error}</p>}
              {activity.status === 'ready' && activity.items.length === 0 && (
                <p style={styles.stateMessage}>You have not submitted any support requests yet.</p>
              )}
              {activity.status === 'ready' && activity.items.length > 0 && (
                <div className="department-activity-list" style={styles.activityList}>
                  {activity.items.map((item) => (
                    <article key={item.id} className={`department-activity-card${isIT ? ' it-activity-card' : ''}`} style={styles.activityItem}>
                      <div style={styles.activityTop}>
                        <span style={{ ...styles.issueType, color: config.accent }}>{item.issue_type}</span>
                        <span style={styles.status}>{item.status}</span>
                      </div>
                      <h2 style={styles.activityTitle}>{item.title}</h2>
                      <p style={styles.activityDescription}>{item.description}</p>
                      <p style={styles.activityMeta}>
                        {item.source_department} · {item.created_at ? new Date(item.created_at).toLocaleString() : 'Date unavailable'}
                      </p>
                      {(item.replies || []).length > 0 && (
                        <div className="it-department-replies">
                          <strong>IT response{item.replies.length === 1 ? '' : 's'}</strong>
                          {item.replies.map((reply) => (
                            <article key={reply.id}>
                              <span>{reply.response_type.replaceAll('_', ' ')}</span>
                              <p>{reply.message}</p>
                              <time>{new Date(reply.created_at).toLocaleString()}</time>
                            </article>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
          {activeView === 'tasks' && (
            <section className={`department-content-view${isIT ? ' it-department-view' : ''}`} style={{ ...styles.view, '--department-accent': config.accent }}>
              <header className="department-content-heading" style={styles.viewHeader}>
                <p style={styles.viewKicker}>{config.title}</p>
                <h1 style={styles.viewTitle}>Department tasks</h1>
                <p style={styles.viewCopy}>Track the key responsibilities for your department.</p>
              </header>
              <div className="department-task-summary" style={styles.taskSummary}>
                <div>
                  <strong style={styles.progressCount}>{completedCount} of {config.duties.length}</strong>
                  <span style={styles.progressLabel}>tasks complete</span>
                </div>
                <button type="button" onClick={() => setCompletedTasks({})} disabled={completedCount === 0} style={styles.resetButton}>
                  Reset checklist
                </button>
              </div>
              <div className="department-task-list" style={styles.taskList}>
                {config.duties.map((task) => (
                  <label key={task} className="department-task-card" style={styles.taskItem}>
                    <input
                      type="checkbox"
                      checked={Boolean(completedTasks[task])}
                      onChange={() => setCompletedTasks((current) => ({ ...current, [task]: !current[task] }))}
                      style={styles.checkbox}
                    />
                    <span style={completedTasks[task] ? styles.completedTask : styles.taskLabel}>{task}</span>
                    <span style={completedTasks[task] ? styles.completeStatus : styles.pendingStatus}>
                      {completedTasks[task] ? 'Complete' : 'To do'}
                    </span>
                  </label>
                ))}
              </div>
              <p style={styles.storageNote}>Checklist saved on this device.</p>
            </section>
          )}
          {isIT && activeView === 'notifications' && (
            <section className="it-department-view it-notifications-view">
              <header className="it-view-heading">
                <div>
                  <p>IT SERVICE DESK</p>
                  <h1>Department notifications</h1>
                  <span>Review incoming requests and send a clear response to each department.</span>
                </div>
                <span className="it-notification-summary">{notifications.length} total · {notificationCount} active</span>
              </header>
              {notificationError && !replyError && <p className="it-notification-error" role="alert">{notificationError}</p>}
              {replyError && <p className="it-notification-error" role="alert">{replyError}</p>}
              {notifications.length === 0 ? (
                <div className="it-notifications-empty"><span aria-hidden="true">✓</span><strong>All clear</strong><p>No department requests have been sent to IT yet.</p></div>
              ) : (
                <div className="it-notification-list">
                  {notifications.map((request) => (
                    <article className="it-notification-card" key={request.id}>
                      <header>
                        <div><span className="it-request-department">{request.source_department}</span><span className={`it-request-status status-${request.status.toLowerCase().replaceAll(' ', '-')}`}>{request.status}</span></div>
                        <time>{request.created_at ? new Date(request.created_at).toLocaleString() : 'Date unavailable'}</time>
                      </header>
                      <div className="it-request-details">
                        <p className="it-request-type">{request.issue_type}</p>
                        <h2>{request.title}</h2>
                        <p className="it-request-description">{request.description}</p>
                        <p className="it-request-reporter">Submitted by <strong>{request.reporter_email || 'Department user'}</strong></p>
                      </div>
                      {(request.replies || []).length > 0 && (
                        <section className="it-reply-history">
                          <h3>Reply history</h3>
                          {request.replies.map((reply) => (
                            <article key={reply.id}>
                              <span>{reply.response_type.replaceAll('_', ' ')}</span>
                              <p>{reply.message}</p>
                              <time>{new Date(reply.created_at).toLocaleString()}</time>
                            </article>
                          ))}
                        </section>
                      )}
                      <section className="it-reply-section">
                        <h3>Respond to {request.source_department}</h3>
                        <p>Choose a professional update or write a custom message. The response will appear in the sender’s My activity page.</p>
                        <div className="it-response-actions">
                          {responseOptions.map((option) => (
                            <button
                              type="button"
                              key={option.type}
                              className={`it-response-button tone-${option.tone}`}
                              disabled={replyingTo === request.id}
                              onClick={() => sendNotificationReply(request, option.type, option.message)}
                            >{option.label}</button>
                          ))}
                        </div>
                        <form className="it-custom-reply" onSubmit={(event) => {
                          event.preventDefault();
                          const message = String(customReplies[request.id] || '').trim();
                          if (message) {
                            sendNotificationReply(request, 'custom', message).then((sent) => {
                              if (sent) setCustomReplies((current) => ({ ...current, [request.id]: '' }));
                            });
                          }
                        }}>
                          <label htmlFor={`it-reply-${request.id}`}>Custom reply</label>
                          <textarea
                            id={`it-reply-${request.id}`}
                            maxLength="2000"
                            rows="3"
                            value={customReplies[request.id] || ''}
                            onChange={(event) => setCustomReplies((current) => ({ ...current, [request.id]: event.target.value }))}
                            placeholder="Write a clear update for the requesting department..."
                          />
                          <div><small>{(customReplies[request.id] || '').length}/2,000</small><button type="submit" disabled={replyingTo === request.id || !String(customReplies[request.id] || '').trim()}>{replyingTo === request.id ? 'Sending…' : 'Send reply'}</button></div>
                        </form>
                      </section>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

const styles = {
  page: { height: '100vh', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f1f4f8', fontFamily: 'sans-serif', color: '#172033' },
  topbar: { height: '72px', flex: '0 0 72px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '18px', padding: '0 24px', boxSizing: 'border-box' },
  menuButton: { width: '38px', height: '38px', border: 0, borderRadius: '10px', background: '#f1f5f9', color: '#334155', fontSize: '20px', cursor: 'pointer' },
  brand: { color: '#172033', letterSpacing: '0.04em', fontSize: '16px' },
  store: { margin: '0 auto', border: '1px dashed #cbd5e1', borderRadius: '999px', padding: '8px 16px', color: '#94a3b8', fontSize: '12px' },
  topActions: { display: 'flex', alignItems: 'center', gap: '14px' },
  bell: { color: '#475569', fontSize: '22px' },
  topAvatar: { width: '34px', height: '34px', borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', background: '#2563eb', fontSize: '11px', fontWeight: '800' },
  layout: { flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' },
  sidebar: { width: '218px', height: '100%', maxHeight: '100%', flex: '0 0 218px', background: '#171a31', color: '#dbe4f0', padding: '22px 14px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflowY: 'auto' },
  profile: { display: 'flex', gap: '10px', alignItems: 'center', padding: '0 6px 24px', borderBottom: '1px solid rgba(255,255,255,0.12)' },
  profileAvatar: { width: '42px', height: '42px', borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: '800', fontSize: '12px', border: '2px solid rgba(255,255,255,0.7)' },
  profileName: { display: 'block', color: '#fff', fontSize: '13px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' },
  profileRole: { display: 'block', color: '#9aa7bd', fontSize: '11px', marginTop: '3px' },
  nav: { display: 'grid', gap: '7px', marginTop: '20px' },
  navActive: { width: '100%', border: 0, background: '#6537e8', color: '#fff', borderRadius: '8px', padding: '12px', display: 'flex', gap: '12px', textAlign: 'left', fontWeight: '800', fontSize: '14px', cursor: 'pointer' },
  navItem: { width: '100%', border: 0, background: 'transparent', color: '#f1f5f9', borderRadius: '8px', padding: '12px', display: 'flex', gap: '12px', textAlign: 'left', fontWeight: '700', fontSize: '14px', cursor: 'pointer' },
  sidebarFooter: { marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.16)', paddingTop: '10px' },
  sidebarNote: { padding: '10px 6px 14px', color: '#cbd5e1', fontSize: '12px', lineHeight: 1.6 },
  sidebarLogout: { width: '100%', border: '1px solid rgba(248,113,113,0.55)', background: 'rgba(127,29,29,0.22)', color: '#fecaca', borderRadius: '8px', padding: '11px 12px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' },
  content: { flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', padding: '24px', boxSizing: 'border-box' },
  view: { maxWidth: '1000px', margin: '0 auto', display: 'grid', gap: '20px' },
  viewHeader: { padding: '4px 0 8px' },
  viewKicker: { margin: 0, color: '#64748b', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase' },
  viewTitle: { margin: '8px 0', color: '#172033', fontSize: '28px' },
  viewCopy: { margin: 0, color: '#64748b', lineHeight: 1.5 },
  stateMessage: { margin: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '22px', color: '#64748b' },
  errorMessage: { margin: 0, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '16px', color: '#9a3412' },
  activityList: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 20px' },
  activityItem: { padding: '18px 0', borderBottom: '1px solid #e2e8f0' },
  activityTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' },
  issueType: { fontSize: '12px', fontWeight: '800', textTransform: 'uppercase' },
  status: { color: '#475569', background: '#f1f5f9', borderRadius: '999px', padding: '5px 9px', fontSize: '11px', fontWeight: '700' },
  activityTitle: { margin: '9px 0 5px', color: '#172033', fontSize: '17px' },
  activityDescription: { margin: 0, color: '#475569', lineHeight: 1.5 },
  activityMeta: { margin: '10px 0 0', color: '#94a3b8', fontSize: '12px' },
  taskSummary: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px 20px' },
  progressCount: { display: 'block', color: '#172033', fontSize: '20px' },
  progressLabel: { display: 'block', marginTop: '3px', color: '#64748b', fontSize: '12px' },
  resetButton: { border: '1px solid #cbd5e1', background: '#fff', color: '#334155', borderRadius: '6px', padding: '8px 11px', cursor: 'pointer' },
  taskList: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 20px' },
  taskItem: { minHeight: '58px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #e2e8f0', cursor: 'pointer' },
  checkbox: { width: '18px', height: '18px', accentColor: '#15803d', flex: '0 0 auto' },
  taskLabel: { flex: 1, color: '#334155', lineHeight: 1.4 },
  completedTask: { flex: 1, color: '#64748b', textDecoration: 'line-through', lineHeight: 1.4 },
  completeStatus: { color: '#166534', background: '#dcfce7', borderRadius: '999px', padding: '5px 9px', fontSize: '11px', fontWeight: '700' },
  pendingStatus: { color: '#475569', background: '#f1f5f9', borderRadius: '999px', padding: '5px 9px', fontSize: '11px', fontWeight: '700' },
  storageNote: { margin: '-10px 0 0', color: '#94a3b8', fontSize: '12px' },
};
