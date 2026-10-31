import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const dir=import.meta.dirname,project=path.resolve(dir,'../..');
const lock=JSON.parse(fs.readFileSync(path.join(project,'package-lock.json'))),pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json')));
const wanted=new Set(),queue=['three','vite'];
while(queue.length){const name=queue.shift(),key='node_modules/'+name;if(wanted.has(key))continue;const value=lock.packages[key];if(!value)throw new Error('Missing locked dependency '+name);wanted.add(key);for(const dep of Object.keys({...value.dependencies,...value.optionalDependencies}))queue.push(dep);}
const packages={'':{name:pkg.name,version:pkg.version,dependencies:pkg.dependencies,devDependencies:pkg.devDependencies}};
for(const key of [...wanted].sort()){packages[key]=lock.packages[key];const source=path.join(project,key),dest=path.join(dir,key);if(fs.existsSync(source)&&!fs.existsSync(dest))fs.cpSync(source,dest,{recursive:true});}
fs.writeFileSync(path.join(dir,'package-lock.json'),JSON.stringify({name:pkg.name,version:pkg.version,lockfileVersion:3,requires:true,packages},null,2)+'\n');
const manifest=[];const origins={player:'characters/player',motions:'characters/motions',axe:'characters/axe',pine:'m0/pine',broadleaf:'m0/broadleaf',mushrooms:'gathering/mushrooms'};
for(const [name,origin]of Object.entries(origins)){const source=path.join(project,'public/assets',origin+'.glb'),copy=path.join(dir,'public/assets',name+'.glb'),bytes=fs.readFileSync(copy);const sha=b=>crypto.createHash('sha256').update(b).digest('hex');if(sha(bytes)!==sha(fs.readFileSync(source)))throw new Error('Intake mismatch '+name);manifest.push({file:'public/assets/'+name+'.glb',source:'public/assets/'+origin+'.glb',bytes:bytes.length,sha256:sha(bytes)});}
fs.writeFileSync(path.join(dir,'evidence/intake.json'),JSON.stringify({date:'2026-10-30',method:'selected read-only copies; original bytes unchanged',assets:manifest,dependencies:[...wanted]},null,2)+'\n');
console.log('Independent local dependencies and asset fingerprints prepared:',wanted.size,'packages,',manifest.length,'assets');
