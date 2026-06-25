declare module 'bwip-js' {
  interface DrawingOptions {
    bcid: string
    text: string
    scale?: number
    height?: number
    includetext?: boolean
    textxalign?: string
    [key: string]: unknown
  }
  function toCanvas(canvas: HTMLCanvasElement, options: DrawingOptions): HTMLCanvasElement
  const _default: { toCanvas: typeof toCanvas }
  export default _default
  export { toCanvas }
}
