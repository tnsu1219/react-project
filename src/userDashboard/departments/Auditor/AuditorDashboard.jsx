import React, { useState } from 'react';
import DashboardFrame from '../../DashboardFrame.jsx';
import { departmentConfig } from '../../departmentConfig.js';
import useDepartmentWorkItems from '../../useDepartmentWorkItems.js';

const department = 'Auditor';

export default function AuditorDashboard({ user, onLogout }) {
  const config = departmentConfig[department];
  const workflow = config.workflow;
  const { records, isLoading, error, loadRecords, addRecord, updateRecord, deleteRecord } = useDepartmentWorkItems(department, user);
  const [form, setForm] = useState({ title: '', details: '', status: workflow.statuses[0] });
  const [message, setMessage] = useState('');

  const handleAddRecord = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.details.trim()) return;
    const added = await addRecord({ title: form.title.trim(), details: form.details.trim(), status: form.status });
    if (!added) return;
    setForm({ title: '', details: '', status: workflow.statuses[0] });
    setMessage(`New ${workflow.singular} added to your queue.`);
  };

  return (
    <DashboardFrame user={user} config={config} onLogout={onLogout} eyebrow="Support request">
      <header style={styles.pageHeader}>
        <div style={styles.headingGroup}>
          <div style={{ ...styles.icon, background: config.accent }}>▣</div>
          <div><p style={styles.eyebrow}>{config.title}</p><h1 style={styles.title}>{config.subtitle}</h1><p style={styles.subtitle}>Department performance overview</p></div>
        </div>
        <div style={styles.date}>Today</div>
      </header>
      <section style={styles.hero}>
        <div><p style={styles.eyebrow}>Super Double T General Trading</p><h2 style={styles.heroTitle}>{department} work center</h2><p style={styles.copy}>{config.purpose}</p></div>
        <div style={{ ...styles.counter, borderColor: config.accent }}><strong style={styles.counterNumber}>{config.duties.length}</strong><span>active areas</span></div>
      </section>
      <section style={styles.grid}>{config.duties.map((duty) => <div key={duty} style={styles.duty}><span style={{ ...styles.dot, background: config.accent }}>✓</span><span>{duty}</span></div>)}</section>
      <section style={styles.activities}>
        <div><p style={styles.eyebrow}>How your work supports the business</p><h2 style={styles.sectionTitle}>Daily activities</h2></div>
        <div style={styles.activityGrid}>{config.activities.map((activity, index) => <div key={activity} style={styles.activity}><span style={{ ...styles.activityNumber, color: config.accent }}>{String(index + 1).padStart(2, '0')}</span><span>{activity}</span></div>)}</div>
      </section>
      {workflow && <section style={styles.workflow}>
        <div style={styles.workflowHeader}><div><p style={styles.eyebrow}>Record today&apos;s work</p><h2 style={styles.sectionTitle}>{workflow.label}</h2><p style={styles.workflowCopy}>Add the document, request, case, or movement you are handling and update it as work progresses.</p></div><div style={{ ...styles.workflowCount, borderColor: config.accent }}><strong>{records.length}</strong><span>tracked</span></div></div>
        <div style={styles.recordTools}>
          <p style={styles.workflowCopy}>Department work is shared with colleagues and saved in PostgreSQL.</p>
          <button type="button" onClick={loadRecords} style={styles.refreshButton}>Refresh records</button>
        </div>
        {error && <p role="alert" style={styles.errorMessage}>{error}</p>}
        <form onSubmit={handleAddRecord} style={styles.recordForm}>
          <input aria-label={`${workflow.singular} title`} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={`Add a ${workflow.singular}`} required style={styles.field} />
          <input aria-label={`${workflow.singular} details`} value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} placeholder={workflow.fields.join(' · ')} required style={styles.field} />
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} style={styles.field}>{workflow.statuses.map((status) => <option key={status}>{status}</option>)}</select>
          <button type="submit" style={{ ...styles.addButton, background: config.accent }}>Add</button>
        </form>
        {message && <p role="status" style={styles.success}>{message}</p>}
        <div style={styles.records}>
          {isLoading ? <p style={styles.empty}>Loading saved department work...</p> : records.length === 0 ? <p style={styles.empty}>No {workflow.label.toLowerCase()} tracked yet. Add the first item above.</p> : records.map((record) => <article key={record.id} style={styles.record}>
            <div style={styles.recordMain}><strong>{record.title}</strong><span style={styles.recordDetails}>{record.details}</span><small>{new Date(record.createdAt).toLocaleString()}</small></div>
            <select aria-label={`Status for ${record.title}`} value={record.status} onChange={(event) => updateRecord(record.id, event.target.value)} style={styles.statusSelect}>{workflow.statuses.map((status) => <option key={status}>{status}</option>)}</select>
            <button type="button" onClick={() => deleteRecord(record.id)} style={styles.deleteButton} aria-label={`Remove ${record.title}`}>Remove</button>
          </article>)}
        </div>
      </section>}
    </DashboardFrame>
  );
}

const styles = {
  pageHeader: { background: '#fff', borderRadius: '12px', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(15,23,42,0.04)' },
  headingGroup: { display: 'flex', alignItems: 'center', gap: '14px' },
  icon: { width: '48px', height: '48px', borderRadius: '13px', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '24px' },
  eyebrow: { margin: 0, color: '#2563eb', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.08em' },
  title: { margin: '4px 0 2px', fontSize: '21px' },
  subtitle: { margin: 0, color: '#64748b', fontSize: '12px' },
  date: { color: '#475569', background: '#f8fafc', borderRadius: '8px', padding: '10px 14px', fontSize: '12px' },
  hero: { background: '#fff', borderRadius: '14px', padding: '28px 32px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: '24px', alignItems: 'center' },
  heroTitle: { margin: '8px 0', fontSize: 'clamp(1.7rem, 4vw, 2.6rem)' },
  copy: { maxWidth: '650px', color: '#64748b', lineHeight: 1.6, margin: 0 },
  counter: { display: 'grid', minWidth: '115px', padding: '18px', border: '2px solid', borderRadius: '12px', color: '#334155', textAlign: 'center' },
  counterNumber: { fontSize: '28px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' },
  duty: { display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', color: '#334155', fontWeight: '600', fontSize: '14px' },
  dot: { width: '24px', height: '24px', borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: '800' },
  activities: { background: '#172033', color: '#fff', borderRadius: '14px', padding: '24px' },
  activityGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '18px' },
  activity: { display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px', background: 'rgba(255,255,255,0.08)', borderRadius: '9px', lineHeight: 1.45, fontSize: '13px' },
  activityNumber: { fontWeight: '900', fontSize: '12px', letterSpacing: '0.08em' },
  workflow: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px' },
  workflowHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px' },
  sectionTitle: { margin: '6px 0', fontSize: '22px' },
  workflowCopy: { margin: 0, color: '#64748b', lineHeight: 1.5 },
  recordTools: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '16px' },
  refreshButton: { border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', color: '#334155', padding: '9px 12px', cursor: 'pointer' },
  errorMessage: { margin: '12px 0 0', padding: '10px 12px', borderRadius: '8px', color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca' },
  workflowCount: { minWidth: '78px', padding: '12px', border: '2px solid', borderRadius: '10px', textAlign: 'center', color: '#334155' },
  recordForm: { display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 1fr auto', gap: '10px', marginTop: '20px' },
  field: { width: '100%', minWidth: 0, border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 11px', fontSize: '13px', fontFamily: 'inherit' },
  addButton: { border: 0, borderRadius: '8px', color: '#fff', padding: '10px 16px', fontWeight: '800' },
  success: { color: '#166534', fontSize: '13px', margin: '12px 0 0' },
  records: { marginTop: '18px' },
  empty: { margin: 0, padding: '18px 0 0', color: '#64748b', fontSize: '13px' },
  record: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 0', borderTop: '1px solid #e2e8f0' },
  recordMain: { flex: 1, minWidth: 0, display: 'grid', gap: '3px' },
  recordDetails: { color: '#64748b' },
  statusSelect: { border: '1px solid #cbd5e1', borderRadius: '7px', padding: '7px', color: '#334155', background: '#fff' },
  deleteButton: { border: '1px solid #fecaca', borderRadius: '7px', background: '#fff', color: '#b91c1c', padding: '7px 9px' },
};
