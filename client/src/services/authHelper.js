/**
 * authHelper.js
 * ศูนย์รวมฟังก์ชันจัดการข้อมูลสิทธิ์ (Role) และผู้ใช้งานปัจจุบัน
 */

export const getLoggedInUser = () => {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      return JSON.parse(userStr);
    }
  } catch {
    // ignore
  }
  return null;
};

/**
 * ดึง Role ของผู้ใช้ ตรวจจับจากทั้ง User Object และ JWT Token Claims
 * @returns {string} เช่น 'officer', 'operator', 'admin'
 */
export const getUserRole = (user = getLoggedInUser()) => {
  if (user) {
    const directRole =
      user.Role ||
      user.role ||
      user.UserRole ||
      user.userRole ||
      (Array.isArray(user.roles) ? user.roles[0] : '') ||
      (Array.isArray(user.Roles) ? user.Roles[0] : '');

    if (directRole && typeof directRole === 'string') {
      return directRole.trim().toLowerCase();
    }
  }

  // Fallback: ถอดรหัส JWT Token
  const decoded = decodeJwtPayload();
  if (decoded) {
    const tokenRole =
      decoded.role ||
      decoded.Role ||
      decoded.roles ||
      decoded['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ||
      decoded['roleid'];

    if (tokenRole) {
      const rStr = Array.isArray(tokenRole) ? tokenRole[0] : tokenRole;
      return String(rStr).trim().toLowerCase();
    }
  }

  return 'operator';
};

/**
 * ถอดรหัส Payload ของ JWT Token
 * @param {string} token 
 * @returns {object|null}
 */
export const decodeJwtPayload = (token = localStorage.getItem('token')) => {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }
  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return null;
    return JSON.parse(
      decodeURIComponent(
        atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      )
    );
  } catch {
    return null;
  }
};

/**
 * ตรวจสอบว่า JWT Token หมดอายุแล้วหรือไม่
 * @param {string} token 
 * @returns {boolean} true ถ้าหมดอายุแล้ว หรือไม่มี token หรือ token ไม่ถูกต้อง
 */
export const isTokenExpired = (token = localStorage.getItem('token')) => {
  if (!token) return true;
  const decoded = decodeJwtPayload(token);
  if (!decoded) return true;
  if (decoded.exp) {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    return decoded.exp < currentTimestamp;
  }
  return false;
};

/**
 * ตรวจสอบว่าผู้ใช้ปัจจุบันมีสิทธิ์เป็น Officer (หรือ Admin / Supervisor) หรือไม่
 */
export const isOfficerUser = (user = getLoggedInUser()) => {
  const role = getUserRole(user);
  const dept = String(user?.department || user?.Department || user?.dept || user?.Dept || '').toLowerCase();
  return (
    role.includes('officer') ||
    role.includes('office') ||
    role.includes('admin') ||
    role.includes('it') ||
    role.includes('supervisor') ||
    role.includes('manager') ||
    role.includes('lead') ||
    role.includes('foreman') ||
    role.includes('forman') ||
    dept.includes('office') ||
    dept.includes('foreman') ||
    dept.includes('forman')
  );
};

/**
 * ดึงชื่อแสดงผลของผู้ใช้
 */
export const getDisplayName = (user = getLoggedInUser()) => {
  if (!user) return 'Operator';
  const fn = (user.FirstName || user.firstName || '').trim();
  const ln = (user.LastName || user.lastName || '').trim();
  const full = [fn, ln].filter(Boolean).join(' ');
  if (full) return full;
  return user.Username || user.username || 'Operator';
};

/**
 * ดึงรหัสพนักงาน
 */
export const getEmployeeId = (user = getLoggedInUser()) => {
  if (!user) return '';
  const emp = user.EmployeeId || user.employeeId || user.id || '';
  if (!emp) return '';
  return String(emp).startsWith('EMP-') ? String(emp) : `EMP-${emp}`;
};
