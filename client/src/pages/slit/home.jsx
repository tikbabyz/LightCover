import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, ArrowRight, History } from 'lucide-react';
import { RiArrowGoBackLine } from 'react-icons/ri';
import { useSlit, getLoggedInUser, getDisplayNameFromUser } from '../../context/SlitContext';

export const Home = () => {
  const navigate = useNavigate();
  const { header } = useSlit();
  const loggedInUser = getLoggedInUser();
  const operatorName = getDisplayNameFromUser(loggedInUser) || header?.operatorName || 'Operator';

  const cards = [
    {
      route: '/create-slit',
      label: 'บันทึกการผลิต',
      desc: 'บันทึกและคำนวณข้อมูลการผลิต SLIT ประจำวัน',
      badge: 'DATA ENTRY',
      icon: ClipboardList
    },
    {
      route: '/slit-history',
      label: 'รายงานการผลิต',
      desc: 'ค้นหา ตรวจสอบ และติดตามข้อมูลประวัติการผลิตย้อนหลังทั้งหมด',
      badge: 'HISTORY',
      icon: History
    }
  ];

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 64px)',
        background: '#f1f5f9',
        fontFamily: "'TH Sarabun New', 'Sarabun', -apple-system, sans-serif"
      }}
    >
      {/* ── Banner ── */}
      <div
        style={{
          position: 'relative',
          background: 'linear-gradient(to right, #021338, #003B73, #00B4D8)',
          color: 'white',
          paddingTop: '48px',
          paddingBottom: '100px',
          paddingLeft: '48px',
          paddingRight: '48px',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '-48px',
            right: '-48px',
            width: '320px',
            height: '320px',
            background: 'rgba(34, 211, 238, 0.15)',
            borderRadius: '9999px',
            filter: 'blur(60px)',
            pointerEvents: 'none'
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: '33%',
            width: '256px',
            height: '256px',
            background: 'rgba(59, 130, 246, 0.12)',
            borderRadius: '9999px',
            filter: 'blur(50px)',
            pointerEvents: 'none'
          }}
        />

        <div
          style={{
            maxWidth: '1080px',
            margin: '0 auto',
            position: 'relative',
            zIndex: 10,
            textAlign: 'left'
          }}
        >
          {/* Top Row: Back to Portal button + Dept Tag */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => navigate('/')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                borderRadius: '9999px',
                background: '#ffffff',
                border: '2px solid rgba(255, 255, 255, 0.9)',
                color: '#1e3a8a',
                fontSize: '13.5px',
                fontWeight: 900,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.12)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
              className="hover:scale-105 hover:bg-blue-50 active:scale-95"
              title="กลับสู่หน้า Portal รวม"
            >
              <RiArrowGoBackLine size={16} />
              <span>กลับ</span>
            </button>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '5px 14px',
                borderRadius: '9999px',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#cffafe',
                fontSize: '11px',
                fontWeight: 700,
                backdropFilter: 'blur(8px)'
              }}
            >
              LIGHT COVER · SLIT Production Management System
            </div>
          </div>

          <h1
            style={{
              fontSize: 'clamp(28px, 4vw, 44px)',
              fontWeight: 900,
              lineHeight: 1.2,
              margin: 0,
              letterSpacing: '-0.5px'
            }}
          >
            สวัสดี,{' '}
            <span
              style={{
                background: 'linear-gradient(to right, #ffffff, #cffafe, #fcd34d)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              {operatorName}
            </span>{' '}
            !
          </h1>

          <p
            style={{
              color: 'rgba(207, 250, 254, 0.75)',
              fontSize: '15px',
              lineHeight: 2,
              margin: '20px 0 0 0'
            }}
          >
            ยินดีต้อนรับเข้าสู่ระบบ เลือกเมนูการทำงานที่ต้องการได้จากรายการด้านล่าง
          </p>
        </div>
      </div>

      {/* ── Floating Cards ── */}
      <main
        style={{
          maxWidth: '1080px',
          margin: '0 auto',
          padding: '0 24px 64px 24px',
          marginTop: '-60px',
          position: 'relative',
          zIndex: 20
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '24px'
          }}
        >
          {cards.map(({ route, label, desc, badge, icon: Icon }) => (
            <div
              key={route}
              style={{
                background: 'white',
                border: '1px solid rgba(207, 250, 254, 0.6)',
                borderRadius: '18px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 8px 30px rgba(8, 145, 178, 0.08)',
                transition: 'box-shadow 0.25s ease, transform 0.25s ease',
                cursor: 'default'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 16px 40px rgba(8, 145, 178, 0.15)';
                e.currentTarget.style.transform = 'translateY(-5px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 8px 30px rgba(8, 145, 178, 0.08)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '16px'
                  }}
                >
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: '#ecfeff',
                      color: '#0e7490',
                      border: '1px solid #a5f3fc'
                    }}
                  >
                    {badge}
                  </span>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #1e3a8a, #0891b2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      boxShadow: '0 4px 10px rgba(30, 58, 138, 0.2)'
                    }}
                  >
                    <Icon size={20} />
                  </div>
                </div>

                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                  {label}
                </h3>
                <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px', lineHeight: 1.6 }}>
                  {desc}
                </p>
              </div>

              <div style={{ marginTop: '24px', paddingTop: '18px', borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  onClick={() => navigate(route)}
                  style={{
                    width: '100%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    background: '#f59e0b',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 800,
                    padding: '10px 20px',
                    borderRadius: '9999px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s ease, transform 0.1s ease',
                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#d97706';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f59e0b';
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = 'scale(0.97)';
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <span>เข้าใช้งาน</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Home;
