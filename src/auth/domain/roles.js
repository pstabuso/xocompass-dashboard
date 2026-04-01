export const PM_EMAIL = 'pstabuso@fit.edu.ph';

export const ROLE_PERMISSIONS = {
  pm:         { canCreate: true, canDelete: true, canNudge: true, canDownload: true, viewAll: true, isAdmin: true },
  backend:    { canCreate: false, canDelete: false, canNudge: false, canDownload: false, viewAll: true, isAdmin: false },
  frontend:   { canCreate: false, canDelete: false, canNudge: false, canDownload: false, viewAll: true, isAdmin: false },
  guest:      { canCreate: false, canDelete: false, canNudge: false, canDownload: false, viewAll: true, isAdmin: false },
  restricted: { canCreate: false, canDelete: false, canNudge: false, canDownload: false, viewAll: false, isAdmin: false },
};

export const ROLE_LABELS = {
  pm:         'Project Manager & Documentations Head',
  backend:    'Backend Developer',
  frontend:   'Frontend Developer',
  guest:      'Guest Viewer',
  restricted: 'Restricted',
};

export const AVAILABLE_ROLES = [
  { id: 'pm', label: 'Project Manager & Docs Head' },
  { id: 'backend', label: 'Backend Developer' },
  { id: 'frontend', label: 'Frontend Developer' },
  { id: 'guest', label: 'Guest Viewer' },
];

export const ROLE_ROUTES = {
  pm:         null,
  backend:    null,
  frontend:   null,
  guest:      ['/', '/tasks', '/data', '/defense', '/resources'],
  restricted: ['/'],
};

export function buildUserFromProfile(profile) {
  const effectiveRole = profile.email === PM_EMAIL ? 'pm' : profile.role;
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: ROLE_LABELS[effectiveRole] || effectiveRole,
    roleKey: effectiveRole,
    permissions: ROLE_PERMISSIONS[effectiveRole] || ROLE_PERMISSIONS.guest,
    avatar_url: profile.avatar_url,
  };
}
