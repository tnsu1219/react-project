import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NotificationContext } from './NotificationContext.js';
import './notifications.css';

export default function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const confirmationResolver = useRef(null);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id));
  }, []);

  const notify = useCallback((message, type = 'info', title) => {
    const id = ++nextId.current;
    setNotifications((current) => [...current, { id, message, type, title }]);
    window.setTimeout(() => dismiss(id), 5500);
  }, [dismiss]);

  const confirm = useCallback(({
    title = 'Please confirm',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'danger',
  }) => new Promise((resolve) => {
    confirmationResolver.current = resolve;
    setConfirmation({ title, message, confirmLabel, cancelLabel, tone });
  }), []);

  const finishConfirmation = useCallback((accepted) => {
    confirmationResolver.current?.(accepted);
    confirmationResolver.current = null;
    setConfirmation(null);
  }, []);

  useEffect(() => {
    if (!confirmation) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') finishConfirmation(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmation, finishConfirmation]);

  return (
    <NotificationContext.Provider value={{ notify, confirm }}>
      {children}
      <div className="notification-stack" aria-live="polite" aria-relevant="additions">
        {notifications.map((notification) => (
          <article key={notification.id} className={`app-notification app-notification-${notification.type}`} role={notification.type === 'error' ? 'alert' : 'status'}>
            <span className="app-notification-icon" aria-hidden="true">
              {notification.type === 'success' ? '✓' : notification.type === 'error' ? '!' : notification.type === 'warning' ? '⚠' : 'i'}
            </span>
            <div className="app-notification-copy">
              {notification.title && <strong>{notification.title}</strong>}
              <span>{notification.message}</span>
            </div>
            <button type="button" className="app-notification-close" onClick={() => dismiss(notification.id)} aria-label="Dismiss notification">×</button>
          </article>
        ))}
      </div>
      {confirmation && (
        <div className="app-confirm-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) finishConfirmation(false);
        }}>
          <section className="app-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-title" aria-describedby="app-confirm-message">
            <div className={`app-confirm-icon app-confirm-icon-${confirmation.tone}`} aria-hidden="true">
              {confirmation.tone === 'danger' ? '!' : '?'}
            </div>
            <h2 id="app-confirm-title">{confirmation.title}</h2>
            <p id="app-confirm-message">{confirmation.message}</p>
            <div className="app-confirm-actions">
              <button type="button" className="app-confirm-cancel" onClick={() => finishConfirmation(false)}>{confirmation.cancelLabel}</button>
              <button type="button" className={`app-confirm-accept app-confirm-accept-${confirmation.tone}`} onClick={() => finishConfirmation(true)}>{confirmation.confirmLabel}</button>
            </div>
          </section>
        </div>
      )}
    </NotificationContext.Provider>
  );
}
