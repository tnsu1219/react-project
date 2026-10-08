import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api.js';
import './customerStorefront.css';

const paymentMethods = [
  { id: 'telebirr', label: 'Telebirr', mark: 'T', tone: 'violet' },
  { id: 'cbe', label: 'CBE', mark: 'C', tone: 'green' },
  { id: 'other_bank', label: 'Other bank', mark: 'B', tone: 'blue' },
];

const paymentMethodGroups = [
  { id: 'telebirr', title: 'Telebirr', description: 'Pay using a company-registered Telebirr mobile number.' },
  { id: 'cbe', title: 'Commercial Bank of Ethiopia (CBE)', description: 'Transfer to one of the published company CBE accounts.' },
  { id: 'other_bank', title: 'Other Ethiopian banks', description: 'Choose the account under the bank name shown on its card.' },
];

const statusLabels = {
  placed: 'Order placed',
  accepted: 'Accepted',
  preparing: 'Preparing',
  out_for_delivery: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const getPaymentMethodLabel = (order) => {
  if (order.payment_method === 'other_bank') return order.payment_account_display_name || order.payment_submissions?.[0]?.payment_account_display_name || 'Other bank';
  if (order.payment_account_display_name) return `${paymentMethods.find((method) => method.id === order.payment_method)?.label || order.payment_method} · ${order.payment_account_display_name}`;
  return paymentMethods.find((method) => method.id === order.payment_method)?.label || order.payment_method;
};

const getAccountTitle = (account) => account.provider === 'other_bank'
  ? account.display_name
  : paymentMethods.find((method) => method.id === account.provider)?.label || account.provider;

const getCustomerPaymentStatus = (order) => {
  if (order.payment_status === 'paid') return 'Payment verified';
  if (order.payment_status === 'failed') return 'Payment not verified';
  if ((order.payment_submissions || []).some((submission) => submission.status === 'pending')) {
    return 'Payment submitted · awaiting verification';
  }
  return 'Awaiting payment';
};

const formatAmount = (amount) => `${new Intl.NumberFormat('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount) || 0)} ETB`;
const cleanCatalogText = (value) => String(value || '').replace(/^\s*DEMO ONLY\s*[-.:]?\s*/i, '').trim();
const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('The payment receipt could not be read. Please choose the file again.'));
  reader.readAsDataURL(file);
});

export default function CustomerStorefront({ user, onLogout }) {
  const [catalog, setCatalog] = useState([]);
  const [orders, setOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [profile, setProfile] = useState({ full_name: user.full_name || '', phone: '', area: '', street: '', main_road: '', home_number: '', delivery_notes: '', latitude: null, longitude: null });
  const [profileForm, setProfileForm] = useState(profile);
  const [cart, setCart] = useState({});
  const [view, setView] = useState('shop');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingAccounts, setRefreshingAccounts] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [locationStatus, setLocationStatus] = useState('');
  const [selectedPaymentAccountId, setSelectedPaymentAccountId] = useState('');
  const [paymentSubmission, setPaymentSubmission] = useState({ orderId: '', accountId: '', amount: '', transactionReference: '', receiptFile: null, remarks: '' });
  const [recentReceipt, setRecentReceipt] = useState(null);
  const [receiptToPrint, setReceiptToPrint] = useState(null);
  const [coordinates, setCoordinates] = useState(null);

  const loadStore = async (isCurrent = () => true) => {
    const results = await Promise.allSettled([
      apiRequest('/catalog'),
      apiRequest('/orders/mine'),
      apiRequest('/payment-accounts'),
      apiRequest('/customer/profile'),
    ]);
    if (!isCurrent()) return;

    const [products, customerOrders, paymentAccounts, customerProfile] = results;
    if (products.status === 'fulfilled') setCatalog(products.value);
    if (customerOrders.status === 'fulfilled') setOrders(customerOrders.value);
    if (paymentAccounts.status === 'fulfilled') setAccounts(paymentAccounts.value);
    if (customerProfile.status === 'fulfilled') {
      setProfile(customerProfile.value);
      setProfileForm(customerProfile.value);
    }

    const errors = results.flatMap((result, index) => {
      if (result.status === 'fulfilled') return [];
      const labels = ['Product catalog', 'Orders', 'Payment accounts', 'Customer profile'];
      return [`${labels[index]}: ${result.reason?.message || 'could not be loaded.'}`];
    });
    if (errors.length) throw new Error(errors.join(' '));
  };

  const refreshPaymentAccounts = async () => {
    setRefreshingAccounts(true);
    setError('');
    setMessage('');
    try {
      const paymentAccounts = await apiRequest('/payment-accounts');
      setAccounts(paymentAccounts);
      setMessage(paymentAccounts.length
        ? 'Available company payment methods are up to date.'
        : 'No active company payment methods are published yet.');
    } catch (requestError) {
      setError(requestError.message || 'Payment methods could not be refreshed.');
    } finally {
      setRefreshingAccounts(false);
    }
  };

  const refreshCatalog = async () => {
    setRefreshingCatalog(true);
    setError('');
    setMessage('');
    try {
      const products = await apiRequest('/catalog');
      setCatalog(products);
      setMessage('Product catalog is up to date.');
    } catch (requestError) {
      setError(requestError.message || 'Products could not be refreshed.');
    } finally {
      setRefreshingCatalog(false);
    }
  };

  useEffect(() => {
    let isCurrent = true;
    Promise.allSettled([
      apiRequest('/catalog'),
      apiRequest('/orders/mine'),
      apiRequest('/payment-accounts'),
      apiRequest('/customer/profile'),
    ])
      .then((results) => {
        if (!isCurrent) return;
        const [products, customerOrders, paymentAccounts, customerProfile] = results;
        if (products.status === 'fulfilled') setCatalog(products.value);
        if (customerOrders.status === 'fulfilled') setOrders(customerOrders.value);
        if (paymentAccounts.status === 'fulfilled') setAccounts(paymentAccounts.value);
        if (customerProfile.status === 'fulfilled') {
          setProfile(customerProfile.value);
          setProfileForm(customerProfile.value);
        }

        const errors = results.flatMap((result, index) => {
          if (result.status === 'fulfilled') return [];
          const labels = ['Product catalog', 'Orders', 'Payment accounts', 'Customer profile'];
          return [`${labels[index]}: ${result.reason?.message || 'could not be loaded.'}`];
        });
        if (errors.length) setError(errors.join(' '));
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });
    return () => { isCurrent = false; };
  }, []);

  const categories = useMemo(() => ['All', ...new Set(catalog.map((product) => product.category).filter(Boolean))], [catalog]);
  const visibleProducts = useMemo(() => catalog.filter((product) => {
    const matchesSearch = `${cleanCatalogText(product.name)} ${product.category} ${product.sku || ''}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesSearch && (category === 'All' || product.category === category);
  }), [catalog, category, search]);
  const cartLines = useMemo(() => catalog
    .filter((product) => cart[product.id])
    .map((product) => ({ ...product, cartQuantity: cart[product.id], lineTotal: Number(product.unit_price) * cart[product.id] })), [catalog, cart]);
  const cartCount = cartLines.reduce((sum, item) => sum + item.cartQuantity, 0);
  const cartTotal = cartLines.reduce((sum, item) => sum + item.lineTotal, 0);
  const profileComplete = Boolean(profile.phone && profile.area && profile.street && profile.main_road && profile.home_number);
  const ordersAwaitingReview = orders.some((order) => (
    order.status !== 'cancelled'
    && order.payment_status !== 'paid'
    && (order.payment_submissions || []).some((submission) => submission.status === 'pending')
  ));
  const paymentOrders = orders.filter((order) => (
    order.status !== 'cancelled'
    && order.payment_status !== 'paid'
    && !(order.payment_submissions || []).some((submission) => submission.status === 'pending')
  ));
  const selectedPaymentOrder = paymentOrders.find((order) => order.id === paymentSubmission.orderId);
  const paymentAccountsForOrder = accounts.filter((account) => selectedPaymentOrder
    && (selectedPaymentOrder.payment_account_id
      ? String(account.id) === String(selectedPaymentOrder.payment_account_id)
      : account.provider === selectedPaymentOrder.payment_method));
  const selectedPaymentAccount = accounts.find((account) => String(account.id) === selectedPaymentAccountId)
    || accounts[0]
    || null;
  const selectedSubmissionAccount = accounts.find((account) => String(account.id) === paymentSubmission.accountId) || null;
  const availablePaymentGroups = paymentMethodGroups
    .map((group) => ({ ...group, accounts: accounts.filter((account) => account.provider === group.id) }))
    .filter((group) => group.accounts.length > 0);
  const selectedPaymentMethod = selectedPaymentAccount?.provider || '';
  const selectedPaymentGroup = availablePaymentGroups.find((group) => group.id === selectedPaymentMethod)
    || availablePaymentGroups[0]
    || null;
  const checkoutCoordinates = coordinates || (profile.latitude != null ? { latitude: profile.latitude, longitude: profile.longitude } : null);
  const displayName = profile.full_name || user.full_name || user.email.split('@')[0];
  const initials = displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!receiptToPrint) return undefined;
    const printTimer = window.setTimeout(() => window.print(), 100);
    const clearReceipt = () => setReceiptToPrint(null);
    window.addEventListener('afterprint', clearReceipt);
    return () => {
      window.clearTimeout(printTimer);
      window.removeEventListener('afterprint', clearReceipt);
    };
  }, [receiptToPrint]);

  const makeReceipt = (order, submission) => ({
    ...submission,
    orderId: order.id,
    orderTotal: Number(order.total_amount),
    customerName: displayName,
    customerEmail: user.email,
    customerPhone: order.customer_phone || profile.phone,
  });

  const startPaymentSubmission = (order) => {
    const matchingAccount = accounts.find((account) => order.payment_account_id
      ? String(account.id) === String(order.payment_account_id)
      : account.provider === order.payment_method);
    setPaymentSubmission({
      orderId: order.id,
      accountId: matchingAccount ? String(matchingAccount.id) : '',
      amount: Number(order.total_amount).toFixed(2),
      transactionReference: '',
      receiptFile: null,
      remarks: '',
    });
    setRecentReceipt(null);
    setView('accounts');
  };

  const addToCart = (product) => {
    setMessage('');
    setCart((current) => ({
      ...current,
      [product.id]: Math.min((current[product.id] || 0) + 1, Number(product.quantity)),
    }));
  };

  const changeQuantity = (productId, change) => {
    const product = catalog.find((item) => item.id === productId);
    if (!product) return;
    setCart((current) => {
      const quantity = Math.min((current[productId] || 0) + change, Number(product.quantity));
      if (quantity < 1) {
        const next = { ...current };
        delete next[productId];
        return next;
      }
      return { ...current, [productId]: quantity };
    });
  };

  const goToPaymentOptions = () => {
    const targetId = cartCount ? 'customer-payment-setup' : 'customer-catalog';
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('Location is not available in this browser. Enter your address instead.');
      return;
    }
    setLocationStatus('Requesting your location...');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = { latitude: Number(coords.latitude.toFixed(6)), longitude: Number(coords.longitude.toFixed(6)) };
        setCoordinates(location);
        setProfileForm((current) => ({ ...current, ...location }));
        setLocationStatus('Delivery pin added. You can still edit the written address.');
      },
      () => setLocationStatus('Could not get location. Check browser permission or enter your address manually.'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const savedProfile = await apiRequest('/customer/profile', {
        method: 'PUT',
        body: { ...profileForm, latitude: coordinates?.latitude ?? profileForm.latitude, longitude: coordinates?.longitude ?? profileForm.longitude },
      });
      setProfile(savedProfile);
      setProfileForm(savedProfile);
      setCoordinates(null);
      setMessage('Your name and delivery details have been saved.');
    } catch (requestError) {
      setError(requestError.message || 'Your profile could not be saved.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitPaymentReference = async (event) => {
    event.preventDefault();
    const receiptFile = paymentSubmission.receiptFile;
    if (!receiptFile) {
      setError('Attach a payment receipt before submitting your transaction.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(receiptFile.type)
      || receiptFile.size > 5 * 1024 * 1024) {
      setError('Choose a JPG, PNG, WebP, or PDF receipt smaller than 5 MB.');
      return;
    }
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const order = paymentOrders.find((item) => item.id === paymentSubmission.orderId);
      const account = accounts.find((item) => String(item.id) === paymentSubmission.accountId);
      if (!order || !account || account.provider !== order.payment_method) {
        throw new Error('Choose an active account that matches this order’s payment method.');
      }
      const submission = await apiRequest(`/orders/${paymentSubmission.orderId}/payment-submissions`, {
        method: 'POST',
        body: {
          account_id: paymentSubmission.accountId,
          amount: Number(paymentSubmission.amount),
          transaction_reference: paymentSubmission.transactionReference,
          receipt_data_url: await readFileAsDataUrl(receiptFile),
          receipt_file_name: receiptFile.name,
          remarks: paymentSubmission.remarks,
        },
      });
      setRecentReceipt(makeReceipt(order, submission));
      setMessage('Transaction submitted for verification. Your receipt confirms submission, not payment approval.');
      setPaymentSubmission({ orderId: '', accountId: '', amount: '', transactionReference: '', receiptFile: null, remarks: '' });
      await loadStore();
    } catch (requestError) {
      setError(requestError.message || 'The transaction could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyAccountNumber = async (account) => {
    try {
      await navigator.clipboard.writeText(account.account_number);
      setMessage(`${account.display_name} account number copied.`);
    } catch {
      setError('Could not copy the account number. Select and copy it manually.');
    }
  };

  const placeOrder = async (event) => {
    event.preventDefault();
    if (!selectedPaymentAccount) {
      setError('No active company payment account is selected. Refresh the payment methods and try again.');
      return;
    }
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const deliveryAddress = [
        `Area: ${profile.area}`,
        `Street: ${profile.street}`,
        `Main road: ${profile.main_road}`,
        `Home number: ${profile.home_number}`,
        profile.delivery_notes ? `Directions: ${profile.delivery_notes}` : '',
      ].filter(Boolean).join(', ');
      const order = await apiRequest('/orders', {
        method: 'POST',
        body: {
          items: cartLines.map((item) => ({ product_id: item.id, quantity: item.cartQuantity })),
          delivery_address: deliveryAddress,
          customer_phone: profile.phone,
          payment_method: selectedPaymentMethod,
          payment_account_id: selectedPaymentAccount.id,
          latitude: coordinates?.latitude ?? profile.latitude ?? null,
          longitude: coordinates?.longitude ?? profile.longitude ?? null,
        },
      });
      setCart({});
      setSelectedPaymentAccountId('');
      setCoordinates(null);
      setLocationStatus('');
      setMessage(`Order ${order.id.slice(0, 8).toUpperCase()} placed. Track status below.`);
      setView('orders');
      await loadStore().catch((refreshError) => {
        setError(`Order placed successfully, but the page could not refresh: ${refreshError.message}`);
      });
    } catch (requestError) {
      setError(requestError.message || 'The order could not be placed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="storefront-shell">
      <aside className="storefront-sidebar">
        <a className="storefront-brand" href="/shop" aria-label="Rodas Market home"><span>R</span><strong>RODAS MARKET</strong></a>
        {view !== 'shop' && <button className="storefront-back-dashboard" type="button" onClick={() => setView('shop')}><span aria-hidden="true">←</span> Back to dashboard</button>}
        <p className="storefront-sidebar-caption">CUSTOMER PORTAL</p>
        <nav className="storefront-side-nav" aria-label="Customer navigation">
          <button type="button" className={view === 'shop' ? 'is-current' : ''} onClick={() => setView('shop')}><span>▦</span>Shop</button>
          <button type="button" className={view === 'orders' ? 'is-current' : ''} onClick={() => setView('orders')}><span>◷</span>My orders<small>{orders.length}</small></button>
          <button type="button" className={view === 'accounts' ? 'is-current' : ''} onClick={() => setView('accounts')}><span>▤</span>Payment methods</button>
          <button type="button" className={view === 'profile' ? 'is-current' : ''} onClick={() => setView('profile')}><span>◎</span>My profile</button>
        </nav>
        <div className="storefront-sidebar-user"><span className="storefront-avatar">{initials}</span><span><strong>{displayName}</strong><small>Customer</small></span></div>
        <button className="storefront-sidebar-logout" type="button" onClick={onLogout}><span aria-hidden="true">↪</span> Sign out</button>
      </aside>

      <div className="storefront-workspace">
      <main className="storefront">
      <section className="storefront-intro">
        <div>
          <p className="storefront-eyebrow">Super Double T General Trading</p>
          <h1>{view === 'shop' ? <>Welcome, {displayName.split(/\s+/)[0]}.<br /><em>Let's get your order started.</em></> : view === 'orders' ? <>Your orders,<br /><em>clearly tracked.</em></> : view === 'accounts' ? <>Company accounts.<br /><em>Payment made clear.</em></> : <>Your details.<br /><em>Delivery made easy.</em></>}</h1>
          <p>{view === 'shop' ? 'Choose your products, confirm where to deliver, and select a payment method. You can track every update in My orders.' : view === 'orders' ? 'Follow each order from confirmation through delivery.' : view === 'accounts' ? 'Use verified company account details, then submit your bank transaction reference for review.' : 'Keep your contact and delivery information ready for checkout.'}</p>
        </div>
        <div className="storefront-intro-mark" aria-hidden="true"><span>RD</span><small>MARKET<br />ADDIS ABABA</small></div>
      </section>

      {(message || error) && <div className={error ? 'storefront-alert storefront-alert-error' : 'storefront-alert'} role={error ? 'alert' : 'status'}>{error || message}</div>}

      {view === 'shop' ? (
        <>
        <section className="storefront-journey" aria-labelledby="storefront-journey-title">
          <div className="storefront-journey-heading">
            <div><p className="storefront-eyebrow">A simple checkout</p><h2 id="storefront-journey-title">Your order in 3 steps</h2></div>
            <span>{cartCount ? `${cartCount} item${cartCount === 1 ? '' : 's'} in your order` : 'Start with the products you need'}</span>
          </div>
          <div className="storefront-journey-steps">
            <button type="button" className="storefront-journey-step" aria-controls="customer-catalog" onClick={() => { setCategory('All'); setSearch(''); document.getElementById('customer-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              <span className="storefront-journey-number">1</span><span className="storefront-journey-copy"><strong>Choose products</strong><small>{cartCount ? `${cartCount} selected · add or change quantities any time` : 'Browse the catalog and add items to your order'}</small></span><span className="storefront-journey-arrow" aria-hidden="true">↓</span>
            </button>
            <button type="button" className="storefront-journey-step" onClick={() => setView('profile')}>
              <span className="storefront-journey-number">2</span><span className="storefront-journey-copy"><strong>Confirm delivery</strong><small>{profileComplete ? `Ready for ${profile.area}` : 'Add your phone number and delivery address'}</small></span><span className={`storefront-journey-state${profileComplete ? ' is-ready' : ''}`}>{profileComplete ? 'Ready' : 'Needed'}</span>
            </button>
            <button type="button" className="storefront-journey-step" aria-controls={cartCount ? 'customer-payment-setup' : 'customer-catalog'} onClick={goToPaymentOptions}>
              <span className="storefront-journey-number">3</span><span className="storefront-journey-copy"><strong>Choose payment</strong><small>{!cartCount ? 'Add a product first; payment choices will appear in your order summary' : selectedPaymentAccount ? `${getAccountTitle(selectedPaymentAccount)} selected · pay after placing your order` : 'Choose a company account in your order summary'}</small></span><span className="storefront-journey-arrow" aria-hidden="true">↓</span>
            </button>
          </div>
        </section>
        <div className="storefront-layout">
          <section className="storefront-products" id="customer-catalog" aria-label="Available products">
            <div className="storefront-section-heading"><div><p className="storefront-eyebrow">The catalog</p><h2>Available products</h2></div><div className="storefront-catalog-actions"><span>{visibleProducts.length} items</span><button type="button" className="storefront-refresh" onClick={refreshCatalog} disabled={refreshingCatalog}>{refreshingCatalog ? 'Refreshing…' : 'Refresh products'}</button></div></div>
            <div className="storefront-filters">
              <label className="storefront-search"><span aria-hidden="true">⌕</span><input aria-label="Search products" placeholder="Search products" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
              <div className="storefront-categories" aria-label="Filter by category">{categories.map((item) => <button type="button" key={item} className={category === item ? 'is-selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
            </div>
            {loading ? <p className="storefront-empty">Loading available products...</p> : visibleProducts.length === 0 ? catalog.length === 0 ? <div className="storefront-empty storefront-catalog-empty"><strong>No available products right now</strong><span>There are no in-stock items to order. Refresh the catalog to check for new products.</span></div> : <p className="storefront-empty">No available products match this search.</p> : (
              <div className="storefront-product-grid">
                {visibleProducts.map((product, index) => (
                  <article className="storefront-product" key={product.id}>
                    <div className={`storefront-product-art art-${index % 4}`}><span>{cleanCatalogText(product.name || 'P').slice(0, 1).toUpperCase()}</span><small>{product.category || 'GENERAL'}</small></div>
                    <div className="storefront-product-info"><span className="storefront-category-label">{product.category || 'General'}</span><h3>{cleanCatalogText(product.name)}</h3>{cleanCatalogText(product.description) && <p className="storefront-product-description">{cleanCatalogText(product.description)}</p>}{product.sku && <small>SKU {product.sku}</small>}<div className="storefront-product-foot"><strong>{formatAmount(product.unit_price)}</strong><button type="button" onClick={() => addToCart(product)} disabled={(cart[product.id] || 0) >= Number(product.quantity)}>{cart[product.id] ? 'Add one more' : 'Add to order'}</button></div><p className="storefront-stock">{cart[product.id] ? `${cart[product.id]} in your order · ` : ''}{product.quantity} available</p></div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="storefront-cart" id="customer-order-summary" aria-label="Your order">
            <div className="storefront-cart-heading"><div><p className="storefront-eyebrow">Your selection</p><h2>Order summary</h2></div><span>{cartCount}</span></div>
            {cartLines.length === 0 ? <p className="storefront-cart-empty">Your order is empty. Add a product to get started.</p> : <>
              <ul className="storefront-cart-lines">{cartLines.map((item) => <li key={item.id}><div><strong>{item.name}</strong><span>{formatAmount(item.unit_price)} each</span></div><div className="storefront-quantity"><button type="button" aria-label={`Remove one ${item.name}`} onClick={() => changeQuantity(item.id, -1)}>−</button><span>{item.cartQuantity}</span><button type="button" aria-label={`Add one ${item.name}`} onClick={() => addToCart(item)} disabled={item.cartQuantity >= Number(item.quantity)}>+</button></div><strong className="storefront-line-total">{formatAmount(item.lineTotal)}</strong></li>)}</ul>
              <div className="storefront-total"><span>Order total</span><strong>{formatAmount(cartTotal)}</strong></div>
              <form className="storefront-checkout" onSubmit={placeOrder}>
                <h3>Delivery and payment</h3>
                <button type="button" className="storefront-location" onClick={captureLocation}>{checkoutCoordinates ? '✓ Delivery pin captured' : '◎ Add GPS delivery pin'}</button>
                {locationStatus && <p className="storefront-location-status" role="status">{locationStatus}</p>}
                {checkoutCoordinates && <><p className="storefront-coordinates">{checkoutCoordinates.latitude}, {checkoutCoordinates.longitude}</p><a className="storefront-map-link" href={`https://www.google.com/maps?q=${checkoutCoordinates.latitude},${checkoutCoordinates.longitude}`} target="_blank" rel="noreferrer">Preview delivery pin on map ↗</a></>}
                <fieldset className="storefront-payment storefront-checkout-payment" id="customer-payment-setup">
                  <legend>Choose where to pay</legend>
                  <p>Select a company account. After placing your order, pay the exact total and submit your transfer reference under My orders.</p>
                  {accounts.length ? (
                    <>
                      <div className="storefront-payment-method-buttons" role="group" aria-label="Payment method">
                        {availablePaymentGroups.map((group) => {
                          const method = paymentMethods.find((item) => item.id === group.id);
                          return (
                            <button
                              type="button"
                              key={group.id}
                              className={`storefront-payment-method-button${selectedPaymentMethod === group.id ? ' is-selected' : ''}`}
                              aria-pressed={selectedPaymentMethod === group.id}
                              onClick={() => setSelectedPaymentAccountId(String(group.accounts[0].id))}
                            >
                              <span className={`payment-mark ${method?.tone || 'blue'}`}>{method?.mark || 'B'}</span>
                              <span>{method?.label || group.title}<small>{group.accounts.length} {group.accounts.length === 1 ? 'account' : 'accounts'}</small></span>
                            </button>
                          );
                        })}
                      </div>
                      {selectedPaymentGroup && (
                        <fieldset className="storefront-payment storefront-payment-method-group">
                          <legend>Select a {selectedPaymentGroup.title} account</legend>
                          <p>{selectedPaymentGroup.description}</p>
                          <div className="storefront-payment-account-options">
                            {selectedPaymentGroup.accounts.map((account) => {
                              const method = paymentMethods.find((item) => item.id === account.provider);
                              const isSelected = String(selectedPaymentAccount?.id) === String(account.id);
                              return (
                                <label key={account.id} className={isSelected ? 'is-picked' : ''}>
                                  <input
                                    type="radio"
                                    name="paymentAccount"
                                    value={account.id}
                                    checked={isSelected}
                                    onChange={(event) => setSelectedPaymentAccountId(event.target.value)}
                                  />
                                  <span className={`payment-mark ${method?.tone || 'blue'}`}>{method?.mark || 'B'}</span>
                                  <span className="storefront-payment-account-copy">
                                    <strong>{getAccountTitle(account)}{getAccountTitle(account) !== account.display_name ? ` · ${account.display_name}` : ''}</strong>
                                    <small>Account name: {account.account_name}</small>
                                    <small>{account.provider === 'telebirr' ? 'Mobile number' : 'Account number'}: {account.account_number}</small>
                                    {account.instructions && <small>{account.instructions}</small>}
                                  </span>
                                  <span className="storefront-payment-account-action">{isSelected ? 'Selected' : 'Choose'}</span>
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      )}
                    </>
                  ) : (
                    <div className="storefront-payment-unavailable">
                      <strong>No payment accounts are available yet</strong>
                      <p>The company has not published a Telebirr, CBE, or bank account. Refresh the payment methods and try again.</p>
                      <button type="button" className="storefront-refresh" onClick={refreshPaymentAccounts} disabled={refreshingAccounts}>
                        {refreshingAccounts ? 'Refreshing…' : 'Refresh payment accounts'}
                      </button>
                    </div>
                  )}
                  {selectedPaymentAccount && <p className="storefront-payment-selected" role="status">Selected: <strong>{getAccountTitle(selectedPaymentAccount)} · {selectedPaymentAccount.display_name}</strong>. Order total to pay: {formatAmount(cartTotal)}.</p>}
                </fieldset>
                {!profileComplete && <div className="storefront-profile-required"><span>Add your phone, area, street, main road, and home number before checkout.</span><button type="button" onClick={() => setView('profile')}>Complete profile</button></div>}
                {profileComplete && <div className="storefront-checkout-address"><strong>Delivering to {profile.full_name || displayName}</strong><span>{profile.phone} · {profile.area}, {profile.street}, {profile.main_road}, home {profile.home_number}</span><button type="button" onClick={() => setView('profile')}>Edit delivery details</button></div>}
                <button type="submit" className="storefront-place-order" disabled={submitting || !cartLines.length || !profileComplete || !selectedPaymentAccount}>{submitting ? 'Placing order...' : 'Place order · ' + formatAmount(cartTotal)}</button>
                <p className="storefront-secure-note">Your final price and stock are checked by the server before the order is confirmed.</p>
              </form>
            </>}
          </aside>
        </div>
        </>
      ) : view === 'orders' ? (
        <section className="storefront-orders">
          <div className="storefront-section-heading"><div><p className="storefront-eyebrow">Order history</p><h2>Track your orders</h2></div><button type="button" className="storefront-refresh" onClick={() => loadStore().catch((requestError) => setError(requestError.message))}>Refresh</button></div>
          {loading ? <p className="storefront-empty">Loading your orders...</p> : orders.length === 0 ? <div className="storefront-no-orders"><strong>No orders yet</strong><p>Your order updates will appear here after checkout.</p><button type="button" onClick={() => setView('shop')}>Browse products</button></div> : <div className="storefront-order-list">{orders.map((order) => (
            <article className="storefront-order" key={order.id}>
              <header><div><span className="storefront-eyebrow">Order {order.id.slice(0, 8).toUpperCase()}</span><h3>{statusLabels[order.status] || order.status}</h3></div><time>{new Date(order.created_at).toLocaleString()}</time></header>
              {order.status === 'cancelled' ? <p className="storefront-cancelled">This order was cancelled. Contact support if you need help.</p> : <div className="storefront-progress">{['placed', 'accepted', 'preparing', 'out_for_delivery', 'delivered'].map((step, index) => { const currentIndex = ['placed', 'accepted', 'preparing', 'out_for_delivery', 'delivered'].indexOf(order.status); return <div className={index <= currentIndex ? 'is-done' : ''} key={step}><span>{index + 1}</span><small>{statusLabels[step]}</small></div>; })}</div>}
              <ul className="storefront-order-items">{(order.items || []).map((item, index) => <li key={`${item.product_name}-${index}`}><span>{item.quantity} × {item.product_name}</span><strong>{formatAmount(item.line_total)}</strong></li>)}</ul>
              <footer><span>{getPaymentMethodLabel(order)} · {getCustomerPaymentStatus(order)}</span><strong>{formatAmount(order.total_amount)}</strong></footer>
              {order.payment_account_number && <p className="storefront-delivery-address">Pay to {order.payment_account_name} · {order.payment_account_number}</p>}
              <p className="storefront-delivery-address">Deliver to: {order.delivery_address} · {order.customer_phone}</p>
              {order.latitude != null && order.longitude != null && <a className="storefront-map-link" href={`https://www.google.com/maps?q=${order.latitude},${order.longitude}`} target="_blank" rel="noreferrer">Open delivery pin in map ↗</a>}
              {order.payment_reference && <p className="storefront-delivery-address">Payment reference: {order.payment_reference}</p>}
              {order.payment_status !== 'paid' && order.status !== 'cancelled'
                && !(order.payment_submissions || []).some((submission) => submission.status === 'pending') && (
                <button type="button" className="storefront-submit-payment" onClick={() => startPaymentSubmission(order)}>
                  {order.payment_status === 'failed' ? 'Resubmit payment details' : 'Submit payment details'}
                </button>
              )}
              {(order.payment_submissions || []).map((submission) => (
                <div className="storefront-payment-history" key={submission.id}>
                  <span>Transfer {submission.transaction_reference} · {formatAmount(submission.amount)} · {submission.status} · {new Date(submission.submitted_at).toLocaleString()}</span>
                  {submission.receipt_file_name && <small>Proof attached: {submission.receipt_file_name}</small>}
                  {submission.remarks && <small>Your note to the finance team: {submission.remarks}</small>}
                  <button type="button" onClick={() => setReceiptToPrint(makeReceipt(order, submission))}>Print transaction receipt</button>
                </div>
              ))}
            </article>
          ))}</div>}
        </section>
      ) : view === 'accounts' ? (
        <section className="storefront-orders storefront-accounts-view">
          <div className="storefront-section-heading"><div><p className="storefront-eyebrow">Company payment details</p><h2>Verified company accounts</h2></div><button type="button" className="storefront-refresh" onClick={refreshPaymentAccounts} disabled={refreshingAccounts}>{refreshingAccounts ? 'Refreshing…' : 'Refresh accounts'}</button></div>
          {accounts.length === 0 ? <div className="storefront-empty">Verified company payment accounts are not configured yet. Online orders require payment before dispatch; please check again after the company publishes its Telebirr, CBE, or bank details.</div> : <div className="storefront-account-grid">{accounts.map((account, index) => {
            const accountMatchesOrder = !selectedPaymentOrder || (
              account.provider === selectedPaymentOrder.payment_method
              && (!selectedPaymentOrder.payment_account_id || String(account.id) === String(selectedPaymentOrder.payment_account_id))
            );
            const isChosen = String(account.id) === paymentSubmission.accountId;
            return (
              <article className={`storefront-company-account provider-${account.provider} account-tone-${index % 6}${isChosen ? ' is-chosen' : ''}`} key={account.id}>
                <span className={`payment-mark ${account.provider === 'cbe' ? 'green' : account.provider === 'other_bank' ? 'blue' : 'violet'}`}>{account.provider === 'telebirr' ? 'T' : account.provider === 'cbe' ? 'C' : 'B'}</span>
                <p className="storefront-eyebrow">{getAccountTitle(account)}</p>
                <h3>{account.display_name}</h3>
                <dl><div><dt>Account holder</dt><dd>{account.account_name}</dd></div><div><dt>{account.provider === 'telebirr' ? 'Registered mobile number' : 'Account number'}</dt><dd>{account.account_number}</dd></div></dl>
                {account.instructions && <p>{account.instructions}</p>}
                <div className="storefront-company-account-actions">
                  <button className="storefront-copy-account" type="button" onClick={() => copyAccountNumber(account)}>{account.provider === 'telebirr' ? 'Copy mobile number' : 'Copy account number'}</button>
                  <button className="storefront-use-account" type="button" disabled={!accountMatchesOrder} aria-pressed={isChosen} onClick={() => {
                    setPaymentSubmission((current) => ({ ...current, accountId: String(account.id) }));
                    document.getElementById('selected-company-account')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}>{isChosen ? 'Selected account' : 'Select this account'}</button>
                </div>
              </article>
            );
          })}</div>}
          {selectedSubmissionAccount && (
            <section className={`storefront-account-detail provider-${selectedSubmissionAccount.provider}`} id="selected-company-account" aria-live="polite">
              <div className="storefront-account-detail-heading">
                <div><p className="storefront-eyebrow">Payment account selected</p><h3>{selectedSubmissionAccount.display_name}</h3></div>
                <span className="storefront-account-verified">Company account</span>
              </div>
              <dl>
                <div><dt>Account holder</dt><dd>{selectedSubmissionAccount.account_name}</dd></div>
                <div><dt>{selectedSubmissionAccount.provider === 'telebirr' ? 'Registered mobile number' : 'Account number'}</dt><dd>{selectedSubmissionAccount.account_number}</dd></div>
                {selectedSubmissionAccount.instructions && <div><dt>Payment instructions</dt><dd>{selectedSubmissionAccount.instructions}</dd></div>}
              </dl>
              <div className="storefront-account-detail-actions">
                <button type="button" className="storefront-copy-account" onClick={() => copyAccountNumber(selectedSubmissionAccount)}>
                  {selectedSubmissionAccount.provider === 'telebirr' ? 'Copy mobile number' : 'Copy account number'}
                </button>
                {paymentOrders.length ? (
                  <button type="button" className="storefront-use-account" onClick={() => document.getElementById('payment-submission-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                    Continue to upload proof &amp; submit
                  </button>
                ) : (
                  <button type="button" className="storefront-use-account" onClick={() => setView('shop')}>Place an order to continue</button>
                )}
              </div>
              {!paymentOrders.length && <p className="storefront-account-order-note">You can choose and copy a company account now. To upload payment proof, add remarks, and submit a transaction, first place an order so the payment can be matched to its total.</p>}
            </section>
          )}
          <div className="storefront-submit-transaction">
            <div><p className="storefront-eyebrow">Already transferred?</p><h2>Submit your transaction</h2><p>Enter the exact order total and bank reference. Finance will review it before confirming payment.</p></div>
            {paymentOrders.length === 0 ? <p className="storefront-empty">{orders.length === 0 ? 'Place an order before submitting a payment transaction.' : ordersAwaitingReview ? 'Your submitted transaction is awaiting Finance review. You can view or print its receipt from My orders.' : 'There are no unpaid orders available for payment submission.'}</p> : accounts.length === 0 ? <p className="storefront-empty">Verified company accounts must be added before you can submit a transfer reference.</p> : <form id="payment-submission-form" className="storefront-payment-form" onSubmit={submitPaymentReference}>
              <label>Order<select required value={paymentSubmission.orderId} onChange={(event) => {
                const order = paymentOrders.find((item) => item.id === event.target.value);
                const matchedAccounts = accounts.filter((account) => order && account.provider === order.payment_method
                  && (!order.payment_account_id || String(account.id) === String(order.payment_account_id)));
                const account = matchedAccounts.find((item) => String(item.id) === paymentSubmission.accountId) || matchedAccounts[0];
                setPaymentSubmission((current) => ({
                  ...current, orderId: event.target.value, accountId: account ? String(account.id) : '',
                  amount: order ? Number(order.total_amount).toFixed(2) : '', transactionReference: '',
                  receiptFile: null, remarks: '',
                }));
              }}><option value="">Select an unpaid order</option>{paymentOrders.map((order) => <option key={order.id} value={order.id}>{order.id.slice(0, 8).toUpperCase()} · {getPaymentMethodLabel(order)} · {formatAmount(order.total_amount)} · {statusLabels[order.status]}</option>)}</select></label>
              {selectedPaymentOrder && paymentAccountsForOrder.length === 0 && <p className="storefront-payment-note">The selected company account is no longer active. Contact the company to arrange payment before submitting your transfer.</p>}
              {selectedSubmissionAccount && <div className="storefront-selected-payment-account">
                <div><span className="storefront-eyebrow">Selected account · {getAccountTitle(selectedSubmissionAccount)}</span><strong>{selectedSubmissionAccount.account_name}</strong><span>{selectedSubmissionAccount.account_number}</span></div>
                <button type="button" className="storefront-copy-account" onClick={() => copyAccountNumber(selectedSubmissionAccount)}>Copy account number</button>
              </div>}
              <div className="storefront-fields-two"><label>Amount (ETB)<input type="number" min="0.01" step="0.01" required value={paymentSubmission.amount} onChange={(event) => setPaymentSubmission({ ...paymentSubmission, amount: event.target.value })} /></label><label>Transaction reference<input required minLength="3" maxLength="100" value={paymentSubmission.transactionReference} onChange={(event) => setPaymentSubmission({ ...paymentSubmission, transactionReference: event.target.value })} placeholder="Bank receipt/reference number" /></label></div>
              <label>Upload payment proof<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required onChange={(event) => setPaymentSubmission({ ...paymentSubmission, receiptFile: event.target.files?.[0] || null })} /><small>JPG, PNG, WebP, or PDF · maximum 5 MB</small></label>
              <label>Remarks for the admin<textarea maxLength="1000" rows="3" value={paymentSubmission.remarks} onChange={(event) => setPaymentSubmission({ ...paymentSubmission, remarks: event.target.value })} placeholder="Add a note to help the finance team verify this payment (optional)" /><small>{paymentSubmission.remarks.length}/1,000 characters</small></label>
              <button className="storefront-place-order" type="submit" disabled={submitting || !selectedPaymentOrder || !paymentSubmission.accountId || !paymentSubmission.receiptFile || paymentAccountsForOrder.length === 0}>{submitting ? 'Submitting...' : 'Submit payment for review'}</button>
            </form>}
            {recentReceipt && <div className="storefront-receipt-ready" role="status"><strong>Transaction submitted successfully</strong><span>Receipt {recentReceipt.id.slice(0, 8).toUpperCase()} · {formatAmount(recentReceipt.amount)} · Pending verification</span><button type="button" onClick={() => setReceiptToPrint(recentReceipt)}>Print transaction receipt</button></div>}
          </div>
        </section>
      ) : (
        <section className="storefront-orders storefront-profile-view">
          <div className="storefront-section-heading"><div><p className="storefront-eyebrow">Personal information</p><h2>Customer and delivery profile</h2></div></div>
          <form className="storefront-profile-form" onSubmit={saveProfile}>
            <label>Full name<input required maxLength="100" autoComplete="name" value={profileForm.full_name} onChange={(event) => setProfileForm({ ...profileForm, full_name: event.target.value })} /></label>
            <label>Phone number<input required minLength="5" maxLength="40" type="tel" autoComplete="tel" value={profileForm.phone} onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })} placeholder="+251 ..." /></label>
            <label>Area / neighborhood<input required maxLength="120" value={profileForm.area} onChange={(event) => setProfileForm({ ...profileForm, area: event.target.value })} placeholder="Neighborhood or sub-city" /></label>
            <label>Street<input required maxLength="120" value={profileForm.street} onChange={(event) => setProfileForm({ ...profileForm, street: event.target.value })} placeholder="Street name or number" /></label>
            <label>Main road<input required maxLength="120" value={profileForm.main_road} onChange={(event) => setProfileForm({ ...profileForm, main_road: event.target.value })} placeholder="Nearest main road" /></label>
            <label>Home number<input required maxLength="80" value={profileForm.home_number} onChange={(event) => setProfileForm({ ...profileForm, home_number: event.target.value })} placeholder="House or building number" /></label>
            <label className="storefront-profile-wide">Delivery directions<textarea maxLength="500" rows="3" value={profileForm.delivery_notes} onChange={(event) => setProfileForm({ ...profileForm, delivery_notes: event.target.value })} placeholder="Landmark, floor, gate, or helpful directions" /></label>
            <div className="storefront-profile-wide"><button className="storefront-location" type="button" onClick={captureLocation}>{profileForm.latitude != null ? '✓ GPS delivery pin saved' : '◎ Add GPS delivery pin'}</button>{locationStatus && <p className="storefront-location-status">{locationStatus}</p>}{profileForm.latitude != null && <p className="storefront-coordinates">{profileForm.latitude}, {profileForm.longitude}</p>}</div>
            <div className="storefront-profile-wide"><button type="submit" className="storefront-place-order" disabled={submitting}>{submitting ? 'Saving profile...' : 'Save profile and delivery details'}</button></div>
          </form>
        </section>
      )}

      {receiptToPrint && (
        <section className="storefront-receipt-print" aria-label="Transaction receipt">
          <header><span className="storefront-receipt-brand">R</span><div><strong>RODAS MARKET</strong><span>Super Double T General Trading</span></div><span className="storefront-receipt-status">{receiptToPrint.status === 'paid' ? 'PAYMENT VERIFIED' : receiptToPrint.status === 'failed' ? 'PAYMENT REJECTED' : 'PENDING VERIFICATION'}</span></header>
          <h1>Transaction submission receipt</h1>
          <p className="storefront-receipt-disclaimer">{receiptToPrint.status === 'paid' ? 'Payment has been verified by the company.' : receiptToPrint.status === 'failed' ? 'This transaction was not approved. Contact the company for help.' : 'This receipt confirms that your transaction reference was submitted. It is not proof of payment approval.'}</p>
          <dl>
            <div><dt>Receipt number</dt><dd>{receiptToPrint.id.toUpperCase()}</dd></div>
            <div><dt>Order number</dt><dd>{receiptToPrint.orderId.toUpperCase()}</dd></div>
            <div><dt>Submitted</dt><dd>{new Date(receiptToPrint.submitted_at).toLocaleString()}</dd></div>
            <div><dt>Payment method</dt><dd>{paymentMethods.find((method) => method.id === receiptToPrint.provider)?.label || receiptToPrint.provider}</dd></div>
            <div><dt>Company account</dt><dd>{receiptToPrint.payment_account_display_name || 'Company account'}{receiptToPrint.payment_account_name ? ` · ${receiptToPrint.payment_account_name}` : ''}</dd></div>
            {receiptToPrint.payment_account_number && <div><dt>Account number</dt><dd>{receiptToPrint.payment_account_number}</dd></div>}
            <div><dt>Transaction reference</dt><dd>{receiptToPrint.transaction_reference}</dd></div>
            <div><dt>Customer</dt><dd>{receiptToPrint.customerName} · {receiptToPrint.customerEmail}</dd></div>
            {receiptToPrint.customerPhone && <div><dt>Phone</dt><dd>{receiptToPrint.customerPhone}</dd></div>}
          </dl>
          <div className="storefront-receipt-total"><span>Amount submitted</span><strong>{formatAmount(receiptToPrint.amount)}</strong></div>
          <p className="storefront-receipt-footnote">Order total: {formatAmount(receiptToPrint.orderTotal)}. Keep this receipt and your bank/Telebirr confirmation for reference.</p>
        </section>
      )}

      <footer className="storefront-footer"><span>RODAS MARKET · Super Double T General Trading</span><span>Need help with an order? Contact our customer service team.</span></footer>
      </main>
      </div>
    </div>
  );
}