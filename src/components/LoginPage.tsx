import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Application sign-in screen. Shown as the default landing page. The left
 * panel carries the ODAS brand story over a maritime hero image; the right
 * panel holds the credentials form. On submit a lightweight auth flag is
 * stored so the app can route the user straight into the Fleet List View.
 */

const HIGHLIGHTS: { icon: string; title: string; text: string }[] = [
  {
    icon: 'fa-route',
    title: 'Weather Routing',
    text: 'Optimised passage plans that balance ETA, fuel burn and safety across every ocean basin.',
  },
  {
    icon: 'fa-gauge-high',
    title: 'Live Performance',
    text: 'Noon reports, ROB tracking and speed/consumption analytics for the whole fleet in one place.',
  },
  {
    icon: 'fa-leaf',
    title: 'Emissions & Compliance',
    text: 'CII, EEOI and EU-ETS monitoring so every voyage stays audit-ready and regulation-proof.',
  },
];

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter both your email and password.');
      return;
    }
    setError(null);
    try {
      const store = remember ? window.localStorage : window.sessionStorage;
      store.setItem('odas.auth', JSON.stringify({ email: email.trim(), at: Date.now() }));
    } catch {
      /* storage unavailable — continue anyway */
    }
    navigate('/main', { replace: true });
  };

  return (
    <div className="odas-login">
      <section className="odas-login__hero" aria-hidden="true">
        <div className="odas-login__hero-overlay" />
        <div className="odas-login__hero-content">
          <span className="odas-login__brand">
            <i className="fas fa-ship" aria-hidden="true" />
            ODAS
          </span>
          <h1 className="odas-login__headline">
            One Digitization &amp; Automation Solutions
          </h1>
          <p className="odas-login__tagline">
            The maritime command centre for weather routing, voyage optimisation and
            fleet performance — from departure stem to final postfix.
          </p>

          <ul className="odas-login__highlights">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="odas-login__highlight">
                <span className="odas-login__highlight-icon">
                  <i className={`fas ${h.icon}`} aria-hidden="true" />
                </span>
                <span>
                  <strong>{h.title}</strong>
                  <span className="odas-login__highlight-text">{h.text}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="odas-login__stats">
            <div className="odas-login__stat">
              <span className="odas-login__stat-value">1,200+</span>
              <span className="odas-login__stat-label">Vessels routed</span>
            </div>
            <div className="odas-login__stat">
              <span className="odas-login__stat-value">7</span>
              <span className="odas-login__stat-label">Ocean basins</span>
            </div>
            <div className="odas-login__stat">
              <span className="odas-login__stat-value">24/7</span>
              <span className="odas-login__stat-label">Routing desk</span>
            </div>
          </div>
        </div>
      </section>

      <section className="odas-login__panel">
        <form className="odas-login__card" onSubmit={handleSubmit}>
          <span className="odas-login__brand odas-login__brand--compact">
            <i className="fas fa-ship" aria-hidden="true" />
            ODAS
          </span>
          <h2 className="odas-login__title">Sign in</h2>
          <p className="odas-login__subtitle">
            Welcome back. Enter your credentials to access the routing platform.
          </p>

          {error && (
            <div className="odas-login__error" role="alert">
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
              />
            </div>
          </label>

          <label className="odas-login__field">
            <span className="odas-login__label">Password</span>
            <div className="odas-login__input-wrap">
              <i className="fas fa-lock" aria-hidden="true" />
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </label>

          <div className="odas-login__row">
            <label className="odas-login__remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>Keep me signed in</span>
            </label>
            <a className="odas-login__link" href="#forgot" onClick={(e) => e.preventDefault()}>
              Forgot password?
            </a>
          </div>

          <button type="submit" className="odas-login__submit">
            Sign in <i className="fas fa-arrow-right-long" aria-hidden="true" />
          </button>

          <p className="odas-login__foot">
            Need access? Contact your ODAS administrator or the{' '}
            <a className="odas-login__link" href="#desk" onClick={(e) => e.preventDefault()}>
              24/7 routing desk
            </a>
            .
          </p>
        </form>
        <p className="odas-login__legal">© {new Date().getFullYear()} ODAS · Maritime routing &amp; performance</p>
      </section>
    </div>
  );
}
