/**
 * SF Symbol to Lucide React Icon Mapping
 *
 * Maps iOS SF Symbol names to Lucide React icons with emoji fallbacks.
 * This ensures workspaces and folders created on iOS display correctly on web.
 */

import {
  Folder,
  Briefcase,
  TrendingUp,
  Book,
  Search,
  User,
  Grid2X2,
  FileText,
  GraduationCap,
  Building2,
  Star,
  Archive,
  Scale,
  Calculator,
  Beaker,
  Users,
  CreditCard,
  Phone,
  Mail,
  Building,
  Hash,
  Cloud,
  type LucideIcon,
} from 'lucide-react';

/**
 * Mapping from SF Symbol names to Lucide icons
 */
export const sfSymbolToLucide: Record<string, LucideIcon> = {
  // Workspace type icons
  'folder.fill': Folder,
  'briefcase.fill': Briefcase,
  'chart.line.uptrend.xyaxis': TrendingUp,
  'book.fill': Book,
  'magnifyingglass': Search,
  'person.fill': User,
  'square.grid.2x2.fill': Grid2X2,

  // Additional folder icons
  'folder': Folder,
  'folder.badge.plus': Folder,
  'folder.fill.badge.gearshape': Folder,

  // Document type icons
  'doc.fill': FileText,
  'doc.text.fill': FileText,
  'text.book.closed.fill': Book,
  'book.closed.fill': Book,

  // Legal/Business icons
  'building.columns.fill': Scale,
  'building.columns': Scale,
  'building.2.fill': Building2,
  'building.2': Building2,

  // Education icons
  'graduationcap.fill': GraduationCap,
  'graduationcap': GraduationCap,

  // Research/Science icons
  'testtube.2': Beaker,
  'atom': Beaker,

  // Finance icons
  'creditcard.fill': CreditCard,
  'creditcard': CreditCard,

  // Communication icons
  'phone.fill': Phone,
  'envelope.fill': Mail,
  'envelope': Mail,

  // People icons
  'person.2.fill': Users,
  'person.text.rectangle.fill': User,

  // Misc icons
  'star.fill': Star,
  'archivebox.fill': Archive,
  'archivebox': Archive,
  'number.circle.fill': Hash,
  'cloud.fill': Cloud,
  'externaldrive.badge.icloud': Cloud,
};

/**
 * Mapping from SF Symbol names to emoji fallbacks
 */
export const sfSymbolToEmoji: Record<string, string> = {
  // Workspace type icons
  'folder.fill': '📁',
  'briefcase.fill': '💼',
  'chart.line.uptrend.xyaxis': '📈',
  'book.fill': '📚',
  'magnifyingglass': '🔬',
  'person.fill': '👤',
  'square.grid.2x2.fill': '📂',

  // Additional folder icons
  'folder': '📁',
  'folder.badge.plus': '📁',
  'folder.fill.badge.gearshape': '⚙️',

  // Document type icons
  'doc.fill': '📄',
  'doc.text.fill': '📄',
  'text.book.closed.fill': '📖',
  'book.closed.fill': '📖',

  // Legal/Business icons
  'building.columns.fill': '⚖️',
  'building.columns': '⚖️',
  'building.2.fill': '🏢',
  'building.2': '🏢',

  // Education icons
  'graduationcap.fill': '🎓',
  'graduationcap': '🎓',

  // Research/Science icons
  'testtube.2': '🧪',
  'atom': '⚛️',

  // Finance icons
  'creditcard.fill': '💳',
  'creditcard': '💳',

  // Communication icons
  'phone.fill': '📞',
  'envelope.fill': '📧',
  'envelope': '📧',

  // People icons
  'person.2.fill': '👥',
  'person.text.rectangle.fill': '🪪',

  // Misc icons
  'star.fill': '⭐',
  'archivebox.fill': '🗄️',
  'archivebox': '🗄️',
  'number.circle.fill': '#️⃣',
  'cloud.fill': '☁️',
  'externaldrive.badge.icloud': '☁️',
};

/**
 * Get the Lucide icon component for an SF Symbol name
 * @param sfSymbol - The SF Symbol name (e.g., "folder.fill")
 * @param fallback - Optional fallback icon component
 * @returns The Lucide icon component or fallback
 */
export function getLucideIcon(
  sfSymbol: string | null | undefined,
  fallback: LucideIcon = Folder
): LucideIcon {
  if (!sfSymbol) return fallback;
  return sfSymbolToLucide[sfSymbol] || fallback;
}

/**
 * Get the emoji for an SF Symbol name
 * @param sfSymbol - The SF Symbol name (e.g., "folder.fill")
 * @param fallback - Optional fallback emoji
 * @returns The emoji string or fallback
 */
export function getEmoji(
  sfSymbol: string | null | undefined,
  fallback: string = '📁'
): string {
  if (!sfSymbol) return fallback;
  return sfSymbolToEmoji[sfSymbol] || fallback;
}

/**
 * Check if a string looks like an SF Symbol name
 * SF Symbols typically contain dots and common patterns
 */
export function isSFSymbol(value: string | null | undefined): boolean {
  if (!value) return false;
  // SF Symbols often contain patterns like ".fill", ".", or common prefixes
  return (
    value.includes('.') ||
    value.startsWith('folder') ||
    value.startsWith('doc') ||
    value.startsWith('book') ||
    value.startsWith('person') ||
    value.startsWith('building') ||
    value.startsWith('briefcase') ||
    value.startsWith('star') ||
    value.startsWith('magnifyingglass')
  );
}

/**
 * Render an icon - returns either the Lucide icon component or the emoji
 * Use this when you need to intelligently choose between icon and emoji
 * @param iconValue - The icon value from the database (could be SF Symbol or emoji)
 * @param preferLucide - Whether to prefer Lucide icons over emojis
 */
export function resolveIcon(
  iconValue: string | null | undefined,
  preferLucide: boolean = false
): { type: 'lucide'; icon: LucideIcon } | { type: 'emoji'; emoji: string } {
  if (!iconValue) {
    return preferLucide
      ? { type: 'lucide', icon: Folder }
      : { type: 'emoji', emoji: '📁' };
  }

  // If it's already an emoji (single character or emoji sequence), use it directly
  if (!isSFSymbol(iconValue) && iconValue.length <= 4) {
    return { type: 'emoji', emoji: iconValue };
  }

  // If it's an SF Symbol, convert it
  if (isSFSymbol(iconValue)) {
    if (preferLucide && sfSymbolToLucide[iconValue]) {
      return { type: 'lucide', icon: sfSymbolToLucide[iconValue] };
    }
    if (sfSymbolToEmoji[iconValue]) {
      return { type: 'emoji', emoji: sfSymbolToEmoji[iconValue] };
    }
  }

  // Fallback - treat as emoji if short, otherwise use default
  if (iconValue.length <= 4) {
    return { type: 'emoji', emoji: iconValue };
  }

  return preferLucide
    ? { type: 'lucide', icon: Folder }
    : { type: 'emoji', emoji: '📁' };
}
