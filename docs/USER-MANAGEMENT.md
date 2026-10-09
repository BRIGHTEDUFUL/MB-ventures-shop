# User Management System

**Date:** 2025-01-10  
**Project:** MB Ventures GH

---

## Overview

The MB Ventures GH platform has comprehensive user management capabilities:

- ✅ **All Users** can update their own profile and change their password
- ✅ **Admin Users** can perform full CRUD operations on all accounts
- ✅ **Admin Users** can create staff accounts and manage roles
- ✅ **Admin Users** can view all users (staff and customers)

---

## User Capabilities

### All Authenticated Users Can:

**1. Update Own Profile**
- Change name
- Change phone number
- Email cannot be changed (security requirement)

**Function:** `users.updateProfile`

```typescript
// Example
await updateProfile({
  name: "New Name",
  phone: "+233 24 123 4567"
});
```

**2. Change Own Password**
- Request password reset via email
- Use reset link to set new password
- Password requirements: Minimum 8 characters

**Function:** `auth.requestPasswordReset`

```typescript
// Example
await requestPasswordReset({
  email: "user@example.com"
});
```

---

## Admin Capabilities

### Admin Users Can Perform Full CRUD:

**1. Create Accounts (via Staff Management)**

Add staff member by email (user must register first):

```typescript
await addStaff({
  email: "newstaff@mbventuresghana.com",
  role: "staff" // or "admin"
});
```

**2. Read (View) Users**

**View All Staff Members:**
```typescript
const staffMembers = await team();
// Returns: id, name, email, phone, role
```

**View All Users (Staff + Customers):**
```typescript
const allUsers = await allUsers({
  limit: 50,
  search: "optional search term"
});
// Returns: id, name, email, phone, role, hasStaffAccess
```

**View Single User Details:**
```typescript
const user = await getUserDetails({
  user_id: "user_id_here"
});
// Returns: id, email, name, phone, role, permissions, permissionOverrides
```

**3. Update Users**

**Update User Profile:**
```typescript
await adminUpdateUser({
  user_id: "user_id_here",
  name: "Updated Name",
  phone: "+233 24 999 8888"
});
```

**Change User Role:**
```typescript
await setRole({
  user_id: "user_id_here",
  role: "admin" // or "staff"
});
```

**Set Individual Permissions:**
```typescript
await setPermission({
  user_id: "user_id_here",
  permission: "catalogue.edit",
  granted: true // true to grant, false to deny, null to reset to default
});
```

**4. Delete Users**

```typescript
await deleteUser({
  user_id: "user_id_here"
});
```

**Protection Rules:**
- Cannot delete yourself
- Cannot delete the last admin (must promote someone else first)
- Deletes user account and all associated role data

---

## Staff Management Workflow

### Adding a New Staff Member

**Step 1: User Self-Registers**
- User goes to `/auth/signup`
- Enters: name, email, phone, password
- Creates customer account

**Step 2: Admin Grants Staff Access**
- Admin signs in to `/staff`
- Goes to Team Management (when UI is built)
- Adds user by email
- Selects role: `staff` or `admin`

**Alternative (CLI Method):**
```powershell
# Windows PowerShell
npx convex run users:grantStaff '{\"email\":\"user@example.com\"}' --prod
```

```bash
# Mac/Linux
npx convex run users:grantStaff '{"email":"user@example.com"}' --prod
```

### Changing Staff Roles

Admin can promote staff to admin or demote admin to staff:

```typescript
await setRole({
  user_id: "user_id_here",
  role: "admin" // or "staff"
});
```

**Protection Rule:** Must have at least one admin at all times.

### Removing Staff Access

Admin can revoke staff access entirely:

```typescript
await revokeRole({
  user_id: "user_id_here"
});
```

**Protection Rules:**
- Cannot remove your own access
- Cannot remove the last admin

---

## Password Management

### User Changes Own Password

**Option 1: Password Reset Flow (Recommended)**
1. User clicks "Forgot Password" at `/auth/signin`
2. Enters email address
3. Receives reset link via email
4. Clicks link, enters new password
5. Password updated

**Option 2: Change Password (When Signed In)**
*Note: Currently uses reset flow - can be extended for in-app change*

### Admin Resets User Password

**Option 1: User Self-Service (Recommended)**
- Tell user to use "Forgot Password" flow
- They receive reset link via email
- They set their own new password

**Option 2: Admin Forces Reset (Future Enhancement)**
*Can be implemented to generate temporary password*

---

## Permission System

### Default Permissions by Role

**Admin Role:**
- All permissions (full access)
- Can manage team members
- Can configure Mobile Money wallet
- Can adjust delivery fees

**Staff Role:**
- View and edit catalogue
- Manage orders
- Adjust inventory
- View customers
- Cannot manage team
- Cannot configure Mobile Money
- Cannot adjust delivery fees

### Custom Permissions (Per-User Overrides)

Admin can grant or deny specific permissions to individual users:

```typescript
// Grant a specific permission to a staff member
await setPermission({
  user_id: "staff_user_id",
  permission: "catalogue.delete", // Staff role doesn't have this by default
  granted: true
});

// Deny a permission to an admin (rare, but possible)
await setPermission({
  user_id: "admin_user_id",
  permission: "catalogue.delete",
  granted: false
});

// Reset to role default
await setPermission({
  user_id: "user_id",
  permission: "catalogue.delete",
  granted: null
});
```

### Available Permissions

**Catalogue:**
- `catalogue.view` - View products
- `catalogue.edit` - Create/edit products
- `catalogue.delete` - Delete products
- `catalogue.bulk` - Bulk operations
- `catalogue.categories` - Manage categories
- `catalogue.settings` - Storefront copy, featured picks
- `catalogue.delivery` - Delivery zone fees
- `catalogue.momo` - Mobile Money wallet (admin-only by default)

**Inventory:**
- `inventory.view` - View stock levels
- `inventory.adjust` - Adjust stock manually
- `inventory.stocktake` - Perform stocktakes

**Orders:**
- `orders.view` - View orders
- `orders.update` - Update order status

**Team:**
- `team.view` - View team roster
- `team.manage` - Add/remove/edit team members (admin-only by default)

---

## API Functions Reference

### Public Queries (No Auth Required)
*None - all user management requires authentication*

### User Queries (Authenticated)
- `users.me` - Get own profile
- `users.isStaff` - Check if user has staff access
- `users.myRole` - Get own role (`admin`, `staff`, or `null`)
- `users.myPermissions` - Get list of granted permissions

### User Mutations (Authenticated)
- `users.updateProfile` - Update own profile (name, phone)

### Staff Queries (Staff Access Required)
- `users.team` - View all staff members

### Admin Queries (Admin Role Required)
- `users.getUserDetails` - View single user with full details
- `users.allUsers` - View all users (staff + customers)

### Admin Mutations (Admin Role Required)
- `users.addStaff` - Grant staff access to existing account
- `users.setRole` - Change user's role (admin <-> staff)
- `users.revokeRole` - Remove staff access
- `users.setPermission` - Grant/deny specific permissions
- `users.adminUpdateUser` - Update another user's profile
- `users.deleteUser` - Delete user account permanently

### Public Actions
- `auth.requestPasswordReset` - Request password reset email

---

## Security Considerations

### Email Changes Not Allowed
- Email is the unique identifier for authentication
- Cannot be changed after account creation
- Prevents account hijacking
- If email change needed, create new account

### Password Security
- Minimum 8 characters (enforced by Convex Auth)
- Reset tokens expire after 60 minutes
- Reset links are one-time use
- All password resets logged in activity feed

### Role Protection
- At least one admin must exist at all times
- Cannot delete or demote yourself if you're the last admin
- Cannot remove your own access

### Audit Trail
- All admin actions logged to activity feed
- User updates logged
- Role changes logged
- Permission changes logged
- Password resets logged

---

## UI Integration (Frontend)

### Account Settings Page (`/account`)

**All Users Should See:**
- Profile section (name, phone - editable)
- Email (display only, not editable)
- Change password button (triggers reset flow)
- Order history
- Saved addresses

### Staff Dashboard (`/staff`)

**Team Management Section (Admin Only):**
- List all staff members
- Add staff button
- For each staff member:
  - Name, email, role
  - Edit button (change role, adjust permissions)
  - Remove access button
- Search/filter staff

**Users List Section (Admin Only):**
- List all users (staff + customers)
- Search by name, email, phone
- View user details button
- Grant staff access button
- For staff users: Manage role/permissions

---

## Testing

### Test User Management Functions

```typescript
// 1. User updates own profile
const updated = await updateProfile({
  name: "Test User Updated",
  phone: "+233 24 111 2222"
});

// 2. Admin views all users
const users = await allUsers({ limit: 10 });
console.log(`Found ${users.length} users`);

// 3. Admin adds staff
const added = await addStaff({
  email: "newstaff@test.com",
  role: "staff"
});

// 4. Admin changes role
const changed = await setRole({
  user_id: "j571234567890",
  role: "admin"
});

// 5. User requests password reset
const reset = await requestPasswordReset({
  email: "user@test.com"
});
```

---

## Migration Notes

### Existing Accounts
- All existing accounts can immediately use profile updates
- Admins can immediately manage all users
- No database migration needed - functions work with existing schema

### From CLI to UI
- Current: `grantStaff` via CLI
- Future: "Add Staff" button in admin panel
- Both methods work simultaneously

---

## Future Enhancements

### Potential Additions
1. **In-App Password Change:** Change password without email reset
2. **Admin Force Reset:** Generate temporary password for user
3. **Email Verification:** Verify email addresses on signup
4. **Two-Factor Authentication:** Add 2FA option for sensitive accounts
5. **Account Suspension:** Temporarily disable accounts without deletion
6. **Bulk User Import:** CSV import for multiple staff members
7. **Activity History Per User:** View full audit trail for specific user

---

**Last Updated:** 2025-01-10  
**Status:** ✅ Fully Implemented
