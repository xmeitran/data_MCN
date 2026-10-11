import type { Creator, CreatorProfile, DashboardData } from "@/lib/mcn/dashboard";
import { Icon } from "./icons";
import { metricDomain, metricLabel } from "@/lib/metrics";

export type View = "overview" | "discover" | "brands" | "creators" | "deals" | "reports" | "operations" | "soon";

export type DashboardFilters = { from?: string; to?: string; creatorLevel?: string };

export type ViewProps = {
  data: DashboardData;
  accessKey: string;
  filters: DashboardFilters;
  params: Record<string, string | undefined>;
};

const PAGE_SIZE = 20;

const endpointLabels: Record<string, string> = {
  affiliate_orders: "Affiliate orders",
  creator_profile: "Creator profile",
  live_core_stats: "LIVE core stats",
  live_gmv_trend: "LIVE GMV trend",
  live_view_trend: "LIVE view trend",
  live_interactive_trend: "LIVE interaction",
  live_traffic: "LIVE traffic",
  live_product_stats: "LIVE product",
  partner_campaigns: "Partner campaigns",
  partner_campaign_performance: "Campaign performance",
  showcase_products: "Showcase products",
  sample_applications: "Sample applications",
};

const sortFields = {
  gmv: "gmv",
  views: "avg_views",
  posts: "video_count",
  er: "engagement_rate",
  followers: "followers",
} as const satisfies Record<string, keyof CreatorProfile>;
type SortKey = keyof typeof sortFields;

export function fmtNumber(value: number | null | undefined, maximumFractionDigits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits }).format(Number(value));
}

function fmtCompact(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value));
}

function fmtCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const amount = Number(value);
  if (Math.abs(amount) >= 1_000_000_000) return `${fmtNumber(amount / 1_000_000_000, 1)} tỷ`;
  if (Math.abs(amount) >= 1_000_000) return `${fmtNumber(amount / 1_000_000, 1)} triệu`;
  return `${fmtNumber(amount)} đ`;
}

function fmtPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${fmtNumber(Number(value), 2)}%`;
}

export function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function rangeLabel(filters: DashboardFilters) {
  if (!filters.from && !filters.to) return "Snapshot mới nhất";
  return `${filters.from ? fmtDate(filters.from) : "…"} – ${filters.to ? fmtDate(filters.to) : "nay"}`;
}

function creatorName(creator: Creator | undefined, fallback = "Creator chưa định danh") {
  return creator?.display_name || creator?.username || creator?.open_id || fallback;
}

function handleOf(creator: Creator) {
  return creator.username || creator.open_id.slice(0, 14);
}

export function latestProfiles(profiles: CreatorProfile[]) {
  const result = new Map<string, CreatorProfile>();
  for (const profile of profiles) if (!result.has(profile.creator_id)) result.set(profile.creator_id, profile);
  return result;
}

function sum(profiles: Iterable<CreatorProfile>, field: keyof CreatorProfile) {
  let total = 0;
  for (const profile of profiles) total += Number(profile[field] ?? 0);
  return total;
}

export function queryFor(accessKey: string, view: View, filters: DashboardFilters = {}, extra: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = { key: accessKey, view, ...filters, ...extra };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  return query.toString();
}

function Hidden({ values }: { values: Record<string, string | undefined> }) {
  return <>{Object.entries(values).map(([name, value]) => value ? <input type="hidden" name={name} value={value} key={name} /> : null)}</>;
}

function StatusTag({ value }: { value: string | null | undefined }) {
  const normalized = (value ?? "unknown").toLowerCase();
  const tone = ["active", "accepted", "confirmed", "in_progress", "approved", "completed", "done"].includes(normalized)
    ? "success"
    : ["blocked", "critical", "cancelled", "declined", "revoked"].includes(normalized)
      ? "danger"
      : "warning";
  return <span className={`status-tag ${tone}`}>{(value ?? "unknown").replaceAll("_", " ")}</span>;
}

function Avatar({ name, square = false }: { name: string; square?: boolean }) {
  return <span className={square ? "avatar square" : "avatar"} aria-hidden="true">{(name[0] ?? "C").toUpperCase()}</span>;
}

function Person({ creator }: { creator: Creator | undefined }) {
  const name = creatorName(creator);
  return (
    <div className="person">
      <Avatar name={name} />
      <div>
        <strong>{name}</strong>
        {creator && <span>@{handleOf(creator)}</span>}
      </div>
    </div>
  );
}

function Kpi({ label, hint, value, caption }: { label: string; hint: string; value: string; caption: string }) {
  return (
    <article className="kpi">
      <p className="kpi-label">
        {label}
        <span className="kpi-info" title={hint}><Icon name="info" size={14} /><span className="sr-only">{hint}</span></span>
      </p>
      <strong>{value}</strong>
      <span className="kpi-caption">{caption}</span>
    </article>
  );
}

function CardHeader({ title, count, detail, action }: { title: string; count?: number; detail?: string; action?: React.ReactNode }) {
  return (
    <div className="card-header">
      <div>
        <h2>{title}{count !== undefined && <span className="count-badge">{fmtNumber(count)}</span>}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state" role="status">
      <span className="empty-mark"><Icon name="help" size={20} /></span>
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}

type Cell = string | number | null | undefined;

function ExportLink({ filename, rows }: { filename: string; rows: Cell[][] }) {
  // Prefix formula-looking text so spreadsheets don't execute creator-supplied names.
  const cell = (value: Cell) => {
    const text = typeof value === "string" && /^[=+\-@]/.test(value) ? `'${value}` : String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = rows.map((row) => row.map(cell).join(",")).join("\n");
  return (
    <a className="btn" download={filename} href={`data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${csv}`)}`}>
      Export <Icon name="download" size={15} />
    </a>
  );
}

function Pager({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label="Phân trang">
      {page > 1 ? <a className="btn" href={href(page - 1)}>← Trước</a> : <span />}
      <span className="pager-current">{page} / {pages}</span>
      {page < pages ? <a className="btn" href={href(page + 1)}>Sau →</a> : <span />}
    </nav>
  );
}

function FilterBar({ view, accessKey, filters }: { view: View; accessKey: string; filters: DashboardFilters }) {
  return (
    <div className="filter-bar">
      <form method="get">
        <Hidden values={{ key: accessKey, view }} />
        <div className="date-filter">
          <Icon name="calendar" size={16} />
          <input name="from" type="date" aria-label="Từ ngày" defaultValue={filters.from} />
          <span aria-hidden="true">–</span>
          <input name="to" type="date" aria-label="Đến ngày" defaultValue={filters.to} />
        </div>
        <select className="pill-select" name="creatorLevel" aria-label="Creator level" defaultValue={filters.creatorLevel ?? ""}>
          <option value="">Creator Level</option>
          <option value="mega">Mega · từ 1M followers</option>
          <option value="mid">Mid · 100K–1M</option>
          <option value="mass">Mass · dưới 100K</option>
        </select>
        <button className="btn" type="submit">Áp dụng</button>
      </form>
      <a className="btn primary" href={`?${queryFor(accessKey, "reports", filters)}`}>
        <Icon name="download" size={15} /> Generate Report
      </a>
    </div>
  );
}

const tabs: { label: string; view: View }[] = [
  { label: "Overview", view: "overview" },
  { label: "Creators", view: "creators" },
  { label: "Metrics", view: "reports" },
  { label: "Automation", view: "operations" },
  { label: "Sample Funnel", view: "deals" },
];

function AnalyticsTabs({ active, accessKey, filters }: { active: View; accessKey: string; filters: DashboardFilters }) {
  return (
    <nav className="tabs" aria-label="Analytics sections">
      {tabs.map((tab) => (
        <a aria-current={tab.view === active ? "page" : undefined} href={`?${queryFor(accessKey, tab.view, filters)}`} key={tab.label}>{tab.label}</a>
      ))}
    </nav>
  );
}

function AnalyticsHeader({ view, accessKey, filters }: { view: View; accessKey: string; filters: DashboardFilters }) {
  return <><FilterBar view={view} accessKey={accessKey} filters={filters} /><AnalyticsTabs active={view} accessKey={accessKey} filters={filters} /></>;
}

export function Overview({ data, accessKey, filters }: ViewProps) {
  const profiles = latestProfiles(data.profiles);
  const snapshots = [...profiles.values()];
  const activeCreators = data.creators.filter((creator) => creator.mcn_status === "active");
  const openTasks = data.tasks.filter((task) => !["done", "cancelled"].includes(task.status));
  const openIssues = data.issues.filter((issue) => !["resolved", "closed"].includes(issue.status));
  const pulse = [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)).slice(-7);
  const maxGmv = Math.max(...pulse.map((profile) => Number(profile.gmv ?? 0)), 1);
  const videoGmv = sum(snapshots, "video_gmv");
  const videoCount = sum(snapshots, "video_count");
  const topCreators = activeCreators
    .map((creator) => ({ creator, profile: profiles.get(creator.id) }))
    .sort((a, b) => Number(b.profile?.gmv ?? 0) - Number(a.profile?.gmv ?? 0))
    .slice(0, 8);
  const range = rangeLabel(filters);
  const observedMetrics = [...new Map(data.metricDaily.map((row) => [row.metric_key, row])).values()]
    .sort((a, b) => Math.abs(Number(b.total_value ?? 0)) - Math.abs(Number(a.total_value ?? 0)));
  const queue = [
    ...openTasks.slice(0, 3).map((task) => ({ key: task.id, title: task.title, meta: `${task.task_type} · ${task.owner_name || "Chưa giao"}`, status: task.priority })),
    ...openIssues.slice(0, 2).map((issue) => ({ key: issue.id, title: issue.title, meta: `${issue.category} · ${issue.owner_name || "Chưa giao"}`, status: issue.severity })),
  ];

  return <>
    <AnalyticsHeader view="overview" accessKey={accessKey} filters={filters} />
    <div className="kpi-grid">
      <Kpi label="Total Affiliate GMV" hint="GMV gắn với creator trong snapshot mới nhất" value={fmtCurrency(sum(snapshots, "gmv"))} caption={range} />
      <Kpi label="Video GMV" hint="GMV đến từ video" value={fmtCurrency(videoGmv)} caption={range} />
      <Kpi label="Videos Posted" hint="Số video creator đã đăng" value={fmtNumber(videoCount)} caption={range} />
      <Kpi label="Video Views" hint="Tổng lượt xem video" value={fmtCompact(sum(snapshots, "video_views"))} caption={range} />
      <Kpi label="Active Creators" hint="Creator có MCN status = active" value={fmtNumber(activeCreators.length)} caption={`${fmtNumber(data.creators.length)} hồ sơ trong CRM`} />
      <Kpi label="GMV per Video" hint="Video GMV chia cho số video" value={videoCount ? fmtCurrency(videoGmv / videoCount) : "—"} caption={range} />
      <Kpi label="LIVE GMV" hint="GMV đến từ livestream" value={fmtCurrency(sum(snapshots, "live_gmv"))} caption={`${fmtNumber(sum(snapshots, "live_hours"), 1)} giờ live`} />
      <Kpi label="Orders" hint="Tổng đơn hàng trong snapshot" value={fmtNumber(sum(snapshots, "orders"))} caption={`${fmtCompact(sum(snapshots, "product_clicks"))} product clicks`} />
    </div>

    <section className="card">
      <CardHeader
        title="Observed TikTok metrics"
        count={observedMetrics.length}
        detail="Hiển thị trực tiếp mọi metric đã có trong warehouse, không giới hạn theo bộ KPI cố định"
        action={<a className="text-link" href={`?${queryFor(accessKey, "reports", filters)}`}>Mở toàn bộ metric →</a>}
      />
      {observedMetrics.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Metric</th><th>Endpoint</th><th>Ngày</th><th>Observations</th><th>Total</th><th>Average</th></tr></thead>
            <tbody>
              {observedMetrics.map((row) => (
                <tr key={`${row.metric_path}-${row.endpoint_key}`}>
                  <td><strong>{metricLabel(row.metric_key)}</strong><small className="mono">{row.metric_key}</small></td>
                  <td>{row.endpoint_key}</td>
                  <td>{row.metric_date || "—"}</td>
                  <td>{fmtNumber(row.observations)}</td>
                  <td className="money">{fmtNumber(row.total_value, 2)}</td>
                  <td>{fmtNumber(row.average_value, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="Chưa có metric từ TikTok" detail="Chạy đồng bộ để warehouse nhận dữ liệu và tự dựng bảng metric." />}
    </section>

    <section className="card">
      <CardHeader
        title="Top Creators"
        count={topCreators.length}
        action={<ExportLink filename="top-creators.csv" rows={[["Creator", "Username", "GMV", "Avg views", "Shop posts", "Engagement %", "Followers", "Live hours"], ...topCreators.map(({ creator, profile }) => [creatorName(creator), handleOf(creator), profile?.gmv, profile?.avg_views, profile?.video_count, profile?.engagement_rate, profile?.followers, profile?.live_hours])]} />}
      />
      {topCreators.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Rank</th><th>Creator</th><th>GMV</th><th>Avg Views</th><th>Shop Posts</th><th>Engagement Rate</th><th>Followers</th><th>Live Hours</th></tr></thead>
            <tbody>
              {topCreators.map(({ creator, profile }, index) => (
                <tr key={creator.id}>
                  <td className="rank">#{index + 1}</td>
                  <td><Person creator={creator} /></td>
                  <td className="money">{fmtCurrency(profile?.gmv)}</td>
                  <td>{fmtCompact(profile?.avg_views)}</td>
                  <td>{fmtNumber(profile?.video_count)}</td>
                  <td>{fmtPercent(profile?.engagement_rate)}</td>
                  <td>{fmtCompact(profile?.followers)}</td>
                  <td>{fmtNumber(profile?.live_hours, 1)}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="Chưa có creator performance" detail="Khi TikTok sync có snapshot, bảng top creators sẽ tự động hiển thị." />}
    </section>

    <div className="card-grid">
      <section className="card">
        <CardHeader title="Performance Pulse" detail="GMV snapshot theo ngày gần nhất" />
        {pulse.length ? (
          <div className="bar-chart" aria-label="GMV snapshots">
            {pulse.map((profile) => (
              <div className="bar-column" key={`${profile.creator_id}-${profile.snapshot_date}`}>
                <span className="bar-value">{fmtCurrency(profile.gmv)}</span>
                <div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max((Number(profile.gmv ?? 0) / maxGmv) * 100, 5)}%` }} /></div>
                <span>{fmtDate(profile.snapshot_date).slice(0, 5)}</span>
              </div>
            ))}
          </div>
        ) : <EmptyState title="Chưa có performance snapshot" detail="Chạy sync TikTok để tạo dữ liệu báo cáo đầu tiên." />}
      </section>

      <section className="card">
        <CardHeader title="Việc cần xử lý" count={openTasks.length + openIssues.length} action={<a className="text-link" href={`?${queryFor(accessKey, "operations", filters)}`}>Xem tất cả</a>} />
        {queue.length ? (
          <div className="row-list">
            {queue.map((item) => (
              <div className="row" key={item.key}>
                <div className="row-main"><strong>{item.title}</strong><span>{item.meta}</span></div>
                <StatusTag value={item.status} />
              </div>
            ))}
          </div>
        ) : <EmptyState title="Không có việc tồn" detail="Tất cả task và issue đang ở trạng thái ổn." />}
      </section>

      <section className="card" id="data-foundation">
        <CardHeader title="Độ phủ dữ liệu" detail="Kết nối và đồng bộ TikTok" />
        <dl className="fact-list">
          <div><dt>Tài khoản kết nối</dt><dd>{fmtNumber(data.connections.length)}</dd></div>
          <div><dt>Sync gần nhất</dt><dd>{data.syncRuns[0] ? fmtDate(data.syncRuns[0].started_at) : "—"}</dd></div>
          <div><dt>Metric warehouse</dt><dd>{fmtNumber(data.metricDaily.length)}</dd></div>
          <div><dt>Cảnh báo</dt><dd className={data.warnings.length ? "text-danger" : "text-success"}>{data.warnings.length || "OK"}</dd></div>
        </dl>
      </section>
    </div>
  </>;
}

export function Discover({ data, accessKey, filters, params }: ViewProps) {
  const profiles = latestProfiles(data.profiles);
  const q = (params.q ?? "").trim().toLowerCase();
  const live = params.tab === "live";
  const sort: SortKey = params.sort && params.sort in sortFields ? (params.sort as SortKey) : "gmv";
  const rows = data.creators.map((creator) => {
    const profile = profiles.get(creator.id);
    return { creator, profile, category: profile?.top_category || creator.top_category || "" };
  });
  const categories = [...new Set(rows.map((row) => row.category).filter(Boolean))].sort();
  const matched = rows.filter((row) =>
    (!q || `${creatorName(row.creator)} ${row.creator.username ?? ""}`.toLowerCase().includes(q)) &&
    (!params.cat || row.category === params.cat));
  const liveCount = matched.filter((row) => Number(row.profile?.live_hours ?? 0) > 0).length;
  const filtered = matched
    .filter((row) => !live || Number(row.profile?.live_hours ?? 0) > 0)
    .sort((a, b) => Number(b.profile?.[sortFields[sort]] ?? 0) - Number(a.profile?.[sortFields[sort]] ?? 0));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(Number(params.page) || 1, 1), pages);
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const state = { q: params.q, cat: params.cat, tab: params.tab, sort: params.sort };
  const link = (extra: Record<string, string | undefined>) => `?${queryFor(accessKey, "discover", filters, { ...state, ...extra })}`;
  const SortHeader = ({ id, label }: { id: SortKey; label: string }) => (
    <th aria-sort={sort === id ? "descending" : undefined}>
      <a aria-current={sort === id ? "true" : undefined} href={link({ sort: id, page: "" })}>{label} <Icon name="arrowDown" size={13} /></a>
    </th>
  );

  return <>
    <div className="toolbar-row">
      <nav className="tabs inline" aria-label="Loại creator">
        <a aria-current={!live ? "page" : undefined} href={link({ tab: "", page: "" })}>Video creators <small>{fmtNumber(matched.length)}</small></a>
        <a aria-current={live ? "page" : undefined} href={link({ tab: "live", page: "" })}>LIVE creators <small>{fmtNumber(liveCount)}</small></a>
      </nav>
      <span className="muted">{data.syncRuns[0] ? `Cập nhật ${fmtDate(data.syncRuns[0].started_at)}` : "Chưa có dữ liệu sync"}</span>
      <ExportLink filename="creators.csv" rows={[["Creator", "Username", "Category", "GMV", "Avg views", "Shop posts", "Engagement %", "Followers"], ...filtered.map(({ creator, profile, category }) => [creatorName(creator), handleOf(creator), category, profile?.gmv, profile?.avg_views, profile?.video_count, profile?.engagement_rate, profile?.followers])]} />
    </div>

    <form className="toolbar" method="get" id="creator-search">
      <Hidden values={{ key: accessKey, view: "discover", ...filters, tab: params.tab, sort: params.sort }} />
      <span className="result-count">{shown.length ? `${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + shown.length}` : "0"} of {fmtNumber(filtered.length)} Results</span>
      <label className="field">
        <span className="sr-only">Tìm creator theo tên</span>
        <Icon name="search" size={16} />
        <input name="q" type="search" defaultValue={params.q} placeholder="Search creators by name" />
      </label>
      <label className="field">
        <span className="sr-only">Lọc theo ngành hàng</span>
        <Icon name="list" size={16} />
        <select name="cat" defaultValue={params.cat ?? ""}>
          <option value="">Filter Category</option>
          {categories.map((category) => <option key={category}>{category}</option>)}
        </select>
      </label>
      <button className="btn" type="submit">Lọc</button>
    </form>

    <section className="card">
      {shown.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Creator</th><th>Category</th><SortHeader id="gmv" label="GMV" /><SortHeader id="views" label="Avg Views" /><SortHeader id="posts" label="Shop Posts" /><SortHeader id="er" label="Engagement Rate" /><SortHeader id="followers" label="Followers" /></tr>
            </thead>
            <tbody>
              {shown.map(({ creator, profile, category }) => (
                <tr key={creator.id}>
                  <td><Person creator={creator} /></td>
                  <td>{category ? <span className="chip">{category}</span> : "—"}</td>
                  <td className="money">{fmtCurrency(profile?.gmv)}</td>
                  <td>{fmtCompact(profile?.avg_views)}</td>
                  <td>{fmtNumber(profile?.video_count)}</td>
                  <td>{fmtPercent(profile?.engagement_rate)}</td>
                  <td>{fmtCompact(profile?.followers)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="Chưa tìm thấy creator" detail="Thử từ khóa hoặc ngành hàng khác, hoặc chạy sync TikTok để nạp creator." />}
      <Pager page={page} pages={pages} href={(next) => link({ page: String(next) })} />
    </section>
  </>;
}

export function Brands({ data, accessKey, filters, params }: ViewProps) {
  const q = (params.q ?? "").trim().toLowerCase();
  const rows = data.brands
    .filter((brand) => !q || brand.name.toLowerCase().includes(q))
    .map((brand) => {
      const campaigns = data.campaigns.filter((campaign) => campaign.brand_id === brand.id);
      return {
        brand,
        campaigns: campaigns.length,
        active: campaigns.filter((campaign) => campaign.status === "active").length,
        targetGmv: campaigns.reduce((total, campaign) => total + Number(campaign.target_gmv ?? 0), 0),
      };
    })
    .sort((a, b) => b.targetGmv - a.targetGmv);

  return <>
    <form className="toolbar" method="get">
      <Hidden values={{ key: accessKey, view: "brands", ...filters }} />
      <span className="result-count">{fmtNumber(rows.length)} Results</span>
      <label className="field">
        <span className="sr-only">Tìm brand</span>
        <Icon name="search" size={16} />
        <input name="q" type="search" defaultValue={params.q} placeholder="Search brands" />
      </label>
      <button className="btn" type="submit">Tìm</button>
    </form>
    <section className="card">
      {rows.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Rank</th><th>Brand Name</th><th>Status</th><th>Target GMV</th><th>Campaigns</th><th>Active</th><th>Contact</th></tr></thead>
            <tbody>
              {rows.map(({ brand, campaigns, active, targetGmv }, index) => (
                <tr key={brand.id}>
                  <td className="rank">#{index + 1}</td>
                  <td><div className="person"><Avatar name={brand.name} square /><div><strong>{brand.name}</strong></div></div></td>
                  <td><StatusTag value={brand.status} /></td>
                  <td className="money">{fmtCurrency(targetGmv)}</td>
                  <td>{fmtNumber(campaigns)}</td>
                  <td>{fmtNumber(active)}</td>
                  <td>{brand.contact_name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="Chưa có brand" detail="Brand xuất hiện khi được thêm vào bảng mcn_brands và gắn với campaign." />}
    </section>
  </>;
}

export function Creators({ data, accessKey, filters, params }: ViewProps) {
  const profiles = latestProfiles(data.profiles);
  const q = (params.q ?? "").trim().toLowerCase();
  const creators = data.creators.filter((creator) => !q || `${creatorName(creator)} ${creator.username ?? ""} ${creator.industry ?? ""} ${creator.location ?? ""}`.toLowerCase().includes(q));
  const pending = data.creators.filter((creator) => creator.onboarding_status !== "completed").length;

  return <>
    <AnalyticsHeader view="creators" accessKey={accessKey} filters={filters} />
    <div className="kpi-grid">
      <Kpi label="Creator Database" hint="Tổng hồ sơ creator trong CRM" value={fmtNumber(data.creators.length)} caption="Single source of truth" />
      <Kpi label="Active" hint="Creator đang trong mạng lưới" value={fmtNumber(data.creators.filter((creator) => creator.mcn_status === "active").length)} caption="Đang trong mạng lưới" />
      <Kpi label="Onboarding" hint="Creator chưa hoàn tất onboarding" value={fmtNumber(pending)} caption="Cần hoàn thiện hồ sơ" />
      <Kpi label="With Performance" hint="Creator đã có snapshot KPI" value={fmtNumber(profiles.size)} caption="Có snapshot KPI" />
    </div>
    <section className="card">
      <CardHeader
        title="Creator / KOC CRM"
        count={creators.length}
        detail="Identity, ownership và KPI mới nhất"
        action={
          <form className="inline-search" method="get">
            <Hidden values={{ key: accessKey, view: "creators", ...filters }} />
            <label className="field">
              <span className="sr-only">Tìm creator</span>
              <Icon name="search" size={16} />
              <input name="q" type="search" defaultValue={params.q} placeholder="Tên, username, ngành hàng…" />
            </label>
            <button className="btn" type="submit">Tìm</button>
          </form>
        }
      />
      {creators.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Creator</th><th>MCN Status</th><th>Industry / Location</th><th>Followers</th><th>GMV</th><th>Live Hours</th><th>Owner / PIC</th></tr></thead>
            <tbody>
              {creators.map((creator) => {
                const profile = profiles.get(creator.id);
                return (
                  <tr key={creator.id}>
                    <td><Person creator={creator} /></td>
                    <td><StatusTag value={creator.mcn_status} /><small>{creator.onboarding_status.replaceAll("_", " ")}</small></td>
                    <td>{creator.industry || "Chưa cập nhật"}<small>{creator.location || "—"}</small></td>
                    <td>{fmtCompact(profile?.followers)}<small>Avg {fmtCompact(profile?.avg_views)}</small></td>
                    <td className="money">{fmtCurrency(profile?.gmv)}<small>{fmtCurrency(profile?.nmv)} NMV</small></td>
                    <td>{fmtNumber(profile?.live_hours, 1)}h<small>{fmtCompact(profile?.live_views)} views</small></td>
                    <td>{creator.pic_name || "Chưa giao"}<small>{creator.platform || "tiktok"}</small></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="Chưa tìm thấy creator" detail="Thử một từ khóa khác hoặc nhập creator đầu tiên vào CRM." />}
    </section>
  </>;
}

export function Deals({ data, accessKey, filters }: ViewProps) {
  const campaignName = new Map(data.campaigns.map((campaign) => [campaign.id, campaign.name]));
  const creatorMap = new Map(data.creators.map((creator) => [creator.id, creator]));
  return <>
    <AnalyticsHeader view="deals" accessKey={accessKey} filters={filters} />
    <div className="kpi-grid">
      <Kpi label="Active Campaigns" hint="Campaign ở trạng thái active hoặc planned" value={fmtNumber(data.campaigns.filter((campaign) => ["active", "planned"].includes(campaign.status)).length)} caption={`${data.campaigns.length} campaign trong hệ thống`} />
      <Kpi label="Deal Pool" hint="Tổng deal đang theo dõi" value={fmtNumber(data.deals.length)} caption="Affiliate · livestream · video" />
      <Kpi label="Confirmed" hint="Deal confirmed hoặc in progress" value={fmtNumber(data.deals.filter((deal) => ["confirmed", "in_progress"].includes(deal.status)).length)} caption="Đang execution" />
      <Kpi label="Upcoming Bookings" hint="Booking chưa bị hủy" value={fmtNumber(data.bookings.filter((booking) => booking.status !== "cancelled").length)} caption="Timeline cần điều phối" />
    </div>
    <div className="card-grid wide-first">
      <section className="card">
        <CardHeader title="Campaign & Deal Tracker" count={data.deals.length} detail="Pool deal để matching Brand ↔ Creator" />
        {data.deals.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Creator</th><th>Deal / Campaign</th><th>Type</th><th>Commission</th><th>Fee</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {data.deals.slice(0, 20).map((deal) => (
                  <tr key={deal.id}>
                    <td><Person creator={creatorMap.get(deal.creator_id)} /></td>
                    <td>{deal.campaign_id ? campaignName.get(deal.campaign_id) || "Campaign" : "Unassigned deal"}<small>{deal.exclusive_deal ? "Exclusive deal" : "Open deal"}</small></td>
                    <td>{deal.deal_type}</td>
                    <td>{fmtPercent(deal.commission_rate)}</td>
                    <td className="money">{fmtCurrency(deal.agreed_fee)}</td>
                    <td>{fmtDate(deal.due_at)}</td>
                    <td><StatusTag value={deal.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Chưa có deal" detail="Thêm campaign/deal đầu tiên để bắt đầu matching và tracking." />}
      </section>
      <section className="card">
        <CardHeader title="Campaign đang chạy" count={data.campaigns.length} />
        {data.campaigns.length ? (
          <div className="row-list">
            {data.campaigns.slice(0, 8).map((campaign) => (
              <div className="row" key={campaign.id}>
                <div className="row-main">
                  <strong>{campaign.name}</strong>
                  <span>{campaign.campaign_type} · {campaign.owner_name || "Chưa giao"}</span>
                  <span>Target {fmtCurrency(campaign.target_gmv)} · {fmtDate(campaign.starts_at)} – {fmtDate(campaign.ends_at)}</span>
                </div>
                <StatusTag value={campaign.status} />
              </div>
            ))}
          </div>
        ) : <EmptyState title="Chưa có campaign" detail="Campaign sẽ là nguồn phân bổ deal và nguồn lực." />}
      </section>
    </div>
  </>;
}

export function Reports({ data, accessKey, filters, params }: ViewProps) {
  const profiles = latestProfiles(data.profiles);
  const snapshots = [...profiles.values()];
  const selectedEndpoint = params.endpoint || "all";
  const endpoints = [...new Set(data.metricDaily.map((row) => row.endpoint_key))].sort();
  const observedMetricPaths = [...new Set(data.metricDaily.map((row) => row.metric_key))].sort();
  const definitionByKey = new Map(data.metricDefinitions.map((definition) => [definition.metric_key, definition]));
  const metricOptions = observedMetricPaths.map((path) => {
    const leaf = path;
    const definition = definitionByKey.get(path) || definitionByKey.get(leaf);
    return { path, leaf, domain: definition?.domain || metricDomain(path), label: definition?.display_name || metricLabel(path) };
  });
  const requestedMetrics = (params.metric || "").split(",").map((value) => value.trim()).filter(Boolean);
  const hasExplicitMetricSelection = params.metricConfigured === "1";
  const selectedPaths = hasExplicitMetricSelection
    ? requestedMetrics.filter((path) => observedMetricPaths.includes(path))
    : metricOptions.map((option) => option.path);
  const selectedSet = new Set(selectedPaths);
  const metricGroups = [...new Set(metricOptions.map((option) => option.domain))].sort();
  const filteredRows = data.metricDaily.filter((row) =>
    (selectedEndpoint === "all" || row.endpoint_key === selectedEndpoint) &&
    (!selectedPaths.length || selectedSet.has(row.metric_path)),
  );
  const rows = filteredRows;
  const dynamicCards = [...new Map(filteredRows.map((row) => [row.metric_path, row])).values()]
    .sort((a, b) => Math.abs(Number(b.total_value ?? 0)) - Math.abs(Number(a.total_value ?? 0)))
    .slice(0, 8);
  const metricLink = (extra: Record<string, string | undefined>) => `?${queryFor(accessKey, "reports", filters, {
    endpoint: selectedEndpoint === "all" ? undefined : selectedEndpoint,
    metric: hasExplicitMetricSelection ? selectedPaths.join(",") : selectedPaths.length ? selectedPaths.join(",") : undefined,
    metricConfigured: hasExplicitMetricSelection ? "1" : undefined,
    ...extra,
  })}`;
  return <>
    <AnalyticsHeader view="reports" accessKey={accessKey} filters={filters} />
    <div className="kpi-grid">
      <Kpi label="GMV" hint="Tổng GMV từ snapshot mới nhất của từng creator" value={fmtCurrency(sum(snapshots, "gmv"))} caption={rangeLabel(filters)} />
      <Kpi label="Orders" hint="Tổng đơn hàng trong snapshot" value={fmtNumber(sum(snapshots, "orders"))} caption={rangeLabel(filters)} />
      <Kpi label="Product Clicks" hint="Lượt click vào sản phẩm" value={fmtCompact(sum(snapshots, "product_clicks"))} caption="Traffic to product" />
      <Kpi label="Business metrics" hint="Metric nghiệp vụ sau khi xử lý JSON TikTok" value={fmtNumber(observedMetricPaths.length)} caption={`${fmtNumber(data.metricDaily.length)} dòng tổng hợp`} />
      {dynamicCards.slice(0, 4).map((row) => <Kpi key={row.metric_key} label={metricLabel(row.metric_key)} hint={`Metric chuẩn hóa từ ${row.endpoint_key}`} value={fmtNumber(row.total_value, 2)} caption={`${fmtNumber(row.observations)} observations`} />)}
    </div>
    <section className="card metric-explorer">
      <CardHeader
        title="All API metrics"
        count={observedMetricPaths.length}
        detail="JSON raw vẫn được lưu để audit; bảng này chỉ hiển thị metric nghiệp vụ đã chuẩn hóa"
        action={<span className="chip">{fmtNumber(selectedPaths.length)} metric đang chọn</span>}
      />
      <div className="metric-tabs" role="tablist" aria-label="Metric endpoints">
        <a aria-current={selectedEndpoint === "all" ? "page" : undefined} href={metricLink({ endpoint: "", metric: "" })}>Tất cả</a>
        {endpoints.map((endpoint) => <a aria-current={selectedEndpoint === endpoint ? "page" : undefined} href={metricLink({ endpoint, metric: "" })} key={endpoint}>{endpointLabels[endpoint] || endpoint}</a>)}
      </div>
      <form className="metric-picker" method="get">
        <Hidden values={{ key: accessKey, view: "reports", ...filters, endpoint: selectedEndpoint === "all" ? undefined : selectedEndpoint, metricConfigured: "1" }} />
        <div className="metric-available">
          <div className="metric-picker-header"><strong>Select metrics</strong><a href={metricLink({ metric: metricOptions.map((option) => option.path).join(","), metricConfigured: "1" })}>↻ Chọn tất cả</a></div>
          {metricGroups.length ? metricGroups.map((group) => (
            <fieldset key={group}>
              <legend>{group.replaceAll("_", " ")}</legend>
              <div className="metric-checkbox-grid">
                {metricOptions.filter((option) => option.domain === group).map((option) => (
                  <label className="metric-checkbox" key={option.path}>
                    <input type="checkbox" name="metric" value={option.path} defaultChecked={selectedSet.has(option.path)} />
                    <span>{option.label}</span>
                    <small title={option.path}>ⓘ</small>
                  </label>
                ))}
              </div>
            </fieldset>
          )) : <EmptyState title="Chưa có metric để chọn" detail="Chạy sync TikTok thành công để nạp danh sách metric." />}
        </div>
        <aside className="metric-selected">
          <div className="metric-picker-header"><strong>{fmtNumber(selectedPaths.length)} metrics selected</strong><span>Tab hiện tại</span></div>
          {selectedPaths.length ? selectedPaths.map((path) => {
            const option = metricOptions.find((item) => item.path === path);
            const remaining = selectedPaths.filter((item) => item !== path).join(",");
            return <div className="selected-metric" key={path}><span className="drag-handle">⋮⋮</span><span title={path}>{option?.label || path}</span><a aria-label={`Bỏ ${option?.label || path}`} href={metricLink({ metric: remaining, metricConfigured: "1" })}>×</a></div>;
          }) : <p className="muted">Chưa chọn metric. Bật checkbox bên trái.</p>}
        </aside>
        <button className="btn primary metric-apply" type="submit">Apply metrics</button>
      </form>
      {rows.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Creator ID</th><th>Ngày</th><th>Endpoint</th><th>Metric path</th><th>Observations</th><th>Total</th><th>Average</th></tr></thead>
            <tbody>{rows.map((row, index) => <tr key={`${row.creator_id}-${row.metric_key}-${row.metric_date}-${index}`}>
              <td className="mono">{row.creator_id ? row.creator_id.slice(0, 8) : "—"}</td>
              <td>{fmtDate(row.metric_date)}</td>
              <td>{endpointLabels[row.endpoint_key] || row.endpoint_key}</td>
              <td><strong>{metricLabel(row.metric_key)}</strong><small className="mono">{row.metric_key}</small></td>
              <td>{fmtNumber(row.observations)}</td>
              <td>{fmtNumber(row.total_value, 2)}</td>
              <td>{fmtNumber(row.average_value, 2)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      ) : <EmptyState title="Chưa có metric phù hợp" detail="Chạy sync TikTok thành công để nạp raw metric vào warehouse." />}
    </section>
    <div className="card-grid wide-first">
      <section className="card">
        <CardHeader title="Performance theo Creator" count={data.creators.length} detail="Contribution và growth theo framework MCN" />
        {data.creators.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Creator</th><th>GMV / NMV</th><th>Orders</th><th>Live</th><th>Video</th><th>CTR / CTOR</th><th>Category</th></tr></thead>
              <tbody>
                {data.creators.map((creator) => {
                  const profile = profiles.get(creator.id);
                  const category = profile?.top_category || creator.top_category;
                  return (
                    <tr key={creator.id}>
                      <td><strong>{creatorName(creator)}</strong><small>{creator.pic_name || "Chưa giao PIC"}</small></td>
                      <td className="money">{fmtCurrency(profile?.gmv)}<small>{fmtCurrency(profile?.nmv)} NMV</small></td>
                      <td>{fmtNumber(profile?.orders)}</td>
                      <td>{fmtNumber(profile?.live_hours, 1)}h<small>{fmtCurrency(profile?.live_gmv)}</small></td>
                      <td>{fmtNumber(profile?.video_count)}<small>{fmtCurrency(profile?.video_gmv)}</small></td>
                      <td>{fmtPercent(profile?.ctr)}<small>{fmtPercent(profile?.ctor)} CTOR</small></td>
                      <td>{category ? <span className="chip">{category}</span> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Chưa có report" detail="Cần creator snapshot để tạo report theo Creator." />}
      </section>
      <section className="card">
        <CardHeader title="Metric Coverage" detail="Raw path vẫn được giữ để audit" />
        {rows.length ? (
          <div className="row-list">
            {rows.slice(0, 12).map((row, index) => (
              <div className="row" key={`${row.creator_id}-${row.metric_path}-${index}`}>
                <div className="row-main"><strong className="mono">{row.metric_key}</strong><span>{endpointLabels[row.endpoint_key] || row.endpoint_key}</span></div>
                <b>{fmtNumber(row.total_value, 2)}</b>
              </div>
            ))}
          </div>
        ) : <EmptyState title="Chưa có metric" detail="Chạy sync để nạp dữ liệu KPI." />}
      </section>
    </div>
  </>;
}

export function Operations({ data, accessKey, filters }: ViewProps) {
  const creators = new Map(data.creators.map((creator) => [creator.id, creator]));
  const openTasks = data.tasks.filter((task) => !["done", "cancelled"].includes(task.status));
  const openIssues = data.issues.filter((issue) => !["resolved", "closed"].includes(issue.status));
  return <>
    <AnalyticsHeader view="operations" accessKey={accessKey} filters={filters} />
    <div className="kpi-grid">
      <Kpi label="Open Tasks" hint="Task chưa done hoặc cancelled" value={fmtNumber(openTasks.length)} caption="Execution queue" />
      <Kpi label="High Priority" hint="Task có priority urgent hoặc high" value={fmtNumber(openTasks.filter((task) => ["urgent", "high"].includes(task.priority)).length)} caption="Cần ưu tiên xử lý" />
      <Kpi label="Open Issues" hint="Issue chưa resolved hoặc closed" value={fmtNumber(openIssues.length)} caption="Creator · Brand · API" />
      <Kpi label="Owners" hint="Số nhân sự đang có task" value={fmtNumber(new Set(data.tasks.map((task) => task.owner_name).filter(Boolean)).size)} caption="Nhân sự có task" />
    </div>
    <div className="card-grid wide-first">
      <section className="card">
        <CardHeader title="Execution Queue" count={openTasks.length} detail="Booking, content review, fulfillment và payment" />
        {openTasks.length ? (
          <div className="row-list">
            {openTasks.map((task) => (
              <div className="row" key={task.id}>
                <div className="row-main">
                  <strong>{task.title}</strong>
                  <span>{task.task_type} · {task.owner_name || "Chưa giao"} · {task.creator_id ? creatorName(creators.get(task.creator_id)) : "Không gắn creator"}</span>
                </div>
                <div className="row-meta">
                  <StatusTag value={task.status} />
                  <small>{task.priority} · {task.due_at ? `Due ${fmtDate(task.due_at)}` : "No due date"}</small>
                </div>
              </div>
            ))}
          </div>
        ) : <EmptyState title="Queue đang trống" detail="Tạo task từ workflow onboarding, booking hoặc nghiệm thu." />}
      </section>
      <section className="card">
        <CardHeader title="Issue & Escalation" count={openIssues.length} detail="Theo dõi sự vụ và SLA" />
        {openIssues.length ? (
          <div className="row-list">
            {openIssues.map((issue) => (
              <div className="row" key={issue.id}>
                <div className="row-main"><strong>{issue.title}</strong><span>{issue.category} · {issue.owner_name || "Chưa giao"}</span></div>
                <StatusTag value={issue.severity} />
              </div>
            ))}
          </div>
        ) : <EmptyState title="Không có issue mở" detail="Chưa có sự vụ cần escalation." />}
      </section>
    </div>
  </>;
}

export function Soon({ module, accessKey, filters }: { module: string; accessKey: string; filters: DashboardFilters }) {
  return (
    <section className="card soon">
      <span className="empty-mark"><Icon name="help" size={22} /></span>
      <h2>{module} chưa có dữ liệu</h2>
      <p>MCN OS chưa đồng bộ nguồn dữ liệu cho module này. Các module đang hoạt động: Dashboard, Creators, Brands, CRM và Automations.</p>
      <a className="btn primary" href={`?${queryFor(accessKey, "overview", filters)}`}>Về Dashboard</a>
    </section>
  );
}
