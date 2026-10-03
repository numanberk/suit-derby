"""Build script: inlines src/style.css and the scripts into single-file pages.
   dist/suit-derby.html  standalone page: fonts are embedded, so it works offline (open it directly in a browser)
   dist/artifact.html    fragment without <html>/<head>/<body>, for hosts that add their own wrapper (loads Google Fonts)
   dist/site/            the same standalone page as index.html plus sw.js, manifest and icons: host this folder
                         (GitHub Pages, any static host) and the game installs and runs offline after the first visit
Run:  python3 build.py
"""
import re, base64, hashlib, json, pathlib, shutil
src = pathlib.Path('src'); out = pathlib.Path('dist'); out.mkdir(exist_ok=True)
html = (src / 'index.html').read_text()
css = (src / 'style.css').read_text()
def script(m):
    return '<script>\n' + (src / m.group(1)).read_text() + '\n</script>'
html = re.sub(r'<link rel="stylesheet" href="style.css">', lambda m: '<style>\n' + css + '\n</style>', html)
html = re.sub(r'<script src="([^"]+)"></script>', script, html)

# ---- artifact fragment (keeps the Google Fonts links, which hosts allow)
title = re.search(r'<title>.*?</title>', html).group(0)
links = ''.join(re.findall(r'<link[^>]+fonts[^>]+>\n?', html))
style = re.search(r'<style>.*?</style>', html, re.S).group(0)
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
(out / 'artifact.html').write_text(title + '\n' + links + style + '\n' + body)

# ---- standalone: embed the fonts (latin + latin-ext covers English and Turkish), drop the Google links
fonts = pathlib.Path('fonts')
fcss = (fonts / 'fonts.css').read_text()
fcss = re.sub(r'url\("([^"]+\.woff2)"\)', lambda m: 'url(data:font/woff2;base64,' + base64.b64encode((fonts / m.group(1)).read_bytes()).decode() + ')', fcss)
page = re.sub(r'<link rel="preconnect"[^>]*>\n?', '', html)
page = re.sub(r'<link rel="stylesheet" href="https://fonts[^>]*>\n?', '<style>\n' + fcss + '</style>\n', page)
# ---- offline install: only when served over http(s); on file:// nothing is registered and nothing errors
boot = ("<script>if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){"
        "var l=document.createElement('link');l.rel='manifest';l.href='manifest.webmanifest';document.head.appendChild(l);"
        "window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){})})}</script>\n")
page = page.replace('</body>', boot + '</body>')
(out / 'suit-derby.html').write_text(page)

# ---- static site folder
site = out / 'site'
if site.exists(): shutil.rmtree(site)
site.mkdir()
(site / 'index.html').write_text(page)
ver = hashlib.sha1(page.encode()).hexdigest()[:10]
(site / 'sw.js').write_text("""/* Suit Derby service worker: pages come from the network when online (so updates arrive) and from the cache when offline. */
const V = 'suitderby-%s';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put('index.html', cp)); return res; }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; })));
});
""" % ver)
(site / 'manifest.webmanifest').write_text(json.dumps({
    'name': 'Suit Derby', 'short_name': 'Suit Derby', 'description': 'Four suits race through one deck. Call the order, rig the race, keep your nerve.',
    'start_url': './', 'scope': './', 'display': 'standalone', 'orientation': 'any',
    'background_color': '#0d110c', 'theme_color': '#0d110c',
    'icons': [{'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any maskable'},
              {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any maskable'}]}, indent=1))
for n in ('icon-192.png', 'icon-512.png'): shutil.copy('icons/' + n, site / n)
print('built', {p.name: p.stat().st_size for p in out.iterdir() if p.is_file()}, 'site', sorted(p.name for p in site.iterdir()))
