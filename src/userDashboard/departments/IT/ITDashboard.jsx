import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../../api';
import { departmentConfig } from '../../departmentConfig.js';
import DashboardFrame from '../../DashboardFrame.jsx';
import './itDashboard.css';

export default function ITDashboard({ user, onLogout }) {
  const config = departmentConfig.IT;
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const openNotificationCount = requests.filter((request) => request.status !== 'Resolved').length;

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
      await apiRequest(`/support-requests/${id}/status`, { method: 'PATCH', body: { status } });
      setRequests((current) => current.map((request) => request.id === id ? { ...request, status } : request));
      setError('');
    } catch (updateError) {
      setError(updateError.message);
    }
  };

  const addressByNotification = async (request) => {
    await updateStatus(request.id, 'Notification sent to technician');
  };

  const replyToRequest = async (request, responseType, message) => {
    try {
      const reply = await apiRequest(`/support-requests/${request.id}/replies`, {
        method: 'POST',
        body: { response_type: responseType, message },
      });
      setRequests((current) => current.map((item) => (
        item.id === request.id
          ? { ...item, replies: [reply, ...(item.replies || [])] }
          : item
      )));
      setError('');
      return reply;
    } catch (replyError) {
      setError(replyError.message || 'Your reply could not be sent.');
      throw replyError;
    }
  };

  return (
    <DashboardFrame
      user={user}
      config={config}
      onLogout={onLogout}
      isIT
      notifications={requests}
      notificationCount={openNotificationCount}
      notificationError={error}
      onNotificationReply={replyToRequest}
    >
      <div className="it-dashboard">
        <header className="it-page-heading">
          <div className="it-heading-mark" aria-hidden="true">IT</div>
          <div>
            <p>IT OPERATIONS</p>
            <h1>Service desk overview</h1>
            <span>Department support and operational activity</span>
          </div>
          <button type="button" onClick={loadRequests}>↻ <span>Refresh</span></button>
        </header>

        <section className="it-stat-grid" aria-label="Request summary">
          <article className="it-stat-card">
            <span className="it-stat-icon stat-blue" aria-hidden="true">▤</span>
            <div><small>Total requests</small><strong>{requests.length}</strong></div>
            <span className="it-stat-foot">All departments</span>
          </article>
          <article className="it-stat-card">
            <span className="it-stat-icon stat-amber" aria-hidden="true">◷</span>
            <div><small>Open</small><strong>{requests.filter((request) => request.status === 'Open').length}</strong></div>
            <span className="it-stat-foot">Needs attention</span>
          </article>
          <article className="it-stat-card">
            <span className="it-stat-icon stat-violet" aria-hidden="true">↻</span>
            <div><small>In progress</small><strong>{requests.filter((request) => request.status === 'In Progress').length}</strong></div>
            <span className="it-stat-foot">Being handled</span>
          </article>
          <article className="it-stat-card">
            <span className="it-stat-icon stat-green" aria-hidden="true">✓</span>
            <div><small>Resolved</small><strong>{requests.filter((request) => request.status === 'Resolved').length}</strong></div>
            <span className="it-stat-foot">Completed requests</span>
          </article>
        </section>

        {error && <div className="it-dashboard-error" role="alert">{error}</div>}

        <section className="it-panel it-request-panel">
            <header className="it-panel-heading">
              <div><h2>Support requests</h2><p>Requests submitted by other departments</p></div>
              <span className="it-live-indicator"><i /> Live updates</span>
            </header>
            {requests.length === 0 ? (
              <div className="it-empty-state"><span aria-hidden="true">✓</span><strong>All caught up</strong><p>New department requests will appear here.</p></div>
            ) : (
              <div className="it-request-list">
                {requests.map((request) => (
                  <article key={request.id} className="it-request-card">
                    <div className="it-request-card-heading">
                      <div><span className="it-department-tag">{request.source_department}</span><span className="it-issue-tag">{request.issue_type}</span></div>
                      <span className={`it-request-status status-${request.status.toLowerCase().replaceAll(' ', '-')}`}>{request.status}</span>
                    </div>
                    <h3>{request.title}</h3>
                    <p className="it-request-summary">{request.description}</p>
                    <p className="it-request-meta">{request.reporter_email || 'Department user'} <span>·</span> {request.created_at ? new Date(request.created_at).toLocaleString() : 'Date unavailable'}</p>
                    <div className="it-request-actions">
                      <button type="button" className="it-action-notify" onClick={() => addressByNotification(request)}>Notify technician</button>
                      <button type="button" className="it-action-progress" onClick={() => updateStatus(request.id, 'In Progress')}>Start work</button>
                      <button type="button" className="it-action-resolve" onClick={() => updateStatus(request.id, 'Resolved')}>Resolve</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
        </section>
      </div>
    </DashboardFrame>
  );
}
