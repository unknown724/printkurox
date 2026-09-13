export type LayoutMode = '1-up' | '2-up' | 'id-card' | '4-up' | '6-up' | '8-up' | '9-up' | '16-up' | 'custom' | 'booklet' | 'poster';
export type FitMode = 'fit' | 'fill' | 'actual' | 'custom';

export type TextPosition = 'header' | 'middle' | 'footer' | 'cover_title' | 'watermark' | 'custom';
export type TextFontFamily = 'sans' | 'serif' | 'mono' | 'display' | 'handwriting' | 'geometric';

export interface TextOverlayItem {
  id: string;
  text: string;
  position: TextPosition;
  customX?: number; // 0 to 100% horizontal coordinate on sheet
  customY?: number; // 0 to 100% vertical coordinate on sheet
  fontFamily: TextFontFamily;
  fontSize: 'sm' | 'md' | 'lg' | 'xl' | 'custom';
  customFontSize?: number; // Exact point size, e.g. 8 to 200+
  color?: string;
  opacity?: number;
  applyTo?: 'first_page' | 'all_pages' | 'last_page';
}

export interface TextOverlayConfig {
  enabled?: boolean;
  text?: string;
  subtitle?: string;
  position?: TextPosition;
  customX?: number; // 0 to 100% horizontal coordinate on sheet
  customY?: number; // 0 to 100% vertical coordinate on sheet
  fontFamily?: TextFontFamily;
  fontSize?: 'sm' | 'md' | 'lg' | 'xl' | 'custom';
  customFontSize?: number; // Exact point size, e.g. 8 to 200+
  color?: string;
  opacity?: number;
  applyTo?: 'first_page' | 'all_pages' | 'last_page';
  // Multi-text support
  items?: TextOverlayItem[];
  activeItemId?: string;
}

export function getTextOverlayItems(config?: TextOverlayConfig): TextOverlayItem[] {
  if (!config) return [];
  if (config.items && config.items.length > 0) {
    return config.items;
  }
  if (config.text && config.text.trim()) {
    return [
      {
        id: 'item-1',
        text: config.text,
        position: config.position || 'custom',
        customX: config.customX ?? 50,
        customY: config.customY ?? 50,
        fontFamily: config.fontFamily || 'sans',
        fontSize: config.fontSize || 'md',
        customFontSize: config.customFontSize || 28,
        color: config.color || '#111827',
        opacity: config.opacity ?? 1.0,
        applyTo: config.applyTo || 'all_pages',
      },
    ];
  }
  return [];
}

export interface PhotoLayoutSettings {
  layoutMode: LayoutMode;
  fitMode: FitMode;
  drawBorder: boolean;
  orientation: 'portrait' | 'landscape' | 'auto';
  pagesPerSheet?: number;
  customCols?: number;
  customRows?: number;
  autoRotate?: boolean;
  pageOrder?: 'horizontal' | 'vertical';
  bookletSubset?: 'both' | 'front' | 'back';
  bookletBinding?: 'left' | 'right';
  textOverlay?: TextOverlayConfig;
  customScale?: number;
}
