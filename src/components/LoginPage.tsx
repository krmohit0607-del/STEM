import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Application sign-in screen linked directly to ASP.NET Core Multi-Tenant backend.
 */

const HIGHLIGHTS: { icon: string; title: string; text: string }[] = [
  {
    icon: 'fa-shield-halved',
    title: 'Multi-Tenant Security',
    text: 'Isolated organization tenancy with automated EF Core query filters and JWT Bearer security.',
  },
  {
    icon: 'fa-cubes',
    title: 'Granular Module Access',
    text: 'SuperAdmin controls tenant modules, and Admins assign specific View/Create/Edit/Delete permissions to employees.',
  },
  {
    icon: 'fa-route',
    title: 'Maritime Command Centre',
    text: 'Optimised passage plans that balance ETA, fuel burn, emissions, and safety across ocean basins.',
  },
];

const ANNOUNCEMENTS = [
  { label: 'Release note', title: 'A clearer view of every voyage.', text: 'Fleet, chartering, operations, and emissions now meet in one command surface.' },
  { label: 'Operations brief', title: 'Plan around the weather.', text: 'Compare routes, safety limits, and fuel economics before the next leg leaves port.' },
  { label: 'Platform signal', title: 'Access follows responsibility.', text: 'Every module and action is shaped by your role, tenant, and operational context.' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('superadmin@saas.com');
  const [password, setPassword] = useState('SuperAdmin123!');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAnnouncement, setActiveAnnouncement] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveAnnouncement((current) => (current + 1) % ANNOUNCEMENTS.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter both your email and password.');
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      const authData = await login(email.trim(), password, remember);
      // Also write legacy storage token for backward compatibility
      try {
        const store = remember ? window.localStorage : window.sessionStorage;
        store.setItem('odas.auth', JSON.stringify({ email: email.trim(), at: Date.now() }));
      } catch {
        /* ignore */
      }

      if (authData.role === 'SuperAdmin') {
        navigate('/superadmin', { replace: true });
      } else if (authData.role === 'Admin') {
        navigate('/admin-management', { replace: true });
      } else if (authData.role === 'VesselMaster') {
        navigate('/vessel-master', { replace: true });
      } else {
        navigate('/my-modules', { replace: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillQuickLogin = (userEmail: string, userPass: string) => {
    setEmail(userEmail);
    setPassword(userPass);
    setError(null);
  };

  return (
    <div className="odas-login">
      <section className="odas-login__hero">
        <div className="odas-login__hero-overlay" />
        <div className="odas-login__hero-content">
          <div className="odas-login__hero-topline">
            <span className="odas-login__brand"><i className="fas fa-ship" aria-hidden="true" /> ODAS</span>
            <span className="odas-login__live"><i className="fas fa-circle" aria-hidden="true" /> Systems online</span>
          </div>
          <div className="odas-login__hero-copy">
            <p className="odas-login__eyebrow">Fleet intelligence platform</p>
            <h1 className="odas-login__headline">The next move<br /><em>starts here.</em></h1>
            <p className="odas-login__tagline">One calm command centre for the people, vessels, and decisions that keep your operation moving.</p>
          </div>

          <div className="odas-login__briefing" aria-live="polite">
            <div className="odas-login__briefing-mark"><i className="fas fa-bullhorn" aria-hidden="true" /></div>
            <div className="odas-login__briefing-body">
              <span className="odas-login__briefing-label">{ANNOUNCEMENTS[activeAnnouncement].label}</span>
              <strong>{ANNOUNCEMENTS[activeAnnouncement].title}</strong>
              <p>{ANNOUNCEMENTS[activeAnnouncement].text}</p>
            </div>
            <div className="odas-login__briefing-dots" aria-label="Announcements">
              {ANNOUNCEMENTS.map((announcement, index) => (
                <button key={announcement.label} type="button" aria-label={`Show announcement ${index + 1}`} className={index === activeAnnouncement ? 'is-active' : ''} onClick={() => setActiveAnnouncement(index)} />
              ))}
            </div>
          </div>

          <div className="odas-login__feature-strip">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="odas-login__feature-chip" title={h.text}>
                <i className={`fas ${h.icon}`} aria-hidden="true" />
                <span>{h.title}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="odas-login__panel">
        <form className="odas-login__card" onSubmit={handleSubmit}>
          <div className="odas-login__form-header">
            <span className="odas-login__brand odas-login__brand--compact"><i className="fas fa-ship" aria-hidden="true" /> ODAS SaaS</span>
            <span className="odas-login__secure"><i className="fas fa-shield-halved" aria-hidden="true" /> Secure access</span>
          </div>
          <p className="odas-login__eyebrow odas-login__eyebrow--dark">Welcome back</p>
          <h2 className="odas-login__title">Sign in to your command centre</h2>
          <p className="odas-login__subtitle">
            Enter your credentials to access your tenant account.
          </p>

          {error && (
            <div className="odas-login__error" role="alert" style={{ whiteSpace: 'pre-line' }}>
              <i className="fas fa-triangle-exclamation" aria-hidden="true" /> {error}
            </div>
          )}

          <label className="odas-login__field">
            <span className="odas-login__label">Email address</span>
            <div className="odas-login__input-wrap">
              <i className="fas fa-envelope" aria-hidden="true" />
              <input
                type="email"
                autoComplete="username"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>
          </label>

          <label className="odas-login__field">
            <span className="odas-login__label">Password</span>
            <div className="odas-login__input-wrap">
              <i className="fas fa-lock" aria-hidden="true" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                required
              />
              <button
                type="button"
                className="odas-login__password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                disabled={isSubmitting}
              >
                <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true" />
              </button>
            </div>
          </label>

          <div className="odas-login__row">
            <label className="odas-login__remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                disabled={isSubmitting}
              />
              <span>Keep me signed in</span>
            </label>
            <a className="odas-login__link" href="#forgot" onClick={(e) => e.preventDefault()}>
              Forgot password?
            </a>
          </div>

          <button type="submit" className="odas-login__submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <i className="fas fa-spinner fa-spin" aria-hidden="true" /> Authenticating...
              </>
            ) : (
              <>
                Sign in <i className="fas fa-arrow-right-long" aria-hidden="true" />
              </>
            )}
          </button>

          <div className="odas-login__quick-access">
            <span className="odas-login__quick-label">Temporary quick access</span>
            <div className="odas-login__quick-grid">
              <button type="button" onClick={() => fillQuickLogin('superadmin@saas.com', 'SuperAdmin123!')}>
                <i className="fas fa-crown" aria-hidden="true" /> SuperAdmin
              </button>
              <button type="button" onClick={() => fillQuickLogin('admin@acme.com', 'AdminPassword123!')}>
                <i className="fas fa-building-user" aria-hidden="true" /> Admin
              </button>
              <button type="button" onClick={() => fillQuickLogin('employee@acme.com', 'EmployeePassword123!')}>
                <i className="fas fa-user-tag" aria-hidden="true" /> Employee
              </button>
              <button type="button" onClick={() => fillQuickLogin('master@oceanic.com', 'MasterPassword123!')}>
                <i className="fas fa-ship" aria-hidden="true" /> Master
              </button>
            </div>
          </div>

        </form>
        <p className="odas-login__legal">© {new Date().getFullYear()} ODAS SaaS · Multi-Tenant Architecture</p>
      </section>
    </div>
  );
}
