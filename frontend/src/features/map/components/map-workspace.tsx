"use client";

import {useEffect,useState} from "react";
import type {MapLanguage} from "@/features/i18n/language";
import {PoiLoader} from "@/features/places/components/poi-loader";
import {RoutePanel} from "@/features/routes/components/route-panel";
import {Icon, type IconName} from "@/shared/ui/icon";
import {MapCanvas} from "./map-canvas";
import {ThreeDMap} from "./three-d-map";

const railItems:{icon:IconName;label:string;active?:boolean}[]=[
  {icon:"home",label:"Explore",active:true},
  {icon:"locate",label:"Locate"},
  {icon:"database",label:"Place data"},
  {icon:"bookmark",label:"Node IDs"},
];
const categories=[{key:"cafe",label:"☕ Cafés"},{key:"food",label:"🍜 Restaurants"},{key:"hotel",label:"🏨 Hotels"},{key:"fuel",label:"⛽ Fuel"},{key:"medical",label:"🏥 Hospitals"},{key:"shopping",label:"🛍 Markets"}];

export function MapWorkspace(){const [sidebarCollapsed,setSidebarCollapsed]=useState(false),[poiFilters,setPoiFilters]=useState<string[]>([]),[language,setLanguage]=useState<MapLanguage>("en"),[view3d,setView3d]=useState(false);useEffect(()=>{const timer=setTimeout(()=>{const saved=localStorage.getItem("smartroute-language");if(saved==="en"||saved==="km")setLanguage(saved)},0);return()=>clearTimeout(timer)},[]);const toggleLanguage=()=>setLanguage(value=>{const next=value==="en"?"km":"en";localStorage.setItem("smartroute-language",next);return next}),toggleSidebar=()=>setSidebarCollapsed(value=>!value),toggleFilter=(key:string)=>setPoiFilters(current=>current.includes(key)?current.filter(value=>value!==key):[...current,key]);return <main className="relative h-dvh min-h-[620px] overflow-hidden" lang={language}>
  {view3d?<ThreeDMap language={language}/>:<MapCanvas poiFilters={poiFilters} language={language}/>} 
  <nav className={`desktop-rail absolute bottom-0 left-0 top-0 z-[800] w-[76px] flex-col items-center gap-2 border-r border-slate-200 bg-white/95 px-2.5 py-[18px] backdrop-blur transition-transform duration-300 ${sidebarCollapsed?"-translate-x-full":"translate-x-0"}`} aria-label="Primary navigation" aria-hidden={sidebarCollapsed}>
    <button className="brand mb-3 grid h-12 w-12 place-items-center rounded-[15px] bg-emerald-700 text-white shadow-[0_8px_22px_rgba(8,127,91,.25)]" aria-label="SmartRoute"><Icon name="brand" className="h-7 w-7"/></button>
    {railItems.map(item=><button key={item.label} className={`flex min-h-[58px] w-14 flex-col items-center justify-center gap-1 rounded-[13px] text-[10px] font-semibold ${item.active?"bg-emerald-50 text-emerald-700":"text-slate-500 hover:bg-slate-50"}`}><Icon name={item.icon} className="h-[22px] w-[22px]"/>{item.label}</button>)}
    <span className="rail-spacer flex-1"/>
    <button onClick={()=>setView3d(value=>!value)} aria-pressed={view3d} className={`flex min-h-[52px] w-14 flex-col items-center justify-center gap-0.5 rounded-[13px] text-[10px] font-bold ${view3d?"bg-emerald-700 text-white":"text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"}`}><span className="text-base" aria-hidden="true">◇</span>{view3d?"2D":"3D"}</button>
    <button onClick={toggleLanguage} className="flex min-h-[52px] w-14 flex-col items-center justify-center gap-0.5 rounded-[13px] text-[10px] font-bold text-emerald-700 hover:bg-emerald-50" aria-label={language==="en"?"Switch to Khmer":"Switch to English"}><span className="text-sm" aria-hidden="true">文</span>{language==="en"?"ខ្មែរ":"EN"}</button>
    <button className="flex min-h-[58px] w-14 flex-col items-center justify-center gap-1 rounded-[13px] text-[10px] font-semibold text-slate-500"><Icon name="help" className="h-[22px] w-[22px]"/>Help</button>
  </nav>
  <RoutePanel sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} language={language}/>
  <div className="category-strip-next absolute right-[72px] top-[21px] z-[650] flex gap-2 overflow-x-auto transition-[left] duration-300 [scrollbar-width:none]" style={{left:sidebarCollapsed?420:500}} aria-label="Filter places">{categories.map(category=>{const active=poiFilters.includes(category.key);return <button key={category.key} onClick={()=>toggleFilter(category.key)} aria-pressed={active} className={`h-[38px] shrink-0 rounded-full border px-3.5 text-xs font-bold shadow-sm transition-colors ${active?"border-emerald-600 bg-emerald-700 text-white shadow-emerald-900/15":"border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"}`}>{category.label}</button>})}</div>
  <PoiLoader/>
  <div id="map-data-loading" className="pointer-events-none absolute bottom-20 left-1/2 z-[650] hidden -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-100 bg-white/95 px-4 py-2 text-[11px] font-bold text-emerald-700 shadow-lg backdrop-blur" role="status"><span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700"/>Loading visible map data…</div>
  <div className="map-footer absolute bottom-6 left-[500px] z-[600] flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-[11px] font-bold text-slate-600 shadow-lg"><span className="h-2 w-2 rounded-full bg-emerald-600 ring-4 ring-emerald-100"/>Search for a place or pin the map</div>
</main>}
