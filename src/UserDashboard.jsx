import React from 'react';
import ITDashboard from './userDashboard/departments/IT/ITDashboard.jsx';
import SalesDashboard from './userDashboard/departments/Sales/SalesDashboard.jsx';
import FinanceDashboard from './userDashboard/departments/Finance/FinanceDashboard.jsx';
import MainstoreDashboard from './userDashboard/departments/Mainstore/MainstoreDashboard.jsx';
import AttendanceDashboard from './userDashboard/departments/Attendance/AttendanceDashboard.jsx';
import AuditorDashboard from './userDashboard/departments/Auditor/AuditorDashboard.jsx';
import LogisticsDashboard from './userDashboard/departments/Logistics/LogisticsDashboard.jsx';

export default function UserDashboard({ user, onLogout }) {
  const department = user?.department;
  const dashboardByDepartment = {
    IT: ITDashboard,
    Sales: SalesDashboard,
    Finance: FinanceDashboard,
    Mainstore: MainstoreDashboard,
    Attendance: AttendanceDashboard,
    Auditor: AuditorDashboard,
    Logistics: LogisticsDashboard,
  };
  const DepartmentDashboard = dashboardByDepartment[department];

  if (DepartmentDashboard) return <DepartmentDashboard user={user} onLogout={onLogout} />;

  return <MissingDepartmentDashboard />;
}

const styles = {
  page: {
    minHeight: 'calc(100vh - 41px)',
    padding: '48px 24px',
    background: '#eef2ff',
    fontFamily: 'sans-serif',
    color: '#172554',
    boxSizing: 'border-box',
  },
  panel: {
    maxWidth: '900px',
    margin: '0 auto',
  },
  eyebrow: {
    margin: 0,
    color: '#4f46e5',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    fontSize: '0.75rem',
  },
  title: {
    margin: '10px 0',
    fontSize: 'clamp(2rem, 5vw, 3.5rem)',
  },
  copy: {
    maxWidth: '620px',
    color: '#475569',
    lineHeight: 1.6,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '16px',
    marginTop: '32px',
  },
  card: {
    background: '#fff',
    border: '1px solid #c7d2fe',
    borderRadius: '12px',
    padding: '24px',
  },
  icon: {
    color: '#4f46e5',
    fontSize: '1.5rem',
  },
  cardTitle: {
    margin: '14px 0 6px',
    fontSize: '1.1rem',
  },
  cardCopy: {
    margin: 0,
    color: '#64748b',
    lineHeight: 1.5,
  },
};

function MissingDepartmentDashboard() {
  return (
    <main style={styles.page}>
      <section style={styles.panel}>
        <p style={styles.eyebrow}>Rodas System</p>
        <h1 style={styles.title}>Department not assigned</h1>
        <p style={styles.copy}>Ask an administrator to assign your department before using the workspace.</p>
      </section>
    </main>
  );
}