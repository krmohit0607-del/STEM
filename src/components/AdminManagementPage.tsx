import { useEffect, useState } from 'react';
import { adminApi } from '../api/adminApi';
import { useAuth } from '../context/AuthContext';
import { clearAllVoyageData, inspectSystemData, listVoyageData } from '../data/clearSystemData';
import type {
  AdminTenantModuleDto,
  EmployeeDto,
  EmployeePermissionInputDto,
} from '../types/auth';

export function AdminManagementPage() {
  const { companyName } = useAuth();
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [tenantModules, setTenantModules] = useState<AdminTenantModuleDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create Employee Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [empFullName, setEmpFullName] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empPassword, setEmpPassword] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Manage Permissions Modal
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeDto | null>(null);
  const [permissionDrafts, setPermissionDrafts] = useState<Record<string, EmployeePermissionInputDto>>({});
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

  // System Maintenance
  const [systemDataCount, setSystemDataCount] = useState(0);
  const [showSystemMaintenance, setShowSystemMaintenance] = useState(false);
  const [isClearingData, setIsClearingData] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [empList, modList] = await Promise.all([
        adminApi.getEmployees(),
        adminApi.getTenantModules(),
      ]);
      setEmployees(empList ?? []);
      setTenantModules(modList ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load employee directory.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // Count voyage data for display
    const count = listVoyageData().length;
    setSystemDataCount(count);
  }, []);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await adminApi.createEmployee({
        fullName: empFullName,
        email: empEmail,
        password: empPassword,
        phoneNumber: empPhone || undefined,
      });
      setSuccessMsg(`Employee "${empFullName}" created successfully.`);
      setShowCreateModal(false);
      setEmpFullName('');
      setEmpEmail('');
      setEmpPassword('');
      setEmpPhone('');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create employee.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivateEmployee = async (emp: EmployeeDto) => {
    if (!confirm(`Are you sure you want to deactivate ${emp.fullName}? All their active sessions will be terminated.`)) return;

    try {
      await adminApi.deactivateEmployee(emp.id);
      setSuccessMsg(`Employee ${emp.fullName} has been deactivated.`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate employee.');
    }
  };

  const openPermissionsModal = (emp: EmployeeDto) => {
    setSelectedEmployee(emp);
    const drafts: Record<string, EmployeePermissionInputDto> = {};

    // Populate existing permissions
    tenantModules.forEach((m) => {
      const existing = emp.permissions.find((p) => p.moduleId === m.moduleId);
      drafts[m.moduleId] = {
        moduleId: m.moduleId,
        canView: existing ? existing.canView : false,
        canCreate: existing ? existing.canCreate : false,
        canEdit: existing ? existing.canEdit : false,
        canDelete: existing ? existing.canDelete : false,
      };
    });

    setPermissionDrafts(drafts);
  };

  const handleSavePermissions = async () => {
    if (!selectedEmployee) return;
    setIsSavingPermissions(true);
    setError(null);
    try {
      const permissionsPayload: EmployeePermissionInputDto[] = Object.values(permissionDrafts).filter(
        (p) => p.canView || p.canCreate || p.canEdit || p.canDelete,
      );

      await adminApi.setEmployeePermissions({
        employeeUserId: selectedEmployee.id,
        permissions: permissionsPayload,
      });

      setSuccessMsg(`Permissions updated for ${selectedEmployee.fullName}.`);
      setSelectedEmployee(null);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update employee permissions.');
    } finally {
      setIsSavingPermissions(false);
    }
  };

  const togglePermission = (moduleId: string, field: 'canView' | 'canCreate' | 'canEdit' | 'canDelete') => {
    setPermissionDrafts((prev) => {
      const current = prev[moduleId] ?? {
        moduleId,
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
      };

      const updated = { ...current, [field]: !current[field] };
      // If user gives create/edit/delete, automatically ensure canView is true
      if ((field === 'canCreate' || field === 'canEdit' || field === 'canDelete') && updated[field]) {
        updated.canView = true;
      }
      return { ...prev, [moduleId]: updated };
    });
  };

  return (
    <div className="fv-shell" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', color: '#f8fafc' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ background: '#2563eb', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
              ADMIN PORTAL
            </span>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 600 }}>
              {companyName ? `${companyName} — Team Management` : 'Tenant Employee Management'}
            </h1>
          </div>
          <p style={{ color: '#94a3b8', marginTop: '0.25rem' }}>
            Manage organization employees and assign granular module permissions (View, Create, Edit, Delete).
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          style={{
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            padding: '0.6rem 1.2rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <i className="fas fa-user-plus" /> Add Employee
        </button>
      </header>

      {/* Notifications */}
      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '0.75rem 1rem', borderRadius: '6px', marginBottom: '1rem' }}>
          <i className="fas fa-circle-exclamation" style={{ marginRight: '0.5rem' }} /> {error}
        </div>
      )}
      {successMsg && (
        <div style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid #22c55e', color: '#86efac', padding: '0.75rem 1rem', borderRadius: '6px', marginBottom: '1rem' }}>
          <i className="fas fa-circle-check" style={{ marginRight: '0.5rem' }} /> {successMsg}
        </div>
      )}

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '1rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Total Employees</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '0.25rem' }}>{employees.length}</div>
        </div>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '1rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Active Team Members</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '0.25rem', color: '#86efac' }}>
            {employees.filter((e) => e.isActive).length}
          </div>
        </div>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '1rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Tenant Enabled Modules</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '0.25rem', color: '#38bdf8' }}>
            {tenantModules.length}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          <i className="fas fa-spinner fa-spin fa-2x" />
          <p style={{ marginTop: '0.5rem' }}>Loading employees...</p>
        </div>
      ) : (
        <div style={{ background: '#1e293b', borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Employee</th>
                <th style={{ padding: '0.75rem 1rem' }}>Email &amp; Phone</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Granted Modules</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                    No employees created yet. Click &quot;Add Employee&quot; to onboard your team.
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.id} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '1rem', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <i className="fas fa-user" style={{ color: '#38bdf8' }} />
                        {emp.fullName}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div>{emp.email}</div>
                      {emp.phoneNumber && <small style={{ color: '#94a3b8' }}>{emp.phoneNumber}</small>}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span
                        style={{
                          padding: '0.2rem 0.6rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          background: emp.isActive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: emp.isActive ? '#86efac' : '#fca5a5',
                        }}
                      >
                        {emp.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {emp.permissions.length === 0 ? (
                          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>None assigned</span>
                        ) : (
                          emp.permissions.map((p) => (
                            <span
                              key={p.moduleId}
                              style={{
                                background: '#0f172a',
                                border: '1px solid #334155',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                              }}
                            >
                              {p.moduleName}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => openPermissionsModal(emp)}
                          style={{
                            background: '#0284c7',
                            color: '#fff',
                            border: 'none',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          <i className="fas fa-key" style={{ marginRight: '0.3rem' }} /> Permissions
                        </button>
                        {emp.isActive && (
                          <button
                            type="button"
                            onClick={() => handleDeactivateEmployee(emp)}
                            style={{
                              background: '#ef4444',
                              color: '#fff',
                              border: 'none',
                              padding: '0.35rem 0.75rem',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                            }}
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Create Employee */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: '#1e293b',
              padding: '2rem',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '500px',
              border: '1px solid #334155',
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: '1.25rem' }}>Add New Employee</h2>
            <form onSubmit={handleCreateEmployee}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={empFullName}
                  onChange={(e) => setEmpFullName(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
                  placeholder="e.g. John Smith"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                  Work Email *
                </label>
                <input
                  type="email"
                  required
                  value={empEmail}
                  onChange={(e) => setEmpEmail(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
                  placeholder="john@company.com"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                  Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={empPassword}
                  onChange={(e) => setEmpPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
                  placeholder="Min 8 characters"
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                  Phone Number
                </label>
                <input
                  type="text"
                  value={empPhone}
                  onChange={(e) => setEmpPhone(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
                  placeholder="+1 (555) 000-0000"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ background: '#334155', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '4px', cursor: 'pointer' }}
                >
                  {isSaving ? 'Creating...' : 'Create Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Manage Employee Permissions */}
      {selectedEmployee && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: '#1e293b',
              padding: '2rem',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '650px',
              border: '1px solid #334155',
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: '0.25rem' }}>
              Module Permissions: {selectedEmployee.fullName}
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              Assign View, Create, Edit, and Delete access for modules enabled for your organization.
            </p>

            {tenantModules.length === 0 ? (
              <div style={{ background: '#0f172a', padding: '1rem', borderRadius: '6px', color: '#94a3b8', textAlign: 'center' }}>
                No modules are currently enabled for your organization. Contact your SuperAdmin.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '350px', overflowY: 'auto' }}>
                {tenantModules.map((m) => {
                  const draft = permissionDrafts[m.moduleId] ?? {
                    moduleId: m.moduleId,
                    canView: false,
                    canCreate: false,
                    canEdit: false,
                    canDelete: false,
                  };

                  return (
                    <div
                      key={m.moduleId}
                      style={{
                        background: '#0f172a',
                        padding: '0.75rem 1rem',
                        borderRadius: '6px',
                        border: '1px solid #334155',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#38bdf8' }}>
                        {m.moduleName}
                      </div>

                      <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={draft.canView}
                            onChange={() => togglePermission(m.moduleId, 'canView')}
                          />
                          Can View
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={draft.canCreate}
                            onChange={() => togglePermission(m.moduleId, 'canCreate')}
                          />
                          Can Create
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={draft.canEdit}
                            onChange={() => togglePermission(m.moduleId, 'canEdit')}
                          />
                          Can Edit
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={draft.canDelete}
                            onChange={() => togglePermission(m.moduleId, 'canDelete')}
                          />
                          Can Delete
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={() => setSelectedEmployee(null)}
                style={{ background: '#334155', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingPermissions || tenantModules.length === 0}
                onClick={handleSavePermissions}
                style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '4px', cursor: 'pointer' }}
              >
                {isSavingPermissions ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* System Maintenance Section */}
      <div style={{ marginTop: '2rem', borderTop: '1px solid #cbd5e1', paddingTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ marginBottom: 0 }}>🔧 System Maintenance</h2>
          <button
            type="button"
            onClick={() => setShowSystemMaintenance(!showSystemMaintenance)}
            style={{
              background: showSystemMaintenance ? '#dc2626' : '#64748b',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {showSystemMaintenance ? 'Hide' : 'Show'}
          </button>
        </div>

        {showSystemMaintenance && (
          <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '1.5rem' }}>
            <p style={{ marginTop: 0, color: '#475569' }}>
              <strong>⚠️ Dangerous Zone:</strong> Use these tools only when you need to completely reset the system state.
            </p>

            <div style={{ background: '#fff', padding: '1rem', borderRadius: '4px', marginBottom: '1rem', border: '1px solid #e2e8f0' }}>
              <h3 style={{ marginTop: 0 }}>Clear All Voyage Data</h3>
              <p style={{ color: '#64748b', marginBottom: '0.75rem' }}>
                <strong>{systemDataCount} voyage-related items</strong> currently stored in your browser cache.
              </p>
              <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                This will delete:
              </p>
              <ul style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem', paddingLeft: '1.5rem' }}>
                <li>All created voyages</li>
                <li>All saved estimations</li>
                <li>All operations data (recaps, cargo, stowage)</li>
                <li>All voyage overrides and constraints</li>
                <li>All saved routes and passages</li>
              </ul>

              <button
                type="button"
                disabled={isClearingData}
                onClick={async () => {
                  if (confirm('⚠️ This will DELETE ALL voyage and estimation data from BOTH FRONTEND AND BACKEND! This cannot be undone. Continue?')) {
                    setIsClearingData(true);
                    try {
                      await clearAllVoyageData();
                    } catch (err) {
                      console.error('Error clearing data:', err);
                      alert('❌ Error clearing data. Check console for details.');
                      setIsClearingData(false);
                    }
                  }
                }}
                style={{
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '4px',
                  cursor: isClearingData ? 'not-allowed' : 'pointer',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  opacity: isClearingData ? 0.6 : 1,
                }}
              >
                {isClearingData ? '⏳ Clearing data...' : '🗑️ Clear All Voyage Data (Frontend + Backend)'}
              </button>

              <button
                type="button"
                onClick={() => {
                  inspectSystemData();
                  alert('📊 Check browser console (F12) to see detailed system data.');
                }}
                style={{
                  background: '#0891b2',
                  color: '#fff',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  marginLeft: '1rem',
                }}
              >
                📊 Inspect System Data
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
