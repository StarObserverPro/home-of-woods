"""Produce deterministic CC0 stag/goat GLBs from audited source files.
Requires Pillow only for recoloring Goat's baked atlas; no download at build time.
"""
from pathlib import Path
from hashlib import sha256
from io import BytesIO
import json,struct,base64,math
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'sources'; DEST=ROOT/'public/assets/wildlife'; DEST.mkdir(exist_ok=True,parents=True)
def sha(b):return sha256(b).hexdigest()
def align4(b,pad=b' '):return b+pad*((-len(b))%4)
def glb_parse(raw):
    assert raw[:4]==b'glTF' and struct.unpack_from('<I',raw,8)[0]==len(raw)
    jlen=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+jlen]);at=20+jlen
    blen=struct.unpack_from('<I',raw,at)[0];binary=raw[at+8:at+8+blen]
    return doc,binary
def glb_write(doc,blob):
    doc['buffers'][0]['byteLength']=len(blob)
    j=align4(json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode())
    b=align4(blob,b'\0')
    size=12+8+len(j)+8+len(b)
    return b'glTF'+struct.pack('<II',2,size)+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(b),0x004e4942)+b

stagpath=SOURCE/'quaternius/ultimate-animated-animals/Stag.gltf'; raw=stagpath.read_bytes()
assert sha(raw)=='170b964909d16d1ab4d428b1d714f25016913d32481acd9c3d62923192583be6', 'Upstream stag changed: reapprove source'
stag=json.loads(raw);buf=base64.b64decode(stag['buffers'][0].pop('uri').split(',',1)[1]);
clips={'Idle':'idle','Idle_2':'survey','Idle_Headlow':'graze','Walk':'walk','Gallop_Jump':'bound'}
stag['animations']=[dict(a,name=clips[a['name']]) for a in stag['animations'] if a['name'] in clips]
assert len(stag['animations'])==len(clips)
for mat in stag['materials']:
    p=mat.setdefault('pbrMetallicRoughness',{});p['metallicFactor']=0.;p['roughnessFactor']=.77
    old=p.get('baseColorFactor',[1,1,1,1]);p['baseColorFactor']=[min(1,x*1.23+.025) for x in old[:3]]+[1]
stag['asset']['extras']={'author':'Quaternius','pack':'Ultimate Animated Animal Pack (2021)','license':'CC0-1.0','source':'https://quaternius.com/packs/ultimateanimatedanimals.html','adaptation':'Repack embedded glTF as GLB; keep only 5 noncombat clips; brighten nonmetallic palette.'}
stagout=glb_write(stag,buf);(DEST/'stag.glb').write_bytes(stagout)

goatpath=SOURCE/'gobkit/animalB/Goat.glb';src=goatpath.read_bytes()
assert sha(src)=='51f7399bb76ea5175ac4d7c136c50b74f86250664c1f6b1acff48e5322f09ea0','Upstream goat changed: reapprove source'
goat,binary=glb_parse(src)
assert goat.get('skins') and len(goat['skins'][0]['joints'])==16
assert {a['name'] for a in goat['animations']}>={'idle','walk'}
goat['animations']=[a for a in goat['animations'] if a['name'] in ('idle','walk')]
view=goat['bufferViews'][goat['images'][0]['bufferView']];original=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
img=Image.open(BytesIO(original)).convert('RGBA')
pix=img.load();
for y in range(img.height):
 for x in range(img.width):
  r,g,b,a=pix[x,y]
  # Preserve eyes/hooves; warm white coat with deliberately faint low-poly color contrast.
  value=.2126*r+.7152*g+.0722*b
  if value<68: pix[x,y]=(51,48,44,a)
  elif value<112: pix[x,y]=(164,156,140,a)
  else:
   t=min(1,max(0,(value-112)/143));pix[x,y]=(int(216+28*t),int(215+29*t),int(203+33*t),a)
out=BytesIO();img.save(out,format='PNG',optimize=False,compress_level=9);png=out.getvalue()
binary=align4(binary,b'\0');start=len(binary);binary+=png
goat['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(png)});goat['images'][0]['bufferView']=len(goat['bufferViews'])-1
goat['materials'][0]['pbrMetallicRoughness'].update({'metallicFactor':0,'roughnessFactor':.76,'baseColorFactor':[1,1,1,1]})
goat['asset']['extras']={'author':'Gobkit','pack':'Free Animal Pack Vol. 2','license':'CC0-1.0','source':'https://gobkit.com/freebies/animalB/Goat.glb','adaptation':'Recolor baked atlas as pale mountain goat, preserve dark hooves; keep idle/walk only.'}
goatout=glb_write(goat,binary);(DEST/'goat.glb').write_bytes(goatout)

manifestfile=ROOT/'public/assets/manifest.json';manifest=json.loads(manifestfile.read_text())
for name,model,sourcefile,license_path in [('stag',stag,stagpath,'sources/quaternius/ultimate-animated-animals/License.txt'),('goat',goat,goatpath,'public/assets/licenses/gobkit-CC0-1.0.txt')]:
    outbytes=(DEST/(name+'.glb')).read_bytes();triangle=sum(int(model['accessors'][p['indices']]['count']/3) for mesh in model['meshes'] for p in mesh['primitives'] if 'indices' in p)
    rec={ 'assetId':f'how-wildlife-{name}', 'batchId':'HOW-WILDLIFE-PHASE2', 'role':'runtime','status':'integrated-on-branch', 'file':f'public/assets/wildlife/{name}.glb','bytes':len(outbytes),'sha256':sha(outbytes),
      'source':{'author':'Quaternius' if name=='stag' else 'Gobkit','page':'https://quaternius.com/packs/ultimateanimatedanimals.html' if name=='stag' else 'https://gobkit.com/freebies', 'files':[{'file':str(sourcefile.relative_to(ROOT)),'sha256':sha(sourcefile.read_bytes())}]},
      'license':{'id':'CC0-1.0','evidence':license_path},'adaptation':model['asset']['extras']['adaptation'],
      'integration':{'loader':'src/scene/models.ts','render':'src/scene/wildlife-presentation.ts','rules':'src/domain/wildlife.ts','disposal':'src/scene/resources.ts'},
      'metrics':{'triangles':triangle,'joints':len(model['skins'][0]['joints']),'clips':[a['name'] for a in model['animations']]},
      'limitations':'Decorative distant encounter: no collection, feeding, pet identity or economic consequences.'}
    manifest['assets']=[a for a in manifest['assets'] if a['assetId']!=rec['assetId']];manifest['assets'].append(rec)
    print(name,rec['bytes'],rec['sha256'],rec['metrics'])
manifestfile.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
