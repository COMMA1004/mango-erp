import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

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
const genId = (prefix) => {
  const ts  = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${ts}${rnd}`.toUpperCase();
};
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
  { key:"settle",     label:"도매정산마감", icon:"🧾" },
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

  const deleteOrder = async (id) => {
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) alert("삭제 실패: " + error.message);
  };

  const dbFns = { saveProduct, updateStock, saveOrder, updateOrderStatus, deleteOrder, saveInvoice, updateInvoiceStatus, saveWholesalePartner, updateWholesalePartner, saveRetailPartner };

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
    sales:      <SalesPage      {...props} invoices={invoices} />,
    online:     <OnlinePage     {...props} />,
    settle:     <SettlePage     {...props} />,
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

  const openAdd = () => { setForm({ id:genId("P"), name:"", unit:"개", buyPrice:"", sellPrice:"", stock:"", taxType:"과세" }); setModal("add"); };

  const saveProduct = async () => {
    setSaving(true);
    const prod = { ...form, buyPrice:+form.buyPrice, sellPrice:+form.sellPrice, stock:+form.stock, taxType:form.taxType||"과세" };
    await dbFns.saveProduct(prod, modal==="add");
    if (modal==="add") setProducts(prev=>[...prev, prod]);
    else setProducts(prev=>prev.map(p=>p.id===prod.id?prod:p));
    setSaving(false); setModal(null);
  };

  const applyAdjust = async () => {
    setSaving(true);
    const newStock = Math.max(0, form.stock + +adjustQty);
    await dbFns.updateStock(form.id, newStock);
    setProducts(prev=>prev.map(p=>p.id===form.id?{...p,stock:newStock}:p));
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
          { key:"sellPrice", label:"매출단가",   align:"right", render:r=>`₩${fmt(r.sellPrice)}` },
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
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:8 }}>
          <span style={{ color:COLORS.textDim, fontWeight:700 }}>총 재고금액 (매출가)</span>
          <span style={{ color:COLORS.green, fontWeight:800, fontSize:18 }}>₩{fmt(products.reduce((s,p)=>s+p.stock*p.sellPrice,0))}</span>
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
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <Input label="매입단가(원)" type="number" value={form.buyPrice}  onChange={e=>setForm({...form,buyPrice:e.target.value})} />
              <Input label="매출단가(원)" type="number" value={form.sellPrice} onChange={e=>setForm({...form,sellPrice:e.target.value})} />
            </div>
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
  const [deleteTarget,    setDeleteTarget]    = useState(null);
  const [statementOrder,  setStatementOrder]  = useState(null);
  const [saving,          setSaving]          = useState(false);
  const [dateFrom,        setDateFrom]        = useState("");
  const [dateTo,          setDateTo]          = useState("");
  const [form, setForm] = useState({ date:today(), type:"도매", partnerId:"", items:[{productId:"",qty:1,price:""}], note:"" });

  const allPartners = form.type==="도매" ? wholesalePartners : retailPartners;
  const calcTotal   = items => items.reduce((s,it)=>{ const price=it.price!==""&&it.price!==undefined?+it.price:0; return s+(price*+it.qty); },0);

  const submit = async () => {
    const partner = allPartners.find(p=>p.id===form.partnerId);
    if (!partner || form.items.some(it=>!it.productId)) return alert("거래처와 상품을 모두 선택하세요.");
    if (form.items.some(it=>!it.price||+it.price===0)) return alert("단가를 입력하세요.");
    setSaving(true);
    const total = calcTotal(form.items);
    const newOrder = { id:genId("ORD"), date:form.date, type:form.type, partner:partner.name, partnerId:form.partnerId, channel:"", platformOrderId:"", items:form.items.map(it=>({...it,qty:+it.qty,price:+it.price})), status:"대기", total, note:form.note||"" };
    await dbFns.saveOrder(newOrder);
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

  const filtered = (filter==="전체" ? orders : orders.filter(o=>o.type===filter||o.status===filter))
    .filter(o => (!dateFrom || o.date >= dateFrom) && (!dateTo || o.date <= dateTo))
    .slice().sort((a,b) => b.date.localeCompare(a.date));

  // 기간별 매출 집계
  const summaryWholesale = filtered.filter(o=>o.type==="도매"&&o.status==="출고완료");
  const summaryOnline    = filtered.filter(o=>o.type==="온라인소매"&&o.status==="출고완료");
  const totalWholesale   = summaryWholesale.reduce((s,o)=>s+o.total,0);
  const totalOnline      = summaryOnline.reduce((s,o)=>s+o.total,0);

  // 엑셀 다운로드
  const downloadExcel = () => {
    const rows = filtered.map(o => {
      const itemDesc = o.items.map(it=>{
        const prod = products.find(p=>p.id===it.productId);
        return `${prod?.name||it.productId} × ${it.qty}개`;
      }).join(", ");
      return {
        "주문번호": o.id,
        "일자": o.date,
        "유형": o.type,
        "거래처": o.partner,
        "상품내역": itemDesc || o.note || "",
        "출고금액": o.total,
        "상태": o.status,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    // 컬럼 너비 설정
    ws["!cols"] = [
      {wch:20},{wch:12},{wch:10},{wch:20},{wch:40},{wch:14},{wch:10}
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "출고현황");
    // 도매 시트
    const wsW = XLSX.utils.json_to_sheet(rows.filter(r=>r["유형"]==="도매"));
    wsW["!cols"] = [{wch:20},{wch:12},{wch:10},{wch:20},{wch:40},{wch:14},{wch:10}];
    XLSX.utils.book_append_sheet(wb, wsW, "도매");
    // 온라인소매 시트
    const wsO = XLSX.utils.json_to_sheet(rows.filter(r=>r["유형"]==="온라인소매"));
    wsO["!cols"] = [{wch:20},{wch:12},{wch:10},{wch:20},{wch:40},{wch:14},{wch:10}];
    XLSX.utils.book_append_sheet(wb, wsO, "온라인소매");
    const period = dateFrom&&dateTo ? `_${dateFrom}~${dateTo}` : "";
    XLSX.writeFile(wb, `출고현황${period}.xlsx`);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div><div style={{ color:COLORS.accent, fontSize:11, fontWeight:700, letterSpacing:2 }}>SHIPPING</div>
          <h2 style={{ color:COLORS.text, fontSize:22, fontWeight:800, margin:0 }}>출고 관리</h2></div>
        <Btn onClick={()=>setModal(true)}>+ 출고 등록</Btn>
      </div>

      {/* 기간 설정 + 매출 요약 */}
      <Card>
        <div style={{ display:"flex", gap:12, alignItems:"flex-end", flexWrap:"wrap" }}>
          <Input label="시작일" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ width:150 }} />
          <Input label="종료일" type="date" value={dateTo}   onChange={e=>setDateTo(e.target.value)}   style={{ width:150 }} />
          <Btn variant="ghost" onClick={()=>{setDateFrom("");setDateTo("");}}>전체</Btn>
          <Btn onClick={downloadExcel} style={{ marginLeft:"auto" }}>📥 엑셀 다운로드</Btn>
        </div>
        {/* 매출 요약 */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginTop:16 }}>
          {[
            { label:"도매 매출",    value:`₩${fmt(totalWholesale)}`, sub:`${summaryWholesale.length}건`, color:COLORS.purple },
            { label:"온라인 매출",  value:`₩${fmt(totalOnline)}`,    sub:`${summaryOnline.length}건`,    color:COLORS.cyan   },
            { label:"합계",         value:`₩${fmt(totalWholesale+totalOnline)}`, sub:`${summaryWholesale.length+summaryOnline.length}건`, color:COLORS.accent },
          ].map(s=>(
            <div key={s.label} style={{ background:COLORS.bg, borderRadius:10, padding:"12px 16px", borderLeft:`3px solid ${s.color}` }}>
              <div style={{ color:s.color, fontSize:18, fontWeight:800 }}>{s.value}</div>
              <div style={{ color:COLORS.textMuted, fontSize:12, marginTop:2 }}>{s.label} · {s.sub}</div>
            </div>
          ))}
        </div>
      </Card>
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
          { key:"items", label:"출고 상품 / 수량", render:r=>(
            <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
              {r.items.map((it,i)=>{
                const prod = products.find(p=>p.id===it.productId);
                return (
                  <div key={i} style={{ fontSize:12 }}>
                    <span style={{ color:COLORS.textDim }}>{prod?.name||it.productId}</span>
                    <span style={{ color:COLORS.text, fontWeight:700 }}> × {fmt(it.qty)}개</span>
                    {it.price>0 && <span style={{ color:COLORS.textMuted }}> @ ₩{fmt(it.price)}</span>}
                  </div>
                );
              })}
              {r.items.length===0 && r.note && (
                <div style={{ fontSize:11, color:COLORS.textMuted }}>{r.note.slice(0,40)}</div>
              )}
            </div>
          )},
          { key:"total",   label:"출고금액", align:"right", render:r=>`₩${fmt(r.total)}` },
          { key:"status",  label:"상태",   render:r=><Badge label={r.status} color={r.status==="출고완료"?COLORS.green:COLORS.accent}/> },
          { key:"actions", label:"", render:r=>(
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {r.status==="대기" && <Btn variant="success" style={{ padding:"4px 10px", fontSize:12 }} onClick={()=>processOrder(r.id)}>출고처리</Btn>}
              <Btn variant="ghost" style={{ padding:"4px 10px", fontSize:12 }} onClick={()=>setStatementOrder(r)}>📄 명세서</Btn>
              <Btn variant="danger" style={{ padding:"4px 8px", fontSize:12 }} onClick={()=>setDeleteTarget(r)}>🗑️</Btn>
            </div>
          )},
        ]} rows={filtered} />
      </Card>

      {/* 거래명세서 */}
      {statementOrder && (
        <DeliveryStatement
          order={statementOrder}
          products={products}
          wholesalePartners={wholesalePartners}
          retailPartners={retailPartners}
          onClose={()=>setStatementOrder(null)}
        />
      )}

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <Modal title="출고 삭제 확인" onClose={()=>setDeleteTarget(null)}>
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ background:COLORS.bg, borderRadius:10, padding:16 }}>
              <div style={{ color:COLORS.textMuted, fontSize:12, marginBottom:8 }}>삭제할 출고 정보</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6, fontSize:13 }}>
                {[["주문번호",deleteTarget.id],["일자",deleteTarget.date],["거래처",deleteTarget.partner],["출고금액",`₩${fmt(deleteTarget.total)}`],["상태",deleteTarget.status]].map(([k,v])=>(
                  <div key={k} style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ color:COLORS.textMuted }}>{k}</span>
                    <span style={{ color:COLORS.text, fontWeight:600 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            {deleteTarget.status==="출고완료" && (
              <div style={{ background:COLORS.red+"11", border:`1px solid ${COLORS.red}44`, borderRadius:8, padding:12, fontSize:12, color:COLORS.red }}>
                ⚠️ 이미 출고완료된 건입니다. 삭제해도 재고는 자동 복구되지 않습니다.
              </div>
            )}
            <div style={{ background:COLORS.red+"11", border:`1px solid ${COLORS.red}44`, borderRadius:8, padding:12, fontSize:12, color:COLORS.red }}>
              🗑️ 삭제하면 복구할 수 없습니다. 정말 삭제하시겠습니까?
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <Btn variant="ghost" onClick={()=>setDeleteTarget(null)}>취소</Btn>
              <Btn variant="danger" onClick={async()=>{ await dbFns.deleteOrder(deleteTarget.id); setDeleteTarget(null); }}>삭제 확인</Btn>
            </div>
          </div>
        </Modal>
      )}

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
              {/* 헤더 */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 110px auto", gap:8, marginBottom:4 }}>
                <div style={{ color:COLORS.textMuted, fontSize:11 }}>상품명</div>
                <div style={{ color:COLORS.textMuted, fontSize:11 }}>수량</div>
                <div style={{ color:COLORS.textMuted, fontSize:11 }}>단가(원) ✏️</div>
                <div></div>
              </div>
              {form.items.map((it,i)=>(
                <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 80px 110px auto", gap:8, marginBottom:8, alignItems:"center" }}>
                  <Select value={it.productId} onChange={e=>setForm({...form,items:form.items.map((x,idx)=>idx===i?{...x,productId:e.target.value}:x)})}>
                    <option value="">-- 상품 선택 --</option>
                    {products.map(p=><option key={p.id} value={p.id}>{p.name} (재고:{p.stock})</option>)}
                  </Select>
                  <Input type="number" placeholder="수량" value={it.qty} onChange={e=>setForm({...form,items:form.items.map((x,idx)=>idx===i?{...x,qty:e.target.value}:x)})} />
                  <Input type="number" placeholder="단가 입력" value={it.price||""} onChange={e=>setForm({...form,items:form.items.map((x,idx)=>idx===i?{...x,price:e.target.value}:x)})}
                    style={{ border:`1px solid ${COLORS.accent}66` }} />
                  <button onClick={()=>setForm({...form,items:form.items.filter((_,idx)=>idx!==i)})} style={{ background:"none", border:"none", color:COLORS.red, cursor:"pointer", fontSize:16 }}>×</button>
                </div>
              ))}
              <Btn variant="ghost" onClick={()=>setForm({...form,items:[...form.items,{productId:"",qty:1,price:""}]})} style={{ fontSize:12 }}>+ 품목 추가</Btn>
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
  const [tab,       setTab]       = useState("전체");
  const [modal,     setModal]     = useState(false);
  const [editTarget,setEditTarget] = useState(null); // 수정 대상
  const [saving,    setSaving]    = useState(false);
  const [form,      setForm]      = useState({ date:today(), type:"매출", partner:"", amount:"", note:"" });

  const validInvoices = (invoices||[]).filter(inv=>!inv.note?.includes("수동영업수수료"));
  const filtered     = tab==="전체" ? validInvoices : validInvoices.filter(i=>i.type===tab||i.status===tab);
  const totalSupply  = filtered.reduce((s,i)=>s+i.amount,0);
  const totalTax     = filtered.reduce((s,i)=>s+i.tax,0);
  const totalAmount  = filtered.reduce((s,i)=>s+i.total,0);

  const submit = async () => {
    setSaving(true);
    const amount = +form.amount;
    const tax    = Math.round(amount*0.1);
    const inv    = { id:genId("INV"), date:form.date, type:form.type, partner:form.partner, amount, tax, total:amount+tax, status:form.type==="매출"?"미수금":"완료", note:form.note||"", commissionYM:"", commMethod:"", withhold:0 };
    await dbFns.saveInvoice(inv);
    setSaving(false); setModal(false);
    setForm({ date:today(), type:"매출", partner:"", amount:"", note:"" });
  };

  const toggleStatus = async (id, current) => {
    const next = current==="미수금"?"완료":"미수금";
    await dbFns.updateInvoiceStatus(id, next);
    setInvoices(prev=>prev.map(i=>i.id===id?{...i,status:next}:i));
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
      {/* 수정 모달 */}
      {editTarget && (
        <Modal title="세금계산서 수정" onClose={()=>setEditTarget(null)}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ background:COLORS.bg, borderRadius:8, padding:10, fontSize:12, color:COLORS.textMuted }}>
              <span style={{ color:COLORS.accent, fontWeight:700 }}>{editTarget.type}</span> | {editTarget.id}
            </div>
            <Input label="일자" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} />
            <Input label="거래처" value={form.partner} onChange={e=>setForm({...form,partner:e.target.value})} />
            <Input label={editTarget.type==="매출"?"공급가액(원)":"매입금액(원)"} type="number"
              value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} />
            {editTarget.type==="매출" && (
              <div style={{ background:COLORS.bg, borderRadius:8, padding:10, fontSize:12, color:COLORS.textMuted }}>
                세액(10%): ₩{fmt(Math.round((+form.amount||0)*0.1))} &nbsp;|&nbsp;
                합계: ₩{fmt(Math.round((+form.amount||0)*1.1))}
              </div>
            )}
            <Input label="비고" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} />
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <Btn variant="ghost" onClick={()=>setEditTarget(null)}>취소</Btn>
              <Btn onClick={saveEdit} style={{ opacity:saving?0.6:1 }}>{saving?"저장 중...":"수정 저장"}</Btn>
            </div>
          </div>
        </Modal>
      )}

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
  const [manualModal, setManualModal] = useState(false);
  const [manualForm,  setManualForm]  = useState({ ym:nowYM, partnerId:"", amount:"", note:"" });
  const [savingManual, setSavingManual] = useState(false);

  // 수동 영업수수료 저장 (invoices 테이블에 type="매입", note에 "수동영업수수료" 태그)
  const saveManualComm = async () => {
    if (!manualForm.partnerId || !manualForm.amount) return alert("거래처와 금액을 입력하세요.");
    setSavingManual(true);
    const partner = wholesalePartners.find(p=>p.id===manualForm.partnerId);
    const amount  = +manualForm.amount;
    const inv = {
      id: genId("COMM"),
      date: `${manualForm.ym}-01`,
      type: "매입",
      partner: partner?.name||"-",
      amount,
      tax: 0,
      total: amount,
      status: "완료",
      note: `수동영업수수료 | ${manualForm.ym} | ${manualForm.note||""}`,
      commissionYM: manualForm.ym,
      commMethod: "수동입력",
      withhold: 0,
    };
    await dbFns.saveInvoice(inv);
    setSavingManual(false);
    setManualModal(false);
    setManualForm({ ym:nowYM, partnerId:"", amount:"", note:"" });
  };

  // 수동 영업수수료 목록 (invoices에서 "수동영업수수료" 태그로 필터)
  const manualCommList = (invoices||[]).filter(inv=>inv.note?.includes("수동영업수수료"));

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
          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
            <label style={{ color:COLORS.textDim, fontSize:11 }}>&nbsp;</label>
            <Btn variant="ghost" onClick={()=>setManualModal(true)}>✏️ 수동 수수료 입력</Btn>
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
      {/* 수동 영업수수료 목록 */}
      {manualCommList.length > 0 && (
        <Card>
          <div style={{ color:COLORS.textDim, fontSize:12, fontWeight:700, marginBottom:12 }}>✏️ 수동 입력 영업수수료 내역</div>
          <Table
            cols={[
              { key:"commissionYM", label:"대상 월", render:r=>r.note?.match(/[0-9]{4}-[0-9]{2}/)?.[0]||"-" },
              { key:"partner",  label:"거래처" },
              { key:"total",    label:"금액", align:"right", render:r=><span style={{ color:COLORS.red, fontWeight:700 }}>₩{fmt(r.total)}</span> },
              { key:"note",     label:"비고", render:r=>{
                const note = (r.note||"").replace("수동영업수수료 | ","").replace(/[0-9]{4}-[0-9]{2} \| ?/,"");
                return <span style={{ color:COLORS.textMuted, fontSize:12 }}>{note||"-"}</span>;
              }},
              { key:"date", label:"입력일" },
            ]}
            rows={manualCommList}
            emptyMsg="수동 입력 수수료 없음"
          />
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:12, paddingTop:10, borderTop:`1px solid ${COLORS.border}` }}>
            <span style={{ color:COLORS.textDim, fontWeight:700 }}>수동 수수료 합계</span>
            <span style={{ color:COLORS.red, fontWeight:800, fontSize:16 }}>₩{fmt(manualCommList.reduce((s,r)=>s+r.total,0))}</span>
          </div>
        </Card>
      )}

      {/* 수동 수수료 입력 모달 */}
      {manualModal && (
        <Modal title="영업수수료 수동 입력" onClose={()=>setManualModal(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ background:COLORS.bg, borderRadius:8, padding:12, fontSize:12, color:COLORS.textMuted }}>
              💡 자동 계산 외 별도로 지급할 영업수수료를 입력합니다.<br/>
              매출분석의 영업대행수수료에 자동 합산됩니다.
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <label style={{ color:COLORS.textDim, fontSize:12, fontWeight:600 }}>대상 월</label>
                <input type="month" value={manualForm.ym} onChange={e=>setManualForm({...manualForm,ym:e.target.value})}
                  style={{ background:COLORS.bg, border:`1px solid ${COLORS.border}`, borderRadius:8, padding:"8px 12px", color:COLORS.text, fontSize:13 }} />
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <label style={{ color:COLORS.textDim, fontSize:12, fontWeight:600 }}>거래처</label>
                <select value={manualForm.partnerId} onChange={e=>setManualForm({...manualForm,partnerId:e.target.value})}
                  style={{ background:COLORS.bg, border:`1px solid ${COLORS.border}`, borderRadius:8, padding:"8px 12px", color:COLORS.text, fontSize:13 }}>
                  <option value="">-- 거래처 선택 --</option>
                  {wholesalePartners.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <Input label="금액 (원)" type="number" placeholder="수수료 금액 입력"
              value={manualForm.amount} onChange={e=>setManualForm({...manualForm,amount:e.target.value})} />
            <Input label="비고" placeholder="예: 추가 판촉 활동, 특별 수수료 등"
              value={manualForm.note} onChange={e=>setManualForm({...manualForm,note:e.target.value})} />
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <Btn variant="ghost" onClick={()=>setManualModal(false)}>취소</Btn>
              <Btn onClick={saveManualComm} style={{ opacity:savingManual?0.6:1 }}>
                {savingManual?"저장 중...":"저장"}
              </Btn>
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

function SalesPage({ orders, products, wholesalePartners, retailPartners, invoices }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");

  const completed = orders.filter(o=>
    o.status==="출고완료" &&
    (!dateFrom || o.date>=dateFrom) &&
    (!dateTo   || o.date<=dateTo)
  );
  const wholesale = completed.filter(o=>o.type==="도매");
  const retail    = completed.filter(o=>o.type==="온라인소매");

  const productSales = products.map(p=>{
    const { sold, revenue } = completed.reduce((acc,o)=>{
      const it = o.items.find(i=>i.productId===p.id);
      if (!it) return acc;
      return { sold:acc.sold+it.qty, revenue:acc.revenue+o.total };
    },{ sold:0, revenue:0 });
    const cost = sold * p.buyPrice;
    return { ...p, sold, revenue, cost, profit:revenue-cost };
  }).sort((a,b)=>b.revenue-a.revenue);

  const totalRevenue = completed.reduce((s,o)=>s+o.total,0);
  const totalCOGS    = productSales.reduce((s,p)=>s+p.cost,0);

  // 영업수수료 (도매 출고 기준 자동계산 + 수동입력 합산)
  const autoCommission = wholesale.reduce((s,o)=>{
    const partner  = wholesalePartners.find(p=>p.id===o.partnerId);
    const commInfo = getCommissionInfo(partner?.commissionType||"없음");
    return s + (commInfo.rate>0 ? Math.round(o.total*commInfo.rate) : 0);
  },0);
  const manualCommission = (invoices||[]).filter(inv=>
    inv.note?.includes("수동영업수수료") &&
    (!dateFrom || inv.date>=dateFrom) &&
    (!dateTo   || inv.date<=dateTo)
  ).reduce((s,inv)=>s+inv.total,0);
  const totalCommission = autoCommission + manualCommission;

  // 매입세금계산서 (기간 필터 적용)
  const totalPurchaseInvoice = (invoices||[]).filter(inv=>
    inv.type==="매입" &&
    !inv.note?.includes("수동영업수수료") &&
    (!dateFrom || inv.date>=dateFrom) &&
    (!dateTo   || inv.date<=dateTo)
  ).reduce((s,inv)=>s+inv.total,0);

  const totalCost   = totalCOGS + totalCommission + totalPurchaseInvoice;
  const totalProfit = totalRevenue - totalCost;
  const marginRate  = totalRevenue>0 ? Math.round((totalProfit/totalRevenue)*100) : 0;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
      <div>
        <div style={{ color:COLORS.accent, fontSize:11, fontWeight:700, letterSpacing:2 }}>ANALYTICS</div>
        <h2 style={{ color:COLORS.text, fontSize:22, fontWeight:800, margin:0 }}>매출 분석</h2>
      </div>

      {/* 기간 설정 */}
      <Card>
        <div style={{ display:"flex", gap:12, alignItems:"flex-end", flexWrap:"wrap" }}>
          <Input label="시작일" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ width:150 }} />
          <Input label="종료일" type="date" value={dateTo}   onChange={e=>setDateTo(e.target.value)}   style={{ width:150 }} />
          <Btn variant="ghost" onClick={()=>{setDateFrom("");setDateTo("");}}>전체기간</Btn>
          {(dateFrom||dateTo) && (
            <span style={{ color:COLORS.accent, fontSize:12, fontWeight:600 }}>
              📅 {dateFrom||"시작"} ~ {dateTo||"현재"} 기준
            </span>
          )}
        </div>
      </Card>

      {/* 매출 요약 카드 */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
        {[
          { label:"도매 매출",   value:`₩${fmt(wholesale.reduce((s,o)=>s+o.total,0))}`, sub:`${wholesale.length}건`, color:COLORS.purple },
          { label:"온라인 매출", value:`₩${fmt(retail.reduce((s,o)=>s+o.total,0))}`,    sub:`${retail.length}건`,    color:COLORS.cyan   },
          { label:"총 매출",     value:`₩${fmt(totalRevenue)}`,                          sub:`${completed.length}건`, color:COLORS.green  },
        ].map(s=>(
          <Card key={s.label} style={{ borderBottom:`3px solid ${s.color}` }}>
            <div style={{ color:s.color, fontSize:20, fontWeight:800 }}>{s.value}</div>
            <div style={{ color:COLORS.textMuted, fontSize:12, marginTop:2 }}>{s.label}</div>
            <div style={{ color:COLORS.textMuted, fontSize:11, marginTop:4 }}>{s.sub}</div>
          </Card>
        ))}
      </div>

      {/* 상품별 판매 실적 */}
      <Card>
        <div style={{ color:COLORS.textDim, fontSize:12, fontWeight:700, marginBottom:16 }}>📊 상품별 판매 실적</div>
        <Table cols={[
          { key:"name",    label:"상품명" },
          { key:"sold",    label:"판매량",  align:"right", render:r=>`${fmt(r.sold)}개` },
          { key:"revenue", label:"매출액",  align:"right", render:r=><span style={{ color:COLORS.green }}>₩{fmt(r.revenue)}</span> },
          { key:"cost",    label:"상품원가",align:"right", render:r=><span style={{ color:COLORS.textMuted }}>₩{fmt(r.cost)}</span> },
          { key:"profit",  label:"상품이익",align:"right", render:r=><span style={{ color:r.profit>0?COLORS.accent:COLORS.red, fontWeight:700 }}>₩{fmt(r.profit)}</span> },
          { key:"margin",  label:"이익률",  align:"right", render:r=>{ const m=r.revenue>0?Math.round((r.profit/r.revenue)*100):0; return <Badge label={`${m}%`} color={m>30?COLORS.green:COLORS.accent}/>; }},
        ]} rows={productSales} />
      </Card>

      {/* 종합 손익 계산서 */}
      <Card style={{ borderLeft:`3px solid ${totalProfit>0?COLORS.green:COLORS.red}` }}>
        <div style={{ color:COLORS.textDim, fontSize:12, fontWeight:700, marginBottom:16 }}>📋 종합 손익 계산서</div>
        <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid ${COLORS.border}` }}>
            <span style={{ color:COLORS.text, fontWeight:700 }}>총 매출액</span>
            <span style={{ color:COLORS.green, fontWeight:800, fontSize:16 }}>₩{fmt(totalRevenue)}</span>
          </div>
          <div style={{ padding:"10px 0 4px", color:COLORS.textMuted, fontSize:12, fontWeight:700 }}>(-) 매입원가 및 비용</div>
          {[
            { label:"① 상품원가 (매입단가 × 판매수량)", value:totalCOGS, color:COLORS.textDim },
            { label:`② 영업대행수수료 (자동 ₩${fmt(autoCommission)} + 수동 ₩${fmt(manualCommission)})`, value:totalCommission, color:COLORS.purple },
            { label:"③ 매입세금계산서 (기간 내 합계)", value:totalPurchaseInvoice, color:COLORS.cyan },
          ].map(item=>(
            <div key={item.label} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0 8px 16px", borderBottom:`1px dashed ${COLORS.border}` }}>
              <span style={{ color:COLORS.textDim, fontSize:13 }}>{item.label}</span>
              <span style={{ color:item.color, fontWeight:600 }}>- ₩{fmt(item.value)}</span>
            </div>
          ))}
          <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:`2px solid ${COLORS.border}` }}>
            <span style={{ color:COLORS.text, fontWeight:700 }}>총 비용 합계</span>
            <span style={{ color:COLORS.red, fontWeight:800, fontSize:15 }}>- ₩{fmt(totalCost)}</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 0 4px" }}>
            <span style={{ color:COLORS.text, fontWeight:800, fontSize:16 }}>순 이익</span>
            <div style={{ textAlign:"right" }}>
              <div style={{ color:totalProfit>0?COLORS.green:COLORS.red, fontWeight:900, fontSize:22 }}>
                {totalProfit<0?"-":""}₩{fmt(Math.abs(totalProfit))}
              </div>
              <div style={{ marginTop:4 }}>
                <Badge label={`이익률 ${marginRate}%`} color={marginRate>20?COLORS.green:marginRate>0?COLORS.accent:COLORS.red} />
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SettlePage({ orders, wholesalePartners, products }) {
  const nowYM = today().slice(0,7);
  const [selectedYM,  setSelectedYM]  = useState(nowYM);
  const [settlePrint, setSettlePrint] = useState(null); // 거래 정산서
  const [commPrint,   setCommPrint]   = useState(null); // 수수료 정산서

  const lastDay = (ym) => { const [y,m]=ym.split("-").map(Number); return new Date(y,m,0).getDate(); };
  const closingDate = `${selectedYM}-${String(lastDay(selectedYM)).padStart(2,"0")}`;
  const [y, m] = selectedYM.split("-");
  const monthLabel = `${parseInt(m)}`;

  // 해당 월 도매 출고완료 건 거래처별 그룹
  const monthOrders = orders.filter(o=>o.type==="도매"&&o.status==="출고완료"&&o.date?.slice(0,7)===selectedYM);
  const byPartner = wholesalePartners.map(wp=>{
    const pOrders = monthOrders.filter(o=>o.partnerId===wp.id);
    const total   = pOrders.reduce((s,o)=>s+o.total,0);
    // 수수료 계산 (면세 매출 기준)
    const commType = wp.commissionType||"없음";
    const commInfo = getCommissionInfo(commType);
    const commAmt  = commInfo.rate>0 ? Math.round(total*commInfo.rate) : 0;
    let commDetail = null;
    if (commInfo.method==="세금계산서") {
      const supply = Math.round(commAmt/1.1);
      const tax    = commAmt-supply;
      commDetail = { method:"세금계산서", commAmt, supply, tax, totalPay:commAmt };
    } else if (commInfo.method==="인적공제") {
      const withhold = Math.round(commAmt*0.033);
      commDetail = { method:"인적공제", commAmt, withhold, totalPay:commAmt-withhold };
    }
    return { partner:wp, orders:pOrders, total, commInfo, commAmt, commDetail };
  }).filter(g=>g.orders.length>0);

  const printStyle = `
    @media print {
      body * { visibility: hidden; }
      #settle-print, #settle-print * { visibility: visible; }
      #settle-print { position: fixed; left:0; top:0; width:100%; }
      .no-print { display: none !important; }
    }
  `;

  // 공급자 정보
  const SUPPLIER = {
    name:"주식회사 콤마", ceo:"임성근", bizNo:"855-88-01315",
    biz:"도소매", item:"수입식품 수입판매업 외",
    addr:"경기도 안양시 동안구 엘에스로 136, 1603호", tel:"",
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <style>{printStyle}</style>
      <div>
        <div style={{ color:COLORS.accent, fontSize:11, fontWeight:700, letterSpacing:2 }}>SETTLEMENT</div>
        <h2 style={{ color:COLORS.text, fontSize:22, fontWeight:800, margin:0 }}>도매정산마감</h2>
      </div>

      {/* 월 선택 */}
      <Card>
        <div style={{ display:"flex", gap:12, alignItems:"flex-end" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <label style={{ color:COLORS.textDim, fontSize:12, fontWeight:600 }}>정산 월</label>
            <input type="month" value={selectedYM} onChange={e=>setSelectedYM(e.target.value)}
              style={{ background:COLORS.bg, border:`1px solid ${COLORS.border}`, borderRadius:8, padding:"8px 12px", color:COLORS.text, fontSize:13 }} />
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <label style={{ color:COLORS.textDim, fontSize:12, fontWeight:600 }}>마감일</label>
            <div style={{ background:COLORS.surfaceAlt, border:`1px solid ${COLORS.border}`, borderRadius:8, padding:"8px 14px", color:COLORS.accent, fontSize:13, fontWeight:700 }}>
              {closingDate}
            </div>
          </div>
        </div>
      </Card>

      {/* 거래처별 목록 */}
      {byPartner.length===0 ? (
        <Card><div style={{ textAlign:"center", padding:32, color:COLORS.textMuted }}>{selectedYM} 도매 출고 내역이 없습니다.</div></Card>
      ) : (
        <Card>
          <div style={{ color:COLORS.textDim, fontSize:12, fontWeight:700, marginBottom:12 }}>
            📋 {selectedYM} 도매 거래처별 정산 현황
          </div>
          {byPartner.map(g=>(
            <div key={g.partner.id} style={{ padding:"14px 0", borderBottom:`1px solid ${COLORS.border}22` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ color:COLORS.text, fontWeight:700, fontSize:14 }}>{g.partner.name}</div>
                  <div style={{ display:"flex", gap:8, marginTop:4 }}>
                    <span style={{ color:COLORS.textMuted, fontSize:12 }}>{g.orders.length}건 출고</span>
                    {g.commInfo.rate>0 && <Badge label={g.commInfo.label} color={g.commInfo.rate>=0.2?COLORS.red:COLORS.purple} />}
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ color:COLORS.accent, fontWeight:800, fontSize:16 }}>₩{fmt(g.total)}</div>
                    {g.commAmt>0 && <div style={{ color:COLORS.red, fontSize:12 }}>수수료 ₩{fmt(g.commAmt)}</div>}
                  </div>
                  {/* 버튼 2개 */}
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    <Btn onClick={()=>setSettlePrint({ ...g, monthLabel, closingDate, selectedYM })} style={{ fontSize:12, padding:"6px 12px" }}>
                      📋 {monthLabel}월 거래 정산서
                    </Btn>
                    {g.commDetail && (
                      <Btn variant="ghost" onClick={()=>setCommPrint({ ...g, monthLabel, closingDate, selectedYM })} style={{ fontSize:12, padding:"6px 12px" }}>
                        💸 {monthLabel}월 영업대행수수료 정산서
                      </Btn>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:16, paddingTop:12, borderTop:`2px solid ${COLORS.border}` }}>
            <span style={{ color:COLORS.textDim, fontWeight:700 }}>총 합계</span>
            <span style={{ color:COLORS.accent, fontWeight:900, fontSize:18 }}>₩{fmt(byPartner.reduce((s,g)=>s+g.total,0))}</span>
          </div>
        </Card>
      )}

      {/* 거래 정산서 */}
      {settlePrint && <SettleStatement data={settlePrint} products={products} supplier={SUPPLIER} onClose={()=>setSettlePrint(null)} />}
      {/* 수수료 정산서 */}
      {commPrint   && <CommStatement  data={commPrint}   supplier={SUPPLIER} onClose={()=>setCommPrint(null)} />}
    </div>
  );
}

// ─── 거래 정산서 ──────────────────────────────────────────────────────────────
function SettleStatement({ data, products, supplier, onClose }) {
  const { partner, orders, total, monthLabel, closingDate, selectedYM } = data;
  const [y,m] = selectedYM.split("-");
  const periodStr = `${y}년 ${parseInt(m)}월 1일 ~ ${closingDate}`;

  const rows = [];
  orders.slice().sort((a,b)=>a.date.localeCompare(b.date)).forEach(o=>{
    if (o.items.length>0) {
      o.items.forEach(it=>{
        const prod = products.find(p=>p.id===it.productId);
        rows.push({ date:o.date, name:prod?.name||it.productId, qty:it.qty, price:it.price||0, amount:(it.qty*(it.price||0))||o.total });
      });
    } else {
      rows.push({ date:o.date, name:o.note||"-", qty:"-", price:"-", amount:o.total });
    }
  });

  const printStyle = `@media print { body * { visibility:hidden; } #settle-print, #settle-print * { visibility:visible; } #settle-print { position:fixed; left:0; top:0; width:100%; } .no-print { display:none !important; } }`;

  return (
    <div style={{ position:"fixed", inset:0, background:"#000c", zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={onClose}>
      <style>{printStyle}</style>
      <div id="settle-print" style={{ background:"#fff", borderRadius:12, padding:40, width:740, maxHeight:"92vh", overflowY:"auto", color:"#111", fontFamily:"'Apple SD Gothic Neo','Malgun Gothic',sans-serif" }} onClick={e=>e.stopPropagation()}>

        {/* 제목 */}
        <div style={{ textAlign:"center", marginBottom:24, paddingBottom:16, borderBottom:"3px solid #f59e0b" }}>
          <div style={{ fontSize:26, fontWeight:900, letterSpacing:2 }}>( {monthLabel} )월 거래 정산서</div>
          <div style={{ fontSize:12, color:"#888", marginTop:4 }}>{periodStr}</div>
        </div>

        {/* 공급자 / 공급받는자 */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
          {[
            { label:"공 급 자", color:"#f59e0b", rows:[["상 호",supplier.name],["대 표 자",supplier.ceo],["사업자번호",supplier.bizNo],["업 태",supplier.biz],["종 목",supplier.item],["주 소",supplier.addr],["연 락 처",supplier.tel]] },
            { label:"공급받는자", color:"#22d3ee", rows:[["상 호",partner.name],["대 표 자",partner.ceo||"-"],["사업자번호",partner.bizNo||"-"],["주 소",partner.addr||"-"],["연 락 처",partner.tel||"-"],["",""],["",""]] },
          ].map(sec=>(
            <div key={sec.label} style={{ border:"1px solid #ddd", borderRadius:8, padding:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:sec.color, marginBottom:8, letterSpacing:1 }}>{sec.label}</div>
              <table style={{ width:"100%", fontSize:12, borderCollapse:"collapse" }}>
                {sec.rows.map(([k,v])=>(
                  <tr key={k}><td style={{ color:"#888", padding:"3px 0", width:70, fontSize:11 }}>{k}</td><td style={{ color:"#111", fontWeight:600, padding:"3px 0" }}>{v}</td></tr>
                ))}
              </table>
            </div>
          ))}
        </div>

        {/* 품목 테이블 */}
        <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16, fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f8f8f8", borderTop:"2px solid #333", borderBottom:"1px solid #ccc" }}>
              {["No","일자","품 목 명","수량","판매단가","금액"].map(h=>(
                <th key={h} style={{ padding:"9px 8px", textAlign:"center", fontWeight:700, fontSize:12, color:"#333" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={i} style={{ borderBottom:"1px solid #eee" }}>
                <td style={{ padding:"8px", textAlign:"center", color:"#666" }}>{i+1}</td>
                <td style={{ padding:"8px", textAlign:"center" }}>{r.date}</td>
                <td style={{ padding:"8px" }}>{r.name}</td>
                <td style={{ padding:"8px", textAlign:"right" }}>{typeof r.qty==="number"?fmt(r.qty):r.qty}</td>
                <td style={{ padding:"8px", textAlign:"right" }}>{typeof r.price==="number"?`₩${fmt(r.price)}`:r.price}</td>
                <td style={{ padding:"8px", textAlign:"right", fontWeight:700 }}>{typeof r.amount==="number"?`₩${fmt(r.amount)}`:r.amount}</td>
              </tr>
            ))}
            {Array.from({length:Math.max(0,5-rows.length)}).map((_,i)=>(
              <tr key={`e${i}`} style={{ borderBottom:"1px solid #eee" }}>
                {[...Array(6)].map((_,j)=><td key={j} style={{ padding:"8px", height:32 }}>&nbsp;</td>)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background:"#fffbeb", borderTop:"2px solid #f59e0b" }}>
              <td colSpan={5} style={{ padding:"10px 8px", fontWeight:700, textAlign:"right" }}>합 계</td>
              <td style={{ padding:"10px 8px", textAlign:"right", fontWeight:900, color:"#f59e0b", fontSize:15 }}>₩{fmt(total)}</td>
            </tr>
          </tfoot>
        </table>

        {/* 금액 요약 */}
        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:20 }}>
          <div style={{ border:"2px solid #f59e0b", borderRadius:8, padding:"12px 20px", minWidth:300 }}>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", fontSize:13 }}>
              <span style={{ color:"#888" }}>공급가액 (면세)</span>
              <span style={{ color:"#333", fontWeight:600 }}>₩{fmt(total)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", fontSize:13 }}>
              <span style={{ color:"#888" }}>부가세</span>
              <span style={{ color:"#bbb" }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0 0", marginTop:6, borderTop:"1px solid #f59e0b", fontSize:16 }}>
              <span style={{ fontWeight:800 }}>청구금액</span>
              <span style={{ color:"#f59e0b", fontWeight:900 }}>₩{fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* 서명란 */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
          {["공급자 확인","공급받는자 확인"].map(label=>(
            <div key={label} style={{ border:"1px solid #ddd", borderRadius:8, padding:"12px 16px", minHeight:60 }}>
              <div style={{ fontSize:11, color:"#aaa", marginBottom:8 }}>{label}</div>
              <div style={{ fontSize:12, color:"#ccc" }}>(서명 / 날인)</div>
            </div>
          ))}
        </div>

        <div className="no-print" style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"10px 20px", borderRadius:8, border:"1px solid #ddd", background:"#f5f5f5", cursor:"pointer", fontSize:13 }}>닫기</button>
          <button onClick={()=>window.print()} style={{ padding:"10px 24px", borderRadius:8, border:"none", background:"#f59e0b", color:"#000", fontWeight:700, cursor:"pointer", fontSize:13 }}>🖨️ 인쇄 / PDF</button>
        </div>
      </div>
    </div>
  );
}

// ─── 영업대행수수료 정산서 ────────────────────────────────────────────────────
function CommStatement({ data, supplier, onClose }) {
  const { partner, total, commDetail, commInfo, commAmt, monthLabel, closingDate, selectedYM } = data;
  const [y,m] = selectedYM.split("-");
  const periodStr = `${y}년 ${parseInt(m)}월 1일 ~ ${closingDate}`;
  const isTaxInvoice = commDetail.method==="세금계산서";

  const printStyle = `@media print { body * { visibility:hidden; } #settle-print, #settle-print * { visibility:visible; } #settle-print { position:fixed; left:0; top:0; width:100%; } .no-print { display:none !important; } }`;

  return (
    <div style={{ position:"fixed", inset:0, background:"#000c", zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={onClose}>
      <style>{printStyle}</style>
      <div id="settle-print" style={{ background:"#fff", borderRadius:12, padding:40, width:700, maxHeight:"92vh", overflowY:"auto", color:"#111", fontFamily:"'Apple SD Gothic Neo','Malgun Gothic',sans-serif" }} onClick={e=>e.stopPropagation()}>

        {/* 제목 */}
        <div style={{ textAlign:"center", marginBottom:24, paddingBottom:16, borderBottom:"3px solid #a78bfa" }}>
          <div style={{ fontSize:26, fontWeight:900, letterSpacing:2 }}>( {monthLabel} )월 영업대행수수료 정산서</div>
          <div style={{ fontSize:12, color:"#888", marginTop:4 }}>{periodStr}</div>
        </div>

        {/* 공급자(수수료 받는 쪽=거래처) / 공급받는자(우리=콤마) */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
          {[
            { label:"공 급 자 (수수료 지급받는 자)", color:"#a78bfa",
              rows:[["상 호",partner.name],["대 표 자",partner.ceo||"-"],["사업자번호",partner.bizNo||"-"],["주 소",partner.addr||"-"],["연 락 처",partner.tel||"-"]] },
            { label:"공 급 받 는 자", color:"#f59e0b",
              rows:[["상 호",supplier.name],["대 표 자",supplier.ceo],["사업자번호",supplier.bizNo],["주 소",supplier.addr],["연 락 처",supplier.tel||"-"]] },
          ].map(sec=>(
            <div key={sec.label} style={{ border:"1px solid #ddd", borderRadius:8, padding:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:sec.color, marginBottom:8 }}>{sec.label}</div>
              <table style={{ width:"100%", fontSize:12, borderCollapse:"collapse" }}>
                {sec.rows.map(([k,v])=>(
                  <tr key={k}><td style={{ color:"#888", padding:"3px 0", width:80, fontSize:11 }}>{k}</td><td style={{ color:"#111", fontWeight:600, padding:"3px 0" }}>{v}</td></tr>
                ))}
              </table>
            </div>
          ))}
        </div>

        {/* 수수료 내역 테이블 */}
        <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16, fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f8f8f8", borderTop:"2px solid #333", borderBottom:"1px solid #ccc" }}>
              {["구분","내용","금액"].map(h=>(
                <th key={h} style={{ padding:"10px 12px", textAlign:"center", fontWeight:700, fontSize:12, color:"#333" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom:"1px solid #eee" }}>
              <td style={{ padding:"10px 12px", textAlign:"center", color:"#666" }}>기준금액</td>
              <td style={{ padding:"10px 12px" }}>면세 매출액 ({periodStr})</td>
              <td style={{ padding:"10px 12px", textAlign:"right", fontWeight:700 }}>₩{fmt(total)}</td>
            </tr>
            <tr style={{ borderBottom:"1px solid #eee" }}>
              <td style={{ padding:"10px 12px", textAlign:"center", color:"#666" }}>수수료율</td>
              <td style={{ padding:"10px 12px" }}>기준금액 × {commInfo.rate*100}%{isTaxInvoice?" (VAT 포함)":""}</td>
              <td style={{ padding:"10px 12px", textAlign:"right", fontWeight:700 }}>₩{fmt(commAmt)}</td>
            </tr>
            {isTaxInvoice ? (
              <>
                <tr style={{ borderBottom:"1px solid #eee" }}>
                  <td style={{ padding:"10px 12px", textAlign:"center", color:"#666" }}>공급가액</td>
                  <td style={{ padding:"10px 12px" }}>수수료 ÷ 1.1</td>
                  <td style={{ padding:"10px 12px", textAlign:"right" }}>₩{fmt(commDetail.supply)}</td>
                </tr>
                <tr style={{ borderBottom:"1px solid #eee" }}>
                  <td style={{ padding:"10px 12px", textAlign:"center", color:"#666" }}>세액 (10%)</td>
                  <td style={{ padding:"10px 12px" }}>공급가액 × 10%</td>
                  <td style={{ padding:"10px 12px", textAlign:"right" }}>₩{fmt(commDetail.tax)}</td>
                </tr>
              </>
            ) : (
              <>
                <tr style={{ borderBottom:"1px solid #eee" }}>
                  <td style={{ padding:"10px 12px", textAlign:"center", color:"#666" }}>원천징수세</td>
                  <td style={{ padding:"10px 12px" }}>수수료 × 3.3%</td>
                  <td style={{ padding:"10px 12px", textAlign:"right", color:"#e11d48" }}>- ₩{fmt(commDetail.withhold)}</td>
                </tr>
              </>
            )}
          </tbody>
          <tfoot>
            <tr style={{ background:"#f5f3ff", borderTop:"2px solid #a78bfa" }}>
              <td colSpan={2} style={{ padding:"10px 12px", fontWeight:700, textAlign:"right", fontSize:13 }}>
                {isTaxInvoice ? "매입세금계산서 수취금액 (VAT포함)" : "실 지급액 (원천징수 후)"}
              </td>
              <td style={{ padding:"10px 12px", textAlign:"right", fontWeight:900, color:"#a78bfa", fontSize:15 }}>
                ₩{fmt(commDetail.totalPay)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* 금액 박스 */}
        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:20 }}>
          <div style={{ border:"2px solid #a78bfa", borderRadius:8, padding:"12px 20px", minWidth:320 }}>
            <div style={{ fontSize:13, color:"#888", marginBottom:8 }}>처리 방식: <strong style={{ color:"#111" }}>{isTaxInvoice?"매입세금계산서 수취":"인적공제 (원천징수 3.3%)"}</strong></div>
            {isTaxInvoice ? (
              <>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"3px 0" }}>
                  <span style={{ color:"#888" }}>공급가액</span><span style={{ fontWeight:600 }}>₩{fmt(commDetail.supply)}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"3px 0" }}>
                  <span style={{ color:"#888" }}>세액(10%)</span><span style={{ fontWeight:600 }}>₩{fmt(commDetail.tax)}</span>
                </div>
              </>
            ) : (
              <>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"3px 0" }}>
                  <span style={{ color:"#888" }}>수수료</span><span style={{ fontWeight:600 }}>₩{fmt(commAmt)}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"3px 0" }}>
                  <span style={{ color:"#888" }}>원천징수(3.3%)</span><span style={{ color:"#e11d48", fontWeight:600 }}>- ₩{fmt(commDetail.withhold)}</span>
                </div>
              </>
            )}
            <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0 0", marginTop:6, borderTop:"1px solid #a78bfa", fontSize:16 }}>
              <span style={{ fontWeight:800 }}>{isTaxInvoice?"지급 합계":"실 지급액"}</span>
              <span style={{ color:"#a78bfa", fontWeight:900 }}>₩{fmt(commDetail.totalPay)}</span>
            </div>
          </div>
        </div>

        {/* 서명란 */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
          {["공급자 확인 (거래처)","공급받는자 확인 (콤마)"].map(label=>(
            <div key={label} style={{ border:"1px solid #ddd", borderRadius:8, padding:"12px 16px", minHeight:60 }}>
              <div style={{ fontSize:11, color:"#aaa", marginBottom:8 }}>{label}</div>
              <div style={{ fontSize:12, color:"#ccc" }}>(서명 / 날인)</div>
            </div>
          ))}
        </div>

        <div className="no-print" style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"10px 20px", borderRadius:8, border:"1px solid #ddd", background:"#f5f5f5", cursor:"pointer", fontSize:13 }}>닫기</button>
          <button onClick={()=>window.print()} style={{ padding:"10px 24px", borderRadius:8, border:"none", background:"#a78bfa", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:13 }}>🖨️ 인쇄 / PDF</button>
        </div>
      </div>
    </div>
  );
}

function OnlinePage({ orders, setOrders, products, retailPartners, dbFns }) {
  const [channel,      setChannel]      = useState("쿠팡");
  const [step,         setStep]         = useState(1);
  const [mapped,       setMapped]       = useState([]);
  const [imported,     setImported]     = useState(null);
  const [error,        setError]        = useState("");
  const [saving,       setSaving]       = useState(false);
  // 네이버 두 파일 상태
  const [naverOrder,   setNaverOrder]   = useState(null); // 주문내역 파일 rows
  const [naverSettle,  setNaverSettle]  = useState(null); // 정산내역 파일 rows
  const [naverOrderName,  setNaverOrderName]  = useState("");
  const [naverSettleName, setNaverSettleName] = useState("");
  const orderFileRef  = useRef();
  const settleFileRef = useRef();
  const coupangFileRef = useRef();

  const partnerId   = channel==="쿠팡"?"R002":"R001";
  const partnerName = retailPartners.find(p=>p.id===partnerId)?.name||channel;

  // XLSX 파싱 공통 함수
  const parseXLSX = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type:"array", cellDates:true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval:"", raw:false });
        resolve(rows);
      } catch(err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.readAsArrayBuffer(file);
  });

  // 쿠팡 파일 처리
  const handleCoupangFile = async (e) => {
    setError(""); setMapped([]);
    const file = e.target.files[0]; if(!file) return;
    try {
      const rows = await parseXLSX(file);
      if (!rows.length) { setError("데이터가 없습니다."); return; }
      if (!Object.prototype.hasOwnProperty.call(rows[0], "주문번호")) {
        setError(`쿠팡 파일 형식이 맞지 않습니다.\n현재 컬럼: ${Object.keys(rows[0]).slice(0,8).join(", ")}`); return;
      }
      const existing = new Set(orders.filter(o=>o.platformOrderId).map(o=>o.platformOrderId));
      const mappedRows = rows.map((row,i) => {
        const orderId   = String(row["주문번호"]||"");
        const rawDate   = String(row["주문일"]||"");
        const date      = rawDate.slice(0,10).replace(/\//g,"-");
        const prodName  = String(row["등록상품명"]||"");
        const option    = String(row["등록옵션명"]||"");
        const qty       = parseInt(String(row["구매수(수량)"]||"1").replace(/,/g,""))||1;
        const amount    = parseInt(String(row["결제액"]||"0").replace(/,/g,""))||0;
        const unitPrice = parseInt(String(row["옵션판매가(판매단가)"]||"0").replace(/,/g,""))||0;
        const isDup     = existing.has(orderId);
        const matched   = matchProduct(prodName, products);
        // 옵션명에서 실제 낱개 수량 추출
        const actualQty = extractQtyFromOption(option) || qty;
        return { orderId, date, productName:prodName, option, qty, actualQty, amount, unitPrice, matchedProductId:matched?.id||"", isDuplicate:isDup, skip:isDup };
      });
      setMapped(mappedRows); setStep(2);
    } catch(err) { setError("파일 읽기 오류: "+err.message); }
  };

  // 네이버 - 주문내역 파일 로드
  const handleNaverOrderFile = async (e) => {
    setError(""); setNaverOrder(null);
    const file = e.target.files[0]; if(!file) return;
    try {
      const rows = await parseXLSX(file);
      if (!rows.length || !Object.prototype.hasOwnProperty.call(rows[0], "상품주문번호")) {
        setError("주문내역 파일 형식이 맞지 않습니다. '상품주문번호' 컬럼을 확인하세요."); return;
      }
      setNaverOrder(rows);
      setNaverOrderName(file.name);
    } catch(err) { setError("주문내역 파일 오류: "+err.message); }
  };

  // 네이버 - 정산내역 파일 로드
  const handleNaverSettleFile = async (e) => {
    setError(""); setNaverSettle(null);
    const file = e.target.files[0]; if(!file) return;
    try {
      const rows = await parseXLSX(file);
      if (!rows.length || !Object.prototype.hasOwnProperty.call(rows[0], "상품주문번호")) {
        setError("정산내역 파일 형식이 맞지 않습니다. '상품주문번호' 컬럼을 확인하세요."); return;
      }
      setNaverSettle(rows);
      setNaverSettleName(file.name);
    } catch(err) { setError("정산내역 파일 오류: "+err.message); }
  };

  // 네이버 두 파일 합산 처리
  const processNaverFiles = () => {
    if (!naverOrder || !naverSettle) { setError("주문내역과 정산내역 파일을 모두 업로드해주세요."); return; }
    setError("");
    // 정산내역을 상품주문번호 기준 Map으로 변환
    const settleMap = {};
    naverSettle.forEach(row => {
      const key = String(row["상품주문번호"]||"").trim();
      settleMap[key] = row;
    });
    const existing = new Set(orders.filter(o=>o.platformOrderId).map(o=>o.platformOrderId));
    // 취소완료 제외 후 매칭
    const validOrders = naverOrder.filter(row => row["클레임상태"] !== "취소완료");
    const mappedRows = validOrders.map((row) => {
      const orderId  = String(row["상품주문번호"]||"").trim();
      const rawDate  = String(row["주문일시"]||"").slice(0,10).replace(/\//g,"-");
      const prodName = String(row["상품명"]||"");
      const option   = String(row["옵션정보"]||"");
      const qty      = parseInt(String(row["수량"]||"1").replace(/,/g,""))||1;
      // 정산내역에서 결제금액 가져오기
      const settle   = settleMap[orderId];
      const amount   = settle ? (parseInt(String(settle["정산기준금액"]||"0").replace(/,/g,""))||0) : 0;
      const date     = settle ? String(settle["결제일"]||rawDate).replace(/\./g,"-").slice(0,10) : rawDate;
      const unitPrice = qty > 0 ? Math.round(amount/qty) : 0;
      const isDup    = existing.has(orderId);
      const matched   = matchProduct(prodName, products);
      const actualQty = extractQtyFromOption(option) || qty;
      const isCancelled = row["클레임상태"] === "취소완료";
      return { orderId, date, productName:prodName, option, qty, actualQty, amount, unitPrice, matchedProductId:matched?.id||"", isDuplicate:isDup, skip:isDup||isCancelled, isCancelled, noSettle: !settle };
    });
    // 취소완료 건수 안내
    const cancelCount = naverOrder.length - validOrders.length;
    if (cancelCount > 0) console.log(`취소완료 ${cancelCount}건 자동 제외`);
    setMapped(mappedRows); setStep(2);
  };

  const doImport = async () => {
    setSaving(true);
    const toImport   = mapped.filter(r=>!r.skip);
    const skippedDup = mapped.filter(r=>r.skip&&r.isDuplicate).length;
    const newOrders  = toImport.map(r=>({
      id:genId("ONL"), date:r.date, type:"온라인소매",
      partner:partnerName, partnerId, channel,
      platformOrderId:r.orderId,
      items: r.matchedProductId ? [{ productId:r.matchedProductId, qty:r.actualQty||r.qty, price:r.unitPrice||Math.round(r.amount/(r.actualQty||r.qty)) }] : [],
      status:"출고완료",
      total:r.amount,
      note:`${channel} | ${r.productName}${r.option?" / "+r.option:""}`,
    }));
    for (const order of newOrders) await dbFns.saveOrder(order);
    // 재고 차감 (상품별 actualQty 합산)
    const stockDeduct = {};
    toImport.forEach(r => {
      if (r.matchedProductId) {
        stockDeduct[r.matchedProductId] = (stockDeduct[r.matchedProductId]||0) + (r.actualQty||r.qty);
      }
    });
    for (const [productId, deductQty] of Object.entries(stockDeduct)) {
      const prod = products.find(p=>p.id===productId);
      if (prod) await dbFns.updateStock(productId, Math.max(0, prod.stock - deductQty));
    }
    setSaving(false);
    setImported({ orders:newOrders, skippedDup, cancelCount: mapped.filter(r=>r.isCancelled).length, stockDeduct });
    setStep(3);
  };

  const reset = () => {
    setStep(1); setMapped([]); setError("");
    setNaverOrder(null); setNaverSettle(null);
    setNaverOrderName(""); setNaverSettleName("");
    if(coupangFileRef.current) coupangFileRef.current.value="";
    if(orderFileRef.current)   orderFileRef.current.value="";
    if(settleFileRef.current)  settleFileRef.current.value="";
  };

  const cancelCount = mapped.filter(r=>r.isCancelled).length;
  const dupCount    = mapped.filter(r=>r.isDuplicate).length;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div><div style={{ color:COLORS.accent, fontSize:11, fontWeight:700, letterSpacing:2 }}>ONLINE SYNC</div>
        <h2 style={{ color:COLORS.text, fontSize:22, fontWeight:800, margin:0 }}>온라인 매출 가져오기</h2></div>

      {/* 채널 선택 */}
      <div style={{ display:"flex", gap:10 }}>
        {["쿠팡","네이버 스마트스토어"].map(ch=>(
          <button key={ch} onClick={()=>{setChannel(ch);reset();}}
            style={{ display:"flex",alignItems:"center",gap:8,padding:"12px 20px",borderRadius:10,
              border:`2px solid ${channel===ch?(ch==="쿠팡"?"#ef4444":"#22c55e"):COLORS.border}`,
              background:channel===ch?(ch==="쿠팡"?"#ef444422":"#22c55e22"):"transparent",
              color:channel===ch?(ch==="쿠팡"?"#ef4444":"#22c55e"):COLORS.textDim,
              cursor:"pointer",fontWeight:700,fontSize:14 }}>
            {ch==="쿠팡"?"🛒":"🟢"} {ch}
          </button>
        ))}
      </div>

      {/* ── STEP 1: 업로드 ── */}
      {step===1 && (
        <Card>
          {channel==="쿠팡" ? (
            <>
              <div style={{ color:COLORS.textDim, fontWeight:700, marginBottom:12, fontSize:14 }}>🛒 쿠팡 엑셀 파일 업로드</div>
              <div style={{ background:COLORS.bg, borderRadius:8, padding:14, marginBottom:16, fontSize:12, color:COLORS.textMuted, lineHeight:2 }}>
                📌 쿠팡 WING → 주문관리 → <strong style={{ color:COLORS.accent }}>발주/발송 관리</strong> → 기간설정 → 엑셀 다운로드<br/>
                ✅ .xlsx 파일 그대로 업로드 가능
              </div>
              <label style={{ display:"inline-flex",alignItems:"center",gap:8,padding:"12px 24px",background:"#ef4444",color:"#fff",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:14 }}>
                📂 쿠팡 엑셀 파일 선택
                <input ref={coupangFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:"none" }} onChange={handleCoupangFile} />
              </label>
            </>
          ) : (
            <>
              <div style={{ color:COLORS.textDim, fontWeight:700, marginBottom:16, fontSize:14 }}>🟢 네이버 스마트스토어 — 파일 2개 업로드</div>
              <div style={{ background:COLORS.bg, borderRadius:8, padding:14, marginBottom:16, fontSize:12, color:COLORS.textMuted, lineHeight:2 }}>
                ⚠️ 네이버는 <strong style={{ color:COLORS.accent }}>2개 파일</strong>을 모두 올려야 합니다.<br/>
                📋 <strong style={{ color:COLORS.text }}>① 주문내역</strong>: 판매관리 → 주문내역 조회 → 엑셀 다운로드 <span style={{ color:COLORS.green }}>(수량/옵션)</span><br/>
                📋 <strong style={{ color:COLORS.text }}>② 정산내역</strong>: 정산관리 → 정산내역 상세 → 엑셀 다운로드 <span style={{ color:COLORS.green }}>(실제 결제금액)</span><br/>
                ✅ 두 파일을 주문번호로 자동 매칭 | 취소완료 건 자동 제외
              </div>

              {/* 파일 1: 주문내역 */}
              <div style={{ marginBottom:12 }}>
                <div style={{ color:COLORS.textDim, fontSize:12, fontWeight:700, marginBottom:8 }}>① 주문내역 파일</div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <label style={{ display:"inline-flex",alignItems:"center",gap:8,padding:"10px 20px",
                    background:naverOrder?COLORS.green+"22":COLORS.surfaceAlt,
                    border:`1px solid ${naverOrder?COLORS.green:COLORS.border}`,
                    color:naverOrder?COLORS.green:COLORS.textDim,borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13 }}>
                    {naverOrder ? "✅ "+naverOrderName : "📂 주문내역 파일 선택"}
                    <input ref={orderFileRef} type="file" accept=".xlsx,.xls" style={{ display:"none" }} onChange={handleNaverOrderFile} />
                  </label>
                  {naverOrder && <span style={{ color:COLORS.textMuted, fontSize:12 }}>{naverOrder.length}건 로드됨</span>}
                </div>
              </div>

              {/* 파일 2: 정산내역 */}
              <div style={{ marginBottom:16 }}>
                <div style={{ color:COLORS.textDim, fontSize:12, fontWeight:700, marginBottom:8 }}>② 정산내역 파일</div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <label style={{ display:"inline-flex",alignItems:"center",gap:8,padding:"10px 20px",
                    background:naverSettle?COLORS.green+"22":COLORS.surfaceAlt,
                    border:`1px solid ${naverSettle?COLORS.green:COLORS.border}`,
                    color:naverSettle?COLORS.green:COLORS.textDim,borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13 }}>
                    {naverSettle ? "✅ "+naverSettleName : "📂 정산내역 파일 선택"}
                    <input ref={settleFileRef} type="file" accept=".xlsx,.xls" style={{ display:"none" }} onChange={handleNaverSettleFile} />
                  </label>
                  {naverSettle && <span style={{ color:COLORS.textMuted, fontSize:12 }}>{naverSettle.length}건 로드됨</span>}
                </div>
              </div>

              {/* 합산 버튼 */}
              <Btn onClick={processNaverFiles}
                style={{ opacity:(naverOrder&&naverSettle)?1:0.5, background:(naverOrder&&naverSettle)?COLORS.accent:COLORS.border, color:(naverOrder&&naverSettle)?"#000":COLORS.textMuted, fontSize:14 }}>
                🔗 두 파일 합산하여 매핑 확인
              </Btn>
            </>
          )}
          {error && (
            <div style={{ marginTop:12,background:COLORS.red+"11",border:`1px solid ${COLORS.red}44`,borderRadius:8,padding:12,color:COLORS.red,fontSize:12,whiteSpace:"pre-wrap" }}>
              ⚠️ {error}
            </div>
          )}
        </Card>
      )}

      {/* ── STEP 2: 매핑 확인 ── */}
      {step===2 && (
        <Card>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
            <div style={{ color:COLORS.cyan,fontWeight:700,fontSize:14 }}>✅ {mapped.length}건 처리 완료 — 확인 후 가져오기</div>
            <Btn variant="ghost" onClick={reset} style={{ fontSize:12 }}>다시 업로드</Btn>
          </div>
          {/* 상태 배너 */}
          <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
            {cancelCount>0 && (
              <div style={{ background:COLORS.red+"11",border:`1px solid ${COLORS.red}44`,borderRadius:8,padding:"8px 14px",fontSize:12,color:COLORS.red }}>
                🚫 취소완료 {cancelCount}건 자동 제외
              </div>
            )}
            {dupCount>0 && (
              <div style={{ background:COLORS.accent+"11",border:`1px solid ${COLORS.accent}44`,borderRadius:8,padding:"8px 14px",fontSize:12,color:COLORS.accent }}>
                ⚠️ 중복 {dupCount}건 자동 건너뜀
              </div>
            )}
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}>
              <thead><tr style={{ borderBottom:`2px solid ${COLORS.border}` }}>
                {["건너뛰기","주문번호","결제일","상품명","옵션","수량","실재고차감","결제금액","단가","ERP 상품"].map(h=>(
                  <th key={h} style={{ padding:"8px 10px",textAlign:"left",color:COLORS.textMuted,fontWeight:600,fontSize:11,whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{mapped.map((r,i)=>(
                <tr key={i} style={{ borderBottom:`1px solid ${COLORS.border}22`, opacity:r.skip?0.4:1,
                  background:r.isCancelled?COLORS.red+"08":r.isDuplicate?COLORS.accent+"08":"transparent" }}>
                  <td style={{ padding:"8px 10px" }}>
                    <input type="checkbox" checked={r.skip} onChange={e=>setMapped(prev=>prev.map((x,idx)=>idx===i?{...x,skip:e.target.checked}:x))} />
                  </td>
                  <td style={{ padding:"8px 10px",color:COLORS.textMuted,fontSize:10 }}>
                    {r.orderId?.slice(-10)}
                    {r.isCancelled && <span style={{ color:COLORS.red,fontSize:9,display:"block" }}>취소완료</span>}
                    {r.isDuplicate && <span style={{ color:COLORS.accent,fontSize:9,display:"block" }}>⚠기등록</span>}
                  </td>
                  <td style={{ padding:"8px 10px",color:COLORS.textDim,whiteSpace:"nowrap" }}>{r.date}</td>
                  <td style={{ padding:"8px 10px",color:COLORS.text,maxWidth:140 }}>
                    <div style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{r.productName}</div>
                  </td>
                  <td style={{ padding:"8px 10px",color:COLORS.textMuted,maxWidth:110 }}>
                    <div style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{r.option}</div>
                  </td>
                  <td style={{ padding:"8px 10px",textAlign:"right" }}>{fmt(r.qty)}</td>
                  <td style={{ padding:"8px 10px",textAlign:"right" }}>
                    <span style={{ color:(r.actualQty&&r.actualQty!==r.qty)?COLORS.accent:COLORS.textMuted, fontWeight:(r.actualQty&&r.actualQty!==r.qty)?700:400 }}>
                      {fmt(r.actualQty||r.qty)}개
                    </span>
                  </td>
                  <td style={{ padding:"8px 10px",textAlign:"right",color:COLORS.green }}>₩{fmt(r.amount)}</td>
                  <td style={{ padding:"8px 10px",textAlign:"right",color:COLORS.accent }}>₩{fmt(r.unitPrice)}</td>
                  <td style={{ padding:"8px 10px",minWidth:160 }}>
                    <select value={r.matchedProductId}
                      onChange={e=>setMapped(prev=>prev.map((x,idx)=>idx===i?{...x,matchedProductId:e.target.value}:x))}
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
              가져올 건: <strong style={{ color:COLORS.green }}>{mapped.filter(r=>!r.skip).length}건</strong>
              {cancelCount>0 && <>&nbsp;/&nbsp; 취소제외: <strong style={{ color:COLORS.red }}>{cancelCount}건</strong></>}
              {dupCount>0   && <>&nbsp;/&nbsp; 중복제외: <strong style={{ color:COLORS.accent }}>{dupCount}건</strong></>}
              &nbsp;/&nbsp; 미매핑: <strong style={{ color:COLORS.red }}>{mapped.filter(r=>!r.skip&&!r.matchedProductId).length}건</strong>
            </div>
            <Btn onClick={doImport} style={{ opacity:saving?0.6:1,fontSize:14 }}>
              {saving?"저장 중...":"✅ "+mapped.filter(r=>!r.skip).length+"건 가져오기"}
            </Btn>
          </div>
        </Card>
      )}

      {/* ── STEP 3: 완료 ── */}
      {step===3 && imported && (
        <Card style={{ textAlign:"center",padding:32 }}>
          <div style={{ fontSize:48,marginBottom:12 }}>🎉</div>
          <div style={{ color:COLORS.green,fontWeight:800,fontSize:22,marginBottom:16 }}>
            {imported.orders.length}건 가져오기 완료!
          </div>
          <div style={{ display:"flex",justifyContent:"center",gap:24,marginBottom:20,flexWrap:"wrap" }}>
            <div><div style={{ color:COLORS.green,fontWeight:800,fontSize:22 }}>{imported.orders.length}</div><div style={{ color:COLORS.textMuted,fontSize:12 }}>신규 등록</div></div>
            {imported.cancelCount>0 && <>
              <div style={{ width:1,background:COLORS.border }} />
              <div><div style={{ color:COLORS.red,fontWeight:800,fontSize:22 }}>{imported.cancelCount}</div><div style={{ color:COLORS.textMuted,fontSize:12 }}>취소 제외</div></div>
            </>}
            {imported.skippedDup>0 && <>
              <div style={{ width:1,background:COLORS.border }} />
              <div><div style={{ color:COLORS.accent,fontWeight:800,fontSize:22 }}>{imported.skippedDup}</div><div style={{ color:COLORS.textMuted,fontSize:12 }}>중복 제외</div></div>
            </>}
          </div>
          <div style={{ color:COLORS.textMuted,fontSize:13,marginBottom:12 }}>출고관리 및 매출분석에 자동 반영되었습니다.</div>
          {imported.stockDeduct && Object.keys(imported.stockDeduct).length>0 && (
            <div style={{ background:COLORS.green+"11", border:`1px solid ${COLORS.green}33`, borderRadius:10, padding:14, marginBottom:16, textAlign:"left" }}>
              <div style={{ color:COLORS.green, fontWeight:700, fontSize:13, marginBottom:8 }}>📦 재고 자동 차감 완료</div>
              {Object.entries(imported.stockDeduct).map(([pid, qty])=>{
                const prod = products.find(p=>p.id===pid);
                return (
                  <div key={pid} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"3px 0" }}>
                    <span style={{ color:COLORS.textDim }}>{prod?.name||pid}</span>
                    <span style={{ color:COLORS.red, fontWeight:700 }}>- {fmt(qty)}개</span>
                  </div>
                );
              })}
            </div>
          )}
          <Btn variant="ghost" onClick={reset}>추가 업로드</Btn>
        </Card>
      )}
    </div>
  );
}
