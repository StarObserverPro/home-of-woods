import fs from 'node:fs';
import path from 'node:path';
import {inflateRawSync} from 'node:zlib';

/** Read immutable source bytes from the previous delivery, without extracting or executing them. */
export function verifiedSourceReader(archive,allowExplicitRoot=true){
  if(allowExplicitRoot&&process.env.HOW_VERIFICATION_SOURCE_ROOT)return file=>fs.readFileSync(path.resolve(process.env.HOW_VERIFICATION_SOURCE_ROOT,file));
  const zip=fs.readFileSync(archive),entries=new Map();
  let end=zip.length-22;
  while(end>=Math.max(0,zip.length-65557)&&zip.readUInt32LE(end)!==0x06054b50)end--;
  if(end<0||zip.readUInt32LE(end)!==0x06054b50)throw new Error('Missing ZIP directory');
  let offset=zip.readUInt32LE(end+16);
  for(let i=0;i<zip.readUInt16LE(end+10);i++){
    if(zip.readUInt32LE(offset)!==0x02014b50)throw new Error('Invalid ZIP entry');
    const method=zip.readUInt16LE(offset+10),size=zip.readUInt32LE(offset+20),nameLength=zip.readUInt16LE(offset+28);
    const name=zip.subarray(offset+46,offset+46+nameLength).toString('utf8').replaceAll('\\','/');
    const local=zip.readUInt32LE(offset+42);
    if(zip.readUInt32LE(local)!==0x04034b50)throw new Error('Invalid local ZIP entry');
    const dataStart=local+30+zip.readUInt16LE(local+26)+zip.readUInt16LE(local+28);
    const data=zip.subarray(dataStart,dataStart+size);
    if(method!==0&&method!==8)throw new Error('Unsupported ZIP compression');
    entries.set(name,method===8?inflateRawSync(data):data);
    offset+=46+nameLength+zip.readUInt16LE(offset+30)+zip.readUInt16LE(offset+32);
  }
  return file=>{const bytes=entries.get(file);if(!bytes)throw new Error(`Missing archived source: ${file}`);return bytes;};
}
