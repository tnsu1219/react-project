import React, { useMemo, useState } from 'react';
import DashboardFrame from '../../DashboardFrame.jsx';
import { departmentConfig } from '../../departmentConfig.js';
import { useNotifications } from '../../../notifications/NotificationContext.js';

const initialInventory = [
  { id: 1, name: 'Laptop Pro 14', category: 'Electronics', price: 3200, qty: 12 },
  { id: 2, name: 'Office Chair', category: 'Furniture', price: 450, qty: 24 },
  { id: 3, name: 'Bluetooth Speaker', category: 'Accessories', price: 180, qty: 31 },
  { id: 4, name: 'Printer X100', category: 'Electronics', price: 980, qty: 8 },
];

const initialSales = [
  { id: 1, customer: 'Nabil Traders', item: 'Laptop Pro 14', qty: 2, total: 6400, date: 'Today • 09:15', status: 'Paid' },
  { id: 2, customer: 'Safa Retail', item: 'Bluetooth Speaker', qty: 5, total: 900, date: 'Today • 11:30', status: 'Paid' },
  { id: 3, customer: 'Kareem Stores', item: 'Printer X100', qty: 1, total: 980, date: 'Today • 12:45', status: 'Pending' },
  { id: 4, customer: 'Dania Market', item: 'Office Chair', qty: 4, total: 1800, date: 'Today • 15:00', status: 'Paid' },
];

export default function SalesDashboard({ user, onLogout }) {
  const { notify } = useNotifications();
  const config = departmentConfig.Sales;
  const [inventory, setInventory] = useState(initialInventory);
  const [sales, setSales] = useState(initialSales);
  const [sellForm, setSellForm] = useState({ itemId: '1', quantity: 1, customer: 'Walk-in Customer' });
  const [restockForm, setRestockForm] = useState({ itemName: 'Laptop Pro 14', supplier: 'Global Commerce', quantity: 10, cost: 2800 });

  const totalRevenue = useMemo(
    () => sales.reduce((sum, sale) => sum + sale.total, 0),
    [sales],
  );

  const totalStock = useMemo(
    () => inventory.reduce((sum, item) => sum + item.qty, 0),
    [inventory],
  );

  const bestSeller = useMemo(() => {
    const counts = sales.reduce((acc, sale) => {
      acc[sale.item] = (acc[sale.item] || 0) + sale.qty;
      return acc;
    }, {});

    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  }, [sales]);

  const handleSell = (event) => {
    event.preventDefault();
    const item = inventory.find((entry) => String(entry.id) === String(sellForm.itemId));
    const quantity = Number(sellForm.quantity);

    if (!item || quantity <= 0) return;
    if (item.qty < quantity) {
      notify('Not enough stock available for this sale.', 'warning', 'Insufficient stock');
      return;
    }

    const updatedInventory = inventory.map((entry) =>
      entry.id === item.id ? { ...entry, qty: entry.qty - quantity } : entry,
    );

    const saleTotal = item.price * quantity;
    const saleEntry = {
      id: Date.now(),
      customer: sellForm.customer || 'Walk-in Customer',
      item: item.name,
      qty: quantity,
      total: saleTotal,
      date: 'Just now',
      status: 'Paid',
    };

    setInventory(updatedInventory);
    setSales((current) => [saleEntry, ...current]);
    setSellForm({ itemId: String(item.id), quantity: 1, customer: sellForm.customer });
  };

  const handleRestock = (event) => {
    event.preventDefault();
    const item = inventory.find((entry) => entry.name.toLowerCase() === restockForm.itemName.toLowerCase());
    const quantity = Number(restockForm.quantity);
    if (!item) {
      const newItem = {
        id: Date.now(),
        name: restockForm.itemName,
        category: 'New',
        price: Number(restockForm.cost) / Math.max(quantity, 1),
        qty: quantity,
      };
      setInventory((current) => [newItem, ...current]);
    } else {
      setInventory((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, qty: entry.qty + quantity } : entry,
        ),
      );
    }

    setRestockForm({ itemName: '', supplier: restockForm.supplier, quantity: 10, cost: 0 });
  };

  return (
    <DashboardFrame user={user} config={config} onLogout={onLogout}>
      <div style={styles.pageShell}>
        <header style={styles.header}>
          <div>
            <p style={styles.eyebrow}>Sales performance</p>
            <h1 style={styles.title}>Retail and sales dashboard</h1>
          </div>
          <button type="button" style={styles.primaryButton}>+ New sale</button>
        </header>

        <section style={styles.kpiGrid}>
          <article style={styles.kpiCard}>
            <span style={styles.kpiLabel}>Revenue</span>
            <strong style={styles.kpiValue}>${totalRevenue.toLocaleString()}</strong>
            <small style={styles.kpiMeta}>This period</small>
          </article>
          <article style={styles.kpiCard}>
            <span style={styles.kpiLabel}>Units sold</span>
            <strong style={styles.kpiValue}>{sales.reduce((sum, sale) => sum + sale.qty, 0)}</strong>
            <small style={styles.kpiMeta}>Across all sales</small>
          </article>
          <article style={styles.kpiCard}>
            <span style={styles.kpiLabel}>Stock on hand</span>
            <strong style={styles.kpiValue}>{totalStock}</strong>
            <small style={styles.kpiMeta}>Products available</small>
          </article>
          <article style={styles.kpiCard}>
            <span style={styles.kpiLabel}>Top seller</span>
            <strong style={styles.kpiValue}>{bestSeller ? bestSeller[0] : 'N/A'}</strong>
            <small style={styles.kpiMeta}>{bestSeller ? `${bestSeller[1]} units` : 'No sales yet'}</small>
          </article>
        </section>

        <section style={styles.mainGrid}>
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <div>
                <p style={styles.panelEyebrow}>Quick sell</p>
                <h2 style={styles.panelTitle}>Record a sale</h2>
              </div>
              <span style={{ ...styles.badge, background: '#fff7ed', color: '#c2410c' }}>Live stock</span>
            </div>

            <form onSubmit={handleSell} style={styles.form}>
              <label style={styles.fieldGroup}>
                <span style={styles.label}>Customer</span>
                <input
                  type="text"
                  value={sellForm.customer}
                  onChange={(event) => setSellForm({ ...sellForm, customer: event.target.value })}
                  style={styles.input}
                />
              </label>

              <label style={styles.fieldGroup}>
                <span style={styles.label}>Product</span>
                <select
                  value={sellForm.itemId}
                  onChange={(event) => setSellForm({ ...sellForm, itemId: event.target.value })}
                  style={styles.input}
                >
                  {inventory.map((item) => (
                    <option value={String(item.id)} key={item.id}>
                      {item.name} ({item.qty} left)
                    </option>
                  ))}
                </select>
              </label>

              <label style={styles.fieldGroup}>
                <span style={styles.label}>Quantity</span>
                <input
                  type="number"
                  min="1"
                  value={sellForm.quantity}
                  onChange={(event) => setSellForm({ ...sellForm, quantity: Number(event.target.value) || 1 })}
                  style={styles.input}
                />
              </label>

              <button type="submit" style={styles.primaryButton}>Sell now</button>
            </form>
          </div>

          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <div>
                <p style={styles.panelEyebrow}>Purchase</p>
                <h2 style={styles.panelTitle}>Buy stock</h2>
              </div>
              <span style={{ ...styles.badge, background: '#ecfeff', color: '#0f766e' }}>Supplier</span>
            </div>

            <form onSubmit={handleRestock} style={styles.form}>
              <label style={styles.fieldGroup}>
                <span style={styles.label}>Product name</span>
                <input
                  type="text"
                  value={restockForm.itemName}
                  onChange={(event) => setRestockForm({ ...restockForm, itemName: event.target.value })}
                  style={styles.input}
                />
              </label>

              <label style={styles.fieldGroup}>
                <span style={styles.label}>Supplier</span>
                <input
                  type="text"
                  value={restockForm.supplier}
                  onChange={(event) => setRestockForm({ ...restockForm, supplier: event.target.value })}
                  style={styles.input}
                />
              </label>

              <div style={styles.inlineFields}>
                <label style={styles.fieldGroup}>
                  <span style={styles.label}>Qty</span>
                  <input
                    type="number"
                    min="1"
                    value={restockForm.quantity}
                    onChange={(event) => setRestockForm({ ...restockForm, quantity: Number(event.target.value) || 1 })}
                    style={styles.input}
                  />
                </label>

                <label style={styles.fieldGroup}>
                  <span style={styles.label}>Cost</span>
                  <input
                    type="number"
                    min="0"
                    value={restockForm.cost}
                    onChange={(event) => setRestockForm({ ...restockForm, cost: Number(event.target.value) || 0 })}
                    style={styles.input}
                  />
                </label>
              </div>

              <button type="submit" style={{ ...styles.primaryButton, background: '#0f766e' }}>Order stock</button>
            </form>
          </div>
        </section>

        <section style={styles.bottomGrid}>
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <div>
                <p style={styles.panelEyebrow}>Inventory</p>
                <h2 style={styles.panelTitle}>Available products</h2>
              </div>
            </div>

            <div style={styles.list}>
              {inventory.map((item) => (
                <div key={item.id} style={styles.listItem}>
                  <div>
                    <strong style={styles.itemName}>{item.name}</strong>
                    <span style={styles.itemMeta}>{item.category}</span>
                  </div>
                  <div style={styles.itemRight}>
                    <span style={styles.itemPrice}>${item.price.toLocaleString()}</span>
                    <span style={{ ...styles.stockPill, background: item.qty < 10 ? '#fff7ed' : '#ecfdf5', color: item.qty < 10 ? '#c2410c' : '#166534' }}>
                      {item.qty} in stock
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <div>
                <p style={styles.panelEyebrow}>Transactions</p>
                <h2 style={styles.panelTitle}>Recent sales</h2>
              </div>
            </div>

            <div style={styles.salesList}>
              {sales.map((sale) => (
                <div key={sale.id} style={styles.saleItem}>
                  <div>
                    <strong style={styles.itemName}>{sale.item}</strong>
                    <span style={styles.itemMeta}>{sale.customer} • {sale.qty} units</span>
                  </div>
                  <div style={styles.saleMeta}>
                    <span style={styles.saleTotal}>${sale.total.toLocaleString()}</span>
                    <span style={{ ...styles.statusPill, background: sale.status === 'Paid' ? '#ecfdf5' : '#fff7ed', color: sale.status === 'Paid' ? '#166534' : '#c2410c' }}>
                      {sale.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </DashboardFrame>
  );
}

const styles = {
  pageShell: {
    display: 'grid',
    gap: '22px',
    width: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '14px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '18px',
    padding: '24px 26px',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.04)',
  },
  eyebrow: {
    margin: '0 0 6px',
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#f97316',
  },
  title: {
    margin: 0,
    fontSize: 'clamp(1.7rem, 2vw, 2.5rem)',
    color: '#0f172a',
  },
  primaryButton: {
    border: 'none',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #f97316, #ea580c)',
    color: '#fff',
    padding: '12px 18px',
    fontWeight: '800',
    fontSize: '0.96rem',
    cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(249, 115, 22, 0.25)',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
  },
  kpiCard: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    padding: '20px 18px',
    display: 'grid',
    gap: '5px',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.03)',
  },
  kpiLabel: {
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#64748b',
    fontWeight: '700',
  },
  kpiValue: {
    fontSize: '2rem',
    lineHeight: 1.1,
    color: '#0f172a',
  },
  kpiMeta: {
    color: '#64748b',
    fontSize: '12px',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '18px',
  },
  panel: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '18px',
    padding: '20px',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.03)',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '18px',
  },
  panelEyebrow: {
    margin: '0 0 6px',
    color: '#f97316',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontSize: '11px',
    fontWeight: '800',
  },
  panelTitle: {
    margin: 0,
    color: '#0f172a',
    fontSize: '1.3rem',
  },
  badge: {
    borderRadius: '999px',
    padding: '7px 10px',
    fontSize: '11px',
    fontWeight: '800',
  },
  form: {
    display: 'grid',
    gap: '14px',
  },
  fieldGroup: {
    display: 'grid',
    gap: '7px',
  },
  label: {
    fontSize: '12px',
    color: '#475569',
    fontWeight: '700',
  },
  input: {
    width: '100%',
    border: '1px solid #cbd5e1',
    borderRadius: '10px',
    padding: '11px 12px',
    fontSize: '14px',
    color: '#0f172a',
    background: '#fff',
    boxSizing: 'border-box',
  },
  inlineFields: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
  },
  bottomGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
    gap: '18px',
  },
  list: {
    display: 'grid',
    gap: '10px',
  },
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 0',
    borderBottom: '1px solid #e2e8f0',
  },
  itemName: {
    display: 'block',
    color: '#0f172a',
    fontSize: '0.98rem',
    marginBottom: '4px',
  },
  itemMeta: {
    color: '#64748b',
    fontSize: '12px',
  },
  itemRight: {
    display: 'grid',
    justifyItems: 'end',
    gap: '6px',
  },
  itemPrice: {
    color: '#0f172a',
    fontWeight: '800',
  },
  stockPill: {
    borderRadius: '999px',
    padding: '5px 8px',
    fontSize: '11px',
    fontWeight: '700',
  },
  salesList: {
    display: 'grid',
    gap: '12px',
  },
  saleItem: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: '1px solid #e2e8f0',
  },
  saleMeta: {
    display: 'grid',
    justifyItems: 'end',
    gap: '6px',
  },
  saleTotal: {
    fontWeight: '800',
    color: '#0f172a',
  },
  statusPill: {
    borderRadius: '999px',
    padding: '5px 8px',
    fontSize: '10px',
    fontWeight: '800',
  },
};
