import * as trimCanvasModule from 'trim-canvas'

type TrimCanvasFn = (canvas: HTMLCanvasElement) => HTMLCanvasElement

const resolveTrimCanvas = () => {
  const maybeDefault = (trimCanvasModule as unknown as { default?: TrimCanvasFn }).default
  if (typeof maybeDefault === 'function') {
    return maybeDefault
  }
  if (typeof (trimCanvasModule as unknown as TrimCanvasFn) === 'function') {
    return trimCanvasModule as unknown as TrimCanvasFn
  }
  return (canvas: HTMLCanvasElement) => canvas
}

const trimCanvas = resolveTrimCanvas()

export default trimCanvas
