import React, { useState, useEffect, useMemo, Component } from 'react';
import { apiRequest } from '../api';
import { useNotifications } from '../notifications/NotificationContext.js';
import './adminDashboard.css';

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

const ethiopianBanks = [
  'Abay Bank',
  'Addis International Bank',
  'Amhara Bank',
  'Awash Bank',
  'Bank of Abyssinia',
  'Berhan Bank',
  'Bunna Bank',
  'Cooperative Bank of Oromia',
  'Dashen Bank',
  'Enat Bank',
  'Goh Betoch Bank',
  'Hibret Bank',
  'Hijra Bank',
  'Lion International Bank',
  'Nib International Bank',
  'Oromia Bank',
  'Rammis Bank',
  'Tsehay Bank',
  'Wegagen Bank',
  'Zemen Bank',
];

const getPaymentMethodLabel = (order) => {
  if (order.payment_method === 'other_bank') {
    return order.payment_account_display_name || order.payment_submissions?.[0]?.payment_account_display_name || 'Other bank';
  }
  const methodName = order.payment_method === 'telebirr' ? 'Telebirr' : order.payment_method === 'cbe' ? 'CBE' : order.payment_method;
  return order.payment_account_display_name && order.payment_account_display_name !== methodName
    ? `${methodName} · ${order.payment_account_display_name}`
    : methodName;
};

const getPaymentStatusLabel = (order) => {
  if (order.payment_status === 'paid') return 'Paid';
  if (order.payment_status === 'failed') return 'Payment failed';
  if ((order.payment_submissions || []).some((submission) => submission.status === 'pending')) {
    return 'Submitted · awaiting review';
  }
  return 'Awaiting customer payment';
};

function MainApp({ user, onLogout }) {
  const { notify, confirm } = useNotifications();
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [passwordResetUser, setPasswordResetUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [createdStaffCredentials, setCreatedStaffCredentials] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
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
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [newPaymentAccount, setNewPaymentAccount] = useState({ provider: 'telebirr', bank_name: '', custom_bank_name: '', account_name: '', account_number: '', instructions: '' });
  const [newUser, setNewUser] = useState({ email: '', password: '', department: '' });
  const [newProduct, setNewProduct] = useState({ name: '', sku: '', category: 'General', description: '', quantity: '1', unit_price: '' });

  useEffect(() => {
    let isCurrent = true;
    apiRequest('/transactions')
      .then((data) => {
        if (isCurrent) setTransactions(data);
      })
      .catch((error) => {
        if (!isCurrent) return;
        console.error('Unexpected Error:', error);
        setDbError(error?.message || 'Failed to connect to database');
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    Promise.all([apiRequest('/users'), apiRequest('/products'), apiRequest('/admin/orders'), apiRequest('/admin/payment-accounts')])
      .then(([userList, productList, orderList, accountList]) => {
        if (!isCurrent) return;
        setUsers(userList);
        setProducts(productList);
        setOrders(orderList);
        setPaymentAccounts(accountList);
      })
      .catch((error) => {
        if (isCurrent) setDbError(error.message);
      });
    return () => { isCurrent = false; };
  }, []);

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!newTransaction.description || !newTransaction.amount) {
      notify('Please fill in both the description and amount.', 'warning', 'Required information');
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
      if (editingTransaction) {
        const data = await apiRequest(`/transactions/${editingTransaction.id}`, {
          method: 'PUT',
          body: payload,
        });

        setTransactions((prev) => prev.map((transaction) => (
          transaction.id === editingTransaction.id ? data : transaction
        )));
        setEditingTransaction(null);
        setIsModalOpen(false);
        notify('Transaction changes have been saved.', 'success');
        return;
      }

      const data = await apiRequest('/transactions', { method: 'POST', body: payload });
      notify('Transaction successfully added.', 'success');
      setTransactions((prev) => [data, ...prev]);
      setIsModalOpen(false);
      setNewTransaction({
        description: '',
        amount: '',
        type: 'Income',
        category: 'Sales',
        status: 'Completed',
        date: new Date().toISOString().split('T')[0],
      });
      
    } catch (err) {
      notify(err?.message || 'The transaction could not be saved.', 'error', 'Save failed');
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      const user = await apiRequest('/users', { method: 'POST', body: newUser });
      setUsers((previous) => [user, ...previous]);
      setCreatedStaffCredentials({
        email: newUser.email.trim().toLowerCase(),
        password: newUser.password,
        department: newUser.department,
      });
      setNewUser({ email: '', password: '', department: '' });
      setIsUserModalOpen(false);
      setShowNewUserPassword(false);
    } catch (error) {
      notify(error.message, 'error', 'Could not create user');
    }
  };

  const handleUpdateUserStatus = async (account, status) => {
    try {
      const updatedUser = await apiRequest(`/users/${account.id}/status`, { method: 'PATCH', body: status });
      setUsers((previous) => previous.map((current) => current.id === updatedUser.id ? updatedUser : current));
      notify(`Account status updated for ${updatedUser.email}.`, 'success');
    } catch (error) {
      notify(error.message, 'error', 'Could not update account');
    }
  };

  const handleUpdateOrder = async (order, changes) => {
    try {
      const updatedOrder = await apiRequest(`/admin/orders/${order.id}`, { method: 'PATCH', body: changes });
      setOrders((previous) => previous.map((current) => {
        if (current.id !== updatedOrder.id) return current;
        const updated = { ...current, ...updatedOrder };
        if (changes.payment_status) {
          updated.payment_submissions = (current.payment_submissions || []).map((submission) => (
            submission.status === 'pending'
              ? { ...submission, status: changes.payment_status }
              : submission
          ));
        }
        return updated;
      }));
      notify('Order updated successfully.', 'success');
    } catch (error) {
      notify(error.message, 'error', 'Could not update order');
    }
  };

  const handleAddPaymentAccount = async (event) => {
    event.preventDefault();
    try {
      const displayName = newPaymentAccount.provider === 'telebirr'
        ? 'Telebirr'
        : newPaymentAccount.provider === 'cbe'
          ? 'CBE'
          : newPaymentAccount.bank_name === 'Other Ethiopian bank'
            ? newPaymentAccount.custom_bank_name.trim()
            : newPaymentAccount.bank_name;
      const account = await apiRequest('/admin/payment-accounts', {
        method: 'POST',
        body: {
          provider: newPaymentAccount.provider,
          display_name: displayName,
          account_name: newPaymentAccount.account_name,
          account_number: newPaymentAccount.account_number,
          instructions: newPaymentAccount.instructions,
        },
      });
      setPaymentAccounts((previous) => [account, ...previous]);
      setNewPaymentAccount({ provider: 'telebirr', bank_name: '', custom_bank_name: '', account_name: '', account_number: '', instructions: '' });
      notify('Company payment account added.', 'success');
    } catch (error) {
      notify(error.message, 'error', 'Could not add payment account');
    }
  };

  const handleTogglePaymentAccount = async (account) => {
    try {
      const updatedAccount = await apiRequest(`/admin/payment-accounts/${account.id}`, {
        method: 'PATCH',
        body: { ...account, is_active: !account.is_active },
      });
      setPaymentAccounts((previous) => previous.map((current) => current.id === updatedAccount.id ? updatedAccount : current));
      notify(`Payment account ${updatedAccount.is_active ? 'published' : 'hidden'}.`, 'success');
    } catch (error) {
      notify(error.message, 'error', 'Could not update payment account');
    }
  };

  const handleResetUserPassword = async (event) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      notify('The passwords do not match. Check both fields and try again.', 'warning', 'Passwords do not match');
      return;
    }
    try {
      await apiRequest(`/users/${passwordResetUser.id}/password`, {
        method: 'PATCH',
        body: { password: newPassword },
      });
      setPasswordResetUser(null);
      setNewPassword('');
      setConfirmPassword('');
      setShowResetPassword(false);
      setShowConfirmPassword(false);
      notify(`Password updated for ${passwordResetUser.email}.`, 'success');
    } catch (error) {
      notify(error.message, 'error', 'Could not update password');
    }
  };

  const handleRemoveUser = async (account) => {
    const accepted = await confirm({
      title: 'Remove user account?',
      message: `Permanently remove ${account.email}? This action cannot be undone.`,
      confirmLabel: 'Remove account',
    });
    if (!accepted) return;
    try {
      await apiRequest(`/users/${account.id}`, { method: 'DELETE' });
      setUsers((previous) => previous.filter((current) => current.id !== account.id));
      notify(`Account ${account.email} removed.`, 'success');
    } catch (error) {
      notify(error.message, 'error', 'Could not remove account');
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    try {
      const product = await apiRequest('/products', {
        method: 'POST',
        body: { ...newProduct, quantity: Number(newProduct.quantity), unit_price: Number(newProduct.unit_price) },
      });
      setProducts((previous) => [product, ...previous]);
      setNewProduct({ name: '', sku: '', category: 'General', description: '', quantity: '1', unit_price: '' });
      setIsProductModalOpen(false);
      notify(`${product.name} added to the product catalog.`, 'success');
    } catch (error) {
      notify(error.message, 'error', 'Could not add product');
    }
  };

  const handleRemoveProduct = async (product) => {
    const accepted = await confirm({
      title: 'Remove product from catalog?',
      message: `Remove ${product.name}? Customers will no longer be able to order it. Existing orders will keep their recorded product details.`,
      confirmLabel: 'Remove product',
    });
    if (!accepted) return;

    try {
      await apiRequest(`/products/${product.id}`, { method: 'DELETE' });
      setProducts((previous) => previous.filter((current) => current.id !== product.id));
      notify(`${product.name} removed from the product catalog.`, 'success');
    } catch (error) {
      notify(error.message, 'error', 'Could not remove product');
    }
  };

  const handleEditTransaction = (transaction) => {
    setEditingTransaction(transaction);
    setNewTransaction({
      description: transaction.description || '',
      amount: transaction.amount || '',
      type: transaction.type || 'Income',
      category: transaction.category || 'Sales',
      status: transaction.status || 'Completed',
      date: transaction.date || new Date().toISOString().split('T')[0],
    });
    setIsModalOpen(true);
  };

  const handleDeactivateTransaction = async (transaction) => {
    const accepted = await confirm({
      title: 'Deactivate transaction?',
      message: `Deactivate transaction ${transaction.id}?`,
      confirmLabel: 'Deactivate',
    });
    if (!accepted) return;

    try {
      const data = await apiRequest(`/transactions/${transaction.id}`, {
        method: 'PATCH',
        body: { status: 'Inactive' },
      });
      setTransactions((prev) => prev.map((current) => (
        current.id === transaction.id ? data : current
      )));
      notify(`Transaction ${transaction.id} deactivated.`, 'success');
    } catch (error) {
      notify(error.message, 'error', 'Database error');
      return;
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
    { name: 'Orders', icon: '🛒' },
    { name: 'Payment Accounts', icon: '🏦' },
    { name: 'Users', icon: '👥' },
    { name: 'Products', icon: '📦' },
  ];

  return (
    <div className="adminDashboard" style={styles.appContainer}>
      {isSidebarOpen && (
        <aside style={styles.sidebar}>
          <div style={styles.userCard}>
            <div style={styles.avatar}>AD</div>
            <div>
              <div style={styles.userName}>{user?.email || 'Administrator'}</div>
              <div style={styles.userRole}>full access</div>
            </div>
          </div>

          <nav style={styles.navMenu}>
            {navItems.map((item) => {
              const isActive = activeTab === item.name;
              return (
                <button
                  type="button"
                  key={item.name}
                  onClick={() => item.action ? item.action() : setActiveTab(item.name)}
                  className={`admin-nav-button${isActive ? ' is-active' : ''}${item.action ? ' is-action' : ''}`}
                  style={{
                    ...styles.navButton,
                    backgroundColor: isActive ? '#176b87' : item.action ? '#1e293b' : 'transparent',
                    color: isActive ? '#ffffff' : item.action ? '#d6f5ff' : '#c1cddd',
                  }}
                >
                  <span className="admin-nav-icon">{item.icon}</span>
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>
          <div style={styles.sidebarFooter}>
            <button type="button" onClick={onLogout} style={styles.sidebarLogout}>
              <span aria-hidden="true">🚪</span> Log Out
            </button>
          </div>
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
                  {activeTab === 'Transactions'
                    ? 'Transactions Registry'
                    : activeTab === 'Orders'
                      ? 'Customer Orders'
                      : activeTab === 'Payment Accounts'
                        ? 'Company Payment Accounts'
                    : activeTab === 'Dashboard'
                      ? 'Financial Analytics Dashboard'
                    : activeTab === 'Users'
                      ? 'User Management'
                      : activeTab === 'Products'
                        ? 'Product Inventory'
                        : 'Admin Dashboard'}
                </h1>
                <p style={styles.bannerSubtitle}>
                  {activeTab === 'Users'
                    ? 'Create and control user accounts'
                    : activeTab === 'Products'
                      ? 'Manage products, stock quantities, and prices'
                      : activeTab === 'Transactions'
                        ? 'Search, review, and manage all financial records'
                          : activeTab === 'Orders'
                            ? 'Process customer orders and verify payment status'
                            : activeTab === 'Payment Accounts'
                              ? 'Publish verified bank and mobile money details to customers'
                        : 'Overview of revenue, expenses, and recent activity'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {['Dashboard', 'Transactions'].includes(activeTab) && <div style={styles.dateBadge}>📅 Today</div>}
              {['Dashboard', 'Transactions', 'Users', 'Products'].includes(activeTab) && <button
                type="button"
                style={styles.actionBtn}
                className="admin-primary-button"
                onClick={() => {
                  if (activeTab === 'Users') setIsUserModalOpen(true);
                  else if (activeTab === 'Products') setIsProductModalOpen(true);
                  else setIsModalOpen(true);
                }}
              >
                {activeTab === 'Users' ? '👤 Add User' : activeTab === 'Products' ? '📦 Add Product' : '➕ Add Entry'}
              </button>}
            </div>
          </div>

          {activeTab === 'Dashboard' && (
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
          )}

          {['Dashboard', 'Transactions'].includes(activeTab) && (
          <div style={styles.sectionCard}>
            <div style={styles.tableHeaderRow}>
              <div>
                <h3 style={styles.sectionTitle}>{activeTab === 'Dashboard' ? 'Recent Transactions' : 'Transactions'}</h3>
                <p style={styles.sectionSub}>{activeTab === 'Dashboard' ? `Showing the latest ${Math.min(transactions.length, 5)} records` : 'Filter and search financial records'}</p>
              </div>

              {activeTab === 'Transactions' && <div style={{ display: 'flex', gap: '10px' }}>
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
                  <option value="Inactive">Inactive</option>
                </select>
              </div>}
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
                    <th style={{ ...styles.th, textAlign: 'right' }}>Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                        Loading local PostgreSQL records...
                      </td>
                    </tr>
                  ) : (activeTab === 'Dashboard' ? transactions.slice(0, 5) : filteredTransactions).length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                        No records found in database. Click "+ Add Entry" to create one.
                      </td>
                    </tr>
                  ) : (
                    (activeTab === 'Dashboard' ? transactions.slice(0, 5) : filteredTransactions).map((t) => (
                      <tr key={t?.id} style={styles.tr}>
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
                        <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button type="button" onClick={() => handleEditTransaction(t)} style={styles.tableActionBtn}>
                            Edit
                          </button>
                          {t?.status !== 'Inactive' && (
                            <button type="button" onClick={() => handleDeactivateTransaction(t)} style={styles.deactivateBtn}>
                              Deactivate
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {activeTab === 'Users' && (
            <div style={styles.sectionCard}>
              <div style={styles.tableHeaderRow}>
                <div>
                  <h3 style={styles.sectionTitle}>User Accounts</h3>
                  <p style={styles.sectionSub}>{users.length} account{users.length === 1 ? '' : 's'}</p>
                </div>
                <button
                  type="button"
                  style={styles.actionBtn}
                  className="admin-primary-button"
                  onClick={() => setIsUserModalOpen(true)}
                >
                  👤 Add User
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.thRow}>
                      <th style={styles.th}>Email</th>
                      <th style={styles.th}>Department</th>
                      <th style={styles.th}>Role</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Created</th>
                      <th style={styles.th}>Account controls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr><td colSpan="6" style={styles.emptyCell}>No user accounts found.</td></tr>
                    ) : users.map((user) => (
                      <tr key={user.id} style={styles.tr}>
                        <td style={styles.tdDesc}>{user.email}</td>
                        <td style={styles.td}>{user.department || '—'}</td>
                        <td style={styles.td}>{user.role}</td>
                        <td style={styles.td}>
                          {user.is_blocked ? 'Blocked' : user.is_active ? 'Active' : 'Deactivated'}
                        </td>
                        <td style={styles.td}>{new Date(user.created_at).toLocaleDateString()}</td>
                        <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                          {['user', 'customer'].includes(user.role) && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setPasswordResetUser(user);
                                  setNewPassword('');
                                  setConfirmPassword('');
                                }}
                                style={styles.tableActionBtn}
                              >
                                🔑 Set password
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateUserStatus(user, { is_active: !user.is_active })}
                                style={styles.tableActionBtn}
                              >
                                {user.is_active ? '⏸️ Deactivate' : '✅ Activate'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateUserStatus(user, { is_blocked: !user.is_blocked })}
                                style={styles.tableActionBtn}
                              >
                                {user.is_blocked ? '🔓 Unblock' : '🚫 Block'}
                              </button>
                              <button type="button" onClick={() => handleRemoveUser(user)} style={styles.deactivateBtn}>
                                🗑️ Remove
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'Products' && (
            <div style={styles.sectionCard}>
              <div style={styles.tableHeaderRow}>
                <div>
                  <h3 style={styles.sectionTitle}>Products</h3>
                  <p style={styles.sectionSub}>{products.length} product{products.length === 1 ? '' : 's'}</p>
                </div>
                <button
                  type="button"
                  style={styles.actionBtn}
                  className="admin-primary-button"
                  onClick={() => setIsProductModalOpen(true)}
                >
                  📦 Add Product
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.thRow}>
                      <th style={styles.th}>Product</th>
                      <th style={styles.th}>Description</th>
                      <th style={styles.th}>SKU</th>
                      <th style={styles.th}>Category</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Quantity</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Unit Price (ETB)</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.length === 0 ? (
                      <tr><td colSpan="7" style={styles.emptyCell}>No products found.</td></tr>
                    ) : products.map((product) => (
                      <tr key={product.id} style={styles.tr}>
                        <td style={styles.tdDesc}>{product.name}</td>
                        <td style={styles.tdDesc}>{product.description || '—'}</td>
                        <td style={styles.td}>{product.sku || '—'}</td>
                        <td style={styles.td}>{product.category}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{product.quantity}</td>
                        <td style={{ ...styles.tdAmount, color: '#334155' }}>ETB {Number(product.unit_price).toFixed(2)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button type="button" onClick={() => handleRemoveProduct(product)} style={styles.deactivateBtn}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'Orders' && (
            <div style={styles.sectionCard}>
              <div style={styles.tableHeaderRow}>
                <div>
                  <h3 style={styles.sectionTitle}>Customer orders</h3>
                  <p style={styles.sectionSub}>{orders.length} order{orders.length === 1 ? '' : 's'} · update fulfillment and verify payments</p>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead><tr style={styles.thRow}>
                    <th style={styles.th}>Order</th><th style={styles.th}>Customer</th><th style={styles.th}>Delivery</th><th style={styles.th}>Method / reference</th><th style={styles.th}>Order status</th><th style={styles.th}>Payment</th><th style={{ ...styles.th, textAlign: 'right' }}>Total</th>
                  </tr></thead>
                  <tbody>
                    {orders.length === 0 ? <tr><td colSpan="7" style={styles.emptyCell}>No customer orders have been placed yet.</td></tr> : orders.map((order) => (
                      <tr key={order.id} style={styles.tr}>
                        <td style={styles.tdId}>{order.id.slice(0, 8).toUpperCase()}<br /><small>{new Date(order.created_at).toLocaleDateString()}</small></td>
                        <td style={styles.tdDesc}>{order.customer_name || order.customer_email}<br /><small>{order.customer_email} · {order.customer_phone}</small></td>
                        <td style={styles.tdDesc}>{order.delivery_address}{order.latitude != null && order.longitude != null && <><br /><a href={`https://www.google.com/maps?q=${order.latitude},${order.longitude}`} target="_blank" rel="noreferrer">Open GPS pin</a></>}</td>
                        <td style={styles.td}>
                          <strong>{getPaymentMethodLabel(order)}</strong>
                          {order.payment_account_number && <><br /><small>Selected account: {order.payment_account_name} · {order.payment_account_number}</small></>}
                          <br /><small>{order.payment_reference || 'No transfer submitted yet'}</small>
                          {(order.payment_submissions || []).map((submission) => (
                            <div key={submission.id} className="admin-order-payment-submission">
                              <small>{submission.status === 'pending' ? 'Awaiting review' : submission.status} · ETB {Number(submission.amount).toFixed(2)} · {new Date(submission.submitted_at).toLocaleString()}</small>
                              {submission.payment_account_number && <small>Paid to {submission.payment_account_name} · {submission.payment_account_number}</small>}
                              {submission.remarks && <p className="admin-payment-remarks"><strong>Customer remarks:</strong> {submission.remarks}</p>}
                              {submission.receipt_file_name && <a className="admin-payment-receipt-link" href={`/api/admin/payment-submissions/${submission.id}/receipt`} target="_blank" rel="noreferrer">View uploaded proof · {submission.receipt_file_name}</a>}
                            </div>
                          ))}
                        </td>
                        <td style={styles.td}>
                          <select aria-label={`Order status ${order.id}`} value={order.status} onChange={(event) => handleUpdateOrder(order, { status: event.target.value })} style={styles.selectInput}>{['placed', 'accepted', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'].filter((status) => order.payment_status === 'paid' || !['out_for_delivery', 'delivered'].includes(status)).map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select>
                          {order.payment_status !== 'paid' && <small>Verify payment before dispatch</small>}
                          <details className="admin-order-status-details">
                            <summary>Order status &amp; payment review</summary>
                            <div className="admin-order-status-panel">
                              {(order.payment_submissions || []).length ? order.payment_submissions.map((submission) => (
                                <section className="admin-order-status-submission" key={submission.id}>
                                  <strong>Transfer {submission.transaction_reference}</strong>
                                  <span>ETB {Number(submission.amount).toFixed(2)} · {submission.status} · {new Date(submission.submitted_at).toLocaleString()}</span>
                                  <span>{submission.payment_account_name} · {submission.payment_account_number}</span>
                                  {submission.remarks && <p className="admin-payment-remarks"><strong>Customer remarks:</strong> {submission.remarks}</p>}
                                  {submission.receipt_file_name && <a className="admin-payment-receipt-link" href={`/api/admin/payment-submissions/${submission.id}/receipt`} target="_blank" rel="noreferrer">View uploaded proof · {submission.receipt_file_name}</a>}
                                </section>
                              )) : <p>No payment transaction has been submitted yet.</p>}
                              {(order.payment_submissions || []).some((submission) => submission.status === 'pending') && (
                                <div className="admin-payment-actions">
                                  <button type="button" className="admin-payment-approve" onClick={() => handleUpdateOrder(order, { payment_status: 'paid' })}>Verify &amp; mark paid</button>
                                  <button type="button" className="admin-payment-reject" onClick={() => handleUpdateOrder(order, { payment_status: 'failed' })}>Reject · request resubmission</button>
                                </div>
                              )}
                            </div>
                          </details>
                        </td>
                        <td style={styles.td}>
                          <span className={`admin-payment-status is-${order.payment_status}`}>{getPaymentStatusLabel(order)}</span>
                        </td>
                        <td style={styles.tdAmount}>ETB {Number(order.total_amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'Payment Accounts' && (
            <div style={{ display: 'grid', gap: '18px' }}>
              <section style={styles.sectionCard}>
                <div style={styles.tableHeaderRow}><div><h3 style={styles.sectionTitle}>Add a company account</h3><p style={styles.sectionSub}>Add each account separately. You can publish multiple Telebirr numbers, CBE accounts, and accounts at different Ethiopian banks; customers will choose the exact account for each order. Publish only verified company-owned details.</p></div></div>
                <form className="admin-payment-form" onSubmit={handleAddPaymentAccount} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <label className="admin-payment-field" style={styles.paymentField}>
                    <span>Payment method</span>
                    <select
                      aria-label="Payment method"
                      value={newPaymentAccount.provider}
                      onChange={(event) => setNewPaymentAccount({
                        provider: event.target.value,
                        bank_name: '',
                        custom_bank_name: '',
                        account_name: '',
                        account_number: '',
                        instructions: '',
                      })}
                      style={styles.modalInput}
                    >
                      <option value="telebirr">Telebirr</option>
                      <option value="cbe">CBE</option>
                      <option value="other_bank">Other Ethiopian bank</option>
                    </select>
                  </label>

                  {newPaymentAccount.provider === 'other_bank' && (
                    <label className="admin-payment-field" style={styles.paymentField}>
                      <span>Select bank</span>
                      <select
                        aria-label="Select bank"
                        value={newPaymentAccount.bank_name}
                        onChange={(event) => setNewPaymentAccount({ ...newPaymentAccount, bank_name: event.target.value })}
                        required
                        style={styles.modalInput}
                      >
                        <option value="">Choose a bank</option>
                        {ethiopianBanks.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
                        <option value="Other Ethiopian bank">Other Ethiopian bank</option>
                      </select>
                    </label>
                  )}

                  <p className="admin-payment-hint" style={{ ...styles.paymentMethodHint, gridColumn: '1 / -1' }}>
                    {newPaymentAccount.provider === 'telebirr'
                      ? 'Enter the verified Telebirr account holder name and the mobile number registered to the company account.'
                      : newPaymentAccount.provider === 'cbe'
                        ? 'Enter the company CBE account holder name and account number. The customer’s exact order total is shown as the payment amount when they submit a transfer.'
                        : 'Choose the bank, then enter the company account holder name and bank account number.'}
                  </p>

                  {newPaymentAccount.provider === 'other_bank'
                    && newPaymentAccount.bank_name === 'Other Ethiopian bank'
                    && (
                      <label className="admin-payment-field" style={styles.paymentField}>
                        <span>Bank name</span>
                        <input
                          aria-label="Bank name"
                          placeholder="Enter the Ethiopian bank name"
                          required
                          maxLength="100"
                          value={newPaymentAccount.custom_bank_name}
                          onChange={(event) => setNewPaymentAccount({ ...newPaymentAccount, custom_bank_name: event.target.value })}
                          style={styles.modalInput}
                        />
                      </label>
                    )}

                  <label className="admin-payment-field" style={styles.paymentField}>
                    <span>{newPaymentAccount.provider === 'telebirr' ? 'Telebirr account holder name' : 'Account holder name'}</span>
                    <input
                      aria-label="Account holder name"
                      placeholder="Name registered on the company account"
                      required
                      maxLength="120"
                      value={newPaymentAccount.account_name}
                      onChange={(event) => setNewPaymentAccount({ ...newPaymentAccount, account_name: event.target.value })}
                      style={styles.modalInput}
                    />
                  </label>

                  <label className="admin-payment-field" style={styles.paymentField}>
                    <span>{newPaymentAccount.provider === 'telebirr' ? 'Telebirr phone number' : 'Account number'}</span>
                    <input
                      aria-label={newPaymentAccount.provider === 'telebirr' ? 'Telebirr phone number' : 'Account number'}
                      type={newPaymentAccount.provider === 'telebirr' ? 'tel' : 'text'}
                      inputMode={newPaymentAccount.provider === 'telebirr' ? 'tel' : 'text'}
                      placeholder={newPaymentAccount.provider === 'telebirr' ? 'e.g. 09XXXXXXXX' : 'Company bank account number'}
                      autoComplete="off"
                      required
                      maxLength="100"
                      value={newPaymentAccount.account_number}
                      onChange={(event) => setNewPaymentAccount({ ...newPaymentAccount, account_number: event.target.value })}
                      style={styles.modalInput}
                    />
                  </label>

                  {newPaymentAccount.provider !== 'telebirr' && (
                    <label className="admin-payment-field" style={{ ...styles.paymentField, gridColumn: '1 / -1' }}>
                      <span>Payment instructions (optional)</span>
                      <input
                        aria-label="Payment instructions"
                        placeholder="Add transfer guidance for customers"
                        maxLength="500"
                        value={newPaymentAccount.instructions}
                        onChange={(event) => setNewPaymentAccount({ ...newPaymentAccount, instructions: event.target.value })}
                        style={styles.modalInput}
                      />
                    </label>
                  )}

                  {newPaymentAccount.provider === 'cbe' && (
                    <div className="admin-payment-amount-note" role="note" style={{ ...styles.paymentAmountNote, gridColumn: '1 / -1' }}>
                      <strong>Payment amount:</strong> calculated from the customer’s order and displayed in ETB during payment submission. It is not a fixed company-account value.
                    </div>
                  )}

                  <button type="submit" style={{ ...styles.actionBtn, gridColumn: '1 / -1' }} className="admin-primary-button">
                    Publish {newPaymentAccount.provider === 'telebirr' ? 'Telebirr' : newPaymentAccount.provider === 'cbe' ? 'CBE' : newPaymentAccount.bank_name || 'bank'} account
                  </button>
                </form>
              </section>
              <section style={styles.sectionCard}>
                <div style={styles.tableHeaderRow}><div><h3 style={styles.sectionTitle}>Published accounts</h3><p style={styles.sectionSub}>{paymentAccounts.filter((account) => account.is_active).length} active · {paymentAccounts.length} total</p></div></div>
                <div style={{ overflowX: 'auto' }}><table style={styles.table}>
                  <thead><tr style={styles.thRow}><th style={styles.th}>Payment method</th><th style={styles.th}>Account name</th><th style={styles.th}>Phone / account number</th><th style={styles.th}>Instructions</th><th style={styles.th}>Customer visibility</th><th style={styles.th}>Action</th></tr></thead>
                  <tbody>{paymentAccounts.length === 0 ? <tr><td colSpan="6" style={styles.emptyCell}>No company accounts configured. Online orders cannot be placed until a verified payment account is published.</td></tr> : paymentAccounts.map((account) => <tr key={account.id} style={styles.tr}><td style={styles.tdDesc}>{account.provider === 'other_bank' ? account.display_name : account.provider === 'cbe' ? 'CBE' : 'Telebirr'}</td><td style={styles.td}>{account.account_name}</td><td style={styles.tdId}>{account.account_number}</td><td style={styles.tdDesc}>{account.instructions || '—'}</td><td style={styles.td}>{account.is_active ? 'Visible' : 'Hidden'}</td><td style={styles.td}><button type="button" onClick={() => handleTogglePaymentAccount(account)} style={styles.tableActionBtn}>{account.is_active ? 'Hide' : 'Publish'}</button></td></tr>)}</tbody>
                </table></div>
              </section>
            </div>
          )}
        </main>
      </div>

      {isModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <h3 style={{ marginTop: 0, fontSize: '18px', color: '#0f172a' }}>
              {editingTransaction ? 'Edit Transaction' : 'Record New Transaction'}
            </h3>
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
                <select
                  value={newTransaction.status}
                  onChange={(e) => setNewTransaction({ ...newTransaction, status: e.target.value })}
                  style={styles.modalInput}
                >
                  <option value="Completed">Completed</option>
                  <option value="Pending">Pending</option>
                  <option value="Failed">Failed</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingTransaction(null);
                  }}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
                <button type="submit" style={styles.actionBtn}>
                  {editingTransaction ? 'Save Changes' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isUserModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalBox, width: 'min(420px, calc(100vw - 32px))' }} role="dialog" aria-modal="true" aria-labelledby="add-user-title">
            <h3 id="add-user-title" style={{ marginTop: 0, fontSize: '22px', color: '#0f172a' }}>Create staff account</h3>
            <form onSubmit={handleAddUser} style={styles.formStack}>
              <p style={{ margin: '-4px 0 8px', color: '#526b78', fontSize: '13px', lineHeight: 1.5 }}>
                Create a staff login and assign it to a department. Staff cannot create their own accounts.
              </p>
              <input
                type="email"
                placeholder="Email address"
                autoComplete="off"
                required
                value={newUser.email}
                onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
                style={styles.modalInput}
              />
              <div style={styles.passwordField}>
                <input
                  type={showNewUserPassword ? 'text' : 'password'}
                  placeholder="Temporary password (at least 6 characters)"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  value={newUser.password}
                  onChange={(event) => setNewUser({ ...newUser, password: event.target.value })}
                  style={styles.passwordInput}
                />
                <button type="button" onClick={() => setShowNewUserPassword((visible) => !visible)} style={styles.passwordToggle} aria-label={showNewUserPassword ? 'Hide password' : 'Show password'}>
                  {showNewUserPassword ? '🙈' : '👁️'}
                </button>
              </div>
              <select
                aria-label="Staff department"
                value={newUser.department}
                onChange={(event) => setNewUser({ ...newUser, department: event.target.value })}
                required
                style={styles.modalInput}
              >
                <option value="">Select department</option>
                {['IT', 'Sales', 'Finance', 'Mainstore', 'Attendance', 'Auditor', 'Logistics'].map((department) => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>
              <div style={styles.modalActions}>
                <button type="button" onClick={() => setIsUserModalOpen(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.actionBtn} className="admin-primary-button">✅ Create User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isProductModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalBox, width: 'min(420px, calc(100vw - 32px))' }} role="dialog" aria-modal="true" aria-labelledby="add-product-title">
            <h3 id="add-product-title" style={{ marginTop: 0, fontSize: '18px', color: '#0f172a' }}>Add Product</h3>
            <form onSubmit={handleAddProduct} style={styles.formStack}>
              <input
                type="text"
                placeholder="Product name"
                required
                value={newProduct.name}
                onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })}
                style={styles.modalInput}
              />
              <input
                type="text"
                placeholder="SKU (optional)"
                value={newProduct.sku}
                onChange={(event) => setNewProduct({ ...newProduct, sku: event.target.value })}
                style={styles.modalInput}
              />
              <input
                type="text"
                placeholder="Category"
                value={newProduct.category}
                onChange={(event) => setNewProduct({ ...newProduct, category: event.target.value })}
                style={styles.modalInput}
              />
              <textarea
                placeholder="Product description (materials, size, key details)"
                maxLength="1000"
                rows="3"
                value={newProduct.description}
                onChange={(event) => setNewProduct({ ...newProduct, description: event.target.value })}
                style={styles.modalInput}
              />
              <input
                type="number"
                placeholder="Quantity"
                min="0"
                step="1"
                required
                value={newProduct.quantity}
                onChange={(event) => setNewProduct({ ...newProduct, quantity: event.target.value })}
                style={styles.modalInput}
              />
              <input
                type="number"
                placeholder="Unit price (ETB)"
                min="0"
                step="0.01"
                required
                value={newProduct.unit_price}
                onChange={(event) => setNewProduct({ ...newProduct, unit_price: event.target.value })}
                style={styles.modalInput}
              />
              <div style={styles.modalActions}>
                <button type="button" onClick={() => setIsProductModalOpen(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.actionBtn} className="admin-primary-button">📦 Create Product</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createdStaffCredentials && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalBox, width: 'min(480px, calc(100vw - 32px))' }} role="dialog" aria-modal="true" aria-labelledby="staff-credentials-title">
            <h3 id="staff-credentials-title" style={{ marginTop: 0, fontSize: '22px', color: '#0f172a' }}>Staff account created</h3>
            <p style={{ color: '#526b78', lineHeight: 1.5 }}>
              Share these sign-in details with the staff member. They can sign in at <strong>/login</strong>.
            </p>
            <dl style={styles.credentialList}>
              <dt>Department</dt><dd>{createdStaffCredentials.department}</dd>
              <dt>Username / email</dt><dd>{createdStaffCredentials.email}</dd>
              <dt>Temporary password</dt><dd>{createdStaffCredentials.password}</dd>
            </dl>
            <p style={{ color: '#526b78', fontSize: '14px', lineHeight: 1.5 }}>
              This password is shown only now. It is stored securely as a hash and cannot be retrieved later.
            </p>
            <div style={styles.modalActions}>
              <button type="button" onClick={() => setCreatedStaffCredentials(null)} style={styles.actionBtn} className="admin-primary-button">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordResetUser && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalBox, width: 'min(420px, calc(100vw - 32px))' }} role="dialog" aria-modal="true" aria-labelledby="reset-password-title">
            <h3 id="reset-password-title" style={{ marginTop: 0, fontSize: '18px', color: '#0f172a' }}>Set a new password</h3>
            <p className="admin-password-note">For security, saved passwords cannot be viewed. This account’s current password stays unchanged unless you submit a new one.</p>
            <form onSubmit={handleResetUserPassword} style={styles.formStack}>
              <div style={styles.passwordField}>
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  placeholder="New password (at least 6 characters)"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  style={styles.passwordInput}
                />
                <button type="button" onClick={() => setShowResetPassword((visible) => !visible)} style={styles.passwordToggle} aria-label={showResetPassword ? 'Hide password' : 'Show password'}>
                  {showResetPassword ? '🙈' : '👁️'}
                </button>
              </div>
              <div style={styles.passwordField}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  style={styles.passwordInput}
                />
                <button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} style={styles.passwordToggle} aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>
                  {showConfirmPassword ? '🙈' : '👁️'}
                </button>
              </div>
              <div style={styles.modalActions}>
                <button type="button" onClick={() => setPasswordResetUser(null)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.actionBtn} className="admin-primary-button">Update password</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App({ user, onLogout }) {
  return (
    <ErrorBoundary>
      <MainApp user={user} onLogout={onLogout} />
    </ErrorBoundary>
  );
}

const styles = {
  passwordField: { position: 'relative', display: 'flex', alignItems: 'center', width: '100%' },
  passwordInput: { width: '100%', boxSizing: 'border-box', padding: '10px 48px 10px 13px', border: '1px solid #c7d7df', borderRadius: '8px', fontSize: '14px', minHeight: '42px' },
  passwordToggle: { position: 'absolute', right: '10px', border: 0, background: 'transparent', padding: '6px', cursor: 'pointer', fontSize: '16px' },
  credentialList: { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '10px 16px', padding: '16px', background: '#f1f7fa', border: '1px solid #d7e5eb', borderRadius: '8px', overflowWrap: 'anywhere' },
  appContainer: { display: 'flex', height: '100vh', minHeight: 0, width: '100vw', overflow: 'hidden', background: 'linear-gradient(135deg, #edf4f8 0%, #e5edf4 100%)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', margin: 0, color: '#172b3a' },
  sidebar: { width: '220px', height: '100vh', flex: '0 0 220px', background: 'linear-gradient(180deg, #142438 0%, #0c1728 100%)', padding: '18px 14px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflowY: 'auto' },
  userCard: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', padding: '8px' },
  avatar: { width: '38px', height: '38px', borderRadius: '50%', backgroundColor: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '13px' },
  userName: { color: '#ffffff', fontWeight: 'bold', fontSize: '15px' },
  userRole: { color: '#94a3b8', fontSize: '12px' },
  navMenu: { display: 'flex', flexDirection: 'column', gap: '7px', flex: 1 },
  navButton: { display: 'flex', alignItems: 'center', gap: '12px', minHeight: '42px', padding: '10px 14px', borderRadius: '9px', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '15px', fontWeight: '600' },
  sidebarFooter: { marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.15)' },
  sidebarLogout: { width: '100%', minHeight: '46px', border: '1px solid rgba(251,146,60,0.65)', background: 'rgba(154,52,18,0.24)', color: '#ffdfc2', borderRadius: '9px', padding: '11px 12px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '700', fontSize: '15px', cursor: 'pointer' },
  mainWrapper: { flex: 1, minWidth: 0, height: '100vh', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  topHeader: { height: '60px', flex: '0 0 60px', backgroundColor: '#ffffff', borderBottom: '1px solid #d8e3ea', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' },
  menuIconBtn: { background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' },
  systemTitle: { margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#1e293b', letterSpacing: '0.5px' },
  mainContent: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '28px', display: 'flex', flexDirection: 'column', gap: '22px' },
  errorCard: { backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px 16px', borderRadius: '12px', fontSize: '14px' },
  bannerCard: { background: 'linear-gradient(110deg, #ffffff 0%, #f0f8fb 100%)', border: '1px solid #d7e5eb', borderRadius: '12px', padding: '22px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 8px 24px rgba(24, 49, 66, 0.06)' },
  bannerIconBox: { width: '52px', height: '52px', borderRadius: '12px', background: 'linear-gradient(145deg, #0f7892, #155e75)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', boxShadow: '0 5px 12px rgba(15, 120, 146, 0.2)' },
  bannerTitle: { margin: 0, fontSize: '24px', fontWeight: '750', color: '#142b3a' },
  bannerSubtitle: { margin: '4px 0 0', fontSize: '15px', color: '#526b78' },
  dateBadge: { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', color: '#334155', fontWeight: '500' },
  actionBtn: { background: 'linear-gradient(135deg, #087e8b, #0b657b)', color: '#ffffff', border: 'none', padding: '11px 17px', minHeight: '42px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '15px', boxShadow: '0 5px 12px rgba(8, 126, 139, 0.18)' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' },
  kpiCard: { backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '12px' },
  kpiHeader: { display: 'flex', alignItems: 'center', gap: '12px' },
  kpiIconBoxBlue: { width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' },
  kpiIconBoxYellow: { width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' },
  kpiIconBoxPurple: { width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' },
  kpiTitle: { fontWeight: 'bold', fontSize: '15px', color: '#0f172a' },
  kpiSub: { fontSize: '12px', color: '#94a3b8' },
  kpiBigVal: { fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '4px 0 0' },
  sectionCard: { backgroundColor: '#ffffff', border: '1px solid #dce6eb', borderRadius: '12px', padding: '24px', boxShadow: '0 8px 24px rgba(24, 49, 66, 0.06)' },
  tableHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' },
  sectionTitle: { margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#142b3a' },
  sectionSub: { margin: '4px 0 0', fontSize: '14px', color: '#5c7180' },
  paymentField: { display: 'grid', alignContent: 'start', gap: '6px', color: '#334155', fontSize: '14px', fontWeight: 650 },
  paymentMethodHint: { margin: 0, padding: '11px 13px', border: '1px solid #d8e6ed', borderRadius: '8px', background: '#f5fafc', color: '#526b78', fontSize: '13px', lineHeight: 1.5 },
  paymentAmountNote: { padding: '12px 14px', border: '1px solid #ecd69a', borderRadius: '8px', background: '#fff9e9', color: '#72591b', fontSize: '13px', lineHeight: 1.5 },
  searchInput: { padding: '10px 13px', border: '1px solid #c7d7df', borderRadius: '8px', fontSize: '14px', width: '200px' },
  selectInput: { padding: '10px 13px', border: '1px solid #c7d7df', borderRadius: '8px', fontSize: '14px', backgroundColor: '#fff' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '15px' },
  thRow: { borderBottom: '2px solid #dbe6eb', textAlign: 'left' },
  th: { padding: '14px 12px', color: '#526b78', fontWeight: '700', fontSize: '14px' },
  tr: { borderBottom: '1px solid #e8eef1' },
  td: { padding: '15px 12px', color: '#354e5b' },
  tdId: { padding: '15px 12px', fontWeight: 'bold', color: '#087e8b' },
  tdDesc: { padding: '15px 12px', fontWeight: '600', color: '#173746' },
  tdAmount: { padding: '12px 10px', fontWeight: 'bold', textAlign: 'right' },
  badgeIncome: { backgroundColor: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600' },
  badgeExpense: { backgroundColor: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600' },
  statusBadge: { padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' },
  statusCompleted: { backgroundColor: '#dcfce7', color: '#15803d' },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalBox: { backgroundColor: '#fff', borderRadius: '12px', padding: '24px', width: '340px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' },
  formStack: { display: 'flex', flexDirection: 'column', gap: '12px' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' },
  modalInput: { padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', width: '100%', boxSizing: 'border-box' },
  emptyCell: { textAlign: 'center', padding: '24px', color: '#94a3b8' },
  cancelBtn: { border: '1px solid #cbd5e1', backgroundColor: '#fff', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' },
  tableActionBtn: { border: '1px solid #a7d8df', backgroundColor: '#eaf8f8', color: '#075b68', padding: '8px 11px', minHeight: '36px', borderRadius: '7px', cursor: 'pointer', fontSize: '14px', fontWeight: '650', marginLeft: '6px' },
  deactivateBtn: { border: '1px solid #f2b7a8', backgroundColor: '#fff1ed', color: '#9b3424', padding: '8px 11px', minHeight: '36px', borderRadius: '7px', cursor: 'pointer', fontSize: '14px', fontWeight: '650', marginLeft: '6px' },
};