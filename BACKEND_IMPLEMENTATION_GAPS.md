# Backend Implementation Gaps - Frontend to Backend Mismatch Audit

**Date:** 2026-09-15  
**Status:** ✅ Database schema complete | ⏳ API endpoints pending

---

## Summary

The frontend is calling **7 major API endpoint groups** that either:
1. **Have NO backend controller** (domain entities created but controllers missing)
2. **Have PARTIAL implementation** (some endpoints exist, others missing)
3. **Require nested/child endpoints** (e.g., voyages under voyage orders)

**Total Missing Endpoints: ~25 endpoint methods**

---

## CRITICAL MISSING ENDPOINTS (Blocking Frontend)

### 1. ❌ Client Management API
**Frontend Files:** `fleetData.ts`, `FleetMenu.tsx`, `ClientDetailsPage.tsx`  
**Intended Base URL:** `/api/clients` (should be http://localhost:5000)

**Missing Endpoints:**
```
GET    /api/clients                      # List all clients
GET    /api/clients/{id}                 # Get single client
POST   /api/clients                      # Create client
PUT    /api/clients/{id}                 # Update client
DELETE /api/clients/{id}                 # Delete client
```

**Frontend Usage:**
```typescript
clients = {
  list: () => api.get<ClientDto[]>(u('/api/clients')),
  get: (id: string) => api.get<ClientDto>(u(`/api/clients/${encodeURIComponent(id)}`)),
};
```

**Backend Status:**
- ✅ Entity Created: `Client.cs` with fields: Name, Kind, Category, Email, ContactName, Phone, Banking details
- ✅ DbContext: `DbSet<Client>` exists
- ✅ Database: Table created with migration
- ❌ Controller: **NO ClientsController.cs**
- ❌ DTOs: **NO ClientDto, CreateClientRequestDto**
- ❌ Queries/Commands: **NO GetClientsQuery, CreateClientCommand, etc.**

---

### 2. ❌ Area Constraints API  
**Frontend Files:** `fleetData.ts`, `AreaConstraintsPage.tsx`, `AreaConstraintsControl.tsx`  
**Intended Base URL:** `/api/area-constraints`

**Missing Endpoints:**
```
GET    /api/area-constraints              # List with optional filters
GET    /api/area-constraints?zoneType=X  # Filter by type
GET    /api/area-constraints?voyageId=X  # Filter by voyage
POST   /api/area-constraints              # Create constraint
PUT    /api/area-constraints/{id}         # Update constraint
DELETE /api/area-constraints/{id}         # Delete constraint
```

**Frontend Usage:**
```typescript
areaConstraints = {
  list: (opts?: { zoneType?: string; voyageId?: string }) => {
    const q = new URLSearchParams();
    if (opts?.zoneType) q.set('zoneType', opts.zoneType);
    if (opts?.voyageId) q.set('voyageId', opts.voyageId);
    return api.get<AreaConstraintDto[]>(u(`/api/area-constraints${qs ? `?${qs}` : ''}`));
  },
};
```

**Backend Status:**
- ✅ Entity Created: `AreaConstraint.cs` with fields: Name, ConstraintType, GeoJSON, coordinates
- ✅ DbContext: `DbSet<AreaConstraint>` exists
- ✅ Database: Table created with migration
- ❌ Controller: **NO AreaConstraintsController.cs**
- ❌ DTOs: **NO AreaConstraintDto**
- ❌ Queries: **NO GetAreaConstraintsQuery**

---

### 3. ❌ Voyage Passages API
**Frontend Files:** `fleetVoyages.ts`, `EstimationRouteMap.tsx`, `InterimTabs.tsx`

**Missing Endpoints:**
```
GET    /api/voyages/{voyageId}/passages            # List passages for voyage
POST   /api/voyages/{voyageId}/passages            # Create passage
GET    /api/passages/{id}                          # Get single passage
PUT    /api/passages/{id}                          # Update passage
DELETE /api/passages/{id}                          # Delete passage
```

**Frontend Usage:**
```typescript
voyage = {
  listPassages: (voyageId: number) =>
    api.get<PassageDto[]>(u(`/api/voyages/${voyageId}/passages`)),
  createPassage: (voyageId: number, body: CreatePassageRequest) =>
    api.post<PassageDto>(u(`/api/voyages/${voyageId}/passages`), body),
};

passage = {
  get: (id: number) => api.get<PassageDto>(u(`/api/passages/${id}`)),
  update: (id: number, body: UpdatePassageRequest) =>
    api.put<PassageDto>(u(`/api/passages/${id}`), body),
  remove: (id: number) => api.delete<void>(u(`/api/passages/${id}`)),
};
```

**Backend Status:**
- ✅ Entity Created: `Passage.cs`, `PassageLeg.cs` exist in codebase
- ✅ DbContext: DbSets exist
- ✅ Database: Tables exist
- ⚠️ VoyagesController: Has basic GET/POST but **NO nested passage endpoints**
- ❌ Controller: **NO PassagesController.cs** for direct passage operations
- ❌ DTOs: Partial (some exist for other operations but not passage-specific)
- ❌ Queries/Commands: **NO passage-specific CQRS operations**

---

### 4. ❌ Active Passage Routing API
**Frontend Files:** `InterimTabs.tsx`, `MapView.tsx`

**Missing Endpoint:**
```
PUT    /api/voyages/{voyageId}/active-passage    # Set active passage
Body: { passageId: number }
```

**Frontend Usage:**
```typescript
voyage = {
  setActivePassage: (voyageId: number, passageId: number) =>
    api.put<VoyageDto>(u(`/api/voyages/${voyageId}/active-passage`), { passageId }),
};
```

**Backend Status:**
- ❌ VoyagesController: **NO PUT /api/voyages/{id}/active-passage endpoint**
- ❌ Command: **NO SetActivePassageCommand**
- ⚠️ Voyage entity has `activePassageId` field but no update logic

---

### 5. ⚠️ Voyage Order Nested Voyages API (PARTIAL)
**Frontend Files:** `fleetVoyages.ts`, `CreateVoyagePage.tsx`

**Missing/Incomplete Endpoints:**
```
GET    /api/voyage-orders/{orderId}/voyages       # ❌ List voyages in order
POST   /api/voyage-orders/{orderId}/voyages       # ❌ Create voyage under order
PUT    /api/voyage-orders/{id}                    # ❌ Update order
DELETE /api/voyage-orders/{id}                    # ❌ Delete order
```

**Frontend Usage:**
```typescript
voyageOrder = {
  get: (id: number) => api.get<VoyageOrderDto>(u(`/api/voyage-orders/${id}`)),
  upsert: (body: CreateVoyageOrderRequest) =>
    api.post<VoyageOrderDto>(u('/api/voyage-orders'), body),
  update: (id: number, body: UpdateVoyageOrderRequest) =>
    api.put<VoyageOrderDto>(u(`/api/voyage-orders/${id}`), body),
  remove: (id: number) => api.delete<void>(u(`/api/voyage-orders/${id}`)),
  listVoyages: (orderId: number) =>
    api.get<VoyageDto[]>(u(`/api/voyage-orders/${orderId}/voyages`)),
  createVoyage: (orderId: number, body: CreateVoyageRequest) =>
    api.post<VoyageDto>(u(`/api/voyage-orders/${orderId}/voyages`), body),
};
```

**Backend Status:**
- ⚠️ VoyageOrdersController: Only has GET (list all) and POST (create)
- ❌ Missing: GET by ID, UPDATE, DELETE, nested voyages endpoints
- ✅ Entities exist but controller is incomplete

---

### 6. ❌ Generic Reference Data API
**Frontend Files:** `fleetData.ts`, `data.ts`, multiple components

**Missing Endpoints:**
```
GET    /api/data                         # List available dataset keys
GET    /api/data/{key}                   # Get specific dataset
```

**Frontend Usage:**
```typescript
data = {
  keys: () => api.get<string[]>(u('/api/data')),
  get: <T>(key: DatasetKey | string) => api.get<T>(u(`/api/data/${key}`)),
};
```

**Expected Dataset Keys:**
- `fleet` - Fleet master data
- `emailTemplates` - Email templates list
- `emailTemplateCategories` - Template categories
- `weatherMarginRoutes` - Weather margin configs
- `limitsDefaults` - Default limits

**Backend Status:**
- ❌ NO controller implementation
- ❌ NO endpoint for generic data passthrough

---

### 7. ❌ Email Templates API (Implied)
**Frontend Files:** `components using emailTemplates` from data endpoint

**Expected Endpoints:**
```
GET    /api/email-templates               # List templates
POST   /api/email-templates               # Create template
PUT    /api/email-templates/{id}          # Update template
DELETE /api/email-templates/{id}          # Delete template
```

**Backend Status:**
- ✅ Entity: `EmailTemplate.cs` created
- ✅ DbContext: DbSet exists
- ✅ Database: Table created
- ❌ Controller: **NO EmailTemplatesController.cs**
- ❌ DTOs, Queries, Commands: **Missing**

---

### 8. ❌ Cargo Master / Reference Data API (Implied)
**Frontend Files:** Components for cargo selection

**Expected Endpoints:**
```
GET    /api/cargo-masters                # List available cargo
POST   /api/cargo-masters                # Add cargo master
```

**Backend Status:**
- ✅ Entity: `CargoMaster.cs` created
- ✅ DbContext: DbSet exists
- ✅ Database: Table created
- ❌ Controller: **NO CargoMastersController.cs**
- ❌ DTOs, Queries, Commands: **Missing**

---

## Implementation Priority

### 🔴 TIER 1 - BLOCKING (Frontend Pages Won't Load)
1. **Client Management** (`/api/clients`) - Used by FleetMenu, ClientDetailsPage
2. **Area Constraints** (`/api/area-constraints`) - Used by AreaConstraintsPage
3. **Voyage Passages** (`/api/voyages/{id}/passages`, `/api/passages/{id}`) - Used by route mapping
4. **Voyage Order nested** (`/api/voyage-orders/{id}/voyages`) - Used by CreateVoyagePage

### 🟡 TIER 2 - HIGH PRIORITY (Missing Workflow Data)
1. **Active Passage Routing** (`PUT /api/voyages/{id}/active-passage`)
2. **Voyage Order CRUD** (PUT/DELETE operations)
3. **Email Templates** (`/api/email-templates`)

### 🟢 TIER 3 - MEDIUM PRIORITY (Reference/Config Data)
1. **Generic Data API** (`/api/data`)
2. **Cargo Master** (`/api/cargo-masters`)
3. **Settlement/Postfix APIs** (Settlement milestone tracking, PDA/FDA management)
4. **Laytime Calculation** (`/api/laytime-calculations`)

---

## Quick Implementation Checklist

For each missing API group, you need to create:

- [ ] **Controller** (e.g., `ClientsController.cs`)
- [ ] **DTOs** 
  - Request: `CreateClientRequestDto`, `UpdateClientRequestDto`
  - Response: `ClientDto`
- [ ] **CQRS Operations**
  - Query: `GetClientsQuery`, `GetClientByIdQuery`
  - Commands: `CreateClientCommand`, `UpdateClientCommand`, `DeleteClientCommand`
- [ ] **Validation** (FluentValidation rules)
- [ ] **Authorization** (Ensure tenant scoping)
- [ ] **Error Handling** (Proper HTTP status codes)

---

## Configuration Issue Note

⚠️ **URL Mismatch Alert:**
- Frontend `fleetData.ts` and `fleetVoyages.ts` call port **5063**
- Backend main API runs on port **5000**
- **These should be UNIFIED** to port 5000 or the frontend files should be updated to remove the hardcoded port

**Suggested Fix:** Update `VITE_FLEETVIEW_API_URL` to use same backend (5000) or remove hardcoded port entirely.

---

## Next Steps

1. **Create remaining Controllers** (Clients, AreaConstraints, Passages, etc.)
2. **Implement DTOs** for all new entities
3. **Add CQRS handlers** (Queries and Commands)
4. **Test endpoints** with Postman or API client
5. **Update Frontend** API file URLs if needed (unify to port 5000)
6. **Integration testing** - end-to-end frontend to database
