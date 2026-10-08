import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './App.css';
import AdminDashboard from './admin/AdminDashboard.jsx';
import Login from './security/login.jsx';
import UserDashboard from './UserDashboard.jsx';
import CustomerStorefront from './customer/CustomerStorefront.jsx';
import NotificationProvider from './notifications/NotificationProvider.jsx';

const adminPaths = ['/admin', '/admin-login'];
const isAdminRoute = adminPaths.includes(window.location.pathname);
const isCustomerRoute = window.location.pathname === '/shop';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <NotificationProvider>
      <Login role={isAdminRoute ? 'admin' : isCustomerRoute ? 'customer' : 'user'}>
        {isAdminRoute ? <AdminDashboard /> : isCustomerRoute ? <CustomerStorefront /> : <UserDashboard />}
      </Login>
    </NotificationProvider>
  </StrictMode>
);
