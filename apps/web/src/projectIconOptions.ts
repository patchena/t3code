import { lucideIconNames } from "./lib/lucideIconByName";
export { PROJECT_ICON_COLORS, projectIconColorClassName } from "./projectIconColors";

const POPULAR_PROJECT_ICONS: ReadonlyArray<string> = [
  "folder-code",
  "code-2",
  "terminal",
  "globe-2",
  "server",
  "database",
  "bot",
  "sparkles",
  "smartphone",
  "monitor",
  "cloud-cog",
  "package",
  "book-open",
  "flask-conical",
  "shield-check",
  "rocket",
  "gamepad-2",
  "music",
  "image",
  "shopping-bag",
  "git-branch",
  "workflow",
  "wrench",
  "layers-3",
];

export const PROJECT_EMOJIS = [
  { emoji: "💻", id: "computer" },
  { emoji: "🛠️", id: "tools" },
  { emoji: "🚀", id: "rocket" },
  { emoji: "🤖", id: "robot" },
  { emoji: "✨", id: "sparkles" },
  { emoji: "⚡", id: "lightning" },
  { emoji: "🌐", id: "web" },
  { emoji: "📱", id: "mobile" },
  { emoji: "🖥️", id: "desktop" },
  { emoji: "⌨️", id: "keyboard" },
  { emoji: "⚙️", id: "gear" },
  { emoji: "🗄️", id: "database" },
  { emoji: "☁️", id: "cloud" },
  { emoji: "📦", id: "package" },
  { emoji: "📚", id: "books" },
  { emoji: "🧪", id: "testTube" },
  { emoji: "🔒", id: "lock" },
  { emoji: "🎮", id: "game" },
  { emoji: "🎵", id: "music" },
  { emoji: "🎬", id: "movie" },
  { emoji: "🖼️", id: "picture" },
  { emoji: "🛍️", id: "shopping" },
  { emoji: "🔥", id: "fire" },
  { emoji: "💡", id: "idea" },
  { emoji: "🧩", id: "puzzle" },
  { emoji: "📊", id: "chart" },
  { emoji: "🧠", id: "brain" },
  { emoji: "🦄", id: "unicorn" },
  { emoji: "🐙", id: "octopus" },
  { emoji: "🌱", id: "seedling" },
] as const;

export function filterProjectIconNames(query: string): ReadonlyArray<string> {
  const normalized = query.trim().toLowerCase().replaceAll(/\s+/g, "-");
  if (!normalized) return POPULAR_PROJECT_ICONS;
  return lucideIconNames.filter((name) => name.includes(normalized)).slice(0, 60);
}

export function firstEmoji(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed);
  const segment = segments[Symbol.iterator]().next().value?.segment;
  const isFlag = /^\p{Regional_Indicator}{2}$/u.test(segment ?? "");
  const isKeycap = /^[#*0-9]\uFE0F?\u20E3$/u.test(segment ?? "");
  if (!segment || (!/\p{Extended_Pictographic}/u.test(segment) && !isFlag && !isKeycap)) {
    return null;
  }
  return segment;
}
