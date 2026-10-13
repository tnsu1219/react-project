import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardFrame from '../../DashboardFrame.jsx';
import { apiRequest } from '../../../api.js';
import { useNotifications } from '../../../notifications/NotificationContext.js';
import { departmentConfig } from '../../departmentConfig.js';
import './mainstoreDashboard.css';

const emptyForm = { product_id: '', quantity: 1, reference_number: '', counterparty: '', reason: '' };

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function MainstoreControlDesk({ user, onLogout }) {
  const { notify } = useNotifications();
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [movementType, setMovementType] = useState('receipt');
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const refreshStock = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await apiRequest('/mainstore/stock');
      setProducts(data.products);
      setMovements(data.movements);
      setForm((current) => ({ ...current, product_id: current.product_id || String(data.products[0]?.id || '') }));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void refreshStock(); }, [refreshStock]);

  const searchValue = search.trim().toLowerCase();
  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesSearch = !searchValue
      || `${product.name} ${product.sku || ''} ${product.category}`.toLowerCase().includes(searchValue);
    return matchesSearch && (stockFilter !== 'low' || product.quantity <= product.reorder_level);
  }), [products, searchValue, stockFilter]);

  const selectedProduct = products.find((product) => String(product.id) === form.product_id);
  const totalUnits = products.reduce((total, product) => total + Number(product.quantity), 0);
  const lowStockCount = products.filter((product) => product.quantity <= product.reorder_level).length;

  const submitMovement = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await apiRequest('/mainstore/stock/movements', {
        method: 'POST',
        body: { ...form, movement_type: movementType, quantity: Number(form.quantity) },
      });
      notify(movementType === 'receipt' ? 'Stock receipt recorded.' : 'Stock issue recorded.', 'success');
      setForm((current) => ({ ...emptyForm, product_id: current.product_id }));
      await refreshStock();
    } catch (requestError) {
      notify(requestError.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardFrame user={user} config={departmentConfig.Mainstore} onLogout={onLogout}>
      <main className="store-page">
        <header className="store-header">
          <div><p className="store-eyebrow">Inventory operations</p><h1>Mainstore control</h1><p>Live stock balances, traceable receiving, and controlled issue to operations.</p></div>
          <button type="button" className="store-button store-button-outline" onClick={refreshStock} disabled={isLoading}>{isLoading ? 'Refreshing…' : 'Refresh stock'}</button>
        </header>

        <section className="store-metrics" aria-label="Inventory summary">
          <article><span>Stock items</span><strong>{products.length}</strong><small>Active product records</small></article>
          <article><span>Available units</span><strong>{totalUnits.toLocaleString()}</strong><small>Across all stock items</small></article>
          <article className={lowStockCount ? 'is-alert' : ''}><span>Reorder watch</span><strong>{lowStockCount}</strong><small>At or below item reorder level</small></article>
          <article><span>Recent movements</span><strong>{movements.length}</strong><small>Latest 200 records</small></article>
        </section>

        {error && <div className="store-error" role="alert"><span>{error}</span><button type="button" onClick={refreshStock}>Retry</button></div>}

        <div className="store-workspace">
          <section className="store-panel store-movement-panel">
            <div className="store-panel-heading"><div><p className="store-eyebrow">Stock movement</p><h2>Receive or issue</h2></div><span className="store-live-indicator">Server recorded</span></div>
            <div className="store-segmented" role="group" aria-label="Movement type">
              <button type="button" className={movementType === 'receipt' ? 'is-selected' : ''} aria-pressed={movementType === 'receipt'} onClick={() => setMovementType('receipt')}>Receive goods</button>
              <button type="button" className={movementType === 'issue' ? 'is-selected' : ''} aria-pressed={movementType === 'issue'} onClick={() => setMovementType('issue')}>Issue stock</button>
            </div>
            <form className="store-form" onSubmit={submitMovement}>
              <label><span>Stock item</span><select required value={form.product_id} onChange={(event) => setForm({ ...form, product_id: event.target.value })}><option value="">Select a product</option>{products.map((product) => <option key={product.id} value={String(product.id)}>{product.name}{product.sku ? ` · ${product.sku}` : ''} · {product.quantity} available</option>)}</select></label>
              {selectedProduct && <p className="store-selected-stock">Available now <strong>{selectedProduct.quantity} units</strong><span>Reorder at {selectedProduct.reorder_level}</span></p>}
              <div className="store-fields-two">
                <label><span>Quantity</span><input type="number" min="1" max="1000000" step="1" required value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></label>
                <label><span>Document / reference</span><input required maxLength="100" value={form.reference_number} onChange={(event) => setForm({ ...form, reference_number: event.target.value })} placeholder={movementType === 'receipt' ? 'Supplier invoice / GRN' : 'Issue slip / work order'} /></label>
              </div>
              <label><span>{movementType === 'receipt' ? 'Supplier' : 'Destination / department'}</span><input required maxLength="160" value={form.counterparty} onChange={(event) => setForm({ ...form, counterparty: event.target.value })} placeholder={movementType === 'receipt' ? 'Supplier name' : 'Production, sales, or customer order'} /></label>
              <label><span>Reason / movement notes</span><textarea required maxLength="500" rows="3" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder={movementType === 'receipt' ? 'Condition, accepted quantity, or discrepancy' : 'Purpose and authorization reference'} /></label>
              <button type="submit" className={`store-button ${movementType === 'receipt' ? 'store-button-green' : 'store-button-orange'}`} disabled={isSaving || !products.length}>{isSaving ? 'Saving movement…' : movementType === 'receipt' ? 'Record receipt' : 'Record issue'}</button>
            </form>
          </section>

          <section className="store-panel store-stock-panel">
            <div className="store-panel-heading"><div><p className="store-eyebrow">Stock control</p><h2>Current balances</h2></div><span className="store-count">{visibleProducts.length} items</span></div>
            <div className="store-stock-toolbar">
              <label className="store-search"><span>Find item</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, SKU, or category" /></label>
              <div className="store-filter" role="group" aria-label="Stock filter"><button type="button" className={stockFilter === 'all' ? 'is-selected' : ''} aria-pressed={stockFilter === 'all'} onClick={() => setStockFilter('all')}>All</button><button type="button" className={stockFilter === 'low' ? 'is-selected' : ''} aria-pressed={stockFilter === 'low'} onClick={() => setStockFilter('low')}>Reorder watch</button></div>
            </div>
            {isLoading ? <p className="store-empty">Loading stock balances…</p> : visibleProducts.length === 0 ? <p className="store-empty">{products.length ? 'No items match this filter.' : 'No stock items are configured yet. Ask an administrator to add products.'}</p> : (
              <div className="store-stock-list">{visibleProducts.map((product) => {
                const isLow = product.quantity <= product.reorder_level;
                return <article className="store-stock-row" key={product.id}>
                  <div className="store-item-identity"><strong>{product.name}</strong><span>{product.sku || 'No SKU'} · {product.category}</span></div>
                  <div className="store-stock-level"><strong>{Number(product.quantity).toLocaleString()}</strong><span>available</span></div>
                  <span className={`store-stock-status ${isLow ? 'is-low' : 'is-ok'}`}>{isLow ? 'Reorder' : 'In stock'}<small>Level {product.reorder_level}</small></span>
                </article>;
              })}</div>
            )}
          </section>
        </div>

        <section className="store-panel store-history-panel">
          <div className="store-panel-heading"><div><p className="store-eyebrow">Audit trail</p><h2>Recent stock movements</h2><p>Receipts and issues include their document reference, reason, operator, and resulting balance.</p></div></div>
          {isLoading ? <p className="store-empty">Loading movement history…</p> : movements.length === 0 ? <p className="store-empty">No warehouse movements recorded yet.</p> : (
            <div className="store-table-wrap"><table className="store-table"><thead><tr><th>Date / operator</th><th>Item</th><th>Movement</th><th>Reference / party</th><th>Reason</th><th>Balance after</th></tr></thead>
              <tbody>{movements.map((movement) => <tr key={movement.id}>
                <td data-label="Date / operator"><strong>{formatDate(movement.created_at)}</strong><span>{movement.recorded_by}</span></td>
                <td data-label="Item"><strong>{movement.product_name}</strong><span>{movement.sku || 'No SKU'}</span></td>
                <td data-label="Movement"><span className={`store-movement-tag is-${movement.movement_type}`}>{movement.movement_type === 'receipt' ? 'Received' : 'Issued'} {movement.movement_type === 'receipt' ? '+' : '−'}{movement.quantity}</span></td>
                <td data-label="Reference / party"><strong>{movement.reference_number}</strong><span>{movement.counterparty}</span></td>
                <td data-label="Reason"><span className="store-reason">{movement.reason}</span></td>
                <td data-label="Balance after"><strong>{movement.balance_after} units</strong><small>{movement.balance_before} before</small></td>
              </tr>)}</tbody>
            </table></div>
          )}
        </section>
      </main>
    </DashboardFrame>
  );
}