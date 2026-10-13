import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardFrame from '../../DashboardFrame.jsx';
import { useNotifications } from '../../../notifications/NotificationContext.js';
import { apiRequest } from '../../../api.js';
import { departmentConfig } from '../../departmentConfig.js';
import './hrDashboard.css';

const department = 'HR';
const workflowViews = [
  { id: 'recruitment', label: 'Recruitment', icon: '◉', title: 'Recruitment & interviews', types: ['vacancy', 'candidate', 'application', 'interview'] },
  { id: 'onboarding', label: 'Onboarding', icon: '＋', title: 'Employee onboarding', types: ['onboarding', 'onboarding-checklist'] },
  { id: 'leave', label: 'Leave & attendance', icon: '◷', title: 'Leave & attendance', types: [] },
  { id: 'training', label: 'Training', icon: '◇', title: 'Training', types: ['training', 'training-assignment'] },
  { id: 'support', label: 'Employee support', icon: '♡', title: 'Employee support', types: ['support-case'] },
  { id: 'hr-tasks', label: 'Department tasks', icon: '▦', title: 'Department tasks', types: ['task'] },
];
const recordStatuses = {
  vacancy: ['Open', 'On hold', 'Filled', 'Closed'],
  candidate: ['New', 'Screening', 'Shortlisted', 'Rejected', 'Hired'],
  application: ['Received', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'],
  interview: ['Scheduled', 'Completed', 'Cancelled'],
  onboarding: ['Not started', 'In progress', 'Complete', 'On hold'],
  'onboarding-checklist': ['Pending', 'In progress', 'Complete', 'Blocked'],
  training: ['Planned', 'In progress', 'Complete', 'Cancelled'],
  'training-assignment': ['Assigned', 'In progress', 'Complete', 'Missed'],
  'support-case': ['New', 'In progress', 'Waiting', 'Resolved'],
  task: ['To do', 'In progress', 'Complete'],
};
const typeLabels = {
  vacancy: 'Vacancy',
  candidate: 'Candidate',
  application: 'Application',
  interview: 'Interview',
  onboarding: 'Employee onboarding',
  'onboarding-checklist': 'Checklist item',
  training: 'Training session',
  'training-assignment': 'Training assignment',
  'support-case': 'Support case',
  task: 'Department task',
};
const metadataFields = {
  vacancy: [
    { key: 'department', label: 'Hiring department' },
    { key: 'headcount', label: 'Positions available', type: 'number' },
    { key: 'location', label: 'Work location' },
  ],
  candidate: [
    { key: 'email', label: 'Candidate email', type: 'email' },
    { key: 'phone', label: 'Phone number', type: 'tel' },
    { key: 'source', label: 'Candidate source' },
  ],
  application: [
    { key: 'vacancy_id', label: 'Vacancy', reference: 'vacancy' },
    { key: 'candidate_id', label: 'Candidate', reference: 'candidate' },
  ],
  interview: [
    { key: 'scheduled_at', label: 'Interview date and time', type: 'datetime-local' },
    { key: 'interviewers', label: 'Interviewers' },
  ],
  onboarding: [
    { key: 'job_title', label: 'Job title' },
    { key: 'start_date', label: 'Start date', type: 'date' },
    { key: 'manager', label: 'Manager' },
  ],
  training: [
    { key: 'scheduled_at', label: 'Session date and time', type: 'datetime-local' },
    { key: 'location', label: 'Location or meeting link' },
    { key: 'provider', label: 'Trainer or provider' },
  ],
  'support-case': [
    { key: 'category', label: 'Support category' },
    { key: 'priority', label: 'Priority', options: ['Low', 'Normal', 'High', 'Urgent'] },
  ],
  task: [
    { key: 'priority', label: 'Priority', options: ['Low', 'Normal', 'High', 'Urgent'] },
  ],
};
const initialSummary = {
  vacancies: 0, candidates: 0, onboarding: 0, pendingLeave: 0,
  training: 0, supportCases: 0, openTasks: 0, attendanceToday: 0, recentActivity: [],
};

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function newRecordForm(type) {
  const metadata = {};
  for (const field of metadataFields[type] || []) {
    if (field.options) metadata[field.key] = field.options[1];
  }
  return {
    record_type: type,
    title: '',
    description: '',
    status: recordStatuses[type][0],
    employee_id: '',
    assigned_to: '',
    related_record_id: '',
    due_date: '',
    metadata,
  };
}

function fullName(employee) {
  return employee.name || employee.email;
}

function HrPageHeader({ title, description, action }) {
  return (
    <header className="hr-page-heading">
      <div>
        <p className="hr-kicker">PEOPLE OPERATIONS</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export default function HRDashboard({ user, onLogout }) {
  const config = departmentConfig[department];
  const { notify, confirm } = useNotifications();
  const [summary, setSummary] = useState(initialSummary);
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [myActivity, setMyActivity] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [recordType, setRecordType] = useState('vacancy');
  const [recordStatusFilter, setRecordStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [currentView, setCurrentView] = useState('dashboard');
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ start_date: '', end_date: '', reason: '' });
  const [manualAttendance, setManualAttendance] = useState({
    employee_id: '', work_date: localDate(), check_in: '', check_out: '', reason: '',
  });
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [attendanceNotes, setAttendanceNotes] = useState({});
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const [summaryData, recordsData, employeeData, leaveData, attendanceData, activityData] = await Promise.all([
        apiRequest('/hr/summary'),
        apiRequest('/hr/records'),
        apiRequest('/hr/employees'),
        apiRequest('/hr/leave'),
        apiRequest('/hr/attendance'),
        apiRequest('/hr/activity'),
      ]);
      setSummary(summaryData);
      setRecords(recordsData);
      setEmployees(employeeData);
      setLeaveRequests(leaveData);
      setAttendance(attendanceData);
      setMyActivity(activityData);
      setTodayAttendance(attendanceData.find((item) => String(item.work_date).slice(0, 10) === localDate()
        && item.employee_id === user.id) || null);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [refresh]);

  const workflowByView = useMemo(() => new Map(workflowViews.map((view) => [view.id, view])), []);
  const recordsForType = useMemo(() => records.filter((record) => record.record_type === recordType), [records, recordType]);
  const filteredRecords = useMemo(() => recordsForType.filter((record) => (
    (!recordStatusFilter || record.status === recordStatusFilter)
    && (!search || `${record.title} ${record.description} ${record.employee_name || ''} ${record.assignee_name || ''}`
      .toLowerCase().includes(search.toLowerCase()))
  )), [recordStatusFilter, recordsForType, search]);

  const navigate = (viewId) => {
    setCurrentView(viewId);
    const view = workflowByView.get(viewId);
    if (view) {
      setRecordType(view.types[0] || 'task');
      setRecordStatusFilter('');
      setSearch('');
      setForm(null);
      setSelectedRecord(null);
    }
  };

  const createRecord = (type = recordType) => {
    setRecordType(type);
    setEditingId(null);
    setSelectedRecord(null);
    setDocuments([]);
    setForm(newRecordForm(type));
  };

  const startEdit = (record) => {
    setRecordType(record.record_type);
    setSelectedRecord(null);
    setEditingId(record.id);
    setForm({
      record_type: record.record_type,
      title: record.title,
      description: record.description || '',
      status: record.status,
      employee_id: record.employee_id || '',
      assigned_to: record.assigned_to || '',
      related_record_id: record.related_record_id || '',
      due_date: record.due_date ? String(record.due_date).slice(0, 10) : '',
      metadata: record.metadata || {},
    });
  };

  const loadDocuments = async (record) => {
    setSelectedRecord(record);
    setDocuments([]);
    if (record.record_type !== 'onboarding') return;
    setDocumentsLoading(true);
    try {
      setDocuments(await apiRequest(`/hr/records/${record.id}/documents`));
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setDocumentsLoading(false);
    }
  };

  const saveRecord = async (event) => {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const saved = await apiRequest(editingId ? `/hr/records/${editingId}` : '/hr/records', {
        method: editingId ? 'PATCH' : 'POST',
        body: form,
      });
      setForm(null);
      setEditingId(null);
      setSelectedRecord(null);
      notify(editingId ? 'HR record updated.' : 'HR record created.', 'success');
      await refresh();
      if (saved.record_type === 'onboarding' && selectedRecord?.id === saved.id) setSelectedRecord(saved);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const changeRecordStatus = async (record, status) => {
    try {
      await apiRequest(`/hr/records/${record.id}`, { method: 'PATCH', body: { status } });
      notify('Status updated.', 'success');
      await refresh();
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const deleteRecord = async (record) => {
    const accepted = await confirm({
      title: 'Delete HR record?',
      message: `Delete "${record.title}"? Attached onboarding documents may also be removed and checklist links may be cleared.`,
      confirmLabel: 'Delete record',
      tone: 'danger',
    });
    if (!accepted) return;
    try {
      await apiRequest(`/hr/records/${record.id}`, { method: 'DELETE' });
      setSelectedRecord(null);
      notify('HR record deleted.', 'success');
      await refresh();
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const updateMetadata = (key, value) => {
    setForm((current) => ({ ...current, metadata: { ...current.metadata, [key]: value } }));
  };

  const handleDocumentUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedRecord) return;
    if (file.size > 5 * 1024 * 1024) {
      notify('Documents must be no larger than 5 MB.', 'error');
      return;
    }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      notify('Only PDF, JPEG, and PNG documents can be uploaded.', 'error');
      return;
    }
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('The selected document could not be read.'));
        reader.readAsDataURL(file);
      });
      await apiRequest(`/hr/records/${selectedRecord.id}/documents`, {
        method: 'POST',
        body: { file_name: file.name, content_type: file.type, data },
      });
      setDocuments(await apiRequest(`/hr/records/${selectedRecord.id}/documents`));
      notify('Onboarding document uploaded securely.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const deleteDocument = async (document) => {
    const accepted = await confirm({
      title: 'Delete document?',
      message: `Permanently delete "${document.file_name}"?`,
      confirmLabel: 'Delete document',
      tone: 'danger',
    });
    if (!accepted) return;
    try {
      await apiRequest(`/hr/documents/${document.id}`, { method: 'DELETE' });
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      notify('Document deleted.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const submitLeave = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/hr/leave', { method: 'POST', body: leaveForm });
      setLeaveForm({ start_date: '', end_date: '', reason: '' });
      notify('Leave request submitted for review.', 'success');
      await refresh();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const decideLeave = async (request, status) => {
    try {
      await apiRequest(`/hr/leave/${request.id}/decision`, { method: 'PATCH', body: { status } });
      notify(`Leave request ${status.toLowerCase()}.`, 'success');
      await refresh();
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const submitManualAttendance = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/hr/attendance/manual', {
        method: 'POST',
        body: {
          ...manualAttendance,
          check_in: new Date(`${manualAttendance.work_date}T${manualAttendance.check_in}`).toISOString(),
          check_out: new Date(`${manualAttendance.work_date}T${manualAttendance.check_out}`).toISOString(),
        },
      });
      setManualAttendance({ employee_id: '', work_date: localDate(), check_in: '', check_out: '', reason: '' });
      notify('Attendance recorded with an HR audit entry.', 'success');
      await refresh();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const clock = async (action) => {
    setSaving(true);
    try {
      await apiRequest('/hr/attendance/clock', { method: 'POST', body: { action } });
      notify(action === 'in' ? 'Clock-in recorded.' : 'Clock-out recorded.', 'success');
      await refresh();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveAttendanceNote = async (item) => {
    try {
      await apiRequest(`/hr/attendance/${item.id}`, {
        method: 'PATCH',
        body: { note: attendanceNotes[item.id] ?? item.note ?? '' },
      });
      notify('Attendance note saved.', 'success');
      await refresh();
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const renderActivity = () => (
    <section className="hr-section">
      <HrPageHeader title="My activity" description="Your assigned tasks and the actions you have taken in the HR workspace." />
      {isLoading ? <p className="hr-empty">Loading your activity…</p> : myActivity.length === 0 ? (
        <p className="hr-empty">No assigned tasks or activity yet.</p>
      ) : (
        <div className="hr-activity-list">
          {myActivity.map((item) => (
            <article key={`${item.item_type}-${item.id}`}>
              <span className="hr-activity-icon" aria-hidden="true">{item.item_type === 'task' ? '▦' : '◷'}</span>
              <div><strong>{item.details}</strong><span>{item.action.replaceAll('_', ' ')} · {new Date(item.created_at).toLocaleString()}</span></div>
            </article>
          ))}
        </div>
      )}
      {loadError && <p className="hr-error" role="alert">{loadError}</p>}
    </section>
  );

  const renderDashboard = (navigateTo) => (
    <div className="hr-dashboard">
      <header className="hr-header">
        <div className="hr-header-mark" aria-hidden="true">HR</div>
        <div className="hr-header-copy">
          <p className="hr-kicker">PEOPLE OPERATIONS</p>
          <h1>HR workspace</h1>
          <p>Workforce activity and people operations in one place.</p>
        </div>
        <button type="button" className="hr-refresh" onClick={refresh} disabled={isLoading}>
          {isLoading ? 'Refreshing…' : 'Refresh dashboard'}
        </button>
      </header>

      <section className="hr-stat-grid" aria-label="HR dashboard statistics">
        {[
          { label: 'Open vacancies', value: summary.vacancies, view: 'recruitment', type: 'vacancy' },
          { label: 'Candidates', value: summary.candidates, view: 'recruitment', type: 'candidate' },
          { label: 'Onboarding', value: summary.onboarding, view: 'onboarding', type: 'onboarding' },
          { label: 'Pending leave', value: summary.pendingLeave, view: 'leave' },
          { label: 'Training sessions', value: summary.training, view: 'training', type: 'training' },
          { label: 'Open support cases', value: summary.supportCases, view: 'support' },
          { label: 'Open tasks', value: summary.openTasks, view: 'hr-tasks' },
          { label: 'Attendance today', value: summary.attendanceToday, view: 'leave' },
        ].map((stat) => (
          <button
            type="button"
            className="hr-stat-card"
            key={stat.label}
            onClick={() => {
              navigateTo(stat.view);
              if (stat.type) setRecordType(stat.type);
            }}
          >
            <span>{stat.label}</span><strong>{isLoading ? '—' : stat.value}</strong><small>Open {stat.view === 'hr-tasks' ? 'tasks' : workflowByView.get(stat.view)?.label.toLowerCase()}</small>
          </button>
        ))}
      </section>

      <section className="hr-duty-grid" aria-label="HR workflows">
        {workflowViews.map((view, index) => {
          const count = records.filter((record) => view.types.includes(record.record_type)).length;
          return (
            <button type="button" className="hr-duty-card" key={view.id} onClick={() => navigateTo(view.id)}>
              <span className="hr-duty-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="hr-duty-copy">
                <strong>{view.title}</strong>
                <small>{view.id === 'recruitment' ? 'Vacancies, candidates, applications, and interviews'
                  : view.id === 'onboarding' ? 'Employee setup, checklists, and secure documents'
                    : view.id === 'leave' ? 'Requests, approvals, and daily attendance'
                      : view.id === 'training' ? 'Sessions, employee assignments, and completion'
                        : view.id === 'support' ? 'Employee support cases and follow-ups'
                          : 'Create, assign, filter, and complete team work'}</small>
                <span className="hr-duty-action">Open workflow <span aria-hidden="true">→</span></span>
              </span>
              <span className="hr-duty-count">{isLoading ? '—' : count}</span>
            </button>
          );
        })}
      </section>

      <section className="hr-recent-panel">
        <header><div><p className="hr-kicker">LATEST CHANGES</p><h2>Recent HR activity</h2></div><button type="button" onClick={() => navigateTo('activity')}>View my activity</button></header>
        {isLoading ? <p className="hr-empty">Loading recent activity…</p> : summary.recentActivity.length === 0 ? (
          <p className="hr-empty">No HR activity has been recorded yet.</p>
        ) : (
          <div className="hr-recent-list">
            {summary.recentActivity.map((item) => (
              <article key={item.id}>
                <strong>{item.details}</strong>
                <span>{item.actor_name || item.actor_email || 'Former user'} · {new Date(item.created_at).toLocaleString()}</span>
              </article>
            ))}
          </div>
        )}
      </section>
      {loadError && <p className="hr-error" role="alert">{loadError}</p>}
    </div>
  );

  const renderRecordEditor = () => {
    if (!form) return null;
    const linkedRecords = form.record_type === 'onboarding-checklist'
      ? records.filter((record) => record.record_type === 'onboarding')
      : form.record_type === 'training-assignment'
        ? records.filter((record) => record.record_type === 'training')
          : form.record_type === 'interview'
            ? records.filter((record) => record.record_type === 'application')
            : [];
    return (
      <form className="hr-form-panel" onSubmit={saveRecord}>
        <h2>{editingId ? 'Edit record' : `Create ${typeLabels[form.record_type].toLowerCase()}`}</h2>
        {!editingId && (
          <label><span>Record type</span>
            <select value={form.record_type} onChange={(event) => {
              const nextType = event.target.value;
              setRecordType(nextType);
              setForm(newRecordForm(nextType));
            }}>
              {workflowByView.get(currentView)?.types.map((type) => <option value={type} key={type}>{typeLabels[type]}</option>)}
            </select>
          </label>
        )}
        <div className="hr-form-grid">
          <label className="hr-form-wide"><span>Title</span><input value={form.title} maxLength={160} required onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label className="hr-form-wide"><span>Description / notes</span><textarea value={form.description} maxLength={4000} rows={3} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label><span>Status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{recordStatuses[form.record_type].map((status) => <option key={status}>{status}</option>)}</select></label>
          <label><span>Follow-up due date</span><input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></label>
          {['onboarding', 'training-assignment', 'support-case'].includes(form.record_type) && (
            <label><span>{form.record_type === 'onboarding' ? 'Link staff account (optional)' : 'Employee'}</span><select value={form.employee_id} required={form.record_type === 'training-assignment'} onChange={(event) => setForm({ ...form, employee_id: event.target.value })}>
              <option value="">{form.record_type === 'onboarding' ? 'New employee / account not provisioned yet' : 'Select an employee'}</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{fullName(employee)} · {employee.department || 'No department'}</option>)}
            </select></label>
          )}
          {['task', 'support-case', 'interview'].includes(form.record_type) && (
            <label><span>Assigned to</span><select value={form.assigned_to} onChange={(event) => setForm({ ...form, assigned_to: event.target.value })}>
              <option value="">Unassigned</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{fullName(employee)}</option>)}
            </select></label>
          )}
          {linkedRecords.length > 0 && (
            <label><span>{form.record_type === 'interview' ? 'Application' : form.record_type === 'training-assignment' ? 'Training session' : 'Onboarding record'}</span>
              <select value={form.related_record_id} required onChange={(event) => setForm({ ...form, related_record_id: event.target.value })}>
                <option value="">Select a related record</option>{linkedRecords.map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}
              </select>
            </label>
          )}
          {(metadataFields[form.record_type] || []).map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              {field.reference ? (
                <select value={form.metadata[field.key] || ''} required onChange={(event) => updateMetadata(field.key, event.target.value)}>
                  <option value="">Select {field.reference}</option>
                  {records.filter((record) => record.record_type === field.reference).map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}
                </select>
              ) : field.options ? (
                <select value={form.metadata[field.key] || field.options[1]} onChange={(event) => updateMetadata(field.key, event.target.value)}>{field.options.map((option) => <option key={option}>{option}</option>)}</select>
              ) : (
                <input type={field.type || 'text'} value={form.metadata[field.key] || ''} maxLength={2000} onChange={(event) => updateMetadata(field.key, event.target.value)} />
              )}
            </label>
          ))}
        </div>
        <div className="hr-form-actions">
          <button type="button" className="hr-secondary-button" onClick={() => { setForm(null); setEditingId(null); }}>Cancel</button>
          <button type="submit" className="hr-primary-button" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create record'}</button>
        </div>
      </form>
    );
  };

  const renderRecordPage = (viewId) => {
    const view = workflowByView.get(viewId);
    const allowedTypes = view.types;
    const currentTypeStatuses = recordStatuses[recordType] || [];
    const title = view.title;
    const description = viewId === 'recruitment'
      ? 'Coordinate approved openings, candidate pipelines, applications, and interviews.'
      : viewId === 'onboarding'
        ? 'Track new employees, onboarding owners, checklists, and confidential documents.'
        : viewId === 'training'
          ? 'Schedule employee training and monitor assigned learning through completion.'
          : viewId === 'support'
            ? 'Create, assign, prioritize, and resolve employee support cases.'
            : 'Assign department work, filter the queue, and track delivery to completion.';
    const pageRecords = filteredRecords.filter((record) => allowedTypes.includes(record.record_type));
    return (
      <section className="hr-section">
        <HrPageHeader
          title={title}
          description={description}
          action={<button type="button" className="hr-primary-button" onClick={() => createRecord(allowedTypes[0])}>＋ Add {viewId === 'recruitment' ? 'recruitment item' : viewId === 'onboarding' ? 'employee' : viewId === 'training' ? 'training' : viewId === 'support' ? 'support case' : 'task'}</button>}
        />
        <div className="hr-toolbar">
          <label><span>Record type</span><select value={recordType} onChange={(event) => { setRecordType(event.target.value); setRecordStatusFilter(''); setForm(null); setSelectedRecord(null); }}>
            {allowedTypes.map((type) => <option value={type} key={type}>{typeLabels[type]}</option>)}
          </select></label>
          <label><span>Filter status</span><select value={recordStatusFilter} onChange={(event) => setRecordStatusFilter(event.target.value)}>
            <option value="">All statuses</option>{currentTypeStatuses.map((status) => <option key={status}>{status}</option>)}
          </select></label>
          <label className="hr-search-field"><span>Search</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records…" /></label>
          <button type="button" className="hr-secondary-button" onClick={refresh} disabled={isLoading}>{isLoading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
        {renderRecordEditor()}
        {selectedRecord && (
          <section className="hr-detail-panel">
            <header><div><p className="hr-kicker">RECORD DETAILS</p><h2>{selectedRecord.title}</h2></div><button type="button" className="hr-secondary-button" onClick={() => setSelectedRecord(null)}>Close</button></header>
            <p>{selectedRecord.description || 'No notes have been added.'}</p>
            <dl>
              <div><dt>Status</dt><dd>{selectedRecord.status}</dd></div>
              <div><dt>Employee</dt><dd>{selectedRecord.employee_name || 'Not linked'}</dd></div>
              <div><dt>Assigned to</dt><dd>{selectedRecord.assignee_name || 'Unassigned'}</dd></div>
              <div><dt>Due date</dt><dd>{selectedRecord.due_date ? String(selectedRecord.due_date).slice(0, 10) : 'Not set'}</dd></div>
              {Object.entries(selectedRecord.metadata || {}).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{String(value ?? '—')}</dd></div>)}
            </dl>
            {selectedRecord.record_type === 'onboarding' && (
              <div className="hr-document-panel">
                <h3>Employee documents</h3>
                <p>Files are stored in PostgreSQL and can only be accessed by authorized HR staff and administrators.</p>
                <label className="hr-file-button">Upload PDF / JPEG / PNG (max 5 MB)
                  <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={handleDocumentUpload} />
                </label>
                {documentsLoading ? <p className="hr-empty">Loading documents…</p> : documents.length === 0 ? <p className="hr-empty">No documents attached.</p> : (
                  <ul>{documents.map((document) => (
                    <li key={document.id}>
                      <a href={`/api/hr/documents/${document.id}/download`}>{document.file_name}</a>
                      <span>{Math.ceil(document.file_size / 1024)} KB · {new Date(document.created_at).toLocaleDateString()}</span>
                      <button type="button" className="hr-danger-link" onClick={() => deleteDocument(document)}>Delete</button>
                    </li>
                  ))}</ul>
                )}
              </div>
            )}
          </section>
        )}
        <div className="hr-record-list" aria-live="polite">
          {isLoading ? <p className="hr-empty">Loading records…</p> : pageRecords.length === 0 ? (
            <p className="hr-empty">No matching {typeLabels[recordType]?.toLowerCase() || 'records'}. Add a record or adjust the filters.</p>
          ) : pageRecords.map((record) => (
            <article className="hr-record-row" key={record.id}>
              <div className="hr-record-copy">
                <div className="hr-record-title"><strong>{record.title}</strong><span>{typeLabels[record.record_type]}</span></div>
                <p>{record.description || 'No additional notes.'}</p>
                <small>{record.employee_name ? `${record.employee_name} · ` : ''}{record.assignee_name ? `Assigned to ${record.assignee_name} · ` : ''}{record.due_date ? `Due ${String(record.due_date).slice(0, 10)} · ` : ''}Created {new Date(record.created_at).toLocaleDateString()}</small>
              </div>
              <select aria-label={`Status for ${record.title}`} value={record.status} onChange={(event) => changeRecordStatus(record, event.target.value)}>{recordStatuses[record.record_type].map((status) => <option key={status}>{status}</option>)}</select>
              <div className="hr-row-actions">
                <button type="button" onClick={() => loadDocuments(record)}>View</button>
                <button type="button" onClick={() => startEdit(record)}>Edit</button>
                <button type="button" className="hr-danger-link" onClick={() => deleteRecord(record)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
        {loadError && <p className="hr-error" role="alert">{loadError}</p>}
      </section>
    );
  };

  const renderLeavePage = () => (
    <section className="hr-section">
      <HrPageHeader title="Leave & attendance" description="Submit leave requests, review team decisions, and record daily attendance." />
      <div className="hr-leave-grid">
        <form className="hr-form-panel" onSubmit={submitLeave}>
          <h2>Submit a leave request</h2>
          <p className="hr-privacy-note">Share only the information needed to review your request. Requests are visible only to you and authorized HR staff.</p>
          <div className="hr-form-grid">
            <label><span>Start date</span><input type="date" required value={leaveForm.start_date} onChange={(event) => setLeaveForm({ ...leaveForm, start_date: event.target.value })} /></label>
            <label><span>End date</span><input type="date" required min={leaveForm.start_date || undefined} value={leaveForm.end_date} onChange={(event) => setLeaveForm({ ...leaveForm, end_date: event.target.value })} /></label>
            <label className="hr-form-wide"><span>Reason or coverage notes</span><textarea rows={3} maxLength={1000} required value={leaveForm.reason} onChange={(event) => setLeaveForm({ ...leaveForm, reason: event.target.value })} /></label>
          </div>
          <div className="hr-form-actions"><button type="submit" className="hr-primary-button" disabled={saving}>{saving ? 'Submitting…' : 'Submit request'}</button></div>
        </form>
        <section className="hr-form-panel hr-clock-panel">
          <h2>Today’s attendance</h2>
          <p>{todayAttendance?.check_in ? `Clocked in at ${new Date(todayAttendance.check_in).toLocaleTimeString()}` : 'No clock-in recorded today.'}</p>
          {todayAttendance?.check_out && <p>Clocked out at {new Date(todayAttendance.check_out).toLocaleTimeString()}.</p>}
          <div className="hr-form-actions">
            <button type="button" className="hr-primary-button" disabled={saving || Boolean(todayAttendance)} onClick={() => clock('in')}>Clock in</button>
            <button type="button" className="hr-secondary-button" disabled={saving || !todayAttendance?.check_in || Boolean(todayAttendance?.check_out)} onClick={() => clock('out')}>Clock out</button>
          </div>
        </section>
      </div>
      <form className="hr-form-panel" onSubmit={submitManualAttendance}>
        <h2>Record attendance for an employee</h2>
        <p>Use for verified missed punches. The employee, work date, times, reason, and your HR account are recorded in the audit log.</p>
        <div className="hr-form-grid">
          <label><span>Employee</span><select required value={manualAttendance.employee_id} onChange={(event) => setManualAttendance({ ...manualAttendance, employee_id: event.target.value })}><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.department}</option>)}</select></label>
          <label><span>Work date</span><input type="date" required value={manualAttendance.work_date} onChange={(event) => setManualAttendance({ ...manualAttendance, work_date: event.target.value })} /></label>
          <label><span>Clock in</span><input type="time" required value={manualAttendance.check_in} onChange={(event) => setManualAttendance({ ...manualAttendance, check_in: event.target.value })} /></label>
          <label><span>Clock out</span><input type="time" required value={manualAttendance.check_out} onChange={(event) => setManualAttendance({ ...manualAttendance, check_out: event.target.value })} /></label>
          <label className="hr-form-wide"><span>Reason for manual entry</span><textarea rows={2} minLength={8} maxLength={500} required value={manualAttendance.reason} onChange={(event) => setManualAttendance({ ...manualAttendance, reason: event.target.value })} /></label>
        </div>
        <div className="hr-form-actions"><button type="submit" className="hr-primary-button" disabled={saving || employees.length === 0}>{saving ? 'Recording…' : 'Record attendance'}</button></div>
      </form>
      <section className="hr-list-panel">
        <header><div><h2>Leave requests</h2><p>Requests awaiting review and their latest decisions.</p></div><button type="button" className="hr-secondary-button" onClick={refresh} disabled={isLoading}>{isLoading ? 'Refreshing…' : 'Refresh'}</button></header>
        {isLoading ? <p className="hr-empty">Loading leave requests…</p> : leaveRequests.length === 0 ? <p className="hr-empty">No leave requests found.</p> : leaveRequests.map((request) => (
          <article className="hr-record-row" key={request.id}>
            <div className="hr-record-copy"><strong>{request.employee_name}</strong><p>{String(request.start_date).slice(0, 10)} through {String(request.end_date).slice(0, 10)}</p><small>{request.reason}</small></div>
            <span className={`hr-status-pill status-${request.status.toLowerCase()}`}>{request.status}</span>
            {request.status === 'Pending' && request.employee_id !== user.id && (
              <div className="hr-row-actions">
                <button type="button" onClick={() => decideLeave(request, 'Approved')}>Approve</button>
                <button type="button" className="hr-danger-link" onClick={() => decideLeave(request, 'Rejected')}>Reject</button>
              </div>
            )}
          </article>
        ))}
      </section>
      <section className="hr-list-panel">
        <header><div><h2>Attendance records</h2><p>Staff clock-in and clock-out history.</p></div></header>
        {isLoading ? <p className="hr-empty">Loading attendance…</p> : attendance.length === 0 ? <p className="hr-empty">No attendance records found.</p> : attendance.map((item) => (
          <article className="hr-record-row" key={item.id}>
            <div className="hr-record-copy"><strong>{item.employee_name} · {String(item.work_date).slice(0, 10)}</strong><small>In: {item.check_in ? new Date(item.check_in).toLocaleTimeString() : '—'} · Out: {item.check_out ? new Date(item.check_out).toLocaleTimeString() : 'Not clocked out'}</small></div>
            <label className="hr-attendance-note"><span>HR note</span><input value={attendanceNotes[item.id] ?? item.note ?? ''} maxLength={500} onChange={(event) => setAttendanceNotes({ ...attendanceNotes, [item.id]: event.target.value })} /></label>
            <button type="button" className="hr-secondary-button" onClick={() => saveAttendanceNote(item)}>Save note</button>
          </article>
        ))}
      </section>
      {loadError && <p className="hr-error" role="alert">{loadError}</p>}
    </section>
  );

  const renderHrTasks = () => renderRecordPage('hr-tasks');

  const renderCustomView = (viewId) => (
    viewId === 'leave' ? renderLeavePage()
      : viewId === 'hr-tasks' ? renderHrTasks()
        : renderRecordPage(viewId)
  );

  return (
    <DashboardFrame
      user={user}
      config={config}
      onLogout={onLogout}
      customViews={workflowViews}
      renderDashboard={renderDashboard}
      renderCustomView={renderCustomView}
      renderActivityView={renderActivity}
      hideDefaultTasks
      onViewChange={navigate}
    >
    </DashboardFrame>
  );
}
