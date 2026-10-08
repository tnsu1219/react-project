import React, { useEffect, useState } from 'react';
import DashboardFrame from '../../DashboardFrame.jsx';
import { departmentConfig } from '../../departmentConfig.js';
import './financeDashboard.css';

const TAX_RATE = 0.35;
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const formatAmount = (amount) => new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);

function readFinanceData(key) {
  try {
    const data = JSON.parse(window.localStorage.getItem(key) || '{}');
    return {
      employees: Array.isArray(data.employees) ? data.employees : [],
      attendance: Array.isArray(data.attendance) ? data.attendance : [],
      penalties: Array.isArray(data.penalties) ? data.penalties : [],
    };
  } catch {
    return { employees: [], attendance: [], penalties: [] };
  }
}

export default function FinanceDashboard({ user, onLogout }) {
  const storageKey = `rodas-system:finance:${user.id || user.email}`;
  const [data, setData] = useState(() => readFinanceData(storageKey));
  const [month, setMonth] = useState(today().slice(0, 7));
  const [employeeForm, setEmployeeForm] = useState({ name: '', monthlySalary: '', workingDays: '26' });
  const [attendanceForm, setAttendanceForm] = useState({ employeeId: '', date: today(), status: 'Present' });
  const [penaltyForm, setPenaltyForm] = useState({ employeeId: '', date: today(), amount: '', reason: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {}
  }, [data, storageKey]);

  const monthAttendance = data.attendance.filter((entry) => entry.date.startsWith(month));
  const monthPenalties = data.penalties.filter((penalty) => penalty.date.startsWith(month));
  const payroll = data.employees.map((employee) => {
    const attendedDays = monthAttendance.filter((entry) => entry.employeeId === employee.id && ['Present', 'Late'].includes(entry.status)).length;
    const penaltyItems = monthPenalties.filter((penalty) => penalty.employeeId === employee.id);
    const gross = employee.monthlySalary * Math.min(attendedDays / employee.workingDays, 1);
    const tax = gross * TAX_RATE;
    const penaltyTotal = penaltyItems.reduce((total, penalty) => total + penalty.amount, 0);
    return { ...employee, attendedDays, penaltyCount: penaltyItems.length, penaltyTotal, gross, tax, net: gross - tax - penaltyTotal };
  });
  const totals = payroll.reduce((total, employee) => ({
    net: total.net + employee.net,
    tax: total.tax + employee.tax,
    penalties: total.penalties + employee.penaltyTotal,
    attended: total.attended + employee.attendedDays,
    penaltyCount: total.penaltyCount + employee.penaltyCount,
  }), { net: 0, tax: 0, penalties: 0, attended: 0, penaltyCount: 0 });

  const addEmployee = (event) => {
    event.preventDefault();
    const name = employeeForm.name.trim();
    const monthlySalary = Number(employeeForm.monthlySalary);
    const workingDays = Number(employeeForm.workingDays);
    if (!name || monthlySalary <= 0 || workingDays <= 0) return;
    if (data.employees.some((employee) => employee.name.toLowerCase() === name.toLowerCase())) {
      setMessage('An employee with that name is already on the list.');
      return;
    }
    const employee = { id: makeId(), name, monthlySalary, workingDays };
    setData((current) => ({ ...current, employees: [...current.employees, employee] }));
    setAttendanceForm((current) => ({ ...current, employeeId: current.employeeId || employee.id }));
    setPenaltyForm((current) => ({ ...current, employeeId: current.employeeId || employee.id }));
    setEmployeeForm({ name: '', monthlySalary: '', workingDays: '26' });
    setMessage(`${name} added to the payroll list.`);
  };

  const addAttendance = (event) => {
    event.preventDefault();
    const entry = { ...attendanceForm, id: makeId() };
    setData((current) => ({
      ...current,
      attendance: [...current.attendance.filter((item) => item.employeeId !== entry.employeeId || item.date !== entry.date), entry],
    }));
    setMessage('Daily attendance saved. An existing entry for that employee and date was replaced.');
  };

  const addPenalty = (event) => {
    event.preventDefault();
    const amount = Number(penaltyForm.amount);
    if (amount <= 0 || !penaltyForm.reason.trim()) return;
    setData((current) => ({ ...current, penalties: [{ ...penaltyForm, id: makeId(), amount, reason: penaltyForm.reason.trim() }, ...current.penalties] }));
    setPenaltyForm((current) => ({ ...current, amount: '', reason: '' }));
    setMessage('Penalty recorded for payroll.');
  };

  const removeEmployee = (employeeId) => {
    const employee = data.employees.find((item) => item.id === employeeId);
    const nextEmployeeId = data.employees.find((item) => item.id !== employeeId)?.id || '';
    setData((current) => ({
      employees: current.employees.filter((item) => item.id !== employeeId),
      attendance: current.attendance.filter((item) => item.employeeId !== employeeId),
      penalties: current.penalties.filter((item) => item.employeeId !== employeeId),
    }));
    setAttendanceForm((current) => current.employeeId === employeeId ? { ...current, employeeId: nextEmployeeId } : current);
    setPenaltyForm((current) => current.employeeId === employeeId ? { ...current, employeeId: nextEmployeeId } : current);
    setMessage(`${employee?.name || 'Employee'} and their saved records were removed.`);
  };

  const removeAttendance = (id) => setData((current) => ({ ...current, attendance: current.attendance.filter((entry) => entry.id !== id) }));
  const removePenalty = (id) => setData((current) => ({ ...current, penalties: current.penalties.filter((penalty) => penalty.id !== id) }));

  return (
    <DashboardFrame user={user} config={departmentConfig.Finance} onLogout={onLogout}>
      <div className="finance-dashboard">
        <header className="finance-header">
          <div>
            <p className="finance-kicker">Finance workspace</p>
            <h1>Payroll &amp; daily records</h1>
            <p>Review attendance, track penalties, and calculate take-home pay.</p>
          </div>
          <label className="finance-month">Payroll month<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
        </header>

        <div className="finance-notice"><strong>35% tax rate</strong><span>Tax is calculated on attendance-adjusted salary; penalties are deducted after tax.</span></div>

        <section className="finance-summary" aria-label="Monthly finance summary">
          <article className="finance-metric finance-metric-primary"><span>Total balance · net payroll</span><strong>{formatAmount(totals.net)}</strong><small>Earned pay after tax and penalties</small></article>
          <article className="finance-metric"><span>Attendance days</span><strong>{totals.attended}</strong><small>Present or late entries this month</small></article>
          <article className="finance-metric"><span>Penalties</span><strong>{totals.penaltyCount}</strong><small>{formatAmount(totals.penalties)} total deductions</small></article>
          <article className="finance-metric"><span>Tax withheld</span><strong>{formatAmount(totals.tax)}</strong><small>35% of earned salary</small></article>
        </section>

        <section className="finance-entry-grid" aria-label="Finance record entry forms">
          <form className="finance-panel" onSubmit={addEmployee}>
            <div className="finance-panel-heading"><span className="finance-step">01</span><div><h2>Add employee</h2><p>Set the salary and expected working days.</p></div></div>
            <label>Employee name<input value={employeeForm.name} onChange={(event) => setEmployeeForm({ ...employeeForm, name: event.target.value })} placeholder="Full name" required /></label>
            <div className="finance-fields-two">
              <label>Monthly salary<input type="number" min="0.01" step="0.01" value={employeeForm.monthlySalary} onChange={(event) => setEmployeeForm({ ...employeeForm, monthlySalary: event.target.value })} placeholder="0.00" required /></label>
              <label>Work days / month<input type="number" min="1" max="31" step="1" value={employeeForm.workingDays} onChange={(event) => setEmployeeForm({ ...employeeForm, workingDays: event.target.value })} required /></label>
            </div>
            <button className="finance-button finance-button-dark" type="submit">Add to payroll</button>
          </form>

          <form className="finance-panel" onSubmit={addAttendance}>
            <div className="finance-panel-heading"><span className="finance-step">02</span><div><h2>Daily attendance</h2><p>One status per employee for each date.</p></div></div>
            <label>Employee<select value={attendanceForm.employeeId} onChange={(event) => setAttendanceForm({ ...attendanceForm, employeeId: event.target.value })} required disabled={!data.employees.length}><EmployeeOptions employees={data.employees} /></select></label>
            <div className="finance-fields-two">
              <label>Date<input type="date" value={attendanceForm.date} onChange={(event) => setAttendanceForm({ ...attendanceForm, date: event.target.value })} required /></label>
              <label>Status<select value={attendanceForm.status} onChange={(event) => setAttendanceForm({ ...attendanceForm, status: event.target.value })}><option>Present</option><option>Late</option><option>Absent</option><option>Leave</option></select></label>
            </div>
            <button className="finance-button finance-button-green" type="submit" disabled={!data.employees.length}>Save attendance</button>
          </form>

          <form className="finance-panel" onSubmit={addPenalty}>
            <div className="finance-panel-heading"><span className="finance-step">03</span><div><h2>Record a penalty</h2><p>Penalty count and amount are tracked per person.</p></div></div>
            <label>Employee<select value={penaltyForm.employeeId} onChange={(event) => setPenaltyForm({ ...penaltyForm, employeeId: event.target.value })} required disabled={!data.employees.length}><EmployeeOptions employees={data.employees} /></select></label>
            <div className="finance-fields-two">
              <label>Date<input type="date" value={penaltyForm.date} onChange={(event) => setPenaltyForm({ ...penaltyForm, date: event.target.value })} required /></label>
              <label>Penalty amount<input type="number" min="0.01" step="0.01" value={penaltyForm.amount} onChange={(event) => setPenaltyForm({ ...penaltyForm, amount: event.target.value })} placeholder="0.00" required /></label>
            </div>
            <label>Reason<input value={penaltyForm.reason} onChange={(event) => setPenaltyForm({ ...penaltyForm, reason: event.target.value })} placeholder="Reason for deduction" required /></label>
            <button className="finance-button finance-button-amber" type="submit" disabled={!data.employees.length}>Add penalty</button>
          </form>
        </section>

        {message && <p className="finance-message" role="status">{message}</p>}

        <section className="finance-panel finance-payroll">
          <div className="finance-table-heading"><div><p className="finance-kicker">Selected month</p><h2>Salary calculation</h2></div><span className="finance-tax-tag">Tax · 35%</span></div>
          <p className="finance-formula">Earned salary = monthly salary × min(attended days ÷ work days, 1) · Net pay = earned salary − 35% tax − penalties</p>
          <div className="finance-table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Attendance</th><th>Penalty count</th><th>Monthly salary</th><th>Earned</th><th>Tax (35%)</th><th>Penalty total</th><th>Net pay</th><th><span className="finance-visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                {payroll.length === 0 ? <tr><td className="finance-empty" colSpan="9">Add an employee to start a payroll calculation.</td></tr> : payroll.map((employee) => (
                  <tr key={employee.id}>
                    <td className="finance-person">{employee.name}</td><td>{employee.attendedDays} / {employee.workingDays} days</td><td>{employee.penaltyCount}</td><td>{formatAmount(employee.monthlySalary)}</td><td>{formatAmount(employee.gross)}</td><td>{formatAmount(employee.tax)}</td><td>{formatAmount(employee.penaltyTotal)}</td><td className="finance-net">{formatAmount(employee.net)}</td>
                    <td><button className="finance-remove" type="button" onClick={() => removeEmployee(employee.id)} aria-label={`Remove ${employee.name}`}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
              {payroll.length > 0 && <tfoot><tr><th colSpan="4">Monthly totals</th><th>{formatAmount(payroll.reduce((sum, employee) => sum + employee.gross, 0))}</th><th>{formatAmount(totals.tax)}</th><th>{formatAmount(totals.penalties)}</th><th>{formatAmount(totals.net)}</th><th /></tr></tfoot>}
            </table>
          </div>
        </section>

        <section className="finance-record-grid">
          <RecordList title="Attendance checks" count={monthAttendance.length} empty="No attendance saved for this month." records={[...monthAttendance].sort((a, b) => b.date.localeCompare(a.date)).map((entry) => ({ ...entry, label: data.employees.find((employee) => employee.id === entry.employeeId)?.name || 'Removed employee', detail: entry.status, remove: () => removeAttendance(entry.id) }))} />
          <RecordList title="Penalty records" count={monthPenalties.length} empty="No penalties saved for this month." records={monthPenalties.map((penalty) => ({ ...penalty, label: data.employees.find((employee) => employee.id === penalty.employeeId)?.name || 'Removed employee', detail: `${penalty.reason} · ${formatAmount(penalty.amount)}`, remove: () => removePenalty(penalty.id) }))} />
        </section>

        <p className="finance-storage-note">Finance records are saved only in this browser for this signed-in user. They are not shared with other devices or connected to a central payroll system.</p>
      </div>
    </DashboardFrame>
  );
}

function EmployeeOptions({ employees }) {
  return <>{employees.length ? employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>) : <option value="">Add an employee first</option>}</>;
}

function RecordList({ title, count, empty, records }) {
  return (
    <section className="finance-panel finance-record-list">
      <div className="finance-list-heading"><h2>{title}</h2><span>{count}</span></div>
      {records.length === 0 ? <p className="finance-list-empty">{empty}</p> : <ul>{records.map((record) => <li key={record.id}><div><strong>{record.label}</strong><span>{record.date} · {record.detail}</span></div><button type="button" className="finance-remove" onClick={record.remove}>Remove</button></li>)}</ul>}
    </section>
  );
}
