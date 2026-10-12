import { loadDashboardData, type DashboardData } from "@/lib/mcn/dashboard";
import { Icon, type IconName } from "./icons";
import { SyncButton } from "./sync-button";
import { Brands, Creators, Deals, Discover, Live, Operations, Overview, Products, Reports, Soon, fmtDate, latestProfiles, queryFor, type DashboardFilters, type View, type ViewProps } from "./views";

export const dynamic = "force-dynamic";

type NavLeaf = { label: string; view: View; icon?: IconName; badge?: string; hash?: string };
type NavGroup = { label: string; icon: IconName; children: NavLeaf[] };

const navEntries: (NavLeaf | NavGroup)[] = [
  { label: "Dashboard", icon: "dashboard", view: "overview" },
  // Shortcut into the creator table's search box; "Social Intelligence / Creators" owns the active state.
  { label: "AI Creator Search", icon: "search", view: "discover", hash: "creator-search" },
  {
    label: "Social Intelligence",
    icon: "intel",
    children: [
      { label: "Metrics & Reports", view: "reports" },
      { label: "Brands", view: "brands" },
      { label: "Products", view: "products" },
      { label: "Creators", view: "discover" },
      { label: "Trending Videos", view: "soon" },
      { label: "LIVE", view: "live" },
    ],
  },
  { label: "Automations", icon: "send", children: [{ label: "Tasks & SLA", view: "operations" }] },
  { label: "CRM", icon: "users", children: [{ label: "Creator CRM", view: "creators" }, { label: "Campaigns & Deals", view: "deals" }] },
  { label: "Content", icon: "content", view: "soon" },
  { label: "Creator Community", icon: "community", view: "soon" },
  { label: "GMV Max", icon: "dollar", view: "soon" },
  { label: "Meta", icon: "meta", view: "soon", badge: "NEW" },
  { label: "P&L Calculator", icon: "calculator", view: "soon" },
  { label: "Creator Messages", icon: "message", view: "soon" },
  { label: "TikTok Partner API", icon: "code", view: "soon" },
];

const leaves = navEntries.flatMap((entry) => "children" in entry ? entry.children.map((leaf) => ({ leaf, group: entry.label as string | undefined })) : entry.hash ? [] : [{ leaf: entry, group: undefined }]);
const views = new Set<string>(leaves.map(({ leaf }) => leaf.view));

const levelRanges: Record<string, [number, number]> = { mega: [1_000_000, Infinity], mid: [100_000, 1_000_000], mass: [0, 100_000] };

function applyFilters(data: DashboardData, filters: DashboardFilters): DashboardData {
  const { from, to } = filters;
  const profiles = from || to ? data.profiles.filter((profile) => (!from || profile.snapshot_date >= from) && (!to || profile.snapshot_date <= to)) : data.profiles;
  const metricDaily = from || to ? data.metricDaily.filter((row) => (!from || (row.metric_date ?? "") >= from) && (!to || (row.metric_date ?? "") <= to)) : data.metricDaily;
  const range = levelRanges[filters.creatorLevel ?? ""];
  if (!range) return { ...data, profiles, metricDaily };
  const latest = latestProfiles(profiles);
  const creators = data.creators.filter((creator) => {
    const followers = Number(latest.get(creator.id)?.followers ?? 0);
    return followers >= range[0] && followers < range[1];
  });
  const ids = new Set(creators.map((creator) => creator.id));
  return { ...data, creators, profiles: profiles.filter((profile) => ids.has(profile.creator_id)), metricDaily };
}

function LockedPage() {
  return (
    <main className="locked-page">
      <div className="locked-card">
        <h1>Mở workspace vận hành</h1>
        <p>Dashboard quản lý Creator, performance, deal và operations được bảo vệ bằng access key.</p>
        <form method="get">
          <label htmlFor="dashboard-key">Dashboard key</label>
          <input id="dashboard-key" name="key" type="password" autoComplete="off" placeholder="Nhập Dashboard key" required />
          <button className="btn primary" type="submit">Mở workspace</button>
        </form>
        <small>Key chỉ được dùng trong request hiện tại, không lưu vào database.</small>
      </div>
    </main>
  );
}

function SetupCard({ data, href }: { data: DashboardData; href: string }) {
  const steps = [
    { done: data.connections.length > 0, title: "Kết nối TikTok Partner" },
    { done: data.syncRuns.length > 0, title: "Chạy sync đầu tiên" },
    { done: data.creators.length > 0, title: "Thêm creator vào CRM" },
  ];
  const current = steps.findIndex((step) => !step.done);
  if (current === -1) return null;
  return (
    <div className="setup-card">
      <strong>Finish Workspace Setup</strong>
      <ol className="setup-steps" aria-label={`Bước ${current + 1} trên ${steps.length}`}>
        {steps.map((step, index) => <li className={index <= current ? "reached" : ""} key={step.title}>{index + 1}</li>)}
      </ol>
      <a className="btn primary" href={href}>{steps[current].title}</a>
    </div>
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const rawParams = await searchParams;
  // Checkbox forms submit repeated `metric` values. Normalize them once so
  // the rest of the server-rendered dashboard can keep using simple strings.
  const params = Object.fromEntries(
    Object.entries(rawParams).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value]),
  ) as Record<string, string | undefined>;
  const expected = process.env.DASHBOARD_KEY || process.env.CRON_SECRET;
  if (!expected || params.key !== expected) return <LockedPage />;

  const view: View = views.has(params.view ?? "") ? (params.view as View) : "overview";
  const accessKey = params.key ?? "";
  const filters: DashboardFilters = { from: params.from, to: params.to, creatorLevel: params.creatorLevel };
  const rawData = await loadDashboardData();
  const data = applyFilters(rawData, filters);

  const active = (view === "soon" && leaves.find(({ leaf }) => leaf.view === "soon" && leaf.label === params.m)) || leaves.find(({ leaf }) => leaf.view === view) || leaves[0];
  const hrefOf = (leaf: NavLeaf) => `?${queryFor(accessKey, leaf.view, filters, leaf.view === "soon" ? { m: leaf.label } : {})}${leaf.hash ? `#${leaf.hash}` : ""}`;
  const navLink = (leaf: NavLeaf) => (
    <a className="nav-link" aria-current={leaf === active.leaf ? "page" : undefined} href={hrefOf(leaf)} key={leaf.label}>
      {leaf.icon && <Icon name={leaf.icon} />}
      <span>{leaf.label}</span>
      {leaf.badge && <small className="nav-badge">{leaf.badge}</small>}
    </a>
  );

  const lastSync = rawData.syncRuns[0];
  const openTasks = rawData.tasks.filter((task) => !["done", "cancelled"].includes(task.status));
  const urgentTasks = openTasks.filter((task) => ["urgent", "high"].includes(task.priority)).length;
  const openIssues = rawData.issues.filter((issue) => !["resolved", "closed"].includes(issue.status)).length;
  const actions = [
    rawData.connections.length === 0 && { label: "Action needed: kết nối TikTok Partner", view: "overview" as View, hash: "#data-foundation" },
    urgentTasks > 0 && { label: `Action needed: ${urgentTasks} task ưu tiên cao`, view: "operations" as View, hash: "" },
    openIssues > 0 && { label: `Action needed: ${openIssues} issue đang mở`, view: "operations" as View, hash: "" },
  ].filter((action) => !!action);

  const props: ViewProps = { data, accessKey, filters, params };

  return (
    <div className="app-shell">
      <input className="nav-toggle sr-only" id="nav-toggle" type="checkbox" aria-label="Ẩn hoặc hiện thanh điều hướng" />
      <aside className="sidebar">
        <div className="workspace">
          <span className="workspace-logo"><Icon name="store" /></span>
          <div>
            <strong>UpBase MCN</strong>
            <span className={lastSync ? "workspace-status ok" : "workspace-status"}>{lastSync ? `Synced ${fmtDate(lastSync.started_at)}` : "Chưa có sync"}</span>
          </div>
        </div>
        <div className="mode-switch" aria-label="Workspace mode">
          <a aria-current={view !== "operations" ? "page" : undefined} href={`?${queryFor(accessKey, "overview", filters)}`}><Icon name="grid" size={16} /> Browse</a>
          <a aria-current={view === "operations" ? "page" : undefined} href={`?${queryFor(accessKey, "operations", filters)}`}><Icon name="sparkles" size={16} /> Agent</a>
        </div>
        <nav className="nav" aria-label="MCN modules">
          {navEntries.map((entry) => "children" in entry ? (
            <details className="nav-group" open={entry.label === "Social Intelligence" || entry.children.includes(active.leaf)} key={entry.label}>
              <summary className="nav-link"><Icon name={entry.icon} /><span>{entry.label}</span><Icon name="chevron" size={16} /></summary>
              {entry.children.map(navLink)}
            </details>
          ) : navLink(entry))}
        </nav>
        <SetupCard data={rawData} href={`?${queryFor(accessKey, "overview", filters)}#data-foundation`} />
      </aside>

      <div className="main-area">
        <header className="topbar">
          <label className="icon-button sidebar-toggle" htmlFor="nav-toggle"><Icon name="panel" /><span className="sr-only">Ẩn hoặc hiện thanh điều hướng</span></label>
          <div className="breadcrumb">
            <span className="breadcrumb-shop"><Icon name="store" size={15} /> MCN OS</span>
            {active.group && <><b>/</b><span>{active.group}</span></>}
            <b>/</b><strong>{active.leaf.label}</strong>
          </div>
          <form className="global-search" method="get" role="search">
            <input type="hidden" name="key" value={accessKey} />
            <input type="hidden" name="view" value="discover" />
            <Icon name="search" size={16} />
            <input name="q" type="search" aria-label="Tìm creator trong workspace" placeholder="Search" />
          </form>
            <SyncButton accessKey={accessKey} from={filters.from} to={filters.to} />
          <a className="topbar-link" href="/">Khóa</a>
          <span className="user-avatar" aria-hidden="true">MCN</span>
        </header>

        <main className="page-content">
          {rawData.warnings.length > 0 && (
            <div className="alert" role="alert">
              <span className="alert-icon"><Icon name="alert" size={22} /></span>
              <div>
                <strong>Một số bảng MCN chưa đọc được</strong>
                <p>Hệ thống vẫn hiển thị phần dữ liệu khả dụng.</p>
                <details>
                  <summary>Chi tiết</summary>
                  <ul>{rawData.warnings.slice(0, 5).map((warning) => <li key={warning}>{warning}</li>)}</ul>
                </details>
              </div>
            </div>
          )}
          {view === "overview" && actions.length > 0 && (
            <div className="action-chips">
              {actions.map((action) => <a className="action-chip" href={`?${queryFor(accessKey, action.view, filters)}${action.hash}`} key={action.label}>{action.label}</a>)}
            </div>
          )}
          <h1 className="page-heading">{view === "overview" ? "Analytics Overview" : active.leaf.label}</h1>
          {view === "overview" && <Overview {...props} />}
          {view === "discover" && <Discover {...props} />}
          {view === "brands" && <Brands {...props} />}
          {view === "creators" && <Creators {...props} />}
          {view === "deals" && <Deals {...props} />}
          {view === "reports" && <Reports {...props} />}
          {view === "products" && <Products {...props} />}
          {view === "live" && <Live {...props} />}
          {view === "operations" && <Operations {...props} />}
          {view === "soon" && <Soon module={active.leaf.label} accessKey={accessKey} filters={filters} />}
        </main>
      </div>
    </div>
  );
}
