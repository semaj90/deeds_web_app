import type { Story } from './engine';
const DB='courtroom-story-v1';
export function openStories():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{req.result.createObjectStore('stories',{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function saveStory(story:Story):Promise<void>{const db=await openStories();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('stories','readwrite');tx.objectStore('stories').put(story);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
export async function loadStory(id:string):Promise<Story|undefined>{const db=await openStories();try{return await new Promise((resolve,reject)=>{const req=db.transaction('stories','readonly').objectStore('stories').get(id);req.onsuccess=()=>resolve(req.result as Story|undefined);req.onerror=()=>reject(req.error);});}finally{db.close();}}
