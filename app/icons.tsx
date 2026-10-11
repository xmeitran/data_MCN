// 24x24 stroke icons, one path each. Add a name here before using it in the UI.
const paths = {
  dashboard: "M3 21h18M6 21V11M12 21V4M18 21v-7",
  search: "M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM20 20l-4-4",
  intel: "M3 17l6-6 4 4 8-8M15 7h6v6",
  send: "M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z",
  users: "M9 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7zM2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.9c1.6.8 2.6 2.5 3 5.1",
  content: "M10 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3",
  community: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
  dollar: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1 1.8 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2",
  meta: "M3 14c0-4 2-7 4.5-7 4 0 5 10 9 10 2.500 0 4.500-2 4.500-5s-1.500-5-3.500-5c-4 0-6 10-10.500 10C4.500 17 3 16 3 14z",
  calculator: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.500 7.500h7M8.500 12h.01M12 12h.01M15.500 12h.01M8.500 16h.01M12 16h.01M15.500 16h.01",
  message: "M4 5h16v11H9l-5 4z",
  code: "M8 8l-4 4 4 4M16 8l4 4-4 4M13.500 5l-3 14",
  chevron: "M6 9l6 6 6-6",
  panel: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4v16",
  info: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 11v5M12 8h.01",
  alert: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 7.500v5.500M12 16.500h.01",
  calendar: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4",
  download: "M12 4v11M8 11l4 4 4-4M4 20h16",
  arrowDown: "M12 5v14M7 14l5 5 5-5",
  store: "M4 10v10h16V10M3 10l2-6h14l2 6zM9 20v-6h6v6",
  sparkles: "M11 4l1.800 5.200L18 11l-5.200 1.800L11 18l-1.800-5.200L4 11l5.200-1.800zM19 16v4M17 18h4",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  list: "M8 6h13M8 12h13M8 18h13M3.500 6h.01M3.500 12h.01M3.500 18h.01",
  help: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.700.300-1 .800-1 1.700M12 16.500h.01",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
