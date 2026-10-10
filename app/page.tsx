import { loadDashboardData, type Creator, type CreatorProfile, type DashboardData } from "@/lib/mcn/dashboard";

export const dynamic = "force-dynamic";

type View = "overview" | "creators" | "deals" | "reports" | "operations";

const navItems: { id: View; label: string; detail: string; icon: string }[] = [
  { id: "overview", label: "Command center", detail: "Tổng quan", icon: "⌂" },
  { id: "creators", label: "Creator CRM", detail: "Mạng lưới KOC", icon: "◎" },
  { id: "deals", label: "Commercial", detail: "Campaign & deal", icon: "◇" },
  { id: "reports", label: "MCN Reports", detail: "Performance", icon: "▥" },
  { id: "operations", label: "Operations", detail: "Task & SLA", icon: "✓" },
];

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
};

function viewOf(value: string | undefined): View {
  return navItems.some((item) => item.id === value) ? (value as View) : "overview";
}

function fmtNumber(value: number | null | undefined, maximumFractionDigits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits }).format(Number(value));
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

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function creatorName(creator: Creator | undefined, fallback = "Creator chưa định danh") {
  return creator?.display_name || creator?.username || creator?.open_id || fallback;
}

function latestProfiles(profiles: CreatorProfile[]) {
  const result = new Map<string, CreatorProfile>();
  for (const profile of profiles) if (!result.has(profile.creator_id)) result.set(profile.creator_id, profile);
  return result;
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

function StatCard({ label, value, detail, tone = "default" }: { label: string; value: string; detail: string; tone?: string }) {
  return <article className={`stat-card ${tone}`}><span className="stat-label">{label}</span><strong>{value}</strong><span className="stat-detail">{detail}</span></article>;
}

function SectionHeader({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: React.ReactNode }) {
  return <div className="section-header"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><div className="empty-mark">○</div><h3>{title}</h3><p>{detail}</p></div>;
}

function Overview({ data }: { data: DashboardData }) {
  const profiles = latestProfiles(data.profiles);
  const activeCreators = data.creators.filter((creator) => creator.mcn_status === "active");
  const totalGmv = [...profiles.values()].reduce((sum, profile) => sum + Number(profile.gmv ?? 0), 0);
  const totalLiveHours = [...profiles.values()].reduce((sum, profile) => sum + Number(profile.live_hours ?? 0), 0);
  const openTasks = data.tasks.filter((task) => !["done", "cancelled"].includes(task.status));
  const openIssues = data.issues.filter((issue) => !["resolved", "closed"].includes(issue.status));
  const watchlist = activeCreators
    .map((creator) => ({ creator, profile: profiles.get(creator.id) }))
    .sort((a, b) => Number(b.profile?.gmv ?? 0) - Number(a.profile?.gmv ?? 0))
    .slice(0, 5);
  const pulse = [...profiles.values()].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)).slice(-7);
  const maxGmv = Math.max(...pulse.map((profile) => Number(profile.gmv ?? 0)), 1);

  return <>
    <div className="stats-grid">
      <StatCard label="Active creators" value={fmtNumber(activeCreators.length)} detail={`${data.creators.length} hồ sơ trong CRM`} tone="accent" />
      <StatCard label="Latest GMV" value={fmtCurrency(totalGmv)} detail="Tổng snapshot gần nhất" />
      <StatCard label="Live capacity" value={`${fmtNumber(totalLiveHours, 1)}h`} detail="Tổng live hours đã ghi nhận" />
      <StatCard label="Work queue" value={fmtNumber(openTasks.length + openIssues.length)} detail={`${openTasks.length} task · ${openIssues.length} issue`} tone={openIssues.length ? "alert" : "default"} />
    </div>

    <div className="content-grid overview-grid">
      <section className="surface chart-panel">
        <SectionHeader eyebrow="PERFORMANCE PULSE" title="Tín hiệu hiệu suất" detail="GMV snapshot theo creator và ngày gần nhất" action={<span className="live-chip"><i />Live data</span>} />
        {pulse.length ? <div className="bar-chart" aria-label="GMV snapshots">
          {pulse.map((profile) => <div className="bar-column" key={`${profile.creator_id}-${profile.snapshot_date}`}><span className="bar-value">{fmtCurrency(profile.gmv)}</span><div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max((Number(profile.gmv ?? 0) / maxGmv) * 100, 5)}%` }} /></div><span>{fmtDate(profile.snapshot_date)}</span></div>)}
        </div> : <EmptyState title="Chưa có performance snapshot" detail="Chạy sync TikTok để tạo dữ liệu báo cáo đầu tiên." />}
      </section>

      <section className="surface watchlist-panel">
        <SectionHeader eyebrow="CREATOR WATCHLIST" title="Creator nổi bật" detail="Ưu tiên theo GMV snapshot" action={<a className="text-link" href="?view=creators">Mở CRM →</a>} />
        {watchlist.length ? <div className="creator-list">{watchlist.map(({ creator, profile }, index) => <div className="creator-row" key={creator.id}><span className="rank">0{index + 1}</span><div className="avatar">{(creatorName(creator)[0] ?? "C").toUpperCase()}</div><div className="creator-main"><strong>{creatorName(creator)}</strong><span>{profile?.top_category || creator.top_category || "Chưa phân loại"}</span></div><div className="creator-value"><strong>{fmtCurrency(profile?.gmv)}</strong><span>{fmtNumber(profile?.followers)} followers</span></div></div>)}</div> : <EmptyState title="Chưa có creator" detail="Creator sẽ xuất hiện sau khi authorize hoặc nhập vào CRM." />}
      </section>
    </div>

    <div className="content-grid overview-grid lower-grid">
      <section className="surface"><SectionHeader eyebrow="OPERATION QUEUE" title="Việc cần xử lý" detail="Các task và issue đang mở" action={<a className="text-link" href="?view=operations">Xem operations →</a>} />{openTasks.length || openIssues.length ? <div className="queue-list">{[...openTasks.slice(0, 3).map((task) => ({ key: task.id, title: task.title, meta: `${task.task_type} · ${task.owner_name || "Chưa giao"}`, status: task.priority })), ...openIssues.slice(0, 2).map((issue) => ({ key: issue.id, title: issue.title, meta: `${issue.category} · ${issue.owner_name || "Chưa giao"}`, status: issue.severity }))].map((item) => <div className="queue-row" key={item.key}><span className="queue-dot" /><div><strong>{item.title}</strong><span>{item.meta}</span></div><StatusTag value={item.status} /></div>)}</div> : <EmptyState title="Không có việc tồn" detail="Tất cả task và issue đang ở trạng thái ổn." />}</section>
      <section className="surface"><SectionHeader eyebrow="DATA FOUNDATION" title="Độ phủ dữ liệu" detail="Tình trạng kết nối và đồng bộ TikTok" /><div className="coverage-list"><div><span>Tài khoản kết nối</span><strong>{fmtNumber(data.connections.length)}</strong></div><div><span>Sync gần nhất</span><strong>{data.syncRuns[0] ? fmtDate(data.syncRuns[0].started_at) : "—"}</strong></div><div><span>Metric warehouse</span><strong>{fmtNumber(data.metricDaily.length)}</strong></div><div><span>Warning</span><strong className={data.warnings.length ? "text-danger" : "text-success"}>{data.warnings.length || "OK"}</strong></div></div></section>
    </div>
  </>;
}

function Creators({ data, query }: { data: DashboardData; query?: string }) {
  const profiles = latestProfiles(data.profiles);
  const q = (query ?? "").trim().toLowerCase();
  const creators = data.creators.filter((creator) => !q || `${creatorName(creator)} ${creator.username ?? ""} ${creator.industry ?? ""} ${creator.location ?? ""}`.toLowerCase().includes(q));
  const pending = data.creators.filter((creator) => creator.onboarding_status !== "completed").length;

  return <>
    <div className="stats-grid compact-stats"><StatCard label="Creator database" value={fmtNumber(data.creators.length)} detail="Single source of truth" tone="accent" /><StatCard label="Active" value={fmtNumber(data.creators.filter((c) => c.mcn_status === "active").length)} detail="Đang trong mạng lưới" /><StatCard label="Onboarding" value={fmtNumber(pending)} detail="Cần hoàn thiện hồ sơ" /><StatCard label="With performance" value={fmtNumber([...profiles.keys()].length)} detail="Có snapshot KPI" /></div>
    <section className="surface">
      <SectionHeader eyebrow="CREATOR DIRECTORY" title="Creator / KOC CRM" detail="Thông tin identity, ownership và KPI mới nhất" action={<form className="inline-search" method="get"><input type="hidden" name="view" value="creators" /><input name="key" type="hidden" value={process.env.DASHBOARD_KEY || process.env.CRON_SECRET || ""} /><label className="sr-only" htmlFor="creator-search">Tìm creator</label><input id="creator-search" name="q" defaultValue={query} placeholder="Tìm tên, username, ngành hàng..." /><button type="submit">Tìm</button></form>} />
      {creators.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Creator</th><th>MCN status</th><th>Industry / location</th><th>Followers</th><th>GMV</th><th>Live hours</th><th>Owner / PIC</th></tr></thead><tbody>{creators.map((creator) => { const profile = profiles.get(creator.id); return <tr key={creator.id}><td><div className="table-person"><span className="avatar small">{(creatorName(creator)[0] ?? "C").toUpperCase()}</span><div><strong>{creatorName(creator)}</strong><span>@{creator.username || creator.open_id.slice(0, 14)}</span></div></div></td><td><StatusTag value={creator.mcn_status} /><small>{creator.onboarding_status.replaceAll("_", " ")}</small></td><td>{creator.industry || "Chưa cập nhật"}<small>{creator.location || "—"}</small></td><td>{fmtNumber(profile?.followers)}<small>Avg {fmtNumber(profile?.avg_views)}</small></td><td className="strong-number">{fmtCurrency(profile?.gmv)}<small>{fmtCurrency(profile?.nmv)} NMV</small></td><td>{fmtNumber(profile?.live_hours, 1)}h<small>{fmtNumber(profile?.live_views)} views</small></td><td>{creator.pic_name || "Chưa giao"}<small>{creator.platform || "tiktok"}</small></td></tr>; })}</tbody></table></div> : <EmptyState title="Chưa tìm thấy creator" detail="Thử một từ khóa khác hoặc nhập creator đầu tiên vào CRM." />}
    </section>
  </>;
}

function Deals({ data }: { data: DashboardData }) {
  const campaignName = new Map(data.campaigns.map((campaign) => [campaign.id, campaign.name]));
  const creatorMap = new Map(data.creators.map((creator) => [creator.id, creator]));
  return <>
    <div className="stats-grid compact-stats"><StatCard label="Active campaigns" value={fmtNumber(data.campaigns.filter((c) => ["active", "planned"].includes(c.status)).length)} detail={`${data.campaigns.length} campaign trong hệ thống`} tone="accent" /><StatCard label="Deal pool" value={fmtNumber(data.deals.length)} detail="Affiliate · livestream · video" /><StatCard label="Confirmed" value={fmtNumber(data.deals.filter((d) => ["confirmed", "in_progress"].includes(d.status)).length)} detail="Đang execution" /><StatCard label="Upcoming bookings" value={fmtNumber(data.bookings.filter((b) => b.status !== "cancelled").length)} detail="Timeline cần điều phối" /></div>
    <div className="content-grid two-one"><section className="surface"><SectionHeader eyebrow="CAMPAIGN PIPELINE" title="Campaign & deal tracker" detail="Pool deal để matching Brand ↔ Creator" /><div className="table-scroll"><table className="data-table"><thead><tr><th>Creator</th><th>Deal / campaign</th><th>Type</th><th>Commission</th><th>Fee</th><th>Due</th><th>Status</th></tr></thead><tbody>{data.deals.slice(0, 20).map((deal) => <tr key={deal.id}><td>{creatorName(creatorMap.get(deal.creator_id))}</td><td>{deal.campaign_id ? campaignName.get(deal.campaign_id) || "Campaign" : "Unassigned deal"}<small>{deal.exclusive_deal ? "Exclusive deal" : "Open deal"}</small></td><td>{deal.deal_type}</td><td>{fmtPercent(deal.commission_rate)}</td><td>{fmtCurrency(deal.agreed_fee)}</td><td>{fmtDate(deal.due_at)}</td><td><StatusTag value={deal.status} /></td></tr>)}</tbody></table></div>{!data.deals.length && <EmptyState title="Chưa có deal" detail="Thêm campaign/deal đầu tiên để bắt đầu matching và tracking." />}</section><section className="surface"><SectionHeader eyebrow="CAMPAIGNS" title="Campaign đang chạy" /><div className="campaign-list">{data.campaigns.slice(0, 8).map((campaign) => <div className="campaign-card" key={campaign.id}><div><strong>{campaign.name}</strong><span>{campaign.campaign_type} · {campaign.owner_name || "Chưa giao"}</span></div><StatusTag value={campaign.status} /><div className="campaign-progress"><span>Target GMV {fmtCurrency(campaign.target_gmv)}</span><span>{fmtDate(campaign.starts_at)} — {fmtDate(campaign.ends_at)}</span></div></div>)}{!data.campaigns.length && <EmptyState title="Chưa có campaign" detail="Campaign sẽ là nguồn phân bổ deal và nguồn lực." />}</div></section></div>
  </>;
}

function Reports({ data }: { data: DashboardData }) {
  const profiles = latestProfiles(data.profiles);
  const rows = data.metricDaily.slice(0, 80);
  return <>
    <div className="stats-grid compact-stats"><StatCard label="GMV" value={fmtCurrency([...profiles.values()].reduce((sum, p) => sum + Number(p.gmv ?? 0), 0))} detail="Latest creator snapshots" tone="accent" /><StatCard label="Orders" value={fmtNumber([...profiles.values()].reduce((sum, p) => sum + Number(p.orders ?? 0), 0))} detail="Tổng orders snapshot" /><StatCard label="Product clicks" value={fmtNumber([...profiles.values()].reduce((sum, p) => sum + Number(p.product_clicks ?? 0), 0))} detail="Traffic to product" /><StatCard label="Reports" value={fmtNumber(rows.length)} detail="Rows trong metric warehouse" /></div>
    <div className="content-grid two-one"><section className="surface"><SectionHeader eyebrow="REPORT MCN" title="Performance theo Creator" detail="Framework chuẩn hóa để theo dõi contribution và growth" /><div className="table-scroll"><table className="data-table"><thead><tr><th>Creator</th><th>GMV / NMV</th><th>Orders</th><th>Live</th><th>Video</th><th>CTR / CTOR</th><th>Category</th></tr></thead><tbody>{data.creators.map((creator) => { const p = profiles.get(creator.id); return <tr key={creator.id}><td><strong>{creator.display_name || creator.username || creator.open_id}</strong><small>{creator.pic_name || "Chưa giao PIC"}</small></td><td className="strong-number">{fmtCurrency(p?.gmv)}<small>{fmtCurrency(p?.nmv)} NMV</small></td><td>{fmtNumber(p?.orders)}</td><td>{fmtNumber(p?.live_hours, 1)}h<small>{fmtCurrency(p?.live_gmv)}</small></td><td>{fmtNumber(p?.video_count)}<small>{fmtCurrency(p?.video_gmv)}</small></td><td>{fmtPercent(p?.ctr)}<small>{fmtPercent(p?.ctor)} CTOR</small></td><td>{p?.top_category || creator.top_category || "—"}</td></tr>; })}</tbody></table></div>{!data.creators.length && <EmptyState title="Chưa có report" detail="Cần creator snapshot để tạo report theo Creator." />}</section><section className="surface"><SectionHeader eyebrow="KEY OUTPUTS" title="Metric coverage" detail="Raw path vẫn được giữ để audit" /><div className="metric-coverage">{rows.slice(0, 12).map((row, index) => <div className="metric-row" key={`${row.creator_id}-${row.metric_path}-${index}`}><div><strong>{row.metric_key}</strong><span>{endpointLabels[row.endpoint_key] || row.endpoint_key}</span></div><b>{fmtNumber(row.total_value, 2)}</b></div>)}{!rows.length && <EmptyState title="Chưa có metric" detail="Chạy sync để nạp dữ liệu KPI." />}</div></section></div>
  </>;
}

function Operations({ data }: { data: DashboardData }) {
  const creators = new Map(data.creators.map((creator) => [creator.id, creator]));
  const openTasks = data.tasks.filter((task) => !["done", "cancelled"].includes(task.status));
  const openIssues = data.issues.filter((issue) => !["resolved", "closed"].includes(issue.status));
  return <>
    <div className="stats-grid compact-stats"><StatCard label="Open tasks" value={fmtNumber(openTasks.length)} detail="Execution queue" tone="accent" /><StatCard label="Overdue / urgent" value={fmtNumber(openTasks.filter((t) => ["urgent", "high"].includes(t.priority)).length)} detail="Cần ưu tiên xử lý" tone={openTasks.some((t) => t.priority === "urgent") ? "alert" : "default"} /><StatCard label="Open issues" value={fmtNumber(openIssues.length)} detail="Creator · Brand · API" /><StatCard label="Owners" value={fmtNumber(new Set(data.tasks.map((task) => task.owner_name).filter(Boolean)).size)} detail="Nhân sự có task" /></div>
    <div className="content-grid two-one"><section className="surface"><SectionHeader eyebrow="TASK & SLA" title="Execution queue" detail="Booking, content review, fulfillment và payment" /><div className="task-list">{openTasks.map((task) => <div className="task-row" key={task.id}><span className={`priority-dot ${task.priority}`} /><div className="task-copy"><strong>{task.title}</strong><span>{task.task_type} · {task.owner_name || "Chưa giao"} · {task.creator_id ? creatorName(creators.get(task.creator_id)) : "Không gắn creator"}</span></div><div className="task-meta"><StatusTag value={task.status} /><small>{task.due_at ? `Due ${fmtDate(task.due_at)}` : "No due date"}</small></div></div>)}{!openTasks.length && <EmptyState title="Queue đang trống" detail="Tạo task từ workflow onboarding, booking hoặc nghiệm thu." />}</div></section><section className="surface"><SectionHeader eyebrow="ISSUE DESK" title="Issue & escalation" detail="Theo dõi sự vụ và SLA" /><div className="issue-list">{openIssues.map((issue) => <div className="issue-row" key={issue.id}><div><strong>{issue.title}</strong><span>{issue.category} · {issue.owner_name || "Chưa giao"}</span></div><StatusTag value={issue.severity} /></div>)}{!openIssues.length && <EmptyState title="Không có issue mở" detail="Chưa có sự vụ cần escalation." />}</div></section></div>
  </>;
}

export default async function Home({ searchParams }: { searchParams: Promise<{ key?: string; view?: string; q?: string }> }) {
  const params = await searchParams;
  const expected = process.env.DASHBOARD_KEY || process.env.CRON_SECRET;
  if (!expected || params.key !== expected) return <main className="locked-page"><div className="locked-card"><span className="eyebrow">MCN NETWORK MANAGEMENT</span><h1>Mở workspace vận hành</h1><p>Dashboard quản lý Creator, performance, deal và operations được bảo vệ bằng access key.</p><form method="get"><label htmlFor="dashboard-key">Dashboard key</label><input id="dashboard-key" name="key" type="password" autoComplete="off" placeholder="Nhập Dashboard key" required /><button type="submit">Mở workspace</button></form><small>Key chỉ được dùng trong request hiện tại, không lưu vào database.</small></div></main>;

  const view = viewOf(params.view);
  const data = await loadDashboardData();
  const current = navItems.find((item) => item.id === view) ?? navItems[0];
  const query = (extra: Record<string, string> = {}) => new URLSearchParams({ key: params.key ?? "", view, ...extra }).toString();

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">M</span><div><strong>MCN OS</strong><span>Network management</span></div></div><div className="workspace-switcher"><span className="workspace-dot" /><div><small>Workspace</small><strong>UpBase MCN</strong></div><span className="chevron">⌄</span></div><nav aria-label="MCN modules"><span className="nav-caption">WORKSPACE</span>{navItems.map((item) => <a className={`nav-item ${item.id === view ? "active" : ""}`} href={`?${query({ view: item.id })}`} key={item.id}><span className="nav-icon">{item.icon}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span>{item.id === "operations" && data.tasks.filter((task) => !["done", "cancelled"].includes(task.status)).length > 0 && <b className="nav-count">{data.tasks.filter((task) => !["done", "cancelled"].includes(task.status)).length}</b>}</a>)}</nav><div className="sidebar-bottom"><div className="sync-status"><span className="pulse-dot" /><div><strong>Data sync online</strong><small>{data.syncRuns[0] ? `Last run ${fmtDate(data.syncRuns[0].started_at)}` : "Chưa có sync run"}</small></div></div><a className="logout-link" href="/">Lock workspace</a></div></aside>
    <section className="main-area"><header className="topbar"><div className="breadcrumb"><span>MCN OS</span><b>/</b><strong>{current.label}</strong></div><div className="topbar-actions"><span className="environment"><i />Production</span><span className="user-avatar">MCN</span></div></header><div className="page-content"><div className="page-title"><div><span className="eyebrow">{current.detail.toUpperCase()}</span><h1>{current.label}</h1><p>{view === "overview" ? "Một command center cho Creator, Commercial, Performance và Operations." : "Tập trung dữ liệu để team MCN ra quyết định nhanh hơn."}</p></div><div className="page-actions"><span className="last-updated">{data.syncRuns[0] ? `Synced ${fmtDate(data.syncRuns[0].started_at)}` : "Chưa có dữ liệu sync"}</span><a className="primary-button" href={`?${query()}`}>Refresh view</a></div></div>{data.warnings.length > 0 && <div className="migration-notice"><strong>Data layer notice</strong><span>Một số bảng MCN chưa đọc được. Hệ thống vẫn hiển thị phần dữ liệu khả dụng.</span><details><summary>Chi tiết</summary><ul>{data.warnings.slice(0, 5).map((warning) => <li key={warning}>{warning}</li>)}</ul></details></div>}{view === "overview" && <Overview data={data} />}{view === "creators" && <Creators data={data} query={params.q} />}{view === "deals" && <Deals data={data} />}{view === "reports" && <Reports data={data} />}{view === "operations" && <Operations data={data} />}</div></section>
  </main>;
}
