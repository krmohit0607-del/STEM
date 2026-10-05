import { useEffect, useState } from 'react';
import { superAdminApi } from '../api/superAdminApi';
import type { CreateTenantUserRequestDto, ModuleDto, TenantDto, TenantModuleAccessDto, TenantUserDto, TenantUserRole } from '../types/auth';

const SYSTEM_MODULE_NAMES = new Set(['Chartering', 'Operations', 'Bunker', 'Postfix', 'Emissions', 'Performance', 'Accounts']);

interface Notification {
  id: string;
  type: 'error' | 'success';
  message: string;
  details?: string[];
}

export function SuperAdminPage() {
  const [tenants, setTenants] = useState<TenantDto[]>([]);
  const [modules, setModules] = useState<ModuleDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Workspace state
  const [selectedTenant, setSelectedTenant] = useState<TenantDto | null>(null);
  const [tenantUsers, setTenantUsers] = useState<TenantUserDto[]>([]);
  const [tenantModuleAccessList, setTenantModuleAccessList] = useState<TenantModuleAccessDto[]>([]);
  const [isLoadingTenantData, setIsLoadingTenantData] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [userDraft, setUserDraft] = useState<CreateTenantUserRequestDto & { isActive?: boolean }>({ tenantId: '', fullName: '', email: '', password: '', role: 'Employee', isActive: true });
  const [editingUser, setEditingUser] = useState<TenantUserDto | null>(null);
  const [editingUserForUpdate, setEditingUserForUpdate] = useState<TenantUserDto | null>(null);
  const [editingUserFullName, setEditingUserFullName] = useState('');
  const [editingUserRole, setEditingUserRole] = useState<TenantUserRole>('Employee');
  const [editingUserModules, setEditingUserModules] = useState<string[]>([]);
  const [editingUserIsActive, setEditingUserIsActive] = useState(true);
  const [showCreateTenantModal, setShowCreateTenantModal] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [selectedInitialModules, setSelectedInitialModules] = useState<string[]>([]);
  const [isSavingTenant, setIsSavingTenant] = useState(false);
  
  // Company management state
  const [companySearch, setCompanySearch] = useState('');
  const [editingTenant, setEditingTenant] = useState<TenantDto | null>(null);
  const [editingTenantCompanyName, setEditingTenantCompanyName] = useState('');
  const [editingTenantAdminFullName, setEditingTenantAdminFullName] = useState('');
  const [editingTenantAdminEmail, setEditingTenantAdminEmail] = useState('');
  const [editingTenantModules, setEditingTenantModules] = useState<string[]>([]);
  const [editingTenantIsActive, setEditingTenantIsActive] = useState(true);
  const [showEditTenantModal, setShowEditTenantModal] = useState(false);
  const [isSavingCompanyEdit, setIsSavingCompanyEdit] = useState(false);
  const [isDeletingTenant, setIsDeletingTenant] = useState(false);

  // Notification handlers
  const showNotification = (type: 'error' | 'success', message: string, details?: string[]) => {
    const id = `${Date.now()}-${Math.random()}`;
    const notification: Notification = { id, type, message, details };
    setNotifications((prev) => [...prev, notification]);
    
    // Auto-dismiss after 4 seconds for success, 5 seconds for error
    const timeout = setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, type === 'success' ? 4000 : 5000);

    return () => clearTimeout(timeout);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [tenantsData, modulesData] = await Promise.all([
        superAdminApi.getAdmins(),
        superAdminApi.getModules(),
      ]);
      setTenants(tenantsData ?? []);
      setModules((modulesData ?? []).filter((module) => SYSTEM_MODULE_NAMES.has(module.name)));
      if ((tenantsData?.length ?? 0) > 0 && !selectedTenant) {
        setSelectedTenant(tenantsData![0]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load SuperAdmin data.';
      showNotification('error', message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTenantData = async (tenant: TenantDto) => {
    setIsLoadingTenantData(true);
    try {
      const [users, access] = await Promise.all([
        superAdminApi.getTenantUsers(tenant.id),
        superAdminApi.getTenantModuleAccess(tenant.id),
      ]);
      setTenantUsers(users);
      setTenantModuleAccessList(access);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load tenant data.';
      showNotification('error', message);
    } finally {
      setIsLoadingTenantData(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (selectedTenant) {
      void loadTenantData(selectedTenant);
    }
  }, [selectedTenant]);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingTenant(true);
    try {
      await superAdminApi.createAdmin({
        companyName,
        adminFullName,
        adminEmail,
        adminPassword,
        initialModuleIds: selectedInitialModules,
      });
      showNotification('success', `Company "${companyName}" created successfully!`);
      setShowCreateTenantModal(false);
      setCompanyName('');
      setAdminFullName('');
      setAdminEmail('');
      setAdminPassword('');
      setSelectedInitialModules([]);
      await loadData();
    } catch (err: unknown) {
      let message = 'Failed to create company.';
      let details: string[] | undefined;
      
      if (err instanceof Error) {
        message = err.message;
        // Extract detailed errors if available
        try {
          const parsed = JSON.parse(err.message);
          if (parsed.errors && Array.isArray(parsed.errors)) {
            details = parsed.errors;
            message = parsed.message || message;
          }
        } catch {}
      }
      
      showNotification('error', message, details);
    } finally {
      setIsSavingTenant(false);
    }
  };

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTenant) return;
    try {
      await superAdminApi.createTenantUser({ ...userDraft, tenantId: selectedTenant.id });
      showNotification('success', `User "${userDraft.fullName}" created.`);
      setShowCreateUserModal(false);
      setUserDraft({ tenantId: selectedTenant.id, fullName: '', email: '', password: '', role: 'Employee' });
      await loadTenantData(selectedTenant);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create user.';
      showNotification('error', message);
    }
  };

  const deactivateUser = async (user: TenantUserDto) => {
    if (!selectedTenant || !window.confirm(`Deactivate ${user.fullName}?`)) return;
    try {
      await superAdminApi.deleteTenantUser(user.id);
      await loadTenantData(selectedTenant);
      showNotification('success', `${user.fullName} was deactivated.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to deactivate user.';
      showNotification('error', message);
    }
  };

  const toggleUserPermission = (moduleId: string, field: 'canView' | 'canCreate' | 'canEdit' | 'canDelete') => {
    if (!editingUser) return;
    const existing = editingUser.permissions.find((p) => p.moduleId === moduleId);
    const next = editingUser.permissions.filter((p) => p.moduleId !== moduleId);
    const row = existing ?? { moduleId, moduleName: '', canView: false, canCreate: false, canEdit: false, canDelete: false };
    const updated = { ...row, [field]: !row[field] };
    if (field !== 'canView' && updated[field]) updated.canView = true;
    setEditingUser({ ...editingUser, permissions: [...next, updated] });
  };

  const saveUserPermissions = async () => {
    if (!editingUser || !selectedTenant) return;
    try {
      await superAdminApi.setTenantUserPermissions(editingUser.id, {
        userId: editingUser.id,
        permissions: editingUser.permissions.map(({ moduleName, ...permission }) => permission),
      });
      showNotification('success', `Permissions updated for ${editingUser.fullName}.`);
      setEditingUser(null);
      await loadTenantData(selectedTenant);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save user permissions.';
      showNotification('error', message);
    }
  };

  const openEditUserModal = (user: TenantUserDto) => {
    setEditingUserForUpdate(user);
    setEditingUserFullName(user.fullName);
    setEditingUserRole(user.role);
    setEditingUserIsActive(user.isActive);
    // Initialize with user's current module permissions, but only for company-enabled modules
    const enabledModuleIds = new Set(
      tenantModuleAccessList
        .filter(m => m.tenantId === selectedTenant?.id && m.isEnabled)
        .map(m => m.moduleId)
    );
    const validUserModules = user.permissions
      .filter(p => p.canView && enabledModuleIds.has(p.moduleId))
      .map(p => p.moduleId);
    setEditingUserModules(validUserModules);
  };

  const saveUserEdit = async () => {
    if (!editingUserForUpdate || !selectedTenant) return;
    try {
      // Update user basic info (name, status)
      await superAdminApi.updateTenantUser(editingUserForUpdate.id, {
        fullName: editingUserFullName,
        isActive: editingUserIsActive,
      });

      // Update module permissions
      const modulesToEnable = editingUserModules.map(moduleId => ({
        moduleId,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: false,
      }));
      await superAdminApi.setTenantUserPermissions(editingUserForUpdate.id, {
        userId: editingUserForUpdate.id,
        permissions: modulesToEnable,
      });

      showNotification('success', `User "${editingUserFullName}" updated successfully.`);
      setEditingUserForUpdate(null);
      setEditingUserFullName('');
      setEditingUserModules([]);
      await loadTenantData(selectedTenant);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save user.';
      showNotification('error', message);
    }
  };

  const filteredUsers = userSearch.trim() ? tenantUsers.filter((u) => `${u.fullName} ${u.email} ${u.role}`.toLowerCase().includes(userSearch.toLowerCase())) : tenantUsers;

  const roleLabel = (role: string) => {
    switch (role) {
      case 'Admin':
        return 'Manager';
      case 'Employee':
        return 'Executive';
      case 'VesselMaster':
        return 'Vessel';
      default:
        return role;
    }
  };

  const openEditTenantModal = (tenant: TenantDto) => {
    setEditingTenant(tenant);
    setEditingTenantCompanyName(tenant.companyName);
    setEditingTenantAdminFullName(tenant.adminFullName);
    setEditingTenantAdminEmail(tenant.adminEmail);
    setEditingTenantIsActive(tenant.isActive);
    // Load modules enabled for this company
    const enabledModuleIds = tenantModuleAccessList
      .filter((m) => m.tenantId === tenant.id && m.isEnabled)
      .map((m) => m.moduleId);
    setEditingTenantModules(enabledModuleIds);
    setShowEditTenantModal(true);
  };

  const saveEditTenant = async () => {
    if (!editingTenant) return;
    try {
      const tenantIdToReload = editingTenant.id;
      
      // Update company status if changed
      if (editingTenant.isActive !== editingTenantIsActive) {
        await superAdminApi.updateTenantStatus(tenantIdToReload, { isActive: editingTenantIsActive });
      }
      
      // Update modules if changed
      const currentEnabledModules = tenantModuleAccessList
        .filter((m) => m.tenantId === tenantIdToReload && m.isEnabled)
        .map((m) => m.moduleId);
      
      const modulesToAdd = editingTenantModules.filter((m) => !currentEnabledModules.includes(m));
      const modulesToRemove = currentEnabledModules.filter((m) => !editingTenantModules.includes(m));
      
      // Add new modules
      for (const moduleId of modulesToAdd) {
        await superAdminApi.setTenantModuleAccess({
          tenantId: tenantIdToReload,
          moduleId,
          isEnabled: true,
        });
      }
      
      // Remove modules
      for (const moduleId of modulesToRemove) {
        await superAdminApi.setTenantModuleAccess({
          tenantId: tenantIdToReload,
          moduleId,
          isEnabled: false,
        });
      }
      
      // Close modal and clear edit state
      setShowEditTenantModal(false);
      setEditingTenant(null);
      setEditingTenantCompanyName('');
      setEditingTenantAdminFullName('');
      setEditingTenantAdminEmail('');
      setEditingTenantModules([]);
      
      // Reload all data
      const [tenantsData, modulesData] = await Promise.all([
        superAdminApi.getAdmins(),
        superAdminApi.getModules(),
      ]);
      
      setTenants(tenantsData ?? []);
      setModules((modulesData ?? []).filter((module) => SYSTEM_MODULE_NAMES.has(module.name)));
      
      // Find and select the updated tenant to refresh the display
      const updatedTenant = tenantsData?.find((t) => t.id === tenantIdToReload);
      if (updatedTenant) {
        setSelectedTenant(updatedTenant);
        // Reload tenant-specific data
        const [users, moduleAccess] = await Promise.all([
          superAdminApi.getTenantUsers(updatedTenant.id),
          superAdminApi.getTenantModuleAccess(updatedTenant.id),
        ]);
        setTenantUsers(users ?? []);
        setTenantModuleAccessList(moduleAccess ?? []);
      }
      
      showNotification('success', `Company "${editingTenantCompanyName}" updated successfully.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save company.';
      showNotification('error', message);
    } finally {
      setIsSavingCompanyEdit(false);
    }
  };

  const handleDeleteTenantInModal = async () => {
    if (!editingTenant) return;
    if (!window.confirm(`Are you sure you want to permanently delete "${editingTenant.companyName}"? This action cannot be undone and will delete all associated data.`)) return;
    
    setIsDeletingTenant(true);
    try {
      await superAdminApi.deleteTenant(editingTenant.id);
      showNotification('success', `Company "${editingTenant.companyName}" has been permanently deleted.`);
      
      // Close modal and reload data
      setShowEditTenantModal(false);
      setEditingTenant(null);
      setEditingTenantCompanyName('');
      setEditingTenantAdminFullName('');
      setEditingTenantAdminEmail('');
      setEditingTenantModules([]);
      setSelectedTenant(null);
      
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete company.';
      showNotification('error', message);
    } finally {
      setIsDeletingTenant(false);
    }
  };

  const handleToggleTenantStatusInModal = async () => {
    if (!editingTenant) return;
    setEditingTenantIsActive(!editingTenantIsActive);
  };

  const filteredTenants = companySearch.trim() 
    ? tenants.filter((t) => t.companyName.toLowerCase().includes(companySearch.toLowerCase()) || t.adminEmail.toLowerCase().includes(companySearch.toLowerCase())) 
    : tenants;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f1419' }}>
      <header style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid #1e2d42', background: '#101820' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <h1 style={{ margin: '0 0 0.1rem', color: '#f3f7fc', fontSize: '1.25rem' }}>User Control Centre</h1>
            <p style={{ margin: 0, color: '#8fa2bc', fontSize: '12px' }}>Manage companies, users, roles and module access</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0 }}>
            <button type="button" onClick={() => window.open('/chartering', '_blank')} style={{ background: '#10b981', color: '#fff', border: 0, padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#059669'} onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}><i className="fas fa-arrow-right" /> Go to App</button>
            <button type="button" onClick={() => window.open('/main', '_blank')} style={{ background: '#8b5cf6', color: '#fff', border: 0, padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#7c3aed'} onMouseLeave={(e) => e.currentTarget.style.background = '#8b5cf6'}><i className="fas fa-history" /> Go to History</button>
            <button type="button" onClick={() => window.open('/settings', '_blank')} style={{ background: '#f59e0b', color: '#fff', border: 0, padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#d97706'} onMouseLeave={(e) => e.currentTarget.style.background = '#f59e0b'}><i className="fas fa-cog" /> Admin Settings</button>
            <button type="button" onClick={() => setShowCreateTenantModal(true)} style={{ background: '#2563eb', color: '#fff', border: 0, padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#1d4ed8'} onMouseLeave={(e) => e.currentTarget.style.background = '#2563eb'}><i className="fas fa-plus" /> Add Company</button>
          </div>
        </div>
      </header>

      {/* Floating Notifications Container */}
      <div style={{ position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '400px', pointerEvents: 'none' }}>
        {notifications.map((notif) => (
          <div
            key={notif.id}
            style={{
              padding: '1rem 1.25rem',
              borderRadius: '8px',
              background: notif.type === 'error' ? '#2b1720' : '#113225',
              border: `1px solid ${notif.type === 'error' ? '#5a2a2a' : '#2a5a3a'}`,
              color: notif.type === 'error' ? '#ffadad' : '#78e1a7',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              animation: 'slideIn 0.3s ease-out',
              pointerEvents: 'auto',
              fontSize: '13px',
            }}
          >
            <i className={`fas ${notif.type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}`} style={{ marginTop: '0.15rem', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: notif.details ? '0.4rem' : 0 }}>{notif.message}</div>
              {notif.details && notif.details.length > 0 && (
                <div style={{ fontSize: '12px', opacity: 0.9 }}>
                  {notif.details.map((detail, idx) => (
                    <div key={idx}>• {detail}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Animation Styles */}
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>

      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#8fa2bc' }}>
          <div><i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: '0.5rem' }} /><p>Loading...</p></div>
        </div>
      ) : (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <aside style={{ width: '280px', background: '#101820', borderRight: '1px solid #1e2d42', padding: '1.5rem 0.8rem', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header Section */}
            <div>
              <div style={{ color: '#8fa2bc', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.8rem', letterSpacing: '0.5px' }}>Companies</div>
              
              {/* Search Input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', border: '1px solid #1e2d42', borderRadius: '4px', background: '#0a1118', marginBottom: '0.8rem' }}>
                <i className="fas fa-search" style={{ color: '#70b7ff', fontSize: '12px', flexShrink: 0 }} />
                <input 
                  type="text" 
                  value={companySearch} 
                  onChange={(e) => setCompanySearch(e.target.value)}
                  placeholder="Search companies..." 
                  style={{ flex: 1, border: 0, outline: 0, background: 'transparent', color: '#e8eef8', font: 'inherit', fontSize: '12px' }} 
                />
              </div>
            </div>

            {/* Scrollable Companies List */}
            <div style={{ flex: 1, overflow: 'auto', borderTop: '1px solid #1e2d42', paddingTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {filteredTenants.length > 0 ? (
                filteredTenants.map((company) => (
                  <div 
                    key={company.id}
                    onClick={() => setSelectedTenant(company)}
                    style={{
                      padding: '0.8rem',
                      background: selectedTenant?.id === company.id ? '#1e3a5f' : '#0a1118',
                      border: selectedTenant?.id === company.id ? '1px solid #3b82f6' : '1px solid #1e2d42',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      minHeight: '60px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedTenant?.id !== company.id) {
                        e.currentTarget.style.background = '#101820';
                        e.currentTarget.style.borderColor = '#475569';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedTenant?.id !== company.id) {
                        e.currentTarget.style.background = '#0a1118';
                        e.currentTarget.style.borderColor = '#1e2d42';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                      <strong style={{ color: selectedTenant?.id === company.id ? '#3b82f6' : '#e8eef8', fontSize: '12px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company.companyName}</strong>
                      {selectedTenant?.id === company.id && <span style={{ color: '#3b82f6', fontSize: '10px' }}>✓</span>}
                    </div>
                    <div style={{ fontSize: '10px', color: '#8fa2bc', marginBottom: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company.adminEmail}</div>
                    <div style={{ display: 'flex', gap: '0.8rem', fontSize: '10px', color: '#94a3b8' }}>
                      <span><strong style={{ color: '#cbd5e1' }}>{company.activeUsersCount}</strong> users</span>
                      <span><strong style={{ color: '#cbd5e1' }}>{tenantModuleAccessList.filter((m) => m.tenantId === company.id && m.isEnabled).length}</strong> modules</span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#8fa2bc', fontSize: '12px' }}>
                  {tenants.length === 0 ? 'No companies available' : 'No matching companies'}
                </div>
              )}
            </div>


          </aside>

          {selectedTenant ? (
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid #1e2d42', background: '#101820', display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, maxWidth: '300px', padding: '6px 10px', border: '1px solid #1e2d42', borderRadius: '4px', background: '#0a1118' }}>
                          <i className="fas fa-search" style={{ color: '#70b7ff' }} />
                          <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search users..." style={{ flex: 1, border: 0, outline: 0, background: 'transparent', color: '#e8eef8', font: 'inherit' }} />
                        </label>
                      </div>
                      
                      {/* Company Details and Actions */}
                      <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                        <span style={{ background: selectedTenant.isActive ? '#113225' : '#351c25', color: selectedTenant.isActive ? '#78e1a7' : '#ffadad', padding: '3px 8px', borderRadius: '3px', fontSize: '10px', fontWeight: 'bold' }}>
                          {selectedTenant.isActive ? 'ACTIVE' : 'SUSPENDED'}
                        </span>
                        <button 
                          type="button" 
                          onClick={() => openEditTenantModal(selectedTenant)} 
                          style={{ padding: '0.5rem 0.8rem', fontSize: '12px', fontWeight: 600, border: '1px solid #1e2d42', borderRadius: '4px', background: '#101820', color: '#74c1ff', cursor: 'pointer', transition: 'all 0.15s' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#0f1419'; e.currentTarget.style.borderColor = '#475569'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = '#101820'; e.currentTarget.style.borderColor = '#1e2d42'; }}
                        >
                          Edit Company
                        </button>
                        <button type="button" onClick={() => { setUserDraft({ tenantId: selectedTenant.id, fullName: '', email: '', password: '', role: 'Employee', isActive: true, initialModuleIds: [] }); setShowCreateUserModal(true); }} style={{ background: '#2563eb', color: '#fff', border: 0, padding: '0.5rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '13px', whiteSpace: 'nowrap' }}><i className="fas fa-user-plus" /> Add User</button>
                      </div>
                    </div>

                    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', flexDirection: 'column' }}>
                        {isLoadingTenantData ? (
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8fa2bc' }}>Loading...</div>
                        ) : filteredUsers.length === 0 ? (
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8fa2bc' }}>No users found</div>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead style={{ background: '#0a1118', position: 'sticky', top: 0 }}>
                              <tr style={{ borderBottom: '1px solid #1e2d42' }}>
                                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8fa2bc', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Name</th>
                                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8fa2bc', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email</th>
                                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8fa2bc', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Role</th>
                                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8fa2bc', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Access</th>
                                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8fa2bc', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8fa2bc', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredUsers.map((user) => (
                                <tr key={user.id} style={{ borderBottom: '1px solid #1e2d42', background: 'transparent', transition: 'background 0.15s' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#0f2135'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                  <td style={{ padding: '10px 12px', color: '#e8eef8', fontWeight: 500 }}>{user.fullName}</td>
                                  <td style={{ padding: '10px 12px', color: '#8fa2bc' }}>{user.email}</td>
                                  <td style={{ padding: '10px 12px' }}><span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '11px', fontWeight: 700, background: '#1a3d6e', color: '#74c1ff' }}>{roleLabel(user.role)}</span></td>
                                  <td style={{ padding: '10px 12px', color: '#8fa2bc' }}>
                                    {(() => {
                                      const enabledCompanyModules = selectedTenant 
                                        ? tenantModuleAccessList.filter((m) => m.tenantId === selectedTenant.id && m.isEnabled)
                                        : [];
                                      const enabledModuleIds = new Set(enabledCompanyModules.map(m => m.moduleId));
                                      const userModuleCount = user.permissions.filter(p => p.canView && enabledModuleIds.has(p.moduleId)).length;
                                      return `${userModuleCount}/${enabledCompanyModules.length}`;
                                    })()}
                                  </td>
                                  <td style={{ padding: '10px 12px', textAlign: 'center' }}><span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: user.isActive ? '#50d88d' : '#ef6262' }} /></td>
                                  <td style={{ padding: '10px 12px', textAlign: 'center', display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                    <button type="button" onClick={() => openEditUserModal(user)} style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, border: '1px solid #1e2d42', borderRadius: '3px', background: '#101820', color: '#74c1ff', cursor: 'pointer' }}>Edit</button>
                                    {user.isActive ? (
                                      <button type="button" onClick={() => void deactivateUser(user)} style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, border: '1px solid #5a2a2a', borderRadius: '3px', background: '#2b1720', color: '#ffadad', cursor: 'pointer' }}>Deactivate</button>
                                    ) : (
                                      <button type="button" onClick={() => void deactivateUser(user)} style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, border: '1px solid #2a4a2a', borderRadius: '3px', background: '#102720', color: '#9ce8c0', cursor: 'pointer' }}>Activate</button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
            </main>
          ) : (
            <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8fa2bc' }}>
              <p>Select a company to manage</p>
            </main>
          )}
        </div>
      )}

      {showCreateUserModal && selectedTenant && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <form onSubmit={handleCreateUser} style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '8px', width: 'min(500px, 94vw)', border: '1px solid #334155' }}>
            <h2 style={{ marginTop: 0 }}>Add User · {selectedTenant.companyName}</h2>
            {(['fullName', 'email', 'password'] as const).map((field) => (
              <label key={field} style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.8rem' }}>
                {field === 'fullName' ? 'Full name' : field[0].toUpperCase() + field.slice(1)}
                <input required type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'} minLength={field === 'password' ? 8 : undefined} value={userDraft[field]} onChange={(e) => setUserDraft({ ...userDraft, [field]: e.target.value })} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '0.25rem', padding: '0.55rem', background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: '4px' }} />
              </label>
            ))}
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '1rem' }}>
              Role type
              <select value={userDraft.role} onChange={(e) => setUserDraft({ ...userDraft, role: e.target.value as TenantUserRole })} style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.55rem', background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: '4px' }}>
                <option value="Admin">Manager</option>
                <option value="Employee">Executive</option>
                <option value="VesselMaster">Vessel</option>
              </select>
            </label>
            {userDraft.role === 'VesselMaster' && (
              <>
                <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.8rem' }}>
                  Vessel name
                  <input value={userDraft.assignedVesselName ?? ''} onChange={(e) => setUserDraft({ ...userDraft, assignedVesselName: e.target.value })} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '0.25rem', padding: '0.55rem', background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: '4px' }} />
                </label>
                <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '1rem' }}>
                  Vessel IMO
                  <input value={userDraft.assignedVesselImo ?? ''} onChange={(e) => setUserDraft({ ...userDraft, assignedVesselImo: e.target.value })} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '0.25rem', padding: '0.55rem', background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: '4px' }} />
                </label>
              </>
            )}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ color: '#cbd5e1', marginBottom: '0.4rem', fontSize: '13px', fontWeight: 600 }}>Initial module access</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.4rem' }}>
                {modules.filter((module) => tenantModuleAccessList.some((access) => access.moduleId === module.id && access.isEnabled)).map((module) => (
                  <label key={module.id} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', color: '#cbd5e1', fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={userDraft.initialModuleIds?.includes(module.id) ?? false} onChange={(event) => { const ids = userDraft.initialModuleIds ?? []; setUserDraft({ ...userDraft, initialModuleIds: event.target.checked ? [...ids, module.id] : ids.filter((id) => id !== module.id) }); }} />
                    {module.name}
                  </label>
                ))}
              </div>
              <div style={{ color: '#8fa2bc', fontSize: '11px', marginTop: '0.5rem' }}>Only modules enabled for this company are shown</div>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 600, marginBottom: '0.5rem' }}>Status</div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => setUserDraft({ ...userDraft, isActive: true })} style={{ flex: 1, padding: '0.6rem', borderRadius: '4px', border: userDraft.isActive ? '2px solid #2563eb' : '1px solid #475569', background: userDraft.isActive ? '#1a3d6e' : 'transparent', color: userDraft.isActive ? '#74c1ff' : '#cbd5e1', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>Active</button>
                <button type="button" onClick={() => setUserDraft({ ...userDraft, isActive: false })} style={{ flex: 1, padding: '0.6rem', borderRadius: '4px', border: !userDraft.isActive ? '2px solid #ff6b6b' : '1px solid #475569', background: !userDraft.isActive ? '#4a2525' : 'transparent', color: !userDraft.isActive ? '#ff6b6b' : '#cbd5e1', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>Deactivated</button>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" onClick={() => setShowCreateUserModal(false)} style={{ background: '#334155', color: '#fff', border: 0, padding: '0.5rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" style={{ background: '#2563eb', color: '#fff', border: 0, padding: '0.5rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}>Add User</button>
            </div>
          </form>
        </div>
      )}

      {editingUserForUpdate && selectedTenant && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '8px', width: 'min(700px, 94vw)', border: '1px solid #334155', maxHeight: '90vh', overflow: 'auto' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#e8eef8' }}>Edit User</h2>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '1.5rem' }}>Manage user details and module access for {selectedTenant.companyName}</p>

            <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
              {/* User Details */}
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ color: '#cbd5e1', fontSize: '12px', fontWeight: 600 }}>Full Name</span>
                  <input type="text" value={editingUserFullName} onChange={(e) => setEditingUserFullName(e.target.value)} style={{ padding: '0.5rem', border: '1px solid #334155', borderRadius: '4px', background: '#0f1419', color: '#e8eef8', fontSize: '13px' }} />
                </label>
              </div>

              {/* Email field (read-only) */}
              <div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ color: '#cbd5e1', fontSize: '12px', fontWeight: 600 }}>Email</span>
                  <div style={{ padding: '0.5rem', border: '1px solid #334155', borderRadius: '4px', background: '#0a0f15', color: '#8fa2bc', fontSize: '13px' }}>{editingUserForUpdate.email}</div>
                </label>
              </div>

              {/* Role dropdown */}
              <div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ color: '#cbd5e1', fontSize: '12px', fontWeight: 600 }}>Role</span>
                  <select value={editingUserRole} onChange={(e) => setEditingUserRole(e.target.value as TenantUserRole)} style={{ padding: '0.5rem', border: '1px solid #334155', borderRadius: '4px', background: '#0f1419', color: '#e8eef8', fontSize: '13px', cursor: 'pointer' }}>
                    <option value="Admin">Manager</option>
                    <option value="Employee">Executive</option>
                    <option value="VesselMaster">Vessel</option>
                  </select>
                </label>
              </div>

              {/* Active Status Toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#cbd5e1', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={editingUserIsActive} onChange={(e) => setEditingUserIsActive(e.target.checked)} style={{ cursor: 'pointer' }} />
                <span>Active</span>
              </label>
            </div>

            {/* Module Selection Grid */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.5rem', color: '#cbd5e1', fontSize: '14px', fontWeight: 600 }}>Module Access</h3>
                  <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>Selected: <strong style={{ color: '#3b82f6' }}>{editingUserModules.length}</strong> of <strong>{modules.filter((module) => tenantModuleAccessList.some((access) => access.moduleId === module.id && access.isEnabled)).length}</strong> modules</p>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button type="button" onClick={() => { const available = modules.filter((module) => tenantModuleAccessList.some((access) => access.moduleId === module.id && access.isEnabled)).map(m => m.id); setEditingUserModules(available); }} style={{ background: '#0f5132', color: '#fff', border: '1px solid #198754', padding: '0.4rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '11px' }}>Select All</button>
                  <button type="button" onClick={() => setEditingUserModules([])} style={{ background: '#6c1f1f', color: '#fff', border: '1px solid #d32f2f', padding: '0.4rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '11px' }}>Clear All</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.8rem', marginBottom: '1rem' }}>
                {modules.filter((module) => tenantModuleAccessList.some((access) => access.moduleId === module.id && access.isEnabled)).map((module) => {
                  const isSelected = editingUserModules.includes(module.id);
                  return (
                    <label key={module.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.8rem', border: `2px solid ${isSelected ? '#3b82f6' : '#334155'}`, borderRadius: '6px', background: isSelected ? '#1e3a5f' : '#0a0f15', cursor: 'pointer', transition: 'all 0.15s', userSelect: 'none' }} onMouseEnter={(e) => { if (!isSelected) { e.currentTarget.style.background = '#0f1419'; e.currentTarget.style.borderColor = '#475569'; } }} onMouseLeave={(e) => { if (!isSelected) { e.currentTarget.style.background = '#0a0f15'; e.currentTarget.style.borderColor = '#334155'; } }}>
                      <input type="checkbox" checked={isSelected} onChange={(e) => { if (e.target.checked) { setEditingUserModules([...editingUserModules, module.id]); } else { setEditingUserModules(editingUserModules.filter((id) => id !== module.id)); } }} style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                      <span style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 500 }}>{module.name}</span>
                      {isSelected && <span style={{ marginLeft: 'auto', color: '#3b82f6', fontSize: '11px', fontWeight: 600 }}>✓</span>}
                    </label>
                  );
                })}
                {modules.filter((module) => tenantModuleAccessList.some((access) => access.moduleId === module.id && access.isEnabled)).length === 0 && (
                  <p style={{ color: '#8fa2bc', fontSize: '12px', margin: 0, gridColumn: '1 / -1' }}>No modules available. Enable modules for this company first.</p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button type="button" onClick={() => { setEditingUserForUpdate(null); setEditingUserFullName(''); setEditingUserRole('Employee'); setEditingUserModules([]); }} style={{ background: '#334155', color: '#fff', border: 0, padding: '0.5rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button type="button" onClick={() => void saveUserEdit()} style={{ background: '#2563eb', color: '#fff', border: 0, padding: '0.5rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {editingUser && selectedTenant && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '8px', width: 'min(650px, 94vw)', border: '1px solid #334155' }}>
            <h2 style={{ marginTop: 0 }}>Module access · {editingUser.fullName}</h2>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '1rem' }}>Manage permissions for modules enabled in {selectedTenant.companyName}</p>
            <div style={{ display: 'grid', gap: '0.8rem', marginBottom: '1.5rem' }}>
              {modules.filter((module) => tenantModuleAccessList.some((access) => access.moduleId === module.id && access.isEnabled)).map((module) => {
                const permission = editingUser.permissions.find((p) => p.moduleId === module.id);
                return (
                  <div key={module.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: '0.8rem', alignItems: 'center', padding: '0.8rem', border: '1px solid #334155', borderRadius: '4px' }}>
                    <strong style={{ color: '#e8eef8' }}>{module.name}</strong>
                    {(['canView', 'canCreate', 'canEdit', 'canDelete'] as const).map((field) => (
                      <label key={field} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#cbd5e1', fontSize: '12px' }}>
                        <input type="checkbox" checked={Boolean(permission?.[field])} onChange={() => toggleUserPermission(module.id, field)} />
                        {field.replace('can', '')}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" onClick={() => setEditingUser(null)} style={{ background: '#334155', color: '#fff', border: 0, padding: '0.5rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={() => void saveUserPermissions()} style={{ background: '#2563eb', color: '#fff', border: 0, padding: '0.5rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}>Save access</button>
            </div>
          </div>
        </div>
      )}

      {showCreateTenantModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#1e293b', padding: '2rem', borderRadius: '8px', width: '100%', maxWidth: '500px', border: '1px solid #334155' }}>
            <h2 style={{ marginTop: 0, marginBottom: '1.25rem' }}>Add Company</h2>
            <form onSubmit={handleCreateTenant}>
              <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '1rem' }}>
                Company Name
                <input type="text" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.6rem', borderRadius: '4px', background: '#0f172a', border: '1px solid #334155', color: '#fff', boxSizing: 'border-box' }} placeholder="e.g. Oceanic Shipping Ltd" />
              </label>
              <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '1rem' }}>
                Admin Full Name
                <input type="text" required value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.6rem', borderRadius: '4px', background: '#0f172a', border: '1px solid #334155', color: '#fff', boxSizing: 'border-box' }} placeholder="e.g. Captain Sarah Connor" />
              </label>
              <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '1rem' }}>
                Admin Email
                <input type="email" required value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.6rem', borderRadius: '4px', background: '#0f172a', border: '1px solid #334155', color: '#fff', boxSizing: 'border-box' }} placeholder="admin@company.com" />
              </label>
              <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '1rem' }}>
                Admin Password
                <input type="password" required minLength={8} value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.6rem', borderRadius: '4px', background: '#0f172a', border: '1px solid #334155', color: '#fff', boxSizing: 'border-box' }} placeholder="Min 8 characters" />
              </label>
              <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '1.5rem' }}>
                Initial Enabled Modules
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  {modules.map((m) => (
                    <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', color: '#cbd5e1' }}>
                      <input type="checkbox" checked={selectedInitialModules.includes(m.id)} onChange={(e) => { if (e.target.checked) { setSelectedInitialModules([...selectedInitialModules, m.id]); } else { setSelectedInitialModules(selectedInitialModules.filter((id) => id !== m.id)); } }} />
                      {m.name}
                    </label>
                  ))}
                </div>
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setShowCreateTenantModal(false)} style={{ background: '#334155', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={isSavingTenant} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '4px', cursor: 'pointer' }}>{isSavingTenant ? 'Creating...' : 'Add Company'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditTenantModal && editingTenant && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: '#1e293b', padding: '2rem', borderRadius: '8px', width: '100%', maxWidth: '550px', border: '1px solid #334155', maxHeight: '90vh', overflow: 'auto' }}>
            <h2 style={{ marginTop: 0, marginBottom: '1.25rem', color: '#e8eef8' }}>Edit Company</h2>
            
            <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', color: '#cbd5e1' }}>
                Company Name
                <input type="text" value={editingTenantCompanyName} onChange={(e) => setEditingTenantCompanyName(e.target.value)} style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.6rem', borderRadius: '4px', background: '#0f172a', border: '1px solid #334155', color: '#fff', boxSizing: 'border-box', fontSize: '13px' }} />
              </label>
              
              <label style={{ display: 'block', color: '#cbd5e1' }}>
                Admin Full Name
                <input type="text" value={editingTenantAdminFullName} onChange={(e) => setEditingTenantAdminFullName(e.target.value)} style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.6rem', borderRadius: '4px', background: '#0f172a', border: '1px solid #334155', color: '#fff', boxSizing: 'border-box', fontSize: '13px' }} />
              </label>
              
              <label style={{ display: 'block', color: '#cbd5e1' }}>
                Admin Email
                <input type="email" value={editingTenantAdminEmail} onChange={(e) => setEditingTenantAdminEmail(e.target.value)} style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.6rem', borderRadius: '4px', background: '#0f172a', border: '1px solid #334155', color: '#fff', boxSizing: 'border-box', fontSize: '13px' }} />
              </label>
              
              <label style={{ display: 'block', color: '#cbd5e1' }}>
                Enabled Modules
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.8rem', marginTop: '0.5rem' }}>
                  {modules.map((module) => (
                    <label key={module.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.8rem', border: '1px solid #334155', borderRadius: '6px', background: '#0a0f15', cursor: 'pointer', transition: 'all 0.15s', userSelect: 'none' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#0f1419'; e.currentTarget.style.borderColor = '#475569'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#0a0f15'; e.currentTarget.style.borderColor = '#334155'; }}>
                      <input type="checkbox" checked={editingTenantModules.includes(module.id)} onChange={(e) => { if (e.target.checked) { setEditingTenantModules([...editingTenantModules, module.id]); } else { setEditingTenantModules(editingTenantModules.filter((id) => id !== module.id)); } }} style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                      <span style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 500 }}>{module.name}</span>
                    </label>
                  ))}
                </div>
              </label>

              {/* Company Status Section */}
              <div style={{ padding: '1rem', background: '#0f1419', borderRadius: '6px', border: '1px solid #334155' }}>
                <div style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 600, marginBottom: '0.75rem' }}>Company Status</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <span style={{ background: editingTenantIsActive ? '#113225' : '#351c25', color: editingTenantIsActive ? '#78e1a7' : '#ffadad', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                    {editingTenantIsActive ? 'ACTIVE' : 'SUSPENDED'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {editingTenantIsActive ? (
                    <button 
                      type="button" 
                      onClick={() => void handleToggleTenantStatusInModal()} 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '12px', fontWeight: 600, border: '1px solid #5a2a2a', borderRadius: '4px', background: '#2b1720', color: '#ffadad', cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#3a2720'; e.currentTarget.style.borderColor = '#7a3a3a'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#2b1720'; e.currentTarget.style.borderColor = '#5a2a2a'; }}
                    >
                      <i className="fas fa-pause" style={{ marginRight: '0.3rem' }} /> Suspend
                    </button>
                  ) : (
                    <button 
                      type="button" 
                      onClick={() => void handleToggleTenantStatusInModal()} 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '12px', fontWeight: 600, border: '1px solid #2a4a2a', borderRadius: '4px', background: '#102720', color: '#9ce8c0', cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#143a30'; e.currentTarget.style.borderColor = '#4a7a5a'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#102720'; e.currentTarget.style.borderColor = '#2a4a2a'; }}
                    >
                      <i className="fas fa-play" style={{ marginRight: '0.3rem' }} /> Activate
                    </button>
                  )}
                  <button 
                    type="button" 
                    onClick={() => void handleDeleteTenantInModal()} 
                    disabled={isDeletingTenant}
                    style={{ padding: '0.4rem 0.8rem', fontSize: '12px', fontWeight: 600, border: '1px solid #7a3a3a', borderRadius: '4px', background: '#4a2525', color: '#ff6b6b', cursor: isDeletingTenant ? 'not-allowed' : 'pointer', transition: 'all 0.15s', opacity: isDeletingTenant ? 0.6 : 1 }}
                    onMouseEnter={(e) => { if (!isDeletingTenant) { e.currentTarget.style.background = '#5a3535'; e.currentTarget.style.borderColor = '#9a5a5a'; } }}
                    onMouseLeave={(e) => { if (!isDeletingTenant) { e.currentTarget.style.background = '#4a2525'; e.currentTarget.style.borderColor = '#7a3a3a'; } }}
                  >
                    <i className="fas fa-trash" style={{ marginRight: '0.3rem' }} /> {isDeletingTenant ? 'Deleting...' : 'Delete Company'}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button type="button" onClick={() => { setShowEditTenantModal(false); setEditingTenant(null); setEditingTenantCompanyName(''); setEditingTenantAdminFullName(''); setEditingTenantAdminEmail(''); setEditingTenantModules([]); }} style={{ background: '#334155', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button type="button" onClick={() => void saveEditTenant()} disabled={isSavingCompanyEdit} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '4px', cursor: isSavingCompanyEdit ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: isSavingCompanyEdit ? 0.6 : 1 }}>{isSavingCompanyEdit ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
