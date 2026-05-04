import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ================================================================
// ★ 여기에 본인의 Supabase 정보를 입력하세요 ★
// ================================================================
const SUPABASE_URL = "https://defgvcoefddreaygxvrs.supabase.co";   // https://xxxx.supabase.co
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZmd2Y29lZmRkcmVheWd4dnJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDcyMDcsImV4cCI6MjA5MzQyMzIwN30.6kvlg-ZhLsUAqiW8lrXjbboSeOroNjeVQTg4-atY7yw";         // eyJhbGci...
// ================================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Color Tokens ─────────────────────────────────────────────────────────────
const COLORS = {
  bg: "#0f1117", surface: "#181c27", surfaceAlt: "#1e2335", border: "#2a3050",
  accent: "#f59e0b", accentLight: "#fcd34d", accentDark: "#b45309",
  cyan: "#22d3ee", green: "#10b981", red: "#f43f5e", purple: "#a78bfa",
  text: "#e2e8f0", textMuted: "#64748b", textDim: "#94a3b8",
};

// ─── 수수료 유형 ──────────────────────────────────────────────────────────────
const COMMISSION_TYPES = [
  { value: "없음",           label: "없음",                           rate: 0,    method: null },
  { value: "10%_세금계산서", label: "10% - 매입세금계산서",           rate: 0.10, method: "세금계산서" },
  { value: "10%_인적공제",   label: "10% - 인적공제 (3.3% 원천징수)", rate: 0.10, method: "인적공제" },
  { value: "20%_세금계산서", label: "20% - 매입세금계산서",           rate: 0.20, method: "세금계산서" },
];
const getCommissionInfo = (type) => COMMISSION_TYPES.find(c => c.value === type) || COMMISSION_TYPES[0];
const calcCommissionBase = (order, products) =>
  order.items.reduce((s, it) => {
    const prod = products.find(p => p.id === it.productId);
    const supply = it.price * it.qty;
    return s + ((prod?.taxType || "과세") === "과세" ? Math.round(supply * 1.1) : supply);
  }, 0);
const calcCommission = (base, type) => {
  const info = getCommissionInfo(type);
  if (!info || info.rate === 0) return null;
  const commAmt = Math.round(base * info.rate);
  if (info.method === "세금계산서") {
    const supply = Math.round(commAmt / 1.1);
    return { ...info, commAmt, supply, tax: commAmt - supply, totalPay: commAmt };
  }
  const withhold = Math.round(commAmt * 0.033);
  return { ...info, commAmt, supply: commAmt, tax: 0, withhold, totalPay: commAmt - withhold };
};

// ─── Utilities ────────────────────────────────────────────────────────────────
const fmt   = (n) => n?.toLocaleString("ko-KR") ?? "0";
const today = () => new Date().toISOString().slice(0, 10);
const genId = (prefix) => `${prefix}-${Date.now().toString().slice(-6)}`;
const lastDayOfMonth = (ym) => { const [y,m] = ym.split("-").map(Number); return new Date(y,m,0).getDate(); };

// DB 컬럼명 ↔ JS 필드명 변환
const rowToProduct = r => ({ id: r.id, name: r.name, unit: r.unit, buyPrice: r.buy_price, sellPrice: r.sell_price, stock: r.stock, taxType: r.tax_type });
const rowToWholesale = r => ({ id: r.id, name: r.name, ceo: r.ceo, bizNo: r.biz_no, tel: r.tel, addr: r.addr, balance: r.balance, commissionType: r.commission_type });
const rowToRetail = r => ({ id: r.id, name: r.name, channel: r.channel, contact: r.contact, balance: r.balance });
const rowToOrder = r => ({ id: r.id, date: r.date, type: r.type, partner: r.partner, partnerId: r.partner_id, channel: r.channel, platformOrderId: r.platform_order_id, items: r.items || [], status: r.status, total: r.total, note: r.note });
const rowToInvoice = r => ({ id: r.id, date: r.date, type: r.type, partner: r.partner, amount: r.amount, tax: r.tax, total: r.total, status: r.status, note: r.note, commissionYM: r.commission_ym, commMethod: r.comm_method, withhold: r.withhold });

// ─── 공통 UI ──────────────────────────────────────────────────────────────────
const Badge = ({ label, color = COLORS.accent }) => (
  <span style={{ background: color+"22", color, border:`1px solid ${color}44`, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{label}</span>
);
const Card = ({ children, style={} }) => (
  <div style={{ background:COLORS.surface, border:`1px solid ${COLORS.border}`, borderRadius:12, padding:20, ...style }}>{children}</div>
);
const Input = ({ label, ...props }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
    {label && <label style={{ color:COLORS.textDim, fontSize:12, fontWeight:600 }}>{label}</label>}
    <input {...props} style={{ background:COLORS.bg, border:`1px solid ${COLORS.border}`, borderRadius:8, padding:"8px 12px", color:COLORS.text, fontSize:13, outline:"none", ...props.style }} />
  </div>
);
const Select = ({ label, children, ...props }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
    {label && <label style={{ color:COLORS.textDim, fontSize:12, fontWeight:600 }}>{label}</label>}
    <select {...props} style={{ background:COLORS.bg, border:`1px solid ${COLORS.border}`, borderRadius:8, padding:"8px 12px", color:COLORS.text, fontSize:13, outline:"none", ...props.style }}>{children}</select>
  </div>
);
const Btn = ({ children, variant="primary", ...props }) => {
  const v = { primary:{background:COLORS.accent,color:"#000",fontWeight:700}, ghost:{background:"transparent",color:COLORS.textDim,border:`1px solid ${COLORS.border}`}, danger:{background:COLORS.red+"22",color:COLORS.red,border:`1px solid ${COLORS.red}44`}, success:{background:COLORS.green+"22",color:COLORS.green,border:`1px solid ${COLORS.green}44`} };
  return <button {...props} style={{ ...v[variant], borderRadius:8, padding:"8px 16px", fontSize:13, cursor:"pointer", border:"none", display:"flex", alignItems:"center", gap:6, whiteSpace:"nowrap", ...props.style }}>{children}</button>;
};
const Table = ({ cols, rows, emptyMsg="데이터가 없습니다" }) => (
  <div style={{ overflowX:"auto" }}>
    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
      <thead><tr style={{ borderBottom:`2px solid ${COLORS.border}` }}>
        {cols.map(c => <th key={c.key} style={{ padding:"10px 12px", textAlign:c.align||"left", color:COLORS.textMuted, fontWeight:600, fontSize:11, whiteSpace:"nowrap" }}>{c.label}</th>)}
      </tr></thead>
      <tbody>{rows.length===0
        ? <tr><td colSpan={cols.length} style={{ padding:32, textAlign:"center", color:COLORS.textMuted }}>{emptyMsg}</td></tr>
        : rows.map((row,i) => <tr key={i} style={{ borderBottom:`1px solid ${COLORS.border}22` }}>
            {cols.map(c => <td key={c.key} style={{ padding:"10px 12px", color:COLORS.text, textAlign:c.align||"left" }}>{c.render?c.render(row):row[c.key]}</td>)}
          </tr>)
      }</tbody>
    </table>
  </div>
);
const Modal = ({ title, onClose, children }) => (
  <div style={{ position:"fixed", inset:0, background:"#000a", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={onClose}>
    <div style={{ background:COLORS.surface, border:`1px solid ${COLORS.border}`, borderRadius:16, padding:28, minWidth:480, maxWidth:"90vw", maxHeight:"90vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <span style={{ color:COLORS.text, fontWeight:700, fontSize:16 }}>{title}</span>
        <button onClick={onClose} style={{ background:"none", border:"none", color:COLORS.textMuted, cursor:"pointer", fontSize:20 }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

// 로딩 스피너
const Spinner = () => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:40, gap:12 }}>
    <div style={{ width:24, height:24, border:`3px solid ${COLORS.border}`, borderTopColor:COLORS.accent, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
    <span style={{ color:COLORS.textMuted }}>불러오는 중...</span>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

// 실시간 동기화 알림 토스트
const Toast = ({ msg, onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position:"fixed", bottom:24, right:24, background:COLORS.green, color:"#000", borderRadius:10, padding:"10px 20px", fontWeight:700, fontSize:13, zIndex:9999, boxShadow:"0 4px 20px #0006" }}>
      🔄 {msg}
    </div>
  );
};

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
const TABS = [
  { key:"dashboard",  label:"대시보드",   icon:"🏠" },
  { key:"inventory",  label:"재고관리",   icon:"📦" },
  { key:"orders",     label:"출고관리",   icon:"🚚" },
  { key:"partners",   label:"거래처",     icon:"🤝" },
  { key:"invoices",   label:"세금계산서", icon:"📄" },
  { key:"commission", label:"영업수수료", icon:"💸" },
  { key:"sales",      label:"매출분석",   icon:"📊" },
  { key:"online",     label:"온라인연동", icon:"🔗" },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [products,          setProducts]          = useState([]);
  const [orders,            setOrders]            = useState([]);
  const [invoices,          setInvoices]          = useState([]);
  const [wholesalePartners, setWholesalePartners] = useState([]);
  const [retailPartners,    setRetailPartners]    = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [toast,             setToast]             = useState(null);
  const [dbError,           setDbError]           = useState(false);

  const showToast = (msg) => setToast(msg);

  // ── 초기 데이터 로드 ──────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [p, wp, rp, o, inv] = await Promise.all([
          supabase.from("products").select("*").order("id"),
          supabase.from("wholesale_partners").select("*").order("id"),
          supabase.from("retail_partners").select("*").order("id"),
          supabase.from("orders").select("*").order("created_at", { ascending: false }),
          supabase.from("invoices").select("*").order("date", { ascending: false }),
        ]);
        if (p.error || wp.error || rp.error || o.error || inv.error) throw new Error("DB 연결 오류");
        setProducts(p.data.map(rowToProduct));
        setWholesalePartners(wp.data.map(rowToWholesale));
        setRetailPartners(rp.data.map(rowToRetail));
        setOrders(o.data.map(rowToOrder));
        setInvoices(inv.data.map(rowToInvoice));
      } catch (e) {
        console.error(e);
        setDbError(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── 실시간 구독 (Realtime) ────────────────────────────────────
  useEffect(() => {
    const channel = supabase.channel("erp-realtime")
      .on("postgres_changes", { event:"*", schema:"public", table:"products" }, payload => {
        setProducts(prev => {
          if (payload.eventType === "INSERT") return [rowToProduct(payload.new), ...prev];
          if (payload.eventType === "UPDATE") return prev.map(r => r.id===payload.new.id ? rowToProduct(payload.new) : r);
          if (payload.eventType === "DELETE") return prev.filter(r => r.id!==payload.old.id);
          return prev;
        });
        showToast("재고 데이터 업데이트됨");
      })
      .on("postgres_changes", { event:"*", schema:"public", table:"orders" }, payload => {
        setOrders(prev => {
          if (payload.eventType === "INSERT") return [rowToOrder(payload.new), ...prev];
          if (payload.eventType === "UPDATE") return prev.map(r => r.id===payload.new.id ? rowToOrder(payload.new) : r);
          if (payload.eventType === "DELETE") return prev.filter(r => r.id!==payload.old.id);
          return prev;
        });
        showToast("주문 데이터 업데이트됨");
      })
      .on("postgres_changes", { event:"*", schema:"public", table:"invoices" }, payload => {
        setInvoices(prev => {
          if (payload.eventType === "INSERT") return [rowToInvoice(payload.new), ...prev];
          if (payload.eventType === "UPDATE") return prev.map(r => r.id===payload.new.id ? rowToInvoice(payload.new) : r);
          if (payload.eventType === "DELETE") return prev.filter(r => r.id!==payload.old.id);
          return prev;
        });
        showToast("세금계산서 업데이트됨");
      })
      .on("postgres_changes", { event:"*", schema:"public", table:"wholesale_partners" }, () => {
        supabase.from("wholesale_partners").select("*").order("id").then(({data}) => data && setWholesalePartners(data.map(rowToWholesale)));
        showToast("거래처 데이터 업데이트됨");
      })
      .on("postgres_changes", { event:"*", schema:"public", table:"retail_partners" }, () => {
        supabase.from("retail_partners").select("*").order("id").then(({data}) => data && setRetailPartners(data.map(rowToRetail)));
        showToast("거래처 데이터 업데이트됨");
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // ── DB 저장 헬퍼 함수들 ───────────────────────────────────────
  const saveProduct = async (prod, isNew) => {
    const row = { id:prod.id, name:prod.name, unit:prod.unit, buy_price:prod.buyPrice, sell_price:prod.sellPrice, stock:prod.stock, tax_type:prod.taxType };
    const { error } = isNew ? await supabase.from("products").insert(row) : await supabase.from("products").update(row).eq("id", prod.id);
    if (error) alert("저장 실패: " + error.message);
  };

  const updateStock = async (id, newStock) => {
    await supabase.from("products").update({ stock: newStock }).eq("id", id);
  };

  const saveOrder = async (order) => {
    const row = { id:order.id, date:order.date, type:order.type, partner:order.partner, partner_id:order.partnerId, channel:order.channel||"", platform_order_id:order.platformOrderId||"", items:order.items, status:order.status, total:order.total, note:order.note||"" };
    const { error } = await supabase.from("orders").insert(row);
    if (error) alert("주문 저장 실패: " + error.message);
  };

  const updateOrderStatus = async (id, status) => {
    await supabase.from("orders").update({ status }).eq("id", id);
  };

  const saveInvoice = async (inv) => {
    const row = { id:inv.id, date:inv.date, type:inv.type, partner:inv.partner, amount:inv.amount, tax:inv.tax, total:inv.total, status:inv.status, note:inv.note||"", commission_ym:inv.commissionYM||"", comm_method:inv.commMethod||"", withhold:inv.withhold||0 };
    const { error } = await supabase.from("invoices").insert(row);
    if (error) alert("계산서 저장 실패: " + error.message);
  };

  const updateInvoiceStatus = async (id, status) => {
    await supabase.from("invoices").update({ status }).eq("id", id);
  };

  const saveWholesalePartner = async (partner) => {
    const row = { id:partner.id, name:partner.name, ceo:partner.ceo||"", biz_no:partner.bizNo||"", tel:partner.tel||"", addr:partner.addr||"", balance:partner.balance||0, commission_type:partner.commissionType||"없음" };
    const { error } = await supabase.from("wholesale_partners").insert(row);
    if (error) alert("거래처 저장 실패: " + error.message);
  };

  const updateWholesalePartner = async (partner) => {
    const row = { name:partner.name, ceo:partner.ceo||"", biz_no:partner.bizNo||"", tel:partner.tel||"", addr:partner.addr||"", balance:partner.balance||0, commission_type:partner.commissionType||"없음" };
    const { error } = await supabase.from("wholesale_partners").update(row).eq("id", partner.id);
    if (error) alert("거래처 수정 실패: " + error.message);
  };

  const saveRetailPartner = async (partner) => {
    const row = { id:partner.id, name:partner.name, channel:partner.channel||"", contact:partner.contact||"", balance:0 };
    const { error } = await supabase.from("retail_partners").insert(row);
    if (error) alert("거래처 저장 실패: " + error.message);
  };

  // ── DB 오류 화면 ──────────────────────────────────────────────
  if (dbError) return (
    <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:COLORS.bg, flexDirection:"column", gap:16 }}>
      <div style={{ fontSize:40 }}>⚠️</div>
      <div style={{ color:COLORS.red, fontWeight:800, fontSize:18 }}>Supabase 연결 실패</div>
      <div style={{ color:COLORS.textMuted, fontSize:13, textAlign:"center", maxWidth:400 }}>
        SUPABASE_URL과 SUPABASE_KEY가 올바르게 입력되었는지 확인하세요.<br/>
        src/App.jsx 파일 상단의 설정값을 확인해 주세요.
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:COLORS.bg, flexDirection:"column", gap:16 }}>
      <div style={{ fontSize:40 }}>🥭</div>
      <div style={{ color:COLORS.accent, fontWeight:800, fontSize:18 }}>망고바 ERP</div>
      <Spinner />
    </div>
  );

  const dbFns = { saveProduct, updateStock, saveOrder, updateOrderStatus, saveInvoice, updateInvoiceStatus, saveWholesalePartner, updateWholesalePartner, saveRetailPartner };

  return (
    <div style={{ display:"flex", height:"100vh", background:COLORS.bg, fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif", color:COLORS.text }}>
      {/* 사이드바 */}
      <div style={{ width:220, background:COLORS.surface, borderRight:`1px solid ${COLORS.border}`, display:"flex", flexDirection:"column", padding:"0 0 20px 0", flexShrink:0 }}>
        <div style={{ padding:"24px 20px 20px", borderBottom:`1px solid ${COLORS.border}` }}>
          <div style={{ fontSize:22, marginBottom:2 }}>🥭</div>
          <div style={{ color:COLORS.accent, fontWeight:900, fontSize:14 }}>망고바 ERP</div>
          <div style={{ color:COLORS.textMuted, fontSize:10, marginTop:2 }}>냉동망고바 수입유통 관리시스템</div>
          {/* 실시간 연결 상태 */}
          <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:COLORS.green }} />
            <span style={{ color:COLORS.green, fontSize:10, fontWeight:600 }}>실시간 연동 중</span>
          </div>
        </div>
        <nav style={{ padding:"12px 10px", flex:1 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={()=>setTab(t.key)}
              style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:8, border:"none", background:tab===t.key?COLORS.accent+"22":"transparent", color:tab===t.key?COLORS.accent:COLORS.textDim, cursor:"pointer", fontSize:13, fontWeight:tab===t.key?700:400, marginBottom:2, textAlign:"left" }}>
              <span style={{ fontSize:16 }}>{t.icon}</span>
              {t.label}
              {tab===t.key && <div style={{ marginLeft:"auto", width:3, height:16, background:COLORS.accent, borderRadius:2 }} />}
            </button>
          ))}
        </nav>
        <div style={{ padding:"0 16px" }}>
          <div style={{ background:COLORS.accent+"11", border:`1px solid ${COLORS.accent}33`, borderRadius:10, padding:12 }}>
            <div style={{ color:COLORS.accent, fontSize:10, fontWeight:700, marginBottom:4 }}>총 재고</div>
            <div style={{ color:COLORS.text, fontSize:18, fontWeight:800 }}>{fmt(products.reduce((s,p)=>s+p.stock,0))} 개</div>
          </div>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div style={{ flex:1, overflowY:"auto", padding:28 }}>
        <PageRouter
          tab={tab}
          products={products} setProducts={setProducts}
          orders={orders} setOrders={setOrders}
          invoices={invoices} setInvoices={setInvoices}
          wholesalePartners={wholesalePartners} setWholesalePartners={setWholesalePartners}
          retailPartners={retailPartners} setRetailPartners={setRetailPartners}
          dbFns={dbFns}
        />
      </div>

      {/* 실시간 토스트 알림 */}
      {toast && <Toast msg={toast} onDone={()=>setToast(null)} />}
    </div>
  );
}

// ─── 페이지 라우터 (기존 컴포넌트를 그대로 연결) ─────────────────────────────
function PageRouter({ tab, products, setProducts, orders, setOrders, invoices, setInvoices, wholesalePartners, setWholesalePartners, retailPartners, setRetailPartners, dbFns }) {
  // 이 파일에서는 라우팅만 담당합니다.
  // 각 페이지 컴포넌트는 기존 ERP와 동일하되 DB 저장 함수(dbFns)를 추가로 받습니다.
  const props = { products, setProducts, orders, setOrders, invoices, setInvoices, wholesalePartners, setWholesalePartners, retailPartners, setRetailPartners, dbFns };

  const pages = {
    dashboard:  <DashboardPage  {...props} />,
    inventory:  <InventoryPage  {...props} />,
    orders:     <OrdersPage     {...props} />,
    partners:   <PartnersPage   {...props} />,
    invoices:   <InvoicesPage   {...props} />,
    commission: <CommissionPage {...props} />,
    sales:      <SalesPage      {...props} />,
    online:     <OnlinePage     {...props} />,
  };
  return pages[tab] || null;
}

// ─── 대시보드 ─────────────────────────────────────────────────────────────────
function DashboardPage({ products, orders, invoices, wholesalePartners }) {
  const totalStock   = products.reduce((s,p)=>s+p.stock,0);
  const lowStock     = products.filter(p=>p.stock<100);
  const totalSales   = orders.filter(o=>o.status==="출고완료").reduce((s,o)=>s+o.total,0);
  const pendingOrders= orders.filter(o=>o.status==="대기").length;
  const unpaidAR     = wholesalePartners.reduce((s,p)=>s+p.balance,0);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
      <div><div style={{ color:COLORS.accent, fontSize:11, fontWeight:700, letterSpacing:2 }}>OVERVIEW</div>
        <h2 style={{ color:COLORS.text, fontSize:22, fontWeight:800, margin:0 }}>대시보드</h2></div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:16 }}>
        {[
          { label:"총 재고 (개)",  value:fmt(totalStock),        color:COLORS.cyan,   icon:"📦" },
          { label:"총 매출",         value:`₩${fmt(totalSales)}`,  color:COLORS.green,  icon:"📈" },
          { label:"대기 주문",       value:pendingOrders+"건",      color:COLORS.accent, icon:"🕐" },
          { label:"미수금 합계",     value:`₩${fmt(unpaidAR)}`,    color:COLORS.red,    icon:"💰" },
        ].map(s=>(
          <Card key={s.label} style={{ borderLeft:`3px solid ${s.color}` }}>
            <div style={{ fontSize:24, marginBottom:8 }}>{s.icon}</div>
            <div style={{ color:s.color, fontSize:22, fontWeight:800 }}>{s.value}</div>
            <div style={{ color:COLORS.textMuted, fontSize:12, marginTop:4 }}>{s.label}</div>
          </Card>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <Card>
          <div style={{ color:COLORS.textDim, fontSize:12, fontWeight:700, marginBottom:12 }}>⚠️ 재고 부족 품목</div>
          {lowStock.length===0
            ? <div style={{ color:COLORS.textMuted, fontSize:13 }}>모든 품목 재고 충분</div>
            : lowStock.map(p=>(
              <div key={p.id} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${COLORS.border}22`, fontSize:13 }}>
                <span style={{ color:COLORS.text }}>{p.name}</span>
                <Badge label={`${p.stock}개`} color={p.stock<50?COLORS.red:COLORS.accent} />
              </div>
            ))}
        </Card>
        <Card>
          <div style={{ color:COLORS.textDim, fontSize:12, fontWeight:700, marginBottom:12 }}>📋 최근 주문</div>
          {orders.slice(0,4).map(o=>(
            <div key={o.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:`1px solid ${COLORS.border}22`, fontSize:13 }}>
              <div>
                <div style={{ color:COLORS.text }}>{o.partner}</div>
                <div style={{ color:COLORS.textMuted, fontSize:11 }}>{o.date} · {o.type}</div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
                <span style={{ color:COLORS.accent }}>₩{fmt(o.total)}</span>
                <Badge label={o.status} color={o.status==="출고완료"?COLORS.green:COLORS.accent} />
              </div>
            </div>
          ))}
        </Card>
      </div>
      <Card>
        <div style={{ color:COLORS.textDim, fontSize:12, fontWeight:700, marginBottom:12 }}>📦 상품별 재고 현황</div>
        {products.map(p=>{
          const pct = Math.min((p.stock/300)*100,100);
          const bc  = p.stock<50?COLORS.red:p.stock<100?COLORS.accent:COLORS.green;
          return (
            <div key={p.id} style={{ marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:12 }}>
                <span style={{ color:COLORS.textDim }}>{p.name}</span>
                <span style={{ color:bc, fontWeight:700 }}>{p.stock}개</span>
              </div>
              <div style={{ background:COLORS.bg, borderRadius:4, height:6 }}>
                <div style={{ width:`${pct}%`, background:bc, borderRadius:4, height:6 }} />
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ─── 재고 관리 ────────────────────────────────────────────────────────────────
function InventoryPage({ products, setProducts, dbFns }) {
  const [modal,      setModal]      = useState(null);
  const [form,       setForm]       = useState({});
  const [adjustQty,  setAdjustQty]  = useState(0);
  const [adjustNote, setAdjustNote] = useState("");
  const [saving,     setSaving]     = useState(false);

  const openAdd = () => { setForm({ id:genId("P"), name:"", unit:"개", buyPrice:"", stock:"", taxType:"과세" }); setModal("add"); };

  const saveProduct = async () => {
    setSaving(true);
    const prod = { ...form, buyPrice:+form.buyPrice, sellPrice:0, stock:+form.stock, taxType:form.taxType||"과세" };
    await dbFns.saveProduct(prod, modal==="add");
    // Realtime 구독이 자동으로 화면 업데이트 처리 → 로컬 setState 제거 (중복 방지)
    setSaving(false); setModal(null);
  };

  const applyAdjust = async () => {
    setSaving(true);
    const newStock = Math.max(0, form.stock + +adjustQty);
    await dbFns.updateStock(form.id, newStock);
    // Realtime이 자동 반영
    setSaving(false); setModal(null);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div><div style={{ color:COLORS.accent, fontSize:11, fontWeight:700, letterSpacing:2 }}>WAREHOUSE</div>
          <h2 style={{ color:COLORS.text, fontSize:22, fontWeight:800, margin:0 }}>재고 관리</h2></div>
        <Btn onClick={openAdd}>+ 상품 추가</Btn>
      </div>
      <Card>
        <Table cols={[
          { key:"id",        label:"코드" },
          { key:"name",      label:"상품명" },
          { key:"taxType",   label:"과세구분", render:r=><Badge label={r.taxType||"과세"} color={r.taxType==="면세"?COLORS.cyan:COLORS.accent}/> },
          { key:"buyPrice",  label:"매입단가",   align:"right", render:r=>`₩${fmt(r.buyPrice)}` },
          { key:"stock",     label:"현재고",     align:"right", render:r=><span style={{ color:r.stock<100?COLORS.red:COLORS.green, fontWeight:700 }}>{fmt(r.stock)}</span> },
          { key:"value",     label:"재고금액(매입)", align:"right", render:r=>`₩${fmt(r.stock*r.buyPrice)}` },
          { key:"actions",   label:"관리", render:r=>(
            <div style={{ display:"flex", gap:6 }}>
              <Btn variant="ghost" style={{ padding:"4px 8px", fontSize:12 }} onClick={()=>{setForm(r);setModal("edit");}}>수정</Btn>
              <Btn variant="success" style={{ padding:"4px 8px", fontSize:12 }} onClick={()=>{setForm(r);setAdjustQty(0);setAdjustNote("");setModal("adjust");}}>재고조정</Btn>
            </div>
          )},
        ]} rows={products} />
      </Card>
      <Card>
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          <span style={{ color:COLORS.textDim, fontWeight:700 }}>총 재고금액 (매입가)</span>
          <span style={{ color:COLORS.accent, fontWeight:800, fontSize:18 }}>₩{fmt(products.reduce((s,p)=>s+p.stock*p.buyPrice,0))}</span>
        </div>

      </Card>

      {(modal==="add"||modal==="edit") && (
        <Modal title={modal==="add"?"상품 추가":"상품 수정"} onClose={()=>setModal(null)}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <Input label="상품코드" value={form.id} onChange={e=>setForm({...form,id:e.target.value})} disabled={modal==="edit"} />
            <Input label="상품명"   value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
            <div>
              <label style={{ color:COLORS.textDim, fontSize:12, fontWeight:600, display:"block", marginBottom:8 }}>과세구분</label>
              <div style={{ display:"flex", gap:10 }}>
                {["과세","면세"].map(t=>(
                  <label key={t} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", padding:"10px 20px", borderRadius:8, border:`2px solid ${form.taxType===t?(t==="과세"?COLORS.accent:COLORS.cyan):COLORS.border}`, background:form.taxType===t?(t==="과세"?COLORS.accent+"15":COLORS.cyan+"15"):"transparent", flex:1, justifyContent:"center" }}>
                    <input type="radio" name="taxType" value={t} checked={form.taxType===t} onChange={e=>setForm({...form,taxType:e.target.value})} style={{ display:"none" }} />
                    <span style={{ fontSize:16 }}>{t==="과세"?"🏷️":"🆓"}</span>
                    <span style={{ color:form.taxType===t?(t==="과세"?COLORS.accent:COLORS.cyan):COLORS.textDim, fontWeight:700 }}>{t}</span>
                  </label>
                ))}
              </div>
            </div>
            <Input label="매입단가 (원)" type="number" value={form.buyPrice} onChange={e=>setForm({...form,buyPrice:e.target.value})} />
            {modal==="add" && <Input label="초기 재고(개)" type="number" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})} />}
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}>
              <Btn variant="ghost" onClick={()=>setModal(null)}>취소</Btn>
              <Btn onClick={saveProduct} style={{ opacity:saving?0.6:1 }}>{saving?"저장 중...":"저장"}</Btn>
            </div>
          </div>
        </Modal>
      )}
      {modal==="adjust" && (
        <Modal title={`재고 조정 - ${form.name}`} onClose={()=>setModal(null)}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ color:COLORS.textDim, fontSize:13 }}>현재 재고: <strong style={{ color:COLORS.text }}>{form.stock}개</strong></div>
            <Input label="조정 수량 (입고:양수, 출고:음수)" type="number" value={adjustQty} onChange={e=>setAdjustQty(e.target.value)} />
            <div style={{ color:COLORS.textDim, fontSize:13 }}>조정 후: <strong style={{ color:COLORS.accent }}>{Math.max(0,form.stock+(+adjustQty))}개</strong></div>
            <Input label="사유" value={adjustNote} onChange={e=>setAdjustNote(e.target.value)} placeholder="예: 재고실사, 파손폐기, 수입입고 등" />
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}>
              <Btn variant="ghost" onClick={()=>setModal(null)}>취소</Btn>
              <Btn onClick={applyAdjust} style={{ opacity:saving?0.6:1 }}>{saving?"처리 중...":"조정 적용"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── 출고 관리 ─── (간략화 — 나머지 컴포넌트는 기존과 동일하고 dbFns 호출만 추가)
function OrdersPage({ orders, setOrders, products, setProducts, wholesalePartners, retailPartners, dbFns }) {
  const [modal,           setModal]           = useState(false);
  const [filter,          setFilter]          = useState("전체");
  const [commissionModal, setCommissionModal] = useState(null);
  const [saving,          setSaving]          = useState(false);
  const [form, setForm] = useState({ date:today(), type:"도매", partnerId:"", items:[{productId:"",qty:1}], note:"" });

  const allPartners = form.type==="도매" ? wholesalePartners : retailPartners;
  const calcTotal   = items => items.reduce((s,it)=>{ const p=products.find(x=>x.id===it.productId); return s+(p?p.sellPrice*it.qty:0); },0);

  const submit = async () => {
    const partner = allPartners.find(p=>p.id===form.partnerId);
    if (!partner || form.items.some(it=>!it.productId)) return alert("거래처와 상품을 모두 선택하세요.");
    setSaving(true);
    const total = calcTotal(form.items);
    const newOrder = { id:genId("ORD"), date:form.date, type:form.type, partner:partner.name, partnerId:form.partnerId, channel:"", platformOrderId:"", items:form.items.map(it=>({ ...it, qty:+it.qty, price: it.price!==""?+it.price:(products.find(p=>p.id===it.productId)?.sellPrice||0) })), status:"대기", total, note:form.note||"" };
    await dbFns.saveOrder(newOrder);
    // Realtime이 자동 반영
    setSaving(false); setModal(false);
    setForm({ date:today(), type:"도매", partnerId:"", items:[{productId:"",qty:1,price:""}], note:"" });
  };

  const processOrder = async (orderId) => {
    const order = orders.find(o=>o.id===orderId);
    if (!order) return;
    // 재고 차감
    for (const it of order.items) {
      const prod = products.find(p=>p.id===it.productId);
      if (prod) await dbFns.updateStock(prod.id, Math.max(0, prod.stock - it.qty));
    }
    await dbFns.updateOrderStatus(orderId, "출고완료");
    // 수수료 팝업
    if (order.type==="도매") {
      const partner = wholesalePartners.find(p=>p.id===order.partnerId);
      const commBase = calcCommissionBase(order, products);
      const commInfo = calcCommission(commBase, partner?.commissionType||"없음");
      if (commInfo) setCommissionModal({ order, partner, commInfo, commBase });
    }
  };

  const filtered = filter==="전체" ? orders : orders.filter(o=>o.type===filter||o.status===filter);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div><div style={{ color:COLORS.accent, fontSize:11, fontWeight:700, letterSpacing:2 }}>SHIPPING</div>
          <h2 style={{ color:COLORS.text, fontSize:22, fontWeight:800, margin:0 }}>출고 관리</h2></div>
        <Btn onClick={()=>setModal(true)}>+ 출고 등록</Btn>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        {["전체","도매","온라인소매","대기","출고완료"].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{ padding:"6px 14px", borderRadius:20, border:`1px solid ${filter===f?COLORS.accent:COLORS.border}`, background:filter===f?COLORS.accent+"22":"transparent", color:filter===f?COLORS.accent:COLORS.textMuted, cursor:"pointer", fontSize:12, fontWeight:600 }}>{f}</button>
        ))}
      </div>
      <Card>
        <Table cols={[
          { key:"id",      label:"주문번호" },
          { key:"date",    label:"일자" },
          { key:"type",    label:"유형",   render:r=><Badge label={r.type} color={r.type==="도매"?COLORS.purple:COLORS.cyan}/> },
          { key:"partner", label:"거래처" },
          { key:"items",   label:"품목수", align:"center", render:r=>`${r.items.length}종` },
          { key:"total",   label:"출고금액", align:"right", render:r=>`₩${fmt(r.total)}` },
          { key:"status",  label:"상태",   render:r=><Badge label={r.status} color={r.status==="출고완료"?COLORS.green:COLORS.accent}/> },
          { key:"actions", label:"", render:r=>(
            <div style={{ display:"flex", gap:6 }}>
              {r.status==="대기" && <Btn variant="success" style={{ padding:"4px 10px", fontSize:12 }} onClick={()=>processOrder(r.id)}>출고처리</Btn>}
            </div>
          )},
        ]} rows={filtered} />
      </Card>

      {commissionModal && (
        <Modal title="영업대행수수료 안내" onClose={()=>setCommissionModal(null)}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ background:COLORS.bg, borderRadius:10, padding:16 }}>
              <div style={{ color:COLORS.textMuted, fontSize:12 }}>출고 거래처</div>
              <div style={{ color:COLORS.text, fontWeight:700, fontSize:15, marginTop:4 }}>{commissionModal.partner?.name}</div>
              <div style={{ marginTop:8 }}><Badge label={commissionModal.commInfo.label} color={commissionModal.commInfo.rate>=0.2?COLORS.red:COLORS.purple}/></div>
            </div>
            <div style={{ background:COLORS.surfaceAlt, borderRadius:10, padding:16, display:"flex", flexDirection:"column", gap:8 }}>
              {[
                ["출고 공급가액", `₩${fmt(commissionModal.order.total)}`],
                ["수수료 기준금액", `₩${fmt(commissionModal.commBase)}`],
                ["수수료율", `${commissionModal.commInfo.rate*100}%`],
                ["수수료 총액", `₩${fmt(commissionModal.commInfo.commAmt)}`],
              ].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
                  <span style={{ color:COLORS.textDim }}>{k}</span>
                  <span style={{ color:COLORS.text, fontWeight:600 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <Btn variant="ghost" onClick={()=>setCommissionModal(null)}>닫기</Btn>
            </div>
          </div>
        </Modal>
      )}

      {modal && (
        <Modal title="출고 등록" onClose={()=>setModal(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <Input label="출고일자" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} />
              <Select label="유형" value={form.type} onChange={e=>setForm({...form,type:e.target.value,partnerId:""})}>
                <option>도매</option><option>온라인소매</option>
              </Select>
            </div>
            <Select label="거래처" value={form.partnerId} onChange={e=>setForm({...form,partnerId:e.target.value})}>
              <option value="">-- 거래처 선택 --</option>
              {allPartners.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <div>
              <div style={{ color:COLORS.textDim, fontSize:12, fontWeight:700, marginBottom:8 }}>출고 품목</div>
              {form.items.map((it,i)=>(
                <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 100px auto", gap:8, marginBottom:8, alignItems:"center" }}>
                  <Select value={it.productId} onChange={e=>setForm({...form,items:form.items.map((x,idx)=>idx===i?{...x,productId:e.target.value}:x)})}>
                    <option value="">-- 상품 선택 --</option>
                    {products.map(p=><option key={p.id} value={p.id}>{p.name} (재고:{p.stock})</option>)}
                  </Select>
                  <Input type="number" placeholder="수량" value={it.qty} onChange={e=>setForm({...form,items:form.items.map((x,idx)=>idx===i?{...x,qty:e.target.value}:x)})} />
                  <button onClick={()=>setForm({...form,items:form.items.filter((_,idx)=>idx!==i)})} style={{ background:"none", border:"none", color:COLORS.red, cursor:"pointer", fontSize:16 }}>×</button>
                </div>
              ))}
              <Btn variant="ghost" onClick={()=>setForm({...form,items:[...form.items,{productId:"",qty:1}]})} style={{ fontSize:12 }}>+ 품목 추가</Btn>
            </div>
            <div style={{ background:COLORS.bg, borderRadius:8, padding:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ color:COLORS.textDim }}>출고 합계</span>
                <span style={{ color:COLORS.accent, fontWeight:800 }}>₩{fmt(calcTotal(form.items))}</span>
              </div>
            </div>
            <Input label="비고" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} />
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <Btn variant="ghost" onClick={()=>setModal(false)}>취소</Btn>
              <Btn onClick={submit} style={{ opacity:saving?0.6:1 }}>{saving?"저장 중...":"등록"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── 거래처 ───────────────────────────────────────────────────────────────────
function PartnersPage({ wholesalePartners, setWholesalePartners, retailPartners, setRetailPartners, orders, dbFns }) {
  const [tab,    setTab]    = useState("도매");
  const [modal,  setModal]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [form,   setForm]   = useState({});
  const getPartnerSales = id => orders.filter(o=>o.partnerId===id&&o.status==="출고완료").reduce((s,o)=>s+o.total,0);

  const save = async () => {
    setSaving(true);
    if (tab==="도매") {
      await dbFns.saveWholesalePartner({ ...form, balance:+form.balance, commissionType:form.commissionType||"없음" });
    } else {
      await dbFns.saveRetailPartner(form);
    }
    // Realtime이 자동 반영
    setSaving(false); setModal(false);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div><div style={{ color:COLORS.accent, fontSize:11, fontWeight:700, letterSpacing:2 }}>CRM</div>
          <h2 style={{ color:COLORS.text, fontSize:22, fontWeight:800, margin:0 }}>거래처 관리</h2></div>
        <Btn onClick={()=>{ setForm(tab==="도매"?{id:genId("W"),name:"",ceo:"",bizNo:"",tel:"",addr:"",balance:0,commissionType:"없음"}:{id:genId("R"),name:"",channel:"",contact:"",balance:0}); setModal(true); }}>+ 거래처 추가</Btn>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        {["도매","온라인소매"].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{ padding:"6px 16px", borderRadius:20, border:`1px solid ${tab===t?COLORS.accent:COLORS.border}`, background:tab===t?COLORS.accent+"22":"transparent", color:tab===t?COLORS.accent:COLORS.textMuted, cursor:"pointer", fontSize:13, fontWeight:600 }}>{t} 거래처</button>
        ))}
      </div>
      <Card>
        {tab==="도매"
          ? <Table cols={[
              { key:"id", label:"코드" }, { key:"name", label:"거래처명" }, { key:"ceo", label:"대표자" }, { key:"bizNo", label:"사업자번호" }, { key:"tel", label:"연락처" },
              { key:"commissionType", label:"수수료", render:r=>{ const info=getCommissionInfo(r.commissionType||"없음"); return <Badge label={info.label} color={info.rate===0?COLORS.textMuted:info.rate>=0.2?COLORS.red:COLORS.purple}/>; }},
              { key:"sales", label:"총 매출", align:"right", render:r=><span style={{ color:COLORS.green }}>₩{fmt(getPartnerSales(r.id))}</span> },
              { key:"balance", label:"미수금", align:"right", render:r=><span style={{ color:r.balance>0?COLORS.red:COLORS.textMuted }}>₩{fmt(r.balance)}</span> },
            ]} rows={wholesalePartners} />
          : <Table cols={[
              { key:"id", label:"코드" }, { key:"name", label:"채널명" }, { key:"channel", label:"플랫폼" }, { key:"contact", label:"담당자" },
              { key:"sales", label:"총 매출", align:"right", render:r=><span style={{ color:COLORS.green }}>₩{fmt(getPartnerSales(r.id))}</span> },
            ]} rows={retailPartners} />
        }
      </Card>
      {modal && (
        <Modal title={`${tab} 거래처 추가`} onClose={()=>setModal(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <Input label="거래처명" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
            {tab==="도매" ? (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <Input label="대표자명" value={form.ceo} onChange={e=>setForm({...form,ceo:e.target.value})} />
                  <Input label="사업자번호" value={form.bizNo} onChange={e=>setForm({...form,bizNo:e.target.value})} />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <Input label="전화번호" value={form.tel} onChange={e=>setForm({...form,tel:e.target.value})} />
                  <Input label="초기 미수금" type="number" value={form.balance} onChange={e=>setForm({...form,balance:e.target.value})} />
                </div>
                <Input label="주소" value={form.addr} onChange={e=>setForm({...form,addr:e.target.value})} />
                <Select label="영업대행수수료" value={form.commissionType||"없음"} onChange={e=>setForm({...form,commissionType:e.target.value})}>
                  {COMMISSION_TYPES.map(ct=><option key={ct.value} value={ct.value}>{ct.label}</option>)}
                </Select>
              </>
            ) : (
              <>
                <Input label="플랫폼명" value={form.channel} onChange={e=>setForm({...form,channel:e.target.value})} />
                <Input label="담당자/이메일" value={form.contact} onChange={e=>setForm({...form,contact:e.target.value})} />
              </>
            )}
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}>
              <Btn variant="ghost" onClick={()=>setModal(false)}>취소</Btn>
              <Btn onClick={save} style={{ opacity:saving?0.6:1 }}>{saving?"저장 중...":"저장"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── 세금계산서 ───────────────────────────────────────────────────────────────
function InvoicesPage({ invoices, setInvoices, dbFns }) {
  const [tab,    setTab]    = useState("전체");
  const [modal,  setModal]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [form,   setForm]   = useState({ date:today(), type:"매출", partner:"", amount:"", note:"" });

  const filtered     = tab==="전체" ? invoices : invoices.filter(i=>i.type===tab||i.status===tab);
  const totalSupply  = filtered.reduce((s,i)=>s+i.amount,0);
  const totalTax     = filtered.reduce((s,i)=>s+i.tax,0);
  const totalAmount  = filtered.reduce((s,i)=>s+i.total,0);

  const submit = async () => {
    setSaving(true);
    const amount = +form.amount;
    const tax    = Math.round(amount*0.1);
    const inv    = { id:genId("INV"), date:form.date, type:form.type, partner:form.partner, amount, tax, total:amount+tax, status:form.type==="매출"?"미수금":"완료", note:form.note||"", commissionYM:"", commMethod:"", withhold:0 };
    await dbFns.saveInvoice(inv);
    // Realtime이 자동 반영
    setSaving(false); setModal(false);
    setForm({ date:today(), type:"매출", partner:"", amount:"", note:"" });
  };

  const toggleStatus = async (id, current) => {
    const next = current==="미수금"?"완료":"미수금";
    await dbFns.updateInvoiceStatus(id, next);
    // Realtime이 자동 반영
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div><div style={{ color:COLORS.accent, fontSize:11, fontWeight:700, letterSpacing:2 }}>TAX DOCS</div>
          <h2 style={{ color:COLORS.text, fontSize:22, fontWeight:800, margin:0 }}>세금계산서 관리</h2></div>
        <Btn onClick={()=>setModal(true)}>+ 계산서 등록</Btn>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        {["전체","매입","매출","미수금","완료"].map(f=>(
          <button key={f} onClick={()=>setTab(f)} style={{ padding:"6px 14px", borderRadius:20, border:`1px solid ${tab===f?COLORS.accent:COLORS.border}`, background:tab===f?COLORS.accent+"22":"transparent", color:tab===f?COLORS.accent:COLORS.textMuted, cursor:"pointer", fontSize:12, fontWeight:600 }}>{f}</button>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
        {[{label:"공급가액 합계",value:`₩${fmt(totalSupply)}`,color:COLORS.cyan},{label:"세액 합계",value:`₩${fmt(totalTax)}`,color:COLORS.purple},{label:"합계금액",value:`₩${fmt(totalAmount)}`,color:COLORS.accent}].map(s=>(
          <Card key={s.label} style={{ textAlign:"center" }}>
            <div style={{ color:s.color, fontSize:18, fontWeight:800 }}>{s.value}</div>
            <div style={{ color:COLORS.textMuted, fontSize:12, marginTop:4 }}>{s.label}</div>
          </Card>
        ))}
      </div>
      <Card>
        <Table cols={[
          { key:"id",      label:"계산서번호" },
          { key:"date",    label:"발행일" },
          { key:"type",    label:"구분",      render:r=><Badge label={r.type} color={r.type==="매입"?COLORS.purple:COLORS.green}/> },
          { key:"partner", label:"거래처" },
          { key:"amount",  label:"공급가액",  align:"right", render:r=>`₩${fmt(r.amount)}` },
          { key:"tax",     label:"세액(10%)", align:"right", render:r=>`₩${fmt(r.tax)}` },
          { key:"total",   label:"합계",      align:"right", render:r=><strong>₩{fmt(r.total)}</strong> },
          { key:"status",  label:"상태",      render:r=><Badge label={r.status} color={r.status==="완료"?COLORS.green:COLORS.red}/> },
          { key:"note",    label:"비고" },
          { key:"action",  label:"", render:r=>r.type==="매출"?(<Btn variant={r.status==="미수금"?"success":"ghost"} style={{ padding:"4px 10px", fontSize:11 }} onClick={()=>toggleStatus(r.id,r.status)}>{r.status==="미수금"?"수금처리":"미수금전환"}</Btn>):null },
        ]} rows={filtered} />
      </Card>
      {modal && (
        <Modal title="세금계산서 등록" onClose={()=>setModal(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <Input label="발행일" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} />
              <Select label="구분" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
                <option value="매출">매출 세금계산서</option>
                <option value="매입">매입 세금계산서</option>
              </Select>
            </div>
            <Input label="거래처명" value={form.partner} onChange={e=>setForm({...form,partner:e.target.value})} />
            <Input label="공급가액(원)" type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} />
            <div style={{ background:COLORS.bg, borderRadius:8, padding:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
                <span style={{ color:COLORS.textDim }}>부가세(10%)</span>
                <span>₩{fmt(Math.round((+form.amount||0)*0.1))}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontWeight:800, marginTop:6 }}>
                <span style={{ color:COLORS.textDim }}>합계</span>
                <span style={{ color:COLORS.accent }}>₩{fmt(Math.round((+form.amount||0)*1.1))}</span>
              </div>
            </div>
            <Input label="비고" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} />
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <Btn variant="ghost" onClick={()=>setModal(false)}>취소</Btn>
              <Btn onClick={submit} style={{ opacity:saving?0.6:1 }}>{saving?"저장 중...":"발행"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── 영업수수료 / 매출분석 / 온라인연동 페이지는 기존과 동일 ─────────────────
// (Supabase 연동이 필요한 저장 액션만 dbFns 경유)

function CommissionPage({ orders, wholesalePartners, products, invoices, setInvoices, dbFns }) {
  const nowYM = today().slice(0,7);
  const [selectedYM, setSelectedYM] = useState(nowYM);
  const [previewModal, setPreviewModal] = useState(false);
  const [resultModal,  setResultModal]  = useState(null);
  const [saving, setSaving] = useState(false);

  const allCommOrders = orders.filter(o=>o.type==="도매"&&o.status==="출고완료").map(o=>{
    const partner  = wholesalePartners.find(p=>p.id===o.partnerId);
    const commType = partner?.commissionType||"없음";
    const commBase = calcCommissionBase(o, products);
    const commInfo = calcCommission(commBase, commType);
    return { ...o, partner, commType, commBase, commInfo };
  });

  const commOrders = allCommOrders.filter(o=>o.date?.slice(0,7)===selectedYM);
  const closingDate = `${selectedYM}-${String(lastDayOfMonth(selectedYM)).padStart(2,"0")}`;

  const buildBatch = () => {
    const byPartner = {};
    commOrders.filter(o=>o.commInfo).forEach(o=>{
      if (!byPartner[o.partnerId]) byPartner[o.partnerId]={ partner:o.partner, commInfo:o.commInfo, orders:[], totalComm:0, totalCommBase:0 };
      byPartner[o.partnerId].orders.push(o);
      byPartner[o.partnerId].totalComm     += o.commInfo.commAmt;
      byPartner[o.partnerId].totalCommBase += o.commBase;
    });
    return Object.values(byPartner).map(g=>{
      const commAmt = g.totalComm;
      let invoiceData;
      if (g.commInfo.method==="세금계산서") { const supply=Math.round(commAmt/1.1); invoiceData={supply,tax:commAmt-supply,totalPay:commAmt,withhold:0}; }
      else { const withhold=Math.round(commAmt*0.033); invoiceData={supply:commAmt,tax:0,withhold,totalPay:commAmt-withhold}; }
      return { ...g, invoiceData, method:g.commInfo.method };
    });
  };

  const alreadyIssued = name => invoices.some(inv=>inv.type==="매입"&&inv.date?.slice(0,7)===selectedYM&&inv.partner===name&&inv.note?.includes("영업대행수수료"));
  const batch    = buildBatch();
  const issuable = batch.filter(g=>!alreadyIssued(g.partner?.name));

  const doIssue = async () => {
    setSaving(true);
    const newInvoices = issuable.map(g=>({ id:genId("INV"), date:closingDate, type:"매입", partner:g.partner?.name||"-", amount:g.invoiceData.supply, tax:g.invoiceData.tax, total:g.invoiceData.supply+g.invoiceData.tax, status:"완료", note:`영업대행수수료 ${selectedYM} 월 마감 | ${g.method==="인적공제"?`인적공제(원천징수 ₩${fmt(g.invoiceData.withhold)})`:"매입세금계산서"} | ${g.orders.length}건 합산`, commissionYM:selectedYM, commMethod:g.method, withhold:g.invoiceData.withhold||0 }));
    for (const inv of newInvoices) await dbFns.saveInvoice(inv);
    setSaving(false); setPreviewModal(false); setResultModal({ issued:newInvoices, ym:selectedYM });
  };

  const totalComm = commOrders.filter(o=>o.commInfo).reduce((s,o)=>s+o.commInfo.commAmt,0);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
        <div><div style={{ color:COLORS.accent, fontSize:11, fontWeight:700, letterSpacing:2 }}>COMMISSION</div>
          <h2 style={{ color:COLORS.text, fontSize:22, fontWeight:800, margin:0 }}>영업대행수수료 관리</h2></div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
            <label style={{ color:COLORS.textDim, fontSize:11, fontWeight:600 }}>대상 월</label>
            <input type="month" value={selectedYM} onChange={e=>setSelectedYM(e.target.value)} style={{ background:COLORS.bg, border:`1px solid ${COLORS.border}`, borderRadius:8, padding:"7px 12px", color:COLORS.text, fontSize:13 }} />
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
            <label style={{ color:COLORS.textDim, fontSize:11 }}>&nbsp;</label>
            <Btn onClick={()=>setPreviewModal(true)}>📋 {selectedYM} 수수료 일괄발행</Btn>
          </div>
        </div>
      </div>
      <Card>
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          <span style={{ color:COLORS.textDim, fontWeight:700 }}>{selectedYM} 수수료 합계</span>
          <span style={{ color:COLORS.red, fontWeight:800, fontSize:18 }}>₩{fmt(totalComm)}</span>
        </div>
      </Card>
      <Card>
        <div style={{ color:COLORS.textDim, fontSize:12, fontWeight:700, marginBottom:12 }}>거래처별 수수료 현황</div>
        {batch.length===0
          ? <div style={{ color:COLORS.textMuted, textAlign:"center", padding:20 }}>해당 월 수수료 내역이 없습니다</div>
          : batch.map(g=>(
            <div key={g.partner?.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${COLORS.border}22` }}>
              <div>
                <div style={{ color:COLORS.text, fontWeight:700 }}>{g.partner?.name}</div>
                <div style={{ marginTop:4, display:"flex", gap:6 }}>
                  <Badge label={g.commInfo.label} color={g.commInfo.rate>=0.2?COLORS.red:COLORS.purple} />
                  {alreadyIssued(g.partner?.name) && <Badge label="발행완료" color={COLORS.green} />}
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ color:COLORS.red, fontWeight:800, fontSize:16 }}>₩{fmt(g.totalComm)}</div>
                <div style={{ color:COLORS.textMuted, fontSize:11 }}>{g.orders.length}건 합산</div>
              </div>
            </div>
          ))
        }
      </Card>

      {previewModal && (
        <Modal title={`${selectedYM} 수수료 일괄발행`} onClose={()=>setPreviewModal(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ background:COLORS.bg, borderRadius:10, padding:14 }}>
              <div style={{ color:COLORS.textDim, fontSize:12 }}>발행 기준일 (마감일)</div>
              <div style={{ color:COLORS.accent, fontSize:18, fontWeight:900, marginTop:4 }}>{closingDate}</div>
            </div>
            {issuable.length===0
              ? <div style={{ textAlign:"center", padding:24, color:COLORS.textMuted }}>이미 모든 거래처의 계산서가 발행되었습니다.</div>
              : issuable.map((g,i)=>(
                <div key={i} style={{ background:COLORS.surfaceAlt, borderRadius:10, padding:14, border:`1px solid ${COLORS.border}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <div>
                      <div style={{ color:COLORS.text, fontWeight:700 }}>{g.partner?.name}</div>
                      <Badge label={g.method==="세금계산서"?"📋 매입세금계산서":"👤 인적공제"} color={g.method==="세금계산서"?COLORS.purple:COLORS.cyan} />
                    </div>
                    <div style={{ color:COLORS.red, fontWeight:800, fontSize:16 }}>₩{fmt(g.totalComm)}</div>
                  </div>
                </div>
              ))
            }
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <Btn variant="ghost" onClick={()=>setPreviewModal(false)}>취소</Btn>
              {issuable.length>0 && <Btn onClick={doIssue} style={{ opacity:saving?0.6:1 }}>{saving?"발행 중...":"📋 일괄 발행"}</Btn>}
            </div>
          </div>
        </Modal>
      )}
      {resultModal && (
        <Modal title="발행 완료" onClose={()=>setResultModal(null)}>
          <div style={{ textAlign:"center", padding:16 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
            <div style={{ color:COLORS.green, fontWeight:800, fontSize:18 }}>{resultModal.ym} 수수료 {resultModal.issued.length}건 발행 완료</div>
            <div style={{ color:COLORS.textMuted, fontSize:13, marginTop:8 }}>세금계산서 탭에서 확인하세요.</div>
            <div style={{ marginTop:16 }}><Btn onClick={()=>setResultModal(null)}>확인</Btn></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SalesPage({ orders, products, wholesalePartners, retailPartners }) {
  const completed = orders.filter(o=>o.status==="출고완료");
  const wholesale = completed.filter(o=>o.type==="도매");
  const retail    = completed.filter(o=>o.type==="온라인소매");
  const productSales = products.map(p=>{
    const { sold, revenue } = completed.reduce((acc,o)=>{
      const it = o.items.find(i=>i.productId===p.id);
      if(!it) return acc;
      return { sold:acc.sold+it.qty, revenue:acc.revenue+it.price*it.qty };
    },{ sold:0, revenue:0 });
    const cost = sold * p.buyPrice;
    return { ...p, sold, revenue, cost, profit:revenue-cost };
  }).sort((a,b)=>b.revenue-a.revenue);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
      <div><div style={{ color:COLORS.accent, fontSize:11, fontWeight:700, letterSpacing:2 }}>ANALYTICS</div>
        <h2 style={{ color:COLORS.text, fontSize:22, fontWeight:800, margin:0 }}>매출 분석</h2></div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
        {[
          { label:"도매 매출",    value:`₩${fmt(wholesale.reduce((s,o)=>s+o.total,0))}`, sub:`${wholesale.length}건`, color:COLORS.purple },
          { label:"온라인 매출",  value:`₩${fmt(retail.reduce((s,o)=>s+o.total,0))}`,    sub:`${retail.length}건`,    color:COLORS.cyan   },
          { label:"총 매출 이익", value:`₩${fmt(productSales.reduce((s,p)=>s+p.profit,0))}`, sub:"공급가-매입가",     color:COLORS.green  },
        ].map(s=>(
          <Card key={s.label} style={{ borderBottom:`3px solid ${s.color}` }}>
            <div style={{ color:s.color, fontSize:20, fontWeight:800 }}>{s.value}</div>
            <div style={{ color:COLORS.textMuted, fontSize:12, marginTop:2 }}>{s.label}</div>
            <div style={{ color:COLORS.textMuted, fontSize:11, marginTop:4 }}>{s.sub}</div>
          </Card>
        ))}
      </div>
      <Card>
        <div style={{ color:COLORS.textDim, fontSize:12, fontWeight:700, marginBottom:16 }}>📊 상품별 판매 실적</div>
        <Table cols={[
          { key:"name",    label:"상품명" },
          { key:"sold",    label:"판매량",  align:"right", render:r=>`${fmt(r.sold)}개` },
          { key:"revenue", label:"매출액",  align:"right", render:r=><span style={{ color:COLORS.green }}>₩{fmt(r.revenue)}</span> },
          { key:"cost",    label:"매입원가",align:"right", render:r=><span style={{ color:COLORS.textMuted }}>₩{fmt(r.cost)}</span> },
          { key:"profit",  label:"이익",    align:"right", render:r=><span style={{ color:r.profit>0?COLORS.accent:COLORS.red, fontWeight:700 }}>₩{fmt(r.profit)}</span> },
          { key:"margin",  label:"이익률",  align:"right", render:r=>{ const m=r.revenue>0?Math.round((r.profit/r.revenue)*100):0; return <Badge label={`${m}%`} color={m>30?COLORS.green:COLORS.accent}/>; }},
        ]} rows={productSales} />
      </Card>
    </div>
  );
}

function OnlinePage({ orders, setOrders, products, retailPartners, dbFns }) {
  const [channel, setChannel] = useState("쿠팡");
  const [step,    setStep]    = useState(1);
  const [mapped,  setMapped]  = useState([]);
  const [imported,setImported]= useState(null);
  const [error,   setError]   = useState("");
  const [saving,  setSaving]  = useState(false);
  const fileRef = useRef();

  const COLS = channel==="쿠팡"
    ? { date:"주문일",product:"상품명",option:"옵션명",qty:"수량",amount:"결제금액",orderId:"주문번호",status:"주문상태" }
    : { date:"주문일",product:"상품명",option:"옵션정보",qty:"수량",amount:"결제금액",orderId:"주문번호",status:"주문상태" };

  const partnerId   = channel==="쿠팡"?"R002":"R001";
  const partnerName = retailPartners.find(p=>p.id===partnerId)?.name||channel;

  const parseCSV = text => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length<2) return [];
    const headers = lines[0].replace(/^\uFEFF/,"").split(",").map(h=>h.trim().replace(/^"|"$/g,""));
    return lines.slice(1).map(line=>{
      const cols=[]; let cur="",inQ=false;
      for(const c of line){ if(c==='"'){inQ=!inQ;}else if(c===","&&!inQ){cols.push(cur.trim());cur="";}else{cur+=c;} }
      cols.push(cur.trim());
      const row={}; headers.forEach((h,i)=>{row[h]=(cols[i]||"").replace(/^"|"$/g,"");});
      return row;
    });
  };

  const handleFile = e => {
    setError("");
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const rows = parseCSV(ev.target.result);
        if(!rows.length){ setError("데이터가 없거나 형식이 맞지 않습니다."); return; }
        const existing = new Set(orders.filter(o=>o.platformOrderId).map(o=>o.platformOrderId));
        const mappedRows = rows.map((row,i)=>{
          const prodName = row[COLS.product]||"";
          const matched  = products.find(p=>p.name.includes(prodName.slice(0,6))||prodName.includes(p.name.slice(0,6)));
          const orderId  = row[COLS.orderId];
          const isDup    = existing.has(orderId);
          return { _idx:i, orderId, date:row[COLS.date]?.slice(0,10)||today(), productName:prodName, option:row[COLS.option]||"", qty:parseInt(row[COLS.qty])||1, amount:parseInt((row[COLS.amount]||"0").replace(/,/g,""))||0, matchedProductId:matched?.id||"", isDuplicate:isDup, skip:isDup };
        });
        setMapped(mappedRows); setStep(2);
      } catch(err){ setError("파싱 오류: "+err.message); }
    };
    reader.readAsText(file,"utf-8");
  };

  const doImport = async () => {
    setSaving(true);
    const toImport = mapped.filter(r=>!r.skip);
    const skippedDup = mapped.filter(r=>r.skip&&r.isDuplicate).length;
    const newOrders  = toImport.map(r=>({
      id:genId("ONL"), date:r.date, type:"온라인소매", partner:partnerName, partnerId, channel, platformOrderId:r.orderId,
      items:r.matchedProductId?[{productId:r.matchedProductId,qty:r.qty,price:products.find(p=>p.id===r.matchedProductId)?.sellPrice||0}]:[],
      status:"출고완료", total:r.amount, note:`${channel} 자동가져오기 | ${r.productName}${r.option?" / "+r.option:""}`,
    }));
    for (const order of newOrders) await dbFns.saveOrder(order);
    setSaving(false);
    setImported({ orders:newOrders, skippedDup });
    setStep(3);
  };

  const reset = () => { setStep(1); setMapped([]); setError(""); if(fileRef.current)fileRef.current.value=""; };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div><div style={{ color:COLORS.accent, fontSize:11, fontWeight:700, letterSpacing:2 }}>ONLINE SYNC</div>
        <h2 style={{ color:COLORS.text, fontSize:22, fontWeight:800, margin:0 }}>온라인 매출 가져오기</h2></div>
      <div style={{ display:"flex", gap:10 }}>
        {["쿠팡","네이버 스마트스토어"].map(ch=>(
          <button key={ch} onClick={()=>{setChannel(ch);reset();}}
            style={{ display:"flex",alignItems:"center",gap:8,padding:"12px 20px",borderRadius:10,border:`2px solid ${channel===ch?(ch==="쿠팡"?"#ef4444":"#22c55e"):COLORS.border}`,background:channel===ch?(ch==="쿠팡"?"#ef444422":"#22c55e22"):"transparent",color:channel===ch?(ch==="쿠팡"?"#ef4444":"#22c55e"):COLORS.textDim,cursor:"pointer",fontWeight:700,fontSize:14 }}>
            {ch==="쿠팡"?"🛒":"🟢"} {ch}
          </button>
        ))}
      </div>

      {step===1 && (
        <Card>
          <div style={{ color:COLORS.textDim, fontWeight:700, marginBottom:12 }}>📂 CSV 파일 업로드</div>
          <div style={{ color:COLORS.textMuted, fontSize:12, marginBottom:16 }}>
            판매자센터에서 주문/발주 내역을 CSV로 다운로드 후 업로드하세요.<br/>
            필수 컬럼: {Object.values(COLS).join(", ")}
          </div>
          <label style={{ display:"inline-flex",alignItems:"center",gap:8,padding:"10px 20px",background:COLORS.accent,color:"#000",borderRadius:8,cursor:"pointer",fontWeight:700 }}>
            📂 파일 선택
            <input ref={fileRef} type="file" accept=".csv" style={{ display:"none" }} onChange={handleFile} />
          </label>
          {error && <div style={{ marginTop:12,color:COLORS.red,fontSize:12 }}>⚠️ {error}</div>}
        </Card>
      )}

      {step===2 && (
        <Card>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
            <div style={{ color:COLORS.cyan,fontWeight:700 }}>✅ {mapped.length}건 파싱 완료</div>
            <Btn variant="ghost" onClick={reset} style={{ fontSize:12 }}>다시 업로드</Btn>
          </div>
          {mapped.filter(r=>r.isDuplicate).length>0 && (
            <div style={{ background:COLORS.accent+"11",border:`1px solid ${COLORS.accent}44`,borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:COLORS.accent }}>
              ⚠️ 중복 주문 {mapped.filter(r=>r.isDuplicate).length}건 — 자동으로 건너뜁니다
            </div>
          )}
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}>
              <thead><tr style={{ borderBottom:`2px solid ${COLORS.border}` }}>
                {["건너뛰기","주문번호","주문일","상품명","수량","금액","ERP 상품"].map(h=><th key={h} style={{ padding:"8px 10px",textAlign:"left",color:COLORS.textMuted,fontWeight:600,fontSize:11 }}>{h}</th>)}
              </tr></thead>
              <tbody>{mapped.map((r,i)=>(
                <tr key={i} style={{ borderBottom:`1px solid ${COLORS.border}22`,opacity:r.skip?0.4:1,background:r.isDuplicate?COLORS.accent+"08":"transparent" }}>
                  <td style={{ padding:"8px 10px" }}><input type="checkbox" checked={r.skip} onChange={e=>setMapped(prev=>prev.map((x,idx)=>idx===i?{...x,skip:e.target.checked}:x))} /></td>
                  <td style={{ padding:"8px 10px",color:COLORS.textMuted,fontSize:11 }}>{r.orderId?.slice(-8)}{r.isDuplicate&&<span style={{ color:COLORS.accent,fontSize:9,display:"block" }}>⚠기등록</span>}</td>
                  <td style={{ padding:"8px 10px",color:COLORS.textDim }}>{r.date}</td>
                  <td style={{ padding:"8px 10px",color:COLORS.text,maxWidth:180 }}><div style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{r.productName}</div></td>
                  <td style={{ padding:"8px 10px",textAlign:"right" }}>{r.qty}</td>
                  <td style={{ padding:"8px 10px",textAlign:"right",color:COLORS.green }}>₩{fmt(r.amount)}</td>
                  <td style={{ padding:"8px 10px",minWidth:160 }}>
                    <select value={r.matchedProductId} onChange={e=>setMapped(prev=>prev.map((x,idx)=>idx===i?{...x,matchedProductId:e.target.value}:x))}
                      style={{ background:COLORS.bg,border:`1px solid ${r.matchedProductId?COLORS.green:COLORS.red}55`,borderRadius:6,padding:"4px 8px",color:COLORS.text,fontSize:11,width:"100%" }}>
                      <option value="">-- 미매칭 --</option>
                      {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16,paddingTop:12,borderTop:`1px solid ${COLORS.border}` }}>
            <div style={{ fontSize:13,color:COLORS.textDim }}>
              신규: <strong style={{ color:COLORS.green }}>{mapped.filter(r=>!r.skip).length}건</strong>
              &nbsp;/&nbsp; 중복제외: <strong style={{ color:COLORS.accent }}>{mapped.filter(r=>r.skip&&r.isDuplicate).length}건</strong>
            </div>
            <Btn onClick={doImport} style={{ opacity:saving?0.6:1 }}>{saving?"저장 중...":"✅ 가져오기"}</Btn>
          </div>
        </Card>
      )}

      {step===3 && imported && (
        <Card style={{ textAlign:"center",padding:32 }}>
          <div style={{ fontSize:40,marginBottom:12 }}>🎉</div>
          <div style={{ color:COLORS.green,fontWeight:800,fontSize:20,marginBottom:8 }}>{imported.orders.length}건 등록 완료!</div>
          <div style={{ display:"flex",justifyContent:"center",gap:24,marginBottom:20 }}>
            <div><div style={{ color:COLORS.green,fontWeight:800,fontSize:18 }}>{imported.orders.length}</div><div style={{ color:COLORS.textMuted,fontSize:11 }}>신규 등록</div></div>
            <div><div style={{ color:COLORS.accent,fontWeight:800,fontSize:18 }}>{imported.skippedDup}</div><div style={{ color:COLORS.textMuted,fontSize:11 }}>중복 제외</div></div>
          </div>
          <Btn variant="ghost" onClick={reset}>추가 업로드</Btn>
        </Card>
      )}
    </div>
  );
}
