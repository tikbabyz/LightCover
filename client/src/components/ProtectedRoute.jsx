import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isTokenExpired } from '../services/authHelper';

/**
 * Component ดักจับการเข้าถึง Route
 * หากไม่มี Token, ไม่มี User หรือ Token หมดอายุ จะ Redirect ไปยังหน้า /login ทันที
 */
export const ProtectedRoute = () => {
  const location = useLocation();
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');

  if (!token || !user || isTokenExpired(token)) {
    // ล้าง token เก่าที่หมดอายุทิ้งเพื่อไม่ให้ค้างในเครื่อง
    if (token && isTokenExpired(token)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
