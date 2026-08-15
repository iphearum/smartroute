"use client";

import {useEffect,useRef,useState} from "react";
import type {Feature,FeatureCollection,Geometry} from "geojson";
import type {Map as MapLibreMap,GeoJSONSource} from "maplibre-gl";
import {routesApi,viewportThreeDAssets,type ViewportFeature} from "@/features/routes/api/routes-api";
import {placeName,type MapLanguage} from "@/features/i18n/language";
import {LandmarkLayer} from "./landmark-layer";
import type {Coordinate} from "@/features/routes/domain/types";
import {useRouteStore} from "@/features/routes/store/route-store";
import {useRouteCalculation} from "@/features/routes/hooks/use-route-calculation";

const empty:FeatureCollection={type:"FeatureCollection",features:[]};

function boundsOf(map:MapLibreMap){
  const bounds=map.getBounds();
  return{south:bounds.getSouth(),west:bounds.getWest(),north:bounds.getNorth(),east:bounds.getEast()};
}

function buildingCollection(items:ViewportFeature[]):FeatureCollection{
  return{type:"FeatureCollection",features:items.map(item=>({
    type:"Feature",id:item.id,geometry:item.geometry as Geometry,
    properties:{name:item.name||item.name_base||"",height:item.height_m||6,min_height:item.min_height_m||0},
  }))};
}

export function ThreeDMap({language="en"}:{language?:MapLanguage}){
  const element=useRef<HTMLDivElement>(null),mapRef=useRef<MapLibreMap|null>(null),[mapReady,setMapReady]=useState(false),routes=useRouteStore(state=>state.routes),selectedRoute=useRouteStore(state=>state.selectedRoute),coordinates=useRouteStore(state=>state.coordinates),calculate=useRouteCalculation();
  useEffect(()=>{let active=true,controller:AbortController|undefined,timer:ReturnType<typeof setTimeout>|undefined;
    void import("maplibre-gl").then(maplibregl=>{
      if(!active||!element.current)return;
      const map=new maplibregl.Map({container:element.current,center:[104.9282,11.5564],zoom:16.5,pitch:62,bearing:-18,maxPitch:80,canvasContextAttributes:{antialias:true},style:"https://tiles.openfreemap.org/styles/bright"});
      mapRef.current=map;map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),"bottom-right");
      map.once("load",()=>{map.addSource("active-route",{type:"geojson",data:empty});map.addLayer({id:"active-route-outline",type:"line",source:"active-route",paint:{"line-color":"#fff","line-width":10,"line-opacity":.9}});map.addLayer({id:"active-route-line",type:"line",source:"active-route",paint:{"line-color":"#087f5b","line-width":6}});map.addSource("route-connectors",{type:"geojson",data:empty});map.addLayer({id:"route-connectors-outline",type:"line",source:"route-connectors",paint:{"line-color":"#fff","line-width":7,"line-dasharray":[1,2]}});map.addLayer({id:"route-connectors-line",type:"line",source:"route-connectors",paint:{"line-color":"#087f5b","line-width":4,"line-dasharray":[1,2]}});map.addSource("route-points",{type:"geojson",data:empty});map.addLayer({id:"route-points",type:"circle",source:"route-points",paint:{"circle-radius":9,"circle-color":["case",["==",["get","index"],0],"#087f5b","#ef4444"],"circle-stroke-color":"#fff","circle-stroke-width":3}});setMapReady(true)});
      map.on("click",async event=>{const coordinate:Coordinate=[event.lngLat.lat,event.lngLat.lng],state=useRouteStore.getState(),index=state.activePoint;state.setPoint(index,{name:"Pinned location",latitude:coordinate[0],longitude:coordinate[1]});try{const nearest=await routesApi.nearest(coordinate);useRouteStore.getState().setPoint(index,{name:nearest.name||"Pinned location",latitude:coordinate[0],longitude:coordinate[1]})}catch{}const latest=useRouteStore.getState(),ready=latest.coordinates.filter(Boolean) as Coordinate[];if(ready.length===latest.coordinates.length)void calculate(ready)});
      const landmarks=new LandmarkLayer();
      const load=()=>{controller?.abort();controller=new AbortController();const indicator=document.getElementById("map-data-loading");indicator?.classList.replace("hidden","flex");const bounds=boundsOf(map);
        Promise.all([map.getZoom()>=14?routesApi.viewportFeatures(bounds,["building"],3000,controller.signal):Promise.resolve([]),routesApi.viewportPlaces(bounds,500,controller.signal),viewportThreeDAssets(bounds,100,controller.signal)]).then(([buildings,places,assets])=>{
          if(!active)return;(map.getSource("buildings") as GeoJSONSource|undefined)?.setData(buildingCollection(buildings));
          const poiData:FeatureCollection={type:"FeatureCollection",features:places.map(place=>({type:"Feature",id:place.id,geometry:{type:"Point",coordinates:[place.longitude,place.latitude]},properties:{name:placeName(place,language),category:place.category||"place"}} as Feature))};
          (map.getSource("places") as GeoJSONSource|undefined)?.setData(poiData);
          landmarks.setAssets(assets);
        }).catch(error=>{if(!(error instanceof DOMException&&error.name==="AbortError"))console.error(error)}).finally(()=>{if(active&&!controller?.signal.aborted)indicator?.classList.replace("flex","hidden")})};
      const schedule=()=>{if(timer)clearTimeout(timer);timer=setTimeout(load,250)};
      map.on("load",()=>{const firstLabel=map.getStyle().layers.find(layer=>layer.type==="symbol")?.id;map.addSource("buildings",{type:"geojson",data:empty});map.addLayer({id:"building-extrusion",type:"fill-extrusion",source:"buildings",minzoom:14,paint:{"fill-extrusion-color":["interpolate",["linear"],["get","height"],0,"#f3f1f5",20,"#e2e0e6",60,"#ccd2dc",150,"#b9c2cf"],"fill-extrusion-height":["get","height"],"fill-extrusion-base":["get","min_height"],"fill-extrusion-opacity":.94,"fill-extrusion-vertical-gradient":true}},firstLabel);map.addLayer(landmarks,firstLabel);map.addSource("places",{type:"geojson",data:empty});map.addLayer({id:"place-dots",type:"circle",source:"places",minzoom:14,paint:{"circle-radius":5,"circle-color":"#f36f67","circle-stroke-color":"#fff","circle-stroke-width":2}});map.addLayer({id:"place-labels",type:"symbol",source:"places",minzoom:15,layout:{"text-field":["get","name"],"text-size":11,"text-offset":[0,1.25],"text-anchor":"top","text-allow-overlap":false},paint:{"text-color":"#e65f57","text-halo-color":"#fff","text-halo-width":1.5}});load()});map.on("moveend",schedule);
    });return()=>{active=false;controller?.abort();if(timer)clearTimeout(timer);mapRef.current?.remove();mapRef.current=null}},[language,calculate]);
  useEffect(()=>{const map=mapRef.current;if(!map||!mapReady)return;const route=routes[selectedRoute],roadSegments=route?.segments?.filter(segment=>segment.type==="road").map(segment=>segment.geometry)||(route?[route.geometry]:[]),routeData:FeatureCollection={type:"FeatureCollection",features:roadSegments.map(coordinates=>({type:"Feature" as const,properties:{},geometry:{type:"LineString" as const,coordinates}}))},connectorSegments=[...(route?.connectors||[]),...(route?.segments?.filter(segment=>segment.type==="inferred").map(segment=>segment.geometry)||[])],connectorData:FeatureCollection={type:"FeatureCollection",features:connectorSegments.map(coordinates=>({type:"Feature" as const,properties:{},geometry:{type:"LineString" as const,coordinates}}))},pointData:FeatureCollection={type:"FeatureCollection",features:coordinates.flatMap((point,index)=>point?[{type:"Feature" as const,properties:{index},geometry:{type:"Point" as const,coordinates:[point[1],point[0]]}}]:[])};(map.getSource("active-route") as GeoJSONSource)?.setData(routeData);(map.getSource("route-connectors") as GeoJSONSource)?.setData(connectorData);(map.getSource("route-points") as GeoJSONSource)?.setData(pointData)},[routes,selectedRoute,coordinates,mapReady]);
  return <div ref={element} className="absolute inset-0" aria-label="Interactive 3D building map"/>;
}
