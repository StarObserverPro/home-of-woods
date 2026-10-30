import fs from 'node:fs';
import crypto from 'node:crypto';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const file='public/assets/manifest.json',manifest=JSON.parse(fs.readFileSync(file,'utf8'));
const characterSource=['sources/kaykit/adventurers/Rogue.glb','sources/kaykit/adventurers/rogue_texture.png'];
const motionSource=['General','MovementBasic','CombatMelee','Simulation'].map(s=>'sources/kaykit/animations/'+s+'.glb');
const entries=[
 {name:'player',author:'Kay Lousberg',page:'https://kaylousberg.itch.io/kaykit-adventurers',pack:'KayKit Adventurers 2.0 FREE',parts:characterSource,license:'KayKit-Adventurers-2.0-CC0.txt',adaptation:'Rogue without cape; forest palette; black hair/brows; softened brows; eyes +6% width/+8% height and small highlights; one skin/material; 23 bones; embedded .78 scale; scene scale 1.5'},
 {name:'visitor',author:'Kay Lousberg',page:'https://kaylousberg.itch.io/kaykit-adventurers',pack:'KayKit Adventurers 2.0 FREE',parts:characterSource,license:'KayKit-Adventurers-2.0-CC0.txt',adaptation:'Same reviewed mesh/face edits, rust clothing; independent skeleton; arms/head-only wave'},
 {name:'motions',author:'Kay Lousberg',page:'https://kaylousberg.itch.io/kaykit-character-animations',pack:'KayKit Character Animations 1.1 FREE',parts:motionSource,license:'KayKit-Animations-1.1-CC0.txt',adaptation:'Only Idle_A, Walking_A, PickUp, Waving and two Melee_2H attacks; no mannequin meshes; scene samples a stopped/recovered pose without changing source clips'},
 {name:'axe',author:'Home of Woods original modelling',parts:['tools/build-character-axe.py'],adaptation:'Original single-bit wood axe; right palm origin, two-hand alignment; actual cutting-head geometry used for contact constraints'},
];
manifest.assets=manifest.assets.filter(a=>a.batchId!=='HOW-CHARACTERS-1');
for(const e of entries){
 const output='public/assets/characters/'+e.name+'.glb';
 manifest.assets.push({assetId:'how-character-'+e.name,batchId:'HOW-CHARACTERS-1',role:'runtime',status:'integrated',file:output,bytes:fs.statSync(output).size,sha256:sha(output),
  source:{author:e.author,page:e.page,pack:e.pack,reviewedDate:'2026-10-30',files:e.parts.map(file=>({file,sha256:sha(file)}))},
  license:e.license?{id:'CC0-1.0',evidence:'public/assets/licenses/'+e.license,thirdPartyContent:true,rights:'Source assets allow modification, game use and public redistribution; original license and modification record retained.'}:{id:'project-original',thirdPartyContent:false},
  adaptation:e.adaptation,integration:{loader:'src/scene/models.ts',render:'src/scene/characters.ts',contact:'src/scene/axe-contact.ts',disposal:'src/scene/resources.ts'},
  evidence:['evidence/characters/'],limitations:'Local project integration; no PR merge or deployment; inspector vertical cutting is not a crafting transaction.'});
}
const previous=manifest.assets.find(a=>a.assetId==='how-m0-ranger');
if(previous){previous.role='archived';previous.status='superseded';previous.limitations='Retained canonical R4 historical asset; current player uses how-character-player.';}
manifest.characterIntegration={batch:'HOW-CHARACTERS-1',authorizedDate:'2026-10-30',status:'integrated-on-local-branch',validation:'evidence/characters/'};
fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
console.log('Registered character GLBs and exact source parts.');
