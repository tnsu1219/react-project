import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../../api';
import { departmentConfig } from '../../departmentConfig.js';
import DashboardFrame from '../../DashboardFrame.jsx';
import './itDashboard.css';

export default function ITDashboard({ user, onLogout }) {
  const config = departmentConfig.IT;
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [activeReplyId, setActiveReplyId] = useState(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);

  const openNotificationCount = requests.filter((req) => req.status !== 'Resolved').length;
  const statusCounts = {
    All: requests.length,
    Open: requests.filter((request) => request.status === 'Open').length,
    'In Progress': requests.filter((request) => request.status === 'In Progress').length,
    'On Hold': requests.filter((request) => request.status === 'On Hold').length,
    Resolved: requests.filter((request) => request.status === 'Resolved').length,
  };

  const loadRequests = async () => {
    try {
      setRequests(await apiRequest('/support-requests/it'));
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  useEffect(() => {
    const initialRefresh = window.setTimeout(loadRequests, 0);
    const refreshTimer = window.setInterval(loadRequests, 10000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(refreshTimer);
    };
  }, []);

  const updateStatus = async (id, status) => {
    try {
      await apiRequest(`/support-requests/${id}/status`, {
        method: 'PATCH',
        body: { status },
      });
      setRequests((current) =>
        current.map((request) => (request.id === id ? { ...request, status } : request))
      );
      setError('');
    } catch (updateError) {
      setError(updateError.message);
    }
  };

  const assignTicket = async (id, technicianName) => {
    try {
      await apiRequest(`/support-requests/${id}/assign`, {
        method: 'PATCH',
        body: { assigned_to: technicianName },
      });
      setRequests((current) =>
        current.map((request) =>
          request.id === id ? { ...request, assigned_to: technicianName } : request
        )
      );
    } catch (assignError) {
      setError(assignError.message);
    }
  };

  const updatePriority = async (id, priority) => {
    try {
      await apiRequest(`/support-requests/${id}/priority`, {
        method: 'PATCH',
        body: { priority },
      });
      setRequests((current) =>
        current.map((request) => (request.id === id ? { ...request, priority } : request))
      );
    } catch (priorityError) {
      setError(priorityError.message);
    }
  };

  const handleSendReply = async (request) => {
    if (!replyMessage.trim()) return;
    try {
      const responseType = isInternalNote ? 'internal_note' : 'public_reply';
      const reply = await apiRequest(`/support-requests/${request.id}/replies`, {
        method: 'POST',
        body: { response_type: responseType, message: replyMessage },
      });

      setRequests((current) =>
        current.map((item) =>
          item.id === request.id
            ? { ...item, replies: [reply, ...(item.replies || [])] }
            : item
        )
      );

      setReplyMessage('');
      setActiveReplyId(null);
      setIsInternalNote(false);
      setError('');
    } catch (replyError) {
      setError(replyError.message || 'Failed to post reply.');
    }
  };

  const filteredRequests = requests.filter((req) => {
    if (filterStatus === 'All') return true;
    return req.status === filterStatus;
  });

  return (
    <DashboardFrame
      user={user}
      config={config}
      onLogout={onLogout}
      isIT
      notifications={requests}
      notificationCount={openNotificationCount}
      notificationError={error}
    >
      <div className="it-dashboard">
        <header className="it-page-heading">
          <div className="it-heading-mark" aria-hidden="true">IT</div>
          <div>
            <p>IT OPERATIONS</p>
            <h1>Service Desk Overview</h1>
            <span>Department support and operational activity</span>
          </div>
          <button type="button" className="it-btn-refresh" onClick={loadRequests}>
            ↻ <span>Refresh</span>
          </button>
        </header>

        {/* Stats Grid */}
        <section className="it-stat-grid" aria-label="Request summary">
          <article className="it-stat-card">
            <span className="it-stat-icon stat-blue" aria-hidden="true">▤</span>
            <div><small>Total requests</small><strong>{requests.length}</strong></div>
            <span className="it-stat-foot">Across all departments</span>
          </article>
          <article className="it-stat-card">
            <span className="it-stat-icon stat-amber" aria-hidden="true">◷</span>
            <div><small>Open</small><strong>{requests.filter((r) => r.status === 'Open').length}</strong></div>
            <span className="it-stat-foot">Needs attention</span>
          </article>
          <article className="it-stat-card">
            <span className="it-stat-icon stat-violet" aria-hidden="true">↻</span>
            <div><small>In Progress</small><strong>{requests.filter((r) => r.status === 'In Progress').length}</strong></div>
            <span className="it-stat-foot">Being handled</span>
          </article>
          <article className="it-stat-card">
            <span className="it-stat-icon stat-amber" aria-hidden="true">Ⅱ</span>
            <div><small>On Hold</small><strong>{requests.filter((r) => r.status === 'On Hold').length}</strong></div>
            <span className="it-stat-foot">Waiting for follow-up</span>
          </article>
          <article className="it-stat-card">
            <span className="it-stat-icon stat-green" aria-hidden="true">✓</span>
            <div><small>Resolved</small><strong>{requests.filter((r) => r.status === 'Resolved').length}</strong></div>
            <span className="it-stat-foot">Completed</span>
          </article>
        </section>

        {error && <div className="it-dashboard-error" role="alert">{error}</div>}

        {/* Support Request Panel */}
        <section className="it-panel it-request-panel">
          <header className="it-panel-heading">
            <div>
              <h2>Support Requests</h2>
              <p>Review incoming issues, set priority, assign ownership, and keep requesters updated.</p>
            </div>
            <div className="it-filter-bar" role="group" aria-label="Filter support requests by status">
              {Object.keys(statusCounts).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`it-filter-tab ${filterStatus === status ? 'active' : ''}`}
                  aria-pressed={filterStatus === status}
                  onClick={() => setFilterStatus(status)}
                >
                  {status}
                  <span>{statusCounts[status]}</span>
                </button>
              ))}
            </div>
          </header>

          {filteredRequests.length === 0 ? (
            <div className="it-empty-state">
              <span aria-hidden="true">✓</span>
              <strong>All caught up</strong>
              <p>No support requests match the selected status filter.</p>
            </div>
          ) : (
            <div className="it-request-list">
              {filteredRequests.map((request) => (
                <article key={request.id} className="it-request-card">
                  <div className="it-request-card-heading">
                    <div className="it-tag-group">
                      <span className="it-ticket-reference">Ticket #{request.id}</span>
                      <span className="it-department-tag">{request.source_department || 'Department'}</span>
                      <span className="it-issue-tag">{request.issue_type || 'Support request'}</span>
                      {request.assigned_to && (
                        <span className="it-assignee-tag"><span aria-hidden="true">●</span> Assigned to {request.assigned_to}</span>
                      )}
                    </div>
                    <span className={`it-request-status status-${request.status.toLowerCase().replaceAll(' ', '-')}`}>
                      {request.status}
                    </span>
                  </div>

                  <h3>{request.title}</h3>
                  <p className="it-request-summary">{request.description}</p>

                  <div className="it-request-meta">
                    <span>{request.reporter_email || 'Department User'}</span>
                    <span>·</span>
                    <span>{request.created_at ? new Date(request.created_at).toLocaleString() : 'Date unavailable'}</span>
                  </div>

                  {Array.isArray(request.replies) && request.replies.length > 0 && (
                    <div className="it-reply-history" aria-label="Request communication history">
                      <strong>Latest update</strong>
                      <p>{request.replies[0].message}</p>
                      <span>{request.replies[0].response_type === 'internal_note' ? 'Staff-only note' : 'Requester-visible reply'}</span>
                    </div>
                  )}

                  <div className="it-request-actions-bar">
                    <div className="it-request-priority">
                      <label htmlFor={`priority-${request.id}`}>Priority</label>
                      <select
                        id={`priority-${request.id}`}
                        className={`it-select-priority priority-${(request.priority || 'Medium').toLowerCase()}`}
                        value={request.priority || 'Medium'}
                        onChange={(event) => updatePriority(request.id, event.target.value)}
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Urgent">Urgent</option>
                      </select>
                    </div>

                    <div className="it-request-actions">
                      {!request.assigned_to && (
                        <button
                          type="button"
                          className="it-action-assign"
                          onClick={() => assignTicket(request.id, user?.full_name || 'IT Tech')}
                        >
                          Assign to me
                        </button>
                      )}
                      {request.status === 'Open' && (
                        <button
                          type="button"
                          className="it-action-progress"
                          onClick={() => updateStatus(request.id, 'In Progress')}
                        >
                          Start work
                        </button>
                      )}
                      {request.status !== 'On Hold' && request.status !== 'Resolved' && (
                        <button
                          type="button"
                          className="it-action-hold"
                          onClick={() => updateStatus(request.id, 'On Hold')}
                        >
                          Put on hold
                        </button>
                      )}
                      {request.status !== 'Resolved' ? (
                        <button
                          type="button"
                          className="it-action-resolve"
                          onClick={() => updateStatus(request.id, 'Resolved')}
                        >
                          Resolve
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="it-action-reopen"
                          onClick={() => updateStatus(request.id, 'In Progress')}
                        >
                          Reopen request
                        </button>
                      )}
                      <button
                        type="button"
                        className="it-action-reply"
                        aria-expanded={activeReplyId === request.id}
                        onClick={() => {
                          setActiveReplyId(activeReplyId === request.id ? null : request.id);
                          setReplyMessage('');
                          setIsInternalNote(false);
                        }}
                      >
                        {activeReplyId === request.id ? 'Close reply form' : 'Reply or add note'}
                      </button>
                    </div>
                  </div>

                  {activeReplyId === request.id && (
                    <div className="it-reply-box">
                      <div className="it-reply-heading">
                        <strong>Update this request</strong>
                        <span>{isInternalNote ? 'Only IT staff can see this note.' : 'The requester can see this reply.'}</span>
                      </div>
                      <textarea
                        rows="3"
                        maxLength={2000}
                        aria-label={isInternalNote ? 'Internal staff note' : 'Reply to requester'}
                        placeholder={isInternalNote ? 'Write a note for IT staff...' : 'Write a clear update for the requester...'}
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                      />
                      <div className="it-reply-options">
                        <label className="it-checkbox-label">
                          <input type="checkbox" checked={isInternalNote} onChange={(e) => setIsInternalNote(e.target.checked)} />
                          Internal note (IT staff only)
                        </label>
                        <span className="it-reply-character-count">{replyMessage.length}/2000</span>
                        <button
                          type="button"
                          className="it-btn-send"
                          disabled={!replyMessage.trim()}
                          onClick={() => handleSendReply(request)}
                        >
                          {isInternalNote ? 'Save note' : 'Send reply'}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardFrame>
  );
}