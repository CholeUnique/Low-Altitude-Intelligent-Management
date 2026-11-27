export const WORKSPACE_TOOL_SIZE = 52
const edge = 12, gap = 10, toolbar = 48
const clamp = (value:number,min:number,max:number) => Math.min(Math.max(value,min),Math.max(min,max))

/** A fixed right rail: pointer X never changes the ball's horizontal position. */
export function workspaceToolsLayout(width:number,height:number,requestedTop:number) {
  width=Math.max(1,width);height=Math.max(1,height)
  const top=clamp(requestedTop,edge,height-edge-WORKSPACE_TOOL_SIZE)
  const toolbarRight=edge+WORKSPACE_TOOL_SIZE+gap
  const desktop=width>=520
  const panelRight=desktop?toolbarRight+toolbar+gap:edge
  const panelWidth=Math.max(1,Math.min(340,width-panelRight-edge))
  let panelHeight=Math.max(1,Math.min(410,height-edge*2)),panelTop=clamp(top-panelHeight/2,edge,height-edge-panelHeight)
  if(!desktop){
    const above=Math.max(0,top-gap-edge),below=Math.max(0,height-edge-top-WORKSPACE_TOOL_SIZE-gap)
    panelHeight=Math.max(1,Math.min(410,Math.max(above,below)))
    panelTop=above>=below?top-gap-panelHeight:top+WORKSPACE_TOOL_SIZE+gap
  }
  return {top,right:edge,toolbarRight,toolbarTop:top+2,panelRight,panelWidth,panelHeight,panelTop}
}
