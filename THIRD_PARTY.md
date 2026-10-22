# Third-party components and data

RTP Companion's original code is MIT licensed. Third-party components keep their own licenses.

- Tesseract.js 7.0.0: Apache-2.0. https://github.com/naptha/tesseract.js
- Tesseract.js-core: Apache-2.0. Exact version is pinned by package-lock.json. https://github.com/naptha/tesseract.js-core
- English Tesseract trained data: Apache-2.0. Downloaded from https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz and checked against SHA-256 ed350f3752f81ee8f38769edc14d92d997dababe23b565c59879372cc46a2468. https://github.com/tesseract-ocr/tessdata
- Electron: MIT and third-party Chromium notices. Electron's LICENSE and LICENSES.chromium.html ship beside the Windows executable. https://github.com/electron/electron
- Public heatmap and region observations: Donut Auction, https://donut.auction/rtp-heatmap. The application requests these public endpoints at runtime. Map datasets are not included in this repository or licensed by this project's MIT license. Attribution remains visible in the app.

OCR license files are copied into public/vendor during asset preparation and included in the packaged app. The source repository does not commit downloaded runtime assets. Developer and build dependencies retain the licenses listed in their npm packages and lockfile.
