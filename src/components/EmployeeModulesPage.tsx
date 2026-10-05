import { useEffect, useState } from 'react';
import { employeeApi } from '../api/employeeApi';
import { useAuth } from '../context/AuthContext';
import type { EmployeeModuleAccessDto } from '../types/auth';

export function EmployeeModulesPage() {
  const { user, role, companyName } = useAuth();
  const [modules, setModules] = useState<EmployeeModuleAccessDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await employeeApi.getMyModules();
        setModules(data ?? []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to fetch assigned modules.');
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <div className="fv-shell" style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', color: '#f8fafc' }}>
      <header style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ background: '#059669', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
            {role ?? 'EMPLOYEE'}
          </span>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 600 }}>My Assigned Modules</h1>
        </div>
        <p style={{ color: '#94a3b8', marginTop: '0.25rem' }}>
          Organization: <strong>{companyName ?? 'General'}</strong> · User: <strong>{user?.fullName}</strong> ({user?.email})
        </p>
      </header>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '0.75rem 1rem', borderRadius: '6px', marginBottom: '1rem' }}>
          <i className="fas fa-circle-exclamation" style={{ marginRight: '0.5rem' }} /> {error}
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          <i className="fas fa-spinner fa-spin fa-2x" />
          <p style={{ marginTop: '0.5rem' }}>Loading permissions...</p>
        </div>
      ) : modules.length === 0 ? (
        <div style={{ background: '#1e293b', padding: '3rem', borderRadius: '8px', textAlign: 'center', border: '1px solid #334155' }}>
          <i className="fas fa-lock fa-3x" style={{ color: '#64748b', marginBottom: '1rem' }} />
          <h3>No Modules Assigned</h3>
          <p style={{ color: '#94a3b8' }}>
            You currently do not have any specific module permissions granted by your organization administrator.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {modules.map((m) => (
            <div
              key={m.moduleId}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <i className="fas fa-cubes" style={{ color: '#38bdf8' }} />
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#fff' }}>{m.moduleName}</h3>
                </div>
                <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                  {m.description || 'Active business module.'}
                </p>
              </div>

              <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #334155' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.5rem' }}>
                  Granted Capabilities:
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {m.canView && (
                    <span style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                      <i className="fas fa-eye" style={{ marginRight: '3px' }} /> View
                    </span>
                  )}
                  {m.canCreate && (
                    <span style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#86efac', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                      <i className="fas fa-plus" style={{ marginRight: '3px' }} /> Create
                    </span>
                  )}
                  {m.canEdit && (
                    <span style={{ background: 'rgba(251, 191, 36, 0.2)', color: '#fde68a', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                      <i className="fas fa-pencil" style={{ marginRight: '3px' }} /> Edit
                    </span>
                  )}
                  {m.canDelete && (
                    <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                      <i className="fas fa-trash" style={{ marginRight: '3px' }} /> Delete
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
