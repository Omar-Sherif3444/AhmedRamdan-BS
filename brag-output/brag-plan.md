# Brag plan: Ahmed Ramdan Barber Shop

## What it is
A live seat board for one barbershop. Customers check on their phone, before they walk in, whether a chair is free. Barbers tap a seat to check a walk-in in. The owner sees revenue, visits and each barber's share. It's Arabic first, English too, and every view has a 3D model of the shop floor.

- **Who it's for:** the shop's customers (no more walking in to a full shop), its barbers (one tap per walk-in) and its owner (the money, at a glance).
- **What sets it apart:** the actual shop, seven real seats (a 3-seat waiting sofa and 4 barber chairs), modelled in 3D with leather that turns green, red, gold or grey with each seat's status, and synced live to every phone.
- **Most impressive claim:** a barber taps Chair 3, and every customer's phone shows it taken.
- **Visual hook:** the 3D shop floor (gold-framed mirrors, chrome chairs, a velvet sofa), with the camera gliding across it.
- **Share caption:** "Is there a free chair at Ahmed Ramdan's? Now the shop floor answers, live, in 3D."

## Angle
**"Is there a free chair right now?"** It's the question every barbershop customer asks. The video asks it over the 3D floor, then shows the app answering it. The tone is `polished`, with a cinematic lean: black and gold, slow camera, confident type, no jokes.

## Identity (from src/styles.css)
- Background #0c0a09; surfaces #1c1917 and #292524; text #fafaf9 and #a8a29e.
- Gold accent #e0b443; brass #c9a14a.
- Seat statuses: available #4ade80, occupied #f87171, reserved #facc15, out of service #a8a29e.
- Font: IBM Plex Sans Arabic for both Arabic and Latin, which is the app's own font. The icon is the lucide scissors.

## Source material: the real app, filmed offline
- The real React app runs through a capture Vite config (`work/capture/`) that swaps the Supabase client and API for the project's own deterministic `seed.ts`. There are no network calls and no production data.
- Every name on screen comes from the fictional seed list. The walk-in "أحمد سمير" is invented.
- The clock is pinned to 26 Oct 2026, 19:30, so the "today" figures look like an evening's trade.
- Captures:
  - A 240-frame camera sweep across the real `Floor3D`, rendered full-screen.
  - The staff check-in flow: tap Chair 3, type the walk-in's name, press "Start service"; the chair turns red and a toast appears.
  - The public floor on a phone, before and after.
  - The owner dashboard (English and Arabic), the reports page, and the public floor (Arabic and English).

## Music
- 120 BPM: beat = 0.5 s = 15 frames, bar = 2 s. Every cut lands on a beat, counted from frame 0.
- Key of A minor; chords Am – F – C – G, one per bar.
- Instruments: warm electric-piano chords, sub bass, soft kick, rim/clap on 2 and 4, quiet hats.
- Effects, all in key and tucked under the music: a soft tick on each tap, an E/A chime when Chair 3 turns red, filtered air on the scene changes.
- The track ends on a held Am chord under the logo.

## Storyboard (20 s, 600 frames)
| # | Time | Beats | Scene | On-screen text |
|---|---|---|---|---|
| 1 | 0.0–3.0 | 0–6 | **Hook.** The 3D floor sweep starts at frame 0 with a slow push-in. Seat colours are visible straight away. | "Is there a free chair right now?" fully in by 0.6 s, with the Arabic line «فيه كرسي فاضي دلوقتي؟» under it in gold. Held until 2.8 s. |
| 2 | 3.0–6.0 | 6–12 | **Reveal.** The sweep continues and the gold scissors brand lockup rises in. | "Ahmed Ramdan Barber Shop", then "Every seat. Live. For everyone." Held 1.9 s. |
| 3 | 6.0–11.0 | 12–22 | **Highlight 1: tap → phones update.** The staff floor sits in a browser frame on the left, with the phone on the right. The cursor taps Chair 3 (7.0), the check-in dialog opens with the name typed, and the cursor presses "Start service" (8.5). The chair turns red and the toast appears. On the beat at 9.0 the phone's Chair 3 flips red, with a gold pulse ring. | "The barber taps a chair." (6.3–), then "Every customer's phone sees it." (9.0–10.8) |
| 4 | 11.0–15.0 | 22–30 | **Highlight 2: the owner's view.** The English dashboard KPIs drift and zoom (11–13). A cut on the beat goes to the reports revenue trend and per-barber share (13–15). | "The owner sees the money." then "Revenue, visits, every barber's share." |
| 5 | 15.0–17.0 | 30–34 | **Highlight 3: bilingual.** The public floor in Arabic, with a gold wipe to English at 16.0. | "Arabic first. English too." |
| 6 | 17.0–20.0 | 34–40 | **Outro.** The end of the 3D sweep plays darkened behind the lockup. | Scissors, "Ahmed Ramdan Barber Shop", then ahmed-ramdan-barbershop.vercel.app; small credit "Designed & developed by Omar Sherif". |

The scenes sum to 3 + 3 + 5 + 4 + 2 + 3 = **20 s**.

## Transitions
- 3 → 6: the text gives way to the lockup over the same continuous 3D shot.
- 6, 11, 13 and 17: a dip through #0c0a09 over 6 frames, so no busy layouts are crossfaded.
- 15 → 16: the gold wipe between Arabic and English.
