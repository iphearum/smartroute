export type Coordinate=[latitude:number,longitude:number];
export type TravelMode="car"|"motorbike"|"bike"|"walk";
export type TrafficProfile="normal"|"heavy";
export interface Place{ id?:number;name:string;name_base?:string|null;base_language?:string|null;translated?:boolean;latitude:number;longitude:number;category?:string|null;address?:string|null;metadata?:Record<string,unknown>; }
export interface RouteOption{rank:number;recommended:boolean;recommendation_reason?:string;duration:number;length:number;geometry:[longitude:number,latitude:number][];connectors?:[longitude:number,latitude:number][][];segments?:{type:"road"|"inferred";geometry:[longitude:number,latitude:number][]}[]}
export interface CoordinateRouteResponse{routes:RouteOption[];recommended_rank:number;route_legs:[number,number][]}
export type RouteStatus="idle"|"calculating"|"ready"|"error";
