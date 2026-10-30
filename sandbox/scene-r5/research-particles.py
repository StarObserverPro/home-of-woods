import urllib.request,re,pathlib,zipfile,json,hashlib
root=pathlib.Path(__file__).parent
page=urllib.request.urlopen('https://kenney.nl/assets/particle-pack').read().decode()
links=re.findall(r'(?:href|data-url)=["\']([^"\']+)["\']',page)
for link in links:
    if '.zip' in link:
        print(link)
        folder=root/'sources'/'kenney-particles';folder.mkdir(parents=True,exist_ok=True)
        data=urllib.request.urlopen(link).read();(folder/'particle-pack.zip').write_bytes(data)
        with zipfile.ZipFile(folder/'particle-pack.zip') as z:
            files=z.namelist();print('\n'.join(files[:45]));
            licenses=[f for f in files if 'license' in f.lower()];
            for f in licenses: print(z.read(f).decode(errors='replace'))
        break
else:
    ident=re.search(r"data-download-id='([^']+)'",page).group(1)
    payload=json.load(urllib.request.urlopen('https://kenney.nl/download-link/'+ident))
    link=payload.get('url') or payload.get('link')
    if not link: print('Download response fields:',list(payload));raise SystemExit(1)
    folder=root/'sources'/'kenney-particles';folder.mkdir(parents=True,exist_ok=True)
    data=urllib.request.urlopen(link).read();(folder/'particle-pack.zip').write_bytes(data)
    with zipfile.ZipFile(folder/'particle-pack.zip') as z:
        print('\n'.join(z.namelist()[:50]))
        for f in z.namelist():
            if 'license' in f.lower():
                license=z.read(f).decode();print(license);(folder/'License.txt').write_text(license)
    (folder/'provenance.json').write_text(json.dumps({'source':'https://kenney.nl/assets/particle-pack','date':'2026-10-30','sha256':hashlib.sha256(data).hexdigest()},indent=2))
