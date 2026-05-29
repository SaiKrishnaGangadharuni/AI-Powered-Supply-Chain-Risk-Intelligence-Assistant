import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { api } from '../api/client.js'

// ── Brand colours ──────────────────────────────────────────────────────────
const BLUE   = '#3B82F6'
const AMBER  = '#F59E0B'
const RED    = '#EF4444'
const GREEN  = '#10B981'
const PURPLE = '#8B5CF6'
const PIE_COLORS = [BLUE, GREEN, AMBER, RED, PURPLE, '#6366F1', '#EC4899']

// ── Tiny stat card ──────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'text-blue-600' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
      <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold ${color}`}>{value ?? '—'}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

// ── Section wrapper ─────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      {children}
    </div>
  )
}

// ── Loading / error states ──────────────────────────────────────────────────
function Placeholder({ text = 'Loading…' }) {
  return (
    <div className="h-40 flex items-center justify-center text-gray-400 text-sm">{text}</div>
  )
}

// ── Custom tooltip ──────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <span className="font-medium">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function useFetch(fetchFn) {
  const [data, setData] = useState(null)
  const [err, setErr]   = useState(null)
  useEffect(() => {
    let alive = true
    fetchFn()
      .then(d => alive && setData(d))
      .catch(e => alive && setErr(e.message))
    return () => { alive = false }
  }, [])
  return { data, err }
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function Analytics() {
  const summary   = useFetch(() => api.get('/api/analytics/summary'))
  const byMarket  = useFetch(() => api.get('/api/analytics/late-delivery-by-market'))
  const byMode    = useFetch(() => api.get('/api/analytics/shipment-mode-breakdown'))
  const orderStat = useFetch(() => api.get('/api/analytics/order-status-distribution'))
  const gapRegion = useFetch(() => api.get('/api/analytics/delivery-gap-by-region'))
  const fraud     = useFetch(() => api.get('/api/analytics/fraud-by-market'))

  const kpi = summary.data || {}

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6 space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Total Orders Analysed"
          value={kpi.total_orders?.toLocaleString()}
          color="text-blue-600"
        />
        <KpiCard
          label="Late Delivery Rate"
          value={kpi.late_delivery_rate_pct != null ? `${kpi.late_delivery_rate_pct}%` : null}
          color={kpi.late_delivery_rate_pct > 50 ? 'text-red-500' : 'text-amber-500'}
          sub="Late_delivery_risk = 1"
        />
        <KpiCard
          label="Cancellation Rate"
          value={kpi.cancellation_rate_pct != null ? `${kpi.cancellation_rate_pct}%` : null}
          color="text-red-500"
        />
        <KpiCard
          label="Fraud Signal Rate"
          value={kpi.fraud_rate_pct != null ? `${kpi.fraud_rate_pct}%` : null}
          color="text-purple-600"
          sub="SUSPECTED_FRAUD orders"
        />
        <KpiCard
          label="Avg Profit / Order"
          value={kpi.avg_profit_per_order != null ? `$${kpi.avg_profit_per_order}` : null}
          color={kpi.avg_profit_per_order < 0 ? 'text-red-500' : 'text-green-600'}
        />
      </div>

      {/* Row 1: Late delivery by market + Shipment mode breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Late Delivery Rate by Market (%)">
          {byMarket.err ? (
            <Placeholder text={`Error: ${byMarket.err}`} />
          ) : !byMarket.data ? (
            <Placeholder />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byMarket.data.data} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="market" tick={{ fontSize: 11 }} />
                <YAxis unit="%" tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="late_rate" name="Late Rate %" fill={RED} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        <Section title="Orders by Shipping Mode">
          {byMode.err ? (
            <Placeholder text={`Error: ${byMode.err}`} />
          ) : !byMode.data ? (
            <Placeholder />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={byMode.data.data}
                  dataKey="order_count"
                  nameKey="shipping_mode"
                  cx="50%" cy="50%"
                  outerRadius={90}
                  label={({ shipping_mode, percent }) =>
                    `${shipping_mode} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {byMode.data.data.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => v.toLocaleString()} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Section>
      </div>

      {/* Row 2: Order status distribution + Delivery gap by region */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Order Status Distribution">
          {orderStat.err ? (
            <Placeholder text={`Error: ${orderStat.err}`} />
          ) : !orderStat.data ? (
            <Placeholder />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={orderStat.data.data}
                layout="vertical"
                margin={{ left: 80, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="status" type="category" tick={{ fontSize: 10 }} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Orders" fill={BLUE} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        <Section title="Avg Shipping Gap (Real − Scheduled Days) by Region">
          {gapRegion.err ? (
            <Placeholder text={`Error: ${gapRegion.err}`} />
          ) : !gapRegion.data ? (
            <Placeholder />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={gapRegion.data.data} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="region"
                  tick={{ fontSize: 9 }}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={55}
                />
                <YAxis unit="d" tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="avg_gap_days"
                  name="Avg Gap (days)"
                  fill={AMBER}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>
      </div>

      {/* Row 3: Fraud by market */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Fraud Signal Rate by Market (%)">
          {fraud.err ? (
            <Placeholder text={`Error: ${fraud.err}`} />
          ) : !fraud.data ? (
            <Placeholder />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={fraud.data.data} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="market" tick={{ fontSize: 11 }} />
                <YAxis unit="%" tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="fraud_rate" name="Fraud Rate %" fill={PURPLE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        <Section title="Late Rate vs Order Volume by Shipping Mode">
          {byMode.err || !byMode.data ? (
            <Placeholder text={byMode.err || 'Loading…'} />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byMode.data.data} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="shipping_mode" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar yAxisId="left"  dataKey="order_count" name="Orders"        fill={BLUE}  radius={[4,4,0,0]} />
                <Bar yAxisId="right" dataKey="late_rate"   name="Late Rate %"   fill={RED}   radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>
      </div>
    </div>
  )
}
