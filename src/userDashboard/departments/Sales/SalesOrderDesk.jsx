import React, { useCallback, useEffect, useState } from 'react';
import DashboardFrame from '../../DashboardFrame.jsx';
import { apiRequest } from '../../../api.js';
import { useNotifications } from '../../../notifications/NotificationContext.js';
import { departmentConfig } from '../../departmentConfig.js';
import './salesDashboard.css';

const statusLabels = {
  placed: 'New order',
  accepted: 'Accepted',
  preparing: 'Preparing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const formatAmount = (amount) => `${new Intl.NumberFormat('en-ET', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(amount) || 0)} ETB`;

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function SalesOrderDesk({ user, onLogout }) {
  const { notify } = useNotifications();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [updatingOrderId, setUpdatingOrderId] = useState('');

  const refreshOrders = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      setOrders(await apiRequest('/sales/orders'));
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void refreshOrders(); }, [refreshOrders]);

  const updateStatus = async (order, status) => {
    setUpdatingOrderId(order.id);
    try {
      await apiRequest(`/sales/orders/${order.id}/status`, { method: 'PATCH', body: { status } });
      notify(status === 'accepted' ? 'Order accepted.' : 'Order moved to preparation.', 'success');
      await refreshOrders();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setUpdatingOrderId('');
    }
  };

  const normalizedSearch = search.trim().toLowerCase();
  const visibleOrders = orders.filter((order) => {
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' && !['delivered', 'cancelled'].includes(order.status))
      || order.status === statusFilter;
    const searchable = `${order.customer_name} ${order.customer_phone} ${order.id} ${order.items.map((item) => item.product_name).join(' ')}`;
    return matchesStatus && (!normalizedSearch || searchable.toLowerCase().includes(normalizedSearch));
  });

  const newOrders = orders.filter((order) => order.status === 'placed').length;
  const inProgress = orders.filter((order) => ['accepted', 'preparing'].includes(order.status)).length;
  const awaitingPayment = orders.filter((order) => order.payment_status !== 'paid'
    && !['cancelled', 'delivered'].includes(order.status)).length;
  const paidRevenue = orders.reduce((total, order) => total + (order.payment_status === 'paid' ? Number(order.total_amount) : 0), 0);

  return (
    <DashboardFrame user={user} config={departmentConfig.Sales} onLogout={onLogout}>
      <main className="sales-page">
        <header className="sales-header">
          <div>
            <p className="sales-eyebrow">Commercial operations</p>
            <h1>Sales order desk</h1>
            <p className="sales-subtitle">Customer orders, payment status, and production handoff.</p>
          </div>
          <button type="button" className="sales-button sales-button-secondary" onClick={refreshOrders} disabled={isLoading}>
            {isLoading ? 'Refreshing…' : 'Refresh orders'}
          </button>
        </header>

        <section className="sales-metrics" aria-label="Order performance">
          <article className="sales-metric"><span>New orders</span><strong>{newOrders}</strong><small>Awaiting Sales review</small></article>
          <article className="sales-metric"><span>In progress</span><strong>{inProgress}</strong><small>Accepted or preparing</small></article>
          <article className="sales-metric"><span>Awaiting payment</span><strong>{awaitingPayment}</strong><small>Finance verification required</small></article>
          <article className="sales-metric"><span>Paid revenue</span><strong>{formatAmount(paidRevenue)}</strong><small>Across loaded orders</small></article>
        </section>

        <section className="sales-orders-panel">
          <div className="sales-panel-heading">
            <div><h2>Customer orders</h2><p>Accept new orders and send accepted work to preparation.</p></div>
            <span className="sales-order-count">{visibleOrders.length} orders</span>
          </div>
          <div className="sales-toolbar">
            <label className="sales-search"><span>Search orders</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer, phone, order, product" /></label>
            <label className="sales-status-filter"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="active">Active orders</option><option value="all">All orders</option>
              <option value="placed">New order</option><option value="accepted">Accepted</option>
              <option value="preparing">Preparing</option><option value="out_for_delivery">Out for delivery</option>
              <option value="delivered">Delivered</option><option value="cancelled">Cancelled</option>
            </select></label>
          </div>

          {loadError && <div className="sales-error" role="alert"><span>{loadError}</span><button type="button" onClick={refreshOrders}>Retry</button></div>}
          {isLoading ? <p className="sales-empty">Loading customer orders…</p> : visibleOrders.length === 0 ? (
            <p className="sales-empty">{orders.length === 0 ? 'No customer orders yet.' : 'No orders match these filters.'}</p>
          ) : (
            <div className="sales-table-wrap"><table className="sales-table">
              <thead><tr><th>Order / customer</th><th>Products</th><th>Amount / payment</th><th>Delivery</th><th>Status</th><th>Next step</th></tr></thead>
              <tbody>{visibleOrders.map((order) => {
                const nextStatus = order.status === 'placed' ? 'accepted' : order.status === 'accepted' ? 'preparing' : '';
                return <tr key={order.id}>
                  <td data-label="Order / customer"><strong>#{order.id.slice(0, 8).toUpperCase()}</strong><span>{order.customer_name}</span><small>{order.customer_phone} · {formatDate(order.created_at)}</small></td>
                  <td data-label="Products"><div className="sales-product-lines">{order.items.map((item, index) => <span key={`${item.product_name}-${index}`}>{item.quantity} × {item.product_name}</span>)}</div></td>
                  <td data-label="Amount / payment"><strong>{formatAmount(order.total_amount)}</strong><span className={`sales-payment sales-payment-${order.payment_status}`}>{order.payment_status.replaceAll('_', ' ')}</span></td>
                  <td data-label="Delivery"><span className="sales-address">{order.delivery_address}</span></td>
                  <td data-label="Status"><span className={`sales-status sales-status-${order.status}`}>{statusLabels[order.status] || order.status}</span></td>
                  <td data-label="Next step">{nextStatus ? <button type="button" className="sales-button sales-button-primary" disabled={updatingOrderId === order.id} onClick={() => updateStatus(order, nextStatus)}>
                    {updatingOrderId === order.id ? 'Saving…' : nextStatus === 'accepted' ? 'Accept order' : 'Start preparation'}
                  </button> : <span className="sales-no-action">{order.status === 'preparing' ? 'Production handoff' : 'No Sales action'}</span>}</td>
                </tr>;
              })}</tbody>
            </table></div>
          )}
        </section>
        <p className="sales-control-note">Payment verification and dispatch are administrator-controlled. Coordinate Finance and Logistics handoffs outside this screen.</p>
      </main>
    </DashboardFrame>
  );
}