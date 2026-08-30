# Web Video Trans redirect

This repository preserves the former GitHub Pages URLs and forwards visitors to [Web Media Inspector](https://tangkk.github.io/web-media-inspector/).

GitHub Pages does not support configurable server-side 301 redirects, so the migration pages use `rel="canonical"`, `noindex,follow`, JavaScript `location.replace`, and an immediate HTML refresh.
