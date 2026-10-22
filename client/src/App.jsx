import React, { lazy, Suspense } from "react";
import Navbar from "./components/navbar.jsx";
import Portal from "./pages/portal.jsx";
import "./App.css";

// Dynamic Code Splitting for heavy pages (reduces initial bundle size and speeds up page load)
const Home = lazy(() => import("./pages/slit/home.jsx"));
const CreateSlit = lazy(() => import("./pages/slit/create-slit.jsx"));
const SlitHistory = lazy(() => import("./pages/slit/slit-history.jsx"));
const SlitReport = lazy(() => import("./pages/slit/slit-report.jsx"));

const IpoTubeHome = lazy(() => import("./pages/ipo-tube/home.jsx"));
const CreateIpoTube = lazy(() => import("./pages/ipo-tube/create-ipo-tube.jsx"));
const IpoTubeHistory = lazy(() => import("./pages/ipo-tube/ipo-tube-history.jsx"));
const IpoTubeReport = lazy(() => import("./pages/ipo-tube/ipo-tube-report.jsx"));

const Login = lazy(() => import("./pages/auth/login.jsx"));
const Register = lazy(() => import("./pages/auth/register.jsx"));

import {
  BrowserRouter as Router,
  Outlet,
  Route,
  Routes,
  useLocation,
  Navigate,
} from "react-router-dom";

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { SlitProvider } from "./context/SlitContext";
import { IpoTubeProvider } from "./context/IpoTubeContext";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";

const PageLoadingFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-[50vh] w-full gap-3 text-slate-500">
    <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
    <span className="text-xs font-semibold tracking-wide text-slate-400">กำลังโหลดข้อมูล...</span>
  </div>
);

function AppLayout() {
  const location = useLocation();
  const isFullWidthPage = location.pathname === "/" || location.pathname === "/slit" || location.pathname === "/ipo-tube";
  const isCreatePage = location.pathname.includes("create");

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      <Navbar />
      <Suspense fallback={<PageLoadingFallback />}>
        {isFullWidthPage ? (
          <main className="flex-1 w-full">
            <Outlet />
          </main>
        ) : isCreatePage ? (
          <main className="flex-1 w-full max-w-[1720px] mx-auto px-2 sm:px-4 lg:px-6 py-2">
            <Outlet />
          </main>
        ) : (
          <main className="flex-1 w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-5">
            <Outlet />
          </main>
        )}
      </Suspense>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <SlitProvider>
        <IpoTubeProvider>
          <Router>
            <Suspense fallback={<PageLoadingFallback />}>
              <Routes>
                {/* 🔒 Protected Routes (ต้องเข้าสู่ระบบก่อนเท่านั้น หากไม่มี Token จะเด้งไป /login) */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    {/* 🏠 Main Portal */}
                    <Route path="/" element={<Portal />} />

                    {/* 🔵 SLIT Module (PIPE LINE) */}
                    <Route path="/slit" element={<Home />} />
                    <Route path="/slit/create" element={<CreateSlit />} />
                    <Route path="/slit/create/:id" element={<CreateSlit />} />
                    <Route path="/slit/view/:id" element={<CreateSlit />} />
                    <Route path="/slit/list" element={<Navigate to="/slit/history" replace />} />
                    <Route path="/slit/history" element={<SlitHistory />} />

                    {/* SLIT Backward-compatible Routes */}
                    <Route path="/create-slit" element={<CreateSlit />} />
                    <Route path="/create-slit/:id" element={<CreateSlit />} />
                    <Route path="/create-slit/view/:id" element={<CreateSlit />} />
                    <Route path="/slit-list" element={<Navigate to="/slit-history" replace />} />
                    <Route path="/slit-history" element={<SlitHistory />} />

                    {/* 🟢 IPO TUBE Module (PIPE SET) */}
                    <Route path="/ipo-tube" element={<IpoTubeHome />} />
                    <Route path="/ipo-tube/create" element={<CreateIpoTube />} />
                    <Route path="/ipo-tube/create/:id" element={<CreateIpoTube />} />
                    <Route path="/ipo-tube/list" element={<Navigate to="/ipo-tube/history" replace />} />
                    <Route path="/ipo-tube/history" element={<IpoTubeHistory />} />

                    {/* IPO TUBE Backward-compatible Routes */}
                    <Route path="/ipo-tube-history" element={<Navigate to="/ipo-tube/history" replace />} />
                    <Route path="/ipo-tube-list" element={<Navigate to="/ipo-tube/history" replace />} />
                  </Route>

                  {/* 📄 Protected Report Views (เต็มหน้าจอ/สำหรับพิมพ์ แต่ต้องล็อกอินก่อนเข้าถึง) */}
                  <Route path="/slit-report/:jobNumber" element={<SlitReport />} />
                  <Route path="/ipo-tube/report/:jobNumber" element={<IpoTubeReport />} />
                  <Route path="/ipo-tube-report/:jobNumber" element={<IpoTubeReport />} />
                </Route>

                {/* 🔓 Public Routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>

          <ToastContainer
            position="top-right"
            autoClose={3000}
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            pauseOnHover
            draggable
          />
        </Router>
        </IpoTubeProvider>
      </SlitProvider>
    </ErrorBoundary>
  );
}

export default App;
