import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';
import sdtLogo from '../assets/sdt-eagle-logo.png';
import './login.css';

export default function Login({ children, role = 'user' }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let mounted = true;
    apiRequest('/auth/me')
      .then(({ user: currentUser }) => {
        if (mounted) setUser(currentUser);
      })
      .catch((error) => {
        if (mounted) setErrorMsg(error.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    try {
      const result = await apiRequest(isSigningUp && role === 'customer' ? '/auth/customer/register' : '/auth/login', {
        method: 'POST',
        body: isSigningUp && role === 'customer' ? { full_name: fullName, email, password } : { email, password },
      });
      const account = result.user;
      const hasExpectedRole = role === 'admin'
        ? account.role === 'admin'
        : role === 'customer'
          ? account.role === 'customer'
          : !['admin', 'customer'].includes(account.role);
      if (!hasExpectedRole) {
        await apiRequest('/auth/logout', { method: 'POST' });
        setErrorMsg(role === 'admin'
          ? 'This account is not authorized to access the admin dashboard.'
          : role === 'customer'
            ? 'This account is not a customer account. Use the customer registration or sign in with a customer account.'
            : 'Customer and administrator accounts must use their own login page.');
        return;
      }
      setUser(account);
    } catch (error) {
      setErrorMsg(error.message);
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setEmail('');
      setPassword('');
      setFullName('');
      setShowPassword(false);
      setIsSigningUp(false);
      setErrorMsg('');
    }
  };

  if (loading) {
    return (
      <div style={guardStyles.centered}>
        <p>Loading session...</p>
      </div>
    );
  }

  if (user) {
    const canAccessPortal = role === 'admin'
      ? user.role === 'admin'
      : role === 'customer'
        ? user.role === 'customer'
        : !['admin', 'customer'].includes(user.role);
    if (!canAccessPortal) {
      return (
        <div style={guardStyles.centered}>
          <div style={guardStyles.card}>
            <h2 style={{ marginTop: 0, color: '#1e293b' }}>Different account type</h2>
            <p style={{ color: '#64748b', lineHeight: 1.5 }}>Sign out to access the {role === 'customer' ? 'customer shop' : role === 'admin' ? 'admin dashboard' : 'staff workspace'} with the right account.</p>
            <button type="button" onClick={handleLogout} style={guardStyles.submitBtn}>Sign out</button>
          </div>
        </div>
      );
    }
    return (
      React.isValidElement(children)
        ? React.cloneElement(children, { user, onLogout: handleLogout })
        : children
    );
  }

  return (
    <div className="login-auth-shell" style={guardStyles.authShell}>
      <header className="login-brand-panel" style={guardStyles.leftPanel}>
        <div style={guardStyles.pattern} />
        <div style={guardStyles.leftContent}>
          <img className="login-brand-logo" src={sdtLogo} alt="Super Double T logo" decoding="async" />

          <div style={guardStyles.strapline}>
            We Trust In God!!! <span style={guardStyles.strapAccent}>✦</span>
          </div>

          <div className="login-blessing" style={guardStyles.blessing}>እግዚአብሔር ይባረክ!!!</div>

          <div style={guardStyles.brandWord}>SDT</div>
          <div style={guardStyles.companyName}>SUPER DOUBLE T</div>
          <div style={guardStyles.companyTag}>GENERAL TRADING PLC</div>
        </div>
      </header>

      <div className="login-form-panel" style={guardStyles.rightPanel}>
        <div style={guardStyles.loginCard}>
          {errorMsg && (
            <div style={guardStyles.errorBox}>
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleAuth} style={guardStyles.form}>
            {role === 'customer' && isSigningUp && (
              <input
                type="text"
                placeholder="Full name"
                autoComplete="name"
                maxLength={100}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
                style={guardStyles.input}
              />
            )}

            <label htmlFor="login-email" style={guardStyles.fieldLabel}>Email</label>
            <div style={guardStyles.inputWrap}>
              <span style={guardStyles.fieldIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="28" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="28" height="14" rx="2" />
                  <path d="m3 7 9 6 9-6" />
                </svg>
              </span>
              <input
                id="login-email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={guardStyles.inputField}
              />
            </div>

            <label htmlFor="login-password" style={guardStyles.fieldLabel}>Password</label>
            <div style={guardStyles.inputWrap}>
              <span style={guardStyles.fieldIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="28" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="10" width="28" height="11" rx="2" />
                  <path d="M8 10V7a4 4 0 1 1 8 0v3" />
                </svg>
              </span>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                minLength={isSigningUp ? 6 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={guardStyles.inputField}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                style={guardStyles.passwordToggle}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '◉' : '◌'}
              </button>
            </div>

            <button type="submit" className="login-submit-button" style={guardStyles.submitBtn}>
              {isSigningUp ? 'Create customer account' : role === 'admin' ? 'Admin Log In' : role === 'customer' ? 'Customer log in' : 'Login'}
              <span style={guardStyles.submitArrow}>→</span>
            </button>
          </form>

          {role === 'customer' && (
            <button type="button" className="login-account-toggle" onClick={() => setIsSigningUp((current) => !current)}>
              {isSigningUp ? 'Already have an account? Log in' : 'Create a customer account'}
            </button>
          )}

          <div className="login-footer-links" style={guardStyles.footerLinks}>
            <a className="login-footer-link" href={role === 'admin' ? '/login' : role === 'customer' ? '/login' : '/admin-login'}>
              {role === 'admin' ? 'Staff login' : role === 'customer' ? 'Staff login' : 'Administrator login'}
            </a>
            {role === 'user' && <a className="login-footer-link" href="/shop">Customer shop and account</a>}
          </div>

          <div style={guardStyles.metaFooter}>
            © 2026 Super Double T General Trading PLC. All rights reserved.
            <div style={guardStyles.metaRow}>
              <span>Privacy Policy</span>
              <span>|</span>
              <span>Terms of Use</span>
              <span>|</span>
              <span>Support</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const guardStyles = {
  centered: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#0f172a',
    fontFamily: 'Segoe UI, sans-serif',
    color: '#f8fafc'
  },
  card: {
    background: '#ffffff',
    padding: '2.5rem 2.25rem',
    borderRadius: '16px',
    boxShadow: '0 10px 28px rgba(15, 23, 42, 0.18)',
    width: '100%',
    maxWidth: '520px'
  },
  authShell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    width: 'min(904px, calc(100% - 32px))',
    minHeight: 'auto',
    margin: '24px auto',
    padding: '0',
    overflow: 'hidden',
    border: '2px solid #b48a36',
    borderRadius: '22px',
    background: '#ffffff',
    boxShadow: '0 0 0 2px #fff, 0 0 0 4px #b48a36, 0 18px 48px rgba(32, 51, 74, 0.16)',
    boxSizing: 'border-box',
    fontFamily: 'Segoe UI, sans-serif',
    color: '#0f172a'
  },
  leftPanel: {
    position: 'relative',
    width: '100%',
    maxWidth: 'none',
    minHeight: 'auto',
    background: '#20334a',
    borderBottom: '1px solid rgba(209, 173, 90, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  pattern: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1.3px)',
    backgroundSize: '28px 28px',
    opacity: 0.4
  },
  leftContent: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 'none',
    padding: '26px 24px 22px',
    color: '#f8e7b6',
    textAlign: 'center'
  },
  strapline: {
    fontSize: '0.98rem',
    fontWeight: 700,
    letterSpacing: '0.02em',
    marginBottom: '5px',
    color: '#f2d98d',
    fontStyle: 'italic'
  },
  blessing: {
    color: '#fff1c8',
    fontSize: '1.1rem',
    fontWeight: 800,
    letterSpacing: '0.035em',
    marginBottom: '10px'
  },
  strapAccent: {
    color: '#f7d674'
  },
  logo: {
    width: '180px',
    maxWidth: '90%',
    display: 'block',
    margin: '0 auto 10px',
    filter: 'drop-shadow(0 8px 20px rgba(220, 180, 94, 0.18))'
  },
  brandWord: {
    fontSize: '3.4rem',
    fontWeight: 900,
    letterSpacing: '-0.08em',
    lineHeight: 1,
    color: '#f1d98f',
    marginBottom: '8px',
    fontFamily: 'Segoe UI, sans-serif'
  },
  companyName: {
    fontSize: '2rem',
    fontWeight: 800,
    letterSpacing: '-0.04em',
    color: '#f5e8bb',
    lineHeight: 1.1,
    marginBottom: '4px'
  },
  companyTag: {
    letterSpacing: '0.32em',
    textTransform: 'uppercase',
    color: '#d9bf69',
    fontSize: '0.9rem',
    opacity: 0.86
  },
  rightPanel: {
    minHeight: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    padding: '0'
  },
  loginCard: {
    background: '#ffffff',
    border: 'none',
    boxShadow: 'none',
    borderRadius: '0',
    width: '100%',
    maxWidth: 'none',
    boxSizing: 'border-box',
    minHeight: 'auto',
    padding: '32px clamp(28px, 6vw, 52px)',
    position: 'relative'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.7rem'
  },
  fieldLabel: {
    display: 'block',
    fontSize: '1rem',
    color: '#1f2937',
    fontWeight: 800,
    marginTop: '6px',
    marginBottom: '4px'
  },
  inputWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center'
  },
  fieldIcon: {
    position: 'absolute',
    left: '14px',
    color: '#8b8b85',
    zIndex: 1
  },
  input: {
    width: '100%',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    padding: '14px 16px',
    fontSize: '1rem',
    marginBottom: '6px',
    background: '#fff',
    color: '#111827'
  },
  inputField: {
    width: '100%',
    borderRadius: '12px',
    border: '2px solid #9b7b32',
    backgroundColor: '#f3f1eb',
    color: '#111827',
    minHeight: '56px',
    fontSize: '1rem',
    padding: '0.85rem 3rem 0.85rem 2.8rem',
    boxSizing: 'border-box',
    outline: 'none'
  },
  passwordToggle: {
    position: 'absolute',
    right: '14px',
    background: 'transparent',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    fontSize: '1.2rem',
    padding: '4px 6px'
  },
  submitBtn: {
    marginTop: '12px',
    minHeight: '54px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(180deg, #f0d380 0%, #d9b65b 100%)',
    color: '#1a1a1a',
    fontWeight: 800,
    fontSize: '1.1rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    boxShadow: '0 8px 18px rgba(196, 146, 44, 0.28)'
  },
  submitArrow: {
    fontSize: '1.5rem',
    lineHeight: 1,
    transform: 'translateY(-1px)'
  },
  footerLinks: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '6px',
    marginTop: '12px'
  },
  metaFooter: {
    marginTop: '26px',
    textAlign: 'center',
    color: '#7b7b7b',
    fontSize: '0.8rem',
    lineHeight: 1.8
  },
  metaRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '4px',
    color: '#7a7a7a'
  },
  errorBox: {
    background: '#fff1f2',
    color: '#b91c1c',
    border: '1px solid #fecdd3',
    padding: '0.8rem 0.9rem',
    borderRadius: '8px',
    marginBottom: '1rem',
    fontSize: '0.9rem',
    textAlign: 'center'
  }
};