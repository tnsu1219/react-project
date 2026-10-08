import React, { useState } from 'react';
import { apiRequest } from '../api';




const issueTypes = ['Computer issue', 'Printer issue', 'Network issue', 'Finance system issue', 'Camera issue', 'Other'];

export default function SupportRequestForm({ user }) {
  const department = user?.department || '';
  const [issueType, setIssueType] = useState(issueTypes[0]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const sendITAlert = async (payload) => {
    return apiRequest('/send-it-alert', {
      method: 'POST',
      body: payload,
    });
  };

  const submitRequest = async (event) => {
    event.preventDefault();
    setMessage('');
    setSaving(true);

    const requestTitle = title.trim();
    const requestDescription = description.trim();
    let requestSaved = false;

    try {
      await apiRequest('/support-requests', {
        method: 'POST',
        body: { issue_type: issueType, title: requestTitle, description: requestDescription },
      });
      requestSaved = true;

      await sendITAlert({
        issueType,
        title: requestTitle,
        description: requestDescription,
        department: department || 'Finance',
        reporterEmail: user.email,
      });

      setTitle('');
      setDescription('');
      setMessage(`${department || 'Department'} request saved. The SMS provider accepted the alert for delivery.`);
    } catch (error) {
      console.error('Support request error:', error);
      const errorMessage = error.message || 'Please check the support settings.';
      setMessage(requestSaved
        ? `Your support request was saved, but the SMS alert was not accepted: ${errorMessage} Check the IT dashboard before resubmitting.`
        : `The support request could not be saved: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={styles.card}>
      <div style={styles.headingRow}>
        <div>
          <p style={styles.kicker}>Need technical help?</p>
          <h2 style={styles.heading}>Request help from the IT technician</h2>
        </div>
        <span style={styles.badge}>IT support</span>
      </div>
      <form onSubmit={submitRequest} style={styles.form}>
        <select value={issueType} onChange={(event) => setIssueType(event.target.value)} style={styles.input}>
          {issueTypes.map((type) => <option key={type}>{type}</option>)}
        </select>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Example: Finance printer not working" required style={styles.input} />
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Tell the IT technician what is not working and where it is located" required rows="4" style={styles.input} />
        <button type="submit" disabled={saving} style={styles.button}>{saving ? 'Sending...' : 'Send to IT'}</button>
      </form>
      {message && <p style={styles.message}>{message}</p>}
    </section>
  );
}

const styles = {
  card: { background: '#fff', border: '1px solid #dbeafe', borderRadius: '14px', padding: '24px', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)' },
  headingRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' },
  kicker: { margin: 0, color: '#2563eb', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em' },
  heading: { margin: '6px 0 0', color: '#0f172a', fontSize: '20px' },
  badge: { color: '#1d4ed8', background: '#eff6ff', borderRadius: '999px', padding: '6px 10px', fontSize: '12px', fontWeight: '700' },
  form: { display: 'grid', gap: '12px', marginTop: '20px' },
  input: { width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '11px 12px', fontSize: '14px', fontFamily: 'inherit' },
  button: { width: 'fit-content', border: 0, borderRadius: '8px', background: '#2563eb', color: '#fff', padding: '11px 16px', fontWeight: '700', cursor: 'pointer' },
  message: { margin: '14px 0 0', color: '#1d4ed8', fontSize: '13px' },
};
