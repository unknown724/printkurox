declare module 'mammoth' {
  export interface RawTextResult {
    value: string;
    messages: any[];
  }
  export interface HtmlResult {
    value: string;
    messages: any[];
  }
  export function extractRawText(options: { buffer?: Buffer; arrayBuffer?: ArrayBuffer; path?: string }): Promise<RawTextResult>;
  export function convertToHtml(options: { buffer?: Buffer; arrayBuffer?: ArrayBuffer; path?: string }): Promise<HtmlResult>;
}
