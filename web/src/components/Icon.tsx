import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "activity"
  | "archive"
  | "arrow-up-right"
  | "bot"
  | "calendar"
  | "check"
  | "chevron-down"
  | "chevron-right"
  | "clock"
  | "comment"
  | "external"
  | "file"
  | "filter"
  | "flag"
  | "grid"
  | "link"
  | "menu"
  | "moon"
  | "more"
  | "plus"
  | "download"
  | "search"
  | "spark"
  | "sun"
  | "trash"
  | "upload"
  | "user"
  | "x";

export function Icon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, ReactNode> = {
    activity: <><path d="M3 12h4l2-7 4 14 2-7h6" /></>,
    archive: <><path d="M4 7h16" /><path d="M6 7v11h12V7" /><path d="m8 4 1-1h6l1 1" /><path d="M9 11h6" /></>,
    "arrow-up-right": <><path d="M7 17 17 7" /><path d="M8 7h9v9" /></>,
    bot: <><rect x="4" y="7" width="16" height="12" rx="3" /><path d="M12 3v4M8 12h.01M16 12h.01M8 16h8" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    "chevron-down": <path d="m6 9 6 6 6-6" />,
    "chevron-right": <path d="m9 6 6 6-6 6" />,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
    comment: <><path d="M20 15a3 3 0 0 1-3 3H9l-5 3v-8a3 3 0 0 1-1-2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3z" /><path d="M7 9h10M7 13h6" /></>,
    external: <><path d="M14 4h6v6" /><path d="m20 4-9 9" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>,
    file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
    flag: <><path d="M5 21V4" /><path d="M5 5c4-3 6 3 14 0v9c-8 3-10-3-14 0" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.4l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.5-.4l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    moon: <><path d="M20.5 15.3A8.7 8.7 0 0 1 8.7 3.5 8.7 8.7 0 1 0 20.5 15.3Z" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 20h16" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" /></>,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 18v2h16v-2" /></>,
    user: <><circle cx="12" cy="8" r="3" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
    x: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };

  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...common} {...props}>{paths[name]}</svg>;
}
