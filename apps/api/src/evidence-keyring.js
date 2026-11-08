import {EvidenceError,parseEvidenceKey} from './assessment-evidence.js';

const ID=/^[a-z][a-z0-9_-]{0,63}$/;

// A keyring is opt-in. Bad configuration never falls back to a legacy writer.
export function configureEvidenceKeys({legacyKey,keysJson,activeId}={}){
  const legacy=parseEvidenceKey(legacyKey);
  if(keysJson===undefined&&activeId===undefined)return legacy;
  if(typeof keysJson!=='string'||typeof activeId!=='string'||!ID.test(activeId))return null;
  let parsed;
  try{parsed=JSON.parse(keysJson);}catch{return null;}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return null;
  const entries=Object.entries(parsed);
  if(!entries.length||entries.length>32)return null;
  const keys=Object.create(null);
  for(const [id,value] of entries){
    const key=parseEvidenceKey(value);
    if(!ID.test(id)||!key)return null;
    keys[id]=key;
  }
  if(!Object.hasOwn(keys,activeId))return null;
  return {keys,activeKeyId:activeId,legacyKey:legacy};
}

export function encryptionKeyFor(config){
  if(Buffer.isBuffer(config)&&config.length===32)return {key:config,keyId:null};
  if(config?.keys&&Object.hasOwn(config.keys,config.activeKeyId)){
    const key=config.keys[config.activeKeyId];
    if(Buffer.isBuffer(key)&&key.length===32)return {key,keyId:config.activeKeyId};
  }
  throw new EvidenceError(503,'Evidence encryption is not configured');
}

export function decryptionKeyFor(config,keyId){
  if(keyId===null||keyId===undefined){
    const legacy=Buffer.isBuffer(config)?config:config?.legacyKey;
    if(Buffer.isBuffer(legacy)&&legacy.length===32)return legacy;
  }else if(typeof keyId==='string'&&config?.keys&&Object.hasOwn(config.keys,keyId)){
    const key=config.keys[keyId];
    if(Buffer.isBuffer(key)&&key.length===32)return key;
  }
  throw new EvidenceError(503,'Evidence decryption key is unavailable');
}
