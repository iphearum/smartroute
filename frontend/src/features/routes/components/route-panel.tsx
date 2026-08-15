"use client";

import {useState} from "react";
import {placeName,type MapLanguage} from "@/features/i18n/language";
import {PlaceResults} from "@/features/search/components/place-results";
import {usePlaceSearch} from "@/features/search/hooks/use-place-search";
import {useRecentPlaces} from "@/features/search/hooks/use-recent-places";
import {Icon} from "@/shared/ui/icon";
import type {Coordinate,Place,TravelMode} from "../domain/types";
import {useRouteCalculation} from "../hooks/use-route-calculation";
import {useRouteStore} from "../store/route-store";

const modes:TravelMode[]=["car","motorbike","bike","walk"];

export function RoutePanel({sidebarCollapsed=false,onToggleSidebar,language="en"}:{sidebarCollapsed?:boolean;onToggleSidebar?:()=>void;language?:MapLanguage}){
  const [expanded,setExpanded]=useState(false),[focused,setFocused]=useState<number|null>(null),[drafts,setDrafts]=useState<Record<number,string>>({});
  const points=useRouteStore(s=>s.points),coordinates=useRouteStore(s=>s.coordinates),activePoint=useRouteStore(s=>s.activePoint),mode=useRouteStore(s=>s.mode),status=useRouteStore(s=>s.status),error=useRouteStore(s=>s.error),progress=useRouteStore(s=>s.progress),routes=useRouteStore(s=>s.routes),selectedRoute=useRouteStore(s=>s.selectedRoute);
  const setPoint=useRouteStore(s=>s.setPoint),setActivePoint=useRouteStore(s=>s.setActivePoint),clearPoint=useRouteStore(s=>s.clearPoint),addDestination=useRouteStore(s=>s.addDestination),removeDestination=useRouteStore(s=>s.removeDestination),swapEndpoints=useRouteStore(s=>s.swapEndpoints),setMode=useRouteStore(s=>s.setMode);
  const calculate=useRouteCalculation(),recent=useRecentPlaces(),query=focused===null?"":drafts[focused]??(points[focused]?placeName(points[focused],language):""),search=usePlaceSearch(query);
  const readyCoordinates=(override?:{index:number;coordinate:Coordinate})=>coordinates.map((item,index)=>override?.index===index?override.coordinate:item).filter(Boolean) as Coordinate[];
  const choose=(place:Place,index:number)=>{setPoint(index,{...place,name:placeName(place,language)});setDrafts(current=>{const next={...current};delete next[index];return next});recent.remember(place);setFocused(null);if(index>0)setExpanded(true);const ready=readyCoordinates({index,coordinate:[place.latitude,place.longitude]});if(ready.length===coordinates.length)void calculate(ready)};
  const focus=(index:number)=>{setExpanded(true);setFocused(index);setActivePoint(index)};
  const useLocation=()=>navigator.geolocation?.getCurrentPosition(position=>choose({name:"Your location",latitude:position.coords.latitude,longitude:position.coords.longitude},activePoint));
  const recalculate=()=>{const ready=readyCoordinates();if(ready.length===coordinates.length)queueMicrotask(()=>calculate(ready))};
  const topQuery=drafts[1]??(points[1]?placeName(points[1],language):"");
  return <section className="planner-panel absolute top-3.5 z-[700] w-[390px] transition-[left] duration-300" style={{left:sidebarCollapsed?14:90}}>
    <div className="flex h-[52px] items-center rounded-full border border-slate-200 bg-white py-0 pl-[18px] pr-2 shadow-[0_3px_14px_rgba(18,38,28,.18)]">
      {onToggleSidebar&&<button onClick={onToggleSidebar} className="mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700" aria-label={sidebarCollapsed?"Open sidebar":"Collapse sidebar"} aria-expanded={!sidebarCollapsed}><span className="flex w-[17px] flex-col gap-[3px]" aria-hidden="true"><span className="h-[2px] rounded bg-current"/><span className="h-[2px] rounded bg-current"/><span className="h-[2px] rounded bg-current"/></span></button>}
      <input value={expanded?"":topQuery} onFocus={()=>{if(!expanded){setFocused(1);setActivePoint(1)}}} onChange={event=>setDrafts(current=>({...current,1:event.target.value}))} placeholder="Search SmartRoute" className="min-w-0 flex-1 bg-transparent text-sm outline-none" readOnly={expanded}/>
      <button className="grid h-9 w-9 place-items-center rounded-full text-slate-600" aria-label="Search"><Icon name="search" className="h-5 w-5"/></button>
      <button onClick={()=>setExpanded(true)} className="ml-1 grid h-9 w-9 place-items-center rounded-full bg-emerald-700 text-white" aria-label="Directions"><Icon name="directions" className="h-[22px] w-[22px]"/></button>
    </div>
    {!expanded&&focused===1&&<div className="mt-2 max-h-[70vh] overflow-auto rounded-2xl bg-white p-2 shadow-xl">{query.trim().length<2?<><p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Recent searches</p><PlaceResults places={recent.places} onSelect={place=>choose(place,1)} history language={language}/></>:<PlaceResults places={search.results} onSelect={place=>choose(place,1)} language={language}/>}</div>}
    {expanded&&<div className="mt-2 max-h-[calc(100dvh-82px)] overflow-auto rounded-[18px] border border-slate-200 bg-white shadow-[0_12px_40px_rgba(18,38,28,.14)]">
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><div><p className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-700">● Directions</p><strong className="text-lg">Choose your route</strong></div><button onClick={()=>setExpanded(false)} className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><Icon name="close" className="h-5 w-5"/></button></header>
      <div className="grid grid-cols-4 border-b border-slate-100 px-3">{modes.map(value=><button key={value} onClick={()=>{setMode(value);recalculate()}} className={`flex flex-col items-center gap-1 border-b-[3px] px-1 py-2 text-[9px] font-bold capitalize ${mode===value?"border-emerald-700 text-emerald-700":"border-transparent text-slate-500"}`}><Icon name={value} className="h-[21px] w-[21px]"/>{value}</button>)}</div>
      <div className="p-[18px]">
        <div className="relative pl-8"><span className="absolute bottom-8 left-[9px] top-8 w-px bg-slate-300"/>{points.map((point,index)=>{const last=index===points.length-1;return <div key={index} className="relative mb-2"><span className={`absolute -left-[31px] top-[19px] h-[15px] w-[15px] rounded-full border-2 border-white ring-2 ${index===0?"bg-white ring-emerald-700":last?"bg-red-500 ring-red-500":"bg-indigo-500 ring-indigo-500"}`}/><label onClick={()=>focus(index)} className={`flex min-h-[58px] items-center rounded-[13px] border px-3 py-2 ${activePoint===index?"border-emerald-700 bg-white shadow-[0_0_0_3px_rgba(8,127,91,.1)]":"border-transparent bg-[#f5f7f5]"}`}><span className="min-w-0 flex-1"><span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-500">{index===0?"Starting point":last?"Destination":`Stop ${index}`}</span><input value={drafts[index]??point?.name??""} onFocus={()=>focus(index)} onChange={event=>setDrafts(current=>({...current,[index]:event.target.value}))} placeholder={index===0?"Search or pin on map":last?"Search or pin destination":"Search or pin stop"} className="w-full bg-transparent text-[13px] font-semibold outline-none"/></span><button onClick={event=>{event.preventDefault();event.stopPropagation();(points.length>2&&index>0?removeDestination:clearPoint)(index)}} className="h-7 w-7 rounded-full text-slate-400 hover:bg-slate-100">×</button></label>{focused===index&&query.trim().length>=2&&<div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-xl border bg-white p-1 shadow-xl"><PlaceResults places={search.results} onSelect={place=>choose(place,index)}/></div>}</div>})}</div>
        <button onClick={addDestination} disabled={points.length>=7} className="mb-3 h-11 w-full rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-600 disabled:opacity-40">＋ Add destination</button>
        <div className="grid grid-cols-2 gap-2"><button onClick={useLocation} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-600"><Icon name="locate" className="h-4 w-4"/>Use my location</button><button onClick={()=>{swapEndpoints();const swapped=[coordinates[1],coordinates[0]].filter(Boolean) as Coordinate[];if(swapped.length===2)queueMicrotask(()=>calculate(swapped))}} disabled={points.length!==2} className="h-10 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-600 disabled:opacity-40">⇅ Swap points</button></div>
        <p className={`mt-3 rounded-xl bg-slate-50 p-3 text-[10px] ${status==="error"?"text-red-600":"text-slate-500"}`}>{status==="calculating"?(progress||"Calculating route…"):error||"Click the map, search, or drag a marker to change a point."}</p>
        {routes[selectedRoute]&&<div className="mt-3 rounded-xl border-l-4 border-emerald-700 bg-emerald-50 p-3"><strong className="text-lg text-emerald-800">{Math.max(1,Math.round(routes[selectedRoute].duration/60))} min</strong><span className="ml-2 text-xs text-slate-500">{(routes[selectedRoute].length/1000).toFixed(1)} km</span></div>}
      </div>
    </div>}
  </section>
}
