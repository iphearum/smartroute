import type {Place} from "@/features/routes/domain/types";

export type MapLanguage="en"|"km";

export function placeName(place:Place,language:MapLanguage){
  const translations=place.metadata?.translations;
  let names:Record<string,unknown>|undefined;
  if(translations&&typeof translations==="object"){
    const value=(translations as Record<string,unknown>).name;
    if(value&&typeof value==="object")names=value as Record<string,unknown>;
  }
  const selected=names?.[language];
  if(typeof selected==="string"&&selected.trim())return selected;
  if(language==="en")return place.name;
  if(place.name_base)return place.name_base;
  return place.name;
}
