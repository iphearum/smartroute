import type {Coordinate,CoordinateRouteResponse,TrafficProfile,TravelMode} from "../domain/types";

type Progress=(message:string)=>void;
type Pending={resolve:(value:CoordinateRouteResponse)=>void;reject:(reason:Error)=>void;progress?:Progress;timer:ReturnType<typeof setTimeout>};
let socket:WebSocket|null=null,opening:Promise<WebSocket>|null=null;
const pending=new Map<string,Pending>();

function socketUrl(){
  const configured=process.env.NEXT_PUBLIC_WEBSOCKET_URL?.replace(/\/$/,"");
  if(configured)return configured.endsWith("/ws/routes")?configured:configured.endsWith("/ws")?`${configured}/routes`:`${configured}/ws/routes`;
  const protocol=window.location.protocol==="https:"?"wss:":"ws:";
  return `${protocol}//${window.location.hostname}:8000/ws/routes`;
}

function rejectPending(message:string){for(const [id,item] of pending){clearTimeout(item.timer);item.reject(new Error(message));pending.delete(id)}}

function connect(){
  if(socket?.readyState===WebSocket.OPEN)return Promise.resolve(socket);
  if(opening)return opening;
  opening=new Promise((resolve,reject)=>{
    const next=new WebSocket(socketUrl());
    next.onopen=()=>{socket=next;opening=null;resolve(next)};
    next.onerror=()=>{opening=null;reject(new Error("Realtime route connection unavailable"))};
    next.onclose=()=>{if(socket===next)socket=null;opening=null;rejectPending("Realtime route connection closed")};
    next.onmessage=event=>{
      const message=JSON.parse(String(event.data)) as {type:string;request_id:string;message?:string;province?:string;data?:CoordinateRouteResponse};
      const item=pending.get(message.request_id);if(!item)return;
      if(message.type==="map_loading")item.progress?.("Loading province road map…");
      if(message.type==="route_calculating")item.progress?.(`Calculating route${message.province?` in ${message.province.replaceAll("_"," ")}`:""}…`);
      if(message.type==="route_ready"&&message.data){clearTimeout(item.timer);pending.delete(message.request_id);item.resolve(message.data)}
      if(message.type==="error"){clearTimeout(item.timer);pending.delete(message.request_id);item.reject(new Error(message.message||"Route calculation failed"))}
    };
  });
  return opening;
}

export async function calculateRouteRealtime(coordinates:Coordinate[],mode:TravelMode,traffic:TrafficProfile,progress?:Progress){
  const active=await connect(),requestId=crypto.randomUUID();
  return new Promise<CoordinateRouteResponse>((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error("Realtime route request timed out"))},30000);
    pending.set(requestId,{resolve,reject,progress,timer});
    active.send(JSON.stringify({request_id:requestId,coordinates,mode,traffic}));
  });
}
