"""Checks listing.md against the Marketplace length limits and the image sizes."""
import re
import struct
from pathlib import Path

here = Path(__file__).parent
text = (here / 'listing.md').read_text()
field = lambda name: re.search(rf'\*\*{name}:\*\* (.+)', text).group(1).strip()
checks = [('App name', field('App name'), 60), ('Tagline', field('Tagline'), 130), ('Summary', field('Summary'), 250)]
checks += [(f'Highlight title {i}', t, 50) for i, t in enumerate(re.findall(r'\*\*Title:\*\* (.+)', text), 1)]
checks += [(f'Highlight summary {i}', s, 220) for i, s in enumerate(re.findall(r'^ +\*\*Summary:\*\* (.+)', text, re.M), 1)]
checks += [(f'Caption {i}', c, 220) for i, c in enumerate(re.findall(r'^\d\. `screenshots/[^`]+` — (.+)$', text, re.M), 1)]
ok = True
for name, value, limit in checks:
    flag = 'OK ' if len(value) <= limit else 'TOO LONG'
    ok &= len(value) <= limit
    print(f'{flag} {name}: {len(value)}/{limit}')
for folder, size in [('screenshots', (1840, 900)), ('highlights', (580, 330))]:
    for png in sorted((here / folder).glob('*.png')):
        w, h = struct.unpack('>II', png.read_bytes()[16:24])
        ok &= (w, h) == size
        print(f'{"OK " if (w, h) == size else "BAD SIZE"} {png.name}: {w}x{h}')
raise SystemExit(0 if ok else 1)
