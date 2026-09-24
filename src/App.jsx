import React, { useState, useEffect, useMemo, Component } from 'react';
import { supabase } from './supabaseClient';

// React Error Boundary to catch any unhandled crashes and print them on screen
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', fontFamily: 'sans-serif', backgroundColor: '#fef2f2', minHeight: '100vh' }}>
          <h1 style={{ color: '#991b1b' }}>⚠️ Application Error Caught</h1>
          <p style={{ color: '#7f1d1d' }}>The app crashed with the following runtime error:</p>
          <pre style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #fca5a5', overflowX: 'auto' }}>
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => window.location.reload()} 
            style={{ padding: '10px 20px', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainApp() {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [dbError, setDbError] = useState(null);

  const [newTransaction, setNewTransaction] = useState({
    description: '',
    amount: '',
    type: 'Income',
    category: 'Sales',
    status: 'Completed',
    date: new Date().toISOString().split('T')[0],
  });

  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    setIsLoading(true);
    setDbError(null);
    try {
      if (!supabase) {
        throw new Error("Supabase client is not initialized correctly. Check your .env file credentials.");
      }

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('id', { ascending: false });

      if (error) {
        console.error('Supabase Fetch Error:', error);
        setDbError(error.message);
      } else if (data) {
        setTransactions(data);
      }
    } catch (err) {
      console.error('Unexpected Error:', err);
      setDbError(err?.message || 'Failed to connect to database');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!newTransaction.description || !newTransaction.amount) {
      alert('Please fill in both Description and Amount.');
      return;
    }

    if (!supabase) {
      alert("Supabase client is not initialized.");
      return;
    }

    const payload = {
      description: newTransaction.description,
      amount: parseFloat(newTransaction.amount),
      type: newTransaction.type,
      category: newTransaction.category,
      status: newTransaction.status || 'Completed',
      date: newTransaction.date || new Date().toISOString().split('T')[0],
    };

    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert([payload])
        .select();

      if (error) {
        alert(`Database Error: ${error.message}`);
        console.error('Insert error:', error);
      } else {
        alert('Transaction successfully added to database!');
        if (data && data.length > 0) {
          setTransactions((prev) => [data[0], ...prev]);
        } else {
          fetchTransactions();
        }

        setIsModalOpen(false);
        setNewTransaction({
          description: '',
          amount: '',
          type: 'Income',
          category: 'Sales',
          status: 'Completed',
          date: new Date().toISOString().split('T')[0],
        });
      }
    } catch (err) {
      alert(`Unexpected Error: ${err?.message}`);
    }
  };

  const metrics = useMemo(() => {
    const list = Array.isArray(transactions) ? transactions : [];

    const totalRevenue = list
      .filter((t) => (t?.type === 'Income') && (t?.status === 'Completed' || !t?.status))
      .reduce((sum, t) => sum + Number(t?.amount || 0), 0);

    const totalExpenses = list
      .filter((t) => (t?.type === 'Expense') && (t?.status === 'Completed' || !t?.status))
      .reduce((sum, t) => sum + Number(t?.amount || 0), 0);

    const completedCount = list.filter((t) => t?.status === 'Completed' || !t?.status).length;

    return {
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      totalTxns: list.length,
      completedCount,
    };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    if (!Array.isArray(transactions)) return [];
    return transactions.filter((t) => {
      const desc = String(t?.description || '').toLowerCase();
      const idStr = String(t?.id || '').toLowerCase();
      const cat = String(t?.category || '').toLowerCase();
      const q = searchQuery.toLowerCase();

      const matchesSearch = desc.includes(q) || idStr.includes(q) || cat.includes(q);
      const matchesType = typeFilter === 'All' || t?.type === typeFilter;
      const matchesStatus = statusFilter === 'All' || (t?.status || 'Completed') === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [transactions, searchQuery, typeFilter, statusFilter]);

  const navItems = [
    { name: 'Dashboard', icon: '📊' },
    { name: 'Transactions', icon: '💳' },
    { name: 'Invoices', icon: '📄' },
    { name: 'Budget', icon: '📈' },
    { name: 'Audit', icon: '🔍' },
    { name: 'Settings', icon: '⚙️' },
  ];

  return (
    <div style={styles.appContainer}>
      {isSidebarOpen && (
        <aside style={styles.sidebar}>
          <div style={styles.userCard}>
            <div style={styles.avatar}>FC</div>
            <div>
              <div style={styles.userName}>financer</div>
              <div style={styles.userRole}>checker</div>
            </div>
          </div>

          <nav style={styles.navMenu}>
            {navItems.map((item) => {
              const isActive = activeTab === item.name;
              return (
                <button
                  key={item.name}
                  onClick={() => setActiveTab(item.name)}
                  style={{
                    ...styles.navButton,
                    backgroundColor: isActive ? '#6366f1' : 'transparent',
                    color: isActive ? '#ffffff' : '#94a3b8',
                  }}
                >
                  <span>{item.icon}</span>
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>
        </aside>
      )}

      <div style={styles.mainWrapper}>
        <header style={styles.topHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              style={styles.menuIconBtn}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              ☰
            </button>
            <h2 style={styles.systemTitle}>SUPER SYSTEM</h2>
          </div>
        </header>

        <main style={styles.mainContent}>
          {dbError && (
            <div style={styles.errorCard}>
              ⚠️ <strong>Database Notice:</strong> {dbError}
            </div>
          )}

          <div style={styles.bannerCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={styles.bannerIconBox}>📊</div>
              <div>
                <h1 style={styles.bannerTitle}>
                  {activeTab === 'Transactions' ? 'Transactions Registry' : 'Financial Analytics Dashboard'}
                </h1>
                <p style={styles.bannerSubtitle}>
                  Overview of Revenue, Expenses & Transaction Health
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={styles.dateBadge}>📅 Today</div>
              <button
                style={styles.actionBtn}
                onClick={() => setIsModalOpen(true)}
              >
                + Add Entry
              </button>
            </div>
          </div>

          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}>
              <div style={styles.kpiHeader}>
                <div style={styles.kpiIconBoxBlue}>📦</div>
                <div>
                  <div style={styles.kpiTitle}>Total Revenue</div>
                  <div style={styles.kpiSub}>Completed Inflow</div>
                </div>
              </div>
              <div style={styles.kpiBigVal}>
                ${metrics.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div style={styles.kpiCard}>
              <div style={styles.kpiHeader}>
                <div style={styles.kpiIconBoxYellow}>⚠️</div>
                <div>
                  <div style={styles.kpiTitle}>Total Expenses</div>
                  <div style={styles.kpiSub}>Operational Outflow</div>
                </div>
              </div>
              <div style={styles.kpiBigVal}>
                ${metrics.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div style={styles.kpiCard}>
              <div style={styles.kpiHeader}>
                <div style={styles.kpiIconBoxPurple}>🏬</div>
                <div>
                  <div style={styles.kpiTitle}>Net Profit</div>
                  <div style={styles.kpiSub}>Net Cash Flow</div>
                </div>
              </div>
              <div style={{ ...styles.kpiBigVal, color: metrics.netProfit >= 0 ? '#10b981' : '#ef4444' }}>
                ${metrics.netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <div style={styles.tableHeaderRow}>
              <div>
                <h3 style={styles.sectionTitle}>Recent Financial Records</h3>
                <p style={styles.sectionSub}>Filter and search transactions</p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={styles.searchInput}
                />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  style={styles.selectInput}
                >
                  <option value="All">All Types</option>
                  <option value="Income">Income</option>
                  <option value="Expense">Expense</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={styles.selectInput}
                >
                  <option value="All">All Statuses</option>
                  <option value="Completed">Completed</option>
                  <option value="Pending">Pending</option>
                  <option value="Failed">Failed</option>
                </select>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.thRow}>
                    <th style={styles.th}>ID</th>
                    <th style={styles.th}>Description</th>
                    <th style={styles.th}>Category</th>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Status</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                        Fetching data from Supabase...
                      </td>
                    </tr>
                  ) : filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                        No records found in database. Click "+ Add Entry" to create one.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((t) => (
                      <tr key={t?.id || Math.random()} style={styles.tr}>
                        <td style={styles.tdId}>{t?.id}</td>
                        <td style={styles.tdDesc}>{t?.description || 'N/A'}</td>
                        <td style={styles.td}>{t?.category || 'General'}</td>
                        <td style={styles.td}>{t?.date || t?.created_at?.split('T')[0] || 'N/A'}</td>
                        <td style={styles.td}>
                          <span style={t?.type === 'Income' ? styles.badgeIncome : styles.badgeExpense}>
                            {t?.type || 'Income'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={{ ...styles.statusBadge, ...styles.statusCompleted }}>
                            {t?.status || 'Completed'}
                          </span>
                        </td>
                        <td
                          style={{
                            ...styles.tdAmount,
                            color: t?.type === 'Income' ? '#10b981' : '#111827',
                          }}
                        >
                          {t?.type === 'Income' ? '+' : '-'}${Number(t?.amount || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {isModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <h3 style={{ marginTop: 0, fontSize: '18px', color: '#0f172a' }}>Record New Transaction</h3>
            <form onSubmit={handleAddTransaction} style={styles.formStack}>
              <input
                type="text"
                placeholder="Description"
                required
                value={newTransaction.description}
                onChange={(e) => setNewTransaction({ ...newTransaction, description: e.target.value })}
                style={styles.modalInput}
              />
              <input
                type="number"
                step="0.01"
                placeholder="Amount"
                required
                value={newTransaction.amount}
                onChange={(e) => setNewTransaction({ ...newTransaction, amount: e.target.value })}
                style={styles.modalInput}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <select
                  value={newTransaction.type}
                  onChange={(e) => setNewTransaction({ ...newTransaction, type: e.target.value })}
                  style={styles.modalInput}
                >
                  <option value="Income">Income</option>
                  <option value="Expense">Expense</option>
                </select>
                <select
                  value={newTransaction.category}
                  onChange={(e) => setNewTransaction({ ...newTransaction, category: e.target.value })}
                  style={styles.modalInput}
                >
                  <option value="Sales">Sales</option>
                  <option value="Operational">Operational</option>
                  <option value="Payroll">Payroll</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" style={styles.actionBtn}>
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

const styles = {
  appContainer: { display: 'flex', minHeight: '100vh', width: '100vw', backgroundColor: '#f1f5f9', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', margin: 0, color: '#1e293b' },
  sidebar: { width: '220px', backgroundColor: '#0f172a', padding: '16px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' },
  userCard: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', padding: '8px' },
  avatar: { width: '38px', height: '38px', borderRadius: '50%', backgroundColor: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '13px' },
  userName: { color: '#ffffff', fontWeight: 'bold', fontSize: '14px' },
  userRole: { color: '#94a3b8', fontSize: '12px' },
  navMenu: { display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 },
  navButton: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: '500' },
  mainWrapper: { flex: 1, display: 'flex', flexDirection: 'column', overflowX: 'hidden' },
  topHeader: { height: '60px', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' },
  menuIconBtn: { background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' },
  systemTitle: { margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#1e293b', letterSpacing: '0.5px' },
  mainContent: { padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' },
  errorCard: { backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px 16px', borderRadius: '12px', fontSize: '14px' },
  bannerCard: { backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  bannerIconBox: { width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#8b5cf6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' },
  bannerTitle: { margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#0f172a' },
  bannerSubtitle: { margin: '2px 0 0', fontSize: '13px', color: '#64748b' },
  dateBadge: { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', color: '#334155', fontWeight: '500' },
  actionBtn: { backgroundColor: '#3b82f6', color: '#ffffff', border: 'none', padding: '9px 16px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' },
  kpiCard: { backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '12px' },
  kpiHeader: { display: 'flex', alignItems: 'center', gap: '12px' },
  kpiIconBoxBlue: { width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' },
  kpiIconBoxYellow: { width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' },
  kpiIconBoxPurple: { width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' },
  kpiTitle: { fontWeight: 'bold', fontSize: '15px', color: '#0f172a' },
  kpiSub: { fontSize: '12px', color: '#94a3b8' },
  kpiBigVal: { fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '4px 0 0' },
  sectionCard: { backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  tableHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' },
  sectionTitle: { margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#0f172a' },
  sectionSub: { margin: '2px 0 0', fontSize: '12px', color: '#64748b' },
  searchInput: { padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', width: '180px' },
  selectInput: { padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', backgroundColor: '#fff' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  thRow: { borderBottom: '2px solid #f1f5f9', textAlign: 'left' },
  th: { padding: '12px 10px', color: '#64748b', fontWeight: '600', fontSize: '12px' },
  tr: { borderBottom: '1px solid #f8fafc' },
  td: { padding: '12px 10px', color: '#334155' },
  tdId: { padding: '12px 10px', fontWeight: 'bold', color: '#2563eb' },
  tdDesc: { padding: '12px 10px', fontWeight: '500', color: '#0f172a' },
  tdAmount: { padding: '12px 10px', fontWeight: 'bold', textAlign: 'right' },
  badgeIncome: { backgroundColor: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600' },
  badgeExpense: { backgroundColor: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600' },
  statusBadge: { padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' },
  statusCompleted: { backgroundColor: '#dcfce7', color: '#15803d' },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalBox: { backgroundColor: '#fff', borderRadius: '12px', padding: '24px', width: '340px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' },
  formStack: { display: 'flex', flexDirection: 'column', gap: '12px' },
  modalInput: { padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', width: '100%', boxSizing: 'border-box' },
  cancelBtn: { border: '1px solid #cbd5e1', backgroundColor: '#fff', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' },
};