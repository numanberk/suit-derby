"""Build script: inlines src/style.css and the scripts into single-file pages.
   dist/suit-derby.html  standalone page (open it directly in a browser)
   dist/artifact.html    fragment without <html>/<head>/<body>, for hosts that add their own wrapper
Run:  python3 build.py
"""
import re, pathlib
src = pathlib.Path('src'); out = pathlib.Path('dist'); out.mkdir(exist_ok=True)
html = (src / 'index.html').read_text()
css = (src / 'style.css').read_text()
def script(m):
    return '<script>\n' + (src / m.group(1)).read_text() + '\n</script>'
html = re.sub(r'<link rel="stylesheet" href="style.css">', lambda m: '<style>\n' + css + '\n</style>', html)
html = re.sub(r'<script src="([^"]+)"></script>', script, html)
(out / 'suit-derby.html').write_text(html)
title = re.search(r'<title>.*?</title>', html).group(0)
links = ''.join(re.findall(r'<link[^>]+fonts[^>]+>\n?', html))
style = re.search(r'<style>.*?</style>', html, re.S).group(0)
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
(out / 'artifact.html').write_text(title + '\n' + links + style + '\n' + body)
print('built', {p.name: p.stat().st_size for p in out.iterdir()})
