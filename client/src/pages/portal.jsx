import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export const Portal = () => {
  const navigate = useNavigate();

  const modules = [
    {
      id: 'slit',
      title: 'SLIT',
      subtitle: 'ระบบบันทึกรายงานการผลิต SLIT',
      tag: 'LIGHT COVER',
      route: '/slit',
      theme: {
        glowColor: 'rgba(37, 99, 235, 0.4)',
        accentDot: '#38bdf8',
        gradient: 'linear-gradient(145deg, #071330 0%, #0c2766 50%, #1e40af 100%)',
        btnText: '#1e3a8a',
        badgeBg: 'rgba(56, 189, 248, 0.14)',
        badgeBorder: 'rgba(56, 189, 248, 0.35)',
        badgeColor: '#cffafe'
      }
    },
    {
      id: 'ipo-tube',
      title: 'IPO',
      subtitle: 'ระบบบันทึกรายงานการผลิต IPO',
      tag: 'LIGHT COVER',
      route: '/ipo-tube',
      theme: {
        glowColor: 'rgba(5, 150, 105, 0.4)',
        accentDot: '#34d399',
        gradient: 'linear-gradient(145deg, #02241b 0%, #064e3b 50%, #047857 100%)',
        btnText: '#064e3b',
        badgeBg: 'rgba(52, 211, 153, 0.14)',
        badgeBorder: 'rgba(52, 211, 153, 0.35)',
        badgeColor: '#a7f3d0'
      }
    }
  ];

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 64px)',
        background: 'radial-gradient(ellipse at 50% 25%, #ffffff 0%, #f1f5f9 45%, #e2e8f0 100%)',
        fontFamily: "'TH Sarabun New', 'Sarabun', -apple-system, sans-serif",
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* ── Background Decorative Layer 1: Precision Tech Dot Grid ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(148, 163, 184, 0.35) 1.2px, transparent 1.2px)',
          backgroundSize: '28px 28px',
          opacity: 0.5,
          pointerEvents: 'none'
        }}
      />

      {/* ── Background Decorative Layer 2: Dual Ambient Glowing Orbs ── */}
      {/* Left Blue Glow behind SLIT */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: '12%',
          width: '460px',
          height: '460px',
          borderRadius: '9999px',
          background: 'radial-gradient(circle, rgba(37, 99, 235, 0.15) 0%, rgba(37, 99, 235, 0) 70%)',
          filter: 'blur(50px)',
          pointerEvents: 'none'
        }}
      />
      {/* Right Emerald Glow behind IPO */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          right: '12%',
          width: '460px',
          height: '460px',
          borderRadius: '9999px',
          background: 'radial-gradient(circle, rgba(5, 150, 105, 0.15) 0%, rgba(5, 150, 105, 0) 70%)',
          filter: 'blur(50px)',
          pointerEvents: 'none'
        }}
      />

      {/* Center Soft Spotlight */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '800px',
          height: '500px',
          borderRadius: '9999px',
          background: 'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0) 75%)',
          pointerEvents: 'none'
        }}
      />
      <style>{`
        .portal-card {
          aspect-ratio: 1 / 1;
          transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
          cursor: pointer;
          user-select: none;
        }
        .portal-card:hover {
          transform: translateY(-10px) scale(1.02);
        }
        .portal-card:active {
          transform: translateY(-3px) scale(0.99);
        }
        .portal-btn {
          color: #ffffff;
          transition: all 0.25s ease;
        }
        .portal-btn-arrow {
          transition: all 0.25s ease;
        }

        /* SLIT Card Hover: White Button with Deep Navy Text & Arrow */
        .portal-card-slit:hover .portal-btn {
          background: #ffffff !important;
          color: #1e3a8a !important;
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
        }
        .portal-card-slit:hover .portal-btn span {
          color: #1e3a8a !important;
        }
        .portal-card-slit:hover .portal-btn-arrow {
          background: #dbeafe !important;
          color: #1e3a8a !important;
          transform: translateX(4px);
        }
        .portal-card-slit:hover .portal-btn-arrow svg {
          stroke: #1e3a8a !important;
          color: #1e3a8a !important;
        }

        /* IPO Card Hover: White Button with Deep Emerald Text & Arrow */
        .portal-card-ipo-tube:hover .portal-btn {
          background: #ffffff !important;
          color: #064e3b !important;
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
        }
        .portal-card-ipo-tube:hover .portal-btn span {
          color: #064e3b !important;
        }
        .portal-card-ipo-tube:hover .portal-btn-arrow {
          background: #d1fae5 !important;
          color: #064e3b !important;
          transform: translateX(4px);
        }
        .portal-card-ipo-tube:hover .portal-btn-arrow svg {
          stroke: #064e3b !important;
          color: #064e3b !important;
        }
      `}</style>

      {/* ── Main Section: 2 Decorated Square Cards ── */}
      <main
        style={{
          maxWidth: '820px',
          width: '100%',
          margin: '0 auto'
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 340px))',
            justifyContent: 'center',
            gap: '36px'
          }}
        >
          {modules.map((mod) => {
            return (
              <div
                key={mod.id}
                className={`portal-card portal-card-${mod.id}`}
                onClick={() => navigate(mod.route)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    navigate(mod.route);
                  }
                }}
                style={{
                  background: mod.theme.gradient,
                  borderRadius: '32px',
                  border: '1.5px solid rgba(255, 255, 255, 0.22)',
                  boxShadow: `inset 0 1px 1px rgba(255, 255, 255, 0.4), 0 16px 36px -8px rgba(15, 23, 42, 0.25)`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  textAlign: 'center',
                  padding: '32px 28px',
                  position: 'relative',
                  overflow: 'hidden',
                  color: '#ffffff'
                }}
              >
                {/* Dotted Grid Tech Overlay */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.15) 1.2px, transparent 1.2px)',
                    backgroundSize: '22px 22px',
                    opacity: 0.35,
                    pointerEvents: 'none'
                  }}
                />

                {/* Glowing Top-Right Ambient Orb */}
                <div
                  style={{
                    position: 'absolute',
                    top: '-50px',
                    right: '-50px',
                    width: '180px',
                    height: '180px',
                    borderRadius: '9999px',
                    background: mod.theme.accentDot,
                    opacity: 0.22,
                    filter: 'blur(50px)',
                    pointerEvents: 'none'
                  }}
                />

                {/* Glowing Bottom-Left Ambient Orb */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '-50px',
                    left: '-50px',
                    width: '180px',
                    height: '180px',
                    borderRadius: '9999px',
                    background: mod.theme.accentDot,
                    opacity: 0.16,
                    filter: 'blur(50px)',
                    pointerEvents: 'none'
                  }}
                />

                {/* 1. Top Sleek Badge */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '6px 14px',
                    borderRadius: '9999px',
                    background: mod.theme.badgeBg,
                    border: `1px solid ${mod.theme.badgeBorder}`,
                    color: mod.theme.badgeColor,
                    fontSize: '11px',
                    fontWeight: 800,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    position: 'relative',
                    zIndex: 2,
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)'
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '9999px',
                      background: mod.theme.accentDot,
                      boxShadow: `0 0 8px ${mod.theme.accentDot}`
                    }}
                  />
                  <span>{mod.tag}</span>
                </div>

                {/* 2. Center Hero Typography */}
                <div style={{ position: 'relative', zIndex: 2, margin: 'auto 0' }}>
                  <h2
                    style={{
                      fontSize: '54px',
                      fontWeight: 900,
                      lineHeight: 1,
                      letterSpacing: '3px',
                      margin: 0,
                      color: '#ffffff',
                      textShadow: '0 4px 20px rgba(0, 0, 0, 0.35)'
                    }}
                  >
                    {mod.title}
                  </h2>
                  <p
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'rgba(255, 255, 255, 0.85)',
                      margin: '10px 0 0 0',
                      letterSpacing: '0.2px'
                    }}
                  >
                    {mod.subtitle}
                  </p>
                </div>

                {/* 3. Bottom Interactive Action Capsule Button */}
                <div
                  className={`portal-btn portal-btn-${mod.id}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '9px 18px 9px 22px',
                    borderRadius: '9999px',
                    background: 'rgba(255, 255, 255, 0.16)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    border: '1.5px solid rgba(255, 255, 255, 0.32)',
                    fontSize: '14px',
                    fontWeight: 800,
                    position: 'relative',
                    zIndex: 2
                  }}
                >
                  <span className="portal-btn-text">เข้าสู่ระบบ</span>
                  <div
                    className="portal-arrow portal-btn-arrow"
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '9999px',
                      background: 'rgba(255, 255, 255, 0.22)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.25s ease'
                    }}
                  >
                    <ArrowRight size={14} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* ── Background Decorative Layer 3: Sleek Bottom Brand Watermark ── */}
      <footer
        style={{
          position: 'absolute',
          bottom: '22px',
          left: 0,
          right: 0,
          textAlign: 'center',
          pointerEvents: 'none',
          zIndex: 1
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#94a3b8'
          }}
        >
          INOAC INDUSTRIES (THAILAND) CO., LTD. • LIGHT COVER PRODUCTION SYSTEM
        </p>
      </footer>
    </div>
  );
};

export default Portal;
