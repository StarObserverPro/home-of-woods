"""Normalize the selected Poly Haven CC0 inputs; no remote requests at runtime.
Python 3 + Pillow. Source directories and CC0 text are retained in the repository.
"""
from pathlib import Path
import io, json, struct, math, hashlib
from PIL import Image, ImageEnhance, ImageFilter
ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT/'sources/polyhaven/woodworking'
DEST=ROOT/'sandbox/woodworking/assets';DEST.mkdir(exist_ok=True)
p=SOURCE/'handsaw'
g=json.loads((p/'handsaw_wood_1k.gltf').read_text())
b=bytearray((p/'handsaw_wood.bin').read_bytes())
# Source: X thickness, Y blade height, Z length. Tooth edge slopes +0.146 in Y/Z.
# Canonical: X handle->tip, Y away from tooth edge, Z blade thickness.
angle=math.atan(.146);c,s=math.cos(angle),math.sin(angle)
original=g['accessors'][0]
positions=[]
for attr in [0,1]:
    a=g['accessors'][attr];bv=g['bufferViews'][a['bufferView']]
    pts=[]
    for i in range(a['count']):
        x,y,z=struct.unpack_from('<fff',b,bv['byteOffset']+i*12)
        pts.append((c*z+s*y,c*y-s*z,-x))
    if attr==0:
        x0=min(v[0] for v in pts);scale=240/(max(v[0] for v in pts)-x0)
        tooth=min(v[1] for v in pts if .17<v[0]<.47)
        pts=[((x-x0)*scale,(y-tooth)*scale,z*scale) for x,y,z in pts]
        positions=pts
        a['min']=[min(v[k] for v in pts) for k in range(3)]
        a['max']=[max(v[k] for v in pts) for k in range(3)]
    for i,v in enumerate(pts):struct.pack_into('<fff',b,bv['byteOffset']+i*12,*v)
# Keep the readable grip, actual teeth and rivets; reduce photographic grime and micro-noise.
for image in g['images']:
    path=p/Path(image.pop('uri')).name
    im=Image.open(path).convert('RGB').resize((512,512),Image.Resampling.LANCZOS)
    if 'diff' in path.name:
        im=ImageEnhance.Color(im).enhance(.72)
        im=ImageEnhance.Contrast(im.filter(ImageFilter.GaussianBlur(.55))).enhance(.70)
        im=ImageEnhance.Brightness(im).enhance(1.25)
    if 'nor_gl' in path.name:im=Image.blend(Image.new('RGB',im.size,(128,128,255)),im,.35)
    out=io.BytesIO();im.save(out,format='JPEG',quality=85,optimize=True)
    while len(b)%4:b.append(0)
    offset=len(b);data=out.getvalue();b.extend(data)
    image['bufferView']=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data)})
mat=g['materials'][0];mat['name']='HOW softened CC0 handsaw';mat['pbrMetallicRoughness']['metallicFactor']=.25;mat['pbrMetallicRoughness']['roughnessFactor']=.92
mat['normalTexture']['scale']=.35
while len(b)%4:b.append(0)
g['buffers']=[{'byteLength':len(b)}]
g['asset']['copyright']='Handsaw Wood by Konrad Szalankiewicz / Poly Haven, CC0-1.0; modified for Home of Woods.'
j=json.dumps(g,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
glb=struct.pack('<III',0x46546C67,2,12+8+len(j)+8+len(b))+struct.pack('<II',len(j),0x4E4F534A)+j+struct.pack('<II',len(b),0x004E4942)+b
(DEST/'hand-saw.glb').write_bytes(glb)
for source,target in [('wood_table_diff_1k.jpg','table-color.jpg'),('wood_table_nor_gl_1k.jpg','table-normal.jpg')]:
    im=Image.open(SOURCE/'table'/source).convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS)
    if 'diff' in source:
        im=ImageEnhance.Contrast(im.filter(ImageFilter.GaussianBlur(.8))).enhance(.5)
        im=ImageEnhance.Color(im).enhance(.65)
        im=ImageEnhance.Brightness(im).enhance(1.08)
    else:im=Image.blend(Image.new('RGB',im.size,(128,128,255)),im,.25)
    im.save(DEST/target,quality=87,optimize=True)
record={'model':'hand-saw.glb','triangles':g['accessors'][3]['count']//3,'canonicalAxes':{'X':'handle to tip','Y':'away from tooth edge','Z':'thickness'},'lengthMm':240,'toothEdgeY':0,'source':'https://polyhaven.com/a/handsaw_wood','license':'CC0-1.0','files':{f.name:{'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(DEST.iterdir()) if f.suffix in ['.glb','.jpg']}}
(DEST/'manifest.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record,indent=2))
