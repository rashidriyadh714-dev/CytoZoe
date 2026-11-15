# Bundled photography: sources, credits and rights

These photos are **decorative context only**. They do not show the studied blood samples or the DosTel1 data, and they do not imply NASA endorsement of CytoZoe. Every file is served locally from `/media/`, so no image is fetched at runtime.

| File(s) | Source item | Official page | Credit shown in the app |
|---|---|---|---|
| `earth-sunrise-hero-2400.{avif,webp}`, `earth-sunrise-hero-1440.{avif,webp}`, `earth-sunrise-hero-mobile.{avif,webp}` | **ISS067-E-245176**: sunrise over Earth's limb, taken from the ISS on 6 Aug 2022 (Nikon D4, ISS External High Definition Camera). Original 4928 × 2768 px | https://eol.jsc.nasa.gov/SearchPhotos/photo.pl?mission=ISS067&roll=E&frame=245176 | "Image courtesy of the Earth Science and Remote Sensing Unit, NASA Johnson Space Center. ISS067-E-245176 · eol.jsc.nasa.gov" |
| `earth-night-iss-1600.{avif,webp}`, `earth-night-iss-800.{avif,webp}` | **iss073e0257211** (17 Jun 2025): "The city lights of Southeast Asia and lightning storms streak below the International Space Station". Original 8256 × 5504 px | https://images.nasa.gov/details/iss073e0257211 (Expedition 73 gallery: https://www.nasa.gov/gallery/expedition-73-image-gallery/) | "NASA / Johnson Space Center, iss073e0257211" |

## Rights checked (14 Nov 2026)
- **JSC Gateway to Astronaut Photography of Earth**, "Conditions of use" (https://eol.jsc.nasa.gov/FAQ/default.htm): you may use the photos if you state *"Image courtesy of the Earth Science and Remote Sensing Unit, NASA Johnson Space Center"* and include the photo number. NASA material may not be used to imply endorsement.
- **NASA Images and Media Usage Guidelines** (https://www.nasa.gov/nasa-brand-center/images-and-media/): NASA content is generally not subject to copyright in the US and may be used for educational and informational purposes. These two items show no identifiable people, NASA logo or insignia.
- No NASA logo, "meatball", "worm" or insignia is used anywhere in CytoZoe. The CytoZoe mark is original SVG artwork (`src/components/icons.tsx`).

## Processing
Each file was downloaded once from the official page (`ISS067-E-245176.JPG` from the JSC database, `iss073e0257211~orig.jpg` from images.nasa.gov). It was resized with Lanczos and encoded to AVIF and WebP with Pillow. The only edits are resizing and one portrait crop for phones; colours and content are unchanged. Sizes:

| File | Bytes |
|---|---|
| earth-sunrise-hero-2400.avif / .webp | 10.8 KB / 18.9 KB |
| earth-sunrise-hero-1440.avif / .webp | 7.2 KB / 9.0 KB |
| earth-sunrise-hero-mobile.avif / .webp | 6.3 KB / 6.3 KB |
| earth-night-iss-1600.avif / .webp | 31.8 KB / 36.5 KB |
| earth-night-iss-800.avif / .webp | 13.9 KB / 12.7 KB |

The hero is mostly black space, so it compresses far below the 700 KB (desktop) and 300 KB (mobile) budgets with no visible loss. The landing page uses `<picture>` with AVIF first and WebP as the fallback, and it has a CSS gradient fallback if the image is missing.
