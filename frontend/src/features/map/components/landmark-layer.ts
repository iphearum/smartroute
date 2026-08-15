import * as THREE from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {MercatorCoordinate,type CustomLayerInterface,type CustomRenderMethodInput,type Map as MapLibreMap} from "maplibre-gl";
import type {ThreeDAsset} from "@/features/routes/api/routes-api";

const radians=(degrees:number)=>degrees*Math.PI/180;

export class LandmarkLayer implements CustomLayerInterface{
  readonly id="landmark-models";readonly type="custom" as const;readonly renderingMode="3d" as const;
  private map?:MapLibreMap;private camera=new THREE.Camera();private scene=new THREE.Scene();
  private renderer?:THREE.WebGLRenderer;private loader=new GLTFLoader();private models=new Map<number,THREE.Object3D>();private requested=new Set<number>();
  onAdd(map:MapLibreMap,gl:WebGL2RenderingContext){this.map=map;this.renderer=new THREE.WebGLRenderer({canvas:map.getCanvas(),context:gl,antialias:true});this.renderer.autoClear=false;this.scene.add(new THREE.HemisphereLight(0xffffff,0x667788,2.4));const sun=new THREE.DirectionalLight(0xffffff,2.2);sun.position.set(0,-70,100);this.scene.add(sun)}
  setAssets(assets:ThreeDAsset[]){for(const asset of assets){if(this.models.has(asset.id)||this.requested.has(asset.id))continue;this.requested.add(asset.id);this.loader.load(asset.model_url,gltf=>{const coordinate=MercatorCoordinate.fromLngLat([asset.longitude,asset.latitude],asset.altitude),meter=coordinate.meterInMercatorCoordinateUnits()*asset.scale,model=gltf.scene;model.name=asset.name;model.position.set(coordinate.x,coordinate.y,coordinate.z);model.scale.set(meter,-meter,meter);model.rotation.set(radians(asset.rotation_x),radians(asset.rotation_y),radians(asset.rotation_z));this.models.set(asset.id,model);this.scene.add(model);this.map?.triggerRepaint()},undefined,error=>{this.requested.delete(asset.id);console.error(`Could not load 3D model ${asset.name}`,error)})}}
  render(_gl:WebGL2RenderingContext,{modelViewProjectionMatrix}:CustomRenderMethodInput){if(!this.renderer)return;this.camera.projectionMatrix.fromArray(modelViewProjectionMatrix);this.renderer.resetState();this.renderer.render(this.scene,this.camera)}
  onRemove(){this.renderer?.dispose();for(const model of this.models.values())model.traverse(child=>{if(child instanceof THREE.Mesh){child.geometry.dispose();const materials=Array.isArray(child.material)?child.material:[child.material];materials.forEach(material=>material.dispose())}});this.models.clear()}
}
