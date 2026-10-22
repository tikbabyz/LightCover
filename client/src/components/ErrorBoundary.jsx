import React from 'react';
import { AlertTriangle, RefreshCw, Trash2, Home } from 'lucide-react';

const LOCAL_STORAGE_SESSION_KEY = 'slit_production_session_v2';
const LOCAL_STORAGE_JOBS_KEY = 'slit_production_jobs_v2';
const LOCAL_STORAGE_IPO_SESSION_KEY = 'ipo_tube_production_session_v1';
const LOCAL_STORAGE_IPO_JOBS_KEY = 'ipo_tube_production_jobs_v1';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetIpoOnly = () => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_IPO_JOBS_KEY);
      localStorage.removeItem(LOCAL_STORAGE_IPO_SESSION_KEY);
      sessionStorage.removeItem(LOCAL_STORAGE_IPO_JOBS_KEY);
      sessionStorage.removeItem(LOCAL_STORAGE_IPO_SESSION_KEY);
    } catch (e) {
      console.error(e);
    }
    window.location.reload();
  };

  handleResetStorage = () => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_JOBS_KEY);
      localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
      localStorage.removeItem(LOCAL_STORAGE_IPO_JOBS_KEY);
      localStorage.removeItem(LOCAL_STORAGE_IPO_SESSION_KEY);
      sessionStorage.clear();
    } catch (e) {
      console.error(e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8fafc',
          padding: '24px',
          fontFamily: "'TH Sarabun New', 'Sarabun', 'Inter', system-ui, sans-serif"
        }}>
          <div style={{
            maxWidth: '560px',
            width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #e2e8f0',
            padding: '32px',
            textAlign: 'center'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px auto'
            }}>
              <AlertTriangle size={28} color="#dc2626" />
            </div>

            <h2 style={{
              fontSize: '20px',
              fontWeight: 800,
              color: '#0f172a',
              margin: '0 0 8px 0'
            }}>
              เกิดข้อผิดพลาดในการแสดงผล (Application Error)
            </h2>

            <p style={{
              fontSize: '14px',
              color: '#64748b',
              lineHeight: 1.6,
              margin: '0 0 20px 0'
            }}>
              ระบบพบข้อผิดพลาดที่ไม่คาดคิดในหน้านี้ คุณสามารถลองโหลดหน้าเว็บใหม่อีกครั้ง หรือรีเซ็ตข้อมูลแคชหากข้อมูลในเครื่องผิดพลาด
            </p>

            {this.state.error && (
              <div style={{
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                padding: '12px',
                fontSize: '12px',
                fontFamily: 'monospace',
                color: '#b91c1c',
                textAlign: 'left',
                overflowX: 'auto',
                marginBottom: '24px'
              }}>
                {this.state.error.toString()}
              </div>
            )}

            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              justifyContent: 'center'
            }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  backgroundColor: '#1d4ed8',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={16} />
                <span>โหลดหน้าเว็บใหม่</span>
              </button>

              <button
                type="button"
                onClick={() => { window.location.href = '/'; }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  backgroundColor: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Home size={16} />
                <span>กลับสู่หน้าแรก</span>
              </button>

              {this.state.error?.toString().includes('ipo_tube') && (
                <button
                  type="button"
                  onClick={this.handleResetIpoOnly}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 18px',
                    backgroundColor: '#e0e7ff',
                    color: '#4338ca',
                    border: '1px solid #c7d2fe',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <Trash2 size={16} />
                  <span>ล้างแคช IPO TUBE (เริ่มใหม่)</span>
                </button>
              )}

              <button
                type="button"
                onClick={this.handleResetStorage}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={16} />
                <span>ล้างแคชทั้งหมด</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
